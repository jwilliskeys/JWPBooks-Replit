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
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import type { Appointment, Customer, CalendarNote, CalendarEvent, Piano } from "@shared/schema";
import { CompleteAppointmentDialog } from "@/components/complete-appointment-dialog";
import { ServicePicker } from "@/components/service-picker";

function parseMDYY(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;
  const month = parseInt(parts[0], 10);
  const day = parseInt(parts[1], 10);
  let year = parseInt(parts[2], 10);
  if (isNaN(month) || isNaN(day) || isNaN(year)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  if (year < 100) year += 2000;
  return new Date(year, month - 1, day);
}

function formatMDYY(date: Date): string {
  const m = date.getMonth() + 1;
  const d = date.getDate();
  const y = date.getFullYear() % 100;
  return `${m}/${d}/${y}`;
}

function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function formatTimeMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = totalMinutes % 60;
  const ampm = h >= 12 ? "PM" : "AM";
  const displayH = h % 12 === 0 ? 12 : h % 12;
  return `${displayH}:${String(m).padStart(2, "0")} ${ampm}`;
}

function formatDurationMinutes(totalMinutes: number): string {
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} min`;
  if (m === 0) return `${h} hr`;
  return `${h} hr ${m} min`;
}

function parseTimeString(s: string): number {
  if (!s) return DEFAULT_TIME_MINUTES;
  const match = s.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!match) return DEFAULT_TIME_MINUTES;
  let h = parseInt(match[1]);
  const m = parseInt(match[2]);
  const ampm = match[3].toUpperCase();
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return h * 60 + m;
}

function parseDurationString(s: string): number {
  if (!s) return DEFAULT_DURATION_MINUTES;
  let total = 0;
  const hrMatch = s.match(/(\d+)\s*hr/);
  const minMatch = s.match(/(\d+)\s*min/);
  if (hrMatch) total += parseInt(hrMatch[1]) * 60;
  if (minMatch) total += parseInt(minMatch[1]);
  return total || DEFAULT_DURATION_MINUTES;
}

function computeEndTime(startStr: string, durationStr: string): string {
  const startMins = parseTimeString(startStr);
  const durMins = parseDurationString(durationStr);
  return formatTimeMinutes((startMins + durMins) % (24 * 60));
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
const MIN_DURATION = 5;
const MAX_DURATION = 8 * 60;

function TimeStepperWidget({
  minutes,
  onChange,
  testIdPrefix,
}: {
  minutes: number;
  onChange: (m: number) => void;
  testIdPrefix: string;
}) {
  function wrap(m: number) {
    return ((m % (24 * 60)) + 24 * 60) % (24 * 60);
  }
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 w-full justify-between">
      <div className="flex flex-col gap-0.5">
        <button
          type="button"
          onClick={() => onChange(wrap(minutes + 60))}
          className="text-[11px] font-semibold rounded px-2 py-0.5 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors leading-tight"
          data-testid={`${testIdPrefix}-plus-hour`}
        >
          +1h
        </button>
        <button
          type="button"
          onClick={() => onChange(wrap(minutes - 60))}
          className="text-[11px] font-semibold rounded px-2 py-0.5 bg-muted-foreground/20 hover:bg-muted-foreground/30 transition-colors leading-tight"
          data-testid={`${testIdPrefix}-minus-hour`}
        >
          −1h
        </button>
      </div>
      <span className="text-base font-bold tabular-nums min-w-[80px] text-center" data-testid={`${testIdPrefix}-display`}>
        {formatTimeMinutes(minutes)}
      </span>
      <div className="flex flex-col gap-0.5">
        <button
          type="button"
          onClick={() => onChange(wrap(minutes + 5))}
          className="text-[11px] font-semibold rounded px-2 py-0.5 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors leading-tight"
          data-testid={`${testIdPrefix}-plus-five`}
        >
          +5m
        </button>
        <button
          type="button"
          onClick={() => onChange(wrap(minutes - 5))}
          className="text-[11px] font-semibold rounded px-2 py-0.5 bg-muted-foreground/20 hover:bg-muted-foreground/30 transition-colors leading-tight"
          data-testid={`${testIdPrefix}-minus-five`}
        >
          −5m
        </button>
      </div>
    </div>
  );
}

function DurationStepperWidget({
  minutes,
  onChange,
  testIdPrefix,
}: {
  minutes: number;
  onChange: (m: number) => void;
  testIdPrefix: string;
}) {
  function clamp(m: number) {
    return Math.max(MIN_DURATION, Math.min(MAX_DURATION, m));
  }
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 px-3 py-2 w-full justify-between">
      <div className="flex flex-col gap-0.5">
        <button
          type="button"
          onClick={() => onChange(clamp(minutes + 60))}
          className="text-[11px] font-semibold rounded px-2 py-0.5 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors leading-tight"
          data-testid={`${testIdPrefix}-plus-hour`}
        >
          +1h
        </button>
        <button
          type="button"
          onClick={() => onChange(clamp(minutes - 60))}
          className="text-[11px] font-semibold rounded px-2 py-0.5 bg-muted-foreground/20 hover:bg-muted-foreground/30 transition-colors leading-tight"
          data-testid={`${testIdPrefix}-minus-hour`}
        >
          −1h
        </button>
      </div>
      <span className="text-base font-bold tabular-nums min-w-[80px] text-center" data-testid={`${testIdPrefix}-display`}>
        {formatDurationMinutes(minutes)}
      </span>
      <div className="flex flex-col gap-0.5">
        <button
          type="button"
          onClick={() => onChange(clamp(minutes + 5))}
          className="text-[11px] font-semibold rounded px-2 py-0.5 bg-primary text-primary-foreground hover:bg-primary/90 transition-colors leading-tight"
          data-testid={`${testIdPrefix}-plus-five`}
        >
          +5m
        </button>
        <button
          type="button"
          onClick={() => onChange(clamp(minutes - 5))}
          className="text-[11px] font-semibold rounded px-2 py-0.5 bg-muted-foreground/20 hover:bg-muted-foreground/30 transition-colors leading-tight"
          data-testid={`${testIdPrefix}-minus-five`}
        >
          −5m
        </button>
      </div>
    </div>
  );
}

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type DialogMode = "picker" | "appointment" | "event" | "memo" | null;

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

  const [evTitle, setEvTitle] = useState("");
  const [evNotes, setEvNotes] = useState("");
  const [evIsAllDay, setEvIsAllDay] = useState(false);
  const [evStartTime, setEvStartTime] = useState("");
  const [evEndTime, setEvEndTime] = useState("");
  const [evIsRepeating, setEvIsRepeating] = useState(false);
  const [evRepeatFreq, setEvRepeatFreq] = useState("weekly");

  const [selectedAppt, setSelectedAppt] = useState<Appointment | null>(null);
  const [showCloneInput, setShowCloneInput] = useState(false);
  const [cloneDate, setCloneDate] = useState("");
  const [completeDialogAppt, setCompleteDialogAppt] = useState<Appointment | null>(null);

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
    const map = new Map<string, Appointment[]>();
    appointments?.forEach((appt) => {
      const parsed = parseMDYY(appt.date);
      if (parsed) {
        const key = `${parsed.getFullYear()}-${parsed.getMonth()}-${parsed.getDate()}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(appt);
      }
    });
    return map;
  }, [appointments]);

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

  const eventsByDate = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    calendarEvents?.forEach((ev) => {
      const parsed = parseMDYY(ev.date);
      if (parsed) {
        const key = `${parsed.getFullYear()}-${parsed.getMonth()}-${parsed.getDate()}`;
        if (!map.has(key)) map.set(key, []);
        map.get(key)!.push(ev);
      }
    });
    return map;
  }, [calendarEvents]);

  function getDateKey(date: Date): string {
    return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
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
    setEvIsAllDay(false);
    setEvStartTime("");
    setEvEndTime("");
    setEvIsRepeating(false);
    setEvRepeatFreq("weekly");
  }

  function closeDetailDialog() {
    setSelectedAppt(null);
    setShowCloneInput(false);
    setCloneDate("");
  }

  function openEditAppointment(appt: Appointment) {
    closeDetailDialog();
    setEditingApptId(appt.id);
    setApptCustomerId(appt.customerId);
    setApptPianoId(appt.pianoId ?? null);
    setApptTimeMinutes(parseTimeString(appt.time));
    setApptDurationMinutes(parseDurationString(appt.duration ?? ""));
    const existingNames = appt.servicesRequested
      ? appt.servicesRequested.split(",").map((s) => s.trim()).filter(Boolean)
      : [];
    setApptSelectedNames(existingNames);
    setApptServices(appt.servicesRequested ?? "");
    setApptPrice(appt.priceEstimate ?? "");
    setApptNotes(appt.notes ?? "");
    setApptIsTuning(appt.isTuning ?? false);
    const parsed = parseMDYY(appt.date);
    setSelectedDate(parsed);
    setDialogMode("appointment");
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
    if (!selectedDate || !evTitle.trim()) return;
    createEventMutation.mutate({
      date: formatMDYY(selectedDate),
      title: evTitle.trim(),
      notes: evNotes.trim() || undefined,
      startTime: evIsAllDay ? undefined : (evStartTime || undefined),
      endTime: evIsAllDay ? undefined : (evEndTime || undefined),
      isAllDay: evIsAllDay,
      isRepeating: evIsRepeating,
      repeatFrequency: evIsRepeating ? evRepeatFreq : undefined,
      eventType: type,
    });
  }

  const selectedCustomer = apptCustomerId ? customerMap.get(apptCustomerId) : null;

  const filteredCustomers = useMemo(() => {
    if (!customers) return [];
    const q = customerSearch.toLowerCase();
    if (!q) return customers.slice(0, 20);
    return customers
      .filter((c) =>
        `${c.firstName} ${c.lastName}`.toLowerCase().includes(q) ||
        c.phone?.includes(q) ||
        c.city?.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [customers, customerSearch]);

  const isLoading = loadingAppts || loadingNotes;

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 space-y-4 max-w-6xl mx-auto">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-[400px] w-full" />
      </div>
    );
  }

  const monthDaysForAgenda = calendarDays.filter((d): d is Date => d !== null);

  const agendaDays = monthDaysForAgenda.filter((date) => {
    const key = getDateKey(date);
    return (
      (appointmentsByDate.get(key)?.length ?? 0) > 0 ||
      (notesByDate.get(key)?.length ?? 0) > 0 ||
      (eventsByDate.get(key)?.length ?? 0) > 0
    );
  });

  const selectedDateLabel = selectedDate
    ? `${MONTH_NAMES[selectedDate.getMonth()]} ${selectedDate.getDate()}, ${selectedDate.getFullYear()}`
    : "";

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-6xl mx-auto">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight" data-testid="text-calendar-title">
          Calendar
        </h1>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={prevMonth}
            data-testid="button-prev-month"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium min-w-[140px] text-center" data-testid="text-current-month">
            {MONTH_NAMES[currentMonth]} {currentYear}
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={nextMonth}
            data-testid="button-next-month"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {isMobile ? (
        <div className="space-y-3" data-testid="calendar-agenda-view">
          {agendaDays.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Calendar className="h-10 w-10 mx-auto mb-3 opacity-30" />
              <p className="text-sm">No events this month</p>
            </div>
          ) : (
            agendaDays.map((date) => {
              const key = getDateKey(date);
              const dayAppts = (appointmentsByDate.get(key) ?? []).slice().sort((a, b) => parseTimeString(a.time ?? "") - parseTimeString(b.time ?? ""));
              const dayNotes = notesByDate.get(key) ?? [];
              const dayEvents = eventsByDate.get(key) ?? [];
              const isToday = isSameDay(date, today);

              return (
                <Card key={key} data-testid={`agenda-day-${key}`}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-center justify-between gap-2 mb-2">
                      <span className={`text-sm font-semibold ${isToday ? "text-primary" : ""}`}>
                        {DAY_NAMES[date.getDay()]}, {MONTH_NAMES[date.getMonth()]} {date.getDate()}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDateClick(date)}
                        data-testid={`button-add-note-${key}`}
                      >
                        <Plus className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="space-y-1">
                      {dayAppts.map((appt) => {
                        const customer = customerMap.get(appt.customerId);
                        const isCompleted = appt.status === "completed";
                        return (
                          <div
                            key={appt.id}
                            className={`flex items-center gap-2 text-xs p-1.5 rounded-md cursor-pointer hover:bg-muted/50 ${isCompleted ? "opacity-60" : ""}`}
                            onClick={() => setSelectedAppt(appt)}
                            data-testid={`calendar-appointment-${appt.id}`}
                          >
                            <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
                            <span className={isCompleted ? "line-through" : ""}>
                              {appt.time} - {customer ? `${customer.firstName} ${customer.lastName}` : "Unknown"}
                            </span>
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
                      {dayEvents.map((ev) => (
                        <div
                          key={ev.id}
                          className="flex items-center justify-between gap-1 text-xs p-1.5 rounded-md"
                          data-testid={`calendar-event-${ev.id}`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {ev.eventType === "memo" ? (
                              <FileText className="h-3 w-3 shrink-0 text-blue-500 dark:text-blue-400" />
                            ) : (
                              <CalendarDays className="h-3 w-3 shrink-0 text-violet-500 dark:text-violet-400" />
                            )}
                            <span className="italic text-muted-foreground truncate">
                              {ev.startTime && !ev.isAllDay ? `${ev.startTime} ` : ""}{ev.title}
                            </span>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              deleteEventMutation.mutate(ev.id);
                            }}
                            data-testid={`button-delete-event-${ev.id}`}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              );
            })
          )}
        </div>
      ) : (
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
                const dayEvents = eventsByDate.get(key) ?? [];
                const isToday = isSameDay(date, today);

                return (
                  <div
                    key={key}
                    className={`min-h-[100px] p-1 border border-border/50 rounded-md ${isToday ? "bg-primary/10" : ""}`}
                    data-testid={`calendar-cell-${key}`}
                  >
                    <div className="flex items-center justify-between gap-1 mb-1">
                      <span className={`text-xs font-medium leading-none ${isToday ? "text-primary font-bold" : "text-muted-foreground"}`}>
                        {date.getDate()}
                      </span>
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
                    <div className="space-y-0.5 overflow-hidden">
                      {dayAppts.map((appt) => {
                        const customer = customerMap.get(appt.customerId);
                        const isCompleted = appt.status === "completed";
                        return (
                          <Badge
                            key={appt.id}
                            variant={isCompleted ? "secondary" : "default"}
                            className={`text-[10px] leading-tight w-full justify-start cursor-pointer truncate ${isCompleted ? "opacity-60" : ""}`}
                            onClick={() => setSelectedAppt(appt)}
                            data-testid={`calendar-appointment-${appt.id}`}
                          >
                            <span className={isCompleted ? "line-through" : ""}>
                              {appt.time} {customer ? customer.lastName : ""}
                            </span>
                          </Badge>
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
                      {dayEvents.map((ev) => (
                        <div
                          key={ev.id}
                          className="flex items-center gap-0.5 group"
                          data-testid={`calendar-event-${ev.id}`}
                        >
                          <Badge
                            variant="outline"
                            className={`text-[10px] leading-tight flex-1 min-w-0 justify-start italic ${
                              ev.eventType === "memo"
                                ? "text-blue-600 dark:text-blue-400 border-blue-300 dark:border-blue-600"
                                : "text-violet-600 dark:text-violet-400 border-violet-300 dark:border-violet-600"
                            }`}
                          >
                            <span className="truncate">
                              {ev.startTime && !ev.isAllDay ? `${ev.startTime} ` : ""}{ev.title}
                            </span>
                          </Badge>
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
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Appointment Detail Dialog */}
      <Dialog open={selectedAppt !== null} onOpenChange={(open) => { if (!open) closeDetailDialog(); }}>
        <DialogContent className="max-w-md p-0 overflow-hidden gap-0">
          {selectedAppt && (() => {
            const customer = customerMap.get(selectedAppt.customerId);
            const piano = selectedAppt.pianoId ? pianoMap.get(selectedAppt.pianoId) : null;
            const endTime = selectedAppt.duration ? computeEndTime(selectedAppt.time, selectedAppt.duration) : null;
            const addressParts = customer
              ? [customer.address, customer.city, customer.state, customer.zipCode].filter(Boolean)
              : [];
            const address = addressParts.join(", ");
            const mapsUrl = address ? `https://maps.google.com/?q=${encodeURIComponent(address)}` : null;
            const dateLabel = formatDateLong(selectedAppt.date);
            const customerName = customer
              ? `${customer.firstName} ${customer.lastName}`
              : `Client #${selectedAppt.customerId}`;
            const pianoLabel = piano
              ? [piano.make, piano.model, piano.pianoType].filter(Boolean).join(" ") || `Piano #${piano.id}`
              : null;

            return (
              <>
                {/* Violet header */}
                <div className="bg-violet-100 dark:bg-violet-950/60 px-5 pt-5 pb-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-[10px] font-bold tracking-widest text-violet-500 dark:text-violet-400 uppercase mb-1">
                        Appointment
                      </p>
                      <h2 className="text-2xl font-bold text-violet-900 dark:text-violet-100 leading-tight break-words">
                        {customerName}
                      </h2>
                    </div>
                    <button
                      onClick={closeDetailDialog}
                      className="text-violet-500 hover:text-violet-700 dark:text-violet-400 dark:hover:text-violet-200 p-1 rounded mt-0.5 shrink-0"
                      data-testid="button-detail-close"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="space-y-1.5 text-sm text-violet-800 dark:text-violet-200">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 shrink-0" />
                      <span>{dateLabel}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 shrink-0" />
                      <span>
                        {selectedAppt.time}
                        {endTime ? ` – ${endTime}` : ""}
                        {selectedAppt.duration ? ` (${selectedAppt.duration})` : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <User className="h-3.5 w-3.5 shrink-0" />
                      <span>{customerName}</span>
                    </div>
                    {address && mapsUrl && (
                      <div className="flex items-start gap-2">
                        <MapPin className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <a
                          href={mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline hover:text-violet-600 dark:hover:text-violet-300 break-words"
                          data-testid="link-appt-address"
                        >
                          {address}
                        </a>
                      </div>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => openEditAppointment(selectedAppt)}
                        className="h-7 text-xs border-violet-300 dark:border-violet-700 text-violet-800 dark:text-violet-200 hover:bg-violet-200 dark:hover:bg-violet-800"
                        data-testid="button-appt-edit"
                      >
                        Edit
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => setShowCloneInput(!showCloneInput)}
                        className="h-7 text-xs border-violet-300 dark:border-violet-700 text-violet-800 dark:text-violet-200 hover:bg-violet-200 dark:hover:bg-violet-800"
                        data-testid="button-appt-clone"
                      >
                        Clone
                      </Button>
                      {(selectedAppt.status === "scheduled" || !selectedAppt.status) && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setCompleteDialogAppt(selectedAppt); }}
                          className="h-7 text-xs border-violet-300 dark:border-violet-700 text-violet-800 dark:text-violet-200 hover:bg-violet-200 dark:hover:bg-violet-800"
                          data-testid="button-appt-complete"
                        >
                          Complete
                        </Button>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => navigate(`/invoices/new?appointmentId=${selectedAppt.id}`)}
                        className="h-7 text-xs border-violet-300 dark:border-violet-700 text-violet-800 dark:text-violet-200 hover:bg-violet-200 dark:hover:bg-violet-800"
                        data-testid="button-appt-invoice"
                      >
                        New Invoice
                      </Button>
                    </div>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteAppointmentMutation.mutate(selectedAppt.id)}
                      disabled={deleteAppointmentMutation.isPending}
                      className="h-7 text-xs text-destructive hover:text-destructive hover:bg-destructive/10"
                      data-testid="button-appt-delete"
                    >
                      Delete
                    </Button>
                  </div>

                  {/* Clone date input */}
                  {showCloneInput && (
                    <div className="space-y-1.5">
                      <p className="text-xs text-violet-700 dark:text-violet-300 font-medium">
                        Pick a date for the cloned appointment
                      </p>
                      <div className="flex items-center gap-2">
                      <Input
                        placeholder="M/D/YY"
                        value={cloneDate}
                        onChange={(e) => setCloneDate(e.target.value)}
                        className="h-8 text-xs flex-1 bg-white/70 dark:bg-violet-900/40 border-violet-300 dark:border-violet-700"
                        data-testid="input-clone-date"
                      />
                      <Button
                        size="sm"
                        onClick={() => {
                          if (!cloneDate.trim()) return;
                          if (!parseMDYY(cloneDate.trim())) {
                            toast({ title: "Invalid date — use M/D/YY (e.g. 4/15/26)", variant: "destructive" });
                            return;
                          }
                          cloneAppointmentMutation.mutate({
                            customerId: selectedAppt.customerId,
                            pianoId: selectedAppt.pianoId ?? undefined,
                            date: cloneDate.trim(),
                            time: selectedAppt.time,
                            duration: selectedAppt.duration ?? undefined,
                            servicesRequested: selectedAppt.servicesRequested ?? undefined,
                            priceEstimate: selectedAppt.priceEstimate ?? undefined,
                            notes: selectedAppt.notes ?? undefined,
                            isTuning: selectedAppt.isTuning ?? false,
                            status: "scheduled",
                          });
                        }}
                        disabled={!cloneDate.trim() || cloneAppointmentMutation.isPending}
                        className="h-8 text-xs shrink-0"
                        data-testid="button-clone-confirm"
                      >
                        Clone
                      </Button>
                    </div>
                    </div>
                  )}
                </div>

                {/* Body */}
                <div className="px-5 py-4 space-y-4">
                  {/* CLIENT */}
                  <div>
                    <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase mb-2">
                      Client
                    </p>
                    <Link href={`/customers/${selectedAppt.customerId}`} onClick={closeDetailDialog}>
                      <div className="flex items-center gap-2 cursor-pointer hover:text-primary transition-colors" data-testid="link-appt-client">
                        <User className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-semibold">{customerName}</span>
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                    </Link>
                  </div>

                  {/* NOTES */}
                  {selectedAppt.notes && (
                    <div>
                      <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase mb-2">
                        Notes
                      </p>
                      <div className="flex items-start gap-2">
                        <MessageSquare className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        <p className="text-sm whitespace-pre-wrap leading-relaxed">{selectedAppt.notes}</p>
                      </div>
                    </div>
                  )}

                  {/* PIANOS & SERVICES */}
                  {(pianoLabel || selectedAppt.servicesRequested || selectedAppt.priceEstimate) && (
                    <div>
                      <p className="text-[10px] font-bold tracking-widest text-muted-foreground uppercase mb-2">
                        {pianoLabel ? "Pianos & Services" : "Services"}
                      </p>
                      {pianoLabel ? (
                        <div>
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Music className="h-4 w-4 text-muted-foreground shrink-0" />
                            <span className="font-bold text-sm">{pianoLabel}</span>
                            {selectedAppt.isTuning && (
                              <Badge className="text-[10px] h-5 bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700">
                                TUNING
                              </Badge>
                            )}
                            <Link href={`/customers/${selectedAppt.customerId}`} onClick={closeDetailDialog}>
                              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground cursor-pointer hover:text-primary" />
                            </Link>
                          </div>
                          {selectedAppt.servicesRequested && (
                            <p className="text-sm text-muted-foreground ml-6">
                              • {selectedAppt.servicesRequested}
                              {selectedAppt.priceEstimate ? ` (${selectedAppt.priceEstimate})` : ""}
                            </p>
                          )}
                          {!selectedAppt.servicesRequested && selectedAppt.priceEstimate && (
                            <p className="text-sm text-muted-foreground ml-6">
                              Price: {selectedAppt.priceEstimate}
                            </p>
                          )}
                        </div>
                      ) : (
                        <div className="text-sm text-muted-foreground space-y-0.5">
                          {selectedAppt.isTuning && (
                            <Badge className="text-[10px] h-5 bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-700 mb-1">
                              TUNING
                            </Badge>
                          )}
                          {selectedAppt.servicesRequested && <p>• {selectedAppt.servicesRequested}</p>}
                          {selectedAppt.priceEstimate && <p>Price: {selectedAppt.priceEstimate}</p>}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* Create / Edit Appointment Dialog */}
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
                  onClick={() => setDialogMode("appointment")}
                  data-testid="button-picker-appointment"
                >
                  <Music className="h-5 w-5 text-primary" />
                  <span className="text-sm font-medium">Schedule Appointment</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-16 flex-col gap-1.5 items-center justify-center"
                  onClick={() => setDialogMode("event")}
                  data-testid="button-picker-event"
                >
                  <CalendarDays className="h-5 w-5 text-violet-500" />
                  <span className="text-sm font-medium">New Personal Event</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-16 flex-col gap-1.5 items-center justify-center"
                  onClick={() => setDialogMode("memo")}
                  data-testid="button-picker-memo"
                >
                  <FileText className="h-5 w-5 text-blue-500" />
                  <span className="text-sm font-medium">Add Memo</span>
                </Button>
              </div>
            </>
          )}

          {dialogMode === "appointment" && (
            <>
              <DialogHeader>
                <DialogTitle className="flex items-center gap-2">
                  <Music className="h-4 w-4 text-primary" />
                  {editingApptId ? "Edit Appointment" : "Schedule Appointment"}
                  <span className="text-sm font-normal text-muted-foreground">— {selectedDateLabel}</span>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-1">
                <div className="space-y-1.5">
                  <Label>Client <span className="text-destructive">*</span></Label>
                  <Popover open={customerComboOpen} onOpenChange={setCustomerComboOpen}>
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        role="combobox"
                        className="w-full justify-between font-normal"
                        data-testid="button-customer-combobox"
                      >
                        {selectedCustomer
                          ? `${selectedCustomer.firstName} ${selectedCustomer.lastName}`
                          : "Search client..."}
                        <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-full p-0" align="start">
                      <Command shouldFilter={false}>
                        <CommandInput
                          placeholder="Search by name, phone, city..."
                          value={customerSearch}
                          onValueChange={setCustomerSearch}
                          data-testid="input-customer-search"
                        />
                        <CommandList>
                          <CommandEmpty>No clients found</CommandEmpty>
                          <CommandGroup>
                            {filteredCustomers.map((c) => (
                              <CommandItem
                                key={c.id}
                                value={String(c.id)}
                                onSelect={() => {
                                  setApptCustomerId(c.id);
                                  setApptPianoId(null);
                                  setCustomerComboOpen(false);
                                  setCustomerSearch("");
                                }}
                                data-testid={`customer-option-${c.id}`}
                              >
                                <Check
                                  className={`mr-2 h-4 w-4 ${apptCustomerId === c.id ? "opacity-100" : "opacity-0"}`}
                                />
                                <div>
                                  <div className="font-medium">{c.firstName} {c.lastName}</div>
                                  {(c.phone || c.city) && (
                                    <div className="text-xs text-muted-foreground">{[c.phone ? formatPhone(c.phone) : null, c.city].filter(Boolean).join(" · ")}</div>
                                  )}
                                </div>
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </CommandList>
                      </Command>
                    </PopoverContent>
                  </Popover>
                </div>

                {apptCustomerId && selectedCustomerPianos.length > 0 && (
                  <div className="space-y-1.5">
                    <Label>Piano</Label>
                    <Select
                      value={apptPianoId ? String(apptPianoId) : "none"}
                      onValueChange={(v) => setApptPianoId(v === "none" ? null : Number(v))}
                    >
                      <SelectTrigger data-testid="select-piano">
                        <SelectValue placeholder="Select piano (optional)" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">No specific piano</SelectItem>
                        {selectedCustomerPianos.map((p) => (
                          <SelectItem key={p.id} value={String(p.id)}>
                            {[p.make, p.model, p.pianoType].filter(Boolean).join(" ") || `Piano #${p.id}`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Time</Label>
                    <TimeStepperWidget
                      minutes={apptTimeMinutes}
                      onChange={setApptTimeMinutes}
                      testIdPrefix="appt-time"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Duration</Label>
                    <DurationStepperWidget
                      minutes={apptDurationMinutes}
                      onChange={setApptDurationMinutes}
                      testIdPrefix="appt-duration"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Services</Label>
                  <ServicePicker
                    value={apptSelectedNames}
                    onChange={(names, isTuning, totalCost) => {
                      setApptSelectedNames(names);
                      setApptServices(names.join(", "));
                      setApptIsTuning(isTuning);
                      if (totalCost > 0) setApptPrice(`$${totalCost.toFixed(0)}`);
                    }}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Price Estimate</Label>
                  <Input
                    placeholder="$180"
                    value={apptPrice}
                    onChange={(e) => setApptPrice(e.target.value)}
                    data-testid="input-appt-price"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label>Notes</Label>
                  <Textarea
                    placeholder="Additional notes..."
                    value={apptNotes}
                    onChange={(e) => setApptNotes(e.target.value)}
                    className="resize-none"
                    rows={2}
                    data-testid="input-appt-notes"
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => editingApptId ? closeDialog() : setDialogMode("picker")} data-testid="button-appt-back">
                  {editingApptId ? "Cancel" : "Back"}
                </Button>
                <Button
                  onClick={handleSaveAppointment}
                  disabled={!apptCustomerId || createAppointmentMutation.isPending || updateAppointmentMutation.isPending}
                  data-testid="button-appt-save"
                >
                  {editingApptId ? "Save Changes" : "Schedule"}
                </Button>
              </DialogFooter>
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
                  {dialogMode === "memo" ? "Add Memo" : "New Personal Event"}
                  <span className="text-sm font-normal text-muted-foreground">— {selectedDateLabel}</span>
                </DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Title <span className="text-destructive">*</span></Label>
                  <Input
                    placeholder={dialogMode === "memo" ? "Memo title..." : "Event title..."}
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
                    id="ev-all-day"
                    checked={evIsAllDay}
                    onCheckedChange={(v) => setEvIsAllDay(!!v)}
                    data-testid="checkbox-ev-all-day"
                  />
                  <Label htmlFor="ev-all-day" className="cursor-pointer">All Day</Label>
                </div>

                {!evIsAllDay && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label>Start Time</Label>
                      <Input
                        type="time"
                        value={evStartTime}
                        onChange={(e) => setEvStartTime(e.target.value)}
                        data-testid="input-ev-start-time"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label>End Time</Label>
                      <Input
                        type="time"
                        value={evEndTime}
                        onChange={(e) => setEvEndTime(e.target.value)}
                        data-testid="input-ev-end-time"
                      />
                    </div>
                  </div>
                )}

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
                )}
              </div>
              <DialogFooter>
                <Button variant="ghost" onClick={() => setDialogMode("picker")} data-testid="button-ev-back">
                  Back
                </Button>
                <Button
                  onClick={() => handleSaveEvent(dialogMode === "memo" ? "memo" : "personal")}
                  disabled={!evTitle.trim() || createEventMutation.isPending}
                  data-testid="button-ev-save"
                >
                  <Plus className="h-4 w-4 mr-1" />
                  {dialogMode === "memo" ? "Add Memo" : "Add Event"}
                </Button>
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
    </div>
  );
}
