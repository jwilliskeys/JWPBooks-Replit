import { useState, useMemo, useEffect, useCallback } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Plus,
  Trash2,
  MapPin,
  Clock,
  DollarSign,
  Calendar,
  CheckCircle,
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
  FileText,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  Check,
} from "lucide-react";
import { Link } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatPhone } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { ServicePicker } from "@/components/service-picker";
import {
  TimeStepperWidget,
  DurationStepperWidget,
  DEFAULT_TIME_MINUTES,
  DEFAULT_DURATION_MINUTES,
  formatTimeMinutes,
  formatDurationMinutes,
  parseTimeString,
  parseDurationString,
} from "@/components/time-stepper";
import type { Trip, TripAppointment, Customer, Piano, Invoice } from "@shared/schema";
import {
  getNearbyCities,
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
    "PRODID:-//PianoTech//Trip Planner//EN",
    "BEGIN:VTIMEZONE",
    "TZID:America/Denver",
    "BEGIN:DAYLIGHT",
    "DTSTART:20070311T020000",
    "RRULE:FREQ=YEARLY;BYDAY=2SU;BYMONTH=3",
    "TZOFFSETFROM:-0700",
    "TZOFFSETTO:-0600",
    "TZNAME:MDT",
    "END:DAYLIGHT",
    "BEGIN:STANDARD",
    "DTSTART:20071104T020000",
    "RRULE:FREQ=YEARLY;BYDAY=1SU;BYMONTH=11",
    "TZOFFSETFROM:-0600",
    "TZOFFSETTO:-0700",
    "TZNAME:MST",
    "END:STANDARD",
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

function isTripActive(trip: Trip): boolean {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const start = parseDateStr(trip.startDate);
  const end = parseDateStr(trip.endDate);
  return !isNaN(start.getTime()) && !isNaN(end.getTime()) && start <= today && today <= end;
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
  onCompleteAppointment: (appt: TripAppointment) => void;
  onDeleteAppointment: (id: number) => void;
  onConfirmAppointment: (appt: TripAppointment, cust: Customer | undefined, piano: Piano | null | undefined) => void;
  onMileageReported?: (dateStr: string, miles: number | null) => void;
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
  onMileageReported,
}: DayScheduleColumnProps) {
  const addresses = useMemo(() => {
    if (dayAppts.length === 0) return [];
    const apptAddresses = dayAppts.map(a => buildCustomerAddress(customerMap.get(a.customerId)));
    return [HOME_ADDRESS, ...apptAddresses, HOME_ADDRESS];
  }, [dayAppts, customerMap]);

  const { data: drivingData } = useQuery<{ durations: number[] | null; distances: number[] | null; error?: string }>({
    queryKey: ["/api/driving-times", addresses.join("|")],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/driving-times", { addresses });
      return res.json();
    },
    enabled: addresses.length >= 2,
    staleTime: 15 * 60 * 1000,
  });

  const drivingTimes = drivingData?.durations ?? null;
  const drivingDistances = drivingData?.distances ?? null;

  const totalMileage = useMemo(() => {
    if (!drivingDistances || drivingDistances.length === 0) return null;
    const validDistances = drivingDistances.filter(d => d >= 0);
    if (validDistances.length === 0) return null;
    return Math.round(validDistances.reduce((sum, d) => sum + d, 0) * 10) / 10;
  }, [drivingDistances]);

  const isMileagePartial = useMemo(() => {
    if (!drivingDistances || drivingDistances.length === 0) return false;
    return drivingDistances.some(d => d < 0);
  }, [drivingDistances]);

  useEffect(() => {
    if (onMileageReported) {
      onMileageReported(dateStr, totalMileage);
    }
  }, [dateStr, totalMileage, onMileageReported]);

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
              const driveMiles = drivingDistances ? drivingDistances[i] : null;

              return (
                <div key={appt.id}>
                  {driveMinutes != null && driveMinutes >= 0 && (
                    <div className="flex items-center gap-1 px-1 py-0.5 text-[10px] text-muted-foreground">
                      <Car className="h-2.5 w-2.5 shrink-0" />
                      <span>Driving ({driveMinutes}m{driveMiles != null && driveMiles >= 0 ? `, ${driveMiles}mi` : ""})</span>
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
                            onClick={() => onCompleteAppointment(appt)}
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
                <span>Driving ({drivingTimes[dayAppts.length]}m{drivingDistances && drivingDistances[dayAppts.length] != null && drivingDistances[dayAppts.length] >= 0 ? `, ${drivingDistances[dayAppts.length]}mi` : ""}) home</span>
                <div className="flex-1 border-t border-dashed border-muted-foreground/25 ml-0.5" />
              </div>
            )}
            {drivingTimes && (
              <div className="flex items-center gap-1.5 px-1 py-0.5">
                <Home className="h-3 w-3 text-muted-foreground shrink-0" />
                <span className="text-[10px] text-muted-foreground">Return home</span>
              </div>
            )}
            {totalMileage != null && (
              <div className="flex items-center justify-center px-1 py-1 mt-1 border-t">
                <span className="text-[10px] font-medium text-muted-foreground">{isMileagePartial ? "~" : ""}{totalMileage} mi total</span>
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


interface TripPanelProps {
  trip: Trip;
  customerMap: Map<number, Customer>;
  pianoMap: Map<number, Piano>;
  isExpanded: boolean;
  onToggle: () => void;
  onOpenAddDialog: (dateStr: string, tripId: number, existingAppts: ExistingAppointment[], dayArea: string) => void;
  onOpenEditDialog: (appt: TripAppointment, tripId: number, dayExistingAppts: ExistingAppointment[]) => void;
  onCompleteAppointment: (appt: TripAppointment, tripId: number) => void;
  onDeleteAppointment: (id: number, tripId: number) => void;
  onConfirmAppointment: (appt: TripAppointment, cust: Customer | undefined, piano: Piano | null | undefined, tripId: number) => void;
  onDeleteTrip: (id: number) => void;
  deleteIsPending: boolean;
}

function TripPanel({
  trip,
  customerMap,
  pianoMap,
  isExpanded,
  onToggle,
  onOpenAddDialog,
  onOpenEditDialog,
  onCompleteAppointment,
  onDeleteAppointment,
  onConfirmAppointment,
  onDeleteTrip,
  deleteIsPending,
}: TripPanelProps) {
  const { data: tripAppointments } = useQuery<TripAppointment[]>({
    queryKey: ["/api/trips", trip.id, "appointments"],
  });

  const dates = useMemo(() => getDatesInRange(trip.startDate, trip.endDate), [trip.startDate, trip.endDate]);

  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, TripAppointment[]>();
    tripAppointments?.forEach((a) => {
      const list = map.get(a.date) ?? [];
      list.push(a);
      map.set(a.date, list);
    });
    Array.from(map.entries()).forEach(([key, list]) => {
      map.set(key, list.sort((a: TripAppointment, b: TripAppointment) => parseTimeToMinutes(a.time || "") - parseTimeToMinutes(b.time || "")));
    });
    return map;
  }, [tripAppointments]);

  const totalRevenue = useMemo(
    () => tripAppointments?.reduce((sum, a) => sum + parsePrice(a.priceEstimate), 0) ?? 0,
    [tripAppointments]
  );

  function getDayServiceArea(dateStr: string): string {
    const dayAppts = appointmentsByDate.get(dateStr) ?? [];
    if (dayAppts.length === 0) return "";
    const firstAppt = dayAppts[0];
    const cust = customerMap.get(firstAppt.customerId);
    return cust?.city || firstAppt.serviceArea || "";
  }

  function getDayExistingAppointments(dateStr: string): ExistingAppointment[] {
    return (appointmentsByDate.get(dateStr) ?? []).map((a) => {
      const cust = customerMap.get(a.customerId);
      return { time: a.time, duration: a.duration || "2 hours", city: cust?.city || a.serviceArea || "" };
    });
  }

  function handleOpenDialog(dateStr: string) {
    const existing = getDayExistingAppointments(dateStr);
    const dayArea = getDayServiceArea(dateStr);
    onOpenAddDialog(dateStr, trip.id, existing, dayArea);
  }

  const apptCount = tripAppointments?.length ?? 0;

  const [dayMileages, setDayMileages] = useState<Map<string, number>>(new Map());

  const handleMileageReported = useCallback((dateStr: string, miles: number | null) => {
    setDayMileages(prev => {
      const next = new Map(prev);
      if (miles != null) {
        next.set(dateStr, miles);
      } else {
        next.delete(dateStr);
      }
      return next;
    });
  }, []);

  useEffect(() => {
    const dateSet = new Set(dates);
    setDayMileages(prev => {
      const stale = Array.from(prev.keys()).filter(k => !dateSet.has(k));
      if (stale.length === 0) return prev;
      const next = new Map(prev);
      stale.forEach(k => next.delete(k));
      return next;
    });
  }, [dates]);

  const tripTotalMileage = useMemo(() => {
    const values = Array.from(dayMileages.values());
    if (values.length === 0) return null;
    return Math.round(values.reduce((sum, m) => sum + m, 0) * 10) / 10;
  }, [dayMileages]);

  return (
    <Collapsible open={isExpanded} onOpenChange={onToggle}>
      <div className="border rounded-lg bg-card overflow-hidden">
        <CollapsibleTrigger asChild>
          <div
            className="flex items-center justify-between px-4 py-3 cursor-pointer hover:bg-muted/30 transition-colors select-none"
            data-testid={`trip-header-${trip.id}`}
          >
            <div className="flex items-center gap-3 min-w-0">
              {isExpanded
                ? <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                : <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              }
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate" data-testid={`text-trip-name-${trip.id}`}>
                  {trip.name}
                </div>
                <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap mt-0.5">
                  <span className="flex items-center gap-1">
                    <Calendar className="h-3 w-3" />
                    {trip.startDate} — {trip.endDate}
                  </span>
                  <span>· {dates.length} day{dates.length !== 1 ? "s" : ""}</span>
                  <span>·</span>
                  <span>{apptCount} appt{apptCount !== 1 ? "s" : ""}</span>
                  <span>·</span>
                  <span className="flex items-center gap-1">
                    <DollarSign className="h-3 w-3" />
                    ${totalRevenue.toFixed(0)}
                  </span>
                  {tripTotalMileage != null && tripTotalMileage > 0 && (
                    <>
                      <span>·</span>
                      <span className="flex items-center gap-1" data-testid={`text-trip-miles-${trip.id}`}>
                        <Car className="h-3 w-3" />
                        {tripTotalMileage} mi
                      </span>
                    </>
                  )}
                </div>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive shrink-0 ml-2"
              onClick={(e) => {
                e.stopPropagation();
                if (confirm("Delete this trip and all its appointments?")) {
                  onDeleteTrip(trip.id);
                }
              }}
              disabled={deleteIsPending}
              data-testid={`button-delete-trip-${trip.id}`}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="border-t p-3 pb-4 overflow-x-auto">
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
                    onOpenDialog={handleOpenDialog}
                    onOpenEditDialog={(appt) => {
                      const dayAppts = appointmentsByDate.get(appt.date) ?? [];
                      const dayExisting: ExistingAppointment[] = dayAppts.filter(a => a.id !== appt.id).map(a => ({
                        time: a.time,
                        duration: a.duration || "2 hours",
                        city: customerMap.get(a.customerId)?.city || a.serviceArea || "",
                      }));
                      onOpenEditDialog(appt, trip.id, dayExisting);
                    }}
                    onCompleteAppointment={(appt) => onCompleteAppointment(appt, trip.id)}
                    onDeleteAppointment={(id) => {
                      if (confirm("Delete this appointment?")) onDeleteAppointment(id, trip.id);
                    }}
                    onConfirmAppointment={(appt, cust, piano) => onConfirmAppointment(appt, cust, piano, trip.id)}
                    onMileageReported={handleMileageReported}
                  />
                );
              })}
            </div>
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}


