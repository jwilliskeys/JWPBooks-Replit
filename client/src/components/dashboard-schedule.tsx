import { useMemo, useState, type ReactNode } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  DndContext,
  PointerSensor,
  pointerWithin,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Clock, GripVertical, Plane } from "lucide-react";
import { Link } from "wouter";
import type { Appointment, Customer, Trip, TripAppointment } from "@shared/schema";
import { appointmentOccursOn, expandAppointmentDates, parseAnyDate } from "@shared/appointment-repeat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { clientName } from "@shared/client-name";
import {
  checkTimeConflict,
  minutesToTimeStr,
  parseDurationToMinutes,
  parseTimeToMinutes,
  type ExistingAppointment,
} from "@/lib/scheduling";

const GRID_START_HOUR = 7;
const GRID_END_HOUR = 21;
const HOUR_HEIGHT = 56;
const DEFAULT_DURATION = "2 hours";

type ScheduleEntry =
  | { kind: "regular"; appointment: Appointment; customerId: number; time: string; duration: string }
  | { kind: "trip"; appointment: TripAppointment; customerId: number; time: string; duration: string };

function startOfDay(date: Date): Date {
  const result = new Date(date);
  result.setHours(0, 0, 0, 0);
  return result;
}

function dateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function dateFromKey(key: string): Date | null {
  const match = key.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatAppDate(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}/${String(date.getFullYear()).slice(-2)}`;
}

function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatTime(time: string | null | undefined): string {
  const minutes = parseTimeToMinutes(time ?? "");
  if (minutes < 0) return time || "Time not set";
  const hour24 = Math.floor(minutes / 60);
  const hour12 = hour24 % 12 || 12;
  const suffix = hour24 >= 12 ? "PM" : "AM";
  return `${hour12}:${String(minutes % 60).padStart(2, "0")} ${suffix}`;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  if (hours && remainder) return `${hours}h ${remainder}m`;
  if (hours) return `${hours}h`;
  return `${remainder}m`;
}

function formatTripRange(trip: Trip): string {
  const start = parseAnyDate(trip.startDate);
  const end = parseAnyDate(trip.endDate);
  if (!start || !end) return `${trip.startDate} – ${trip.endDate}`;
  const sameYear = start.getFullYear() === end.getFullYear();
  return `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  })}, ${end.getFullYear()}`;
}

function getUpcomingTrip(trips: Trip[] | undefined, today: Date): Trip | null {
  if (!trips) return null;
  return trips
    .filter((trip) => {
      const end = parseAnyDate(trip.endDate);
      return end && startOfDay(end) >= today;
    })
    .sort((a, b) => {
      const aStart = parseAnyDate(a.startDate);
      const bStart = parseAnyDate(b.startDate);
      return (aStart?.getTime() ?? 0) - (bStart?.getTime() ?? 0);
    })[0] ?? null;
}

function isOpenStatus(status: string | null | undefined): boolean {
  const normalized = (status ?? "").toLowerCase();
  return normalized !== "cancelled" && normalized !== "completed";
}

function appointmentTime(appointment: Appointment): string {
  return appointment.isAllDay ? "12:00 AM" : appointment.time;
}

function appointmentDuration(appointment: Appointment): string {
  return appointment.isAllDay ? "24 hours" : appointment.duration || DEFAULT_DURATION;
}

function tripStatusLabel(appointment: TripAppointment): string {
  if (appointment.status?.toLowerCase() === "completed") return "Completed";
  if (appointment.status?.toLowerCase() === "cancelled") return "Cancelled";
  return appointment.linkedAppointmentId ? "Booked" : "Not booked";
}

function tripStatusClass(appointment: TripAppointment): string {
  if (appointment.status?.toLowerCase() === "completed") return "border-muted text-muted-foreground";
  if (appointment.status?.toLowerCase() === "cancelled") return "border-destructive/40 text-destructive";
  return appointment.linkedAppointmentId
    ? "border-green-600/30 bg-green-500/10 text-green-700 dark:text-green-400"
    : "border-amber-600/30 bg-amber-500/10 text-amber-700 dark:text-amber-400";
}

function TripDayDropButton({
  date,
  selected,
  onSelect,
}: {
  date: Date;
  selected: boolean;
  onSelect: (date: Date) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `trip-day:${dateKey(date)}` });
  return (
    <button
      ref={setNodeRef}
      type="button"
      onClick={() => onSelect(date)}
      aria-pressed={selected}
      aria-label={`Show ${date.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}`}
      className={`shrink-0 rounded-md border px-2.5 py-1.5 text-xs transition-colors ${
        selected
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-muted-foreground hover:bg-accent hover:text-foreground"
      } ${isOver ? "ring-2 ring-primary/50" : ""}`}
    >
      <span className="block font-medium">{date.toLocaleDateString("en-US", { weekday: "short" })}</span>
      <span className="block">{date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
    </button>
  );
}

function TripAppointmentRow({
  appointment,
  customer,
  onSelectDate,
}: {
  appointment: TripAppointment;
  customer: Customer | undefined;
  onSelectDate: (date: Date) => void;
}) {
  const date = parseAnyDate(appointment.date);
  return (
    <button
      type="button"
      onClick={() => date && onSelectDate(date)}
      className="flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left transition-colors hover:bg-accent"
      data-testid={`dashboard-trip-stop-${appointment.id}`}
    >
      <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-1.5">
          <span className="truncate text-sm font-medium">{customer ? clientName(customer) : "Unknown client"}</span>
          <Badge variant="outline" className={`h-5 px-1.5 text-[10px] ${tripStatusClass(appointment)}`}>
            {tripStatusLabel(appointment)}
          </Badge>
        </span>
        <span className="mt-0.5 block truncate text-xs text-muted-foreground">
          {appointment.date} · {formatTime(appointment.time)}
          {appointment.servicesRequested ? ` · ${appointment.servicesRequested}` : ""}
        </span>
      </span>
    </button>
  );
}

function EventText({
  entry,
  customer,
  height,
}: {
  entry: ScheduleEntry;
  customer: Customer | undefined;
  height: number;
}) {
  const duration = parseDurationToMinutes(entry.duration);
  const isTrip = entry.kind === "trip";
  const booked = isTrip && !!entry.appointment.linkedAppointmentId;
  const customerLabel = customer ? clientName(customer) : "Unknown client";
  const status = isTrip ? tripStatusLabel(entry.appointment) : entry.appointment.status || "Scheduled";
  const services = entry.appointment.servicesRequested;

  return (
    <div className="flex h-full min-w-0 flex-col overflow-hidden">
      <div className="flex min-w-0 items-center gap-1">
        {isTrip && !booked && <GripVertical className="h-3 w-3 shrink-0 opacity-70" aria-hidden="true" />}
        <span className="truncate text-[11px] font-semibold leading-tight sm:text-xs">
          {formatTime(entry.time)} · {customerLabel}
        </span>
      </div>
      {height >= 42 && (
        <span className="mt-0.5 truncate text-[10px] leading-tight opacity-85">
          {services || (customer?.city ? [customer.city, customer.state].filter(Boolean).join(", ") : formatDuration(duration))}
        </span>
      )}
      {height >= 60 && (
        <span className="mt-0.5 truncate text-[10px] leading-tight opacity-75">
          {isTrip ? status : formatDuration(duration)}
        </span>
      )}
    </div>
  );
}

function DraggableTripBlock({
  entry,
  customer,
  top,
  height,
  disabled,
}: {
  entry: Extract<ScheduleEntry, { kind: "trip" }>;
  customer: Customer | undefined;
  top: number;
  height: number;
  disabled: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: `trip-appt:${entry.appointment.id}`,
    disabled,
    data: { kind: "trip-appointment", appointmentId: entry.appointment.id },
  });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-label={`Move unbooked appointment for ${customer ? clientName(customer) : "unknown client"}`}
      className={`absolute left-1 right-1 z-10 overflow-hidden rounded-md border-l-4 border-amber-600 bg-amber-100 px-2 py-1 text-amber-950 shadow-sm dark:border-amber-400 dark:bg-amber-950/70 dark:text-amber-50 ${
        disabled ? "cursor-default" : "cursor-grab touch-none active:cursor-grabbing"
      } ${isDragging ? "z-30 opacity-50 ring-2 ring-amber-500" : "hover:brightness-[0.98]"}`}
      style={{
        top,
        height,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
      }}
      data-testid={`dashboard-trip-block-${entry.appointment.id}`}
      title={`${customer ? clientName(customer) : "Unknown client"} · ${entry.time} · ${entry.duration} · Not booked. Drag to move.`}
    >
      <EventText entry={entry} customer={customer} height={height} />
    </div>
  );
}

function FixedScheduleBlock({
  entry,
  customer,
  top,
  height,
}: {
  entry: ScheduleEntry;
  customer: Customer | undefined;
  top: number;
  height: number;
}) {
  const isRegular = entry.kind === "regular";
  const isComplete = entry.appointment.status?.toLowerCase() === "completed";
  const className = isComplete
    ? "border-muted-foreground/40 bg-muted text-muted-foreground"
    : isRegular
      ? "border-sky-600 bg-sky-100 text-sky-950 dark:border-sky-400 dark:bg-sky-950/70 dark:text-sky-50"
      : "border-green-600 bg-green-100 text-green-950 dark:border-green-400 dark:bg-green-950/70 dark:text-green-50";
  const content = (
    <div
      className={`absolute left-1 right-1 z-[5] overflow-hidden rounded-md border-l-4 px-2 py-1 shadow-sm ${className}`}
      style={{ top, height }}
      data-testid={`${entry.kind === "trip" ? "dashboard-confirmed-trip" : "dashboard-regular"}-block-${entry.appointment.id}`}
      title={`${customer ? clientName(customer) : "Unknown client"} · ${entry.time} · ${entry.duration}${entry.kind === "trip" ? " · Booked" : ""}`}
    >
      <EventText entry={entry} customer={customer} height={height} />
    </div>
  );
  return isRegular && customer ? (
    <Link href={`/customers/${customer.id}`} className="contents">{content}</Link>
  ) : content;
}

function ScheduleGridDropzone({
  children,
  height,
}: {
  children: ReactNode;
  height: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: "schedule-grid" });
  return (
    <div
      ref={setNodeRef}
      className={`relative ${isOver ? "bg-primary/[0.03]" : ""}`}
      style={{ height }}
      data-testid="dashboard-day-grid"
    >
      {children}
    </div>
  );
}

export function DashboardSchedule() {
  const { toast } = useToast();
  const today = useMemo(() => startOfDay(new Date()), []);
  const [selectedDateOverride, setSelectedDateOverride] = useState<Date | null>(null);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 7 } }));

  const { data: trips, isLoading: tripsLoading } = useQuery<Trip[]>({ queryKey: ["/api/trips"] });
  const { data: appointments, isLoading: appointmentsLoading } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments"],
  });
  const { data: customers, isLoading: customersLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const upcomingTrip = useMemo(() => getUpcomingTrip(trips, today), [trips, today]);
  const tripAppointmentsKey = `/api/trips/${upcomingTrip?.id ?? "none"}/appointments`;
  const { data: tripAppointments, isLoading: tripAppointmentsLoading } = useQuery<TripAppointment[]>({
    queryKey: [tripAppointmentsKey],
    enabled: !!upcomingTrip,
  });

  const customerMap = useMemo(
    () => new Map(customers?.map((customer) => [customer.id, customer]) ?? []),
    [customers],
  );

  const nextAppointmentDate = useMemo(() => {
    const endOfSearch = new Date(today);
    endOfSearch.setDate(endOfSearch.getDate() + 366);
    const dates: Date[] = [];
    appointments?.forEach((appointment) => {
      if (!isOpenStatus(appointment.status)) return;
      dates.push(...expandAppointmentDates(appointment, today, endOfSearch));
    });
    tripAppointments?.forEach((appointment) => {
      if (!isOpenStatus(appointment.status)) return;
      const date = parseAnyDate(appointment.date);
      if (date && startOfDay(date) >= today) dates.push(startOfDay(date));
    });
    return dates.sort((a, b) => a.getTime() - b.getTime())[0] ?? today;
  }, [appointments, tripAppointments, today]);

  const selectedDate = selectedDateOverride ?? nextAppointmentDate;
  const dateLabel = selectedDate.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const moveTripAppointment = useMutation({
    mutationFn: ({ id, date, time }: { id: number; date: string; time: string }) =>
      apiRequest("PATCH", `/api/trip-appointments/${id}`, { date, time }),
    onSuccess: () => {
      if (upcomingTrip) {
        queryClient.invalidateQueries({ queryKey: [`/api/trips/${upcomingTrip.id}/appointments`] });
      }
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({ title: "Trip appointment moved" });
    },
    onError: () => {
      toast({ title: "Could not move appointment", description: "The time may conflict with another appointment.", variant: "destructive" });
    },
  });

  const bookTripMutation = useMutation({
    mutationFn: async (tripId: number) => {
      const response = await apiRequest("POST", `/api/trips/${tripId}/book-unbooked`);
      return response.json() as Promise<{ booked: number; alreadyBooked: number; failed: number }>;
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [tripAppointmentsKey] }),
        queryClient.invalidateQueries({ queryKey: ["/api/appointments"] }),
      ]);
      toast({
        title: result.failed
          ? `Booked ${result.booked}; ${result.failed} need retry`
          : `Booked ${result.booked} trip appointment${result.booked === 1 ? "" : "s"}`,
        description: result.alreadyBooked ? `${result.alreadyBooked} were already booked.` : undefined,
        variant: result.failed ? "destructive" : "default",
      });
    },
    onError: (error: any) => toast({ title: "Trip booking failed", description: error.message, variant: "destructive" }),
  });

  const tripDateChips = useMemo(() => {
    if (!upcomingTrip) return [];
    const start = parseAnyDate(upcomingTrip.startDate);
    const end = parseAnyDate(upcomingTrip.endDate);
    if (!start || !end || end < start) return [];
    const days: Date[] = [];
    const cursor = startOfDay(start);
    const finalDay = startOfDay(end);
    while (cursor <= finalDay && days.length < 60) {
      days.push(new Date(cursor));
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }, [upcomingTrip]);

  const tripAppointmentsForCard = useMemo(
    () => [...(tripAppointments ?? [])].sort((a, b) => {
      const dateDiff = (parseAnyDate(a.date)?.getTime() ?? 0) - (parseAnyDate(b.date)?.getTime() ?? 0);
      if (dateDiff !== 0) return dateDiff;
      return parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time);
    }),
    [tripAppointments],
  );

  const visibleEntries = useMemo<ScheduleEntry[]>(() => {
    const linkedAppointmentIds = new Set(
      (tripAppointments ?? [])
        .map((appointment) => appointment.linkedAppointmentId)
        .filter((id): id is number => id != null),
    );
    const tripEntries = (tripAppointments ?? [])
      .filter((appointment) => {
        const date = parseAnyDate(appointment.date);
        return date && sameDay(date, selectedDate) && isOpenStatus(appointment.status);
      })
      .map((appointment): ScheduleEntry => ({
        kind: "trip",
        appointment,
        customerId: appointment.customerId,
        time: appointment.time,
        duration: appointment.duration || DEFAULT_DURATION,
      }));
    const regularEntries = (appointments ?? [])
      .filter((appointment) =>
        !linkedAppointmentIds.has(appointment.id) &&
        isOpenStatus(appointment.status) &&
        appointmentOccursOn(appointment, selectedDate),
      )
      .map((appointment): ScheduleEntry => ({
        kind: "regular",
        appointment,
        customerId: appointment.customerId,
        time: appointmentTime(appointment),
        duration: appointmentDuration(appointment),
      }));
    return [...tripEntries, ...regularEntries].sort(
      (a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time),
    );
  }, [appointments, tripAppointments, selectedDate]);

  const timedEntries = visibleEntries.filter(
    (entry) => !(entry.kind === "regular" && entry.appointment.isAllDay),
  );
  const allDayEntries = visibleEntries.filter(
    (entry): entry is Extract<ScheduleEntry, { kind: "regular" }> =>
      entry.kind === "regular" && !!entry.appointment.isAllDay,
  );
  const gridHeight = (GRID_END_HOUR - GRID_START_HOUR) * HOUR_HEIGHT;

  function setDate(date: Date) {
    setSelectedDateOverride(startOfDay(date));
  }

  function moveDay(delta: number) {
    const date = new Date(selectedDate);
    date.setDate(date.getDate() + delta);
    setDate(date);
  }

  function handleDragEnd(event: DragEndEvent) {
    const activeData = event.active.data.current as { kind?: string; appointmentId?: number } | undefined;
    const appointmentId = activeData?.appointmentId;
    if (activeData?.kind !== "trip-appointment" || !appointmentId || !event.over || !upcomingTrip) return;
    const tripAppointment = tripAppointments?.find((appointment) => appointment.id === appointmentId);
    if (!tripAppointment || tripAppointment.linkedAppointmentId || !isOpenStatus(tripAppointment.status)) return;

    const targetId = String(event.over.id);
    let targetDate: Date;
    let targetMinutes = parseTimeToMinutes(tripAppointment.time);
    if (targetId === "schedule-grid") {
      targetDate = selectedDate;
      targetMinutes = Math.round((targetMinutes + (event.delta.y / HOUR_HEIGHT) * 60) / 15) * 15;
    } else if (targetId.startsWith("trip-day:")) {
      const parsedDate = dateFromKey(targetId.slice("trip-day:".length));
      if (!parsedDate) return;
      targetDate = parsedDate;
    } else {
      return;
    }

    const tripStart = parseAnyDate(upcomingTrip.startDate);
    const tripEnd = parseAnyDate(upcomingTrip.endDate);
    if (!tripStart || !tripEnd || startOfDay(targetDate) < startOfDay(tripStart) || startOfDay(targetDate) > startOfDay(tripEnd)) {
      toast({
        title: "Choose a day within the trip",
        description: "Trip appointments must stay between the trip's start and end dates.",
        variant: "destructive",
      });
      return;
    }
    if (targetMinutes < GRID_START_HOUR * 60 || targetMinutes >= GRID_END_HOUR * 60 || targetMinutes + parseDurationToMinutes(tripAppointment.duration || DEFAULT_DURATION) > 24 * 60) {
      toast({ title: "Choose a time between 7:00 AM and 9:00 PM", variant: "destructive" });
      return;
    }

    const targetTime = minutesToTimeStr(targetMinutes);
    const targetDateString = formatAppDate(targetDate);
    if (targetDateString === tripAppointment.date && targetTime === tripAppointment.time) return;

    const linkedAppointmentIds = new Set(
      (tripAppointments ?? [])
        .map((appointment) => appointment.linkedAppointmentId)
        .filter((id): id is number => id != null),
    );
    const existing: ExistingAppointment[] = [];
    (appointments ?? []).forEach((appointment) => {
      if (linkedAppointmentIds.has(appointment.id) || !isOpenStatus(appointment.status)) return;
      if (!appointmentOccursOn(appointment, targetDate)) return;
      existing.push({
        time: appointmentTime(appointment),
        duration: appointmentDuration(appointment),
        city: customerMap.get(appointment.customerId)?.city ?? "",
      });
    });
    (tripAppointments ?? []).forEach((appointment) => {
      if (appointment.id === tripAppointment.id || !isOpenStatus(appointment.status)) return;
      const date = parseAnyDate(appointment.date);
      if (!date || !sameDay(date, targetDate)) return;
      existing.push({
        time: appointment.time,
        duration: appointment.duration || DEFAULT_DURATION,
        city: customerMap.get(appointment.customerId)?.city ?? "",
      });
    });
    const candidateCustomer = customerMap.get(tripAppointment.customerId);
    const conflict = checkTimeConflict(
      targetTime,
      tripAppointment.duration || DEFAULT_DURATION,
      candidateCustomer?.city ?? "",
      existing,
    );
    if (!conflict.valid) {
      toast({ title: "That time is unavailable", description: conflict.message, variant: "destructive" });
      return;
    }
    moveTripAppointment.mutate({
      id: tripAppointment.id,
      date: targetDateString,
      time: targetTime,
    });
  }

  return (
    <div className="grid min-w-0 grid-cols-1 gap-4 xl:grid-cols-[minmax(280px,0.85fr)_minmax(0,1.65fr)]">
      <Card className="min-w-0" data-testid="dashboard-upcoming-trip">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <Plane className="h-4 w-4" /> Upcoming Trip
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {tripsLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-5 w-40" />
              <Skeleton className="h-4 w-28" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : !upcomingTrip ? (
            <div className="flex flex-col items-center gap-2 py-7 text-center">
              <Plane className="h-8 w-8 text-muted-foreground/35" />
              <p className="text-sm text-muted-foreground">No active or upcoming trips.</p>
              <Link href="/slc-schedule">
                <Button size="sm" variant="outline">Plan a trip</Button>
              </Link>
            </div>
          ) : (
            <>
              <div>
                <Link href="/slc-schedule" className="font-semibold hover:underline">
                  {upcomingTrip.name}
                </Link>
                <p className="mt-1 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {formatTripRange(upcomingTrip)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline" className="border-green-600/30 bg-green-500/10 text-green-700 dark:text-green-400">
                  {tripAppointmentsForCard.filter((appointment) => !!appointment.linkedAppointmentId).length} booked
                </Badge>
                <Badge variant="outline" className="border-amber-600/30 bg-amber-500/10 text-amber-700 dark:text-amber-400">
                  {tripAppointmentsForCard.filter((appointment) => !appointment.linkedAppointmentId).length} not booked
                </Badge>
              </div>
              {tripAppointmentsForCard.some((appointment) =>
                !appointment.linkedAppointmentId &&
                !["cancelled", "completed"].includes((appointment.status ?? "").toLowerCase())
              ) && (
                <Button
                  size="sm"
                  className="w-full"
                  disabled={bookTripMutation.isPending}
                  onClick={() => bookTripMutation.mutate(upcomingTrip.id)}
                  data-testid="button-book-upcoming-trip"
                >
                  {bookTripMutation.isPending ? "Booking trip…" : "Book all unbooked appointments"}
                </Button>
              )}
              <div className="max-h-[420px] space-y-0.5 overflow-y-auto rounded-md border p-1" data-testid="dashboard-trip-stops">
                {tripAppointmentsLoading ? (
                  <div className="space-y-2 p-2">
                    <Skeleton className="h-11 w-full" />
                    <Skeleton className="h-11 w-full" />
                  </div>
                ) : tripAppointmentsForCard.length === 0 ? (
                  <p className="px-3 py-5 text-center text-xs text-muted-foreground">No stops added to this trip yet.</p>
                ) : (
                  tripAppointmentsForCard.map((appointment) => (
                    <TripAppointmentRow
                      key={appointment.id}
                      appointment={appointment}
                      customer={customerMap.get(appointment.customerId)}
                      onSelectDate={setDate}
                    />
                  ))
                )}
              </div>
              <Link href="/slc-schedule">
                <Button variant="ghost" size="sm" className="w-full text-xs">
                  Open Trip Planner <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            </>
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0" data-testid="dashboard-upcoming-appointments">
        <CardHeader className="space-y-3 pb-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle className="flex items-center gap-2 text-base font-semibold">
              <CalendarDays className="h-4 w-4" /> Upcoming Appointments
            </CardTitle>
            <div className="flex items-center gap-1">
              <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => moveDay(-1)} aria-label="Previous day">
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Button variant="ghost" className="h-8 px-2 text-xs" onClick={() => setDate(today)}>Today</Button>
              <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => moveDay(1)} aria-label="Next day">
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <p className="text-sm font-medium">{dateLabel}</p>
          {tripDateChips.length > 0 && (
            <div className="flex gap-1.5 overflow-x-auto pb-1" aria-label="Trip days">
              {tripDateChips.map((date) => (
                <TripDayDropButton
                  key={dateKey(date)}
                  date={date}
                  selected={sameDay(selectedDate, date)}
                  onSelect={setDate}
                />
              ))}
            </div>
          )}
        </CardHeader>
        <CardContent className="pt-0">
          {appointmentsLoading || customersLoading || (!!upcomingTrip && tripAppointmentsLoading) ? (
            <Skeleton className="h-[440px] w-full" />
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={pointerWithin}
              onDragEnd={handleDragEnd}
            >
              {allDayEntries.length > 0 && (
                <div className="mb-3 space-y-1 border-b pb-3" data-testid="dashboard-all-day-appointments">
                  <p className="text-xs font-medium text-muted-foreground">All day</p>
                  {allDayEntries.map((entry) => {
                    const customer = customerMap.get(entry.customerId);
                    return (
                      <div key={`all-day-${entry.appointment.id}`} className="rounded-md border-l-4 border-sky-600 bg-sky-100 px-2 py-1.5 text-xs text-sky-950 dark:bg-sky-950/70 dark:text-sky-50">
                        {customer ? clientName(customer) : "Unknown client"}
                        {entry.appointment.servicesRequested ? ` · ${entry.appointment.servicesRequested}` : ""}
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="max-h-[75vh] overflow-y-auto">
                <div className="grid grid-cols-[48px_minmax(0,1fr)] sm:grid-cols-[58px_minmax(0,1fr)]">
                  <div className="border-r border-border/40">
                    {Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, index) => {
                      const hour = GRID_START_HOUR + index;
                      const label = hour < 12 ? `${hour} AM` : hour === 12 ? "12 PM" : `${hour - 12} PM`;
                      return (
                        <div key={hour} style={{ height: HOUR_HEIGHT }} className="flex items-start justify-end border-b border-border/20 pr-2 pt-0.5">
                          <span className="whitespace-nowrap text-[10px] text-muted-foreground">{label}</span>
                        </div>
                      );
                    })}
                  </div>
                  <ScheduleGridDropzone height={gridHeight}>
                    {Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, index) => (
                      <div key={index} className="pointer-events-none absolute inset-x-0 border-b border-border/20" style={{ top: index * HOUR_HEIGHT }} />
                    ))}
                    {timedEntries.length === 0 && (
                      <div className="pointer-events-none absolute left-2 top-2 z-[1] rounded bg-background/80 px-2 py-1 text-xs text-muted-foreground">
                        No timed appointments for this day
                      </div>
                    )}
                    {timedEntries.map((entry) => {
                      const start = parseTimeToMinutes(entry.time);
                      if (start < 0 || start >= GRID_END_HOUR * 60) return null;
                      const duration = parseDurationToMinutes(entry.duration);
                      const end = start + duration;
                      if (end <= GRID_START_HOUR * 60) return null;
                      const top = ((Math.max(start, GRID_START_HOUR * 60) - GRID_START_HOUR * 60) / 60) * HOUR_HEIGHT;
                      const height = Math.max((duration / 60) * HOUR_HEIGHT, 24);
                      const customer = customerMap.get(entry.customerId);
                      if (entry.kind === "trip" && !entry.appointment.linkedAppointmentId && isOpenStatus(entry.appointment.status)) {
                        return (
                          <DraggableTripBlock
                            key={`trip-${entry.appointment.id}`}
                            entry={entry}
                            customer={customer}
                            top={top}
                            height={height}
                            disabled={moveTripAppointment.isPending}
                          />
                        );
                      }
                      return (
                        <FixedScheduleBlock
                          key={`${entry.kind}-${entry.appointment.id}`}
                          entry={entry}
                          customer={customer}
                          top={top}
                          height={height}
                        />
                      );
                    })}
                  </ScheduleGridDropzone>
                </div>
              </div>
              <p className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <Clock className="h-3 w-3" />
                Appointment blocks are sized by duration. Drag amber unbooked trip stops to a time or trip day.
              </p>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-sky-500" /> Regular appointment</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-green-500" /> Booked trip stop</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-amber-500" /> Unbooked, movable</span>
              </div>
            </DndContext>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
