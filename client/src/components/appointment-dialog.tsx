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
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AlertCircle } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Customer, Piano, Appointment } from "@shared/schema";
import {
  checkTimeConflict,
  type ExistingAppointment,
} from "@/lib/scheduling";

interface AppointmentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  customerId?: number;
  pianoId?: number;
  customerName?: string;
}

export function AppointmentDialog({
  open,
  onOpenChange,
  customerId,
  pianoId,
  customerName,
}: AppointmentDialogProps) {
  const { toast } = useToast();
  const [conflictError, setConflictError] = useState("");
  const defaultForm = {
    customerId: customerId ?? 0,
    pianoId: pianoId ?? null as number | null,
    date: "",
    time: "",
    servicesRequested: "",
    priceEstimate: "$180",
    notes: "",
    isTuning: false,
  };
  const [form, setForm] = useState(defaultForm);

  useEffect(() => {
    if (open) {
      setForm({
        customerId: customerId ?? 0,
        pianoId: pianoId ?? null,
        date: "",
        time: "",
        servicesRequested: "",
        priceEstimate: "$180",
        notes: "",
        isTuning: false,
      });
      setConflictError("");
    }
  }, [open, customerId, pianoId]);

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: allAppointments } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments"],
    enabled: open,
  });

  const selectedCustomerId = customerId ?? form.customerId;

  const { data: customerPianos } = useQuery<Piano[]>({
    queryKey: ["/api/customers", String(selectedCustomerId), "pianos"],
    enabled: !!selectedCustomerId,
  });

  const customerMap = useMemo(
    () => new Map(customers?.map((c) => [c.id, c]) ?? []),
    [customers]
  );

  const selectedCustomerCity = useMemo(() => {
    if (!selectedCustomerId) return "";
    const cust = customerMap.get(selectedCustomerId);
    return cust?.city || "";
  }, [selectedCustomerId, customerMap]);

  const existingApptsForDate = useMemo((): ExistingAppointment[] => {
    if (!form.date || !allAppointments) return [];
    return allAppointments
      .filter((a) => a.date === form.date && a.status !== "cancelled")
      .map((a) => {
        const cust = customerMap.get(a.customerId);
        return {
          time: a.time,
          duration: "2 hours",
          city: cust?.city || "",
        };
      });
  }, [form.date, allAppointments, customerMap]);

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/appointments", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      if (selectedCustomerId) {
        queryClient.invalidateQueries({ queryKey: ["/api/customers", String(selectedCustomerId), "appointments"] });
      }
      onOpenChange(false);
      setForm({
        customerId: customerId ?? 0,
        pianoId: pianoId ?? null,
        date: "",
        time: "",
        servicesRequested: "",
        priceEstimate: "$180",
        notes: "",
        isTuning: false,
      });
      toast({ title: "Appointment scheduled" });
    },
    onError: () => {
      toast({ title: "Failed to schedule appointment", variant: "destructive" });
    },
  });

  const handleSubmit = () => {
    if (form.time && form.date) {
      const result = checkTimeConflict(form.time, "2 hours", selectedCustomerCity, existingApptsForDate);
      if (!result.valid) {
        setConflictError(result.message || "Time conflict detected.");
        return;
      }
    }

    const submitData = {
      ...form,
      customerId: selectedCustomerId,
      pianoId: form.pianoId || (pianoId ?? null),
    };
    createMutation.mutate(submitData);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Schedule Appointment</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          {!customerId && (
            <div className="space-y-2">
              <Label>Client</Label>
              <Select
                value={form.customerId ? String(form.customerId) : ""}
                onValueChange={(v) => { setForm({ ...form, customerId: parseInt(v), pianoId: null }); setConflictError(""); }}
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

          {!pianoId && selectedCustomerId > 0 && customerPianos && customerPianos.length > 0 && (
            <div className="space-y-2">
              <Label>Piano (optional)</Label>
              <Select
                value={form.pianoId ? String(form.pianoId) : "none"}
                onValueChange={(v) => setForm({ ...form, pianoId: v === "none" ? null : parseInt(v) })}
              >
                <SelectTrigger data-testid="select-appointment-piano">
                  <SelectValue placeholder="Select a piano..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">No specific piano</SelectItem>
                  {customerPianos.map((p) => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {[p.make, p.model, p.pianoType].filter(Boolean).join(" ") || `Piano #${p.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="grid gap-4 grid-cols-2">
            <div className="space-y-2">
              <Label>Date (M/D/YY)</Label>
              <Input
                value={form.date}
                onChange={(e) => { setForm({ ...form, date: e.target.value }); setConflictError(""); }}
                placeholder="3/15/26"
                data-testid="input-appointment-date"
              />
            </div>
            <div className="space-y-2">
              <Label>Time</Label>
              <Input
                value={form.time}
                onChange={(e) => { setForm({ ...form, time: e.target.value }); setConflictError(""); }}
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

          <div className="space-y-2">
            <Label>Services Requested</Label>
            <Input
              value={form.servicesRequested}
              onChange={(e) => setForm({ ...form, servicesRequested: e.target.value })}
              placeholder="Tuning, regulation, voicing..."
              data-testid="input-appointment-services"
            />
          </div>

          <div className="space-y-2">
            <Label>Price Estimate</Label>
            <Input
              value={form.priceEstimate}
              onChange={(e) => setForm({ ...form, priceEstimate: e.target.value })}
              placeholder="$175"
              data-testid="input-appointment-price"
            />
          </div>

          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="General notes about the appointment..."
              className="min-h-[60px]"
              data-testid="input-appointment-notes"
            />
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="is-tuning"
              checked={form.isTuning}
              onCheckedChange={(checked) => setForm({ ...form, isTuning: checked === true })}
              data-testid="checkbox-appointment-tuning"
            />
            <Label htmlFor="is-tuning" className="text-sm cursor-pointer">
              This is a tuning appointment
            </Label>
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || !selectedCustomerId || !form.date || !form.time}
              data-testid="button-save-appointment"
            >
              {createMutation.isPending ? "Scheduling..." : "Schedule"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
