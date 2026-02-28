import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Link } from "wouter";
import {
  ChevronLeft,
  ChevronRight,
  Plus,
  X,
  Calendar,
  Clock,
  StickyNote,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useIsMobile } from "@/hooks/use-mobile";
import type { Appointment, Customer, CalendarNote } from "@shared/schema";

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

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function CalendarPage() {
  const { toast } = useToast();
  const isMobile = useIsMobile();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const [currentMonth, setCurrentMonth] = useState(today.getMonth());
  const [currentYear, setCurrentYear] = useState(today.getFullYear());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [noteTitle, setNoteTitle] = useState("");
  const [noteText, setNoteText] = useState("");

  const { data: appointments, isLoading: loadingAppts } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments"],
  });

  const { data: calendarNotes, isLoading: loadingNotes } = useQuery<CalendarNote[]>({
    queryKey: ["/api/calendar-notes"],
  });

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const customerMap = useMemo(
    () => new Map(customers?.map((c) => [c.id, c]) ?? []),
    [customers]
  );

  const createNoteMutation = useMutation({
    mutationFn: (data: { date: string; title: string; notes?: string }) =>
      apiRequest("POST", "/api/calendar-notes", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/calendar-notes"] });
      toast({ title: "Note added" });
      setDialogOpen(false);
      setNoteTitle("");
      setNoteText("");
    },
    onError: () => {
      toast({ title: "Failed to add note", variant: "destructive" });
    },
  });

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
    setNoteTitle("");
    setNoteText("");
    setDialogOpen(true);
  }

  function handleAddNote() {
    if (!selectedDate || !noteTitle.trim()) return;
    createNoteMutation.mutate({
      date: formatMDYY(selectedDate),
      title: noteTitle.trim(),
      notes: noteText.trim() || undefined,
    });
  }

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
    return (appointmentsByDate.get(key)?.length ?? 0) > 0 || (notesByDate.get(key)?.length ?? 0) > 0;
  });

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
                    </div>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <StickyNote className="h-4 w-4" />
              Add Note
              {selectedDate && (
                <span className="text-sm font-normal text-muted-foreground">
                  - {MONTH_NAMES[selectedDate.getMonth()]} {selectedDate.getDate()}, {selectedDate.getFullYear()}
                </span>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <Input
              placeholder="Title"
              value={noteTitle}
              onChange={(e) => setNoteTitle(e.target.value)}
              data-testid="input-note-title"
            />
            <Textarea
              placeholder="Notes (optional)"
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              className="resize-none"
              rows={3}
              data-testid="input-note-text"
            />
          </div>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setDialogOpen(false)}
              data-testid="button-cancel-note"
            >
              Cancel
            </Button>
            <Button
              onClick={handleAddNote}
              disabled={!noteTitle.trim() || createNoteMutation.isPending}
              data-testid="button-save-note"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Note
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
