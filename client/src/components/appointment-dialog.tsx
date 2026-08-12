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
import { ServiceLineEditor } from "@/components/service-line-editor";
import {
  type ServiceLine,
  type ServiceItemGroup,
  linesTotal,
  linesDuration,
  serializeServiceItems,
  groupsServiceNames,
  formatMoney,
} from "@/lib/service-lines";
import {
  TimeStepperWidget,
  StepperGroup,
  DatePickerPopover,
  formatTimeMinutes,
  formatDurationMinutes,
  DEFAULT_TIME_MINUTES,
} from "@/components/time-stepper";
import {
  todayMDYY,
  dateLabel,
  type PianoSection,
  makeSection,
  SectionBar,
  PianoCard,
  PianoPickerView,
  DetailsFields,
  DateTimeFields,
} from "@/components/appointment-editor";
import { clientName, clientSearchText } from "@shared/client-name";

interface AppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId?: number;
  pianoId?: number;
  customerName?: string;
  initialDate?: string;
}

// ─── Finalize & Save Dialog ──────────────────────────────────────────────────

interface FinalizeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string;
  onDateChange: (mdyy: string) => void;
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
  onDateChange,
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
  const [isAllDay, setIsAllDay] = useState(false);
  const [endDate, setEndDate] = useState("");
  const [repeatFreq, setRepeatFreq] = useState("none");
  const [repeatEndDate, setRepeatEndDate] = useState("");
  const [timeMinutes, setTimeMinutes] = useState(DEFAULT_TIME_MINUTES);
  const [localDuration, setLocalDuration] = useState(totalDurationMinutes || 90);
  const [appointmentTitle, setAppointmentTitle] = useState("");
  const [conflictError, setConflictError] = useState("");
  const [showItinerary, setShowItinerary] = useState(false);
  const [showPianoPicker, setShowPianoPicker] = useState(false);
  const [finalizeMountKey, setFinalizeMountKey] = useState(0);

  const clientFullName = selectedCustomer
    ? clientName(selectedCustomer)
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
      setIsAllDay(false);
      setEndDate("");
      setRepeatFreq("none");
      setRepeatEndDate("");
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
          client: cust ? clientName(cust) : "Unknown",
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
      // ONE appointment for the whole visit — every piano + its services rides
      // along in serviceItems (JSON). pianoId keeps the first piano for
      // backward compatibility with older single-piano screens.
      const groups: ServiceItemGroup[] = sections.map(sec => ({
        pianoId: sec.isMisc ? null : sec.pianoId,
        lines: sec.lines,
      }));
      const allNames = groupsServiceNames(groups);
      const total = groups.reduce((s, g) => s + linesTotal(g.lines), 0);
      const anyTuning = groups.some(g => g.lines.some(l => l.isTuning));
      const firstPianoId = sections.find(s => !s.isMisc && s.pianoId)?.pianoId ?? undefined;
      const payload = {
        customerId: effectiveCustomerId,
        pianoId: firstPianoId,
        date,
        time: timeStr,
        duration: durationStr,
        servicesRequested: allNames.join(", ") || undefined,
        priceEstimate: total > 0 ? formatMoney(total) : undefined,
        notes: notes || undefined,
        isTuning: anyTuning,
        status: "scheduled",
        serviceItems: groups.length > 0 ? serializeServiceItems(groups) : undefined,
        title: appointmentTitle.trim() || undefined,
        travelMode,
        isAllDay,
        endDate: isAllDay && endDate && endDate !== date ? endDate : undefined,
        repeatFrequency: repeatFreq !== "none" ? repeatFreq : undefined,
        repeatEndDate: repeatFreq !== "none" && repeatEndDate ? repeatEndDate : undefined,
      };
      const res = await apiRequest("POST", "/api/appointments", payload);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      if (effectiveCustomerId) {
        queryClient.invalidateQueries({ queryKey: ["/api/customers", String(effectiveCustomerId), "appointments"] });
      }
      onSuccess();
      onOpenChange(false);
      const pianoCount = sections.filter(s => !s.isMisc && s.pianoId).length;
      toast({ title: pianoCount > 1 ? `Appointment scheduled (${pianoCount} pianos)` : "Appointment scheduled" });
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

              {/* Details — SHARED block (same in every appointment window) */}
              <DetailsFields
                title={appointmentTitle}
                onTitle={setAppointmentTitle}
                titlePlaceholder="Appointment title"
                notes={notes}
                onNotes={setNotes}
                travelMode={travelMode}
                onTravelMode={setTravelMode}
                testIdPrefix="finalize"
              />

              {/* Date & Time — SHARED block */}
              <SectionBar title="Date &amp; Time" />
              <DateTimeFields
                value={{
                  date,
                  isAllDay,
                  endDate,
                  timeMinutes,
                  durationMinutes: localDuration,
                  repeatFrequency: repeatFreq,
                  repeatEndDate,
                }}
                onChange={patch => {
                  if (patch.date !== undefined) onDateChange(patch.date);
                  if (patch.isAllDay !== undefined) setIsAllDay(patch.isAllDay);
                  if (patch.endDate !== undefined) setEndDate(patch.endDate);
                  if (patch.timeMinutes !== undefined) setTimeMinutes(patch.timeMinutes);
                  if (patch.durationMinutes !== undefined) setLocalDuration(patch.durationMinutes);
                  if (patch.repeatFrequency !== undefined) setRepeatFreq(patch.repeatFrequency);
                  if (patch.repeatEndDate !== undefined) setRepeatEndDate(patch.repeatEndDate);
                }}
                conflictError={conflictError}
                onInteract={() => setConflictError("")}
                testIdPrefix="finalize"
              />
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
                          onUpdate={patch => updateFinalizeSection(sec.sectionId, patch)}
                          onRemove={() => removeFinalizeSection(sec.sectionId)}
                          showRemove={sections.length > 1 || !!sec.isMisc}
                          onNavigate={() => onOpenChange(false)}
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

  // Total cost across all sections (qty × each on every service line)
  const totalCost = useMemo(
    () => sections.reduce((sum, sec) => sum + linesTotal(sec.lines), 0),
    [sections]
  );

  // Appointment length = sum of every service line's duration
  const totalDurationMinutes = useMemo(() => {
    const total = sections.reduce((sum, sec) => sum + linesDuration(sec.lines), 0);
    return total || 90;
  }, [sections]);

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
      [clientSearchText(c), c.email ?? "", c.phone ?? "", c.city ?? ""]
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
                        <p className="text-sm font-semibold">{clientName(selectedCustomer)}</p>
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
                                <p className="text-sm font-medium">{clientName(c)}</p>
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
                          onUpdate={(patch) => updateSection(sec.sectionId, patch)}
                          onRemove={() => removeSection(sec.sectionId)}
                          showRemove={sections.length > 1 || !!sec.isMisc}
                          onNavigate={() => onOpenChange(false)}
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
        onDateChange={setDate}
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
