import { useState, useEffect, useMemo } from "react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle, Plus, X, Music } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Customer, Piano, Appointment } from "@shared/schema";
import {
  checkTimeConflict,
  type ExistingAppointment,
} from "@/lib/scheduling";
import { ServicePicker } from "@/components/service-picker";

interface PianoSection {
  sectionId: string;
  pianoId: number | null;
  selectedNames: string[];
  isTuning: boolean;
  price: string;
  pickerKey: number;
}

function makeSection(pianoId: number | null = null): PianoSection {
  return {
    sectionId: `${Date.now()}-${Math.random()}`,
    pianoId,
    selectedNames: [],
    isTuning: false,
    price: "",
    pickerKey: 0,
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

export function AppointmentDialog({
  open,
  onOpenChange,
  customerId,
  pianoId,
  customerName,
  initialDate,
}: AppointmentDialogProps) {
  const { toast } = useToast();
  const [conflictError, setConflictError] = useState("");
  const [pickerMountKey, setPickerMountKey] = useState(0);

  const [selectedClientId, setSelectedClientId] = useState(customerId ?? 0);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [sections, setSections] = useState<PianoSection[]>([makeSection(pianoId ?? null)]);

  useEffect(() => {
    if (open) {
      setSelectedClientId(customerId ?? 0);
      setDate(initialDate ?? "");
      setTime("");
      setNotes("");
      setSections([makeSection(pianoId ?? null)]);
      setPickerMountKey((k) => k + 1);
      setConflictError("");
    }
  }, [open, customerId, pianoId, initialDate]);

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: allAppointments } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments"],
    enabled: open,
  });

  const effectiveCustomerId = customerId ?? selectedClientId;

  const { data: customerPianos } = useQuery<Piano[]>({
    queryKey: ["/api/customers", String(effectiveCustomerId), "pianos"],
    enabled: !!effectiveCustomerId,
  });

  const activePianos = useMemo(
    () => (customerPianos ?? []).filter((p) => p.isActive !== false),
    [customerPianos]
  );

  const customerMap = useMemo(
    () => new Map(customers?.map((c) => [c.id, c]) ?? []),
    [customers]
  );

  const selectedCustomerCity = useMemo(() => {
    const cust = customerMap.get(effectiveCustomerId);
    return cust?.city || "";
  }, [effectiveCustomerId, customerMap]);

  const existingApptsForDate = useMemo((): ExistingAppointment[] => {
    if (!date || !allAppointments) return [];
    return allAppointments
      .filter((a) => a.date === date && a.status !== "cancelled")
      .map((a) => {
        const cust = customerMap.get(a.customerId);
        return { time: a.time, duration: "2 hours", city: cust?.city || "" };
      });
  }, [date, allAppointments, customerMap]);

  function updateSection(sectionId: string, patch: Partial<PianoSection>) {
    setSections((prev) =>
      prev.map((s) => (s.sectionId === sectionId ? { ...s, ...patch } : s))
    );
  }

  function addSection() {
    setSections((prev) => [...prev, makeSection(null)]);
  }

  function removeSection(sectionId: string) {
    setSections((prev) => prev.filter((s) => s.sectionId !== sectionId));
  }

  const createMutation = useMutation({
    mutationFn: async () => {
      const results = [];
      for (const sec of sections) {
        const payload = {
          customerId: effectiveCustomerId,
          pianoId: sec.pianoId ?? undefined,
          date,
          time,
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
      onOpenChange(false);
      toast({ title: sections.length > 1 ? `${sections.length} appointments scheduled` : "Appointment scheduled" });
    },
    onError: () => {
      toast({ title: "Failed to schedule appointment", variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (time && date) {
      const result = checkTimeConflict(time, "2 hours", selectedCustomerCity, existingApptsForDate);
      if (!result.valid) {
        setConflictError(result.message || "Time conflict detected.");
        return;
      }
    }
    createMutation.mutate();
  };

  const canSubmit = !!effectiveCustomerId && !!date && !!time && sections.length > 0;

  const pianoLabel = (p: Piano) =>
    [p.make, p.model, p.pianoType].filter(Boolean).join(" ") || `Piano #${p.id}`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Schedule Appointment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {/* Client */}
          {!customerId && (
            <div className="space-y-2">
              <Label>Client</Label>
              <Select
                value={selectedClientId ? String(selectedClientId) : ""}
                onValueChange={(v) => {
                  setSelectedClientId(parseInt(v));
                  setSections([makeSection(null)]);
                  setPickerMountKey((k) => k + 1);
                  setConflictError("");
                }}
              >
                <SelectTrigger data-testid="select-appointment-client">
                  <SelectValue placeholder="Select a client..." />
                </SelectTrigger>
                <SelectContent>
                  {customers?.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.firstName} {c.lastName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {customerId && customerName && (
            <div className="space-y-2">
              <Label>Client</Label>
              <Input value={customerName} disabled data-testid="input-appointment-client-name" />
            </div>
          )}

          {/* Date & Time */}
          <div className="grid gap-4 grid-cols-2">
            <div className="space-y-2">
              <Label>Date (M/D/YY)</Label>
              <Input
                value={date}
                onChange={(e) => { setDate(e.target.value); setConflictError(""); }}
                placeholder="3/15/26"
                data-testid="input-appointment-date"
              />
            </div>
            <div className="space-y-2">
              <Label>Time</Label>
              <Input
                value={time}
                onChange={(e) => { setTime(e.target.value); setConflictError(""); }}
                placeholder="10:00 AM"
                data-testid="input-appointment-time"
              />
            </div>
          </div>

          {conflictError && (
            <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive" data-testid="text-conflict-error">
              <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
              <span>{conflictError}</span>
            </div>
          )}

          {/* Piano / Service Sections */}
          {sections.map((sec, idx) => (
            <div
              key={sec.sectionId}
              className="rounded-lg border border-border p-3 space-y-3 bg-muted/20"
              data-testid={`piano-section-${idx}`}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-sm font-medium">
                  <Music className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  {sections.length > 1 ? `Piano ${idx + 1}` : "Piano & Services"}
                </div>
                {sections.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeSection(sec.sectionId)}
                    className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                    data-testid={`button-remove-section-${idx}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {/* Piano picker */}
              {!pianoId && effectiveCustomerId > 0 && activePianos.length > 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Piano</Label>
                  <Select
                    value={sec.pianoId ? String(sec.pianoId) : "none"}
                    onValueChange={(v) =>
                      updateSection(sec.sectionId, { pianoId: v === "none" ? null : parseInt(v) })
                    }
                  >
                    <SelectTrigger data-testid={`select-piano-${idx}`}>
                      <SelectValue placeholder="Select a piano..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">No specific piano</SelectItem>
                      {activePianos.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {pianoLabel(p)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}

              {pianoId && activePianos.length > 0 && idx === 0 && (
                <div className="space-y-1.5">
                  <Label className="text-xs">Piano</Label>
                  <Input
                    value={pianoLabel(activePianos.find((p) => p.id === pianoId) ?? activePianos[0])}
                    disabled
                    className="h-8 text-sm"
                  />
                </div>
              )}

              {/* Services */}
              <div className="space-y-1.5">
                <Label className="text-xs">Services</Label>
                <ServicePicker
                  key={`${pickerMountKey}-${sec.sectionId}`}
                  value={sec.selectedNames}
                  onChange={(names, isTuning, totalCost) => {
                    updateSection(sec.sectionId, {
                      selectedNames: names,
                      isTuning,
                      price: totalCost > 0 ? `$${totalCost.toFixed(0)}` : "",
                    });
                  }}
                />
              </div>

              {/* Price */}
              <div className="space-y-1.5">
                <Label className="text-xs">Price Estimate</Label>
                <Input
                  value={sec.price}
                  onChange={(e) => updateSection(sec.sectionId, { price: e.target.value })}
                  placeholder="$175"
                  className="h-8"
                  data-testid={`input-price-${idx}`}
                />
              </div>
            </div>
          ))}

          {/* Add Piano button */}
          {!pianoId && effectiveCustomerId > 0 && activePianos.length > 1 && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={addSection}
              className="w-full"
              data-testid="button-add-piano-section"
            >
              <Plus className="h-4 w-4 mr-1" />
              Add Another Piano
            </Button>
          )}

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="General notes about the appointment..."
              className="min-h-[60px]"
              data-testid="input-appointment-notes"
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || !canSubmit}
              data-testid="button-save-appointment"
            >
              {createMutation.isPending
                ? "Scheduling..."
                : sections.length > 1
                ? `Schedule ${sections.length} Appointments`
                : "Schedule"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
