import { useState, useMemo } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const DEFAULT_TIME_MINUTES = 9 * 60;
export const DEFAULT_DURATION_MINUTES = 90;
export const MIN_DURATION = 5;
export const MAX_DURATION = 8 * 60;

const MONTH_ABBR = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];
const DAY_ABBR = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"];

export function parseMDYY(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;
  const month = parseInt(parts[0], 10);
  const day = parseInt(parts[1], 10);
  let year = parseInt(parts[2], 10);
  if (isNaN(month) || isNaN(day) || isNaN(year)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 100) year += 2000;
  return new Date(year, month - 1, day);
}

export function formatMDYY(date: Date): string {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const y = date.getFullYear() % 100;
  return `${m}/${d}/${y}`;
}

export function formatTimeMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${displayH}:${String(m).padStart(2, "0")} ${ampm}`;
}

export function formatDurationMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

export function parseTimeString(s: string): number {
  if (!s) return DEFAULT_TIME_MINUTES;
  const match = s.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return DEFAULT_TIME_MINUTES;
  let h = parseInt(match[1]);
  const m = parseInt(match[2]);
  const ampm = match[3].toUpperCase();
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return h * 60 + m;
}

export function parseDurationString(s: string): number {
  if (!s) return DEFAULT_DURATION_MINUTES;
  let total = 0;
  const hrMatch = s.match(/(\d+)\s*hr/);
  const minMatch = s.match(/(\d+)\s*min/);
  if (hrMatch) total += parseInt(hrMatch[1]) * 60;
  if (minMatch) total += parseInt(minMatch[1]);
  return total || DEFAULT_DURATION_MINUTES;
}

export function TimeStepperWidget({
  minutes,
  onChange,
  testIdPrefix,
}: {
  minutes: number;
  onChange: (m: number) => void;
  testIdPrefix: string;
}) {
  function wrap(m: number) {
    return ((m % (24 * 60)) + 24 * 60) % (24 * 60);
  }
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 w-full justify-between">
      <div className="flex flex-col gap-0.5">
        <button
          type="button"
          onClick={() => onChange(wrap(minutes + 60))}
          className="text-[11px] font-semibold rounded px-2 py-0.5 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors leading-tight"
          data-testid={`${testIdPrefix}-plus-hour`}
        >
          +1h
        </button>
        <button
          type="button"
          onClick={() => onChange(wrap(minutes - 60))}
          className="text-[11px] font-semibold rounded px-2 py-0.5 bg-muted-foreground/20 hover:bg-muted-foreground/30 transition-colors leading-tight"
          data-testid={`${testIdPrefix}-minus-hour`}
        >
          −1h
        </button>
      </div>
      <span className="text-base font-bold tabular-nums min-w-[80px] text-center" data-testid={`${testIdPrefix}-display`}>
        {formatTimeMinutes(minutes)}
      </span>
      <div className="flex flex-col gap-0.5">
        <button
          type="button"
          onClick={() => onChange(wrap(minutes + 5))}
          className="text-[11px] font-semibold rounded px-2 py-0.5 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors leading-tight"
          data-testid={`${testIdPrefix}-plus-five`}
        >
          +5m
        </button>
        <button
          type="button"
          onClick={() => onChange(wrap(minutes - 5))}
          className="text-[11px] font-semibold rounded px-2 py-0.5 bg-muted-foreground/20 hover:bg-muted-foreground/30 transition-colors leading-tight"
          data-testid={`${testIdPrefix}-minus-five`}
        >
          −5m
        </button>
      </div>
    </div>
  );
}

export function DurationStepperWidget({
  minutes,
  onChange,
  testIdPrefix,
}: {
  minutes: number;
  onChange: (m: number) => void;
  testIdPrefix: string;
}) {
  function clamp(m: number) {
    return Math.max(MIN_DURATION, Math.min(MAX_DURATION, m));
  }
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 w-full justify-between">
      <div className="flex flex-col gap-0.5">
        <button
          type="button"
          onClick={() => onChange(clamp(minutes + 60))}
          className="text-[11px] font-semibold rounded px-2 py-0.5 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors leading-tight"
          data-testid={`${testIdPrefix}-plus-hour`}
        >
          +1h
        </button>
        <button
          type="button"
          onClick={() => onChange(clamp(minutes - 60))}
          className="text-[11px] font-semibold rounded px-2 py-0.5 bg-muted-foreground/20 hover:bg-muted-foreground/30 transition-colors leading-tight"
          data-testid={`${testIdPrefix}-minus-hour`}
        >
          −1h
        </button>
      </div>
      <span className="text-base font-bold tabular-nums min-w-[80px] text-center" data-testid={`${testIdPrefix}-display`}>
        {formatDurationMinutes(minutes)}
      </span>
      <div className="flex flex-col gap-0.5">
        <button
          type="button"
          onClick={() => onChange(clamp(minutes + 5))}
          className="text-[11px] font-semibold rounded px-2 py-0.5 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors leading-tight"
          data-testid={`${testIdPrefix}-plus-five`}
        >
          +5m
        </button>
        <button
          type="button"
          onClick={() => onChange(clamp(minutes - 5))}
          className="text-[11px] font-semibold rounded px-2 py-0.5 bg-muted-foreground/20 hover:bg-muted-foreground/30 transition-colors leading-tight"
          data-testid={`${testIdPrefix}-minus-five`}
        >
          −5m
        </button>
      </div>
    </div>
  );
}

interface MiniCalendarProps {
  value?: string;
  onChange: (dateStr: string) => void;
  "data-testid"?: string;
}

export function MiniCalendar({ value, onChange, "data-testid": testId }: MiniCalendarProps) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [viewMonth, setViewMonth] = useState(() => {
    const d = value ? parseMDYY(value) : null;
    return d?.getMonth() ?? today.getMonth();
  });
  const [viewYear, setViewYear] = useState(() => {
    const d = value ? parseMDYY(value) : null;
    return d?.getFullYear() ?? today.getFullYear();
  });

  const calendarDays = useMemo(() => {
    const firstDay = new Date(viewYear, viewMonth, 1);
    const startOffset = firstDay.getDay();
    const totalDays = new Date(viewYear, viewMonth + 1, 0).getDate();
    const days: (number | null)[] = [];
    for (let i = 0; i < startOffset; i++) days.push(null);
    for (let d = 1; d <= totalDays; d++) days.push(d);
    while (days.length % 7 !== 0) days.push(null);
    return days;
  }, [viewMonth, viewYear]);

  function prevMonth() {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
    else setViewMonth(m => m - 1);
  }

  function nextMonth() {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
    else setViewMonth(m => m + 1);
  }

  return (
    <div className="border border-border rounded-lg p-2 bg-background select-none" data-testid={testId}>
      <div className="flex items-center justify-between mb-1.5 px-0.5">
        <button
          type="button"
          onClick={prevMonth}
          className="p-1 rounded hover:bg-muted transition-colors"
          data-testid="mini-cal-prev"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <span className="text-xs font-semibold" data-testid="mini-cal-month-label">
          {MONTH_ABBR[viewMonth]} {viewYear}
        </span>
        <button
          type="button"
          onClick={nextMonth}
          className="p-1 rounded hover:bg-muted transition-colors"
          data-testid="mini-cal-next"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="grid grid-cols-7 mb-0.5">
        {DAY_ABBR.map(d => (
          <div key={d} className="text-center text-[10px] text-muted-foreground font-medium py-0.5">
            {d}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-px">
        {calendarDays.map((day, i) => {
          if (!day) return <div key={i} className="py-1" />;
          const date = new Date(viewYear, viewMonth, day);
          const dateStr = formatMDYY(date);
          const isSelected = value === dateStr;
          const isToday = date.getTime() === today.getTime();
          return (
            <button
              key={i}
              type="button"
              onClick={() => onChange(dateStr)}
              className={[
                "text-center text-[11px] rounded py-1 transition-colors leading-tight w-full",
                isSelected
                  ? "bg-primary text-primary-foreground font-bold"
                  : isToday
                  ? "ring-1 ring-inset ring-primary text-primary hover:bg-muted"
                  : "hover:bg-muted text-foreground",
              ].join(" ")}
              data-testid={`mini-cal-day-${dateStr}`}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}
