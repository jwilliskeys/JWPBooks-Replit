import { useState, useEffect, useMemo, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertCircle,
  X,
  Search,
  UserRound,
  ArrowLeft,
  Car,
  CalendarDays,
  Clock,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Customer, Piano, Appointment, ServiceCatalogItem } from "@shared/schema";
import {
  checkTimeConflict,
  parseDurationToMinutes,
  type ExistingAppointment,
} from "@/lib/scheduling";
import { ServicePicker } from "@/components/service-picker";
import {
  TimeStepperWidget,
  DatePickerPopover,
  formatTimeMinutes,
  formatDurationMinutes,
  DEFAULT_TIME_MINUTES,
} from "@/components/time-stepper";

// ─── helpers ────────────────────────────────────────────────────────────────

function todayMDYY(): string {
  const d = new Date();
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
}

// Convert M/D/YY → YYYY-MM-DD for <input type="date">
function toInputDate(mdyy: string): string {
  if (!mdyy) return "";
  const parts = mdyy.split("/");
  if (parts.length !== 3) return "";
  const m = parts[0].padStart(2, "0");
  const d = parts[1].padStart(2, "0");
  let yr = parseInt(parts[2], 10);
  if (yr < 100) yr += 2000;
  return `${yr}-${m}-${d}`;
}

// Convert YYYY-MM-DD → M/D/YY for app-internal format
function fromInputDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  const yr = y % 100;
  return `${m}/${d}/${yr}`;
}

// Human-readable date label from M/D/YY
function dateLabel(mdyy: string): string {
  if (!mdyy) return "";
  const parts = mdyy.split("/");
  if (parts.length !== 3) return mdyy;
  let yr = parseInt(parts[2], 10);
  if (yr < 100) yr += 2000;
  const d = new Date(yr, parseInt(parts[0], 10) - 1, parseInt(parts[1], 10));
  if (isNaN(d.getTime())) return mdyy;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

function parseDateStr(s: string | null | undefined): Date | null {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s); return isNaN(d.getTime()) ? null : d;
  }
  const p = s.split("/");
  if (p.length !== 3) return null;
  let yr = parseInt(p[2]); if (yr < 100) yr += 2000;
  const d = new Date(yr, parseInt(p[0]) - 1, parseInt(p[1]));
  return isNaN(d.getTime()) ? null : d;
}

