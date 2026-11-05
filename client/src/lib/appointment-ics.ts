import { parseDurationToMinutes } from "@/lib/scheduling";

export interface IcsAppointment {
  id: number;
  summary: string;
  date: string;
  time?: string | null;
  duration?: string | null;
  allDay?: boolean | null;
  endDate?: string | null;
  location?: string | null;
  description?: string | null;
  timezone: "America/New_York" | "America/Denver";
}

function escapeIcs(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
}

function parseDate(value: string): Date | null {
  const parts = value.split("/").map(Number);
  if (parts.length !== 3 || parts.some(n => !Number.isFinite(n))) return null;
  const year = parts[2] < 100 ? 2000 + parts[2] : parts[2];
  const date = new Date(year, parts[0] - 1, parts[1]);
  return Number.isNaN(date.getTime()) ? null : date;
}

function icsDate(date: Date): string {
  return `${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, "0")}${String(date.getDate()).padStart(2, "0")}`;
}

function timeMinutes(value: string): number {
  const match = value.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return 8 * 60;
  let hour = Number(match[1]) % 12;
  if (match[3].toUpperCase() === "PM") hour += 12;
  return hour * 60 + Number(match[2]);
}

function icsStamp(date: Date, minutes: number): string {
  const endDate = new Date(date);
  endDate.setMinutes(minutes);
  return `${icsDate(endDate)}T${String(endDate.getHours()).padStart(2, "0")}${String(endDate.getMinutes()).padStart(2, "0")}00`;
}

function timeZoneBlock(timezone: IcsAppointment["timezone"]): string[] {
  const mountain = timezone === "America/Denver";
  const standard = mountain ? "-0700" : "-0500";
  const daylight = mountain ? "-0600" : "-0400";
  const standardName = mountain ? "MST" : "EST";
  const daylightName = mountain ? "MDT" : "EDT";
  return [
    "BEGIN:VTIMEZONE", `TZID:${timezone}`,
    "BEGIN:DAYLIGHT", "DTSTART:20070311T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
    `TZOFFSETFROM:${standard}`, `TZOFFSETTO:${daylight}`, `TZNAME:${daylightName}`, "END:DAYLIGHT",
    "BEGIN:STANDARD", "DTSTART:20071104T020000", "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
    `TZOFFSETFROM:${daylight}`, `TZOFFSETTO:${standard}`, `TZNAME:${standardName}`, "END:STANDARD",
    "END:VTIMEZONE",
  ];
}

export function downloadAppointmentIcs(event: IcsAppointment, filename: string): void {
  const date = parseDate(event.date);
  if (!date) throw new Error("This appointment has an invalid date.");
  const now = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//John Willis Piano//Appointments//EN", "CALSCALE:GREGORIAN",
    ...timeZoneBlock(event.timezone),
    "BEGIN:VEVENT",
    `UID:${event.timezone === "America/Denver" ? "slc" : "boston"}-${event.id}@johnwillispiano`,
    `DTSTAMP:${now}`,
  ];
  if (event.allDay) {
    const end = parseDate(event.endDate || event.date) ?? date;
    end.setDate(end.getDate() + 1);
    lines.push(`DTSTART;VALUE=DATE:${icsDate(date)}`, `DTEND;VALUE=DATE:${icsDate(end)}`);
  } else {
    const start = timeMinutes(event.time || "8:00 AM");
    const end = start + (parseDurationToMinutes(event.duration || "1 hr 30 min") || 90);
    lines.push(
      `DTSTART;TZID=${event.timezone}:${icsStamp(date, start)}`,
      `DTEND;TZID=${event.timezone}:${icsStamp(date, end)}`,
    );
  }
  lines.push(`SUMMARY:${escapeIcs(event.summary)}`);
  if (event.location) lines.push(`LOCATION:${escapeIcs(event.location)}`);
  if (event.description) lines.push(`DESCRIPTION:${escapeIcs(event.description)}`);
  lines.push("END:VEVENT", "END:VCALENDAR");

  const blob = new Blob([lines.join("\r\n")], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
