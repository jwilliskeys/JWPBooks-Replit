/**
 * booking.ts — Availability math for the public self-scheduler.
 *
 * Everything date-related here is TIMEZONE-SAFE: dates are formatted from
 * local year/month/day components, never via toISOString() (which converts
 * to UTC and can shift the calendar day).
 */

import type { SchedulerSettings } from "@shared/schema";

// ── Local-date helpers ───────────────────────────────────────────────────────

/** Format a Date as YYYY-MM-DD using LOCAL components (no UTC round-trip). */
export function toLocalYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/**
 * Normalize any stored date string to YYYY-MM-DD.
 * The app's calendar/appointments store dates as "7/11/26" or "07/11/2026",
 * while the booking engine works in "2026-07-11" — comparing them raw was the
 * root cause of double-booking (busy lookups never matched).
 * Returns null if the string can't be parsed.
 */
export function normalizeDateStr(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  // Already ISO: 2026-07-11
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  }
  // US style: 7/11/26 or 07/11/2026
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (us) {
    let year = parseInt(us[3], 10);
    if (year < 100) year += 2000;
    const month = parseInt(us[1], 10);
    const day = parseInt(us[2], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }
  return null;
}

/** Parse "4:00 PM" / "16:00" / "9:30 am" → minutes since midnight, or null. */
export function parseTimeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = t.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const min = parseInt(m[2], 10);
  const ampm = m[3]?.toUpperCase();
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  if (h > 23 || min > 59) return null;
  return h * 60 + min;
}

