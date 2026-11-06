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
import { ArrowRight, CalendarDays, ChevronLeft, ChevronRight, Clock, GripVertical, Plane, Plus, Search, Pencil, Trash2, CheckCircle2, X, Sparkles } from "lucide-react";
import { Link } from "wouter";
import type { Appointment, Customer, OutreachLead, Piano, Trip, TripAppointment } from "@shared/schema";
import { appointmentOccursOn, expandAppointmentDates, parseAnyDate } from "@shared/appointment-repeat";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { clientName } from "@shared/client-name";
import { tripAppointmentPianoLines } from "@/lib/trip-appointment-lines";
import { AppointmentDialog } from "@/components/appointment-dialog";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
  pianoMap,
  onSelectDate,
  onBook,
  onUnbook,
  onOpenDetails,
  isBooking,
  isUnbooking,
}: {
  appointment: TripAppointment;
  customer: Customer | undefined;
  pianoMap: Map<number, Piano>;
  onSelectDate: (date: Date) => void;
  onBook: () => void;
  onUnbook: () => void;
  onOpenDetails: () => void;
  isBooking: boolean;
  isUnbooking: boolean;
}) {
  const date = parseAnyDate(appointment.date);
  const canBook = !appointment.linkedAppointmentId &&
    !["cancelled", "completed"].includes((appointment.status ?? "").toLowerCase());
  const canUnbook = !!appointment.linkedAppointmentId &&
    !["cancelled", "completed"].includes((appointment.status ?? "").toLowerCase());
  const pianoLines = tripAppointmentPianoLines(appointment, pianoMap);
  return (
    <div className="flex items-center gap-1 rounded-md px-1 transition-colors hover:bg-accent" data-testid={`dashboard-trip-stop-${appointment.id}`}>
      <button
        type="button"
        onClick={onOpenDetails}
        className="flex min-w-0 flex-1 items-start gap-2.5 py-2 pl-1 text-left"
        aria-label={`Show ${customer ? clientName(customer) : "unknown client"} on ${appointment.date}`}
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
          </span>
          <span className="mt-0.5 block space-y-0.5">
            {pianoLines.map((line, index) => (
              <span key={`${line.pianoId ?? "misc"}-${index}`} className="block break-words text-xs text-muted-foreground" data-testid={`dashboard-trip-piano-line-${appointment.id}-${index}`}>
                <span className="font-medium text-foreground/80">{line.pianoName}:</span>{" "}
                {line.services} · {line.durationMinutes > 0 ? formatDuration(line.durationMinutes) : "Duration not set"}
              </span>
            ))}
          </span>
        </span>
      </button>
      {canBook && (
        <Button
          size="sm"
          variant="secondary"
          className="h-7 shrink-0 px-2 text-xs"
          onClick={onBook}
          disabled={isBooking}
          data-testid={`button-book-dashboard-trip-stop-${appointment.id}`}
        >
          {isBooking ? "Booking…" : "Book appointment"}
        </Button>
      )}
      {canUnbook && (
        <Button
          size="sm"
          variant="outline"
          className="h-7 shrink-0 px-2 text-xs"
          onClick={onUnbook}
          disabled={isUnbooking}
          data-testid={`button-unbook-dashboard-trip-stop-${appointment.id}`}
        >
          {isUnbooking ? "Unbooking…" : "Unbook"}
        </Button>
      )}
    </div>
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
  const [selectedTripStop, setSelectedTripStop] = useState<TripAppointment | null>(null);
  const [addClientOpen, setAddClientOpen] = useState(false);
  const [clientSearch, setClientSearch] = useState("");
  const [selectedAddClient, setSelectedAddClient] = useState<Customer | null>(null);
  const [bookClientImmediately, setBookClientImmediately] = useState(false);
  const [tripCategory, setTripCategory] = useState<"booked" | "unconfirmed" | "suggested">("booked");
  const [showIgnoredSuggestions, setShowIgnoredSuggestions] = useState(false);
  const [addStopOpen, setAddStopOpen] = useState(false);
  const [editingStop, setEditingStop] = useState(false);
  const [editValues, setEditValues] = useState({ date: "", time: "", duration: 120, title: "", notes: "" });
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 7 } }));

  const { data: trips, isLoading: tripsLoading } = useQuery<Trip[]>({ queryKey: ["/api/trips"] });
  const { data: appointments, isLoading: appointmentsLoading } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments"],
  });
  const { data: customers, isLoading: customersLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });
  const { data: pianos } = useQuery<Piano[]>({ queryKey: ["/api/pianos"] });
  const { data: outreachLeads } = useQuery<OutreachLead[]>({ queryKey: ["/api/outreach-leads"] });

  const ignoreSuggestionMutation = useMutation({
    mutationFn: async ({ customerId, ignored }: { customerId: number; ignored: boolean }) => {
      const response = await apiRequest("PATCH", `/api/customers/${customerId}`, { isTripSuggestionIgnored: ignored });
      return response.json() as Promise<Customer>;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
    },
    onError: (error: Error) => toast({ title: "Could not update suggested clients", description: error.message, variant: "destructive" }),
  });

  const upcomingTrip = useMemo(() => getUpcomingTrip(trips, today), [trips, today]);
  const tripAppointmentsKey = `/api/trips/${upcomingTrip?.id ?? "none"}/appointments`;
  const { data: tripAppointments, isLoading: tripAppointmentsLoading } = useQuery<TripAppointment[]>({
    queryKey: [tripAppointmentsKey],
    enabled: !!upcomingTrip,
  });
  const contactedClientsKey = `/api/trips/${upcomingTrip?.id ?? "none"}/contacted-clients`;
  const { data: contactedCustomerIds = [] } = useQuery<number[]>({
    queryKey: [contactedClientsKey],
    enabled: !!upcomingTrip,
  });
  const contactedCustomerIdSet = useMemo(() => new Set(contactedCustomerIds), [contactedCustomerIds]);

  const customerMap = useMemo(
    () => new Map(customers?.map((customer) => [customer.id, customer]) ?? []),
    [customers],
  );
  const pianoMap = useMemo(
    () => new Map(pianos?.map((piano) => [piano.id, piano]) ?? []),
    [pianos],
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

  const bookTripAppointmentMutation = useMutation({
    mutationFn: async (tripAppointmentId: number) => {
      const response = await apiRequest("POST", `/api/trip-appointments/${tripAppointmentId}/book`);
      return response.json() as Promise<{ alreadyBooked: boolean }>;
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [tripAppointmentsKey] }),
        queryClient.invalidateQueries({ queryKey: ["/api/appointments"] }),
      ]);
      toast({
        title: result.alreadyBooked ? "Appointment is already booked" : "Appointment booked",
      });
    },
    onError: (error: any) => toast({ title: "Could not book appointment", description: error.message, variant: "destructive" }),
  });

  const markTripClientContactedMutation = useMutation({
    mutationFn: async (customerId: number) => {
      if (!upcomingTrip) throw new Error("There is no upcoming trip.");
      const response = await apiRequest("POST", `/api/trips/${upcomingTrip.id}/contacted-clients/${customerId}`);
      return response.json() as Promise<{ customerId: number; lastContacted: string }>;
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [contactedClientsKey] }),
        queryClient.invalidateQueries({ queryKey: ["/api/customers"] }),
      ]);
      toast({ title: "Client marked as contacted" });
    },
    onError: (error: Error) => toast({ title: "Could not mark client contacted", description: error.message, variant: "destructive" }),
  });

  const unbookTripAppointmentMutation = useMutation({
    mutationFn: async (tripAppointmentId: number) => {
      const response = await apiRequest("POST", `/api/trip-appointments/${tripAppointmentId}/unbook`);
      if (!response.ok) {
        const result = await response.json().catch(() => ({}));
        throw new Error(result.message || "Could not unbook appointment");
      }
      return response.json();
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [tripAppointmentsKey] }),
        queryClient.invalidateQueries({ queryKey: ["/api/appointments"] }),
      ]);
      toast({ title: "Appointment unbooked", description: "The calendar entry was cancelled and the trip stop is back in the plan." });
    },
    onError: (error: Error) => toast({ title: "Could not unbook appointment", description: error.message, variant: "destructive" }),
  });

  const updateTripStopMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Record<string, unknown> }) => {
      const response = await apiRequest("PATCH", `/api/trip-appointments/${id}`, data);
      return response.json() as Promise<TripAppointment>;
    },
    onSuccess: async (updated) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [tripAppointmentsKey] }),
        queryClient.invalidateQueries({ queryKey: ["/api/appointments"] }),
      ]);
      setSelectedTripStop(updated);
      setEditingStop(false);
      toast({ title: updated.status === "completed" ? "Appointment completed" : "Trip appointment updated" });
    },
    onError: (error: any) => toast({ title: "Could not update appointment", description: error.message, variant: "destructive" }),
  });

  const deleteTripStopMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/trip-appointments/${id}`);
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: [tripAppointmentsKey] }),
        queryClient.invalidateQueries({ queryKey: ["/api/appointments"] }),
      ]);
      setSelectedTripStop(null);
      toast({ title: "Trip appointment deleted" });
    },
    onError: (error: any) => toast({ title: "Could not delete appointment", description: error.message, variant: "destructive" }),
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
    () => [...(tripAppointments ?? [])].filter((appointment) => appointment.status !== "cancelled").sort((a, b) => {
      const dateDiff = (parseAnyDate(a.date)?.getTime() ?? 0) - (parseAnyDate(b.date)?.getTime() ?? 0);
      if (dateDiff !== 0) return dateDiff;
      return parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time);
    }),
    [tripAppointments],
  );
  const bookedTripAppointments = useMemo(
    () => tripAppointmentsForCard.filter((appointment) => !!appointment.linkedAppointmentId && isOpenStatus(appointment.status)),
    [tripAppointmentsForCard],
  );
  const unconfirmedTripAppointments = useMemo(
    () => tripAppointmentsForCard.filter((appointment) => !appointment.linkedAppointmentId && isOpenStatus(appointment.status)),
    [tripAppointmentsForCard],
  );
  const existingTripCustomerIds = useMemo(
    () => new Set(tripAppointmentsForCard.map((appointment) => appointment.customerId)),
    [tripAppointmentsForCard],
  );
  const utahClients = useMemo(() => (customers ?? []).filter((customer) =>
    customer.state?.trim().toLowerCase() === "ut" ||
    customer.state?.trim().toLowerCase() === "utah" ||
    customer.address?.toLowerCase().includes(", ut"),
  ), [customers]);
  const clientOptions = useMemo(() => {
    const query = clientSearch.trim().toLowerCase();
    return utahClients
      .filter((customer) => !customer.isTripSuggestionIgnored && !existingTripCustomerIds.has(customer.id))
      .filter((customer) => !contactedCustomerIdSet.has(customer.id))
      .filter((customer) => !query || `${clientName(customer)} ${customer.city ?? ""} ${customer.phone ?? ""}`.toLowerCase().includes(query))
      .sort((a, b) => Number(!!b.isStarred) - Number(!!a.isStarred) || clientName(a).localeCompare(clientName(b)))
      .slice(0, 30);
  }, [utahClients, existingTripCustomerIds, clientSearch]);
  const allSuggestions = useMemo(() => {
    const now = startOfDay(new Date());
    const dayMs = 86400000;
    const tripCityCounts = new Map<string, number>();
    (tripAppointments ?? []).forEach((stop) => {
      const city = customerMap.get(stop.customerId)?.city?.trim().toLowerCase();
      if (city) tripCityCounts.set(city, (tripCityCounts.get(city) ?? 0) + 1);
    });
    const contactDigits = (value?: string | null) => (value || "").replace(/\D/g, "");
    const warmthFor = (customer: Customer) => {
      const email = customer.email?.trim().toLowerCase();
      const phone = contactDigits(customer.phone);
      const match = (outreachLeads ?? []).find((lead) => {
        const emailMatch = !!email && !!lead.email && email === lead.email.trim().toLowerCase();
        const leadPhone = contactDigits(lead.phone);
        const phoneMatch = phone.length >= 7 && leadPhone.length >= 7 && phone === leadPhone;
        return emailMatch || phoneMatch;
      });
      const status = match?.status?.toLowerCase() || "";
      if (/not interested|not in service|do not contact/.test(status)) return { score: -2, label: "Cool contact" };
      if (/interested|\bclient\b|booked/.test(status)) return { score: 3, label: "Warm contact" };
      if (match && !/not contacted/.test(status)) return { score: 1, label: "Previously contacted" };
      return { score: 0, label: "New contact" };
    };

    return utahClients
      .filter((customer) => !existingTripCustomerIds.has(customer.id))
      .map((customer) => {
        const ownedPianos = (pianos ?? []).filter((piano) => piano.customerId === customer.id && piano.isActive !== false);
        const daysUntilDue = ownedPianos.map((piano) => {
          if (!piano.lastTuned) return -3650;
          const lastTuned = parseAnyDate(piano.lastTuned);
          if (!lastTuned) return -3650;
          const dueDate = new Date(lastTuned);
          dueDate.setMonth(dueDate.getMonth() + (Number.parseInt(piano.tuningInterval ?? "", 10) || 6));
          return Math.ceil((startOfDay(dueDate).getTime() - now.getTime()) / dayMs);
        });
        const dueCount = daysUntilDue.filter((days) => days <= 0).length;
        const nearestDueDays = daysUntilDue.length ? Math.min(...daysUntilDue) : Infinity;
        const city = customer.city?.trim().toLowerCase() ?? "";
        const routeFit = city && tripCityCounts.has(city) ? tripCityCounts.get(city)! : 0;
        const warmth = warmthFor(customer);
        const dueScore = nearestDueDays <= 0
          ? 5 + Math.min(6, Math.floor(Math.abs(nearestDueDays) / 90))
          : nearestDueDays <= 30 ? 4 : nearestDueDays <= 90 ? 2 : 0;
        const score = dueScore + Math.min(routeFit, 3) * 2 + warmth.score + (customer.isStarred ? 1 : 0);
        const dueReason = dueCount
          ? `${dueCount} piano${dueCount === 1 ? "" : "s"} overdue`
          : Number.isFinite(nearestDueDays)
            ? `Tuning due in ${nearestDueDays} days`
            : "Tuning date unknown";
        const proximityReason = routeFit ? `Near ${routeFit} planned stop${routeFit === 1 ? "" : "s"}` : "";
        return {
          customer,
          dueCount,
          pianoCount: ownedPianos.length,
          routeFit,
          nearestDueDays,
          warmthLabel: warmth.label,
          score,
          reason: [dueReason, proximityReason, warmth.score !== 0 ? warmth.label : ""].filter(Boolean).join(" · "),
        };
      })
      .filter((item) => item.pianoCount > 0 && item.nearestDueDays <= 180)
      .sort((a, b) => b.score - a.score || clientName(a.customer).localeCompare(clientName(b.customer)));
  }, [utahClients, pianos, existingTripCustomerIds, tripAppointments, customerMap, outreachLeads, contactedCustomerIdSet]);
  const recommendedClients = useMemo(
    () => allSuggestions.slice(0, 5),
    [allSuggestions],
  );
  const ignoredClients = useMemo(
    () => utahClients.filter((customer) => customer.isTripSuggestionIgnored && !existingTripCustomerIds.has(customer.id)),
    [utahClients, existingTripCustomerIds],
  );

  function openTripStopDetails(appointment: TripAppointment) {
    setSelectedTripStop(appointment);
    setEditingStop(false);
  }

  function beginEditTripStop(appointment: TripAppointment) {
    const date = parseAnyDate(appointment.date);
    const minutes = parseTimeToMinutes(appointment.time || "");
    setEditValues({
      date: date ? dateKey(date) : "",
      time: minutes >= 0 ? `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}` : "",
      duration: parseDurationToMinutes(appointment.duration || DEFAULT_DURATION),
      title: appointment.title || "",
      notes: appointment.notes || "",
    });
    setEditingStop(true);
  }

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
    <div className="min-w-0 space-y-4">
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link href="/slc-schedule">
              <Button size="sm" variant="outline" className="h-8">
                <Plane className="mr-1.5 h-3.5 w-3.5" />
                {tripsLoading ? "Loading trip…" : upcomingTrip ? `${upcomingTrip.name} · Trip Planner` : "Plan a trip"}
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Button>
            </Link>
            {upcomingTrip && <span className="text-xs text-muted-foreground">{formatTripRange(upcomingTrip)}</span>}
          </div>
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
        <CardContent className="flex flex-col pt-0">
          <div className="order-2 mb-4 rounded-lg border bg-muted/10 p-3" data-testid="dashboard-trip-categories">
            <div className="mb-3 flex flex-wrap gap-2" role="tablist" aria-label="Trip clients">
              <Button
                size="sm"
                variant={tripCategory === "booked" ? "secondary" : "ghost"}
                onClick={() => setTripCategory("booked")}
                role="tab"
                aria-selected={tripCategory === "booked"}
              >
                Booked <Badge variant="outline" className="ml-1">{bookedTripAppointments.length}</Badge>
              </Button>
              <Button
                size="sm"
                variant={tripCategory === "unconfirmed" ? "secondary" : "ghost"}
                onClick={() => setTripCategory("unconfirmed")}
                role="tab"
                aria-selected={tripCategory === "unconfirmed"}
              >
                Unconfirmed <Badge variant="outline" className="ml-1">{unconfirmedTripAppointments.length}</Badge>
              </Button>
              <Button
                size="sm"
                variant={tripCategory === "suggested" ? "secondary" : "ghost"}
                onClick={() => setTripCategory("suggested")}
                role="tab"
                aria-selected={tripCategory === "suggested"}
              >
                <Sparkles className="mr-1 h-3.5 w-3.5" /> Suggested clients
              </Button>
            </div>
            {tripCategory === "booked" || tripCategory === "unconfirmed" ? (
              <div className="max-h-64 overflow-y-auto rounded-md border bg-background p-1" data-testid={`dashboard-trip-${tripCategory}`}>
                {tripAppointmentsLoading ? (
                  <div className="space-y-2 p-2"><Skeleton className="h-11 w-full" /><Skeleton className="h-11 w-full" /></div>
                ) : (tripCategory === "booked" ? bookedTripAppointments : unconfirmedTripAppointments).length === 0 ? (
                  <p className="px-3 py-5 text-center text-xs text-muted-foreground">
                    {tripCategory === "booked" ? "No booked appointments on this trip yet." : "No unconfirmed appointments on this trip."}
                  </p>
                ) : (tripCategory === "booked" ? bookedTripAppointments : unconfirmedTripAppointments).map((appointment) => (
                  <TripAppointmentRow
                    key={appointment.id}
                    appointment={appointment}
                    customer={customerMap.get(appointment.customerId)}
                    pianoMap={pianoMap}
                    onSelectDate={setDate}
                    onOpenDetails={() => openTripStopDetails(appointment)}
                    onBook={() => bookTripAppointmentMutation.mutate(appointment.id)}
                    isBooking={bookTripAppointmentMutation.isPending && bookTripAppointmentMutation.variables === appointment.id}
                    onUnbook={() => unbookTripAppointmentMutation.mutate(appointment.id)}
                    isUnbooking={unbookTripAppointmentMutation.isPending && unbookTripAppointmentMutation.variables === appointment.id}
                  />
                ))}
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-muted-foreground">
                    Ranked by tuning urgency, nearby trip stops, and matched contact history.
                  </p>
                  <div className="flex items-center gap-2">
                    {ignoredClients.length > 0 && (
                      <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => setShowIgnoredSuggestions((value) => !value)}>
                        {showIgnoredSuggestions ? "Hide ignored" : `Ignored (${ignoredClients.length})`}
                      </Button>
                    )}
                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={() => setAddClientOpen(true)}>
                      <Search className="mr-1 h-3 w-3" /> Find client
                    </Button>
                  </div>
                </div>
                {showIgnoredSuggestions ? (
                  <div className="space-y-1">
                    {ignoredClients.length ? ignoredClients.map((customer) => (
                      <div key={customer.id} className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2 text-sm">
                        <span>{clientName(customer)}</span>
                        <Button size="sm" variant="ghost" className="h-7" disabled={ignoreSuggestionMutation.isPending} onClick={() => ignoreSuggestionMutation.mutate({ customerId: customer.id, ignored: false })}>Restore</Button>
                      </div>
                    )) : <p className="py-3 text-center text-xs text-muted-foreground">No ignored clients.</p>}
                  </div>
                ) : recommendedClients.length ? (
                  <div className="max-h-64 space-y-1 overflow-y-auto">
                    {recommendedClients.map(({ customer, reason, pianoCount }) => (
                      <div key={customer.id} className="flex items-center justify-between gap-2 rounded-md border bg-background px-3 py-2">
                        <div className="min-w-0">
                          <Link href={`/customers/${customer.id}`} className="block truncate text-sm font-medium hover:text-primary hover:underline" data-testid={`link-suggested-client-${customer.id}`}>
                            {clientName(customer)}
                          </Link>
                          <p className="truncate text-xs text-muted-foreground">
                            {[customer.city, `${pianoCount} piano${pianoCount === 1 ? "" : "s"}`, reason].filter(Boolean).join(" · ")}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <Button size="sm" variant="outline" className="h-7 px-2 text-xs" disabled={!upcomingTrip} onClick={() => {
                            setSelectedAddClient(customer);
                            setBookClientImmediately(false);
                            setAddStopOpen(true);
                          }}>
                            Add
                          </Button>
                          <Button size="sm" variant="secondary" className="h-7 px-2 text-xs" disabled={!upcomingTrip} onClick={() => {
                            setSelectedAddClient(customer);
                            setBookClientImmediately(true);
                            setAddStopOpen(true);
                          }}>
                            Book
                          </Button>
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-7 w-7"
                            title={`Mark ${clientName(customer)} as contacted`}
                            aria-label={`Mark ${clientName(customer)} as contacted`}
                            disabled={markTripClientContactedMutation.isPending || !upcomingTrip}
                            onClick={() => markTripClientContactedMutation.mutate(customer.id)}
                          >
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          </Button>
                          <Button size="icon" variant="ghost" className="h-7 w-7" title={`Ignore ${clientName(customer)}`} aria-label={`Ignore ${clientName(customer)}`} disabled={ignoreSuggestionMutation.isPending} onClick={() => ignoreSuggestionMutation.mutate({ customerId: customer.id, ignored: true })}>
                            <X className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="py-4 text-center text-xs text-muted-foreground">No due or soon-due Utah clients to suggest right now.</p>
                )}
              </div>
            )}
          </div>
          <div className="order-1">
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
          </div>
        </CardContent>
      </Card>
      <Dialog open={addClientOpen} onOpenChange={setAddClientOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Add a client to {upcomingTrip?.name ?? "the trip"}</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input value={clientSearch} onChange={(event) => setClientSearch(event.target.value)} placeholder="Search Utah clients…" className="pl-9" />
            </div>
            {!clientSearch.trim() && recommendedClients.length > 0 && (
              <section>
                <p className="mb-2 text-sm font-medium">Recommended · tuning due</p>
                <div className="space-y-1">
                  {recommendedClients.map(({ customer, dueCount, pianoCount }) => (
                    <button key={customer.id} type="button" onClick={() => setSelectedAddClient(customer)}
                      className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm ${selectedAddClient?.id === customer.id ? "border-primary bg-accent" : "hover:bg-accent"}`}>
                      <span>{clientName(customer)} <span className="text-xs text-muted-foreground">· {customer.city || "Utah"} · {pianoCount} piano{pianoCount === 1 ? "" : "s"}</span></span>
                      <span className="text-xs text-muted-foreground">{dueCount ? `${dueCount} due` : "Not due"}</span>
                    </button>
                  ))}
                </div>
              </section>
            )}
            <section>
              <p className="mb-2 text-sm font-medium">{clientSearch.trim() ? "Matching Utah clients" : "All Utah clients"}</p>
              <div className="max-h-52 space-y-1 overflow-y-auto">
                {clientOptions.length ? clientOptions.map((customer) => (
                  <button key={customer.id} type="button" onClick={() => setSelectedAddClient(customer)}
                    className={`flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm ${selectedAddClient?.id === customer.id ? "border-primary bg-accent" : "hover:bg-accent"}`}>
                    <span>{clientName(customer)}</span><span className="text-xs text-muted-foreground">{customer.city}</span>
                  </button>
                )) : <p className="py-4 text-center text-sm text-muted-foreground">No matching clients available for this trip.</p>}
              </div>
            </section>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAddClientOpen(false)}>Cancel</Button>
              <Button disabled={!selectedAddClient || !upcomingTrip} onClick={() => { setBookClientImmediately(false); setAddClientOpen(false); setAddStopOpen(true); }}>
                Continue to appointment
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
      <AppointmentDialog
        open={addStopOpen}
        onOpenChange={(open) => { setAddStopOpen(open); if (!open) { setSelectedAddClient(null); setBookClientImmediately(false); } }}
        customerId={selectedAddClient?.id}
        customerName={selectedAddClient ? clientName(selectedAddClient) : undefined}
        initialDate={upcomingTrip ? formatAppDate(parseAnyDate(upcomingTrip.startDate) ?? today) : undefined}
        tripId={upcomingTrip?.id}
        serviceAreaLabel="Utah trip"
        bookImmediately={bookClientImmediately}
      />
      <Dialog open={!!selectedTripStop} onOpenChange={(open) => { if (!open) { setSelectedTripStop(null); setEditingStop(false); } }}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{editingStop ? "Edit trip appointment" : (selectedTripStop?.title || "Trip appointment")}</DialogTitle>
          </DialogHeader>
          {selectedTripStop && (() => {
            const customer = customerMap.get(selectedTripStop.customerId);
            const lines = tripAppointmentPianoLines(selectedTripStop, pianoMap);
            const completed = selectedTripStop.status === "completed";
            return editingStop ? (
              <div className="space-y-4">
                <p className="text-sm text-muted-foreground">{customer ? clientName(customer) : "Unknown client"}</p>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1"><Label htmlFor="trip-stop-date">Date</Label><Input id="trip-stop-date" type="date" value={editValues.date} onChange={(e) => setEditValues({ ...editValues, date: e.target.value })} /></div>
                  <div className="space-y-1"><Label htmlFor="trip-stop-time">Start time</Label><Input id="trip-stop-time" type="time" value={editValues.time} onChange={(e) => setEditValues({ ...editValues, time: e.target.value })} /></div>
                  <div className="space-y-1"><Label htmlFor="trip-stop-duration">Duration (minutes)</Label><Input id="trip-stop-duration" type="number" min="15" step="15" value={editValues.duration} onChange={(e) => setEditValues({ ...editValues, duration: Number(e.target.value) })} /></div>
                </div>
                <div className="space-y-1"><Label htmlFor="trip-stop-title">Appointment title</Label><Input id="trip-stop-title" value={editValues.title} onChange={(e) => setEditValues({ ...editValues, title: e.target.value })} /></div>
                <div className="space-y-1"><Label htmlFor="trip-stop-notes">Notes</Label><Textarea id="trip-stop-notes" value={editValues.notes} onChange={(e) => setEditValues({ ...editValues, notes: e.target.value })} /></div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setEditingStop(false)}>Cancel</Button>
                  <Button disabled={!editValues.date || !editValues.time || editValues.duration < 15 || updateTripStopMutation.isPending}
                    onClick={() => updateTripStopMutation.mutate({ id: selectedTripStop.id, data: {
                      date: formatAppDate(new Date(`${editValues.date}T12:00:00`)),
                      time: minutesToTimeStr(Number(editValues.time.slice(0, 2)) * 60 + Number(editValues.time.slice(3, 5))),
                      duration: `${Math.floor(editValues.duration / 60)}${editValues.duration % 60 ? ` hr ${editValues.duration % 60} min` : " hours"}`,
                      title: editValues.title,
                      notes: editValues.notes,
                    } })}>
                    {updateTripStopMutation.isPending ? "Saving…" : "Save changes"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="rounded-md border p-3">
                  <p className="font-medium">{customer ? clientName(customer) : "Unknown client"}</p>
                  {customer?.address && <p className="text-sm text-muted-foreground">{customer.address}{customer.city ? `, ${customer.city}` : ""}{customer.state ? `, ${customer.state}` : ""} {customer.zipCode || ""}</p>}
                  {customer?.phone && <p className="text-sm text-muted-foreground">{customer.phone}</p>}
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-sm font-medium">{selectedTripStop.date} · {formatTime(selectedTripStop.time)} · {selectedTripStop.duration || "Duration not set"}</p>
                  {lines.map((line, index) => {
                    const piano = line.pianoId ? pianoMap.get(line.pianoId) : undefined;
                    const pianoLabel = [piano?.year, piano?.make, piano?.model].filter(Boolean).join(" ") || line.pianoName;
                    return <p key={index} className="mt-2 text-sm">
                      <span className="font-medium">{pianoLabel}:</span> {line.services} · {line.durationMinutes ? formatDuration(line.durationMinutes) : "Duration not set"}
                      {piano?.lastTuned && <span className="ml-1 text-xs text-muted-foreground">Last tuned {piano.lastTuned}</span>}
                      {piano && [piano.pianoType, piano.serialNumber && `Serial ${piano.serialNumber}`, piano.location].filter(Boolean).length > 0 && (
                        <span className="block text-xs text-muted-foreground">
                          {[piano.pianoType, piano.serialNumber && `Serial ${piano.serialNumber}`, piano.location].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </p>;
                  })}
                  {selectedTripStop.notes && <p className="mt-3 whitespace-pre-wrap text-sm text-muted-foreground">{selectedTripStop.notes}</p>}
                </div>
                <div className="flex flex-wrap justify-between gap-2">
                  <div className="flex gap-2">
                    {!completed && <Button variant="outline" onClick={() => beginEditTripStop(selectedTripStop)}><Pencil className="mr-1 h-4 w-4" /> Edit</Button>}
                    {!completed && <Button variant="outline" disabled={updateTripStopMutation.isPending} onClick={() => updateTripStopMutation.mutate({ id: selectedTripStop.id, data: { status: "completed" } })}><CheckCircle2 className="mr-1 h-4 w-4" /> Complete</Button>}
                    {!completed && <Button variant="destructive" disabled={deleteTripStopMutation.isPending} onClick={() => {
                      if (window.confirm("Delete this trip stop? Any linked calendar appointment will be cancelled, and its history will be kept.")) deleteTripStopMutation.mutate(selectedTripStop.id);
                    }}><Trash2 className="mr-1 h-4 w-4" /> Delete</Button>}
                  </div>
                  <Button variant="ghost" onClick={() => setSelectedTripStop(null)}><X className="mr-1 h-4 w-4" /> Close</Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
