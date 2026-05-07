import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Plus,
  Trash2,
  MapPin,
  Clock,
  DollarSign,
  Calendar,
  CheckCircle,
  X,
  Search,
  AlertCircle,
  User,
  Phone,
  Music,
  Pencil,
  Home,
  Car,
  Star,
  CalendarPlus,
  CalendarCheck,
} from "lucide-react";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatPhone } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { ServicePicker } from "@/components/service-picker";
import type { Trip, TripAppointment, Customer, Piano } from "@shared/schema";
import {
  getNearbyCities,
  areSameCity,
  areNearby,
  getClusterName,
  checkTimeConflict,
  getNextAvailableTime,
  parseTimeToMinutes,
  parseDurationToMinutes,
  minutesToTimeStr,
  type ExistingAppointment,
} from "@/lib/scheduling";

const HOME_ADDRESS = "868 S 700 E, Centerville, UT 84014";

const TIME_SLOTS: string[] = [];
for (let h = 8; h <= 18; h++) {
  for (const m of [0, 30]) {
    if (h === 18 && m === 30) break;
    const period = h < 12 ? "AM" : "PM";
    const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    TIME_SLOTS.push(`${h12}:${String(m).padStart(2, "0")} ${period}`);
  }
}

function formatDurationSlot(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return h === 1 ? "1 hour" : `${h} hours`;
  return `${h} hr ${m} min`;
}
const DURATION_SLOTS: string[] = Array.from({ length: 32 }, (_, i) => formatDurationSlot((i + 1) * 15));

function roundToDurationSlot(durationStr: string): string {
  const minutes = parseDurationToMinutes(durationStr || "2 hours");
  const snapped = Math.round(minutes / 15) * 15;
  const clamped = Math.min(Math.max(snapped, 15), 480);
  return formatDurationSlot(clamped);
}

function buildCustomerAddress(cust: { address?: string | null; city?: string | null; state?: string | null; zipCode?: string | null } | undefined): string {
  if (!cust) return HOME_ADDRESS;
  const parts = [cust.address, cust.city, cust.state, cust.zipCode].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(", ") : HOME_ADDRESS;
}

function formatIcsDateTime(dateStr: string, timeStr: string): string {
  const dateParts = dateStr.split("/");
  if (dateParts.length !== 3) return "";
  const month = parseInt(dateParts[0]);
  const day = parseInt(dateParts[1]);
  let year = parseInt(dateParts[2]);
  if (year < 100) year += 2000;
  const timeMatch = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!timeMatch) return "";
  let hour = parseInt(timeMatch[1]);
  const minute = parseInt(timeMatch[2]);
  const period = timeMatch[3].toUpperCase();
  if (period === "PM" && hour !== 12) hour += 12;
  if (period === "AM" && hour === 12) hour = 0;
  return `${year}${String(month).padStart(2, "0")}${String(day).padStart(2, "0")}T${String(hour).padStart(2, "0")}${String(minute).padStart(2, "0")}00`;
}

function generateIcs(appt: TripAppointment, cust: Customer | undefined, piano: Piano | null | undefined): string {
  const dtStart = formatIcsDateTime(appt.date, appt.time || "8:00 AM");
  const durationMins = parseDurationToMinutes(appt.duration || "2 hours");
  const startMins = parseTimeToMinutes(appt.time || "8:00 AM");
  const endStr = minutesToTimeStr(startMins + durationMins);
  const dtEnd = formatIcsDateTime(appt.date, endStr);
  const customerName = cust ? `${cust.firstName} ${cust.lastName}` : "Unknown";
  const summary = `${customerName} \u2013 ${appt.servicesRequested || "Piano Service"}`;
  const location = buildCustomerAddress(cust);
  const pianoStr = piano ? [piano.make, piano.pianoType].filter(Boolean).join(" ") : "";
  const descParts: string[] = [];
  if (pianoStr) descParts.push(pianoStr);
  if (appt.priceEstimate) descParts.push(`Est. ${appt.priceEstimate}`);
  if (appt.notes) descParts.push(appt.notes);
  const description = descParts.join(" | ");
  const uid = `${Date.now()}-${appt.id}@pianotech`;
  const dtstamp = new Date().toISOString().replace(/[-:.]/g, "").slice(0, 15) + "Z";
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PianoTech//SLC Schedule//EN",
    "BEGIN:VTIMEZONE",
    "TZID:America/Denver",
    "BEGIN:STANDARD",
    "DTSTART:19671029T020000",
    "TZOFFSETFROM:-0600",
    "TZOFFSETTO:-0700",
    "TZNAME:MST",
    "END:STANDARD",
    "BEGIN:DAYLIGHT",
    "DTSTART:19870405T020000",
    "TZOFFSETFROM:-0700",
    "TZOFFSETTO:-0600",
    "TZNAME:MDT",
    "END:DAYLIGHT",
    "END:VTIMEZONE",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${dtstamp}`,
    `DTSTART;TZID=America/Denver:${dtStart}`,
    `DTEND;TZID=America/Denver:${dtEnd}`,
    `SUMMARY:${summary}`,
    `LOCATION:${location}`,
    description ? `DESCRIPTION:${description}` : null,
    "END:VEVENT",
    "END:VCALENDAR",
  ].filter(Boolean).join("\r\n");
}

function downloadIcs(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function roundToSlot(timeStr: string): string {
  const mins = parseTimeToMinutes(timeStr);
  if (mins < 0) return "8:00 AM";
  const rounded = Math.round(mins / 30) * 30;
  const clamped = Math.max(8 * 60, Math.min(18 * 60, rounded));
  return minutesToTimeStr(clamped);
}

function parseDateStr(dateStr: string): Date {
  if (!dateStr) return new Date(NaN);
  const parts = dateStr.split("/");
  if (parts.length !== 3) return new Date(NaN);
  const month = parseInt(parts[0]);
  const day = parseInt(parts[1]);
  let year = parseInt(parts[2]);
  if (isNaN(month) || isNaN(day) || isNaN(year)) return new Date(NaN);
  if (year < 100) year += 2000;
  return new Date(year, month - 1, day);
}

function formatDateStr(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}/${String(date.getFullYear()).slice(2)}`;
}