/** Minutes since midnight → "4:00 PM" label (what the booking UI shows). */
export function minutesToLabel(mins: number): string {
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const ampm = h24 >= 12 ? "PM" : "AM";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${ampm}`;
}

/**
 * Parse an appointment duration string → minutes.
 * Handles "2 hours", "90 min", "1.5 hours", AND compound forms like
 * "1 hr 30 min" (the format the appointment dialog actually saves — the old
 * single-unit regex read that as just 1 hour and under-blocked the calendar).
 */
export function parseDurationToMinutes(d: string | null | undefined, fallback: number): number {
  if (!d) return fallback;
  let total = 0;
  const re = /(\d+(?:\.\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)\b/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    const n = parseFloat(m[1]);
    if (!Number.isFinite(n)) continue;
    total += m[2].toLowerCase().startsWith("h") ? n * 60 : n;
  }
  return total > 0 ? Math.round(total) : fallback;
}

// ── Availability config ──────────────────────────────────────────────────────

export interface DayHours {
  enabled: boolean;
  start: string; // "16:00" (24h)
  end: string;   // "18:00"
}

export interface BookingConfig {
  approvalMode: "manual" | "auto";
  /** keyed "0" (Sun) … "6" (Sat) */
  availability: Record<string, DayHours>;
  slotDurationMinutes: number;
  slotBufferMinutes: number;
  maxPerWeek: number;
  bookingHorizonWeeks: number;
}

/** Mirrors the historical hardcoded behavior: weekday evenings + weekends. */
export const DEFAULT_AVAILABILITY: Record<string, DayHours> = {
  "0": { enabled: true, start: "09:00", end: "16:30" }, // Sun
  "1": { enabled: true, start: "16:00", end: "19:00" },
  "2": { enabled: true, start: "16:00", end: "19:00" },
  "3": { enabled: true, start: "16:00", end: "19:00" },
  "4": { enabled: true, start: "16:00", end: "19:00" },
  "5": { enabled: true, start: "16:00", end: "19:00" },
  "6": { enabled: true, start: "09:00", end: "16:30" }, // Sat
};

export function resolveBookingConfig(settings: SchedulerSettings | undefined | null): BookingConfig {
  let availability = DEFAULT_AVAILABILITY;
  if (settings?.availabilityJson) {
    try {
      const parsed = JSON.parse(settings.availabilityJson);
      if (parsed && typeof parsed === "object") {
        availability = { ...DEFAULT_AVAILABILITY };
        for (const k of ["0", "1", "2", "3", "4", "5", "6"]) {
          const day = parsed[k];
          if (day && typeof day.enabled === "boolean" && day.start && day.end) {
            availability[k] = { enabled: day.enabled, start: day.start, end: day.end };
          }
        }
      }
    } catch {
      // malformed JSON → fall back to defaults
    }
  }
  return {
    approvalMode: settings?.approvalMode === "auto" ? "auto" : "manual",
    availability,
    slotDurationMinutes: settings?.slotDurationMinutes ?? 90,
    slotBufferMinutes: settings?.slotBufferMinutes ?? 0,
    maxPerWeek: settings?.maxPerWeek ?? 2,
    // Clamped to 2–52 weeks: a stray "1" here once made the public calendar
    // show zero bookable dates (the whole horizon fell inside a blocked week).
    bookingHorizonWeeks: Math.min(52, Math.max(2, settings?.bookingHorizonWeeks ?? 12)),
  };
}

// ── Slot generation & conflicts ──────────────────────────────────────────────

/** All slot START times (minutes) for a given day-of-week per config. */
export function generateDaySlotStarts(dayOfWeek: number, config: BookingConfig): number[] {
  const day = config.availability[String(dayOfWeek)];
  if (!day || !day.enabled) return [];
  const start = parseTimeToMinutes(day.start);
  const end = parseTimeToMinutes(day.end);
  if (start == null || end == null || end <= start) return [];
  // NOTE: slotBufferMinutes deliberately does NOT space out the offered start
  // times — it's commute padding around EXISTING appointments (see
  // busyIntervalsForDate). An empty day still offers back-to-back start times;
  // once one is booked, the buffer carves out the hour around it.
  const step = config.slotDurationMinutes;
  const slots: number[] = [];
  for (let t = start; t + config.slotDurationMinutes <= end; t += Math.max(step, 15)) {
    slots.push(t);
  }
  return slots;
}

export interface BusyItem {
  time: string | null;           // "4:00 PM"
  duration?: string | null;      // "2 hours" (appointments only)
  /** service area (Utah trip appointments) — enables drive-time buffers */
  area?: string | null;
}

/**
 * Busy [start,end) intervals in minutes for one date.
 * When the visitor's coordinates are provided, items carrying a service area
 * are padded on BOTH sides with the estimated drive time between that area
 * and the visitor — a Kamas 8:00–9:30 appointment blocks a Centerville
 * visitor until ~10:40 (9:30 + the hour-ish drive back).
 */
export function busyIntervalsForDate(
  items: BusyItem[],
  config: BookingConfig,
  visitor?: { lat: number | null; lng: number | null },
): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const it of items) {
    const start = parseTimeToMinutes(it.time);
    if (start == null) continue;
    const dur = parseDurationToMinutes(it.duration, config.slotDurationMinutes);
    // Commute padding on BOTH sides of every busy item: Boston appointments
    // get the flat slotBufferMinutes (e.g. 60 — city driving); Utah trip
    // appointments use the larger of that and the estimated drive time
    // between the appointment's service area and the visitor.
    let drivePad = 0;
    if (visitor && it.area) {
      drivePad = driveMinutesToVisitor(it.area, visitor.lat, visitor.lng);
    }
    const pad = Math.max(drivePad, config.slotBufferMinutes);
    out.push([start - pad, start + dur + pad]);
  }
  return out;
}

/** Free slot labels for a date, given that date's busy items. */
export function freeSlotLabels(
  dayOfWeek: number,
  busy: Array<[number, number]>,
  config: BookingConfig,
): string[] {
  return generateDaySlotStarts(dayOfWeek, config)
    .filter(slotStart => {
      const slotEnd = slotStart + config.slotDurationMinutes;
      return !busy.some(([bStart, bEnd]) => slotStart < bEnd && slotEnd > bStart);
    })
    .map(minutesToLabel);
}

/** Free slots for a FIXED slot list (used for Utah trip days, which ignore weekly hours). */
export function filterSlotLabels(
  slotLabels: string[],
  busy: Array<[number, number]>,
  config: BookingConfig,
): string[] {
  return slotLabels.filter(label => {
    const slotStart = parseTimeToMinutes(label);
    if (slotStart == null) return true;
    const slotEnd = slotStart + config.slotDurationMinutes;
    return !busy.some(([bStart, bEnd]) => slotStart < bEnd && slotEnd > bStart);
  });
}

// ── Utah service-area clustering ─────────────────────────────────────────────
// Maps Utah cities/areas to counties so a Davis County visitor gets steered
// toward the trip day that already has Davis County appointments scheduled.

const UTAH_COUNTY_BY_CITY: Record<string, string> = {
  // Davis County
  "bountiful": "davis", "centerville": "davis", "farmington": "davis",
  "kaysville": "davis", "layton": "davis", "clearfield": "davis",
  "syracuse": "davis", "clinton": "davis", "woods cross": "davis",
  "north salt lake": "davis", "fruit heights": "davis", "west point": "davis",
  "west bountiful": "davis", "south weber": "davis", "sunset": "davis",
  // Salt Lake County
  "salt lake city": "salt lake", "sandy": "salt lake", "draper": "salt lake",
  "murray": "salt lake", "west jordan": "salt lake", "south jordan": "salt lake",
  "millcreek": "salt lake", "holladay": "salt lake", "west valley city": "salt lake",
  "taylorsville": "salt lake", "cottonwood heights": "salt lake", "midvale": "salt lake",
  "riverton": "salt lake", "herriman": "salt lake", "bluffdale": "salt lake",
  "south salt lake": "salt lake", "magna": "salt lake", "kearns": "salt lake",
  // Weber County
  "ogden": "weber", "roy": "weber", "north ogden": "weber", "south ogden": "weber",
  "riverdale": "weber", "washington terrace": "weber", "pleasant view": "weber",
  "harrisville": "weber", "west haven": "weber",
  // Utah County
  "provo": "utah", "orem": "utah", "lehi": "utah", "american fork": "utah",
  "pleasant grove": "utah", "spanish fork": "utah", "springville": "utah",
  "saratoga springs": "utah", "eagle mountain": "utah", "payson": "utah",
  "lindon": "utah", "highland": "utah", "alpine": "utah", "mapleton": "utah",
  // Summit / Wasatch counties
  "park city": "summit", "kamas": "summit", "coalville": "summit", "oakley": "summit",
  "heber city": "wasatch", "heber": "wasatch", "midway": "wasatch",
  // Tooele / Cache / Box Elder
  "tooele": "tooele", "grantsville": "tooele", "stansbury park": "tooele",
  "logan": "cache", "north logan": "cache", "smithfield": "cache",
  "brigham city": "box elder", "tremonton": "box elder",
};

/** Utah county for a city / service-area name, or null if unknown. */
export function utahCountyForCity(city: string | null | undefined): string | null {
  if (!city) return null;
  return UTAH_COUNTY_BY_CITY[city.trim().toLowerCase()] ?? null;
}

// Approximate centers for Utah cities/areas — used to estimate drive time
// between an existing trip appointment and a prospective visitor, so a Kamas
// morning appointment doesn't let someone book Centerville 30 minutes later.
const UTAH_CITY_COORDS: Record<string, [number, number]> = {
  "bountiful": [40.8894, -111.8808], "centerville": [40.9180, -111.8722],
  "farmington": [40.9805, -111.8874], "kaysville": [41.0352, -111.9386],
  "layton": [41.0602, -111.9711], "clearfield": [41.1108, -112.0261],
  "syracuse": [41.0894, -112.0647], "clinton": [41.1394, -112.0505],
  "woods cross": [40.8716, -111.8927], "north salt lake": [40.8486, -111.9069],
  "fruit heights": [41.0322, -111.9022], "west point": [41.1183, -112.0841],
  "west bountiful": [40.8938, -111.9019], "south weber": [41.1322, -111.9316],
  "sunset": [41.1361, -112.0308],
  "salt lake city": [40.7608, -111.8911], "sandy": [40.5649, -111.8389],
  "draper": [40.5247, -111.8638], "murray": [40.6669, -111.8879],
  "west jordan": [40.6097, -111.9391], "south jordan": [40.5622, -111.9297],
  "millcreek": [40.6869, -111.8750], "holladay": [40.6689, -111.8247],
  "west valley city": [40.6916, -112.0011], "taylorsville": [40.6677, -111.9388],
  "cottonwood heights": [40.6197, -111.8102], "midvale": [40.6111, -111.8994],
  "riverton": [40.5219, -111.9391], "herriman": [40.5141, -112.0329],
  "bluffdale": [40.4847, -111.9389], "south salt lake": [40.7188, -111.8882],
  "magna": [40.7091, -112.1016], "kearns": [40.6599, -112.0093],
  "ogden": [41.2230, -111.9738], "roy": [41.1616, -112.0263],
  "north ogden": [41.3072, -111.9602], "south ogden": [41.1919, -111.9713],
  "riverdale": [41.1769, -112.0038], "washington terrace": [41.1727, -111.9766],
  "pleasant view": [41.3183, -112.0016], "harrisville": [41.2811, -111.9883],
  "west haven": [41.2033, -112.0536],
  "provo": [40.2338, -111.6585], "orem": [40.2969, -111.6946],
  "lehi": [40.3916, -111.8508], "american fork": [40.3769, -111.7958],
  "pleasant grove": [40.3641, -111.7385], "spanish fork": [40.1150, -111.6549],
  "springville": [40.1652, -111.6108], "saratoga springs": [40.3491, -111.9047],
  "eagle mountain": [40.3141, -112.0069], "payson": [40.0444, -111.7321],
  "lindon": [40.3433, -111.7208], "highland": [40.4255, -111.7944],
  "alpine": [40.4533, -111.7772], "mapleton": [40.1302, -111.5785],
  "park city": [40.6461, -111.4980], "kamas": [40.6430, -111.2807],
  "coalville": [40.9177, -111.3993], "oakley": [40.7147, -111.3005],
  "heber city": [40.5070, -111.4133], "heber": [40.5070, -111.4133],
  "midway": [40.5122, -111.4744],
  "tooele": [40.5308, -112.2983], "grantsville": [40.5999, -112.4644],
  "stansbury park": [40.6377, -112.2961],
  "logan": [41.7370, -111.8338], "north logan": [41.7694, -111.8047],
  "smithfield": [41.8383, -111.8327],
  "brigham city": [41.5102, -112.0155], "tremonton": [41.7119, -112.1655],
};

function haversineMilesLL(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/**
 * Estimated one-way drive minutes from a named service area to the visitor's
 * coordinates. Straight-line miles × 1.3 road factor at ~40 mph average,
 * clamped to [10, 180]. Unknown areas fall back to 30 minutes.
 */
export function driveMinutesToVisitor(
  area: string | null | undefined,
  visitorLat: number | null,
  visitorLng: number | null,
): number {
  if (visitorLat == null || visitorLng == null) return 0;
  const coords = area ? UTAH_CITY_COORDS[area.trim().toLowerCase()] : undefined;
  if (!coords) return area ? 30 : 0;
  const roadMiles = haversineMilesLL(coords[0], coords[1], visitorLat, visitorLng) * 1.3;
  const mins = (roadMiles / 40) * 60;
  return Math.min(180, Math.max(10, Math.round(mins)));
}

/** ISO week key (YYYY-Www) from a YYYY-MM-DD string — used for max-per-week caps. */
export function isoWeekKey(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
