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

/** Parse an appointment duration string ("2 hours", "90 min", "1.5 hours") → minutes. */
export function parseDurationToMinutes(d: string | null | undefined, fallback: number): number {
  if (!d) return fallback;
  const m = d.trim().match(/^(\d+(?:\.\d+)?)\s*(hour|hr|h|minute|min|m)/i);
  if (!m) return fallback;
  const n = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  const mins = unit.startsWith("h") ? n * 60 : n;
  return Number.isFinite(mins) && mins > 0 ? Math.round(mins) : fallback;
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
    bookingHorizonWeeks: settings?.bookingHorizonWeeks ?? 12,
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
  const step = config.slotDurationMinutes + config.slotBufferMinutes;
  const slots: number[] = [];
  for (let t = start; t + config.slotDurationMinutes <= end; t += Math.max(step, 15)) {
    slots.push(t);
  }
  return slots;
}

export interface BusyItem {
  time: string | null;           // "4:00 PM"
  duration?: string | null;      // "2 hours" (appointments only)
}

/** Busy [start,end) intervals in minutes for one date. */
export function busyIntervalsForDate(items: BusyItem[], config: BookingConfig): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (const it of items) {
    const start = parseTimeToMinutes(it.time);
    if (start == null) continue;
    const dur = parseDurationToMinutes(it.duration, config.slotDurationMinutes);
    out.push([start, start + dur + config.slotBufferMinutes]);
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

/** ISO week key (YYYY-Www) from a YYYY-MM-DD string — used for max-per-week caps. */
export function isoWeekKey(dateStr: string): string {
  const d = new Date(dateStr + "T00:00:00");
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + 4 - (d.getDay() || 7));
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const weekNo = Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${d.getFullYear()}-W${String(weekNo).padStart(2, "0")}`;
}
