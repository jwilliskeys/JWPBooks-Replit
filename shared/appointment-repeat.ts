// ─── Repeating / all-day appointment occurrence math ─────────────────────────
//
// Shared by the client (calendar rendering, today's itinerary) and the server
// (booking engine busy-time calculation) so both always agree on when a
// repeating appointment actually happens.
//
// Dates are plain local Date objects at midnight; string dates may be either
// "M/D/YY" (app-native) or "YYYY-MM-DD".

export interface RepeatableAppointment {
  date: string;
  endDate?: string | null;          // multi-day all-day span (inclusive)
  isAllDay?: boolean | null;
  repeatFrequency?: string | null;  // weekly | biweekly | monthly | every-2-months | every-3-months | every-6-months | yearly
  repeatEndDate?: string | null;    // last day an occurrence may START (inclusive); null = forever
}

export function parseAnyDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(parseInt(iso[1]), parseInt(iso[2]) - 1, parseInt(iso[3]));
  const p = s.split("/");
  if (p.length !== 3) return null;
  const m = parseInt(p[0], 10), d = parseInt(p[1], 10);
  let y = parseInt(p[2], 10);
  if (isNaN(m) || isNaN(d) || isNaN(y)) return null;
  if (y < 100) y += 2000;
  const out = new Date(y, m - 1, d);
  return isNaN(out.getTime()) ? null : out;
}

function addDays(base: Date, days: number): Date {
  const d = new Date(base);
  d.setDate(d.getDate() + days);
  return d;
}

/** Add months, clamping to the last day of the target month (Jan 31 + 1mo → Feb 28). */
function addMonthsClamped(base: Date, months: number): Date {
  const y = base.getFullYear();
  const m = base.getMonth() + months;
  const lastDay = new Date(y, m + 1, 0).getDate();
  return new Date(y, m, Math.min(base.getDate(), lastDay));
}

const FREQ_STEPS: Record<string, { days?: number; months?: number }> = {
  "weekly": { days: 7 },
  "biweekly": { days: 14 },
  "monthly": { months: 1 },
  "every-2-months": { months: 2 },
  "every-3-months": { months: 3 },
  "every-6-months": { months: 6 },
  "yearly": { months: 12 },
};

export function isRepeating(appt: RepeatableAppointment): boolean {
  const f = appt.repeatFrequency ?? "";
  return !!f && f !== "none" && f in FREQ_STEPS;
}

/** The n-th occurrence's start date (n = 0 is the base date). */
function occurrenceStart(base: Date, freq: string, n: number): Date {
  const step = FREQ_STEPS[freq];
  if (!step) return base;
  if (step.days) return addDays(base, step.days * n);
  return addMonthsClamped(base, (step.months ?? 0) * n);
}

/** Days (inclusive span - 1) a single occurrence covers; 0 for normal appointments. */
export function occurrenceSpanDays(appt: RepeatableAppointment): number {
  if (!appt.isAllDay || !appt.endDate) return 0;
  const start = parseAnyDate(appt.date);
  const end = parseAnyDate(appt.endDate);
  if (!start || !end || end <= start) return 0;
  return Math.round((end.getTime() - start.getTime()) / 86400000);
}

const MAX_OCCURRENCES = 400; // safety valve (weekly for ~7.5 years)

/**
 * All calendar days in [rangeStart, rangeEnd] (inclusive) on which this
 * appointment appears — every day of every occurrence's span.
 */
export function expandAppointmentDates(
  appt: RepeatableAppointment,
  rangeStart: Date,
  rangeEnd: Date,
): Date[] {
  const base = parseAnyDate(appt.date);
  if (!base) return [];
  const span = occurrenceSpanDays(appt);
  const repeatEnd = isRepeating(appt) ? parseAnyDate(appt.repeatEndDate) : null;
  const freq = appt.repeatFrequency ?? "";
  const out: Date[] = [];

  const pushSpan = (start: Date) => {
    for (let i = 0; i <= span; i++) {
      const d = addDays(start, i);
      if (d >= rangeStart && d <= rangeEnd) out.push(d);
    }
  };

  if (!isRepeating(appt)) {
    pushSpan(base);
    return out;
  }

  // Fast-forward: estimate the first occurrence index that could touch the range
  // (so a years-old weekly appointment doesn't iterate from 2020).
  const step = FREQ_STEPS[freq];
  let n0 = 0;
  const earliest = addDays(rangeStart, -span);
  if (earliest > base) {
    if (step.days) {
      n0 = Math.max(0, Math.floor((earliest.getTime() - base.getTime()) / (86400000 * step.days)) - 1);
    } else if (step.months) {
      const months = (earliest.getFullYear() - base.getFullYear()) * 12 + (earliest.getMonth() - base.getMonth());
      n0 = Math.max(0, Math.floor(months / step.months) - 1);
    }
  }

  for (let n = n0; n < n0 + MAX_OCCURRENCES; n++) {
    const start = occurrenceStart(base, freq, n);
    if (repeatEnd && start > repeatEnd) break;
    if (start > rangeEnd) break;
    if (addDays(start, span) >= rangeStart) pushSpan(start);
  }
  return out;
}

/** Does this appointment (or any repeat occurrence of it) land on `day`? */
export function appointmentOccursOn(appt: RepeatableAppointment, day: Date): boolean {
  const probe = new Date(day.getFullYear(), day.getMonth(), day.getDate());
  return expandAppointmentDates(appt, probe, probe).length > 0;
}
