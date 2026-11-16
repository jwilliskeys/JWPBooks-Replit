import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

type SharedSchedule = {
  trip: { name: string; startDate: string; endDate: string };
  appointments: { date: string; time: string; name: string; city: string; status: string; notes: string }[];
  events: { date: string; title: string; startTime: string | null; endTime: string | null; isAllDay: boolean | null; notes: string }[];
  calendarNotes: { date: string; title: string; notes: string }[];
};

function parseScheduleDate(value: string) {
  const parts = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (parts) {
    const year = Number(parts[3]) < 100 ? 2000 + Number(parts[3]) : Number(parts[3]);
    return new Date(year, Number(parts[1]) - 1, Number(parts[2]));
  }
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return new Date(Number(iso[1]), Number(iso[2]) - 1, Number(iso[3]));
  return null;
}

function dateKey(date: Date) {
  return `${date.getMonth() + 1}/${date.getDate()}/${String(date.getFullYear()).slice(-2)}`;
}

function displayDate(value: string) {
  const date = parseScheduleDate(value) || new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

export default function SharedTripPage() {
  const token = window.location.pathname.split("/").pop() || "";
  const { data, isLoading, error } = useQuery<SharedSchedule>({
    queryKey: ["/api/shared-trips", token],
    queryFn: async () => {
      const response = await fetch(`/api/shared-trips/${encodeURIComponent(token)}`);
      if (!response.ok) throw new Error(response.status === 404 ? "This shared schedule is unavailable." : "Could not load the schedule.");
      return response.json();
    },
    refetchInterval: 60_000,
    retry: false,
  });
  if (isLoading) return <main className="mx-auto max-w-3xl p-8 text-muted-foreground">Loading schedule…</main>;
  if (error || !data) return <main className="mx-auto max-w-xl p-8 text-center"><h1 className="text-xl font-semibold">Schedule unavailable</h1><p className="mt-2 text-muted-foreground">{error instanceof Error ? error.message : "This link may have been revoked."}</p></main>;

  const days = new Map<string, { appointments: SharedSchedule["appointments"]; events: SharedSchedule["events"]; notes: SharedSchedule["calendarNotes"] }>();
  const day = (date: string) => {
    if (!days.has(date)) days.set(date, { appointments: [], events: [], notes: [] });
    return days.get(date)!;
  };
  data.appointments.forEach((item) => day(dateKey(parseScheduleDate(item.date) || new Date(item.date))).appointments.push(item));
  data.events.forEach((item) => day(dateKey(parseScheduleDate(item.date) || new Date(item.date))).events.push(item));
  data.calendarNotes.forEach((item) => day(dateKey(parseScheduleDate(item.date) || new Date(item.date))).notes.push(item));
  const start = parseScheduleDate(data.trip.startDate);
  const end = parseScheduleDate(data.trip.endDate);
  if (start && end) {
    for (const date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      day(dateKey(date));
    }
  }
  const orderedDays = [...days.entries()].sort(([a], [b]) =>
    (parseScheduleDate(a)?.getTime() ?? 0) - (parseScheduleDate(b)?.getTime() ?? 0),
  );

  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-background px-5 py-8 text-foreground sm:px-8">
      <div className="mb-8 flex items-start justify-between gap-4">
        <div>
          <p className="text-sm font-medium uppercase tracking-wide text-muted-foreground">Shared trip schedule</p>
          <h1 className="mt-1 text-3xl font-semibold">{data.trip.name}</h1>
          <p className="mt-2 text-muted-foreground">{displayDate(data.trip.startDate)} – {displayDate(data.trip.endDate)}</p>
        </div>
        <Button className="print:hidden" variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" /> Save as PDF</Button>
      </div>
      <div className="space-y-6">
        {orderedDays.map(([date, items]) => (
          <section key={date} className="rounded-xl border bg-card p-5 shadow-sm">
            <h2 className="mb-4 border-b pb-3 text-lg font-semibold">{displayDate(date)}</h2>
            <div className="space-y-4">
              {items.appointments.map((item, index) => (
                <article key={`appointment-${index}`} className="grid gap-1 sm:grid-cols-[7rem_1fr_auto]">
                  <div className="font-medium tabular-nums">{item.time || "Time TBD"}</div>
                  <div><div className="font-medium">{item.name}{item.city ? ` · ${item.city}` : ""}</div>{item.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{item.notes}</p>}</div>
                  <span className="text-sm text-muted-foreground">{item.status}</span>
                </article>
              ))}
              {items.events.map((item, index) => (
                <article key={`event-${index}`} className="grid gap-1 sm:grid-cols-[7rem_1fr]">
                  <div className="font-medium tabular-nums">{item.isAllDay ? "All day" : [item.startTime, item.endTime].filter(Boolean).join("–") || "Personal"}</div>
                  <div><div className="font-medium">{item.title}</div>{item.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{item.notes}</p>}</div>
                </article>
              ))}
              {items.notes.map((item, index) => (
                <article key={`note-${index}`} className="rounded-lg bg-muted/50 p-3">
                  <div className="font-medium">{item.title}</div>
                  {item.notes && <p className="mt-1 whitespace-pre-wrap text-sm text-muted-foreground">{item.notes}</p>}
                </article>
              ))}
              {!items.appointments.length && !items.events.length && !items.notes.length && <p className="text-sm text-muted-foreground">No scheduled items</p>}
            </div>
          </section>
        ))}
      </div>
      <p className="mt-8 text-center text-xs text-muted-foreground">This schedule refreshes automatically about once a minute.</p>
      <style>{`@media print { body { background: white !important; } main { max-width: none !important; padding: 0 !important; } section { break-inside: avoid; box-shadow: none !important; } }`}</style>
    </main>
  );
}
