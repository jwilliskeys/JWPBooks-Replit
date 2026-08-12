/**
 * Dependency-free iCalendar (.ics) parser + recurrence expansion.
 *
 * Built for two jobs in JWP Books:
 *  1. Reading Willis's Gazelle (Falcetti Pianos) work calendar feed so the
 *     real shifts show on the JWP calendar.
 *  2. Writing an aggregate feed (see routes.ts) that his iPhone subscribes to.
 *
 * Times are handled in "naive local" component space (year/month/day/hour/min).
 * That is intentional: a recurring 7am shift stays at 7am across DST, which is
 * what wall-clock calendar recurrence is supposed to do, and it avoids pulling
 * in a timezone library. UTC ("Z") timestamps are converted once to the
 * display timezone (America/New_York — Willis's Boston base) via Intl.
 */

export const DISPLAY_TZ = "America/New_York";

export interface NaiveDateTime {
  y: number;
  mo: number; // 1-12
  d: number;
  h: number; // 0-23
  mi: number;
  allDay: boolean;
}

export interface RawEvent {
  uid: string;
  summary: string;
  description: string;
  location: string;
  start: NaiveDateTime | null;
  end: NaiveDateTime | null;
  rrule: string | null;
  exdates: string[]; // list of YYYYMMDD (or YYYYMMDDTHHMMSS) exclusion keys
}

/** A single concrete calendar occurrence, ready for display or re-emit. */
export interface Occurrence {
  uid: string;
  title: string;
  description: string;
  location: string;
  start: NaiveDateTime;
  end: NaiveDateTime;
  allDay: boolean;
}

// ---------------------------------------------------------------------------
// Low-level parsing
// ---------------------------------------------------------------------------

/** Unfold RFC5545 folded lines (continuation lines start with space or tab). */
function unfold(text: string): string[] {
  const rawLines = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of rawLines) {
    if ((line.startsWith(" ") || line.startsWith("\t")) && out.length > 0) {
      out[out.length - 1] += line.slice(1);
    } else {
      out.push(line);
    }
  }
  return out;
}

/** Split a content line "NAME;PARAM=x:VALUE" into { name, params, value }. */
function parseLine(line: string): { name: string; params: Record<string, string>; value: string } {
  const colon = line.indexOf(":");
  if (colon === -1) return { name: line, params: {}, value: "" };
  const left = line.slice(0, colon);
  const value = line.slice(colon + 1);
  const segs = left.split(";");
  const name = segs[0].toUpperCase();
  const params: Record<string, string> = {};
  for (let i = 1; i < segs.length; i++) {
    const eq = segs[i].indexOf("=");
    if (eq !== -1) params[segs[i].slice(0, eq).toUpperCase()] = segs[i].slice(eq + 1);
  }
  return { name, params, value };
}

