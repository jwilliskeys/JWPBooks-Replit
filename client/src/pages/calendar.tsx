import { useState, useMemo } from "react";
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
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Link } from "wouter";
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
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import type { Appointment, Customer, CalendarNote, CalendarEvent, Piano } from "@shared/schema";

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
  const [apptPrice, setApptPrice] = useState("$180");
  const [apptNotes, setApptNotes] = useState("");
  const [apptIsTuning, setApptIsTuning] = useState(true);
  const [customerComboOpen, setCustomerComboOpen] = useState(false);
  const [customerSearch, setCustomerSearch] = useState("");

  const [evTitle, setEvTitle] = useState("");
  const [evNotes, setEvNotes] = useState("");
  const [evIsAllDay, setEvIsAllDay] = useState(false);
  const [evStartTime, setEvStartTime] = useState("");
  const [evEndTime, setEvEndTime] = useState("");
  const [evIsRepeating, setEvIsRepeating] = useState(false);
  const [evRepeatFreq, setEvRepeatFreq] = useState("weekly");

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
    setApptPrice("$180");
    setApptNotes("");
    setApptIsTuning(true);
    setCustomerSearch("");
    setEvTitle("");
    setEvNotes("");
    setEvIsAllDay(false);
    setEvStartTime("");
    setEvEndTime("");
    setEvIsRepeating(false);
    setEvRepeatFreq("weekly");
  }

  function handleSaveAppointment() {
    if (!selectedDate || !apptCustomerId) return;
    createAppointmentMutation.mutate({
      customerId: apptCustomerId,
      pianoId: apptPianoId ?? undefined,
      date: formatMDYY(selectedDate),
      time: formatTimeMinutes(apptTimeMinutes),
      duration: formatDurationMinutes(apptDurationMinutes),
      servicesRequested: apptServices || undefined,
      priceEstimate: apptPrice || undefined,
      notes: apptNotes || undefined,
      isTuning: apptIsTuning,
      status: "scheduled",
    });
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
              const dayAppts = appointmentsByDate.get(key) ?? [];
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
                          <Link key={appt.id} href={`/customers/${appt.customerId}`}>
                            <div
                              className={`flex items-center gap-2 text-xs p-1.5 rounded-md hover-elevate cursor-pointer ${isCompleted ? "opacity-60" : ""}`}
                              data-testid={`calendar-appointment-${appt.id}`}
                            >
                              <Clock className="h-3 w-3 shrink-0 text-muted-foreground" />
                              <span className={isCompleted ? "line-through" : ""}>
                                {appt.time} - {customer ? `${customer.firstName} ${customer.lastName}` : "Unknown"}
                              </span>
                            </div>
                          </Link>
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
                const dayAppts = appointmentsByDate.get(key) ?? [];
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
                          <Link key={appt.id} href={`/customers/${appt.customerId}`}>
                            <Badge
                              variant={isCompleted ? "secondary" : "default"}
                              className={`text-[10px] leading-tight w-full justify-start cursor-pointer truncate ${isCompleted ? "opacity-60" : ""}`}
                              data-testid={`calendar-appointment-${appt.id}`}
                            >
                              <span className={isCompleted ? "line-through" : ""}>
                                {appt.time} {customer ? customer.lastName : ""}
                              </span>
                            </Badge>
                          </Link>
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
                  Schedule Appointment
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
                                    <div className="text-xs text-muted-foreground">{[c.phone, c.city].filter(Boolean).join(" · ")}</div>
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
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-2 shrink-0">
                      <Checkbox
                        id="appt-is-tuning"
                        checked={apptIsTuning}
                        onCheckedChange={(v) => setApptIsTuning(!!v)}
                        data-testid="checkbox-appt-is-tuning"
                      />
                      <Label htmlFor="appt-is-tuning" className="cursor-pointer whitespace-nowrap">Tuning</Label>
                    </div>
                    <Label className="flex-1">Services Requested</Label>
                  </div>
                  <Input
                    placeholder="e.g. Tuning, regulation..."
                    value={apptServices}
                    onChange={(e) => setApptServices(e.target.value)}
                    data-testid="input-appt-services"
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
                <Button variant="ghost" onClick={() => setDialogMode("picker")} data-testid="button-appt-back">
                  Back
                </Button>
                <Button
                  onClick={handleSaveAppointment}
                  disabled={!apptCustomerId || createAppointmentMutation.isPending}
                  data-testid="button-appt-save"
                >
                  Schedule
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
    </div>
  );
}