function monthsDiff(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

function daysDiff(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

function calcNextTuningDue(lastTuned: string | null | undefined, interval: string | null | undefined): Date | null {
  const d = parseDateStr(lastTuned);
  if (!d || !interval) return null;
  const months = parseInt(interval);
  if (isNaN(months)) return null;
  const next = new Date(d);
  next.setMonth(next.getMonth() + months);
  return next;
}

function nextTuningLabel(lastTuned: string | null | undefined, interval: string | null | undefined): { label: string | null; urgent: boolean } {
  const next = calcNextTuningDue(lastTuned, interval);
  if (!next) return { label: null, urgent: false };
  const days = daysDiff(new Date(), next);
  if (days === 0) return { label: "Next tuning: Today", urgent: true };
  if (days === -1) return { label: "Next tuning: Yesterday", urgent: true };
  if (days < 0) return { label: `Next tuning: ${Math.abs(days)} days overdue`, urgent: true };
  if (days === 1) return { label: "Next tuning: Tomorrow", urgent: false };
  if (days < 30) return { label: `Next tuning: in ${days} days`, urgent: false };
  const mos = Math.round(days / 30);
  return { label: `Next tuning: in ${mos} month${mos !== 1 ? "s" : ""}`, urgent: false };
}

function lastTunedLabel(lastTuned: string | null | undefined): string {
  const d = parseDateStr(lastTuned);
  if (!d) return "Never tuned";
  const mos = monthsDiff(d, new Date());
  if (mos === 0) return "Last tuned: This month";
  if (mos === 1) return "Last tuned: Last month";
  if (mos < 12) return `Last tuned: ${mos} months ago`;
  const yrs = Math.floor(mos / 12);
  return `Last tuned: ${yrs} year${yrs !== 1 ? "s" : ""} ago`;
}

function pianoTypeLabel(p: Piano): string {
  const t = (p.pianoType ?? "").toLowerCase();
  if (t.includes("grand")) return "GRAND";
  if (t.includes("upright") || t.includes("vertical")) return "UPRIGHT";
  if (t.includes("digital")) return "DIGITAL";
  return "UNKNOWN";
}

function pianoDisplayName(p: Piano): string {
  return [p.year, p.make, p.model].filter(Boolean).join(" ") || `Piano #${p.id}`;
}

function pianoSubline(p: Piano): string {
  return [p.serialNumber, p.location].filter(Boolean).join(", ");
}

function parseCost(s: string | null | undefined): number {
  if (!s) return 0;
  return parseFloat(s.replace(/[^0-9.]/g, "")) || 0;
}

// ─── types ───────────────────────────────────────────────────────────────────

interface PianoSection {
  sectionId: string;
  pianoId: number | null;
  selectedNames: string[];
  isTuning: boolean;
  price: string;
  pickerKey: number;
  isMisc: boolean;
}

function makeSection(pianoId: number | null = null, isMisc = false): PianoSection {
  return {
    sectionId: `${Date.now()}-${Math.random()}`,
    pianoId,
    selectedNames: [],
    isTuning: false,
    price: "",
    pickerKey: 0,
    isMisc,
  };
}

interface AppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId?: number;
  pianoId?: number;
  customerName?: string;
  initialDate?: string;
}

// ─── Piano Picker View ───────────────────────────────────────────────────────

interface PianoPickerViewProps {
  pianos: Piano[];
  onSelect: (piano: Piano) => void;
  onClose: () => void;
}

function PianoPickerView({ pianos, onSelect, onClose }: PianoPickerViewProps) {
  const [query, setQuery] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50); }, []);

  const filtered = useMemo(() => {
    let list = activeOnly ? pianos.filter(p => p.isActive !== false) : pianos;
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(p =>
        [p.make, p.model, p.year, p.serialNumber, p.location, p.pianoType]
          .some(v => v?.toLowerCase().includes(q))
      );
    }
    return list.sort((a, b) => {
      const an = calcNextTuningDue(a.lastTuned, a.tuningInterval);
      const bn = calcNextTuningDue(b.lastTuned, b.tuningInterval);
      if (!an && !bn) return 0;
      if (!an) return 1;
      if (!bn) return -1;
      return an.getTime() - bn.getTime();
    });
  }, [pianos, query, activeOnly]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Find a piano by make, model, location, serial number…"
            className="pl-8 h-9 text-sm"
          />
        </div>
        <Button type="button" size="sm" variant="outline" className="shrink-0 text-xs">
          + New Piano
        </Button>
      </div>

      <label className="flex items-center gap-2 text-sm text-muted-foreground mb-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={activeOnly}
          onChange={e => setActiveOnly(e.target.checked)}
          className="rounded"
        />
        Only show active pianos
      </label>

      <div className="flex-1 overflow-y-auto rounded-lg border divide-y">
        {filtered.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {pianos.length === 0 ? "No pianos on file for this client." : "No pianos match your search."}
          </div>
        ) : (
          filtered.map(piano => {
            const { label: nextLabel, urgent } = nextTuningLabel(piano.lastTuned, piano.tuningInterval);
            const typeLabel = pianoTypeLabel(piano);
            return (
              <button
                key={piano.id}
                type="button"
                onClick={() => onSelect(piano)}
                className="w-full flex items-center gap-3 px-3 py-3 hover:bg-muted/30 transition-colors text-left"
              >
                <div className="shrink-0 w-12 flex flex-col items-center gap-0.5">
                  <span className="text-xl">🎹</span>
                  <span className="text-[9px] font-bold text-muted-foreground tracking-wide">{typeLabel}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-tight">{pianoDisplayName(piano)}</p>
                  {pianoSubline(piano) && (
                    <p className="text-xs text-muted-foreground mt-0.5">{pianoSubline(piano)}</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-muted-foreground">{lastTunedLabel(piano.lastTuned)}</p>
                  {nextLabel && (
                    <p className={`text-xs font-medium mt-0.5 ${urgent ? "text-red-500" : "text-muted-foreground"}`}>
                      {nextLabel}
                    </p>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Section header bar ──────────────────────────────────────────────────────

function SectionBar({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/50 border border-border/60">
      <span className="text-sm font-semibold text-foreground">{title}</span>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

// ─── Piano card (after piano selected) ───────────────────────────────────────

interface PianoCardProps {
  section: PianoSection;
  piano: Piano | undefined;
  catalog: ServiceCatalogItem[] | undefined;
  onUpdate: (patch: Partial<PianoSection>) => void;
  onRemove: () => void;
  pickerMountKey: number;
  showRemove: boolean;
}

function PianoCard({ section, piano, catalog, onUpdate, onRemove, pickerMountKey, showRemove }: PianoCardProps) {
  const totalCost = useMemo(() => {
    if (!catalog) return 0;
    return section.selectedNames.reduce((sum, name) => {
      const svc = catalog.find(s => s.name === name);
      return sum + parseCost(svc?.defaultCost);
    }, 0);
  }, [section.selectedNames, catalog]);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-start gap-3 px-3 py-3 border-b border-border/50 bg-muted/20">
        <div className="shrink-0 flex flex-col items-center gap-0.5 pt-0.5">
          <span className="text-lg">🎹</span>
          <span className="text-[9px] font-bold text-muted-foreground tracking-wide">
            {piano ? pianoTypeLabel(piano) : "—"}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight">
            {section.isMisc ? "Misc / Standalone Service" : (piano ? pianoDisplayName(piano) : "Unknown Piano")}
          </p>
          {piano && pianoSubline(piano) && (
            <p className="text-xs text-muted-foreground mt-0.5">{pianoSubline(piano)}</p>
          )}
          {piano?.lastTuned && (
            <p className="text-xs text-muted-foreground mt-1">
              {lastTunedLabel(piano.lastTuned)}
              {piano.tuningInterval && ` · Every ${piano.tuningInterval}`}
            </p>
          )}
        </div>
        {showRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="px-3 py-2.5">
        <ServicePicker
          key={`${pickerMountKey}-${section.sectionId}`}
          value={section.selectedNames}
          onChange={(names, isTuning, cost) => {
            onUpdate({
              selectedNames: names,
              isTuning,
              price: cost > 0 ? `$${cost.toFixed(0)}` : "",
            });
          }}
        />
        {section.selectedNames.length > 0 && (
          <div className="flex items-center gap-2 mt-2.5">
            <Label className="text-xs text-muted-foreground shrink-0">Price override</Label>
            <Input
              value={section.price}
              onChange={e => onUpdate({ price: e.target.value })}
              placeholder={totalCost > 0 ? `$${totalCost.toFixed(0)}` : "$—"}
              className="h-7 text-sm"
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Finalize & Save Dialog ──────────────────────────────────────────────────

interface FinalizeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  sections: PianoSection[];
  setSections: (s: PianoSection[]) => void;
  activePianos: Piano[];
  catalog: ServiceCatalogItem[] | undefined;
  pianoMap: Map<number, Piano>;
  effectiveCustomerId: number;
  selectedCustomer: Customer | undefined;
  customerName?: string;
  totalCost: number;
  totalDurationMinutes: number;
  allAppointments: Appointment[] | undefined;
  customerMap: Map<number, Customer>;
  onSuccess: () => void;
}

function FinalizeDialog({
  open,
  onOpenChange,
  date,
  sections,
  setSections,
  activePianos,
  catalog,
  pianoMap,
  effectiveCustomerId,
  selectedCustomer,
  customerName,
  totalCost,
  totalDurationMinutes,
  allAppointments,
  customerMap,
  onSuccess,
}: FinalizeDialogProps) {
  const { toast } = useToast();

  const [notes, setNotes] = useState("");
  const [travelMode, setTravelMode] = useState("Driving");
  const [isAllDay, setIsAllDay] = useState(true);
  const [timeMinutes, setTimeMinutes] = useState(DEFAULT_TIME_MINUTES);
  const [localDuration, setLocalDuration] = useState(totalDurationMinutes || 90);
  const [appointmentTitle, setAppointmentTitle] = useState("");
  const [conflictError, setConflictError] = useState("");
  const [showItinerary, setShowItinerary] = useState(false);
  const [showPianoPicker, setShowPianoPicker] = useState(false);
  const [finalizeMountKey, setFinalizeMountKey] = useState(0);

  const clientFullName = selectedCustomer
    ? `${selectedCustomer.firstName} ${selectedCustomer.lastName}`
    : customerName ?? "";

  const clientAddress = [
    selectedCustomer?.address,
    selectedCustomer?.city,
    selectedCustomer?.state,
  ].filter(Boolean).join(", ");

  useEffect(() => {
    if (open) {
      setNotes("");
      setTravelMode("Driving");
      setIsAllDay(true);
      setTimeMinutes(DEFAULT_TIME_MINUTES);
      setLocalDuration(totalDurationMinutes || 90);
      setConflictError("");
      setShowItinerary(false);
      setShowPianoPicker(false);
      setFinalizeMountKey(k => k + 1);
    }
  }, [open]);

  // Seed title from client name when dialog opens (clientFullName resolves async)
  useEffect(() => {
    if (open && clientFullName && !appointmentTitle) {
      setAppointmentTitle(clientFullName);
    }
  }, [open, clientFullName]);

  const displayDate = useMemo(() => dateLabel(date), [date]);
  const displayDuration = useMemo(() => formatDurationMinutes(localDuration), [localDuration]);

  const endsAt = useMemo(() => {
    const end = timeMinutes + localDuration;
    return formatTimeMinutes(end);
  }, [timeMinutes, localDuration]);

  // Itinerary: appointments already on this date (excluding the one being created)
  const itineraryItems = useMemo(() => {
    if (!date || !allAppointments) return [];
    return allAppointments
      .filter(a => a.date === date && a.status !== "cancelled")
      .sort((a, b) => {
        const at = a.time ?? ""; const bt = b.time ?? "";
        return at.localeCompare(bt);
      })
      .map(a => {
        const cust = customerMap.get(a.customerId);
        return {
          id: a.id,
          time: a.time ?? "",
          duration: a.duration ?? "",
          client: cust ? `${cust.firstName} ${cust.lastName}` : "Unknown",
          service: a.servicesRequested ?? "",
        };
      });
  }, [date, allAppointments, customerMap]);

  // Section helpers for editable pianos panel
  function updateFinalizeSection(sectionId: string, patch: Partial<PianoSection>) {
    setSections(sections.map(s => s.sectionId === sectionId ? { ...s, ...patch } : s));
  }
  function removeFinalizeSection(sectionId: string) {
    setSections(sections.filter(s => s.sectionId !== sectionId));
  }
  function addFinalizePiano(piano: Piano) {
    setSections([...sections, makeSection(piano.id)]);
    setShowPianoPicker(false);
  }
  function addFinalizeMisc() {
    setSections([...sections, makeSection(null, true)]);
  }

  const selectedCustomerCity = selectedCustomer?.city ?? "";

  const existingApptsForDate = useMemo((): ExistingAppointment[] => {
    if (!date || !allAppointments) return [];
    return allAppointments
      .filter(a => a.date === date && a.status !== "cancelled")
      .map(a => {
        const cust = customerMap.get(a.customerId);
        return { time: a.time, duration: a.duration ?? "2 hours", city: cust?.city || "" };
      });
  }, [date, allAppointments, customerMap]);

  const createMutation = useMutation({
    mutationFn: async () => {
      const timeStr = isAllDay ? "9:00 AM" : formatTimeMinutes(timeMinutes);
      const durationStr = formatDurationMinutes(localDuration);
      const payloadSections = sections.length > 0 ? sections : [makeSection()];
      const results = [];
      for (const sec of payloadSections) {
        const payload = {
          customerId: effectiveCustomerId,
          pianoId: sec.pianoId ?? undefined,
          date,
          time: timeStr,
          duration: durationStr,
          servicesRequested: sec.selectedNames.join(", ") || undefined,
          priceEstimate: sec.price || undefined,
          notes: notes || undefined,
          isTuning: sec.isTuning,
          status: "scheduled",
        };
        const res = await apiRequest("POST", "/api/appointments", payload);
        results.push(await res.json());
      }
      return results;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      if (effectiveCustomerId) {
        queryClient.invalidateQueries({ queryKey: ["/api/customers", String(effectiveCustomerId), "appointments"] });
      }
      onSuccess();
      onOpenChange(false);
      toast({ title: sections.length > 1 ? `${sections.length} appointments scheduled` : "Appointment scheduled" });
    },
    onError: () => toast({ title: "Failed to schedule appointment", variant: "destructive" }),
  });

  function handleSave() {
    if (!isAllDay) {
      const timeStr = formatTimeMinutes(timeMinutes);
      const durationStr = formatDurationMinutes(localDuration);
      const result = checkTimeConflict(timeStr, durationStr, selectedCustomerCity, existingApptsForDate);
      if (!result.valid) {
        setConflictError(result.message || "Time conflict detected.");
        return;
      }
    }
    createMutation.mutate();
  }

  // Stepper button style
  const stepBtn = "h-6 px-1.5 text-[10px] font-semibold rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors leading-none";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl max-h-[92vh] flex flex-col gap-0 p-0 overflow-hidden">
        {/* Header */}
        <DialogHeader className="px-5 pt-4 pb-3 shrink-0 border-b flex-row items-center gap-3 space-y-0">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <DialogTitle className="text-lg font-bold">Finalize &amp; Save</DialogTitle>
        </DialogHeader>

        {/* Two-column body */}
        <div className="flex-1 overflow-y-auto">
          <div className="grid grid-cols-2 divide-x min-h-full">

            {/* ── LEFT PANEL ── */}
            <div className="p-5 space-y-4">
              <SectionBar title="Details" />

              {/* Itinerary link */}
              {date && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setShowItinerary(o => !o)}
                    className="flex items-center gap-1.5 text-xs text-primary hover:underline"
                  >
                    <CalendarDays className="h-3.5 w-3.5 shrink-0" />
                    Show itinerary for {displayDate}
                  </button>

                  {/* Itinerary popover */}
                  {showItinerary && (
                    <div className="absolute top-full left-0 z-50 mt-1 w-72 rounded-lg border bg-popover shadow-lg p-3 space-y-2">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                        {displayDate}
                      </p>
                      {itineraryItems.length === 0 ? (
                        <p className="text-xs text-muted-foreground">No appointments scheduled yet.</p>
                      ) : (
                        itineraryItems.map(item => (
                          <div key={item.id} className="flex items-start gap-2 text-xs">
                            <span className="font-mono text-muted-foreground shrink-0 w-16">{item.time}</span>
                            <div className="min-w-0">
                              <p className="font-medium leading-tight truncate">{item.client}</p>
                              {item.service && <p className="text-muted-foreground truncate">{item.service}</p>}
                              {item.duration && <p className="text-muted-foreground">{item.duration}</p>}
                            </div>
                          </div>
                        ))
                      )}
                      <button
                        type="button"
                        onClick={() => setShowItinerary(false)}
                        className="mt-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Close
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Appointment title */}
              <Input
                value={appointmentTitle}
                onChange={e => setAppointmentTitle(e.target.value)}
                placeholder="Appointment title"
                className="text-sm font-medium"
                data-testid="input-appointment-title"
              />

              {/* Notes */}
              <Textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Notes"
                className="min-h-[80px] resize-none text-sm"
                data-testid="input-finalize-notes"
              />

              {/* Travel mode */}
              <div className="flex items-center gap-3">
                <Car className="h-4 w-4 text-muted-foreground shrink-0" />
                <Select value={travelMode} onValueChange={setTravelMode}>
                  <SelectTrigger className="text-sm text-base md:text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Driving" className="py-3 sm:py-1.5">Driving</SelectItem>
                    <SelectItem value="Transit" className="py-3 sm:py-1.5">Transit</SelectItem>
                    <SelectItem value="Walking" className="py-3 sm:py-1.5">Walking</SelectItem>
                    <SelectItem value="Biking" className="py-3 sm:py-1.5">Biking</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {/* Date & Time */}
              <SectionBar title="Date &amp; Time" />

              <div className="space-y-3">
                {/* All-day checkbox */}
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="finalize-all-day"
                    checked={isAllDay}
                    onCheckedChange={v => { setIsAllDay(!!v); setConflictError(""); }}
                  />
                  <Label htmlFor="finalize-all-day" className="text-sm cursor-pointer">
                    This is an all-day or multi-day event
                  </Label>
                </div>

                {/* All-day: simple date display */}
                {isAllDay && (
                  <DatePickerPopover value={date} onChange={() => {}} readOnly />
                )}

                {/* Timed: Gazelle-style stepper row */}
                {!isAllDay && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Clock className="h-4 w-4 text-muted-foreground shrink-0" />

                      {/* Date picker */}
                      <DatePickerPopover value={date} onChange={() => {}} readOnly />

                      {/* Time stepper */}
                      <div className="flex items-center gap-1">
                        <div className="flex flex-col gap-0.5">
                          <button type="button" className={stepBtn} onClick={() => setTimeMinutes(m => Math.min(m + 60, 23 * 60))}>+1h</button>
                          <button type="button" className={stepBtn} onClick={() => setTimeMinutes(m => Math.max(m - 60, 0))}>-1h</button>
                        </div>
                        <span className="text-sm font-semibold px-2 py-1 rounded border bg-background min-w-[68px] text-center">
                          {formatTimeMinutes(timeMinutes)}
                        </span>
                        <div className="flex flex-col gap-0.5">
                          <button type="button" className={stepBtn} onClick={() => { setTimeMinutes(m => Math.min(m + 5, 23 * 60)); setConflictError(""); }}>+5m</button>
                          <button type="button" className={stepBtn} onClick={() => { setTimeMinutes(m => Math.max(m - 5, 0)); setConflictError(""); }}>-5m</button>
                        </div>
                      </div>

                      <span className="text-sm text-muted-foreground">for</span>

                      {/* Duration stepper */}
                      <div className="flex items-center gap-1">
                        <div className="flex flex-col gap-0.5">
                          <button type="button" className={stepBtn} onClick={() => setLocalDuration(d => Math.min(d + 60, 8 * 60))}>+1h</button>
                          <button type="button" className={stepBtn} onClick={() => setLocalDuration(d => Math.max(d - 60, 5))}>-1h</button>
                        </div>
                        <span className="text-sm font-semibold px-2 py-1 rounded border bg-background min-w-[68px] text-center">
                          {displayDuration}
                        </span>
                        <div className="flex flex-col gap-0.5">
                          <button type="button" className={stepBtn} onClick={() => setLocalDuration(d => Math.min(d + 5, 8 * 60))}>+5m</button>
                          <button type="button" className={stepBtn} onClick={() => setLocalDuration(d => Math.max(d - 5, 5))}>-5m</button>
                        </div>
                      </div>
                    </div>

                    <p className="text-xs text-muted-foreground ml-6">Ends at {endsAt}</p>

                    {conflictError && (
                      <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive">
                        <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                        <span>{conflictError}</span>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* ── RIGHT PANEL ── */}
            <div className="p-5 space-y-4">
              <SectionBar title="Client Information" />

              {/* Client card */}
              {(selectedCustomer || clientFullName) && (
                <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/20">
                  <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                    <UserRound className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <p className="font-semibold text-sm leading-tight">{clientFullName}</p>
                    {clientAddress && (
                      <p className="text-xs text-muted-foreground mt-0.5">{clientAddress}</p>
                    )}
                  </div>
                </div>
              )}

              {/* Pianos & Services — fully editable */}
              {showPianoPicker ? (
                <div className="h-[360px] flex flex-col">
                  <PianoPickerView
                    pianos={activePianos}
                    onSelect={addFinalizePiano}
                    onClose={() => setShowPianoPicker(false)}
                  />
                </div>
              ) : (
                <>
                  <SectionBar title="Pianos &amp; Services">
                    <Button type="button" size="sm" className="h-7 text-xs" onClick={() => setShowPianoPicker(true)}>
                      Add Piano
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="h-7 text-xs" onClick={addFinalizeMisc}>
                      Add Misc
                    </Button>
                  </SectionBar>

                  <div className="space-y-2">
                    {sections.length === 0 ? (
                      <p className="text-sm text-muted-foreground text-center py-4">No pianos or services added.</p>
                    ) : (
                      sections.map(sec => (
                        <PianoCard
                          key={sec.sectionId}
                          section={sec}
                          piano={sec.pianoId ? pianoMap.get(sec.pianoId) : undefined}
                          catalog={catalog}
                          onUpdate={patch => updateFinalizeSection(sec.sectionId, patch)}
                          onRemove={() => removeFinalizeSection(sec.sectionId)}
                          pickerMountKey={finalizeMountKey}
                          showRemove={sections.length > 1 || !!sec.isMisc}
                        />
                      ))
                    )}
                  </div>

                  {/* Totals */}
                  {(totalCost > 0 || localDuration > 0) && (
                    <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-muted/40 border text-sm">
                      <span className="text-muted-foreground">Total</span>
                      <div className="flex items-center gap-4">
                        {localDuration > 0 && <span className="text-muted-foreground">{displayDuration}</span>}
                        {totalCost > 0 && <span className="font-semibold">${totalCost.toFixed(2)}</span>}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t bg-background px-5 py-3 flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)} className="text-muted-foreground">
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={createMutation.isPending} data-testid="button-save-appointment">
            {createMutation.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main dialog ─────────────────────────────────────────────────────────────

export function AppointmentDialog({
  open,
  onOpenChange,
  customerId,
  pianoId,
  customerName,
  initialDate,
}: AppointmentDialogProps) {
  const [pickerMountKey, setPickerMountKey] = useState(0);
  const [showFinalizeDialog, setShowFinalizeDialog] = useState(false);

  // Client search
  const [clientSearch, setClientSearch] = useState("");
  const [showClientResults, setShowClientResults] = useState(false);
  const [selectedClientId, setSelectedClientId] = useState(customerId ?? 0);
  const clientSearchRef = useRef<HTMLInputElement>(null);

  // Piano picker view
  const [showPianoPicker, setShowPianoPicker] = useState(false);

  // Date + sections
  const [date, setDate] = useState(initialDate ?? todayMDYY());
  const [sections, setSections] = useState<PianoSection[]>([]);

  // Reset on open
  useEffect(() => {
    if (open) {
      setSelectedClientId(customerId ?? 0);
      setClientSearch("");
      setShowClientResults(false);
      setShowPianoPicker(false);
      setDate(initialDate ?? todayMDYY());
      setSections(pianoId ? [makeSection(pianoId)] : []);
      setPickerMountKey(k => k + 1);
      setShowFinalizeDialog(false);
    }
  }, [open, customerId, pianoId, initialDate]);

  // Queries
  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: allAppointments } = useQuery<Appointment[]>({ queryKey: ["/api/appointments"], enabled: open });
  const { data: catalog } = useQuery<ServiceCatalogItem[]>({ queryKey: ["/api/service-catalog"] });

  const effectiveCustomerId = customerId ?? selectedClientId;

  const { data: customerPianos } = useQuery<Piano[]>({
    queryKey: ["/api/customers", String(effectiveCustomerId), "pianos"],
    enabled: !!effectiveCustomerId,
  });

  const activePianos = useMemo(
    () => (customerPianos ?? []).filter(p => p.isActive !== false),
    [customerPianos]
  );

  const customerMap = useMemo(
    () => new Map(customers?.map(c => [c.id, c]) ?? []),
    [customers]
  );

  const selectedCustomer = customerMap.get(effectiveCustomerId);

  // Total cost across all sections
  const totalCost = useMemo(() => {
    let total = 0;
    sections.forEach(sec => { total += parseCost(sec.price); });
    if (total === 0 && catalog) {
      sections.forEach(sec => {
        sec.selectedNames.forEach(name => {
          const svc = catalog.find(s => s.name === name);
          total += parseCost(svc?.defaultCost);
        });
      });
    }
    return total;
  }, [sections, catalog]);

  // Duration from services
  const totalDurationMinutes = useMemo(() => {
    if (!catalog) return 90;
    let total = 0;
    sections.forEach(sec => {
      sec.selectedNames.forEach(name => {
        const svc = catalog.find(s => s.name === name);
        if (svc?.defaultDuration) total += parseDurationToMinutes(svc.defaultDuration);
      });
    });
    return total || 90;
  }, [sections, catalog]);

  const pianoMap = useMemo(
    () => new Map((customerPianos ?? []).map(p => [p.id, p])),
    [customerPianos]
  );

  // Section helpers
  function updateSection(sectionId: string, patch: Partial<PianoSection>) {
    setSections(prev => prev.map(s => s.sectionId === sectionId ? { ...s, ...patch } : s));
  }

  function removeSection(sectionId: string) {
    setSections(prev => prev.filter(s => s.sectionId !== sectionId));
  }

  function selectClient(c: Customer) {
    setSelectedClientId(c.id);
    setClientSearch("");
    setShowClientResults(false);
    setSections([]);
    setPickerMountKey(k => k + 1);
  }

  function resetClient() {
    setSelectedClientId(0);
    setClientSearch("");
    setSections([]);
    setPickerMountKey(k => k + 1);
  }

  function handlePianoSelect(piano: Piano) {
    setSections(prev => [...prev, makeSection(piano.id)]);
    setShowPianoPicker(false);
  }

  function addMiscSection() {
    setSections(prev => [...prev, makeSection(null, true)]);
  }

  const clientResults = useMemo(() => {
    if (!customers || !clientSearch.trim()) return [];
    const q = clientSearch.toLowerCase();
    return customers.filter(c =>
      [`${c.firstName} ${c.lastName}`, c.email ?? "", c.phone ?? "", c.city ?? ""]
        .some(v => v.toLowerCase().includes(q))
    ).slice(0, 8);
  }, [customers, clientSearch]);

  const canBook = !!effectiveCustomerId;

  const bookLabel = useMemo(() => {
    if (!date) return "Book Appointment";
    const label = dateLabel(date);
    return label ? `Book ${label}` : `Book ${date}`;
  }, [date]);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg max-h-[92vh] flex flex-col gap-0 p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 shrink-0">
            <DialogTitle className="text-lg font-bold">Schedule an Appointment</DialogTitle>
          </DialogHeader>

          {/* ── Scrollable body ── */}
          <div className="flex-1 overflow-y-auto px-5 space-y-4 pb-2">

            {/* ══ PIANO PICKER VIEW ════════════════════════════════════════════ */}
            {showPianoPicker ? (
              <div className="h-[480px] flex flex-col">
                <PianoPickerView
                  pianos={activePianos}
                  onSelect={handlePianoSelect}
                  onClose={() => setShowPianoPicker(false)}
                />
              </div>
            ) : (
              <>
                {/* ══ CLIENT INFORMATION ══════════════════════════════════════ */}
                <div className="space-y-2">
                  <SectionBar title="Client Information">
                    {effectiveCustomerId > 0 && !customerId && (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs text-muted-foreground hover:text-foreground"
                        onClick={resetClient}
                      >
                        Reset Client
                      </Button>
                    )}
                  </SectionBar>

                  {customerId && customerName ? (
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-muted/20">
                      <div className="h-8 w-8 rounded-full bg-muted flex items-center justify-center shrink-0">
                        <UserRound className="h-4 w-4 text-muted-foreground" />
                      </div>
                      <span className="text-sm font-medium">{customerName}</span>
                    </div>
                  ) : effectiveCustomerId > 0 && selectedCustomer ? (
                    <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg border bg-muted/20">
                      <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                        <UserRound className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold">{selectedCustomer.firstName} {selectedCustomer.lastName}</p>
                        {selectedCustomer.city && (
                          <p className="text-xs text-muted-foreground">{selectedCustomer.city}</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">Find Existing Client</Label>
                      <div className="flex gap-2">
                        <div className="relative flex-1">
                          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
                          <Input
                            ref={clientSearchRef}
                            value={clientSearch}
                            onChange={e => { setClientSearch(e.target.value); setShowClientResults(true); }}
                            onFocus={() => setShowClientResults(true)}
                            placeholder="Find a client by name, phone, email, etc."
                            className="pl-8 text-sm"
                            data-testid="input-client-search"
                          />
                        </div>
                        <Button type="button" size="sm" variant="outline" className="shrink-0 text-xs gap-1">
                          <UserRound className="h-3.5 w-3.5" /> New Client
                        </Button>
                      </div>
                      {showClientResults && clientResults.length > 0 && (
                        <div className="rounded-lg border bg-popover shadow-md overflow-hidden z-50">
                          {clientResults.map(c => (
                            <button
                              key={c.id}
                              type="button"
                              onMouseDown={() => selectClient(c)}
                              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent transition-colors text-left"
                              data-testid={`client-result-${c.id}`}
                            >
                              <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                                <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
                              </div>
                              <div className="min-w-0">
                                <p className="text-sm font-medium">{c.firstName} {c.lastName}</p>
                                {(c.city || c.email) && (
                                  <p className="text-xs text-muted-foreground truncate">{c.city ?? c.email}</p>
                                )}
                              </div>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* ══ PIANOS & SERVICES ═══════════════════════════════════════ */}
                <div className="space-y-2">
                  <SectionBar title="Pianos & Services">
                    {effectiveCustomerId > 0 && (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 text-xs"
                          onClick={() => setShowPianoPicker(true)}
                          data-testid="button-add-piano"
                        >
                          Add Piano
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-xs"
                          onClick={addMiscSection}
                          data-testid="button-add-misc-service"
                        >
                          Add Misc Service
                        </Button>
                      </>
                    )}
                  </SectionBar>

                  {sections.length === 0 ? (
                    <div className="py-8 text-center">
                      {effectiveCustomerId > 0 ? (
                        <p className="text-sm text-muted-foreground">
                          Add a piano and services{" "}
                          <span className="inline-block rotate-[-20deg] text-base">↗</span>
                        </p>
                      ) : (
                        <p className="text-sm text-muted-foreground">Select a client first.</p>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {sections.map((sec) => (
                        <PianoCard
                          key={sec.sectionId}
                          section={sec}
                          piano={sec.pianoId ? pianoMap.get(sec.pianoId) : undefined}
                          catalog={catalog}
                          onUpdate={(patch) => updateSection(sec.sectionId, patch)}
                          onRemove={() => removeSection(sec.sectionId)}
                          pickerMountKey={pickerMountKey}
                          showRemove={sections.length > 1 || !!sec.isMisc}
                        />
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* ── Footer bar ── */}
          {!showPianoPicker && (
            <div className="shrink-0 border-t bg-muted/30 px-5 py-3 flex items-center justify-between gap-3">
              <div className="flex items-center gap-4 text-sm text-muted-foreground">
                <div>
                  <span className="text-xs block">Total cost</span>
                  <span className="font-semibold text-foreground">
                    {totalCost > 0 ? `$${totalCost.toFixed(2)}` : "—"}
                  </span>
                </div>
                <div>
                  <span className="text-xs block">Total duration</span>
                  <span className="font-semibold text-foreground">
                    {totalDurationMinutes > 0 ? formatDurationMinutes(totalDurationMinutes) : "—"}
                  </span>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onOpenChange(false)}
                  className="text-muted-foreground"
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => setShowFinalizeDialog(true)}
                  disabled={!canBook}
                  className="text-sm"
                  data-testid="button-book-appointment"
                >
                  {bookLabel}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ── Finalize & Save dialog ── */}
      <FinalizeDialog
        open={showFinalizeDialog}
        onOpenChange={setShowFinalizeDialog}
        date={date}
        sections={sections}
        setSections={setSections}
        activePianos={activePianos}
        catalog={catalog}
        pianoMap={pianoMap}
        effectiveCustomerId={effectiveCustomerId}
        selectedCustomer={selectedCustomer}
        customerName={customerName}
        totalCost={totalCost}
        totalDurationMinutes={totalDurationMinutes}
        allAppointments={allAppointments}
        customerMap={customerMap}
        onSuccess={() => onOpenChange(false)}
      />
    </>
  );
}
