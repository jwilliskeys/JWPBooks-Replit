import { useState, useMemo } from "react";
import { formatPhone } from "@/lib/utils";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
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
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Link, useLocation } from "wouter";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Calendar,
  Clock,
  StickyNote,
  CalendarDays,
  Music,
  FileText,
  Check,
  ChevronsUpDown,
  MapPin,
  User,
  ExternalLink,
  MessageSquare,
  Pencil,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { expandAppointmentDates } from "@shared/appointment-repeat";
import type { Appointment, Customer, CalendarNote, CalendarEvent, Piano, Trip } from "@shared/schema";
import { CompleteAppointmentDialog } from "@/components/complete-appointment-dialog";
import { AppointmentDialog } from "@/components/appointment-dialog";
import { AppointmentDetailDialog } from "@/components/appointment-detail-dialog";
import { ServicePicker } from "@/components/service-picker";
import {
  DndContext,
  PointerSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  rectIntersection,
  type DragEndEvent,
} from "@dnd-kit/core";
import { MoveAppointmentDialog, type MoveRequestPrev } from "@/components/move-appointment-dialog";
import {
  TimeStepperWidget, DurationStepperWidget, MiniCalendar,
  parseMDYY, formatMDYY, formatTimeMinutes, formatDurationMinutes,
  parseTimeString, parseDurationString, DatePickerPopover,
} from "@/components/time-stepper";
import { clientName, clientSearchText } from "@shared/client-name";

/** Wraps an appointment pill so it can be dragged to another day. */
function DraggableAppt({
  id,
  className,
  style,
  children,
}: {
  id: number;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id });
  return (
    <div
      ref={setNodeRef}
      {...attributes}
      {...listeners}
      className={className}
      style={{
        ...style,
        transform: transform ? `translate3d(${transform.x}px, ${transform.y}px, 0)` : undefined,
        opacity: isDragging ? 0.6 : undefined,
        zIndex: isDragging ? 60 : (style?.zIndex as number | undefined),
        touchAction: "none",
        cursor: isDragging ? "grabbing" : undefined,
      }}
    >
      {children}
    </div>
  );
}

/** A calendar day cell/column that accepts dropped appointments. */
function DroppableDay({
  dayKey,
  className,
  style,
  onClick,
  testId,
  children,
}: {
  dayKey: string; // M/D/YY
  className?: string;
  style?: React.CSSProperties;
  onClick?: () => void;
  testId?: string;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `day:${dayKey}` });
  return (
    <div
      ref={setNodeRef}
      className={`${className ?? ""} ${isOver ? "ring-2 ring-inset ring-primary/50 bg-primary/5" : ""}`}
      style={style}
      onClick={onClick}
      data-testid={testId}
    >
      {children}
    </div>
  );
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate();
}

/** Returns the Trip if `date` falls within its inclusive start–end range, else null. */
function getTrip(date: Date, tripList: Trip[] | undefined): Trip | null {
  if (!tripList) return null;
  for (const trip of tripList) {
    const start = parseMDYY(trip.startDate);
    const end = parseMDYY(trip.endDate);
    if (!start || !end) continue;
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    if (date >= start && date <= end) return trip;
  }
  return null;
}

/** Returns "SLC" on trip days, "" otherwise. */
function getDayAreaLabel(
  date: Date,
  tripList: Trip[] | undefined,
): string {
  return getTrip(date, tripList) ? "SLC" : "";
}

/** Format appointment pill label: "9a City, ST · LastName" */
function formatPillLabel(
  time: string | null | undefined,
  customer: { city?: string | null; state?: string | null; lastName: string } | undefined,
  pianoShort?: string | null,
): string {
  const timePart = time ? formatTimeCondensed(time) : "";
  if (!customer) return timePart;
  const cityState = [customer.city, customer.state].filter(Boolean).join(", ");
  const locationPart = cityState ? `${cityState} · ` : "";
  const base = `${timePart} ${locationPart}${customer.lastName}`.trim();
  return pianoShort ? `${base} · ${pianoShort}` : base;
}

function formatTimeCondensed(timeStr: string | null | undefined): string {
  if (!timeStr) return "";
  const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return timeStr;
  const h = parseInt(match[1]);
  const m = parseInt(match[2]);
  const ampm = match[3].toLowerCase();
  return m === 0 ? `${h}${ampm}` : `${h}:${String(m).padStart(2, "0")}${ampm}`;
}

function computeEndTime(startStr: string, durationStr: string): string {
  const startMins = parseTimeString(startStr);
  const durMins = parseDurationString(durationStr);
  return formatTimeMinutes((startMins + durMins) % (24 * 60));
}

/** A Falcetti (Gazelle) shift occurrence pulled from the external calendar feed. */
interface FalcettiEvent {
  uid: string;
  title: string;
  description: string | null;
  location: string | null;
  date: string; // M/D/YY
  startTime: string | null;
  endTime: string | null;
  isAllDay: boolean;
  source: string;
}

/**
 * Real Falcetti shifts rendered as red positioned blocks in the week/day time
 * grid (at their actual start/end times from Gazelle).
 */
function FalcettiTimeBlocks({
  events,
  gridStartHour,
  hourHeight,
  size,
  onOpen,
}: {
  events: FalcettiEvent[];
  gridStartHour: number;
  hourHeight: number;
  size: "sm" | "lg";
  onOpen: (ev: FalcettiEvent) => void;
}) {
  return (
    <>
      {events.map((ev, idx) => {
        const startMin = ev.startTime ? parseTimeString(ev.startTime) : gridStartHour * 60;
        const endMin = ev.endTime ? parseTimeString(ev.endTime) : startMin + 60;
        const top = (startMin / 60 - gridStartHour) * hourHeight;
        const height = Math.max(18, ((endMin - startMin) / 60) * hourHeight);
        return (
          <div
            key={ev.uid + idx}
            className="absolute left-0 right-0 bg-rose-100/80 dark:bg-rose-950/40 border-l-2 border-rose-400 dark:border-rose-600 z-[2] overflow-hidden rounded-r-sm cursor-pointer hover:bg-rose-200/80 dark:hover:bg-rose-900/50"
            style={{ top, height }}
            onClick={(e) => { e.stopPropagation(); onOpen(ev); }}
            data-testid={`falcetti-block-${ev.uid}`}
            title={`Falcetti: ${ev.title}${ev.startTime ? ` (${ev.startTime}–${ev.endTime})` : ""}`}
          >
            <div
              className={`px-1.5 pt-1 font-semibold text-rose-600 dark:text-rose-400 leading-tight truncate ${
                size === "lg" ? "text-[11px]" : "text-[9px]"
              }`}
            >
              {ev.title}
            </div>
            {size === "lg" && ev.startTime && (
              <div className="px-1.5 text-[9px] text-rose-400 dark:text-rose-500 leading-none mt-0.5">
                {ev.startTime} – {ev.endTime}
              </div>
            )}
          </div>
        );
      })}
    </>
  );
}

function formatDateLong(dateStr: string): string {
  const parsed = parseMDYY(dateStr);
  if (!parsed) return dateStr;
  const dayName = DAY_NAMES[parsed.getDay()];
  const monthName = MONTH_NAMES[parsed.getMonth()].slice(0, 3);
  return `${dayName}, ${monthName} ${parsed.getDate()}, ${parsed.getFullYear()}`;
}

const DEFAULT_TIME_MINUTES = 9 * 60;
const DEFAULT_DURATION_MINUTES = 90;

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type DialogMode = "picker" | "appointment" | "event" | "memo" | null;

/** Metadata for a calendar event as it appears on a specific day in the grid */
interface EventDayItem {
  ev: CalendarEvent;
  isStart: boolean;
  isEnd: boolean;
}