function unescapeText(v: string): string {
  return v
    .replace(/\\n/gi, " ")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

/** Like unescapeText but preserves line breaks (for multi-line DESCRIPTION). */
function unescapeMultiline(v: string): string {
  return v
    .replace(/\\n/gi, "\n")
    .replace(/\\,/g, ",")
    .replace(/\\;/g, ";")
    .replace(/\\\\/g, "\\")
    .trim();
}

/** Convert a real UTC instant to naive wall-clock components in DISPLAY_TZ. */
function utcToDisplay(ms: number): NaiveDateTime {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: DISPLAY_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(new Date(ms));
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  let h = get("hour");
  if (h === 24) h = 0; // some engines emit 24 for midnight
  return { y: get("year"), mo: get("month"), d: get("day"), h, mi: get("minute"), allDay: false };
}

/**
 * Parse an iCal date/date-time value into naive local components.
 *  - "20260719"                -> all-day
 *  - "20260719T070000"         -> floating / TZID local, used as-is
 *  - "20260719T110000Z"        -> UTC, converted to DISPLAY_TZ
 */
function parseDateValue(value: string, params: Record<string, string>): NaiveDateTime | null {
  const v = value.trim();
  const dateOnly = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
  if (dateOnly || params.VALUE === "DATE") {
    const m = dateOnly ?? /^(\d{4})(\d{2})(\d{2})/.exec(v);
    if (!m) return null;
    return { y: +m[1], mo: +m[2], d: +m[3], h: 0, mi: 0, allDay: true };
  }
  const dt = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
  if (!dt) return null;
  const [, y, mo, d, h, mi, , z] = dt;
  if (z === "Z") {
    const ms = Date.UTC(+y, +mo - 1, +d, +h, +mi, 0);
    return utcToDisplay(ms);
  }
  // Floating or TZID-qualified: treat components as the intended wall time.
  return { y: +y, mo: +mo, d: +d, h: +h, mi: +mi, allDay: false };
}

/** Parse the raw feed text into RawEvent objects (no recurrence expansion). */
export function parseICS(text: string): RawEvent[] {
  const lines = unfold(text);
  const events: RawEvent[] = [];
  let cur: RawEvent | null = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === "BEGIN:VEVENT") {
      cur = { uid: "", summary: "", description: "", location: "", start: null, end: null, rrule: null, exdates: [] };
      continue;
    }
    if (trimmed === "END:VEVENT") {
      if (cur) events.push(cur);
      cur = null;
      continue;
    }
    if (!cur) continue;
    const { name, params, value } = parseLine(line);
    switch (name) {
      case "UID":
        cur.uid = value.trim();
        break;
      case "SUMMARY":
        cur.summary = unescapeText(value);
        break;
      case "DESCRIPTION":
        cur.description = unescapeMultiline(value);
        break;
      case "LOCATION":
        cur.location = unescapeText(value);
        break;
      case "DTSTART":
        cur.start = parseDateValue(value, params);
        break;
      case "DTEND":
        cur.end = parseDateValue(value, params);
        break;
      case "RRULE":
        cur.rrule = value.trim();
        break;
      case "EXDATE": {
        for (const piece of value.split(",")) {
          const key = piece.trim().replace(/Z$/, "");
          const m = /^(\d{8})/.exec(key);
          if (m) cur.exdates.push(m[1]);
        }
        break;
      }
    }
  }
  return events;
}

// ---------------------------------------------------------------------------
// Recurrence expansion
// ---------------------------------------------------------------------------

const WEEKDAY_CODES = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

function naiveToJs(n: NaiveDateTime): Date {
  return new Date(n.y, n.mo - 1, n.d, n.h, n.mi, 0, 0);
}
function jsToNaive(js: Date, allDay: boolean): NaiveDateTime {
  return {
    y: js.getFullYear(),
    mo: js.getMonth() + 1,
    d: js.getDate(),
    h: js.getHours(),
    mi: js.getMinutes(),
    allDay,
  };
}
function dateKey(n: NaiveDateTime): string {
  return `${n.y}${String(n.mo).padStart(2, "0")}${String(n.d).padStart(2, "0")}`;
}

interface ParsedRule {
  freq: string;
  interval: number;
  byday: number[]; // 0=Sun..6=Sat
  until: Date | null;
  count: number | null;
}

function parseRRule(rrule: string): ParsedRule {
  const parts: Record<string, string> = {};
  for (const kv of rrule.split(";")) {
    const eq = kv.indexOf("=");
    if (eq !== -1) parts[kv.slice(0, eq).toUpperCase()] = kv.slice(eq + 1);
  }
  const byday = (parts.BYDAY ? parts.BYDAY.split(",") : [])
    .map((c) => WEEKDAY_CODES.indexOf(c.replace(/^[+-]?\d+/, "").toUpperCase()))
    .filter((i) => i >= 0);
  let until: Date | null = null;
  if (parts.UNTIL) {
    const n = parseDateValue(parts.UNTIL, {});
    if (n) until = naiveToJs(n);
  }
  return {
    freq: (parts.FREQ ?? "").toUpperCase(),
    interval: Math.max(1, parseInt(parts.INTERVAL ?? "1", 10) || 1),
    byday,
    until,
    count: parts.COUNT ? parseInt(parts.COUNT, 10) : null,
  };
}

const MAX_OCCURRENCES = 750;

/**
 * Expand one raw event into concrete occurrences overlapping [winStart, winEnd]
 * (both JS Dates, treated as naive-local boundaries).
 */
