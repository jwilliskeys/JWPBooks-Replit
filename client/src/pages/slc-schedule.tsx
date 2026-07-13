import React, { useState, useMemo, useEffect, useCallback } from "react";
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
  ChevronLeft,
  ChevronsUpDown,
  Check,
  GripVertical,
  TrendingUp,
  Plane,
  Upload,
  X,
} from "lucide-react";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Checkbox } from "@/components/ui/checkbox";
import type { DateRange } from "react-day-picker";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import { MoveAppointmentDialog, type MoveRequestPrev } from "@/components/move-appointment-dialog";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
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
  SCHEDULE_C_CATEGORIES,
  getCatInfo,
  IRS_MILEAGE_RATE,
  TRIP_DEFAULT_CATEGORIES,
} from "@/lib/schedule-c";
import {
  getNearbyCities,
  areNearby,
  getClusterName,
  getServiceRegion,
  checkTimeConflict,
  getNextAvailableTime,
  parseTimeToMinutes,
  parseDurationToMinutes,
  minutesToTimeStr,
  type ExistingAppointment,
} from "@/lib/scheduling";

// Trip Planner is SLC-trip-specific, so home base here is always the
// Centerville, UT address (vs. the Somerville home base used everywhere else).
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

function getMonthsSinceDate(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const parts = dateStr.split("/");
  if (parts.length < 2) return null;
  const month = parseInt(parts[0]) - 1;
  const day = parseInt(parts[1]);
  let year = parseInt(parts[2] ?? String(new Date().getFullYear()));
  if (year < 100) year += 2000;
  const date = new Date(year, month, day);
  if (isNaN(date.getTime())) return null;
  const now = new Date();
  return (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
}

interface OverdueSLCClientsProps {
  customers: Customer[];
  pianosByCustomer: Map<number, Piano>;
  customersWithAllInactivePianos: Set<number>;
}

function OverdueSLCClients({ customers, pianosByCustomer, customersWithAllInactivePianos }: OverdueSLCClientsProps) {
  const [open, setOpen] = useState(false);

  const overdueClients = useMemo(() => {
    return customers
      .filter(c => {
        if (customersWithAllInactivePianos.has(c.id)) return false;
        const region = getServiceRegion(c.city ?? "");
        return region === "Salt Lake City";
      })
      .map(c => {
        const monthsTuned = getMonthsSinceDate(c.lastTuned);
        const piano = pianosByCustomer.get(c.id);
        const pianoLabel = piano && (piano.make || piano.pianoType)
          ? [piano.make, piano.pianoType].filter(Boolean).join(" ")
          : null;
        return { ...c, monthsTuned, pianoLabel };
      })
      .filter(c => (c.monthsTuned ?? 0) >= 10)
      .sort((a, b) => (b.monthsTuned ?? 0) - (a.monthsTuned ?? 0));
  }, [customers, pianosByCustomer, customersWithAllInactivePianos]);

  if (overdueClients.length === 0) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-950/30 text-sm font-medium hover:bg-amber-100 dark:hover:bg-amber-900/30 transition-colors"
          data-testid="button-overdue-slc-toggle"
        >
          <div className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />
            <span className="text-amber-800 dark:text-amber-200">
              {overdueClients.length} SLC client{overdueClients.length !== 1 ? "s" : ""} overdue for tuning
            </span>
          </div>
          {open ? <ChevronDown className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" /> : <ChevronRight className="h-4 w-4 text-amber-600 dark:text-amber-400 shrink-0" />}
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-1 rounded-lg border border-border overflow-hidden">
          {overdueClients.map((c, i) => {
            const mo = c.monthsTuned ?? 0;
            const urgencyClass = mo >= 18 ? "text-destructive font-bold" : mo >= 14 ? "text-amber-600 dark:text-amber-400 font-semibold" : "text-muted-foreground";
            return (
              <Link key={c.id} href={`/customers/${c.id}`}>
                <div
                  className={`flex items-center gap-3 px-3 py-2 hover:bg-accent cursor-pointer text-sm ${i > 0 ? "border-t border-border" : ""}`}
                  data-testid={`overdue-slc-client-${c.id}`}
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">{c.firstName} {c.lastName}</div>
                    <div className="text-xs text-muted-foreground truncate">
                      {c.city ?? ""}
                      {c.pianoLabel ? ` · ${c.pianoLabel}` : ""}
                      {c.phone ? ` · ${formatPhone(c.phone)}` : ""}
                    </div>
                  </div>
                  <span className={`text-xs shrink-0 ${urgencyClass}`}>
                    {mo}mo ago
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
}

interface SortableApptRowProps {
  appt: TripAppointment;
  index: number;
  totalAppts: number;
  driveMinutes: number | null;
  driveMiles: number | null;
  customerMap: Map<number, Customer>;
  pianoMap: Map<number, Piano>;
  onEdit: () => void;
  onComplete: () => void;
  onDelete: () => void;
  onConfirm: () => void;
}

function SortableApptRow({ appt, index, totalAppts, driveMinutes, driveMiles, customerMap, pianoMap, onEdit, onComplete, onDelete, onConfirm }: SortableApptRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: appt.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const cust = customerMap.get(appt.customerId);
  const piano = appt.pianoId ? pianoMap.get(appt.pianoId) : null;
  const isCompleted = appt.status === "completed";
  const addressParts = [cust?.address, cust?.city, cust?.state, cust?.zipCode].filter(Boolean);
  const addressStr = addressParts.join(", ");
  const pianoStr = [piano?.make, piano?.pianoType].filter(Boolean).join(" ");

  return (
    <div ref={setNodeRef} style={style}>
      {/* Drive time separator above this appointment (index > 0) */}
      {index > 0 && driveMinutes != null && driveMinutes >= 0 && (
        <div className="flex items-center gap-1.5 py-1.5 px-4 text-[11px] text-muted-foreground">
          <Car className="h-3 w-3 shrink-0" />
          <span>{driveMinutes} min{driveMiles != null && driveMiles >= 0 ? ` · ${driveMiles} mi` : ""}</span>
          <div className="flex-1 border-t border-dashed border-muted-foreground/20" />
        </div>
      )}
      <div className={`flex items-start gap-2 px-3 py-2.5 rounded-lg mx-2 mb-1 ${isCompleted ? "opacity-55" : ""} hover:bg-muted/40 transition-colors group`} data-testid={`trip-appointment-${appt.id}`}>
        {/* Drag handle */}
        <button
          className="mt-0.5 cursor-grab active:cursor-grabbing text-muted-foreground/40 hover:text-muted-foreground transition-colors shrink-0 touch-none"
          {...attributes}
          {...listeners}
          aria-label="Drag to reorder"
        >
          <GripVertical className="h-4 w-4" />
        </button>
        {/* Content */}
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs font-semibold text-foreground">{appt.time}</span>
            {appt.duration && <span className="text-xs text-muted-foreground">({appt.duration})</span>}
            {isCompleted && <Badge variant="secondary" className="text-[10px] px-1 py-0">Done</Badge>}
          </div>
          {cust ? (
            <Link href={`/customers/${cust.id}`}>
              <span className="text-sm font-medium hover:underline cursor-pointer block" data-testid={`text-itinerary-customer-${appt.id}`}>{cust.firstName} {cust.lastName}</span>
            </Link>
          ) : (
            <span className="text-sm font-medium text-muted-foreground">Unknown client</span>
          )}
          {addressStr && (
            <p className="text-xs text-muted-foreground flex items-start gap-1">
              <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
              {addressStr}
            </p>
          )}
          {cust?.phone && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Phone className="h-3 w-3 shrink-0" />
              {formatPhone(cust.phone)}
            </p>
          )}
          {pianoStr && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <Music className="h-3 w-3 shrink-0" />
              {pianoStr}
            </p>
          )}
          {appt.servicesRequested && <p className="text-xs text-muted-foreground">{appt.servicesRequested}</p>}
          {appt.priceEstimate && (
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <DollarSign className="h-3 w-3" />{appt.priceEstimate}
            </p>
          )}
        </div>
        {/* Action buttons */}
        <div className="flex items-center gap-0.5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onEdit} title="Edit" data-testid={`button-edit-trip-appt-${appt.id}`}>
            <Pencil className="h-3 w-3" />
          </Button>
          {!isCompleted && (
            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={onComplete} title="Complete" data-testid={`button-complete-trip-appt-${appt.id}`}>
              <CheckCircle className="h-3 w-3" />
            </Button>
          )}
          <Button
            variant="ghost" size="icon"
            className={`h-6 w-6 ${appt.linkedAppointmentId ? "text-green-600 dark:text-green-400" : "text-blue-600 dark:text-blue-400"}`}
            onClick={onConfirm}
            title={appt.linkedAppointmentId ? "Already confirmed — click to re-download" : "Confirm & add to calendar"}
            data-testid={`button-confirm-trip-appt-${appt.id}`}
          >
            {appt.linkedAppointmentId ? <CalendarCheck className="h-3 w-3" /> : <CalendarPlus className="h-3 w-3" />}
          </Button>
          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={onDelete} title="Delete" data-testid={`button-delete-trip-appt-${appt.id}`}>
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </div>
    </div>
  );
}

interface DayItinerarySectionProps {
  dateStr: string;
  dayDate: Date;
  dayAppts: TripAppointment[];
  customerMap: Map<number, Customer>;
  pianoMap: Map<number, Piano>;
  onOpenAddDialog: (dateStr: string) => void;
  onOpenEditDialog: (appt: TripAppointment) => void;
  onCompleteAppointment: (appt: TripAppointment) => void;
  onDeleteAppointment: (id: number) => void;
  onConfirmAppointment: (appt: TripAppointment, cust: Customer | undefined, piano: Piano | null | undefined) => void;
  onMileageReported?: (dateStr: string, miles: number | null) => void;
}

function DayItinerarySection({
  dateStr, dayDate, dayAppts, customerMap, pianoMap,
  onOpenAddDialog, onOpenEditDialog, onCompleteAppointment, onDeleteAppointment,
  onConfirmAppointment, onMileageReported,
}: DayItinerarySectionProps) {
  const addresses = useMemo(() => {
    if (dayAppts.length === 0) return [];
    const apptAddresses = dayAppts.map(a => buildCustomerAddress(customerMap.get(a.customerId)));
    return [HOME_ADDRESS, ...apptAddresses, HOME_ADDRESS];
  }, [dayAppts, customerMap]);

  const { data: drivingData } = useQuery<{ durations: number[] | null; distances: number[] | null }>({
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
    const valid = drivingDistances.filter(d => d >= 0);
    if (valid.length === 0) return null;
    return Math.round(valid.reduce((sum, d) => sum + d, 0) * 10) / 10;
  }, [drivingDistances]);

  useEffect(() => {
    onMileageReported?.(dateStr, totalMileage);
  }, [dateStr, totalMileage, onMileageReported]);

  const leaveByTime = useMemo(() => {
    if (!dayAppts.length || !drivingTimes || drivingTimes[0] == null || drivingTimes[0] < 0) return null;
    const firstMins = parseTimeToMinutes(dayAppts[0].time || "");
    if (firstMins < 0) return null;
    const leaveMins = firstMins - drivingTimes[0];
    return leaveMins > 0 ? minutesToTimeStr(leaveMins) : null;
  }, [dayAppts, drivingTimes]);

  const returnDriveMinutes = drivingTimes ? drivingTimes[drivingTimes.length - 1] : null;
  const returnDriveMiles = drivingDistances ? drivingDistances[drivingDistances.length - 1] : null;

  const dayName = dayDate.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" });
  const dayRevenue = dayAppts.reduce((s, a) => s + parsePrice(a.priceEstimate), 0);
  const dayArea = dayAppts.length > 0
    ? customerMap.get(dayAppts[0].customerId)?.city || dayAppts[0].serviceArea || ""
    : "";

  // Whole day column is a drop target so appointments can be dragged onto
  // other days (including empty ones). The parent TripPanel owns the DndContext.
  const { setNodeRef: setDayDropRef, isOver: isDayOver } = useDroppable({ id: `day:${dateStr}` });

  return (
    <div className="flex flex-col h-full" data-testid={`itinerary-day-${dateStr}`}>
      {/* Day header */}
      <div className="px-3 py-2 bg-muted/30 border-b rounded-t-lg">
        <div className="flex items-start justify-between gap-2">
          <span className="font-semibold text-sm leading-tight">{dayName}</span>
          <Button variant="ghost" size="sm" className="h-6 text-xs gap-1 shrink-0 px-2 -mr-1 -mt-0.5" onClick={() => onOpenAddDialog(dateStr)} data-testid={`button-add-itinerary-appt-${dateStr}`}>
            <Plus className="h-3 w-3" /> Add
          </Button>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap mt-1">
          {dayArea && (
            <Badge variant="secondary" className="text-xs gap-1 px-1.5 py-0 h-5" data-testid={`badge-area-itinerary-${dateStr}`}>
              <MapPin className="h-3 w-3" />{getClusterName(dayArea)}
            </Badge>
          )}
          {dayRevenue > 0 && <span className="text-xs text-muted-foreground">${dayRevenue.toFixed(0)}</span>}
          {totalMileage != null && totalMileage > 0 && (
            <span className="text-xs text-muted-foreground flex items-center gap-0.5">
              <Car className="h-3 w-3" />{totalMileage} mi
            </span>
          )}
        </div>
      </div>

      {/* Appointments */}
      <div
        ref={setDayDropRef}
        className={`py-1.5 flex-1 min-h-[100px] rounded-b-lg transition-colors ${isDayOver ? "bg-primary/5 ring-1 ring-inset ring-primary/30" : ""}`}
      >
        {dayAppts.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4 px-2">
            {isDayOver ? "Drop appointment here" : "No appointments yet"}
          </p>
        ) : (
          <>
            {/* Leave-by row */}
            {leaveByTime && (
              <div className="flex items-center gap-1.5 px-4 py-1.5 text-xs text-blue-600 dark:text-blue-400">
                <Home className="h-3.5 w-3.5 shrink-0" />
                <span className="font-medium">Leave by {leaveByTime}</span>
                {drivingTimes?.[0] != null && drivingTimes[0] >= 0 && (
                  <span className="text-muted-foreground">({drivingTimes[0]} min drive)</span>
                )}
              </div>
            )}
            <SortableContext items={dayAppts.map(a => a.id)} strategy={verticalListSortingStrategy}>
                {dayAppts.map((appt, i) => (
                  <SortableApptRow
                    key={appt.id}
                    appt={appt}
                    index={i}
                    totalAppts={dayAppts.length}
                    driveMinutes={drivingTimes ? drivingTimes[i] : null}
                    driveMiles={drivingDistances ? drivingDistances[i] : null}
                    customerMap={customerMap}
                    pianoMap={pianoMap}
                    onEdit={() => onOpenEditDialog(appt)}
                    onComplete={() => onCompleteAppointment(appt)}
                    onDelete={() => { if (confirm("Delete this appointment?")) onDeleteAppointment(appt.id); }}
                    onConfirm={() => {
                      const cust = customerMap.get(appt.customerId);
                      const piano = appt.pianoId ? pianoMap.get(appt.pianoId) : null;
                      onConfirmAppointment(appt, cust, piano);
                    }}
                  />
                ))}
            </SortableContext>
            {/* Return home row */}
            {returnDriveMinutes != null && returnDriveMinutes >= 0 && (
              <div className="flex items-center gap-1.5 px-4 py-1.5 text-xs text-muted-foreground">
                <Home className="h-3.5 w-3.5 shrink-0" />
                <span>Return home</span>
                <span>({returnDriveMinutes} min{returnDriveMiles != null && returnDriveMiles >= 0 ? `, ${returnDriveMiles} mi` : ""})</span>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

interface BudgetItem {
  /** Schedule C category label (must match SCHEDULE_C_CATEGORIES). Falls back to "Other". */
  category: string;
  /** Optional date the expense was incurred (MM/DD/YYYY) */
  date: string;
  /** Vendor / payee — useful for the audit trail */
  vendor: string;
  /** Pre-trip budget estimate */
  expected: string;
  /** Actual amount spent */
  actual: string;
  /** Free-form notes (receipt location, business purpose, etc.) */
  notes: string;
}

interface TripBudgetData {
  taxRate: string;       // marginal/effective tax rate (income + SE) for required-income calc
  tuningRate: string;    // per-tuning revenue used in break-even
  mileageMethod: "standard" | "actual"; // Schedule C Part IV vehicle deduction method
  items: BudgetItem[];
}

const DEFAULT_BUDGET_ITEMS: BudgetItem[] = TRIP_DEFAULT_CATEGORIES.map(category => ({
  category,
  date: "",
  vendor: "",
  expected: "",
  actual: "",
  notes: "",
}));

function migrateBudgetItem(raw: unknown): BudgetItem {
  // Old shape only had category/expected/actual/notes — preserve those.
  const r = (raw ?? {}) as Record<string, unknown>;
  const oldCat = typeof r.category === "string" ? r.category : "";
  // If old default category names slipped through, map them to Schedule C labels.
  const remap: Record<string, string> = {
    "Flight": "Travel",
    "Hotel": "Travel",
    "Car Rental": "Car & Truck (Actual)",
    "Gas": "Car & Truck (Actual)",
    "Meals": "Meals (50%)",
  };
  return {
    category: remap[oldCat] ?? oldCat ?? "Other",
    date: typeof r.date === "string" ? r.date : "",
    vendor: typeof r.vendor === "string" ? r.vendor : "",
    expected: typeof r.expected === "string" ? r.expected : "",
    actual: typeof r.actual === "string" ? r.actual : "",
    notes: typeof r.notes === "string" ? r.notes : "",
  };
}

function parseTripBudget(tripNotesJson: string | null | undefined): TripBudgetData {
  try {
    const parsed = JSON.parse(tripNotesJson ?? "{}");
    const b = parsed.budget;
    if (!b) {
      return {
        taxRate: "28",
        tuningRate: "120",
        mileageMethod: "standard",
        items: DEFAULT_BUDGET_ITEMS.map(i => ({ ...i })),
      };
    }
    return {
      taxRate: b.taxRate ?? "28",
      tuningRate: b.tuningRate ?? "120",
      mileageMethod: b.mileageMethod === "actual" ? "actual" : "standard",
      items: Array.isArray(b.items)
        ? b.items.map(migrateBudgetItem)
        : DEFAULT_BUDGET_ITEMS.map(i => ({ ...i })),
    };
  } catch {
    return {
      taxRate: "28",
      tuningRate: "120",
      mileageMethod: "standard",
      items: DEFAULT_BUDGET_ITEMS.map(i => ({ ...i })),
    };
  }
}

function parseBudgetNum(str: string | undefined): number {
  const n = parseFloat((str ?? "").replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}

// ── Flight Info ──────────────────────────────────────────────────────────────
interface TripFlightInfo {
  added: boolean;          // booked/confirmed checkbox
  flightNumber: string;   // "DL 5692"
  from: string;            // "BOS"
  to: string;              // "DCA"
  date: string;            // "Jul 20, 2026"
  total: string;           // "$178.40"
  confirmation: string;    // "F83M5U"
  filename: string;        // original PDF filename
}

const DEFAULT_FLIGHT_INFO: TripFlightInfo = {
  added: false,
  flightNumber: "",
  from: "",
  to: "",
  date: "",
  total: "",
  confirmation: "",
  filename: "",
};

function parseTripFlightInfo(tripNotesJson: string | null | undefined): TripFlightInfo {
  try {
    const parsed = JSON.parse(tripNotesJson ?? "{}");
    const f = parsed.flight;
    if (!f) return { ...DEFAULT_FLIGHT_INFO };
    // Support both old (outbound/returnLeg) and new flat shape
    const flightNumber = f.flightNumber ?? f.outbound?.flightNumber ?? "";
    const from = f.from ?? f.outbound?.from ?? "";
    const to = f.to ?? f.outbound?.to ?? "";
    const date = f.date ?? f.outbound?.date ?? "";
    const total = f.total ?? f.roundTripTotal ?? "";
    return {
      added: !!f.added,
      flightNumber,
      from,
      to,
      date,
      total,
      confirmation: f.confirmation ?? "",
      filename: f.filename ?? f.documentFilename ?? "",
    };
  } catch {
    return { ...DEFAULT_FLIGHT_INFO };
  }
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
  onRequestMove: (appt: TripAppointment, targetDate: string, prevAppt: TripAppointment | null, tripId: number) => void;
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
  onRequestMove,
}: TripPanelProps) {
  const { data: tripAppointments } = useQuery<TripAppointment[]>({
    queryKey: ["/api/trips", trip.id, "appointments"],
  });

  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

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

  function findApptById(id: number): TripAppointment | undefined {
    return tripAppointments?.find(a => a.id === id);
  }

  // Drag-and-drop across the whole trip: dropping an appointment after another
  // one (same day or different day) asks the page to open the reschedule
  // dialog with a suggested time.
  function handleTripDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const activeId = Number(active.id);
    const sourceAppt = findApptById(activeId);
    if (!sourceAppt) return;

    let targetDate: string;
    let prevAppt: TripAppointment | null = null;
    const overIdStr = String(over.id);

    if (overIdStr.startsWith("day:")) {
      // Dropped on a day column (possibly empty) → goes last that day
      targetDate = overIdStr.slice(4);
      const list = (appointmentsByDate.get(targetDate) ?? []).filter(a => a.id !== activeId);
      prevAppt = list.length > 0 ? list[list.length - 1] : null;
    } else {
      const overId = Number(over.id);
      if (overId === activeId) return;
      const overAppt = findApptById(overId);
      if (!overAppt) return;
      targetDate = overAppt.date;
      const orig = appointmentsByDate.get(targetDate) ?? [];
      if (sourceAppt.date === targetDate) {
        const oldIdx = orig.findIndex(a => a.id === activeId);
        const newIdx = orig.findIndex(a => a.id === overId);
        if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) return;
        const result = arrayMove(orig, oldIdx, newIdx);
        const pos = result.findIndex(a => a.id === activeId);
        prevAppt = pos > 0 ? result[pos - 1] : null;
      } else {
        // Cross-day: dragged item takes the hovered item's slot
        const list = orig.filter(a => a.id !== activeId);
        const overIdx = list.findIndex(a => a.id === overId);
        prevAppt = overIdx > 0 ? list[overIdx - 1] : null;
      }
    }
    onRequestMove(sourceAppt, targetDate, prevAppt, trip.id);
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

  // ── Day extend / shrink ──────────────────────────────────────────────────────
  function adjustTripDates(action: "extend-start" | "shrink-start" | "extend-end" | "shrink-end") {
    const start = parseDateStr(trip.startDate);
    const end = parseDateStr(trip.endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) return;
    const newStart = new Date(start);
    const newEnd = new Date(end);
    if (action === "extend-start") {
      newStart.setDate(newStart.getDate() - 1);
    } else if (action === "shrink-start") {
      if (newStart >= newEnd) return;
      newStart.setDate(newStart.getDate() + 1);
    } else if (action === "extend-end") {
      newEnd.setDate(newEnd.getDate() + 1);
    } else if (action === "shrink-end") {
      if (newEnd <= newStart) return;
      newEnd.setDate(newEnd.getDate() - 1);
    }
    apiRequest("PATCH", `/api/trips/${trip.id}`, {
      startDate: formatDateStr(newStart),
      endDate: formatDateStr(newEnd),
    }).then(() => queryClient.invalidateQueries({ queryKey: ["/api/trips"] }));
  }

  // ── Flight Info ──────────────────────────────────────────────────────────────
  const [flightOpen, setFlightOpen] = useState(false);
  const [flightInfo, setFlightInfo] = useState<TripFlightInfo>(() => parseTripFlightInfo(trip.notes));
  const [flightEditOpen, setFlightEditOpen] = useState(false);
  const [flightEditDraft, setFlightEditDraft] = useState<TripFlightInfo>(DEFAULT_FLIGHT_INFO);
  const [flightUploading, setFlightUploading] = useState(false);

  function saveFlightInfo(f: TripFlightInfo, b?: TripBudgetData) {
    let existing: Record<string, unknown> = {};
    try { existing = JSON.parse(trip.notes ?? "{}"); } catch { /* ignore */ }
    const nextBudget = b ?? budget;
    apiRequest("PATCH", `/api/trips/${trip.id}`, {
      notes: JSON.stringify({ ...existing, flight: f, budget: nextBudget }),
    }).then(() => queryClient.invalidateQueries({ queryKey: ["/api/trips"] }));
  }

  /** Upload a PDF to /api/parse-flight-pdf, auto-fill flightInfo, and update the Travel budget row */
  async function handleFlightPdfUpload(file: File) {
    setFlightUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      const resp = await fetch("/api/parse-flight-pdf", { method: "POST", body: formData });
      if (!resp.ok) throw new Error(await resp.text());
      const parsed = await resp.json() as {
        flightNumber: string; from: string; to: string;
        date: string; total: string; confirmation: string;
      };
      const next: TripFlightInfo = {
        ...flightInfo,
        flightNumber: parsed.flightNumber || flightInfo.flightNumber,
        from: parsed.from || flightInfo.from,
        to: parsed.to || flightInfo.to,
        date: parsed.date || flightInfo.date,
        total: parsed.total || flightInfo.total,
        confirmation: parsed.confirmation || flightInfo.confirmation,
        filename: file.name,
      };
      // Auto-populate "Travel" row in budget with the flight total
      const totalNum = parseFloat((parsed.total ?? "").replace(/[^0-9.]/g, ""));
      let nextBudget = budget;
      if (!isNaN(totalNum) && totalNum > 0) {
        const travelIdx = budget.items.findIndex(it => it.category === "Travel");
        if (travelIdx >= 0) {
          const newItems = budget.items.map((it, i) =>
            i === travelIdx ? { ...it, actual: totalNum.toFixed(2) } : it
          );
          nextBudget = { ...budget, items: newItems };
          setBudget(nextBudget);
        }
      }
      setFlightInfo(next);
      saveFlightInfo(next, nextBudget);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Upload failed";
      console.error("Flight PDF parse error:", msg);
    } finally {
      setFlightUploading(false);
    }
  }

  // ── Trip Budget ─────────────────────────────────────────────────────────────
  const [budgetOpen, setBudgetOpen] = useState(false);
  const [budget, setBudget] = useState<TripBudgetData>(() => parseTripBudget(trip.notes));

  function saveBudget(b: TripBudgetData) {
    let existing: Record<string, unknown> = {};
    try { existing = JSON.parse(trip.notes ?? "{}"); } catch { /* ignore */ }
    apiRequest("PATCH", `/api/trips/${trip.id}`, {
      notes: JSON.stringify({ ...existing, budget: b }),
    }).then(() => queryClient.invalidateQueries({ queryKey: ["/api/trips"] }));
  }

  function updateBudgetItem(idx: number, field: keyof BudgetItem, value: string) {
    const newItems = budget.items.map((item, i) =>
      i === idx ? { ...item, [field]: value } : item
    );
    setBudget(prev => ({ ...prev, items: newItems }));
  }

  function addBudgetItem() {
    const next = {
      ...budget,
      items: [...budget.items, { category: "Other", date: "", vendor: "", expected: "", actual: "", notes: "" }],
    };
    setBudget(next);
    saveBudget(next);
  }

  function removeBudgetItem(idx: number) {
    const next = { ...budget, items: budget.items.filter((_, i) => i !== idx) };
    setBudget(next);
    saveBudget(next);
  }

  // ── Schedule C calculations ──
  const totalExpected = budget.items.reduce((s, i) => s + parseBudgetNum(i.expected), 0);
  const totalActual = budget.items.reduce((s, i) => s + parseBudgetNum(i.actual), 0);

  // Roll up actual spend by Schedule C line label (e.g. "Line 24a: Travel").
  type LineSummary = { line: string; label: string; total: number; deductible: number; deductPct: number };
  const lineSummaries: LineSummary[] = useMemo(() => {
    const map = new Map<string, LineSummary>();
    budget.items.forEach(item => {
      const amount = parseBudgetNum(item.actual);
      if (amount <= 0) return;
      const info = getCatInfo(item.category || "Other");
      const key = `${info.line}|${item.category || info.label}`;
      const cur = map.get(key) ?? {
        line: info.line,
        label: item.category || info.label,
        total: 0,
        deductible: 0,
        deductPct: info.deductPct,
      };
      cur.total += amount;
      cur.deductible += amount * (info.deductPct / 100);
      map.set(key, cur);
    });
    return Array.from(map.values()).sort((a, b) => a.line.localeCompare(b.line));
  }, [budget.items]);

  // Mileage deduction (Schedule C Line 9 if standard method).
  const tripMiles = tripTotalMileage ?? 0;
  const mileageDeduction = budget.mileageMethod === "standard" ? tripMiles * IRS_MILEAGE_RATE : 0;

  const totalDeductible = lineSummaries.reduce((s, r) => s + r.deductible, 0) + mileageDeduction;

  const taxRateNum = parseBudgetNum(budget.taxRate) / 100;
  const tuningRateNum = parseBudgetNum(budget.tuningRate);

  // "Required income" is the gross revenue you'd need to net `totalActual` after tax
  // on (revenue − deductible expenses). Approximation: required ≈ deductible + actual_out_of_pocket / (1-tax),
  // but our existing UX has always treated it as: gross needed so that (gross − tax × gross) >= expenses.
  // Keep that simple model.
  const requiredIncome = taxRateNum < 1 && totalActual > 0 ? totalActual / (1 - taxRateNum) : totalActual;
  const breakEvenTunings = tuningRateNum > 0 ? Math.ceil(requiredIncome / tuningRateNum) : 0;
  const progressPct = requiredIncome > 0 ? Math.min(100, (totalRevenue / requiredIncome) * 100) : 0;
  const surplus = totalRevenue - requiredIncome;

  // Net effect on tax: deductible expenses save (incomeTax + SE) × deductible.
  // Approximate combined federal rate by adding SE; user's `taxRate` already includes it for the planning model,
  // so we expose the raw deductible for reference rather than re-stacking.
  const estimatedTaxSavings = totalDeductible * Math.min(taxRateNum, 0.45);

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
          <div className="border-t">
            {/* ── Day range controls ──────────────────────────────────────── */}
            <div className="flex items-center gap-2 px-4 py-1.5 bg-muted/20 border-b text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => adjustTripDates("extend-start")}
                  className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent hover:text-foreground transition-colors"
                  title="Add day before trip"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="font-medium text-foreground tabular-nums">{trip.startDate}</span>
                <button
                  type="button"
                  onClick={() => adjustTripDates("shrink-start")}
                  className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent hover:text-foreground transition-colors"
                  title="Remove first day"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
              <div className="flex-1 border-t border-dashed border-muted-foreground/20" />
              <span className="text-[10px] text-muted-foreground/50">{dates.length}d</span>
              <div className="flex-1 border-t border-dashed border-muted-foreground/20" />
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => adjustTripDates("shrink-end")}
                  className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent hover:text-foreground transition-colors"
                  title="Remove last day"
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </button>
                <span className="font-medium text-foreground tabular-nums">{trip.endDate}</span>
                <button
                  type="button"
                  onClick={() => adjustTripDates("extend-end")}
                  className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent hover:text-foreground transition-colors"
                  title="Add day after trip"
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* ── Day columns (horizontal layout) ─────────────────────────── */}
            <DndContext sensors={dndSensors} collisionDetection={closestCenter} onDragEnd={handleTripDragEnd}>
            <div className="overflow-x-auto pb-3 pt-3 px-3">
              <div className="flex gap-3 items-stretch" style={{ minWidth: "fit-content" }}>
                {dates.map((dateStr) => {
                  const dayDate = parseDateStr(dateStr);
                  const dayAppts = appointmentsByDate.get(dateStr) ?? [];
                  return (
                    <div
                      key={dateStr}
                      className="flex-shrink-0 w-[260px] sm:w-[280px] border rounded-lg bg-card/30 flex flex-col self-stretch"
                      data-testid={`column-day-${dateStr}`}
                    >
                      <DayItinerarySection
                        dateStr={dateStr}
                        dayDate={dayDate}
                        dayAppts={dayAppts}
                        customerMap={customerMap}
                        pianoMap={pianoMap}
                        onOpenAddDialog={handleOpenDialog}
                        onOpenEditDialog={(appt) => {
                          const apptList = appointmentsByDate.get(appt.date) ?? [];
                          const dayExisting: ExistingAppointment[] = apptList.filter(a => a.id !== appt.id).map(a => ({
                            time: a.time,
                            duration: a.duration || "2 hours",
                            city: customerMap.get(a.customerId)?.city || a.serviceArea || "",
                          }));
                          onOpenEditDialog(appt, trip.id, dayExisting);
                        }}
                        onCompleteAppointment={(appt) => onCompleteAppointment(appt, trip.id)}
                        onDeleteAppointment={(id) => onDeleteAppointment(id, trip.id)}
                        onConfirmAppointment={(appt, cust, piano) => onConfirmAppointment(appt, cust, piano, trip.id)}
                        onMileageReported={handleMileageReported}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
            </DndContext>

            {/* ── Flight Info Section ─────────────────────────────────────── */}
            <div className="border-t">
              {/* Collapsible header */}
              <button
                className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium hover:bg-muted/30 transition-colors"
                onClick={() => setFlightOpen(o => !o)}
                type="button"
              >
                <span className="flex items-center gap-2 text-muted-foreground">
                  <Plane className="h-3.5 w-3.5" />
                  Flight
                  {flightInfo.flightNumber ? (
                    <span className="text-[10px] font-semibold text-green-600 dark:text-green-400">
                      {flightInfo.added ? "● Booked" : "● Receipt loaded"}
                    </span>
                  ) : (
                    <span className="text-[10px] text-muted-foreground/50">○ No receipt</span>
                  )}
                </span>
                {flightOpen
                  ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>

              {flightOpen && (
                <div className="px-4 pb-4 space-y-3">
                  {flightInfo.flightNumber ? (
                    /* ── Loaded state: compact one-liner + controls ── */
                    <div className="space-y-2.5">
                      {/* One-liner summary */}
                      <div className="flex items-center gap-2 py-2 px-3 bg-muted/30 rounded-md">
                        <Plane className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium tabular-nums flex-1 min-w-0 truncate">
                          {[
                            flightInfo.flightNumber,
                            flightInfo.from && flightInfo.to ? `${flightInfo.from} → ${flightInfo.to}` : "",
                            flightInfo.date,
                            flightInfo.total,
                          ].filter(Boolean).join(" · ")}
                        </span>
                      </div>

                      {/* Controls row: Booked checkbox + Edit + Clear */}
                      <div className="flex items-center gap-3">
                        <div className="flex items-center gap-1.5 flex-1">
                          <Checkbox
                            id={`flight-added-${trip.id}`}
                            checked={flightInfo.added}
                            onCheckedChange={(checked) => {
                              const next = { ...flightInfo, added: !!checked };
                              setFlightInfo(next);
                              saveFlightInfo(next);
                            }}
                          />
                          <label htmlFor={`flight-added-${trip.id}`} className="text-xs cursor-pointer text-muted-foreground">
                            Booked / confirmed
                          </label>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs px-2.5"
                          onClick={() => {
                            setFlightEditDraft({ ...flightInfo });
                            setFlightEditOpen(true);
                          }}
                        >
                          Edit
                        </Button>
                        <button
                          type="button"
                          title="Clear flight"
                          className="h-7 w-7 flex items-center justify-center rounded hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-colors"
                          onClick={() => {
                            const next = { ...DEFAULT_FLIGHT_INFO };
                            setFlightInfo(next);
                            saveFlightInfo(next);
                          }}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </div>

                      {/* Filename badge */}
                      {flightInfo.filename && (
                        <p className="text-[10px] text-muted-foreground/60 truncate">
                          {flightInfo.filename}
                        </p>
                      )}
                    </div>
                  ) : (
                    /* ── Empty state: upload button ── */
                    <div className="pt-1">
                      <label
                        htmlFor={`flight-pdf-${trip.id}`}
                        className={`flex items-center gap-2 h-9 px-3 text-sm border rounded-md cursor-pointer transition-colors w-full justify-center
                          ${flightUploading
                            ? "opacity-60 pointer-events-none bg-muted/30"
                            : "hover:bg-muted/40 text-muted-foreground"}`}
                      >
                        {flightUploading ? (
                          <>
                            <span className="h-3.5 w-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            Parsing receipt…
                          </>
                        ) : (
                          <>
                            <Upload className="h-3.5 w-3.5" />
                            Upload flight receipt (PDF)
                          </>
                        )}
                      </label>
                      <input
                        id={`flight-pdf-${trip.id}`}
                        type="file"
                        accept=".pdf"
                        className="sr-only"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (file) handleFlightPdfUpload(file);
                          e.target.value = "";
                        }}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* ── Flight Edit Dialog ─────────────────────────────── */}
              <Dialog open={flightEditOpen} onOpenChange={setFlightEditOpen}>
                <DialogContent className="w-[calc(100%-2rem)] max-w-sm rounded-lg">
                  <DialogHeader>
                    <DialogTitle className="text-base">Edit Flight Info</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 py-1">
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Flight #</label>
                        <Input
                          className="h-9 text-base md:text-sm"
                          value={flightEditDraft.flightNumber}
                          onChange={e => setFlightEditDraft(p => ({ ...p, flightNumber: e.target.value }))}
                          placeholder="DL 5692"
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Date</label>
                        <Input
                          className="h-9 text-base md:text-sm"
                          value={flightEditDraft.date}
                          onChange={e => setFlightEditDraft(p => ({ ...p, date: e.target.value }))}
                          placeholder="Jul 20, 2026"
                        />
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">From</label>
                        <Input
                          className="h-9 text-base md:text-sm uppercase"
                          value={flightEditDraft.from}
                          onChange={e => setFlightEditDraft(p => ({ ...p, from: e.target.value.toUpperCase() }))}
                          placeholder="BOS"
                          maxLength={4}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">To</label>
                        <Input
                          className="h-9 text-base md:text-sm uppercase"
                          value={flightEditDraft.to}
                          onChange={e => setFlightEditDraft(p => ({ ...p, to: e.target.value.toUpperCase() }))}
                          placeholder="DCA"
                          maxLength={4}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-xs text-muted-foreground">Total</label>
                        <Input
                          className="h-9 text-base md:text-sm tabular-nums"
                          value={flightEditDraft.total}
                          onChange={e => setFlightEditDraft(p => ({ ...p, total: e.target.value }))}
                          placeholder="$178.40"
                          inputMode="decimal"
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs text-muted-foreground">Confirmation #</label>
                      <Input
                        className="h-9 text-base md:text-sm uppercase"
                        value={flightEditDraft.confirmation}
                        onChange={e => setFlightEditDraft(p => ({ ...p, confirmation: e.target.value.toUpperCase() }))}
                        placeholder="F83M5U"
                      />
                    </div>
                    {/* Upload replacement */}
                    <div className="pt-1">
                      <label
                        htmlFor={`flight-pdf-edit-${trip.id}`}
                        className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors"
                      >
                        <Upload className="h-3 w-3" />
                        {flightEditDraft.filename ? `Replace: ${flightEditDraft.filename}` : "Upload a different receipt PDF"}
                      </label>
                      <input
                        id={`flight-pdf-edit-${trip.id}`}
                        type="file"
                        accept=".pdf"
                        className="sr-only"
                        onChange={e => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          setFlightEditOpen(false);
                          handleFlightPdfUpload(file);
                          e.target.value = "";
                        }}
                      />
                    </div>
                  </div>
                  <DialogFooter className="gap-2">
                    <Button variant="outline" size="sm" onClick={() => setFlightEditOpen(false)}>
                      Cancel
                    </Button>
                    <Button size="sm" onClick={() => {
                      setFlightInfo(flightEditDraft);
                      saveFlightInfo(flightEditDraft);
                      setFlightEditOpen(false);
                    }}>
                      Save
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </div>

            {/* ── Trip Budget Module ──────────────────────────────────────── */}
            <div className="border-t mt-1">
              <button
                className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium hover:bg-muted/30 transition-colors"
                onClick={() => setBudgetOpen(o => !o)}
                type="button"
              >
                <span className="flex items-center gap-2 text-muted-foreground">
                  <DollarSign className="h-3.5 w-3.5" />
                  Trip Budget
                </span>
                {budgetOpen
                  ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
                  : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground" />}
              </button>

              {budgetOpen && (
                <div className="px-4 pb-4 space-y-4">
                  {/* Config row */}
                  <div className="flex flex-wrap gap-3 pt-1">
                    <div className="flex-1 min-w-[120px] space-y-1">
                      <label className="text-xs text-muted-foreground">Tax bracket</label>
                      <div className="relative">
                        <Input
                          className="h-8 text-sm tabular-nums pr-7"
                          value={budget.taxRate}
                          onChange={e => setBudget(prev => ({ ...prev, taxRate: e.target.value }))}
                          onBlur={() => saveBudget(budget)}
                          placeholder="28"
                          inputMode="decimal"
                        />
                        <span className="absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">%</span>
                      </div>
                    </div>
                    <div className="flex-1 min-w-[120px] space-y-1">
                      <label className="text-xs text-muted-foreground">Per tuning</label>
                      <div className="relative">
                        <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">$</span>
                        <Input
                          className="h-8 text-sm tabular-nums pl-6"
                          value={budget.tuningRate}
                          onChange={e => setBudget(prev => ({ ...prev, tuningRate: e.target.value }))}
                          onBlur={() => saveBudget(budget)}
                          placeholder="120"
                          inputMode="decimal"
                        />
                      </div>
                    </div>
                    <div className="flex-1 min-w-[160px] space-y-1">
                      <label className="text-xs text-muted-foreground">Vehicle method</label>
                      <Select
                        value={budget.mileageMethod}
                        onValueChange={(v) => {
                          const next = { ...budget, mileageMethod: v as "standard" | "actual" };
                          setBudget(next);
                          saveBudget(next);
                        }}
                      >
                        <SelectTrigger className="h-8 text-xs" data-testid="select-vehicle-method">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="standard">Standard mileage (${IRS_MILEAGE_RATE}/mi)</SelectItem>
                          <SelectItem value="actual">Actual expenses</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  {/* Expense table — Schedule C aware */}
                  <div className="rounded-md border overflow-hidden text-sm">
                    <div className="grid grid-cols-[68px_minmax(140px,1.3fr)_minmax(110px,1fr)_72px_72px_28px] bg-muted/40 border-b text-[11px] uppercase tracking-wide text-muted-foreground">
                      <div className="px-2 py-1.5 font-medium">Date</div>
                      <div className="px-2 py-1.5 font-medium">Schedule C category</div>
                      <div className="px-2 py-1.5 font-medium">Vendor</div>
                      <div className="px-2 py-1.5 text-right font-medium">Expected</div>
                      <div className="px-2 py-1.5 text-right font-medium">Actual</div>
                      <div />
                    </div>
                    {budget.items.length === 0 ? (
                      <div className="px-4 py-6 text-xs text-muted-foreground text-center">
                        No expenses yet — tap "Add expense" below to start.
                      </div>
                    ) : (
                      budget.items.map((item, idx) => {
                        const info = getCatInfo(item.category || "Other");
                        return (
                          <div key={idx} className="border-b last:border-0 hover:bg-muted/20 transition-colors group">
                            <div className="grid grid-cols-[68px_minmax(140px,1.3fr)_minmax(110px,1fr)_72px_72px_28px] items-center">
                              <div className="px-1 py-1">
                                <Input
                                  className="h-7 text-xs tabular-nums px-2 border-0 bg-transparent focus:bg-background focus:border focus:border-input"
                                  value={item.date}
                                  onChange={e => updateBudgetItem(idx, "date", e.target.value)}
                                  onBlur={() => saveBudget(budget)}
                                  placeholder="M/D"
                                />
                              </div>
                              <div className="px-1 py-1">
                                <Select
                                  value={item.category || "Other"}
                                  onValueChange={(v) => {
                                    updateBudgetItem(idx, "category", v);
                                    // Persist immediately for selects (no blur event).
                                    queueMicrotask(() => saveBudget({
                                      ...budget,
                                      items: budget.items.map((it, i) => i === idx ? { ...it, category: v } : it),
                                    }));
                                  }}
                                >
                                  <SelectTrigger
                                    className="h-7 text-xs border-0 bg-transparent focus:bg-background focus:border focus:border-input px-2"
                                    data-testid={`select-budget-cat-${idx}`}
                                  >
                                    <SelectValue placeholder="Pick a line…" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {SCHEDULE_C_CATEGORIES.map(c => (
                                      <SelectItem key={c.label} value={c.label}>
                                        <span className="flex items-baseline gap-2">
                                          <span className="text-muted-foreground text-[10px] w-12 shrink-0">{c.line}</span>
                                          <span>{c.label}</span>
                                        </span>
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="px-1 py-1">
                                <Input
                                  className="h-7 text-xs px-2 border-0 bg-transparent focus:bg-background focus:border focus:border-input"
                                  value={item.vendor}
                                  onChange={e => updateBudgetItem(idx, "vendor", e.target.value)}
                                  onBlur={() => saveBudget(budget)}
                                  placeholder="e.g. Delta, Marriott"
                                />
                              </div>
                              <div className="px-1 py-1">
                                <Input
                                  className="h-7 text-xs tabular-nums text-right px-2 border-0 bg-transparent focus:bg-background focus:border focus:border-input"
                                  value={item.expected}
                                  onChange={e => updateBudgetItem(idx, "expected", e.target.value)}
                                  onBlur={() => saveBudget(budget)}
                                  placeholder="—"
                                  inputMode="decimal"
                                />
                              </div>
                              <div className="px-1 py-1">
                                <Input
                                  className="h-7 text-xs tabular-nums text-right px-2 border-0 bg-transparent focus:bg-background focus:border focus:border-input"
                                  value={item.actual}
                                  onChange={e => updateBudgetItem(idx, "actual", e.target.value)}
                                  onBlur={() => saveBudget(budget)}
                                  placeholder="—"
                                  inputMode="decimal"
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => removeBudgetItem(idx)}
                                className="opacity-0 group-hover:opacity-100 transition-opacity h-6 w-6 flex items-center justify-center text-muted-foreground/60 hover:text-destructive rounded"
                                aria-label="Remove row"
                                title="Remove row"
                                data-testid={`button-remove-budget-row-${idx}`}
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                            {/* Sub-row: schedule C line tag + notes */}
                            <div className="grid grid-cols-[68px_1fr_28px] items-center pb-1.5">
                              <div className="px-2 text-[10px] text-muted-foreground/70 tabular-nums">
                                {info.line}
                                {info.deductPct < 100 && (
                                  <span className="ml-1 text-amber-600 dark:text-amber-400">
                                    · {info.deductPct}% ded.
                                  </span>
                                )}
                              </div>
                              <div className="px-1">
                                <Input
                                  className="h-6 text-[11px] px-2 border-0 bg-transparent focus:bg-background focus:border focus:border-input text-muted-foreground"
                                  value={item.notes}
                                  onChange={e => updateBudgetItem(idx, "notes", e.target.value)}
                                  onBlur={() => saveBudget(budget)}
                                  placeholder="business purpose / receipt #"
                                />
                              </div>
                              <div />
                            </div>
                          </div>
                        );
                      })
                    )}
                    {/* Totals row */}
                    <div className="grid grid-cols-[68px_minmax(140px,1.3fr)_minmax(110px,1fr)_72px_72px_28px] bg-muted/30 text-xs font-semibold border-t">
                      <div className="px-2 py-2" />
                      <div className="px-2 py-2">Total</div>
                      <div className="px-2 py-2" />
                      <div className="px-2 py-2 text-right tabular-nums">
                        {totalExpected > 0 ? `$${totalExpected.toFixed(0)}` : "—"}
                      </div>
                      <div className="px-2 py-2 text-right tabular-nums">
                        {totalActual > 0 ? `$${totalActual.toFixed(0)}` : "—"}
                      </div>
                      <div />
                    </div>
                  </div>

                  {/* Add row button */}
                  <div className="-mt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
                      onClick={addBudgetItem}
                      data-testid="button-add-budget-row"
                    >
                      <Plus className="h-3 w-3" /> Add expense
                    </Button>
                  </div>

                  {/* ── Schedule C Tax Summary ─────────────────────────────── */}
                  {(totalActual > 0 || tripMiles > 0) && (
                    <div className="rounded-md border bg-card">
                      <div className="px-4 py-2.5 border-b bg-muted/30 flex items-center justify-between">
                        <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                          <FileText className="h-3.5 w-3.5" />
                          Schedule C summary
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {budget.mileageMethod === "standard" ? "Standard mileage" : "Actual vehicle"} method
                        </span>
                      </div>

                      <div className="px-4 py-3 space-y-2 text-sm">
                        {/* Per-line breakdown */}
                        {lineSummaries.length > 0 && (
                          <div className="space-y-1">
                            {lineSummaries.map(row => (
                              <div key={`${row.line}-${row.label}`} className="flex items-baseline gap-2 text-xs">
                                <span className="text-muted-foreground tabular-nums w-16 shrink-0">{row.line}</span>
                                <span className="text-foreground/80 flex-1 truncate">{row.label}</span>
                                <span className="text-muted-foreground tabular-nums">
                                  ${row.total.toFixed(0)}
                                </span>
                                {row.deductPct < 100 ? (
                                  <span className="font-medium tabular-nums text-amber-600 dark:text-amber-400 w-20 text-right">
                                    ${row.deductible.toFixed(0)} ded.
                                  </span>
                                ) : (
                                  <span className="font-medium tabular-nums w-20 text-right">
                                    ${row.deductible.toFixed(0)}
                                  </span>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Mileage row (Schedule C Line 9, if standard method) */}
                        {budget.mileageMethod === "standard" && tripMiles > 0 && (
                          <div className="flex items-baseline gap-2 text-xs pt-1 border-t">
                            <span className="text-muted-foreground tabular-nums w-16 shrink-0">Line 9</span>
                            <span className="text-foreground/80 flex-1 truncate flex items-center gap-1">
                              <Car className="h-3 w-3" />
                              Mileage <span className="text-muted-foreground">({tripMiles.toFixed(1)} mi × ${IRS_MILEAGE_RATE})</span>
                            </span>
                            <span className="text-muted-foreground tabular-nums">—</span>
                            <span className="font-medium tabular-nums w-20 text-right">
                              ${mileageDeduction.toFixed(0)}
                            </span>
                          </div>
                        )}

                        {/* Total deductible */}
                        <div className="flex items-baseline justify-between pt-2 border-t text-sm">
                          <span className="font-semibold">Total deductible</span>
                          <span className="font-bold tabular-nums text-green-600 dark:text-green-400">
                            ${totalDeductible.toFixed(2)}
                          </span>
                        </div>

                        {taxRateNum > 0 && totalDeductible > 0 && (
                          <div className="flex items-baseline justify-between text-xs text-muted-foreground">
                            <span>Estimated tax savings <span className="opacity-70">(@ {budget.taxRate}%)</span></span>
                            <span className="font-semibold tabular-nums text-green-600 dark:text-green-400">
                              ${estimatedTaxSavings.toFixed(2)}
                            </span>
                          </div>
                        )}

                        <p className="text-[11px] text-muted-foreground pt-1 leading-relaxed">
                          Logged expenses also surface on the Finances tab Schedule C export. Keep receipts
                          for any expense ≥ $75 and any lodging receipt regardless of amount.
                        </p>
                      </div>
                    </div>
                  )}

                  {/* ── Income / break-even ────────────────────────────────── */}
                  {totalActual > 0 && (
                    <div className="space-y-2">
                      <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-4 py-3 space-y-1.5">
                        <div className="flex justify-between items-baseline text-sm">
                          <span className="text-muted-foreground">Out-of-pocket</span>
                          <span className="font-semibold tabular-nums">${totalActual.toFixed(2)}</span>
                        </div>
                        <div className="flex justify-between items-baseline text-sm">
                          <span className="text-muted-foreground flex items-baseline gap-1">
                            Required revenue
                            <span className="text-[11px] opacity-60 whitespace-nowrap">to net after {budget.taxRate}% tax</span>
                          </span>
                          <span className="font-bold tabular-nums text-amber-700 dark:text-amber-400">
                            ${requiredIncome.toFixed(2)}
                          </span>
                        </div>
                        {breakEvenTunings > 0 && (
                          <div className="flex justify-between items-baseline text-xs text-muted-foreground pt-1 border-t border-amber-200 dark:border-amber-800">
                            <span>Break even</span>
                            <span className="tabular-nums">
                              <span className="font-semibold text-foreground/80">{breakEvenTunings}</span> tuning{breakEvenTunings === 1 ? "" : "s"} @ ${budget.tuningRate}
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Revenue progress */}
                      <div className="rounded-md bg-muted/40 border px-4 py-3 space-y-2">
                        <div className="flex items-center justify-between text-xs">
                          <span className="flex items-center gap-1.5 text-muted-foreground">
                            <TrendingUp className="h-3.5 w-3.5" />
                            Booked revenue
                          </span>
                          <span className="font-semibold tabular-nums">
                            ${totalRevenue.toFixed(2)}
                            <span className="text-muted-foreground font-normal"> / ${requiredIncome.toFixed(2)}</span>
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className={`h-full rounded-full transition-all ${progressPct >= 100 ? "bg-green-500" : progressPct >= 75 ? "bg-blue-500" : "bg-amber-500"}`}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                        <div className="text-xs text-right">
                          {progressPct >= 100 ? (
                            <span className="text-green-600 dark:text-green-400 font-medium">
                              ✓ Covered{surplus > 0 ? ` · +$${surplus.toFixed(0)} profit` : ""}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              {progressPct.toFixed(0)}% of break-even
                              {tuningRateNum > 0 && (
                                <> · need ${(requiredIncome - totalRevenue).toFixed(0)} more</>
                              )}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
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
  const [tripDateRange, setTripDateRange] = useState<DateRange | undefined>();
  const [tripNameAutoFilled, setTripNameAutoFilled] = useState(false);
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
  // Multiple pianos per visit (Gazelle-style): one trip-appointment row is
  // created per selected piano — same as the standard calendar dialog.
  const [selectedPianoIds, setSelectedPianoIds] = useState<string[]>([]);
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
  const [editPianoId, setEditPianoId] = useState<string>("none");
  const [editPianoCbOpen, setEditPianoCbOpen] = useState(false);
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

  // Sort trips: current/upcoming first (soonest start date first), past trips at bottom (most recent past first)
  const sortedTrips = useMemo(() => {
    if (!trips) return [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();
    return [...trips].sort((a, b) => {
      const da = parseDateStr(a.startDate);
      const db = parseDateStr(b.startDate);
      const endA = parseDateStr(a.endDate);
      const endB = parseDateStr(b.endDate);
      const aPast = !isNaN(endA.getTime()) && endA.getTime() < todayMs;
      const bPast = !isNaN(endB.getTime()) && endB.getTime() < todayMs;
      // Upcoming/active before past
      if (!aPast && bPast) return -1;
      if (aPast && !bPast) return 1;
      // Both upcoming: soonest start first
      if (!aPast && !bPast) return da.getTime() - db.getTime();
      // Both past: most recent first
      return db.getTime() - da.getTime();
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

  const { customersWithAllInactivePianos, pianosByCustomer } = useMemo(() => {
    const inactive = new Set<number>();
    const byCustomer = new Map<number, Piano>();
    if (!allPianos) return { customersWithAllInactivePianos: inactive, pianosByCustomer: byCustomer };
    const customerPianoMap = new Map<number, Piano[]>();
    allPianos.forEach((p) => {
      if (!customerPianoMap.has(p.customerId)) customerPianoMap.set(p.customerId, []);
      customerPianoMap.get(p.customerId)!.push(p);
    });
    customerPianoMap.forEach((pianosArr, custId) => {
      const activePiano = pianosArr.find(p => p.isActive !== false);
      if (activePiano) {
        byCustomer.set(custId, activePiano);
      } else if (pianosArr.length > 0) {
        inactive.add(custId);
        byCustomer.set(custId, pianosArr[0]);
      }
    });
    return { customersWithAllInactivePianos: inactive, pianosByCustomer: byCustomer };
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
      setTripDateRange(undefined);
      setTripNameAutoFilled(false);
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
    // One row per selected piano (pianoIds: [undefined] when no specific piano)
    // — mirrors the standard calendar dialog, which also saves one appointment
    // per piano section.
    mutationFn: async (data: any) => {
      const { pianoIds, ...rest } = data as { pianoIds: (number | undefined)[] } & Record<string, any>;
      for (const pianoId of pianoIds) {
        await apiRequest("POST", `/api/trips/${rest.tripId}/appointments`, { ...rest, pianoId });
      }
    },
    onSuccess: (_res, variables: any) => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips", variables.tripId, "appointments"] });
      const n = variables.pianoIds?.length ?? 1;
      toast({ title: n > 1 ? `${n} appointments added (one per piano)` : "Appointment added" });
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

  // Drag-and-drop move: dialog state + PATCH (time and, for cross-day drops, date)
  const [moveReq, setMoveReq] = useState<{
    appt: TripAppointment;
    targetDate: string;
    prevAppt: TripAppointment | null;
    tripId: number;
  } | null>(null);

  const moveApptMutation = useMutation({
    mutationFn: ({ id, date, time }: { id: number; date: string; time: string; tripId: number }) =>
      apiRequest("PATCH", `/api/trip-appointments/${id}`, { date, time }),
    onSuccess: (_res, v) => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips", v.tripId, "appointments"] });
      toast({ title: "Appointment moved" });
      setMoveReq(null);
    },
    onError: () => toast({ title: "Failed to move appointment", variant: "destructive" }),
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
    setSelectedPianoIds([]);
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
    setSelectedPianoIds([]);
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
      pianoIds: selectedPianoIds.length > 0
        ? selectedPianoIds.map(id => parseInt(id))
        : [undefined],
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
    setEditPianoId(appt.pianoId ? String(appt.pianoId) : "none");
    setEditPianoCbOpen(false);
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
        pianoId: editPianoId !== "none" ? parseInt(editPianoId) : null,
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
    if (!tripName || !tripDateRange?.from || !tripDateRange?.to) return;
    createTripMutation.mutate({
      name: tripName,
      startDate: formatDateStr(tripDateRange.from),
      endDate: formatDateStr(tripDateRange.to),
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

      {/* Overdue SLC Clients */}
      {customers && (
        <OverdueSLCClients
          customers={customers}
          pianosByCustomer={pianosByCustomer}
          customersWithAllInactivePianos={customersWithAllInactivePianos}
        />
      )}

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
              onRequestMove={(appt, targetDate, prevAppt, tripId) => setMoveReq({ appt, targetDate, prevAppt, tripId })}
            />
          ))}
        </div>
      )}

      {/* ── Drag-and-drop reschedule dialog ─────────────────────────────────── */}
      {moveReq && (() => {
        const cust = customerMap.get(moveReq.appt.customerId);
        const clientName = cust ? `${cust.firstName} ${cust.lastName}` : "Appointment";
        const targetDay = parseDateStr(moveReq.targetDate);
        const targetLabel = targetDay
          ? targetDay.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
          : moveReq.targetDate;
        let prev: MoveRequestPrev | null = null;
        if (moveReq.prevAppt) {
          const prevCust = customerMap.get(moveReq.prevAppt.customerId);
          const prevEnd = parseTimeToMinutes(moveReq.prevAppt.time || "8:00 AM")
            + parseDurationToMinutes(moveReq.prevAppt.duration || "2 hours");
          prev = {
            endMinutes: prevEnd,
            label: `${prevCust ? `${prevCust.firstName} ${prevCust.lastName}` : "previous appointment"} (ends ${formatTimeMinutes(prevEnd)})`,
            address: prevCust ? buildCustomerAddress(prevCust) : null,
          };
        }
        return (
          <MoveAppointmentDialog
            open={true}
            onOpenChange={(o) => { if (!o) setMoveReq(null); }}
            clientName={clientName}
            targetDateLabel={targetLabel}
            isDayChange={moveReq.appt.date !== moveReq.targetDate}
            prev={prev}
            toAddress={cust ? buildCustomerAddress(cust) : null}
            fallbackMinutes={parseTimeToMinutes(moveReq.appt.time || "8:00 AM")}
            onConfirm={(minutes) =>
              moveApptMutation.mutate({
                id: moveReq.appt.id,
                date: moveReq.targetDate,
                time: formatTimeMinutes(minutes),
                tripId: moveReq.tripId,
              })
            }
            isPending={moveApptMutation.isPending}
          />
        );
      })()}

      {/* ── Create Trip Dialog ──────────────────────────────────────────────── */}
      <Dialog open={createTripDialogOpen} onOpenChange={(open) => {
        setCreateTripDialogOpen(open);
        if (!open) {
          setTripName("");
          setTripDateRange(undefined);
          setTripNameAutoFilled(false);
          setTripNotes("");
        }
      }}>
        <DialogContent className="max-w-sm w-[calc(100%-2rem)]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              New Trip
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleCreateTrip} className="space-y-4">
            {/* Date Range Calendar */}
            <div className="space-y-1.5">
              <Label>Select dates</Label>
              <div className="flex justify-center border rounded-lg bg-muted/20 py-1">
                <CalendarPicker
                  mode="range"
                  selected={tripDateRange}
                  onSelect={(range) => {
                    setTripDateRange(range);
                    // Auto-fill trip name from start month if name is empty or was auto-filled
                    if (range?.from && (!tripName || tripNameAutoFilled)) {
                      const suggested = `SLC ${range.from.toLocaleDateString("en-US", { month: "long", year: "numeric" })} Trip`;
                      setTripName(suggested);
                      setTripNameAutoFilled(true);
                    }
                  }}
                  numberOfMonths={1}
                  className="p-0"
                />
              </div>
              {tripDateRange?.from && tripDateRange?.to ? (
                <p className="text-xs text-center text-muted-foreground">
                  {tripDateRange.from.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                  {" → "}
                  {tripDateRange.to.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" })}
                  {" · "}
                  <span className="font-medium text-foreground">
                    {Math.round((tripDateRange.to.getTime() - tripDateRange.from.getTime()) / (1000 * 60 * 60 * 24)) + 1} days
                  </span>
                </p>
              ) : (
                <p className="text-xs text-center text-muted-foreground/60">
                  {tripDateRange?.from ? "Now tap an end date" : "Tap a start date"}
                </p>
              )}
            </div>

            {/* Trip name */}
            <div className="space-y-1.5">
              <Label htmlFor="trip-name">Trip Name</Label>
              <Input
                id="trip-name"
                value={tripName}
                onChange={(e) => { setTripName(e.target.value); setTripNameAutoFilled(false); }}
                placeholder="e.g., SLC June 2026 Trip"
                className="text-base md:text-sm"
                data-testid="input-trip-name"
              />
            </div>

            {/* Notes */}
            <div className="space-y-1.5">
              <Label htmlFor="trip-notes">Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                id="trip-notes"
                value={tripNotes}
                onChange={(e) => setTripNotes(e.target.value)}
                placeholder="Any trip notes..."
                rows={2}
                className="text-base md:text-sm resize-none"
                data-testid="input-trip-notes"
              />
            </div>

            <DialogFooter>
              <Button variant="ghost" type="button" onClick={() => setCreateTripDialogOpen(false)}>
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={createTripMutation.isPending || !tripName || !tripDateRange?.from || !tripDateRange?.to}
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
                <Label>
                  Piano{selectedCustomerPianos.length > 1 ? "s" : ""}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    (pick multiple to service them in one visit)
                  </span>
                </Label>
                <Popover open={pianoCbOpen} onOpenChange={setPianoCbOpen}>
                  <PopoverTrigger asChild>
                    <Button
                      variant="outline"
                      role="combobox"
                      className="w-full justify-between font-normal"
                      data-testid="select-appt-piano"
                    >
                      <span className="truncate">
                        {selectedPianoIds.length === 0
                          ? "No specific piano"
                          : selectedPianoIds.length === 1
                            ? (() => {
                                const p = selectedCustomerPianos.find(p => String(p.id) === selectedPianoIds[0]);
                                return p ? [p.make, p.model, p.pianoType].filter(Boolean).join(" ") || `Piano #${p.id}` : "1 piano selected";
                              })()
                            : `${selectedPianoIds.length} pianos selected`}
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
                            onSelect={() => { setSelectedPianoIds([]); setPianoCbOpen(false); }}
                          >
                            <Check className={`mr-2 h-4 w-4 ${selectedPianoIds.length === 0 ? "opacity-100" : "opacity-0"}`} />
                            No specific piano
                          </CommandItem>
                          {selectedCustomerPianos.map((p) => {
                            const label = [p.make, p.model, p.pianoType].filter(Boolean).join(" ") || `Piano #${p.id}`;
                            const checked = selectedPianoIds.includes(String(p.id));
                            return (
                              <CommandItem
                                key={p.id}
                                value={label}
                                // Toggle without closing so several pianos can be picked
                                onSelect={() => {
                                  setSelectedPianoIds(ids =>
                                    checked
                                      ? ids.filter(id => id !== String(p.id))
                                      : [...ids, String(p.id)],
                                  );
                                }}
                              >
                                <Check className={`mr-2 h-4 w-4 ${checked ? "opacity-100" : "opacity-0"}`} />
                                {label}
                              </CommandItem>
                            );
                          })}
                        </CommandGroup>
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
                {selectedPianoIds.length > 1 && (
                  <p className="text-xs text-muted-foreground">
                    One appointment entry will be created per piano at this time slot — same as the standard calendar.
                  </p>
                )}
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

              {(() => {
                const editCustomerPianos = (allPianos ?? []).filter(
                  p => p.customerId === editingAppt.customerId,
                );
                if (editCustomerPianos.length === 0) return null;
                const current = editCustomerPianos.find(p => String(p.id) === editPianoId);
                const currentLabel = current
                  ? [current.make, current.model, current.pianoType].filter(Boolean).join(" ") || `Piano #${current.id}`
                  : "No specific piano";
                return (
                  <div className="space-y-2">
                    <Label>Piano</Label>
                    <Popover open={editPianoCbOpen} onOpenChange={setEditPianoCbOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          className="w-full justify-between font-normal"
                          data-testid="select-edit-appt-piano"
                        >
                          <span className="truncate">{currentLabel}</span>
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
                                onSelect={() => { setEditPianoId("none"); setEditPianoCbOpen(false); }}
                              >
                                <Check className={`mr-2 h-4 w-4 ${editPianoId === "none" ? "opacity-100" : "opacity-0"}`} />
                                No specific piano
                              </CommandItem>
                              {editCustomerPianos.map((p) => {
                                const label = [p.make, p.model, p.pianoType].filter(Boolean).join(" ") || `Piano #${p.id}`;
                                return (
                                  <CommandItem
                                    key={p.id}
                                    value={label}
                                    onSelect={() => { setEditPianoId(String(p.id)); setEditPianoCbOpen(false); }}
                                  >
                                    <Check className={`mr-2 h-4 w-4 ${editPianoId === String(p.id) ? "opacity-100" : "opacity-0"}`} />
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
                );
              })()}

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