export default function CalendarPage() {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const [, navigate] = useLocation();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [detailAppt, setDetailAppt] = useState<Appointment | null>(null);
  const [falcettiDetail, setFalcettiDetail] = useState<FalcettiEvent | null>(null);

  const [apptCustomerId, setApptCustomerId] = useState<number | null>(null);
  const [apptPianoId, setApptPianoId] = useState<number | null>(null);
  const [apptTimeMinutes, setApptTimeMinutes] = useState(DEFAULT_TIME_MINUTES);
  const [apptDurationMinutes, setApptDurationMinutes] = useState(DEFAULT_DURATION_MINUTES);
  const [apptServices, setApptServices] = useState("");
  const [apptPrice, setApptPrice] = useState("");
  const [apptNotes, setApptNotes] = useState("");
  const [apptIsTuning, setApptIsTuning] = useState(false);
  const [apptSelectedNames, setApptSelectedNames] = useState<string[]>([]);
  const [editingApptId, setEditingApptId] = useState<number | null>(null);
  const [customerComboOpen, setCustomerComboOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");

  // Event form state
  const [evTitle, setEvTitle] = useState("");
  const [evNotes, setEvNotes] = useState("");
  const [evDate, setEvDate] = useState("");
  const [evEndDate, setEvEndDate] = useState("");
  const [evIsAllDay, setEvIsAllDay] = useState(false);
  const [evStartMinutes, setEvStartMinutes] = useState(DEFAULT_TIME_MINUTES);
  const [evEndMinutes, setEvEndMinutes] = useState(DEFAULT_TIME_MINUTES + 60);
  const [evIsRepeating, setEvIsRepeating] = useState(false);
  const [evRepeatFreq, setEvRepeatFreq] = useState("weekly");
  const [evRepeatEndDate, setEvRepeatEndDate] = useState("");
  const [editingEventId, setEditingEventId] = useState<number | null>(null);

  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [showCloneInput, setShowCloneInput] = useState(false);
  const [cloneDate, setCloneDate] = useState("");
  const [completeDialogAppt, setCompleteDialogAppt] = useState<Appointment | null>(null);
  const [createApptDialogOpen, setCreateApptDialogOpen] = useState(false);
  const [createApptInitialDate, setCreateApptInitialDate] = useState("");
  const [calendarView, setCalendarView] = useState<"month" | "week" | "day" | "year">("month");
  const [weekOffset, setWeekOffset] = useState(0);
  const [dayOffset, setDayOffset] = useState(0);
  // Day tapped in the mobile month grid (drives the day agenda panel below the grid)
  const [pickedDay, setPickedDay] = useState<Date | null>(null);

  const { data: appointments, isLoading: loadingAppts } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments"],
  });

  const { data: calendarNotes, isLoading: loadingNotes } = useQuery<CalendarNote[]>({
    queryKey: ["/api/calendar-notes"],
  });

  const { data: calendarEvents } = useQuery<CalendarEvent[]>({
    queryKey: ["/api/calendar-events"],
  });

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: allPianos } = useQuery<Piano[]>({
    queryKey: ["/api/pianos"],
  });

  const { data: trips } = useQuery<Trip[]>({
    queryKey: ["/api/trips"],
  });

  const { data: appSettings } = useQuery<{ workBlockExceptions?: string | null }>({
    queryKey: ["/api/settings"],
  });

  // Real Falcetti (Gazelle) shifts imported from the company calendar feed.
  const { data: falcettiData } = useQuery<{ events: FalcettiEvent[]; configured: boolean }>({
    queryKey: ["/api/external-calendar/events"],
  });

  const customerMap = useMemo(
    () => new Map(customers?.map((c) => [c.id, c]) ?? []),
    [customers]
  );

  const pianoMap = useMemo(
    () => new Map(allPianos?.map((p) => [p.id, p]) ?? []),
    [allPianos]
  );

  const pianosByCustomer = useMemo(() => {
    const map = new Map<number, Piano[]>();
    allPianos?.forEach((p) => {
      if (!map.has(p.customerId)) map.set(p.customerId, []);
      map.get(p.customerId)!.push(p);
    });
    return map;
  }, [allPianos]);

  const selectedCustomerPianos = apptCustomerId ? (pianosByCustomer.get(apptCustomerId) ?? []) : [];

  const deleteNoteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/calendar-notes/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-notes"] });
      toast({ title: "Note deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete note", variant: "destructive" });
    },
  });

  const deleteEventMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/calendar-events/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
      toast({ title: "Event deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete event", variant: "destructive" });
    },
  });

  const saveWorkBlockExceptionsMutation = useMutation({
    mutationFn: (exceptions: string[]) =>
      apiRequest("PATCH", "/api/settings", { workBlockExceptions: JSON.stringify(exceptions) }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
    },
  });

  const createAppointmentMutation = useMutation({
    mutationFn: (data: object) => apiRequest("POST", "/api/appointments", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({ title: "Appointment scheduled" });
      closeDialog();
    },
    onError: () => {
      toast({ title: "Failed to schedule appointment", variant: "destructive" });
    },
  });

  const updateAppointmentMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) =>
      apiRequest("PATCH", `/api/appointments/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({ title: "Appointment updated" });
      closeDialog();
    },
    onError: () => {
      toast({ title: "Failed to update appointment", variant: "destructive" });
    },
  });

  const deleteAppointmentMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/appointments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({ title: "Appointment deleted" });
      closeDetailDialog();
    },
    onError: () => {
      toast({ title: "Failed to delete appointment", variant: "destructive" });
    },
  });

  const cloneAppointmentMutation = useMutation({
    mutationFn: (data: object) => apiRequest("POST", "/api/appointments", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({ title: "Appointment cloned" });
      closeDetailDialog();
    },
    onError: () => {
      toast({ title: "Failed to clone appointment", variant: "destructive" });
    },
  });

  const createEventMutation = useMutation({
    mutationFn: (data: object) => apiRequest("POST", "/api/calendar-events", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
      toast({ title: dialogMode === "memo" ? "Memo added" : "Event added" });
      closeDialog();
    },
    onError: () => {
      toast({ title: "Failed to add event", variant: "destructive" });
    },
  });

  const updateEventMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) =>
      apiRequest("PATCH", `/api/calendar-events/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-events"] });
      toast({ title: "Event updated" });
      closeDialog();
    },
    onError: () => {
      toast({ title: "Failed to update event", variant: "destructive" });
    },
  });

  const calendarDays = useMemo(() => {
    const firstDay = new Date(currentYear, currentMonth, 1);
    const lastDay = new Date(currentYear, currentMonth + 1, 0);
    const startOffset = firstDay.getDay();
    const totalDays = lastDay.getDate();

    const days: (Date | null)[] = [];
    for (let i = 0; i < startOffset; i++) days.push(null);
    for (let d = 1; d <= totalDays; d++) days.push(new Date(currentYear, currentMonth, d));
    while (days.length % 7 !== 0) days.push(null);

    return days;
  }, [currentMonth, currentYear]);

  const appointmentsByDate = useMemo(() => {
    // Repeating appointments appear on every occurrence; multi-day all-day
    // appointments appear on every spanned day. Expansion is windowed around
    // the visible year (with buffer for week-view straddles).
    const map = new Map<string, Appointment[]>();
    const rangeStart = new Date(currentYear - 1, 11, 1);
    const rangeEnd = new Date(currentYear + 1, 1, 1);
    appointments?.forEach((appt) => {
      for (const d of expandAppointmentDates(appt, rangeStart, rangeEnd)) {
        const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(appt);
      }
    });
    return map;
  }, [appointments, currentYear]);

  const notesByDate = useMemo(() => {
    const map = new Map<string, CalendarNote[]>();
    calendarNotes?.forEach((note) => {
      const parsed = parseMDYY(note.date);
      if (parsed) {
        const key = `${parsed.getFullYear()}-${parsed.getMonth()}-${parsed.getDate()}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(note);
      }
    });
    return map;
  }, [calendarNotes]);

  /**
   * Expanded event map: multi-day events appear on every date they span.
   * Each entry carries isStart/isEnd flags for rendering the banner correctly.
   */
  const eventsByDate = useMemo(() => {
    const map = new Map<string, EventDayItem[]>();
    calendarEvents?.forEach((ev) => {
      const startParsed = parseMDYY(ev.date);
      if (!startParsed) return;
      const endParsed = ev.endDate ? parseMDYY(ev.endDate) : null;

      const start = new Date(startParsed);
      start.setHours(0, 0, 0, 0);
      const end = endParsed ? new Date(endParsed) : new Date(start);
      end.setHours(0, 0, 0, 0);

      let cur = new Date(start);
      while (cur <= end) {
        const key = `${cur.getFullYear()}-${cur.getMonth()}-${cur.getDate()}`;
        const isStart = cur.getTime() === start.getTime();
        const isEnd = cur.getTime() === end.getTime();
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push({ ev, isStart, isEnd });
        cur = new Date(cur);
        cur.setDate(cur.getDate() + 1);
      }
    });
    return map;
  }, [calendarEvents]);

  function getDateKey(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  }

  // Falcetti shifts keyed by the same day-key the grid uses.
  const falcettiByDate = useMemo(() => {
    const map = new Map<string, FalcettiEvent[]>();
    (falcettiData?.events ?? []).forEach((ev) => {
      const parsed = parseMDYY(ev.date);
      if (!parsed) return;
      const d = new Date(parsed);
      d.setHours(0, 0, 0, 0);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    });
    return map;
  }, [falcettiData]);

  // ── Drag-and-drop: move an appointment to another day ──────────────────────
  const dndSensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const [calMoveReq, setCalMoveReq] = useState<{
    appt: Appointment;
    targetDate: string; // M/D/YY
    prevAppt: Appointment | null;
  } | null>(null);

  function handleCalendarDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over) return;
    const overStr = String(over.id);
    if (!overStr.startsWith("day:")) return;
    const targetDate = overStr.slice(4);
    const appt = appointments?.find(a => a.id === Number(active.id));
    if (!appt) return;
    const parsed = parseMDYY(targetDate);
    const key = parsed ? getDateKey(parsed) : "";
    // Suggest a slot after the last appointment already on the target day
    const dayList = (appointmentsByDate.get(key) ?? [])
      .filter(a => a.id !== appt.id && a.status !== "cancelled")
      .slice()
      .sort((a, b) => parseTimeString(a.time ?? "") - parseTimeString(b.time ?? ""));
    const prevAppt = dayList.length > 0 ? dayList[dayList.length - 1] : null;
    setCalMoveReq({ appt, targetDate, prevAppt });
  }

  function customerAddressOf(customerId: number): string | null {
    const c = customerMap.get(customerId);
    if (!c) return null;
    const parts = [c.address, c.city, c.state, c.zipCode].filter(Boolean) as string[];
    return parts.length > 0 ? parts.join(", ") : null;
  }

  /** Add a date key to the work-block exceptions (hides the block for that day). */
  function addWorkBlockException(dateKey: string) {
    const updated = [...workBlockExceptionSet, dateKey].filter(
      (v, i, a) => a.indexOf(v) === i
    );
    saveWorkBlockExceptionsMutation.mutate(updated);
  }

  /**
   * Returns true if the Falcetti Pianos work block (Mon–Fri 7am–3pm) should
   * render on this date: weekday, on/after June 1 2026, no SLC trip, no
   * personal/busy event, and not manually removed by the user.
   */
  function shouldShowWorkBlock(date: Date): boolean {
    const day = date.getDay();
    if (day === 0 || day === 6) return false; // weekends
    if (date < new Date(2026, 5, 1)) return false; // before June 1, 2026
    const key = getDateKey(date);
    if (workBlockExceptionSet.has(key)) return false; // manually removed
    if (getTrip(date, trips)) return false; // SLC trip in progress
    if ((falcettiByDate.get(key)?.length ?? 0) > 0) return false; // real Gazelle shift(s) shown instead
    const dayEvItems = eventsByDate.get(key) ?? [];
    if (dayEvItems.some(({ ev }) => ev.eventType === "personal")) return false; // personal/busy event
    return true;
  }

  function prevMonth() {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear(currentYear - 1);
    } else {
      setCurrentMonth(currentMonth - 1);
    }
  }

  function nextMonth() {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear(currentYear + 1);
    } else {
      setCurrentMonth(currentMonth + 1);
    }
  }

  function handleDateClick(date: Date) {
    setSelectedDate(date);
    setDialogMode("picker");
  }

  function closeDialog() {
    setDialogMode(null);
    setSelectedDate(null);
    setApptCustomerId(null);
    setApptPianoId(null);
    setApptTimeMinutes(DEFAULT_TIME_MINUTES);
    setApptDurationMinutes(DEFAULT_DURATION_MINUTES);
    setApptServices("");
    setApptPrice("");
    setApptNotes("");
    setApptIsTuning(false);
    setApptSelectedNames([]);
    setEditingApptId(null);
    setCustomerSearch("");
    setEvTitle("");
    setEvNotes("");
    setEvDate("");
    setEvEndDate("");
    setEvIsAllDay(false);
    setEvStartMinutes(DEFAULT_TIME_MINUTES);
    setEvEndMinutes(DEFAULT_TIME_MINUTES + 60);
    setEvIsRepeating(false);
    setEvRepeatFreq("weekly");
    setEvRepeatEndDate("");
    setEditingEventId(null);
  }

  function closeDetailDialog() {
    setSelectedAppt(null);
    setShowCloneInput(false);
    setCloneDate("");
  }

  function openEditAppointment(appt: Appointment) {
    // One shared Edit Appointment window app-wide (appointment-detail-dialog).
    closeDetailDialog();
    setDetailAppt(appt);
  }

  function openEditEvent(ev: CalendarEvent) {
    setEditingEventId(ev.id);
    setEvTitle(ev.title);
    setEvNotes(ev.notes ?? "");
    setEvDate(ev.date);
    setEvEndDate(ev.endDate ?? ev.date);
    setEvIsAllDay(ev.isAllDay ?? false);
    setEvStartMinutes(ev.startTime ? parseTimeString(ev.startTime) : DEFAULT_TIME_MINUTES);
    setEvEndMinutes(ev.endTime ? parseTimeString(ev.endTime) : DEFAULT_TIME_MINUTES + 60);
    setEvIsRepeating(ev.isRepeating ?? false);
    setEvRepeatFreq(ev.repeatFrequency ?? "weekly");
    setEvRepeatEndDate(ev.repeatEndDate ?? "");
    setDialogMode(ev.eventType === "memo" ? "memo" : "event");
  }

  function handleSaveAppointment() {
    if (!selectedDate || !apptCustomerId) return;
    const baseData = {
      customerId: apptCustomerId,
      pianoId: apptPianoId ?? undefined,
      date: formatMDYY(selectedDate),
      time: formatTimeMinutes(apptTimeMinutes),
      duration: formatDurationMinutes(apptDurationMinutes),
      servicesRequested: apptServices || undefined,
      priceEstimate: apptPrice || undefined,
      notes: apptNotes || undefined,
      isTuning: apptIsTuning,
    };
    if (editingApptId) {
      updateAppointmentMutation.mutate({ id: editingApptId, data: baseData });
    } else {
      createAppointmentMutation.mutate({ ...baseData, status: "scheduled" });
    }
  }

  function handleSaveEvent(type: "personal" | "memo") {
    if (!evDate || !evTitle.trim()) return;
    // Only store endDate for personal all-day events that span multiple days
    const hasRange = type === "personal" && evIsAllDay && evEndDate && evEndDate !== evDate;
    const data = {
      date: evDate,
      endDate: hasRange ? evEndDate : null,
      title: evTitle.trim(),
      notes: evNotes.trim() || undefined,
      startTime: evIsAllDay ? undefined : formatTimeMinutes(evStartMinutes),
      endTime: evIsAllDay ? undefined : formatTimeMinutes(evEndMinutes),
      isAllDay: evIsAllDay,
      isRepeating: evIsRepeating,
      repeatFrequency: evIsRepeating ? evRepeatFreq : undefined,
      repeatEndDate: evIsRepeating && evRepeatEndDate ? evRepeatEndDate : undefined,
      eventType: type,
    };
    if (editingEventId) {
      updateEventMutation.mutate({ id: editingEventId, data });
    } else {
      createEventMutation.mutate(data);
    }
  }

  const selectedCustomer = apptCustomerId ? customerMap.get(apptCustomerId) : null;

  const filteredCustomers = useMemo(() => {
    if (!customers) return [];
    const q = customerSearch.toLowerCase();
    if (!q) return customers.slice(0, 20);
    return customers
      .filter((c) =>
        clientSearchText(c).includes(q) ||
        c.phone?.includes(q) ||
        c.city?.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [customers, customerSearch]);

  const isLoading = loadingAppts || loadingNotes;

  /** Renders the appointment detail popover content (shared across views) */
  function renderApptPopoverContent(appt: Appointment) {
    const customer = customerMap.get(appt.customerId);
    const piano = appt.pianoId ? pianoMap.get(appt.pianoId) : null;
    const endTime = appt.duration ? computeEndTime(appt.time, appt.duration) : null;
    const addressParts = customer
      ? [customer.address, customer.city, customer.state, customer.zipCode].filter(Boolean)
      : [];
    const address = addressParts.join(", ");
    const mapsUrl = address ? `https://maps.google.com/?q=${encodeURIComponent(address)}` : null;
    const dateLabel = formatDateLong(appt.date);
    const customerName = customer
      ? clientName(customer)
      : `Client #${appt.customerId}`;
    const pianoLabel = piano
      ? [piano.make, piano.model, piano.pianoType].filter(Boolean).join(" ") || `Piano #${piano.id}`
      : null;

    return (
      <div>
        {/* Teal header */}
        <div className="bg-sky-50 dark:bg-sky-950/40 px-4 pt-4 pb-3 space-y-2 border-b border-sky-100 dark:border-sky-900">
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <p className="text-[9px] font-bold tracking-widest text-sky-500 dark:text-sky-400 uppercase mb-0.5">
                Appointment
              </p>
              <h2 className="text-lg font-bold text-sky-900 dark:text-sky-100 leading-tight break-words">
                {customerName}
              </h2>
            </div>
            <button
              onClick={closeDetailDialog}
              className="text-sky-400 hover:text-sky-600 dark:text-sky-500 dark:hover:text-sky-300 p-0.5 rounded shrink-0 mt-0.5"
              data-testid="button-detail-close"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-1 text-xs text-sky-800 dark:text-sky-200">
            <div className="flex items-center gap-1.5">
              <Calendar className="h-3 w-3 shrink-0" />
              <span>{dateLabel}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Clock className="h-3 w-3 shrink-0" />
              <span>
                {appt.isAllDay ? "All day" : formatTimeCondensed(appt.time)}
                {endTime ? ` – ${formatTimeCondensed(endTime)}` : ""}
                {appt.duration ? ` (${appt.duration})` : ""}
              </span>
            </div>
            {address && mapsUrl && (
              <div className="flex items-start gap-1.5">
                <MapPin className="h-3 w-3 shrink-0 mt-0.5" />
                <a
                  href={mapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="underline hover:text-sky-600 dark:hover:text-sky-300 break-words"
                  data-testid="link-appt-address"
                >
                  {address}
                </a>
              </div>
            )}
          </div>

          {/* Action row */}
          <div className="flex items-center justify-between gap-1 pt-0.5">
            <div className="flex items-center gap-1">
              <Button
                size="sm"
                variant="outline"
                onClick={() => openEditAppointment(appt)}
                className="h-6 text-[10px] px-2 border-sky-300 dark:border-sky-700 text-sky-800 dark:text-sky-200 hover:bg-sky-100 dark:hover:bg-sky-900"
                data-testid="button-appt-edit"
              >
                Edit
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => { setSelectedAppt(appt); setShowCloneInput(!showCloneInput); }}
                className="h-6 text-[10px] px-2 border-sky-300 dark:border-sky-700 text-sky-800 dark:text-sky-200 hover:bg-sky-100 dark:hover:bg-sky-900"
                data-testid="button-appt-clone"
              >
                Clone
              </Button>
              {(appt.status === "scheduled" || !appt.status) && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => { setCompleteDialogAppt(appt); closeDetailDialog(); }}
                  className="h-6 text-[10px] px-2 border-sky-300 dark:border-sky-700 text-sky-800 dark:text-sky-200 hover:bg-sky-100 dark:hover:bg-sky-900"
                  data-testid="button-appt-complete"
                >
                  Complete
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={() => navigate(`/invoices/new?appointmentId=${appt.id}`)}
                className="h-6 text-[10px] px-2 border-sky-300 dark:border-sky-700 text-sky-800 dark:text-sky-200 hover:bg-sky-100 dark:hover:bg-sky-900"
                data-testid="button-appt-invoice"
              >
                Invoice
              </Button>
            </div>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => deleteAppointmentMutation.mutate(appt.id)}
              disabled={deleteAppointmentMutation.isPending}
              className="h-6 text-[10px] px-2 text-destructive hover:text-destructive hover:bg-destructive/10"
              data-testid="button-appt-delete"
            >
              Delete
            </Button>
          </div>

          {/* Clone date picker */}
          {showCloneInput && selectedAppt?.id === appt.id && (
            <div className="space-y-1.5 pt-1">
              <p className="text-[10px] text-sky-700 dark:text-sky-300 font-medium">
                Pick a date for the clone
              </p>
              <MiniCalendar
                value={cloneDate || undefined}
                onChange={setCloneDate}
                data-testid="mini-cal-clone-date"
              />
              <Button
                size="sm"
                className="w-full text-xs h-7"
                onClick={() => {
                  if (!cloneDate) return;
                  cloneAppointmentMutation.mutate({
                    customerId: appt.customerId,
                    pianoId: appt.pianoId ?? undefined,
                    date: cloneDate,
                    time: appt.time,
                    duration: appt.duration ?? undefined,
                    servicesRequested: appt.servicesRequested ?? undefined,
                    priceEstimate: appt.priceEstimate ?? undefined,
                    notes: appt.notes ?? undefined,
                    isTuning: appt.isTuning ?? false,
                    status: "scheduled",
                  });
                }}
                disabled={!cloneDate || cloneAppointmentMutation.isPending}
                data-testid="button-clone-confirm"
              >
                Clone to {cloneDate || "selected date"}
              </Button>
            </div>
          )}
        </div>

        {/* Body */}
        <div className="px-4 py-3 space-y-3 max-h-56 overflow-y-auto">
          <div>
            <Link href={`/customers/${appt.customerId}`} onClick={closeDetailDialog}>
              <div className="flex items-center gap-1.5 text-sm cursor-pointer hover:text-primary transition-colors" data-testid="link-appt-client">
                <User className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="font-semibold">{customerName}</span>
                <ExternalLink className="h-3 w-3 text-muted-foreground" />
              </div>
            </Link>
          </div>

          {appt.notes && (
            <div>
              <p className="text-[9px] font-bold tracking-widest text-muted-foreground uppercase mb-1">Notes</p>
              <div className="flex items-start gap-1.5">
                <MessageSquare className="h-3.5 w-3.5 text-muted-foreground shrink-0 mt-0.5" />
                <p className="text-xs whitespace-pre-wrap leading-relaxed">{appt.notes}</p>
              </div>
            </div>
          )}

          {(pianoLabel || appt.servicesRequested || appt.priceEstimate) && (
            <div>
              <p className="text-[9px] font-bold tracking-widest text-muted-foreground uppercase mb-1">
                {pianoLabel ? "Piano & Services" : "Services"}
              </p>
              {pianoLabel && (
                <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                  <Music className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="font-semibold text-xs">{pianoLabel}</span>
                  {appt.isTuning && (
                    <Badge className="text-[9px] h-4 bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700">
                      TUNING
                    </Badge>
                  )}
                </div>
              )}
              {appt.servicesRequested && (
                <p className="text-xs text-muted-foreground ml-5">• {appt.servicesRequested}{appt.priceEstimate ? ` (${appt.priceEstimate})` : ""}</p>
              )}
              {!appt.servicesRequested && appt.priceEstimate && (
                <p className="text-xs text-muted-foreground ml-5">Price: {appt.priceEstimate}</p>
              )}
            </div>
          )}
        </div>
      </div>
    );
  }

  // Week view: 7 days starting from Sunday of (today + weekOffset weeks)
  const weekDays = useMemo(() => {
    const base = new Date(today);
    base.setDate(base.getDate() - base.getDay() + weekOffset * 7);
    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(base);
      d.setDate(base.getDate() + i);
      return d;
    });
  }, [weekOffset]);

  // Day view: today + dayOffset
  const dayViewDate = useMemo(() => {
    const d = new Date(today);
    d.setDate(d.getDate() + dayOffset);
    return d;
  }, [dayOffset]);

  // Compute span count for the event dialog label (must be before early return)
  const evSpanDays = useMemo(() => {
    if (!evDate || !evEndDate || evEndDate <= evDate) return 1;
    const start = parseMDYY(evDate);
    const end = parseMDYY(evEndDate);
    if (!start || !end) return 1;
    return Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  }, [evDate, evEndDate]);

  // Parse persisted work-block exceptions from settings
  const workBlockExceptionSet = useMemo(() => {
    try {
      return new Set<string>(JSON.parse(appSettings?.workBlockExceptions ?? "[]"));
    } catch {
      return new Set<string>();
    }
  }, [appSettings]);

  // Time grid constants
  const GRID_START_HOUR = 7;   // 7 AM
  const GRID_END_HOUR = 20;    // 8 PM
  const HOUR_HEIGHT = 56;      // px per hour
  const WORK_BLOCK_START_HOUR = 7;  // 7 AM
  const WORK_BLOCK_END_HOUR = 15;   // 3 PM

  /** Returns top offset + height in px for a time-grid appointment */
  function apptGridPosition(timeStr: string | null | undefined, durationStr: string | null | undefined) {
    const startMins = timeStr ? parseTimeString(timeStr) : GRID_START_HOUR * 60;
    const durMins = durationStr ? parseDurationString(durationStr) : DEFAULT_DURATION_MINUTES;
    const clampedStart = Math.max(startMins, GRID_START_HOUR * 60);
    const top = ((clampedStart - GRID_START_HOUR * 60) / 60) * HOUR_HEIGHT;
    const height = Math.max((durMins / 60) * HOUR_HEIGHT, 20);
    return { top, height };
  }

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 max-w-6xl mx-auto">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  // Which day the mobile month grid has selected: the tapped day if it's in the
  // visible month, otherwise today (if visible), otherwise the 1st of the month.
  const dayInCurrentMonth = (d: Date) => d.getMonth() === currentMonth && d.getFullYear() === currentYear;
  const displayPickedDay =
    pickedDay && dayInCurrentMonth(pickedDay)
      ? pickedDay
      : dayInCurrentMonth(today)
      ? today
      : new Date(currentYear, currentMonth, 1);

  const selectedDateLabel = selectedDate
    ? `${MONTH_NAMES[selectedDate.getMonth()]} ${selectedDate.getDate()}, ${selectedDate.getFullYear()}`
    : "";

  /** True if this event should render as a spanning banner (multi-day personal all-day) */
  function isSpanningEvent(ev: CalendarEvent): boolean {
    return ev.eventType === "personal" && !!ev.isAllDay && !!ev.endDate && ev.endDate !== ev.date;
  }

  /** Renders a single event item in the desktop grid cell */
  function renderGridEventItem(item: EventDayItem, dateKey: string) {
    const { ev, isStart, isEnd } = item;
    const isMemo = ev.eventType === "memo";

    if (isSpanningEvent(ev)) {
      // Multi-day all-day personal event — render as a continuous banner strip
      const roundL = isStart ? "rounded-l-[3px]" : "rounded-l-none";
      const roundR = isEnd ? "rounded-r-[3px]" : "rounded-r-none";
      const marginL = isStart ? "" : "-ml-[1px]";
      const marginR = isEnd ? "" : "-mr-[1px]";
      return (
        <div
          key={`${ev.id}-${dateKey}`}
          className={`h-[14px] text-[9px] leading-[14px] cursor-pointer select-none mt-px truncate px-1
            bg-violet-200 dark:bg-violet-800/70 text-violet-700 dark:text-violet-200
            border-y border-violet-300 dark:border-violet-600
            ${isStart ? "border-l" : "border-l-0"} ${isEnd ? "border-r" : "border-r-0"}
            ${roundL} ${roundR} ${marginL} ${marginR}`}
          onClick={() => openEditEvent(ev)}
          data-testid={`calendar-event-${ev.id}-${dateKey}`}
        >
          {isStart ? ev.title : " "}
        </div>
      );
    }

    // Single-day or timed event — badge style (only render on isStart to prevent duplication)
    return (
      <div
        key={`${ev.id}-${dateKey}`}
        className="flex items-center gap-0.5 group"
        data-testid={`calendar-event-${ev.id}-${dateKey}`}
      >
        <Badge
          variant="outline"
          className={`text-[10px] leading-tight flex-1 min-w-0 justify-start italic cursor-pointer ${
            isMemo
              ? "text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-600"
              : "text-violet-600 dark:text-violet-400 border-violet-300 dark:border-violet-600"
          }`}
          onClick={() => openEditEvent(ev)}
        >
          <span className="truncate">
            {ev.startTime && !ev.isAllDay ? `${formatTimeCondensed(ev.startTime)} ` : ""}{ev.title}
          </span>
        </Badge>
        {isStart && (
          <button
            className="shrink-0 h-4 w-4 flex items-center justify-center rounded-sm text-muted-foreground invisible group-hover:visible hover:text-destructive"
            onClick={(e) => {
              e.stopPropagation();
              deleteEventMutation.mutate(ev.id);
            }}
            data-testid={`button-delete-event-${ev.id}`}
          >
            <X className="h-3 w-3" />
          </button>
        )}
      </div>
    );
  }

  /** Renders a single event item in the mobile agenda view (start day only for multi-day) */
  function renderAgendaEventItem(item: EventDayItem) {
    const { ev, isStart } = item;
    const isMemo = ev.eventType === "memo";

    // For multi-day events, only show on the start day to avoid repetition
    const multiDay = !!ev.endDate && ev.endDate !== ev.date;
    if (multiDay && !isStart) return null;

    const endLabel = ev.endDate && ev.endDate !== ev.date ? ` – ${ev.endDate}` : "";

    return (
      <div
        key={ev.id}
        className="flex items-center justify-between gap-1 text-xs p-1.5 rounded-md"
        data-testid={`calendar-event-${ev.id}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {isMemo ? (
            <FileText className="h-3 w-3 shrink-0 text-blue-500 dark:text-blue-400" />
          ) : (
            <CalendarDays className="h-3 w-3 shrink-0 text-violet-500 dark:text-violet-400" />
          )}
          <span className="italic text-muted-foreground truncate">
            {ev.startTime && !ev.isAllDay ? `${formatTimeCondensed(ev.startTime)} ` : ""}
            {ev.title}
            {endLabel ? ` ${endLabel}` : ""}
          </span>
        </div>
        <div className="flex items-center gap-0.5 shrink-0">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={() => openEditEvent(ev)}
          >
            <Pencil className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={(e) => {
              e.stopPropagation();
              deleteEventMutation.mutate(ev.id);
            }}
            data-testid={`button-delete-event-${ev.id}`}
          >
            <X className="h-3 w-3" />
          </Button>
        </div>
      </div>
    );
  }

  /** Renders one day's appointments/notes/events as a card (mobile month panel, week, day views) */
  function renderDayAgendaCard(date: Date) {
    const key = getDateKey(date);
    const dayAppts = (appointmentsByDate.get(key) ?? []).slice().sort((a, b) => parseTimeString(a.time ?? "") - parseTimeString(b.time ?? ""));
    const dayNotes = notesByDate.get(key) ?? [];
    const dayEventItems = eventsByDate.get(key) ?? [];
    const dayFalcetti = falcettiByDate.get(key) ?? [];
    const showOnCall = shouldShowWorkBlock(date);
    const isToday = isSameDay(date, today);
    const apptCount = dayAppts.filter((a) => a.status !== "cancelled").length;
    const isEmpty =
      dayAppts.length === 0 &&
      dayNotes.length === 0 &&
      dayEventItems.length === 0 &&
      dayFalcetti.length === 0 &&
      !showOnCall;

    return (
      <Card key={key} data-testid={`agenda-day-${key}`}>
        <CardContent className="py-3 px-4">
          <div className="flex items-center justify-between gap-2 mb-2">
            <div className="flex items-baseline gap-2 min-w-0">
              <span className={`text-sm font-semibold ${isToday ? "text-primary" : ""}`}>
                {DAY_NAMES[date.getDay()]}, {MONTH_NAMES[date.getMonth()]} {date.getDate()}
              </span>
              <span className="text-xs text-muted-foreground shrink-0">
                {apptCount} appointment{apptCount === 1 ? "" : "s"}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 h-7"
              onClick={() => handleDateClick(date)}
              data-testid={`button-add-note-${key}`}
            >
              <Plus className="h-4 w-4" />
              Add
            </Button>
          </div>
          <div className="space-y-1">
            {isEmpty && (
              <p className="text-xs text-muted-foreground py-2">Nothing scheduled — tap Add to book.</p>
            )}
            {dayFalcetti.map((fev, fi) => (
              <div
                key={fev.uid + fi}
                className="flex items-center gap-2 text-xs p-1.5 rounded-md bg-rose-50 dark:bg-rose-950/20 cursor-pointer hover:bg-rose-100 dark:hover:bg-rose-950/40"
                data-testid={`falcetti-agenda-${fev.uid}`}
                onClick={() => setFalcettiDetail(fev)}
              >
                <Clock className="h-3 w-3 shrink-0 text-rose-500" />
                <span className="text-rose-600 dark:text-rose-400 font-medium truncate">
                  {fev.isAllDay || !fev.startTime ? fev.title : `${fev.startTime}–${fev.endTime} · ${fev.title}`}
                </span>
              </div>
            ))}
            {showOnCall && (
              <div className="flex items-center gap-2 text-xs p-1.5 rounded-md" data-testid={`oncall-agenda-${key}`}>
                <Clock className="h-3 w-3 shrink-0 text-slate-400" />
                <span className="text-slate-400 dark:text-slate-500">7:00 AM–3:00 PM · Falcetti (tentative)</span>
              </div>
            )}
            {dayAppts.map((appt) => {
              const customer = customerMap.get(appt.customerId);
              const piano = appt.pianoId ? pianoMap.get(appt.pianoId) : null;
              const pianoLabel = piano ? ([piano.make, piano.model].filter(Boolean).join(" ") || null) : null;
              const isCompleted = appt.status === "completed";
              const isCancelled = appt.status === "cancelled";
              return (
                <div
                  key={appt.id}
                  className={`flex items-center gap-2 text-xs p-1.5 rounded-md cursor-pointer hover:bg-muted/50 ${isCompleted || isCancelled ? "opacity-60" : ""}`}
                  onClick={() => setDetailAppt(appt)}
                  data-testid={`calendar-appointment-${appt.id}`}
                >
                  <Clock className="h-3 w-3 shrink-0 text-sky-500" />
                  <span className={isCompleted || isCancelled ? "line-through" : ""}>
                    {formatPillLabel(appt.isAllDay ? "All day" : appt.time, customer ? { city: customer.city, state: customer.state, lastName: clientName(customer) } : undefined, pianoLabel)}
                  </span>
                  {isCancelled && <span className="text-[10px] text-destructive uppercase tracking-wide">cancelled</span>}
                </div>
              );
            })}
            {dayNotes.map((note) => (
              <div
                key={note.id}
                className="flex items-center justify-between gap-1 text-xs p-1.5 rounded-md"
                data-testid={`calendar-note-${note.id}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <StickyNote className="h-3 w-3 shrink-0 text-amber-500 dark:text-amber-400" />
                  <span className="italic text-muted-foreground truncate">{note.title}</span>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteNoteMutation.mutate(note.id);
                  }}
                  data-testid={`button-delete-note-${note.id}`}
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
            {dayEventItems.map((item) => renderAgendaEventItem(item))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <DndContext sensors={dndSensors} collisionDetection={rectIntersection} onDragEnd={handleCalendarDragEnd}>
    <div className="p-4 sm:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight" data-testid="text-calendar-title">
          Calendar
        </h1>
        <div className="flex items-center gap-2 flex-wrap">
          {/* View switcher */}
          <div className="flex rounded-md border border-border overflow-hidden text-xs">
            {(["day", "week", "month", "year"] as const).map((v) => (
              <button
                key={v}
                onClick={() => setCalendarView(v)}
                className={`px-3 py-1.5 capitalize font-medium transition-colors ${
                  calendarView === v
                    ? "bg-primary text-primary-foreground"
                    : "bg-background text-muted-foreground hover:bg-muted"
                }`}
                data-testid={`button-view-${v}`}
              >
                {v}
              </button>
            ))}
          </div>

          {/* Nav arrows + label */}
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (calendarView === "year") setCurrentYear(currentYear - 1);
                else if (calendarView === "month") prevMonth();
                else if (calendarView === "week") setWeekOffset(weekOffset - 1);
                else setDayOffset(dayOffset - 1);
              }}
              data-testid="button-prev"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm font-medium min-w-[160px] text-center" data-testid="text-current-period">
              {calendarView === "month" && `${MONTH_NAMES[currentMonth]} ${currentYear}`}
              {calendarView === "week" && (() => {
                const s = weekDays[0], e = weekDays[6];
                const sm = MONTH_NAMES[s.getMonth()].slice(0, 3);
                const em = MONTH_NAMES[e.getMonth()].slice(0, 3);
                return sm === em
                  ? `${sm} ${s.getDate()}–${e.getDate()}, ${s.getFullYear()}`
                  : `${sm} ${s.getDate()} – ${em} ${e.getDate()}, ${e.getFullYear()}`;
              })()}
              {calendarView === "day" && `${DAY_NAMES[dayViewDate.getDay()]}, ${MONTH_NAMES[dayViewDate.getMonth()]} ${dayViewDate.getDate()}`}
              {calendarView === "year" && `${currentYear}`}
            </span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                if (calendarView === "year") setCurrentYear(currentYear + 1);
                else if (calendarView === "month") nextMonth();
                else if (calendarView === "week") setWeekOffset(weekOffset + 1);
                else setDayOffset(dayOffset + 1);
              }}
              data-testid="button-next"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* ═══════════ WEEK VIEW ═══════════ */}
      {!isMobile && calendarView === "week" && (
        <Card data-testid="calendar-week-view">
          <CardContent className="p-0 overflow-auto">
            {/* Day header row */}
            <div className="grid grid-cols-[56px_repeat(7,1fr)] border-b border-border/50">
              <div className="border-r border-border/30" />
              {weekDays.map((d) => {
                const isToday = isSameDay(d, today);
                return (
                  <div
                    key={getDateKey(d)}
                    className={`text-center py-2 border-r last:border-r-0 border-border/30 ${isToday ? "bg-primary/5" : ""}`}
                  >
                    <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                      {DAY_NAMES[d.getDay()]}
                    </div>
                    <div className={`text-sm font-semibold leading-tight ${isToday ? "text-primary" : ""}`}>
                      {d.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Time grid */}
            <div className="grid grid-cols-[56px_repeat(7,1fr)]">
              {/* Hour labels */}
              <div className="border-r border-border/30">
                {Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => (
                  <div
                    key={i}
                    style={{ height: HOUR_HEIGHT }}
                    className="flex items-start justify-end pr-2 pt-0.5 border-b border-border/20"
                  >
                    <span className="text-[10px] text-muted-foreground">
                      {GRID_START_HOUR + i < 12 ? `${GRID_START_HOUR + i}a` : GRID_START_HOUR + i === 12 ? "12p" : `${GRID_START_HOUR + i - 12}p`}
                    </span>
                  </div>
                ))}
              </div>

              {/* Day columns */}
              {weekDays.map((d) => {
                const key = getDateKey(d);
                const dayAppts = (appointmentsByDate.get(key) ?? []).slice().sort((a, b) => parseTimeString(a.time ?? "") - parseTimeString(b.time ?? ""));
                const isToday = isSameDay(d, today);
                const isTripDay = !!getTrip(d, trips);
                return (
                  <DroppableDay
                    key={key}
                    dayKey={formatMDYY(d)}
                    className={`relative border-r last:border-r-0 border-border/30 ${isToday ? "bg-primary/5" : isTripDay ? "bg-green-50 dark:bg-green-950/20" : ""}`}
                    style={{ height: (GRID_END_HOUR - GRID_START_HOUR) * HOUR_HEIGHT }}
                    onClick={() => handleDateClick(d)}
                    testId={`week-cell-${key}`}
                  >
                    {/* Hour grid lines */}
                    {Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => (
                      <div
                        key={i}
                        className="absolute w-full border-b border-border/20"
                        style={{ top: i * HOUR_HEIGHT }}
                      />
                    ))}
                    {/* ── Real Falcetti (Gazelle) shifts ── */}
                    <FalcettiTimeBlocks
                      events={falcettiByDate.get(key) ?? []}
                      gridStartHour={GRID_START_HOUR}
                      hourHeight={HOUR_HEIGHT}
                      size="sm"
                      onOpen={setFalcettiDetail}
                    />
                    {/* ── Default "on call" block (weekdays with nothing on Gazelle) ── */}
                    {shouldShowWorkBlock(d) && (
                      <div
                        className="absolute left-0 right-0 bg-slate-100/60 dark:bg-slate-800/30 border-r-2 border-dashed border-slate-300 dark:border-slate-700 z-[1] group"
                        style={{
                          top: (WORK_BLOCK_START_HOUR - GRID_START_HOUR) * HOUR_HEIGHT,
                          height: (WORK_BLOCK_END_HOUR - WORK_BLOCK_START_HOUR) * HOUR_HEIGHT,
                        }}
                        onClick={(e) => e.stopPropagation()}
                        data-testid={`week-work-block-${key}`}
                      >
                        <div className="flex items-center justify-between px-1.5 pt-1">
                          <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 leading-none truncate">
                            Falcetti
                          </span>
                          <button
                            className="h-3.5 w-3.5 flex items-center justify-center text-slate-400 invisible group-hover:visible hover:text-slate-700 shrink-0"
                            title="Remove this day's on-call block"
                            onClick={(e) => { e.stopPropagation(); addWorkBlockException(key); }}
                          >
                            <X className="h-2.5 w-2.5" />
                          </button>
                        </div>
                        <div className="px-1.5 mt-0.5">
                          <span className="text-[8px] text-slate-400 dark:text-slate-500 leading-none">7am – 3pm (tentative)</span>
                        </div>
                      </div>
                    )}
                    {/* Appointments */}
                    {dayAppts.map((appt) => {
                      const customer = customerMap.get(appt.customerId);
                      const piano = appt.pianoId ? pianoMap.get(appt.pianoId) : null;
                      const pianoShort = piano ? ([piano.make, piano.model].filter(Boolean).join(" ") || null) : null;
                      const endTime = appt.duration ? computeEndTime(appt.time, appt.duration) : null;
                      const { top, height } = apptGridPosition(appt.time, appt.duration);
                      const isCompleted = appt.status === "completed";
                      const isOpen = selectedAppt?.id === appt.id;
                      const cityLastName = [customer?.city, customer?.lastName].filter(Boolean).join(" · ");
                      const fullName = customer ? clientName(customer) : "";
                      return (
                        <DraggableAppt
                          key={appt.id}
                          id={appt.id}
                          className="absolute left-0.5 right-0.5 z-10"
                          style={{ top, height: Math.max(height, 24) }}
                        >
                        <Popover open={isOpen} onOpenChange={(open) => { if (!open) closeDetailDialog(); }}>
                          <PopoverTrigger asChild>
                            <button
                              className={`block w-full h-full rounded-md px-2 py-1 text-left overflow-hidden cursor-pointer transition-colors ${
                                isCompleted
                                  ? "bg-muted text-muted-foreground border border-border/50"
                                  : "bg-sky-500 hover:bg-sky-600 text-white"
                              }`}
                              onClick={(e) => { e.stopPropagation(); setDetailAppt(appt); }}
                              data-testid={`week-appt-${appt.id}`}
                            >
                              {/* Time range */}
                              <div className={`text-[9px] font-medium leading-tight truncate ${isCompleted ? "opacity-60" : "opacity-80"}`}>
                                {appt.isAllDay ? "All day" : `${formatTimeCondensed(appt.time)}${endTime ? `–${formatTimeCondensed(endTime)}` : ""}`}
                              </div>
                              {/* City · LastName title */}
                              <div className={`text-[11px] font-semibold leading-tight truncate ${isCompleted ? "line-through opacity-70" : ""}`}>
                                {cityLastName || customer?.lastName || ""}
                              </div>
                              {/* Full name (if room) */}
                              {height >= 56 && fullName && (
                                <div className={`text-[10px] leading-tight truncate ${isCompleted ? "opacity-50" : "opacity-80"}`}>
                                  {fullName}
                                </div>
                              )}
                              {/* Piano (if room) */}
                              {height >= 72 && pianoShort && (
                                <div className={`text-[10px] leading-tight truncate ${isCompleted ? "opacity-40" : "opacity-70"}`}>
                                  {pianoShort}
                                </div>
                              )}
                            </button>
                          </PopoverTrigger>
                          <PopoverPrimitive.Portal>
                            <PopoverPrimitive.Content
                              side="bottom"
                              align="start"
                              sideOffset={6}
                              className="z-50 w-80 rounded-lg border bg-popover text-popover-foreground shadow-lg outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 origin-[--radix-popover-content-transform-origin] p-0 overflow-hidden"
                            >
                              <PopoverPrimitive.Arrow className="fill-border" width={12} height={6} />
                              {renderApptPopoverContent(appt)}
                            </PopoverPrimitive.Content>
                          </PopoverPrimitive.Portal>
                        </Popover>
                        </DraggableAppt>
                      );
                    })}
                  </DroppableDay>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══════════ DAY VIEW ═══════════ */}
      {!isMobile && calendarView === "day" && (
        <Card data-testid="calendar-day-view">
          <CardContent className="p-0 overflow-auto">
            {/* Header */}
            <div className="grid grid-cols-[56px_1fr] border-b border-border/50">
              <div className="border-r border-border/30" />
              <div className={`py-3 px-4 ${isSameDay(dayViewDate, today) ? "bg-primary/5" : !!getTrip(dayViewDate, trips) ? "bg-green-50 dark:bg-green-950/20" : ""}`}>
                <div className="text-[10px] font-medium text-muted-foreground uppercase tracking-wide">
                  {DAY_NAMES[dayViewDate.getDay()]}
                </div>
                <div className={`text-xl font-bold leading-tight ${isSameDay(dayViewDate, today) ? "text-primary" : ""}`}>
                  {MONTH_NAMES[dayViewDate.getMonth()]} {dayViewDate.getDate()}, {dayViewDate.getFullYear()}
                </div>
                {getDayAreaLabel(dayViewDate, trips) && (
                  <span className="text-[9px] font-semibold uppercase tracking-wide text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/40 px-1 py-0.5 rounded">
                    {getDayAreaLabel(dayViewDate, trips)}
                  </span>
                )}
              </div>
            </div>

            {/* Time grid */}
            <div className="grid grid-cols-[56px_1fr]">
              <div className="border-r border-border/30">
                {Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => (
                  <div
                    key={i}
                    style={{ height: HOUR_HEIGHT }}
                    className="flex items-start justify-end pr-2 pt-0.5 border-b border-border/20"
                  >
                    <span className="text-[10px] text-muted-foreground">
                      {GRID_START_HOUR + i < 12 ? `${GRID_START_HOUR + i}a` : GRID_START_HOUR + i === 12 ? "12p" : `${GRID_START_HOUR + i - 12}p`}
                    </span>
                  </div>
                ))}
              </div>

              <div
                className={`relative ${isSameDay(dayViewDate, today) ? "bg-primary/5" : !!getTrip(dayViewDate, trips) ? "bg-green-50 dark:bg-green-950/20" : ""}`}
                style={{ height: (GRID_END_HOUR - GRID_START_HOUR) * HOUR_HEIGHT }}
                onClick={() => handleDateClick(dayViewDate)}
                data-testid={`day-column-${getDateKey(dayViewDate)}`}
              >
                {Array.from({ length: GRID_END_HOUR - GRID_START_HOUR }, (_, i) => (
                  <div key={i} className="absolute w-full border-b border-border/20" style={{ top: i * HOUR_HEIGHT }} />
                ))}
                {/* ── Real Falcetti (Gazelle) shifts ── */}
                <FalcettiTimeBlocks
                  events={falcettiByDate.get(getDateKey(dayViewDate)) ?? []}
                  gridStartHour={GRID_START_HOUR}
                  hourHeight={HOUR_HEIGHT}
                  size="lg"
                  onOpen={setFalcettiDetail}
                />
                {/* ── Default "on call" block (weekday with nothing on Gazelle) ── */}
                {shouldShowWorkBlock(dayViewDate) && (() => {
                  const wbKey = getDateKey(dayViewDate);
                  return (
                    <div
                      className="absolute left-0 right-0 bg-slate-100/60 dark:bg-slate-800/30 border-r-2 border-dashed border-slate-300 dark:border-slate-700 z-[1] group"
                      style={{
                        top: (WORK_BLOCK_START_HOUR - GRID_START_HOUR) * HOUR_HEIGHT,
                        height: (WORK_BLOCK_END_HOUR - WORK_BLOCK_START_HOUR) * HOUR_HEIGHT,
                      }}
                      onClick={(e) => e.stopPropagation()}
                      data-testid={`day-work-block-${wbKey}`}
                    >
                      <div className="flex items-center justify-between px-2 pt-1.5">
                        <div>
                          <div className="text-[11px] font-medium text-slate-400 dark:text-slate-500 leading-tight">
                            Falcetti
                          </div>
                          <div className="text-[9px] text-slate-400 dark:text-slate-500 leading-none mt-0.5">
                            7:00 AM – 3:00 PM (tentative)
                          </div>
                        </div>
                        <button
                          className="h-5 w-5 flex items-center justify-center rounded text-slate-400 invisible group-hover:visible hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800/60 shrink-0"
                          title="Remove this day's on-call block"
                          onClick={(e) => { e.stopPropagation(); addWorkBlockException(wbKey); }}
                        >
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  );
                })()}
                {(() => {
                  const key = getDateKey(dayViewDate);
                  const dayAppts = (appointmentsByDate.get(key) ?? []).slice().sort((a, b) => parseTimeString(a.time ?? "") - parseTimeString(b.time ?? ""));
                  return dayAppts.map((appt) => {
                    const customer = customerMap.get(appt.customerId);
                    const piano = appt.pianoId ? pianoMap.get(appt.pianoId) : null;
                    const pianoShort = piano ? ([piano.make, piano.model].filter(Boolean).join(" ") || null) : null;
                    const { top, height } = apptGridPosition(appt.time, appt.duration);
                    const isCompleted = appt.status === "completed";
                    const isOpen = selectedAppt?.id === appt.id;
                    return (
                      <Popover key={appt.id} open={isOpen} onOpenChange={(open) => { if (!open) closeDetailDialog(); }}>
                        <PopoverTrigger asChild>
                          <button
                            className={`absolute left-1 right-1 rounded-md px-2 py-1 text-left overflow-hidden cursor-pointer transition-colors z-10 ${
                              isCompleted
                                ? "bg-muted text-muted-foreground line-through"
                                : "bg-sky-500 hover:bg-sky-600 text-white"
                            }`}
                            style={{ top, height: Math.max(height, 28) }}
                            onClick={(e) => { e.stopPropagation(); setDetailAppt(appt); }}
                            data-testid={`day-appt-${appt.id}`}
                          >
                            <div className="text-xs font-semibold leading-tight truncate">
                              {appt.isAllDay ? "All day" : formatTimeCondensed(appt.time)}{customer ? ` · ${clientName(customer)}` : ""}
                            </div>
                            {pianoShort && height >= 40 && (
                              <div className="text-[10px] leading-tight opacity-80 truncate">{pianoShort}</div>
                            )}
                            {customer?.city && height >= 52 && (
                              <div className="text-[10px] leading-tight opacity-80 truncate">{[customer.city, customer.state].filter(Boolean).join(", ")}</div>
                            )}
                          </button>
                        </PopoverTrigger>
                        <PopoverPrimitive.Portal>
                          <PopoverPrimitive.Content
                            side="right"
                            align="start"
                            sideOffset={8}
                            className="z-50 w-80 rounded-lg border bg-popover text-popover-foreground shadow-lg outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 origin-[--radix-popover-content-transform-origin] p-0 overflow-hidden"
                          >
                            <PopoverPrimitive.Arrow className="fill-border" width={12} height={6} />
                            {renderApptPopoverContent(appt)}
                          </PopoverPrimitive.Content>
                        </PopoverPrimitive.Portal>
                      </Popover>
                    );
                  });
                })()}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ═══════════ MONTH VIEW ═══════════ */}
      {/* ═══════════ MOBILE · DAY ═══════════ */}
      {isMobile && calendarView === "day" && (
        <div className="space-y-3" data-testid="calendar-day-agenda">
          {renderDayAgendaCard(dayViewDate)}
        </div>
      )}

      {/* ═══════════ MOBILE · WEEK ═══════════ */}
      {isMobile && calendarView === "week" && (
        <div className="space-y-3" data-testid="calendar-week-agenda">
          {weekDays.map((d) => renderDayAgendaCard(d))}
        </div>
      )}

      {/* ═══════════ MOBILE · MONTH (grid + tap-a-day) ═══════════ */}
      {isMobile && calendarView === "month" && (
        <div className="space-y-3" data-testid="calendar-month-mobile">
          <Card>
            <CardContent className="p-2">
              <div className="grid grid-cols-7 gap-0.5">
                {DAY_NAMES.map((day) => (
                  <div key={day} className="text-center text-[10px] font-medium text-muted-foreground py-1">
                    {day.slice(0, 1)}
                  </div>
                ))}
                {calendarDays.map((date, idx) => {
                  if (!date) return <div key={`empty-${idx}`} className="aspect-square" />;
                  const key = getDateKey(date);
                  const dayAppts = appointmentsByDate.get(key) ?? [];
                  const activeAppts = dayAppts.filter((a) => a.status !== "cancelled");
                  const cancelledCount = dayAppts.length - activeAppts.length;
                  const hasNote = (notesByDate.get(key)?.length ?? 0) > 0;
                  const hasBusyEvent = (eventsByDate.get(key) ?? []).some(({ ev }) => ev.eventType === "personal");
                  const isToday = isSameDay(date, today);
                  const isPicked = isSameDay(date, displayPickedDay);
                  const isTripDay = !!getTrip(date, trips);
                  const dotCount = Math.min(activeAppts.length, 4);
                  return (
                    <button
                      key={key}
                      onClick={() => setPickedDay(date)}
                      className={`aspect-square flex flex-col items-center justify-start pt-1 rounded-md transition-colors ${
                        isPicked
                          ? "bg-muted ring-2 ring-primary"
                          : isTripDay
                          ? "bg-green-50 dark:bg-green-950/20"
                          : hasBusyEvent
                          ? "bg-violet-50 dark:bg-violet-950/20"
                          : "hover:bg-muted/50"
                      }`}
                      data-testid={`month-cell-${key}`}
                    >
                      <span
                        className={`flex items-center justify-center h-6 w-6 rounded-full text-xs font-medium ${
                          isToday ? "bg-primary text-primary-foreground" : ""
                        }`}
                      >
                        {date.getDate()}
                      </span>
                      <div className="flex items-center justify-center gap-[2px] mt-0.5 h-2">
                        {Array.from({ length: dotCount }).map((_, i) => (
                          <span key={i} className="h-1 w-1 rounded-full bg-sky-500" />
                        ))}
                        {activeAppts.length === 0 && cancelledCount > 0 && (
                          <span className="h-1 w-1 rounded-full bg-muted-foreground/40" />
                        )}
                        {activeAppts.length === 0 && cancelledCount === 0 && hasNote && (
                          <span className="h-1 w-1 rounded-full bg-amber-400" />
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </CardContent>
          </Card>
          {renderDayAgendaCard(displayPickedDay)}
        </div>
      )}

      {/* ═══════════ YEAR VIEW (mobile + desktop) ═══════════ */}
      {calendarView === "year" && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3" data-testid="calendar-year-view">
          {Array.from({ length: 12 }).map((_, m) => {
            const first = new Date(currentYear, m, 1);
            const startOffset = first.getDay();
            const totalDays = new Date(currentYear, m + 1, 0).getDate();
            const cells: (Date | null)[] = [];
            for (let i = 0; i < startOffset; i++) cells.push(null);
            for (let d = 1; d <= totalDays; d++) cells.push(new Date(currentYear, m, d));
            let monthCount = 0;
            for (let d = 1; d <= totalDays; d++) {
              const k = getDateKey(new Date(currentYear, m, d));
              monthCount += appointmentsByDate.get(k)?.filter((a) => a.status !== "cancelled").length ?? 0;
            }
            const isCurrentMonth = m === today.getMonth() && currentYear === today.getFullYear();
            return (
              <Card
                key={m}
                className={`cursor-pointer hover:border-primary transition-colors ${isCurrentMonth ? "border-primary/50" : ""}`}
                onClick={() => {
                  setCurrentMonth(m);
                  setCalendarView("month");
                }}
                data-testid={`year-month-${m}`}
              >
                <CardContent className="p-3">
                  <div className="flex items-baseline justify-between mb-2">
                    <span className="text-sm font-semibold">{MONTH_NAMES[m]}</span>
                    <span className="text-[10px] text-muted-foreground">
                      {monthCount} appt{monthCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="grid grid-cols-7 gap-[2px]">
                    {cells.map((date, i) => {
                      if (!date) return <div key={`e-${i}`} className="aspect-square" />;
                      const k = getDateKey(date);
                      const c = appointmentsByDate.get(k)?.filter((a) => a.status !== "cancelled").length ?? 0;
                      const isToday = isSameDay(date, today);
                      const shade =
                        c === 0
                          ? ""
                          : c === 1
                          ? "bg-sky-200 dark:bg-sky-900/50"
                          : c === 2
                          ? "bg-sky-300 dark:bg-sky-800/70"
                          : c === 3
                          ? "bg-sky-400 dark:bg-sky-700/80"
                          : "bg-sky-500 dark:bg-sky-600";
                      return (
                        <div
                          key={i}
                          className={`aspect-square rounded-[2px] flex items-center justify-center text-[8px] leading-none ${shade} ${
                            isToday ? "ring-1 ring-primary" : ""
                          } ${c >= 3 ? "text-white" : "text-muted-foreground"}`}
                        >
                          {date.getDate()}
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ═══════════ MONTH VIEW (desktop grid) ═══════════ */}
      {!isMobile && calendarView === "month" && (
        <Card data-testid="calendar-grid-view">
          <CardContent className="p-2 sm:p-4">
            <div className="grid grid-cols-7 gap-px">
              {DAY_NAMES.map((day) => (
                <div key={day} className="text-center text-xs font-medium text-muted-foreground py-2">
                  {day}
                </div>
              ))}
              {calendarDays.map((date, idx) => {
                if (!date) {
                  return <div key={`empty-${idx}`} className="min-h-[100px] p-1" />;
                }

                const key = getDateKey(date);
                const dayAppts = (appointmentsByDate.get(key) ?? []).slice().sort((a, b) => parseTimeString(a.time ?? "") - parseTimeString(b.time ?? ""));
                const dayNotes = notesByDate.get(key) ?? [];
                const dayEventItems = eventsByDate.get(key) ?? [];
                const isToday = isSameDay(date, today);
                const isTripDay = !!getTrip(date, trips);
                const areaLabel = getDayAreaLabel(date, trips);
                // Personal (non-memo) events mark the day busy
                const hasBusyEvent = dayEventItems.some(({ ev }) => ev.eventType === "personal");

                return (
                  <DroppableDay
                    key={key}
                    dayKey={formatMDYY(date)}
                    className={`min-h-[100px] p-1 border border-border/50 rounded-md ${
                      isToday
                        ? "bg-primary/10"
                        : hasBusyEvent
                        ? "bg-violet-50 dark:bg-violet-950/20"
                        : isTripDay
                        ? "bg-green-50 dark:bg-green-950/20"
                        : ""
                    }`}
                    testId={`calendar-cell-${key}`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <div className="flex items-center gap-1">
                        <span className={`text-xs font-medium leading-none ${isToday ? "text-primary font-bold" : "text-muted-foreground"}`}>
                          {date.getDate()}
                        </span>
                        {hasBusyEvent && (
                          <span className="text-[8px] font-semibold uppercase tracking-wide text-violet-500 dark:text-violet-400 leading-none">
                            busy
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-0.5">
                        {areaLabel && (
                          <span
                            className={`text-[9px] font-semibold uppercase tracking-wide leading-none px-1 py-0.5 rounded ${
                              areaLabel === "SLC"
                                ? "text-green-700 dark:text-green-400 bg-green-100 dark:bg-green-900/40"
                                : "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30"
                            }`}
                          >
                            {areaLabel}
                          </span>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 opacity-0 hover:opacity-100 focus:opacity-100"
                          onClick={() => handleDateClick(date)}
                          data-testid={`button-add-note-${key}`}
                        >
                          <Plus className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-0.5 overflow-hidden">
                      {/* ── Real Falcetti (Gazelle) shifts ── */}
                      {(falcettiByDate.get(key) ?? []).map((fev, fi) => (
                        <div
                          key={fev.uid + fi}
                          className="text-[10px] leading-tight px-1.5 py-0.5 rounded-[3px] truncate bg-rose-100 text-rose-600 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-400 dark:border-rose-800 cursor-pointer hover:bg-rose-200 dark:hover:bg-rose-900/50"
                          title={`Falcetti: ${fev.title}${fev.startTime ? ` (${fev.startTime}–${fev.endTime})` : ""}`}
                          data-testid={`falcetti-pill-${fev.uid}`}
                          onClick={(e) => { e.stopPropagation(); setFalcettiDetail(fev); }}
                        >
                          {fev.isAllDay || !fev.startTime
                            ? fev.title
                            : `${formatTimeCondensed(fev.startTime)} ${fev.title}`}
                        </div>
                      ))}
                      {/* ── Default Falcetti pill (weekday with nothing on Gazelle) ── */}
                      {shouldShowWorkBlock(date) && (
                        <div className="flex items-center gap-0.5 group" data-testid={`work-block-${key}`}>
                          <div className="text-[10px] leading-tight flex-1 min-w-0 px-1.5 py-0.5 rounded-[3px] truncate bg-slate-100 text-slate-400 border border-dashed border-slate-300 dark:bg-slate-800/40 dark:text-slate-500 dark:border-slate-700">
                            7a–3p · Falcetti
                          </div>
                          <button
                            className="shrink-0 h-4 w-4 flex items-center justify-center rounded-sm text-slate-400 invisible group-hover:visible hover:text-slate-700"
                            title="Remove this day's on-call block"
                            onClick={(e) => { e.stopPropagation(); addWorkBlockException(key); }}
                            data-testid={`work-block-remove-${key}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      )}
                      {dayAppts.map((appt) => {
                        const customer = customerMap.get(appt.customerId);
                        const piano = appt.pianoId ? pianoMap.get(appt.pianoId) : null;
                        const pianoShort = piano ? ([piano.make, piano.model].filter(Boolean).join(" ") || null) : null;
                        const isCompleted = appt.status === "completed";
                        const pillLabel = formatPillLabel(appt.isAllDay ? "All day" : appt.time, customer, pianoShort);
                        const isOpen = selectedAppt?.id === appt.id;
                        return (
                          <DraggableAppt key={appt.id} id={appt.id}>
                          <Popover open={isOpen} onOpenChange={(open) => { if (!open) closeDetailDialog(); }}>
                            <PopoverTrigger asChild>
                              <button
                                className={`text-[10px] leading-tight w-full text-left px-1.5 py-0.5 rounded-[3px] truncate cursor-pointer transition-colors ${
                                  isCompleted
                                    ? "bg-muted text-muted-foreground line-through opacity-60"
                                    : "bg-sky-500 hover:bg-sky-600 text-white"
                                }`}
                                onClick={() => setDetailAppt(appt)}
                                data-testid={`calendar-appointment-${appt.id}`}
                              >
                                {pillLabel}
                              </button>
                            </PopoverTrigger>
                            <PopoverPrimitive.Portal>
                              <PopoverPrimitive.Content
                                side="bottom"
                                align="start"
                                sideOffset={6}
                                className="z-50 w-80 rounded-lg border bg-popover text-popover-foreground shadow-lg outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 origin-[--radix-popover-content-transform-origin] p-0 overflow-hidden"
                              >
                                <PopoverPrimitive.Arrow className="fill-border" width={12} height={6} />
                                {renderApptPopoverContent(appt)}
                              </PopoverPrimitive.Content>
                            </PopoverPrimitive.Portal>
                          </Popover>
                          </DraggableAppt>
                        );
                      })}
                      {dayNotes.map((note) => (
                        <div
                          key={note.id}
                          className="flex items-center gap-0.5 group"
                          data-testid={`calendar-note-${note.id}`}
                        >
                          <Badge
                            variant="outline"
                            className="text-[10px] leading-tight flex-1 min-w-0 justify-start italic text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-600"
                          >
                            <span className="truncate">{note.title}</span>
                          </Badge>
                          <button
                            className="shrink-0 h-4 w-4 flex items-center justify-center rounded-sm text-muted-foreground invisible group-hover:visible hover:text-destructive"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteNoteMutation.mutate(note.id);
                            }}
                            data-testid={`button-delete-note-${note.id}`}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </div>
                      ))}
                      {dayEventItems.map((item) => renderGridEventItem(item, key))}
                    </div>
                  </DroppableDay>
                );
              })}
            </div>

            {/* Legend */}
            <div className="flex items-center gap-4 mt-3 pt-2 border-t border-border/40 flex-wrap">
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-violet-200 dark:bg-violet-800/70 border border-violet-300 dark:border-violet-600" />
                <span className="text-[10px] text-muted-foreground">Personal event (busy)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm border border-blue-300 dark:border-blue-600" />
                <span className="text-[10px] text-muted-foreground">Memo (info only)</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="w-3 h-3 rounded-sm bg-green-50 dark:bg-green-950/20 border border-green-200" />
                <span className="text-[10px] text-muted-foreground">SLC trip</span>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Appointment Detail Dialog — mobile only; desktop uses per-pill Popovers */}
      <Dialog open={isMobile && selectedAppt !== null} onOpenChange={(open) => { if (!open) closeDetailDialog(); }}>
        <DialogContent className="max-w-md p-0 overflow-hidden gap-0">
          {selectedAppt && (() => {
            return renderApptPopoverContent(selectedAppt);
          })()}
        </DialogContent>
      </Dialog>

      {/* Create / Edit Appointment & Event Dialog */}
      <Dialog open={dialogMode !== null} onOpenChange={(open) => { if (!open) closeDialog(); }}>
        <DialogContent className="max-w-md">

          {dialogMode === "picker" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Plus className="h-4 w-4" />
                  Add to {selectedDateLabel}
                </DialogTitle>
              </DialogHeader>
              <div className="grid gap-3 py-2">
                <Button
                  variant="outline"
                  className="h-16 flex-col gap-1.5 items-center justify-center"
                  onClick={() => {
                    const dateStr = selectedDate ? formatMDYY(selectedDate) : "";
                    setCreateApptInitialDate(dateStr);
                    setDialogMode(null);
                    setSelectedDate(null);
                    setCreateApptDialogOpen(true);
                  }}
                  data-testid="button-picker-appointment"
                >
                  <Music className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium">Schedule Appointment</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-16 flex-col gap-1.5 items-center justify-center"
                  onClick={() => {
                    const dateStr = selectedDate ? formatMDYY(selectedDate) : "";
                    setEvDate(dateStr);
                    setEvEndDate(dateStr);
                    setDialogMode("event");
                  }}
                  data-testid="button-picker-event"
                >
                  <CalendarDays className="h-5 w-5 text-violet-500" />
                  <span className="text-sm font-medium">New Personal Event</span>
                  <span className="text-[10px] text-muted-foreground">Marks you unavailable</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-16 flex-col gap-1.5 items-center justify-center"
                  onClick={() => {
                    const dateStr = selectedDate ? formatMDYY(selectedDate) : "";
                    setEvDate(dateStr);
                    setEvEndDate(dateStr);
                    setDialogMode("memo");
                  }}
                  data-testid="button-picker-memo"
                >
                  <FileText className="h-5 w-5 text-blue-500" />
                  <span className="text-sm font-medium">Add Memo</span>
                  <span className="text-[10px] text-muted-foreground">Info only, not a block</span>
                </Button>
              </div>
            </>
          )}

          {(dialogMode === "event" || dialogMode === "memo") && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  {dialogMode === "memo" ? (
                    <FileText className="h-4 w-4 text-blue-500" />
                  ) : (
                    <CalendarDays className="h-4 w-4 text-violet-500" />
                  )}
                  {editingEventId
                    ? (dialogMode === "memo" ? "Edit Memo" : "Edit Personal Event")
                    : (dialogMode === "memo" ? "Add Memo" : "New Personal Event")}
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 max-h-[65vh] overflow-y-auto pr-1">

                {/* All Day toggle — shown first so it controls the date section */}
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="ev-all-day"
                    checked={evIsAllDay}
                    onCheckedChange={(v) => setEvIsAllDay(!!v)}
                    data-testid="checkbox-ev-all-day"
                  />
                  <Label htmlFor="ev-all-day" className="cursor-pointer">
                    {dialogMode === "event" ? "All-day / multi-day event" : "All day"}
                  </Label>
                </div>

                {/* Date section */}
                {evIsAllDay && dialogMode === "event" ? (
                  /* Date range — start + end */
                  <div className="space-y-1.5">
                    <Label>Date Range <span className="text-destructive">*</span></Label>
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="space-y-1">
                        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">Start</p>
                        <DatePickerPopover
                          value={evDate}
                          onChange={(d) => {
                            setEvDate(d);
                            if (!evEndDate || evEndDate < d) setEvEndDate(d);
                          }}
                        />
                      </div>
                      <span className="text-muted-foreground mt-4 text-sm">→</span>
                      <div className="space-y-1">
                        <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wide">End</p>
                        <DatePickerPopover
                          value={evEndDate || evDate}
                          onChange={setEvEndDate}
                        />
                      </div>
                    </div>
                    {evSpanDays > 1 && (
                      <p className="text-[10px] text-violet-600 dark:text-violet-400 font-medium">
                        Spans {evSpanDays} days
                      </p>
                    )}
                  </div>
                ) : (
                  /* Single date */
                  <div className="space-y-1.5">
                    <Label>Date <span className="text-destructive">*</span></Label>
                    <MiniCalendar
                      value={evDate}
                      onChange={(d) => { setEvDate(d); setEvEndDate(d); }}
                      data-testid="minicalendar-ev-date"
                    />
                  </div>
                )}

                {/* Time fields — only when not all-day */}
                {!evIsAllDay && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Start Time</Label>
                      <TimeStepperWidget
                        minutes={evStartMinutes}
                        onChange={setEvStartMinutes}
                        testIdPrefix="ev-start-time"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>End Time</Label>
                      <TimeStepperWidget
                        minutes={evEndMinutes}
                        onChange={setEvEndMinutes}
                        testIdPrefix="ev-end-time"
                      />
                    </div>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label>Title <span className="text-destructive">*</span></Label>
                  <Input
                    placeholder={dialogMode === "memo" ? "e.g. I'll be in South Jordan" : "Event title..."}
                    value={evTitle}
                    onChange={(e) => setEvTitle(e.target.value)}
                    data-testid="input-ev-title"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <Textarea
                    placeholder="Details (optional)..."
                    value={evNotes}
                    onChange={(e) => setEvNotes(e.target.value)}
                    className="resize-none"
                    rows={2}
                    data-testid="input-ev-notes"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <Checkbox
                    id="ev-repeating"
                    checked={evIsRepeating}
                    onCheckedChange={(v) => setEvIsRepeating(!!v)}
                    data-testid="checkbox-ev-repeating"
                  />
                  <Label htmlFor="ev-repeating" className="cursor-pointer">Repeating</Label>
                </div>

                {evIsRepeating && (
                  <div className="space-y-3">
                    <div className="space-y-1.5">
                      <Label>Repeat Frequency</Label>
                      <Select value={evRepeatFreq} onValueChange={setEvRepeatFreq}>
                        <SelectTrigger data-testid="select-ev-freq">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="daily">Daily</SelectItem>
                          <SelectItem value="weekly">Weekly</SelectItem>
                          <SelectItem value="monthly">Monthly</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1.5">
                      <Label>Repeat Until (optional)</Label>
                      <Input
                        type="date"
                        value={evRepeatEndDate}
                        onChange={(e) => setEvRepeatEndDate(e.target.value)}
                        data-testid="input-ev-repeat-end"
                      />
                    </div>
                  </div>
                )}

                {/* Type hint */}
                {dialogMode === "event" && (
                  <p className="text-[10px] text-muted-foreground bg-violet-50 dark:bg-violet-950/30 rounded px-2 py-1.5">
                    Personal events mark you <strong>unavailable</strong> — they show as a violet band across calendar days.
                  </p>
                )}
                {dialogMode === "memo" && (
                  <p className="text-[10px] text-muted-foreground bg-blue-50 dark:bg-blue-950/30 rounded px-2 py-1.5">
                    Memos are informational only — they appear in blue and don't block scheduling.
                  </p>
                )}
              </div>
              <DialogFooter>
                {editingEventId ? (
                  <>
                    <Button
                      variant="ghost"
                      className="text-destructive hover:text-destructive mr-auto"
                      onClick={() => {
                        if (editingEventId) {
                          deleteEventMutation.mutate(editingEventId);
                        }
                        closeDialog();
                      }}
                      data-testid="button-ev-delete"
                    >
                      Delete
                    </Button>
                    <Button variant="ghost" onClick={closeDialog} data-testid="button-ev-cancel">
                      Cancel
                    </Button>
                    <Button
                      onClick={() => handleSaveEvent(dialogMode === "memo" ? "memo" : "personal")}
                      disabled={!evTitle.trim() || !evDate || updateEventMutation.isPending}
                      data-testid="button-ev-save"
                    >
                      Save Changes
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="ghost" onClick={() => setDialogMode("picker")} data-testid="button-ev-back">
                      Back
                    </Button>
                    <Button
                      onClick={() => handleSaveEvent(dialogMode === "memo" ? "memo" : "personal")}
                      disabled={!evTitle.trim() || !evDate || createEventMutation.isPending}
                      data-testid="button-ev-save"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      {dialogMode === "memo" ? "Add Memo" : "Add Event"}
                    </Button>
                  </>
                )}
              </DialogFooter>
            </>
          )}

        </DialogContent>
      </Dialog>

      {completeDialogAppt && (
        <CompleteAppointmentDialog
          appointment={completeDialogAppt}
          open={!!completeDialogAppt}
          onOpenChange={(open) => { if (!open) setCompleteDialogAppt(null); }}
          onComplete={() => setSelectedAppt(null)}
        />
      )}

      <AppointmentDetailDialog
        appointment={detailAppt}
        open={!!detailAppt}
        onOpenChange={(o) => { if (!o) setDetailAppt(null); }}
      />

      {/* ── Falcetti (Gazelle) shift detail — read-only ── */}
      <Dialog open={!!falcettiDetail} onOpenChange={(o) => { if (!o) setFalcettiDetail(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full bg-rose-500" />
              {falcettiDetail?.title}
            </DialogTitle>
          </DialogHeader>
          {falcettiDetail && (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Calendar className="h-4 w-4 shrink-0" />
                <span>{formatDateLong(falcettiDetail.date)}</span>
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-4 w-4 shrink-0" />
                <span>
                  {falcettiDetail.isAllDay || !falcettiDetail.startTime
                    ? "All day"
                    : `${falcettiDetail.startTime} – ${falcettiDetail.endTime}`}
                </span>
              </div>
              {falcettiDetail.location && (
                <div className="flex items-start gap-2 text-muted-foreground">
                  <MapPin className="h-4 w-4 shrink-0 mt-0.5" />
                  <span className="whitespace-pre-line">{falcettiDetail.location}</span>
                </div>
              )}
              {falcettiDetail.description && (
                <div className="flex items-start gap-2">
                  <StickyNote className="h-4 w-4 shrink-0 mt-0.5 text-muted-foreground" />
                  <span className="whitespace-pre-line text-foreground">{falcettiDetail.description}</span>
                </div>
              )}
              <div className="rounded-md bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 p-3 text-xs text-rose-700 dark:text-rose-300">
                From your Falcetti (Gazelle) calendar — read-only. Edit it in Gazelle and the change shows here within a few minutes.
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setFalcettiDetail(null)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AppointmentDialog
        open={createApptDialogOpen}
        onOpenChange={setCreateApptDialogOpen}
        initialDate={createApptInitialDate}
      />

      {/* ── Drag-and-drop reschedule dialog ── */}
      {calMoveReq && (() => {
        const cust = customerMap.get(calMoveReq.appt.customerId);
        const movingClientName = cust ? clientName(cust) : "Appointment";
        const targetDay = parseMDYY(calMoveReq.targetDate);
        const targetLabel = targetDay
          ? targetDay.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })
          : calMoveReq.targetDate;
        let prev: MoveRequestPrev | null = null;
        if (calMoveReq.prevAppt) {
          const prevCust = customerMap.get(calMoveReq.prevAppt.customerId);
          const prevEnd = parseTimeString(calMoveReq.prevAppt.time ?? "9:00 AM")
            + parseDurationString(calMoveReq.prevAppt.duration ?? "1 hr 30 min");
          prev = {
            endMinutes: prevEnd,
            label: `${prevCust ? clientName(prevCust) : "previous appointment"} (ends ${formatTimeMinutes(prevEnd)})`,
            address: customerAddressOf(calMoveReq.prevAppt.customerId),
          };
        }
        return (
          <MoveAppointmentDialog
            open={true}
            onOpenChange={(o) => { if (!o) setCalMoveReq(null); }}
            clientName={movingClientName}
            targetDateLabel={targetLabel}
            isDayChange={calMoveReq.appt.date !== calMoveReq.targetDate}
            prev={prev}
            toAddress={customerAddressOf(calMoveReq.appt.customerId)}
            fallbackMinutes={parseTimeString(calMoveReq.appt.time ?? "9:00 AM")}
            onConfirm={(minutes) => {
              updateAppointmentMutation.mutate({
                id: calMoveReq.appt.id,
                data: { date: calMoveReq.targetDate, time: formatTimeMinutes(minutes) },
              });
              setCalMoveReq(null);
            }}
            isPending={updateAppointmentMutation.isPending}
          />
        );
      })()}
    </div>
    </DndContext>
  );
}
