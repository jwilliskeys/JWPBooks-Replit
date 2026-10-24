import type { Piano, TripAppointment } from "@shared/schema";
import { linesDuration, parseServiceItems } from "@/lib/service-lines";
import { parseDurationToMinutes } from "@/lib/scheduling";

export interface TripAppointmentPianoLine {
  pianoId: number | null;
  pianoName: string;
  services: string;
  durationMinutes: number;
}

function pianoLabel(piano: Piano | undefined, pianoId: number | null): string {
  if (pianoId === null) return "Other services";
  if (!piano) return `Piano #${pianoId}`;
  return [piano.make, piano.model, piano.pianoType].filter(Boolean).join(" ") || `Piano #${pianoId}`;
}

export function tripAppointmentPianoLines(
  appointment: TripAppointment,
  pianoMap: Map<number, Piano>,
): TripAppointmentPianoLine[] {
  const groups = parseServiceItems(appointment.serviceItems);
  if (groups?.length) {
    return groups.map((group) => ({
      pianoId: group.pianoId,
      pianoName: pianoLabel(group.pianoId === null ? undefined : pianoMap.get(group.pianoId), group.pianoId),
      services: group.lines.map((line) => line.name.trim()).filter(Boolean).join(", ") || "Service",
      durationMinutes: linesDuration(group.lines) || (
        groups.length === 1 ? parseDurationToMinutes(appointment.duration || "") : 0
      ),
    }));
  }

  return [{
    pianoId: appointment.pianoId,
    pianoName: pianoLabel(
      appointment.pianoId === null ? undefined : pianoMap.get(appointment.pianoId),
      appointment.pianoId,
    ),
    services: appointment.servicesRequested || "Service",
    durationMinutes: parseDurationToMinutes(appointment.duration || ""),
  }];
}