const PAYMENT_METHODS = ["Zelle", "Venmo", "CashApp", "PayPal", "Stripe", "Cash", "Check", "Other"];

function invoiceStatusBadge(status: string | null | undefined) {
  switch (status) {
    case "paid":
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 border-0 text-xs">Paid</Badge>;
    case "open":
      return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 border-0 text-xs">Open</Badge>;
    case "cancelled":
      return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-0 text-xs">Cancelled</Badge>;
    default:
      return <Badge variant="secondary" className="text-xs">Draft</Badge>;
  }
}


export default function SlcSchedule() {
  const { toast } = useToast();

  // Trip creation dialog
  const [createTripDialogOpen, setCreateTripDialogOpen] = useState(false);
  const [tripName, setTripName] = useState("");
  const [tripStart, setTripStart] = useState("");
  const [tripEnd, setTripEnd] = useState("");
  const [tripNotes, setTripNotes] = useState("");

  // Collapsible expand state (trip IDs)
  const [expandedTripIds, setExpandedTripIds] = useState<Set<number>>(new Set());
  const [expandedInitialized, setExpandedInitialized] = useState(false);

  // Add appointment dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDate, setDialogDate] = useState("");
  const [dialogTripId, setDialogTripId] = useState<number | null>(null);
  const [dialogExistingAppts, setDialogExistingAppts] = useState<ExistingAppointment[]>([]);
  const [dialogDayArea, setDialogDayArea] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [selectedPianoId, setSelectedPianoId] = useState<string>("none");
  const [apptTimeMinutes, setApptTimeMinutes] = useState(DEFAULT_TIME_MINUTES);
  const [apptDurationMinutes, setApptDurationMinutes] = useState(DEFAULT_DURATION_MINUTES);
  const [apptServices, setApptServices] = useState("");
  const [apptPrice, setApptPrice] = useState("");
  const [apptNotes, setApptNotes] = useState("");
  const [apptSelectedNames, setApptSelectedNames] = useState<string[]>([]);
  const [addDialogKey, setAddDialogKey] = useState(0);
  const [conflictError, setConflictError] = useState("");
  const [pianoCbOpen, setPianoCbOpen] = useState(false);

  // Edit appointment dialog
  const [editingAppt, setEditingAppt] = useState<TripAppointment | null>(null);
  const [editingTripId, setEditingTripId] = useState<number | null>(null);
  const [editDayExistingAppts, setEditDayExistingAppts] = useState<ExistingAppointment[]>([]);
  const [editTime, setEditTime] = useState("");
  const [editDuration, setEditDuration] = useState("");
  const [editServices, setEditServices] = useState("");
  const [editSelectedNames, setEditSelectedNames] = useState<string[]>([]);
  const [editPrice, setEditPrice] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editConflictError, setEditConflictError] = useState("");

  // Complete appointment dialog
  const [completingAppt, setCompletingAppt] = useState<TripAppointment | null>(null);
  const [completingTripId, setCompletingTripId] = useState<number | null>(null);
  const [completeDialogOpen, setCompleteDialogOpen] = useState(false);
  const [completePaymentMethod, setCompletePaymentMethod] = useState("");
  const [completePaymentAmount, setCompletePaymentAmount] = useState("");
  const [localCreatedInvoice, setLocalCreatedInvoice] = useState<Invoice | null>(null);

  // Data queries
  const { data: trips, isLoading: tripsLoading } = useQuery<Trip[]>({
    queryKey: ["/api/trips"],
  });

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: allPianos } = useQuery<Piano[]>({
    queryKey: ["/api/pianos"],
  });

  const { data: allInvoices } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
    enabled: completeDialogOpen,
  });

  // Sort trips chronologically
  const sortedTrips = useMemo(() => {
    if (!trips) return [];
    return [...trips].sort((a, b) => {
      const da = parseDateStr(a.startDate);
      const db = parseDateStr(b.startDate);
      return da.getTime() - db.getTime();
    });
  }, [trips]);

  // Auto-expand trips that contain today on first load; otherwise start collapsed
  useEffect(() => {
    if (!sortedTrips.length || expandedInitialized) return;
    const active = sortedTrips.filter(isTripActive);
    if (active.length > 0) {
      setExpandedTripIds(new Set(active.map(t => t.id)));
    }
    setExpandedInitialized(true);
  }, [sortedTrips, expandedInitialized]);

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

  // Pianos for the selected customer — fetched per-customer when dialog is open
  const { data: selectedCustomerPianos = [] } = useQuery<Piano[]>({
    queryKey: ["/api/customers", selectedCustomerId, "pianos"],
    enabled: !!selectedCustomerId && dialogOpen,
  });

  // Invoice for completing appointment
  const completingLinkedInvoice: Invoice | null = localCreatedInvoice
    ?? (allInvoices && completingAppt?.linkedAppointmentId
        ? (allInvoices.find(inv => inv.appointmentId === completingAppt.linkedAppointmentId) ?? null)
        : null);


  const createTripMutation = useMutation({
    mutationFn: (data: { name: string; startDate: string; endDate: string; notes?: string }) =>
      apiRequest("POST", "/api/trips", data),
    onSuccess: async (res) => {
      const newTrip: Trip = await res.json();
      await queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
      toast({ title: "Trip created" });
      setTripName("");
      setTripStart("");
      setTripEnd("");
      setTripNotes("");
      setCreateTripDialogOpen(false);
      setExpandedTripIds(prev => { const s = new Set(Array.from(prev)); s.add(newTrip.id); return s; });
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
    onSuccess: (_res, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips", variables.tripId, "appointments"] });
      toast({ title: "Appointment added" });
      closeAddDialog();
    },
    onError: () => {
      toast({ title: "Failed to add appointment", variant: "destructive" });
    },
  });

  const deleteAppointmentMutation = useMutation({
    mutationFn: ({ id }: { id: number; tripId: number }) =>
      apiRequest("DELETE", `/api/trip-appointments/${id}`),
    onSuccess: (_res, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips", variables.tripId, "appointments"] });
      toast({ title: "Appointment deleted" });
    },
  });

  const editAppointmentMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; tripId: number; data: any }) =>
      apiRequest("PATCH", `/api/trip-appointments/${id}`, data),
    onSuccess: (_res, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips", variables.tripId, "appointments"] });
      toast({ title: "Appointment updated" });
      setEditingAppt(null);
      setEditingTripId(null);
    },
    onError: () => {
      toast({ title: "Failed to update appointment", variant: "destructive" });
    },
  });

  const completeAppointmentMutation = useMutation({
    mutationFn: ({ id }: { id: number; tripId: number }) =>
      apiRequest("PATCH", `/api/trip-appointments/${id}`, { status: "completed" }),
    onSuccess: async (_res, variables) => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips", variables.tripId, "appointments"] });

      let invoiceUpdateFailed = false;
      if (completePaymentMethod && completePaymentMethod !== "none" && completingLinkedInvoice && completingLinkedInvoice.status !== "paid") {
        try {
          const paidAmount = completePaymentAmount || completingLinkedInvoice.total || "$0.00";
          const existingNotes = completingLinkedInvoice.notes ? `${completingLinkedInvoice.notes}\n` : "";
          await apiRequest("PATCH", `/api/invoices/${completingLinkedInvoice.id}`, {
            status: "paid",
            paidAmount,
            paymentMethod: completePaymentMethod,
            notes: `${existingNotes}Paid via ${completePaymentMethod}`,
          });
          queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
        } catch {
          invoiceUpdateFailed = true;
        }
      }

      toast({
        title: invoiceUpdateFailed
          ? "Appointment completed — invoice could not be updated"
          : "Appointment completed",
        variant: invoiceUpdateFailed ? "destructive" : "default",
      });
      setCompleteDialogOpen(false);
      setCompletingAppt(null);
      setCompletingTripId(null);
      setCompletePaymentMethod("");
      setCompletePaymentAmount("");
      setLocalCreatedInvoice(null);
    },
  });

  const createTripInvoiceMutation = useMutation({
    mutationFn: async () => {
      if (!completingAppt) throw new Error("No appointment selected");
      const cust = customerMap.get(completingAppt.customerId);
      const today = new Date();
      const mdyy = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear() % 100}`;
      const invoiceDate = mdyy(today);
      const due = new Date(today);
      due.setDate(due.getDate() + 30);
      const dueDate = mdyy(due);

      const numRes = await fetch("/api/invoices/next-number");
      const numData = await numRes.json();
      const invoiceNumber = String(numData.nextNumber ?? "1");

      const customerName = cust ? `${cust.firstName} ${cust.lastName}` : "";
      const rawPrice = parseFloat(completingAppt.priceEstimate?.replace(/[^0-9.]/g, "") || "0") || 0;
      const priceStr = `$${rawPrice.toFixed(2)}`;
      const lineItems = completingAppt.servicesRequested
        ? JSON.stringify([{ description: completingAppt.servicesRequested, quantity: 1, unitPrice: rawPrice }])
        : JSON.stringify([]);

      const res = await apiRequest("POST", "/api/invoices", {
        customerId: completingAppt.customerId,
        appointmentId: completingAppt.linkedAppointmentId ?? null,
        pianoId: completingAppt.pianoId ?? null,
        invoiceDate,
        dueDate,
        invoiceNumber,
        status: "draft",
        lineItems,
        subtotal: priceStr,
        total: priceStr,
        customerName,
      });
      return res.json();
    },
    onSuccess: (invoice: Invoice) => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      setLocalCreatedInvoice(invoice);
      toast({ title: `Invoice #${invoice.invoiceNumber} created` });
    },
    onError: () => toast({ title: "Failed to create invoice", variant: "destructive" }),
  });

  const confirmAppointmentMutation = useMutation({
    mutationFn: async ({ appt, cust, piano, tripId }: { appt: TripAppointment; cust: Customer | undefined; piano: Piano | null | undefined; tripId: number }) => {
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
      return { appt, cust, piano, tripId };
    },
    onSuccess: ({ appt, cust, piano, tripId }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips", tripId, "appointments"] });
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


  function toggleTrip(tripId: number) {
    setExpandedTripIds(prev => {
      const next = new Set(prev);
      if (next.has(tripId)) next.delete(tripId);
      else next.add(tripId);
      return next;
    });
  }

  function openAddDialog(dateStr: string, tripId: number, existingAppts: ExistingAppointment[], dayArea: string) {
    setDialogDate(dateStr);
    setDialogTripId(tripId);
    setDialogExistingAppts(existingAppts);
    setDialogDayArea(dayArea);
    setSelectedCustomerId("");
    setSelectedPianoId("none");
    setCustomerSearch("");
    setApptServices("");
    setApptPrice("");
    setApptSelectedNames([]);
    setAddDialogKey((k) => k + 1);
    setApptNotes("");
    setConflictError("");

    // Smart default time
    const nextTime = getNextAvailableTime(dayArea, formatDurationMinutes(DEFAULT_DURATION_MINUTES), existingAppts);
    const nextMins = parseTimeString(nextTime);
    setApptTimeMinutes(nextMins > 0 ? nextMins : DEFAULT_TIME_MINUTES);
    setApptDurationMinutes(DEFAULT_DURATION_MINUTES);
    setDialogOpen(true);
  }

  function closeAddDialog() {
    setDialogOpen(false);
  }

  function handleCustomerSelect(custId: string) {
    setSelectedCustomerId(custId);
    setSelectedPianoId("none");
    setConflictError("");
  }

  function handleCreateAppointment() {
    if (!dialogTripId || !selectedCustomerId) return;
    const cust = customerMap.get(parseInt(selectedCustomerId));
    const custCity = cust?.city || "";
    const timeStr = formatTimeMinutes(apptTimeMinutes);
    const durationStr = formatDurationMinutes(apptDurationMinutes);

    const result = checkTimeConflict(timeStr, durationStr, custCity, dialogExistingAppts);
    if (!result.valid) {
      setConflictError(result.message || "Time conflict");
    }

    createAppointmentMutation.mutate({
      tripId: dialogTripId,
      customerId: parseInt(selectedCustomerId),
      pianoId: selectedPianoId !== "none" ? parseInt(selectedPianoId) : undefined,
      date: dialogDate,
      time: timeStr,
      duration: durationStr,
      servicesRequested: apptServices || undefined,
      priceEstimate: apptPrice || undefined,
      notes: apptNotes || undefined,
      serviceArea: custCity || undefined,
    });
  }

  function openEditDialog(appt: TripAppointment, tripId: number, dayExistingAppts: ExistingAppointment[]) {
    setEditingAppt(appt);
    setEditingTripId(tripId);
    setEditDayExistingAppts(dayExistingAppts);
    const timeMins = parseTimeString(appt.time || "8:00 AM");
    setEditTime(formatTimeMinutes(timeMins > 0 ? timeMins : DEFAULT_TIME_MINUTES));
    const durMins = parseDurationString(appt.duration || "2 hours");
    setEditDuration(formatDurationMinutes(durMins > 0 ? durMins : DEFAULT_DURATION_MINUTES));
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
    if (!editingAppt || !editingTripId) return;
    const cust = customerMap.get(editingAppt.customerId);
    const custCity = cust?.city || "";
    const result = checkTimeConflict(editTime, editDuration, custCity, editDayExistingAppts);
    if (!result.valid) {
      setEditConflictError(result.message || "Time conflict");
    }
    editAppointmentMutation.mutate({
      id: editingAppt.id,
      tripId: editingTripId,
      data: {
        time: editTime,
        duration: editDuration,
        servicesRequested: editServices || undefined,
        priceEstimate: editPrice || undefined,
        notes: editNotes || undefined,
      },
    });
  }

  function handleCompleteAppointment(appt: TripAppointment, tripId: number) {
    setCompletingAppt(appt);
    setCompletingTripId(tripId);
    setCompletePaymentMethod("");
    setCompletePaymentAmount("");
    setLocalCreatedInvoice(null);
    setCompleteDialogOpen(true);
  }

  function handleConfirmAppointment(appt: TripAppointment, cust: Customer | undefined, piano: Piano | null | undefined, tripId: number) {
    if (appt.linkedAppointmentId) {
      const icsContent = generateIcs(appt, cust, piano);
      const custName = cust ? `${cust.firstName}_${cust.lastName}`.replace(/\s+/g, "_") : "appointment";
      downloadIcs(icsContent, `${custName}_${appt.date.replace(/\//g, "-")}.ics`);
      toast({ title: "Already added to appointments — calendar file re-downloaded" });
      return;
    }
    confirmAppointmentMutation.mutate({ appt, cust, piano, tripId });
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

  // Customer filter for add dialog
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

  return (
    <div className="p-4 sm:p-6 max-w-full mx-auto space-y-4">

      {/* Page header */}
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight" data-testid="text-trip-planner-title">
            Trip Planner
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">Plan and manage your service trips</p>
        </div>
        <Button
          onClick={() => setCreateTripDialogOpen(true)}
          data-testid="button-add-new-trip"
        >
          <Plus className="h-4 w-4 mr-2" />
          Add New Trip
        </Button>
      </div>

      {/* Trip list */}
      {sortedTrips.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Calendar className="h-10 w-10 mx-auto mb-3 opacity-40" />
          <p className="font-medium">No trips yet</p>
          <p className="text-sm mt-1">Click "Add New Trip" to get started</p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedTrips.map((trip) => (
            <TripPanel
              key={trip.id}
              trip={trip}
              customerMap={customerMap}
              pianoMap={pianoMap}
              isExpanded={expandedTripIds.has(trip.id)}
              onToggle={() => toggleTrip(trip.id)}
              onOpenAddDialog={openAddDialog}
              onOpenEditDialog={openEditDialog}
              onCompleteAppointment={handleCompleteAppointment}
              onDeleteAppointment={(id, tripId) => deleteAppointmentMutation.mutate({ id, tripId })}
              onConfirmAppointment={handleConfirmAppointment}
              onDeleteTrip={(id) => deleteTripMutation.mutate(id)}
              deleteIsPending={deleteTripMutation.isPending}
            />
          ))}
        </div>
      )}

      {/* ── Create Trip Dialog ──────────────────────────────────────────────── */}
      <Dialog open={createTripDialogOpen} onOpenChange={(open) => {
        setCreateTripDialogOpen(open);
        if (!open) { setTripName(""); setTripStart(""); setTripEnd(""); setTripNotes(""); }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              New Trip
            </DialogTitle>
          </DialogHeader>
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
            <div className="grid grid-cols-2 gap-4">
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
                rows={2}
                data-testid="input-trip-notes"
              />
            </div>
            <DialogFooter>
              <Button variant="ghost" type="button" onClick={() => setCreateTripDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createTripMutation.isPending || !tripName || !tripStart || !tripEnd}
                data-testid="button-create-trip"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Trip
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* ── Add Appointment Dialog ──────────────────────────────────────────── */}
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
            {/* Customer */}
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

            {selectedCustomerId && selectedCustomerPianos.length > 0 && (
              <div className="space-y-2">
                <Label>Piano</Label>
                <Popover open={pianoCbOpen} onOpenChange={setPianoCbOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between font-normal"
                      data-testid="select-appt-piano"
                    >
                      <span className="truncate">
                        {selectedPianoId !== "none"
                          ? (() => {
                              const p = selectedCustomerPianos.find(p => String(p.id) === selectedPianoId);
                              return p ? [p.make, p.model, p.pianoType].filter(Boolean).join(" ") || `Piano #${p.id}` : "Select piano...";
                            })()
                          : "No specific piano"}
                      </span>
                      <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-full p-0" align="start">
                    <Command>
                      <CommandInput placeholder="Search piano..." />
                      <CommandList>
                        <CommandEmpty>No piano found.</CommandEmpty>
                        <CommandGroup>
                          <CommandItem
                            value="none"
                            onSelect={() => { setSelectedPianoId("none"); setPianoCbOpen(false); }}
                          >
                            <Check className={`mr-2 h-4 w-4 ${selectedPianoId === "none" ? "opacity-100" : "opacity-0"}`} />
                            No specific piano
                          </CommandItem>
                          {selectedCustomerPianos.map((p) => {
                            const label = [p.make, p.model, p.pianoType].filter(Boolean).join(" ") || `Piano #${p.id}`;
                            return (
                              <CommandItem
                                key={p.id}
                                value={label}
                                onSelect={() => { setSelectedPianoId(String(p.id)); setPianoCbOpen(false); }}
                              >
                                <Check className={`mr-2 h-4 w-4 ${selectedPianoId === String(p.id) ? "opacity-100" : "opacity-0"}`} />
                                {label}
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {/* Time & Duration */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Time</Label>
                <TimeStepperWidget
                  minutes={apptTimeMinutes}
                  onChange={(m) => { setApptTimeMinutes(m); setConflictError(""); }}
                  testIdPrefix="trip-appt-time"
                />
              </div>
              <div className="space-y-2">
                <Label>Duration</Label>
                <DurationStepperWidget
                  minutes={apptDurationMinutes}
                  onChange={(m) => { setApptDurationMinutes(m); setConflictError(""); }}
                  testIdPrefix="trip-appt-duration"
                />
              </div>
            </div>

            {conflictError && (
              <div className="flex items-start gap-2 p-2 rounded-md bg-orange-50 border border-orange-200 text-sm text-orange-700 dark:bg-orange-950/20 dark:border-orange-800 dark:text-orange-400" data-testid="text-conflict-error">
                <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                <span>{conflictError} — saved anyway.</span>
              </div>
            )}

            {/* Services */}
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
              <Button variant="outline" onClick={closeAddDialog} data-testid="button-cancel-appointment">
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

      {/* ── Complete Appointment Dialog ─────────────────────────────────────── */}
      <Dialog open={completeDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setCompleteDialogOpen(false);
          setCompletingAppt(null);
          setCompletingTripId(null);
          setCompletePaymentMethod("");
          setCompletePaymentAmount("");
          setLocalCreatedInvoice(null);
        }
      }}>
        <DialogContent className="max-w-md w-full max-h-[85vh] flex flex-col p-0">
          <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
            <DialogTitle className="text-base font-semibold">Complete Appointment</DialogTitle>
            {completingAppt && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {(() => {
                  const c = customerMap.get(completingAppt.customerId);
                  return c ? `${c.firstName} ${c.lastName} · ` : "";
                })()}{completingAppt.date} at {completingAppt.time}
              </p>
            )}
          </DialogHeader>

          <ScrollArea className="flex-1 px-6 py-4">
            <div className="space-y-5">
              <div className="space-y-3" data-testid="trip-invoice-section">
                <h3 className="text-sm font-semibold">Invoice</h3>
                <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 space-y-2">
                  {completingLinkedInvoice ? (
                    <div className="flex items-center gap-2 flex-wrap">
                      <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                      <span className="text-sm font-medium">#{completingLinkedInvoice.invoiceNumber}</span>
                      {invoiceStatusBadge(completingLinkedInvoice.status)}
                      <div className="flex gap-1 ml-auto">
                        <Link href={`/invoices/${completingLinkedInvoice.id}`} onClick={() => setCompleteDialogOpen(false)}>
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" data-testid="link-open-invoice-trip-complete">
                            Open <ExternalLink className="h-3 w-3" />
                          </Button>
                        </Link>
                        <Link href={`/invoices/${completingLinkedInvoice.id}?edit=1`} onClick={() => setCompleteDialogOpen(false)}>
                          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" data-testid="link-edit-invoice-trip-complete">
                            <Pencil className="h-3 w-3" /> Edit
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => createTripInvoiceMutation.mutate()}
                      disabled={createTripInvoiceMutation.isPending}
                      className="w-full h-8 text-xs"
                      data-testid="button-create-invoice-trip-complete"
                    >
                      <FileText className="h-3.5 w-3.5 mr-1" />
                      {createTripInvoiceMutation.isPending ? "Creating…" : "Create Invoice"}
                    </Button>
                  )}
                </div>
              </div>

              <Separator />

              <div className="space-y-3" data-testid="trip-payment-section">
                <h3 className="text-sm font-semibold">Payment Received</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Payment Method</Label>
                    <Select value={completePaymentMethod} onValueChange={setCompletePaymentMethod}>
                      <SelectTrigger className="h-8 text-sm" data-testid="select-trip-payment-method">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {PAYMENT_METHODS.map(m => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Amount Paid</Label>
                    <Input
                      value={completePaymentAmount}
                      onChange={e => setCompletePaymentAmount(e.target.value)}
                      placeholder={completingLinkedInvoice?.total ?? "$0.00"}
                      className="h-8 text-sm"
                      data-testid="input-trip-payment-amount"
                    />
                  </div>
                </div>
                {completePaymentMethod && completePaymentMethod !== "none" && completingLinkedInvoice && completingLinkedInvoice.status !== "paid" && (
                  <p className="text-xs text-muted-foreground">
                    Invoice will be marked as <span className="font-medium text-green-700 dark:text-green-400">Paid</span> when you save.
                  </p>
                )}
              </div>
            </div>
          </ScrollArea>

          <DialogFooter className="px-6 py-4 border-t shrink-0">
            <Button
              variant="outline"
              onClick={() => {
                setCompleteDialogOpen(false);
                setCompletingAppt(null);
                setCompletingTripId(null);
                setCompletePaymentMethod("");
                setCompletePaymentAmount("");
                setLocalCreatedInvoice(null);
              }}
              data-testid="button-trip-complete-cancel"
            >
              Cancel
            </Button>
            <Button
              onClick={() => completingAppt && completingTripId && completeAppointmentMutation.mutate({ id: completingAppt.id, tripId: completingTripId })}
              disabled={completeAppointmentMutation.isPending}
              data-testid="button-trip-complete-save"
            >
              {completeAppointmentMutation.isPending ? "Saving…" : "Mark Complete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Edit Appointment Dialog ─────────────────────────────────────────── */}
      <Dialog open={!!editingAppt} onOpenChange={(open) => { if (!open) { setEditingAppt(null); setEditingTripId(null); } }}>
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
                  <Label>Time</Label>
                  <TimeStepperWidget
                    minutes={parseTimeString(editTime)}
                    onChange={(m) => { setEditTime(formatTimeMinutes(m)); setEditConflictError(""); }}
                    testIdPrefix="edit-appt-time"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Duration</Label>
                  <DurationStepperWidget
                    minutes={parseDurationString(editDuration)}
                    onChange={(m) => { setEditDuration(formatDurationMinutes(m)); setEditConflictError(""); }}
                    testIdPrefix="edit-appt-duration"
                  />
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
                <Button variant="outline" onClick={() => { setEditingAppt(null); setEditingTripId(null); }} data-testid="button-cancel-edit">
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