export function expandEvent(ev: RawEvent, winStart: Date, winEnd: Date): Occurrence[] {
  if (!ev.start) return [];
  const durMs =
    ev.end && ev.start
      ? Math.max(0, naiveToJs(ev.end).getTime() - naiveToJs(ev.start).getTime())
      : ev.start.allDay
      ? 24 * 3600 * 1000
      : 60 * 60 * 1000;
  const title = ev.summary || "Busy";
  const allDay = ev.start.allDay;
  const exset = new Set(ev.exdates);

  const emit = (startJs: Date): Occurrence | null => {
    const startNaive = jsToNaive(startJs, allDay);
    if (exset.has(dateKey(startNaive))) return null;
    const endNaive = jsToNaive(new Date(startJs.getTime() + durMs), allDay);
    return {
      uid: ev.uid,
      title,
      description: ev.description ?? "",
      location: ev.location ?? "",
      start: startNaive,
      end: endNaive,
      allDay,
    };
  };

  const out: Occurrence[] = [];
  const startJs = naiveToJs(ev.start);

  if (!ev.rrule) {
    if (startJs.getTime() + durMs >= winStart.getTime() && startJs.getTime() <= winEnd.getTime()) {
      const o = emit(startJs);
      if (o) out.push(o);
    }
    return out;
  }

  const rule = parseRRule(ev.rrule);
  const hardStop = rule.until && rule.until < winEnd ? rule.until : winEnd;
  let produced = 0;
  let guard = 0;

  const push = (js: Date) => {
    if (js.getTime() + durMs < winStart.getTime()) return;
    if (js.getTime() > hardStop.getTime()) return;
    const o = emit(js);
    if (o) {
      out.push(o);
      produced++;
    }
  };

  if (rule.freq === "WEEKLY" && rule.byday.length > 0) {
    // Walk week by week (interval weeks), emitting each selected weekday.
    const weekStart = new Date(startJs);
    weekStart.setDate(weekStart.getDate() - weekStart.getDay()); // back to Sunday
    while (weekStart.getTime() <= hardStop.getTime() && produced < MAX_OCCURRENCES && guard++ < 5000) {
      for (const wd of rule.byday.slice().sort((a, b) => a - b)) {
        const occ = new Date(weekStart);
        occ.setDate(occ.getDate() + wd);
        occ.setHours(ev.start.h, ev.start.mi, 0, 0);
        if (occ.getTime() < startJs.getTime()) continue;
        if (rule.count != null && produced >= rule.count) break;
        push(occ);
      }
      weekStart.setDate(weekStart.getDate() + 7 * rule.interval);
    }
  } else {
    const cursor = new Date(startJs);
    while (cursor.getTime() <= hardStop.getTime() && produced < MAX_OCCURRENCES && guard++ < 5000) {
      if (rule.count != null && produced >= rule.count) break;
      push(new Date(cursor));
      switch (rule.freq) {
        case "DAILY":
          cursor.setDate(cursor.getDate() + rule.interval);
          break;
        case "WEEKLY":
          cursor.setDate(cursor.getDate() + 7 * rule.interval);
          break;
        case "MONTHLY":
          cursor.setMonth(cursor.getMonth() + rule.interval);
          break;
        case "YEARLY":
          cursor.setFullYear(cursor.getFullYear() + rule.interval);
          break;
        default:
          guard = 99999; // unknown freq: emit base only
      }
    }
  }

  out.sort((a, b) => naiveToJs(a.start).getTime() - naiveToJs(b.start).getTime());
  return out;
}

/** Expand every event in a feed within the window. */
export function expandFeed(events: RawEvent[], winStart: Date, winEnd: Date): Occurrence[] {
  const all: Occurrence[] = [];
  for (const ev of events) all.push(...expandEvent(ev, winStart, winEnd));
  return all;
}

// ---------------------------------------------------------------------------
// App-format helpers (M/D/YY dates, "H:MM AM" times)
// ---------------------------------------------------------------------------

/** "7/19/26" */
export function naiveToMDYY(n: NaiveDateTime): string {
  return `${n.mo}/${n.d}/${String(n.y).slice(-2)}`;
}

/** "7:00 AM" */
export function naiveToTimeLabel(n: NaiveDateTime): string {
  let h = n.h % 12;
  if (h === 0) h = 12;
  const ampm = n.h < 12 ? "AM" : "PM";
  return `${h}:${String(n.mi).padStart(2, "0")} ${ampm}`;
}

/** iCal UTC-less "floating" stamp: 20260719T070000 */
export function naiveToICSStamp(n: NaiveDateTime): string {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${n.y}${p(n.mo)}${p(n.d)}T${p(n.h)}${p(n.mi)}00`;
}

/** iCal all-day date: 20260719 */
export function naiveToICSDate(n: NaiveDateTime): string {
  const p = (x: number) => String(x).padStart(2, "0");
  return `${n.y}${p(n.mo)}${p(n.d)}`;
}

/** Escape text for an ICS property value. */
export function icsEscape(s: string): string {
  return (s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}
