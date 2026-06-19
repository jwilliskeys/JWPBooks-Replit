import { useState } from "react";
import {
  ChevronDown, ChevronUp, Clock, Thermometer,
  Droplets, Wrench, Calendar,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { Appointment, ServiceRecord, Piano } from "@shared/schema";
import { parseTimeToMinutes, parseDurationToMinutes, minutesToTimeStr } from "@/lib/scheduling";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { dot: string; badge: string; label: string }> = {
  scheduled: {
    dot: "bg-blue-500",
    badge: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300 dark:border-blue-800",
    label: "Scheduled",
  },
  completed: {
    dot: "bg-emerald-500",
    badge: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800",
    label: "Completed",
  },
  cancelled: {
    dot: "bg-red-400",
    badge: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800",
    label: "Cancelled",
  },
  "no-show": {
    dot: "bg-orange-400",
    badge: "bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800",
    label: "No Show",
  },
};

function getPianoLabel(pianoId: number | null | undefined, pianos: Piano[]): string {
  if (!pianoId) return "Unknown Piano";
  const p = pianos.find((p) => p.id === pianoId);
  if (!p) return `Piano #${pianoId}`;
  return [p.year, p.make, p.model, p.pianoType].filter(Boolean).join(" ") || "Piano";
}

function computeEndTime(
  timeStr: string | null | undefined,
  durationStr: string | null | undefined
): string | null {
  if (!timeStr || !durationStr) return null;
  const startMins = parseTimeToMinutes(timeStr);
  const durMins = parseDurationToMinutes(durationStr);
  if (startMins < 0 || durMins <= 0) return null;
  return minutesToTimeStr(startMins + durMins);
}

// ── Single timeline entry ─────────────────────────────────────────────────────

interface EntryProps {
  appointment: Appointment;
  serviceRecords: ServiceRecord[];
  pianos: Piano[];
  isLast: boolean;
}

function TimelineEntry({ appointment: appt, serviceRecords, pianos, isLast }: EntryProps) {
  const [expanded, setExpanded] = useState(false);

  const status = appt.status ?? "scheduled";
  const cfg = STATUS_CONFIG[status] ?? STATUS_CONFIG.scheduled;
  const isPast = status !== "scheduled";

  // Service records linked to this appointment
  const apptRecords = serviceRecords.filter((r) => r.appointmentId === appt.id);
  const hasDetails = isPast && apptRecords.length > 0;

  const endTime = computeEndTime(appt.time, appt.duration);

  // Unique pianos from service records (for pill labels)
  const linkedPianoIds = [...new Set(apptRecords.map((r) => r.pianoId).filter(Boolean))] as number[];
  const pianoLabels = linkedPianoIds.map((id) => getPianoLabel(id, pianos));

  // Fallback: parse servicesRequested for display if no service records
  const servicesSummary = !pianoLabels.length && appt.servicesRequested
    ? appt.servicesRequested
    : null;

  // Split records into notes vs measurements
  const noteRecords = apptRecords.filter(
    (r) => r.serviceType !== "other" || r.notes
  );
  const measurementRecords = apptRecords.filter((r) => r.temperature || r.humidity);

  return (
    <div className="relative flex gap-3">
      {/* Vertical spine */}
      <div className="flex flex-col items-center shrink-0">
        <div
          className={cn(
            "h-2.5 w-2.5 rounded-full mt-[7px] ring-2 ring-background z-10 shrink-0",
            cfg.dot
          )}
        />
        {!isLast && (
          <div className="w-px flex-1 bg-border mt-1" style={{ minHeight: 32 }} />
        )}
      </div>

      {/* Card */}
      <div className={cn("flex-1 min-w-0", isLast ? "pb-2" : "pb-4")}>
        <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">

          {/* Header */}
          <div className="px-3 py-2.5 flex items-start justify-between gap-2">
            <div className="min-w-0 space-y-0.5">
              <div className="flex items-center gap-1.5">
                <Calendar className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-sm font-semibold">{appt.date}</span>
              </div>
              {appt.time && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="h-3 w-3 shrink-0" />
                  {appt.time}
                  {endTime ? ` – ${endTime}` : ""}
                  {appt.duration ? ` · ${appt.duration}` : ""}
                </p>
              )}
            </div>
            <span
              className={cn(
                "shrink-0 text-[10px] font-semibold uppercase tracking-wide px-2 py-0.5 rounded-full border",
                cfg.badge
              )}
            >
              {cfg.label}
            </span>
          </div>

          {/* Piano pills */}
          {pianoLabels.length > 0 && (
            <div className="px-3 pb-2 flex flex-wrap gap-1">
              {pianoLabels.map((label) => (
                <span
                  key={label}
                  className="text-[10px] bg-muted text-muted-foreground px-2 py-0.5 rounded font-medium"
                >
                  {label}
                </span>
              ))}
            </div>
          )}

          {/* Services summary fallback */}
          {servicesSummary && (
            <p className="px-3 pb-2 text-xs text-muted-foreground truncate">
              {servicesSummary}
            </p>
          )}

          {/* Expand toggle */}
          {hasDetails && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="w-full flex items-center justify-between px-3 py-1.5 text-xs text-primary font-medium border-t border-border bg-muted/30 hover:bg-muted/50 transition-colors"
            >
              <span>{expanded ? "Hide service details" : "Show service details"}</span>
              {expanded ? (
                <ChevronUp className="h-3.5 w-3.5" />
              ) : (
                <ChevronDown className="h-3.5 w-3.5" />
              )}
            </button>
          )}

          {/* Expanded: Service Notes + Measurements */}
          {expanded && (
            <div className="border-t border-border divide-y divide-border">

              {/* Service Notes */}
              {noteRecords.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/40">
                    <Wrench className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Service Notes
                    </span>
                  </div>
                  <div className="divide-y divide-border/60">
                    {noteRecords.map((record) => (
                      <div key={record.id} className="px-3 py-2.5">
                        <div className="flex items-center gap-1.5 flex-wrap mb-1">
                          <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-px rounded font-semibold">
                            {getPianoLabel(record.pianoId, pianos)}
                          </span>
                          <span className="text-xs font-semibold text-foreground capitalize">
                            {record.serviceType?.replace(/-/g, " ") ?? "Service"}
                          </span>
                          {record.cost && (
                            <span className="text-xs text-muted-foreground ml-auto">
                              {record.cost}
                            </span>
                          )}
                        </div>
                        {record.notes && (
                          <p className="text-xs text-muted-foreground leading-relaxed">
                            {record.notes}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Environmental Measurements */}
              {measurementRecords.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 px-3 py-1.5 bg-muted/40">
                    <Thermometer className="h-3 w-3 text-muted-foreground" />
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                      Measurements
                    </span>
                  </div>
                  <div className="divide-y divide-border/60">
                    {measurementRecords.map((record) => (
                      <div
                        key={record.id}
                        className="px-3 py-2 flex items-center gap-3 flex-wrap"
                      >
                        <span className="text-[10px] bg-primary/10 text-primary px-1.5 py-px rounded font-semibold shrink-0">
                          {getPianoLabel(record.pianoId, pianos)}
                        </span>
                        <div className="flex items-center gap-3 ml-auto">
                          {record.temperature && (
                            <span className="flex items-center gap-1 text-xs font-medium">
                              <Thermometer className="h-3 w-3 text-orange-400" />
                              {record.temperature}°F
                            </span>
                          )}
                          {record.humidity && (
                            <span className="flex items-center gap-1 text-xs font-medium">
                              <Droplets className="h-3 w-3 text-blue-400" />
                              {record.humidity}% RH
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main export ───────────────────────────────────────────────────────────────

export function ServiceTimeline({
  appointments,
  serviceRecords,
  pianos,
}: {
  appointments: Appointment[];
  serviceRecords: ServiceRecord[];
  pianos: Piano[];
}) {
  const upcoming = [...appointments]
    .filter((a) => (a.status ?? "scheduled") === "scheduled")
    .sort((a, b) => a.date.localeCompare(b.date));

  const past = [...appointments]
    .filter((a) => (a.status ?? "scheduled") !== "scheduled")
    .sort((a, b) => b.date.localeCompare(a.date));

  if (appointments.length === 0) {
    return (
      <p className="text-sm text-muted-foreground text-center py-10">
        No service history yet.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {/* Upcoming */}
      {upcoming.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Upcoming
            </span>
            <span className="text-[10px] bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 font-bold px-1.5 py-0.5 rounded-full">
              {upcoming.length}
            </span>
          </div>
          {upcoming.map((appt, i) => (
            <TimelineEntry
              key={appt.id}
              appointment={appt}
              serviceRecords={serviceRecords}
              pianos={pianos}
              isLast={i === upcoming.length - 1}
            />
          ))}
        </section>
      )}

      {/* Divider */}
      {upcoming.length > 0 && past.length > 0 && (
        <div className="flex items-center gap-3 py-1">
          <div className="flex-1 h-px bg-border" />
          <span className="text-[10px] text-muted-foreground font-semibold uppercase tracking-widest">
            History
          </span>
          <div className="flex-1 h-px bg-border" />
        </div>
      )}

      {/* Past */}
      {past.length > 0 && (
        <section>
          {upcoming.length === 0 && (
            <div className="flex items-center gap-2 mb-3">
              <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
                History
              </span>
            </div>
          )}
          {past.map((appt, i) => (
            <TimelineEntry
              key={appt.id}
              appointment={appt}
              serviceRecords={serviceRecords}
              pianos={pianos}
              isLast={i === past.length - 1}
            />
          ))}
        </section>
      )}
    </div>
  );
}