function getDayName(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "short" });
}

function getDayNameLong(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "long" });
}

function getDatesInRange(startStr: string, endStr: string): string[] {
  const start = parseDateStr(startStr);
  const end = parseDateStr(endStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];
  const dates: string[] = [];
  const current = new Date(start);
  while (current <= end) {
    dates.push(formatDateStr(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function parsePrice(str: string | null | undefined): number {
  if (!str) return 0;
  const num = parseFloat(str.replace(/[^0-9.]/g, ""));
  return isNaN(num) ? 0 : num;
}

interface DayScheduleColumnProps {
  dateStr: string;
  dayDate: Date;
  dayAppts: TripAppointment[];
  dayArea: string;
  dayRevenue: number;
  customerMap: Map<number, Customer>;
  pianoMap: Map<number, Piano>;
  onOpenDialog: (dateStr: string) => void;
  onOpenEditDialog: (appt: TripAppointment) => void;
  onCompleteAppointment: (id: number) => void;
  onDeleteAppointment: (id: number) => void;
  onConfirmAppointment: (appt: TripAppointment, cust: Customer | undefined, piano: Piano | null | undefined) => void;
}

function DayScheduleColumn({
  dateStr,
  dayDate,
  dayAppts,
  dayArea,
  dayRevenue,
  customerMap,
  pianoMap,
  onOpenDialog,
  onOpenEditDialog,
  onCompleteAppointment,
  onDeleteAppointment,
  onConfirmAppointment,
}: DayScheduleColumnProps) {
  const addresses = useMemo(() => {
    if (dayAppts.length === 0) return [];
    const apptAddresses = dayAppts.map(a => buildCustomerAddress(customerMap.get(a.customerId)));
    return [HOME_ADDRESS, ...apptAddresses, HOME_ADDRESS];
  }, [dayAppts, customerMap]);

  const { data: drivingData } = useQuery<{ durations: number[] | null; error?: string }>({
    queryKey: ["/api/driving-times", addresses.join("|")],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/driving-times", { addresses });
      return res.json();
    },
    enabled: addresses.length >= 2,
    staleTime: 15 * 60 * 1000,
  });

  const drivingTimes = drivingData?.durations ?? null;

  const leaveByTime = useMemo(() => {
    if (!dayAppts.length || !drivingTimes || drivingTimes[0] == null || drivingTimes[0] < 0) return null;
    const firstMins = parseTimeToMinutes(dayAppts[0].time || "");
    if (firstMins < 0) return null;
    const leaveMins = firstMins - drivingTimes[0];
    return leaveMins > 0 ? minutesToTimeStr(leaveMins) : null;
  }, [dayAppts, drivingTimes]);

  const dayNameShort = getDayName(dayDate);

  return (
    <div
      key={dateStr}
      className="w-[220px] shrink-0 flex flex-col border rounded-lg bg-card"
      data-testid={`column-day-${dateStr}`}
    >
      <div className="p-3 border-b bg-muted/30 rounded-t-lg">
        <div className="font-semibold text-sm">{dayNameShort}</div>
        <div className="text-xs text-muted-foreground">{dateStr}</div>
        {dayArea && (
          <Badge variant="secondary" className="mt-1.5 text-xs gap-1" data-testid={`badge-area-${dateStr}`}>
            <MapPin className="h-3 w-3" />
            {getClusterName(dayArea)}
          </Badge>
        )}
        {dayRevenue > 0 && (
          <div className="text-xs text-muted-foreground mt-1">Expected ${dayRevenue.toFixed(0)}</div>
        )}
      </div>

      <div className="flex-1 p-2 min-h-[200px]">
        {dayAppts.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-8">No appointments</p>
        ) : (
          <div className="space-y-1">
            <div className="flex items-center gap-1.5 px-1 py-1">
              <Home className="h-3 w-3 text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-[10px] font-medium text-muted-foreground">Start of day</div>
                {leaveByTime && (
                  <div className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold">
                    Leave by {leaveByTime}
                  </div>
                )}
              </div>
            </div>

            {dayAppts.map((appt, i) => {
              const cust = customerMap.get(appt.customerId);
              const piano = appt.pianoId ? pianoMap.get(appt.pianoId) : null;
              const isCompleted = appt.status === "completed";
              const addressParts = [cust?.address, cust?.city, cust?.state, cust?.zipCode].filter(Boolean);
              const addressStr = addressParts.join(", ");
              const pianoStr = [piano?.make, piano?.pianoType].filter(Boolean).join(" ");
              const otherAppts: ExistingAppointment[] = dayAppts
                .filter(a => a.id !== appt.id && a.time)
                .map(a => ({ time: a.time!, duration: a.duration || "2 hours", city: "" }));
              const isOverlapping = appt.time
                ? !checkTimeConflict(appt.time, appt.duration || "2 hours", "", otherAppts).valid
                : false;
              const driveMinutes = drivingTimes ? drivingTimes[i] : null;

              return (
                <div key={appt.id}>
                  {driveMinutes != null && driveMinutes >= 0 && (
                    <div className="flex items-center gap-1 px-1 py-0.5 text-[10px] text-muted-foreground">
                      <Car className="h-2.5 w-2.5 shrink-0" />
                      <span>Driving ({driveMinutes}m)</span>
                      <div className="flex-1 border-t border-dashed border-muted-foreground/25 ml-0.5" />
                    </div>
                  )}
                  <div
                    className={`rounded-md border p-2 text-xs flex gap-2 ${isCompleted ? "opacity-60" : ""} ${isOverlapping ? "border-orange-300 bg-orange-50/50 dark:border-orange-800 dark:bg-orange-950/10" : ""}`}
                    data-testid={`trip-appointment-${appt.id}`}
                  >
                    <div className="flex-1 space-y-1 min-w-0">
                      <div className="flex items-center gap-1 flex-wrap">
                        <span className="flex items-center gap-1 text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {appt.time}
                        </span>
                        {isOverlapping && (
                          <span className="inline-flex items-center gap-0.5 text-orange-600 dark:text-orange-400 font-medium" data-testid={`badge-overlap-${appt.id}`}>
                            <AlertCircle className="h-2.5 w-2.5" />
                            <span className="text-[10px]">Overlapping</span>
                          </span>
                        )}
                      </div>
                      {cust ? (
                        <Link href={`/customers/${cust.id}`}>
                          <span className="font-medium hover:underline cursor-pointer block truncate" data-testid={`text-appt-customer-${appt.id}`}>
                            {cust.firstName} {cust.lastName}
                          </span>
                        </Link>
                      ) : (
                        <span className="font-medium">Unknown</span>
                      )}
                      {addressStr && (
                        <p className="text-muted-foreground flex items-start gap-1">
                          <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                          <span>{addressStr}</span>
                        </p>
                      )}
                      {cust?.phone && (
                        <p className="text-muted-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3 shrink-0" />
                          <span>{formatPhone(cust.phone)}</span>
                        </p>
                      )}
                      {pianoStr && (
                        <p className="text-muted-foreground flex items-center gap-1">
                          <Music className="h-3 w-3 shrink-0" />
                          <span>{pianoStr}</span>
                        </p>
                      )}
                      {appt.servicesRequested && (
                        <p className="text-muted-foreground">{appt.servicesRequested}</p>
                      )}
                      {appt.priceEstimate && (
                        <p className="text-muted-foreground flex items-center gap-1">
                          <DollarSign className="h-3 w-3" />{appt.priceEstimate}
                        </p>
                      )}
                    </div>
                    <div className="flex flex-col justify-between items-center shrink-0">
                      <div className="flex flex-col gap-0.5">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5"
                          onClick={() => onOpenEditDialog(appt)}
                          data-testid={`button-edit-trip-appt-${appt.id}`}
                        >
                          <Pencil className="h-3 w-3" />
                        </Button>
                        {!isCompleted && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5"
                            onClick={() => onCompleteAppointment(appt.id)}
                            data-testid={`button-complete-trip-appt-${appt.id}`}
                          >
                            <CheckCircle className="h-3 w-3" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className={`h-5 w-5 ${appt.linkedAppointmentId ? "text-green-600 dark:text-green-400" : "text-blue-600 dark:text-blue-400"}`}
                          onClick={() => onConfirmAppointment(appt, cust, piano)}
                          title={appt.linkedAppointmentId ? "Already confirmed — click to re-download calendar file" : "Confirm appointment & add to calendar"}
                          data-testid={`button-confirm-trip-appt-${appt.id}`}
                        >
                          {appt.linkedAppointmentId
                            ? <CalendarCheck className="h-3 w-3" />
                            : <CalendarPlus className="h-3 w-3" />
                          }
                        </Button>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 text-destructive"
                        onClick={() => onDeleteAppointment(appt.id)}
                        data-testid={`button-delete-trip-appt-${appt.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}

            {drivingTimes && drivingTimes[dayAppts.length] != null && drivingTimes[dayAppts.length] >= 0 && (
              <div className="flex items-center gap-1 px-1 py-0.5 text-[10px] text-muted-foreground">
                <Car className="h-2.5 w-2.5 shrink-0" />
                <span>Driving ({drivingTimes[dayAppts.length]}m) home</span>
                <div className="flex-1 border-t border-dashed border-muted-foreground/25 ml-0.5" />
              </div>
            )}
            {drivingTimes && (
              <div className="flex items-center gap-1.5 px-1 py-0.5">
                <Home className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-[10px] text-muted-foreground">Return home</span>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="p-2 border-t">
        <Button
          variant="outline"
          size="sm"
          className="w-full text-xs"
          onClick={() => onOpenDialog(dateStr)}
          data-testid={`button-add-appointment-${dateStr}`}
        >
          <Plus className="h-3 w-3 mr-1" />
          Add Appointment
        </Button>
      </div>
    </div>
  );
}

export default function SlcSchedule() {
  const { toast } = useToast();
  const [tripName, setTripName] = useState("");
  const [tripStart, setTripStart] = useState("");
  const [tripEnd, setTripEnd] = useState("");
  const [tripNotes, setTripNotes] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDate, setDialogDate] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [apptTime, setApptTime] = useState("8:00 AM");
  const [apptDuration, setApptDuration] = useState("2 hours");
  const [apptServices, setApptServices] = useState("");
  const [apptPrice, setApptPrice] = useState("");
  const [apptNotes, setApptNotes] = useState("");
  const [apptSelectedNames, setApptSelectedNames] = useState<string[]>([]);
  const [addDialogKey, setAddDialogKey] = useState(0);
  const [conflictError, setConflictError] = useState("");
  const [editingAppt, setEditingAppt] = useState<TripAppointment | null>(null);
  const [editTime, setEditTime] = useState("");
  const [editDuration, setEditDuration] = useState("");
  const [editServices, setEditServices] = useState("");
  const [editSelectedNames, setEditSelectedNames] = useState<string[]>([]);
  const [editPrice, setEditPrice] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editConflictError, setEditConflictError] = useState("");

  const { data: trips, isLoading: tripsLoading } = useQuery<Trip[]>({
    queryKey: ["/api/trips"],
  });

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const activeTrip = trips && trips.length > 0 ? trips[0] : null;

  const { data: tripAppointments } = useQuery<TripAppointment[]>({
    queryKey: ["/api/trips", activeTrip?.id, "appointments"],
    enabled: !!activeTrip,
  });

  const { data: allPianos } = useQuery<Piano[]>({
    queryKey: ["/api/pianos"],
  });

  const customerMap = useMemo(
    () => new Map(customers?.map((c) => [c.id, c]) ?? []),
    [customers]
  );

  const pianoMap = useMemo(
    () => new Map(allPianos?.map((p) => [p.id, p]) ?? []),
    [allPianos]
  );

  const customersWithAllInactivePianos = useMemo(() => {
    const inactive = new Set<number>();
    if (!allPianos) return inactive;
    const byCustomer = new Map<number, Piano[]>();
    allPianos.forEach((p) => {
      if (!byCustomer.has(p.customerId)) byCustomer.set(p.customerId, []);
      byCustomer.get(p.customerId)!.push(p);
    });
    byCustomer.forEach((pianosArr, custId) => {
      const hasActive = pianosArr.some((p) => p.isActive !== false);
      if (!hasActive) inactive.add(custId);
    });
    return inactive;
  }, [allPianos]);

  const createTripMutation = useMutation({
    mutationFn: (data: { name: string; startDate: string; endDate: string; notes?: string }) =>
      apiRequest("POST", "/api/trips", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
      toast({ title: "Trip created" });
      setTripName("");
      setTripStart("");
      setTripEnd("");
      setTripNotes("");
    },
    onError: () => {
      toast({ title: "Failed to create trip", variant: "destructive" });
    },
  });

  const deleteTripMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/trips/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
      toast({ title: "Trip deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete trip", variant: "destructive" });
    },
  });

  const createAppointmentMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/trips/${data.tripId}/appointments`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips", activeTrip?.id, "appointments"] });
      toast({ title: "Appointment added" });
      closeDialog();
    },
    onError: () => {
      toast({ title: "Failed to add appointment", variant: "destructive" });
    },
  });

  const completeAppointmentMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("PATCH", `/api/trip-appointments/${id}`, { status: "completed" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips", activeTrip?.id, "appointments"] });
      toast({ title: "Appointment completed" });
    },
  });

  const deleteAppointmentMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/trip-appointments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips", activeTrip?.id, "appointments"] });
      toast({ title: "Appointment deleted" });
    },
  });

  const editAppointmentMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: any }) =>
      apiRequest("PATCH", `/api/trip-appointments/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips", activeTrip?.id, "appointments"] });
      toast({ title: "Appointment updated" });
      setEditingAppt(null);
    },
    onError: () => {
      toast({ title: "Failed to update appointment", variant: "destructive" });
    },
  });

  const confirmAppointmentMutation = useMutation({
    mutationFn: async ({ appt, cust, piano }: { appt: TripAppointment; cust: Customer | undefined; piano: Piano | null | undefined }) => {
      const isTuning = (appt.servicesRequested || "").toLowerCase().includes("tuning");
      const res = await apiRequest("POST", "/api/appointments", {
        customerId: appt.customerId,
        pianoId: appt.pianoId ?? null,
        date: appt.date,
        time: appt.time,
        servicesRequested: appt.servicesRequested,
        priceEstimate: appt.priceEstimate,
        notes: appt.notes,
        isTuning,
        status: "scheduled",
      });
      const newAppt = await res.json();
      await apiRequest("PATCH", `/api/trip-appointments/${appt.id}`, { linkedAppointmentId: newAppt.id });
      return { appt, cust, piano };
    },
    onSuccess: ({ appt, cust, piano }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips", activeTrip?.id, "appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      const icsContent = generateIcs(appt, cust, piano);
      const custName = cust ? `${cust.firstName}_${cust.lastName}`.replace(/\s+/g, "_") : "appointment";
      downloadIcs(icsContent, `${custName}_${appt.date.replace(/\//g, "-")}.ics`);
      toast({ title: "Appointment confirmed and added to calendar" });
    },
    onError: (error: any) => {
      toast({ title: error?.message || "Failed to confirm appointment", variant: "destructive" });
    },
  });

  function handleConfirmAppointment(appt: TripAppointment, cust: Customer | undefined, piano: Piano | null | undefined) {
    if (appt.linkedAppointmentId) {
      const icsContent = generateIcs(appt, cust, piano);
      const custName = cust ? `${cust.firstName}_${cust.lastName}`.replace(/\s+/g, "_") : "appointment";
      downloadIcs(icsContent, `${custName}_${appt.date.replace(/\//g, "-")}.ics`);
      toast({ title: "Already added to appointments — calendar file re-downloaded" });
      return;
    }
    confirmAppointmentMutation.mutate({ appt, cust, piano });
  }

  function openEditDialog(appt: TripAppointment) {
    setEditingAppt(appt);
    setEditTime(roundToSlot(appt.time || "8:00 AM"));
    setEditDuration(roundToDurationSlot(appt.duration || "2 hours"));
    const existingNames = appt.servicesRequested
      ? appt.servicesRequested.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    setEditSelectedNames(existingNames);
    setEditServices(appt.servicesRequested || "");
    setEditPrice(appt.priceEstimate || "");
    setEditNotes(appt.notes || "");
    setEditConflictError("");
  }

  function handleSaveEdit() {
    if (!editingAppt) return;
    const cust = customerMap.get(editingAppt.customerId);
    const custCity = cust?.city || "";
    const existing = getDayExistingAppointments(editingAppt.date)
      .filter((e) => e.time !== (editingAppt.time || ""));
    const result = checkTimeConflict(editTime, editDuration, custCity, existing);
    if (!result.valid) {
      setEditConflictError(result.message || "Time conflict");
    }
    editAppointmentMutation.mutate({
      id: editingAppt.id,
      data: {
        time: editTime,
        duration: editDuration,
        servicesRequested: editServices || undefined,
        priceEstimate: editPrice || undefined,
        notes: editNotes || undefined,
      },
    });
  }

  const dates = activeTrip ? getDatesInRange(activeTrip.startDate, activeTrip.endDate) : [];

  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, TripAppointment[]>();
    tripAppointments?.forEach((a) => {
      const list = map.get(a.date) ?? [];
      list.push(a);
      map.set(a.date, list);
    });
    for (const [key, list] of map) {
      map.set(key, list.sort((a, b) => {
        return parseTimeToMinutes(a.time || "") - parseTimeToMinutes(b.time || "");
      }));
    }
    return map;
  }, [tripAppointments]);

  const totalRevenue = useMemo(() => {
    return tripAppointments?.reduce((sum, a) => sum + parsePrice(a.priceEstimate), 0) ?? 0;
  }, [tripAppointments]);

  function getDayServiceArea(dateStr: string): string {
    const dayAppts = appointmentsByDate.get(dateStr) ?? [];
    if (dayAppts.length === 0) return "";
    const firstAppt = dayAppts[0];
    const cust = customerMap.get(firstAppt.customerId);
    return cust?.city || firstAppt.serviceArea || "";
  }

  function getDayExistingAppointments(dateStr: string): ExistingAppointment[] {
    const dayAppts = appointmentsByDate.get(dateStr) ?? [];
    return dayAppts.map((a) => {
      const cust = customerMap.get(a.customerId);
      return {
        time: a.time,
        duration: a.duration || "2 hours",
        city: cust?.city || a.serviceArea || "",
      };
    });
  }

  function openDialog(dateStr: string) {
    setDialogDate(dateStr);
    setSelectedCustomerId("");
    setCustomerSearch("");
    setApptDuration("2 hours");
    setApptServices("");
    setApptPrice("");
    setApptSelectedNames([]);
    setAddDialogKey((k) => k + 1);
    setApptNotes("");
    setConflictError("");

    const existing = getDayExistingAppointments(dateStr);
    const dayArea = getDayServiceArea(dateStr);
    const nextTime = getNextAvailableTime(dayArea, "2 hours", existing);
    setApptTime(roundToSlot(nextTime));
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
  }

  function handleCustomerSelect(custId: string) {
    setSelectedCustomerId(custId);
    setConflictError("");
  }

  function handleCreateAppointment() {
    if (!activeTrip || !selectedCustomerId) return;
    const cust = customerMap.get(parseInt(selectedCustomerId));
    const custCity = cust?.city || "";

    const existing = getDayExistingAppointments(dialogDate);
    const result = checkTimeConflict(apptTime, apptDuration, custCity, existing);
    if (!result.valid) {
      setConflictError(result.message || "Time conflict");
    }

    createAppointmentMutation.mutate({
      tripId: activeTrip.id,
      customerId: parseInt(selectedCustomerId),
      date: dialogDate,
      time: apptTime,
      duration: apptDuration,
      servicesRequested: apptServices || undefined,
      priceEstimate: apptPrice || undefined,
      notes: apptNotes || undefined,
      serviceArea: custCity || undefined,
    });
  }

  function handleCreateTrip(e: React.FormEvent) {
    e.preventDefault();
    if (!tripName || !tripStart || !tripEnd) return;
    createTripMutation.mutate({
      name: tripName,
      startDate: tripStart,
      endDate: tripEnd,
      notes: tripNotes || undefined,
    });
  }

  const dialogDayArea = getDayServiceArea(dialogDate);
  const dialogNearbyCities = useMemo(() => {
    if (!dialogDayArea) return [];
    return getNearbyCities(dialogDayArea).map((c) => c.toLowerCase());
  }, [dialogDayArea]);

  const { suggested: suggestedCustomers, other: otherCustomers } = useMemo(() => {
    if (!customers) return { suggested: [], other: [] };
    const searchLower = customerSearch.toLowerCase();
    const filtered = customers.filter((c) => {
      if (customersWithAllInactivePianos.has(c.id)) return false;
      if (!searchLower) return true;
      return (
        `${c.firstName} ${c.lastName}`.toLowerCase().includes(searchLower) ||
        c.city?.toLowerCase().includes(searchLower)
      );
    });

    if (!dialogDayArea) return { suggested: [], other: filtered };

    const sugg: Customer[] = [];
    const rest: Customer[] = [];
    for (const c of filtered) {
      const cCity = c.city?.toLowerCase() || "";
      if (cCity && dialogNearbyCities.includes(cCity)) {
        sugg.push(c);
      } else if (cCity && areNearby(c.city || "", dialogDayArea)) {
        sugg.push(c);
      } else {
        rest.push(c);
      }
    }
    sugg.sort((a, b) => {
      if (a.isStarred && !b.isStarred) return -1;
      if (!a.isStarred && b.isStarred) return 1;
      return `${a.lastName}${a.firstName}`.localeCompare(`${b.lastName}${b.firstName}`);
    });
    const overflow = sugg.splice(3);
    rest.unshift(...overflow);
    return { suggested: sugg, other: rest };
  }, [customers, customerSearch, dialogDayArea, dialogNearbyCities, customersWithAllInactivePianos]);

  if (tripsLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-7xl mx-auto">
        <div className="space-y-4">
          <div className="h-8 bg-muted rounded animate-pulse w-48" />
          <div className="h-32 bg-muted rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (!activeTrip) {
    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight" data-testid="text-slc-title">
            SLC Schedule
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Plan your next trip</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Create New Trip
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateTrip} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="trip-name">Trip Name</Label>
                <Input
                  id="trip-name"
                  value={tripName}
                  onChange={(e) => setTripName(e.target.value)}
                  placeholder="e.g., Salt Lake City June Trip"
                  data-testid="input-trip-name"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="trip-start">Start Date (M/D/YY)</Label>
                  <Input
                    id="trip-start"
                    value={tripStart}
                    onChange={(e) => setTripStart(e.target.value)}
                    placeholder="5/8/26"
                    data-testid="input-trip-start"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="trip-end">End Date (M/D/YY)</Label>
                  <Input
                    id="trip-end"
                    value={tripEnd}
                    onChange={(e) => setTripEnd(e.target.value)}
                    placeholder="5/13/26"
                    data-testid="input-trip-end"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="trip-notes">Notes (optional)</Label>
                <Textarea
                  id="trip-notes"
                  value={tripNotes}
                  onChange={(e) => setTripNotes(e.target.value)}
                  placeholder="Any trip notes..."
                  data-testid="input-trip-notes"
                />
              </div>
              <Button
                type="submit"
                disabled={createTripMutation.isPending || !tripName || !tripStart || !tripEnd}
                data-testid="button-create-trip"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Trip
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-full mx-auto space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight" data-testid="text-trip-name">
            {activeTrip.name}
          </h1>
          <p className="text-muted-foreground text-sm mt-1 flex items-center gap-2 flex-wrap">
            <Calendar className="h-3.5 w-3.5" />
            {activeTrip.startDate} — {activeTrip.endDate}
            {activeTrip.notes && <span>· {activeTrip.notes}</span>}
          </p>
        </div>
        <div className="flex items-center gap-3 flex-wrap self-start">
          <div className="flex items-center gap-2 text-sm">
            <DollarSign className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium" data-testid="text-total-revenue">
              ${totalRevenue.toFixed(2)}
            </span>
            <span className="text-muted-foreground">
              · {tripAppointments?.length ?? 0} appts
            </span>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="text-destructive"
            onClick={() => {
              if (confirm("Delete this trip and all its appointments?")) {
                deleteTripMutation.mutate(activeTrip.id);
              }
            }}
            disabled={deleteTripMutation.isPending}
            data-testid="button-delete-trip"
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Delete Trip
          </Button>
        </div>
      </div>

      <div className="pb-4 overflow-x-auto">
        <div className="flex flex-nowrap gap-3" style={{ minWidth: "max-content" }}>
          {dates.map((dateStr) => {
            const dayDate = parseDateStr(dateStr);
            const dayAppts = appointmentsByDate.get(dateStr) ?? [];
            const dayArea = getDayServiceArea(dateStr);
            const dayRevenue = dayAppts.reduce((s, a) => s + parsePrice(a.priceEstimate), 0);
            return (
              <DayScheduleColumn
                key={dateStr}
                dateStr={dateStr}
                dayDate={dayDate}
                dayAppts={dayAppts}
                dayArea={dayArea}
                dayRevenue={dayRevenue}
                customerMap={customerMap}
                pianoMap={pianoMap}
                onOpenDialog={openDialog}
                onOpenEditDialog={openEditDialog}
                onCompleteAppointment={(id) => completeAppointmentMutation.mutate(id)}
                onDeleteAppointment={(id) => { if (confirm("Delete?")) deleteAppointmentMutation.mutate(id); }}
                onConfirmAppointment={handleConfirmAppointment}
              />
            );
          })}
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Add Appointment — {dialogDate}
            </DialogTitle>
          </DialogHeader>

          {dialogDayArea && (
            <div className="flex items-center gap-2 p-2 rounded-md bg-muted/50 border">
              <MapPin className="h-4 w-4 text-primary" />
              <span className="text-sm font-medium">Service Area: {getClusterName(dialogDayArea)}</span>
            </div>
          )}

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Customer</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Search customers..."
                  className="pl-9"
                  data-testid="input-customer-search"
                />
              </div>
              <div className="border rounded-md max-h-[200px] overflow-y-auto" data-testid="customer-list">
                {suggestedCustomers.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted/50 sticky top-0">
                      Suggested — nearby
                    </div>
                    {suggestedCustomers.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => handleCustomerSelect(String(c.id))}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center justify-between gap-2 ${selectedCustomerId === String(c.id) ? "bg-accent" : ""}`}
                        data-testid={`customer-option-${c.id}`}
                      >
                        <span className="flex items-center gap-2">
                          {c.isStarred
                            ? <Star className="h-3 w-3 fill-yellow-400 text-yellow-400 shrink-0" />
                            : <User className="h-3 w-3 text-muted-foreground shrink-0" />
                          }
                          {c.firstName} {c.lastName}
                        </span>
                        {c.city && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {c.city}
                          </span>
                        )}
                      </button>
                    ))}
                  </>
                )}
                {otherCustomers.length > 0 && (
                  <>
                    <div className="px-3 py-1.5 text-xs font-medium text-muted-foreground bg-muted/50 sticky top-0">
                      {suggestedCustomers.length > 0 ? "Other clients" : "All clients"}
                    </div>
                    {otherCustomers.map((c) => (
                      <button
                        key={c.id}
                        onClick={() => handleCustomerSelect(String(c.id))}
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-center justify-between gap-2 ${selectedCustomerId === String(c.id) ? "bg-accent" : ""}`}
                        data-testid={`customer-option-${c.id}`}
                      >
                        <span className="flex items-center gap-2">
                          <User className="h-3 w-3 text-muted-foreground" />
                          {c.firstName} {c.lastName}
                        </span>
                        {c.city && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" />
                            {c.city}
                          </span>
                        )}
                      </button>
                    ))}
                  </>
                )}
                {suggestedCustomers.length === 0 && otherCustomers.length === 0 && (
                  <p className="px-3 py-4 text-sm text-muted-foreground text-center">No customers found</p>
                )}
              </div>
              {selectedCustomerId && (
                <div className="text-sm text-primary flex items-center gap-1">
                  <CheckCircle className="h-3 w-3" />
                  {(() => {
                    const c = customerMap.get(parseInt(selectedCustomerId));
                    return c ? `${c.firstName} ${c.lastName}${c.city ? ` — ${c.city}` : ""}` : "";
                  })()}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="appt-time">Time</Label>
                <Select
                  value={apptTime}
                  onValueChange={(v) => { setApptTime(v); setConflictError(""); }}
                >
                  <SelectTrigger id="appt-time" data-testid="input-appt-time">
                    <SelectValue placeholder="Select time" />
                  </SelectTrigger>
                  <SelectContent>
                    {TIME_SLOTS.map((slot) => (
                      <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="appt-duration">Duration</Label>
                <Select value={apptDuration} onValueChange={(v) => { setApptDuration(v); setConflictError(""); }}>
                  <SelectTrigger id="appt-duration" data-testid="input-appt-duration">
                    <SelectValue placeholder="Select duration" />
                  </SelectTrigger>
                  <SelectContent>
                    {DURATION_SLOTS.map((slot) => (
                      <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {conflictError && (
              <div className="flex items-start gap-2 p-2 rounded-md bg-orange-50 border border-orange-200 text-sm text-orange-700 dark:bg-orange-950/20 dark:border-orange-800 dark:text-orange-400" data-testid="text-conflict-error">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{conflictError} — saved anyway.</span>
              </div>
            )}

            <div className="space-y-2">
              <Label>Services</Label>
              <ServicePicker
                key={addDialogKey}
                value={apptSelectedNames}
                onChange={(names, _isTuning, totalCost) => {
                  setApptSelectedNames(names);
                  setApptServices(names.join(", "));
                  setApptPrice(totalCost > 0 ? `$${totalCost.toFixed(0)}` : "");
                }}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="appt-price">Price Estimate</Label>
              <Input
                id="appt-price"
                value={apptPrice}
                onChange={(e) => setApptPrice(e.target.value)}
                placeholder="$150"
                data-testid="input-appt-price"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="appt-notes">Notes</Label>
              <Textarea
                id="appt-notes"
                value={apptNotes}
                onChange={(e) => setApptNotes(e.target.value)}
                placeholder="Any notes..."
                data-testid="input-appt-notes"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={closeDialog} data-testid="button-cancel-appointment">
                Cancel
              </Button>
              <Button
                onClick={handleCreateAppointment}
                disabled={!selectedCustomerId || createAppointmentMutation.isPending}
                data-testid="button-save-appointment"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Appointment
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editingAppt} onOpenChange={(open) => { if (!open) setEditingAppt(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Pencil className="h-5 w-5" />
              Edit Appointment
            </DialogTitle>
          </DialogHeader>
          {editingAppt && (
            <div className="space-y-4">
              <div className="text-sm text-muted-foreground">
                {(() => {
                  const c = customerMap.get(editingAppt.customerId);
                  return c ? `${c.firstName} ${c.lastName}` : "Unknown client";
                })()}
                {" · "}{editingAppt.date}
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="edit-time">Time</Label>
                  <Select
                    value={editTime}
                    onValueChange={(v) => { setEditTime(v); setEditConflictError(""); }}
                  >
                    <SelectTrigger id="edit-time" data-testid="input-edit-time">
                      <SelectValue placeholder="Select time" />
                    </SelectTrigger>
                    <SelectContent>
                      {TIME_SLOTS.map((slot) => (
                        <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="edit-duration">Duration</Label>
                  <Select value={editDuration} onValueChange={(v) => { setEditDuration(v); setEditConflictError(""); }}>
                    <SelectTrigger id="edit-duration" data-testid="input-edit-duration">
                      <SelectValue placeholder="Select duration" />
                    </SelectTrigger>
                    <SelectContent>
                      {DURATION_SLOTS.map((slot) => (
                        <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {editConflictError && (
                <div className="flex items-start gap-2 p-2 rounded-md bg-orange-50 border border-orange-200 text-sm text-orange-700 dark:bg-orange-950/20 dark:border-orange-800 dark:text-orange-400" data-testid="text-edit-conflict-error">
                  <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                  <span>{editConflictError} — saved anyway.</span>
                </div>
              )}

              <div className="space-y-2">
                <Label>Services</Label>
                <ServicePicker
                  value={editSelectedNames}
                  onChange={(names, _isTuning, totalCost) => {
                    setEditSelectedNames(names);
                    setEditServices(names.join(", "));
                    setEditPrice(totalCost > 0 ? `$${totalCost.toFixed(0)}` : "");
                  }}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-price">Price Estimate</Label>
                <Input
                  id="edit-price"
                  value={editPrice}
                  onChange={(e) => setEditPrice(e.target.value)}
                  placeholder="$180"
                  data-testid="input-edit-price"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-notes">Notes</Label>
                <Textarea
                  id="edit-notes"
                  value={editNotes}
                  onChange={(e) => setEditNotes(e.target.value)}
                  placeholder="Any notes..."
                  data-testid="input-edit-notes"
                />
              </div>
              <div className="flex items-center justify-end gap-2">
                <Button variant="outline" onClick={() => setEditingAppt(null)} data-testid="button-cancel-edit">
                  Cancel
                </Button>
                <Button
                  onClick={handleSaveEdit}
                  disabled={editAppointmentMutation.isPending}
                  data-testid="button-save-edit"
                >
                  Save Changes
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
