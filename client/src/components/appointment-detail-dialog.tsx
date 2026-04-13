import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, Link } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Calendar, Clock, Music, Pencil, FileText, CheckCircle, Trash2,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Appointment, Customer, Piano } from "@shared/schema";
import { CompleteAppointmentDialog } from "./complete-appointment-dialog";

interface Props {
  appointment: Appointment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type FormState = {
  date: string;
  time: string;
  duration: string;
  servicesRequested: string;
  priceEstimate: string;
  notes: string;
  status: string;
};

function statusBadge(status: string | null | undefined) {
  const s = status ?? "scheduled";
  if (s === "completed") return <Badge variant="secondary">Completed</Badge>;
  if (s === "no-show") return <Badge variant="secondary" className="bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">No-show</Badge>;
  if (s === "cancelled") return <Badge variant="secondary" className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">Cancelled</Badge>;
  return <Badge>Scheduled</Badge>;
}

export function AppointmentDetailDialog({ appointment, open, onOpenChange }: Props) {
  const [editMode, setEditMode] = useState(false);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [form, setForm] = useState<FormState>({
    date: "", time: "", duration: "",
    servicesRequested: "", priceEstimate: "", notes: "", status: "scheduled",
  });
  const { toast } = useToast();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (appointment) {
      setForm({
        date: appointment.date ?? "",
        time: appointment.time ?? "",
        duration: appointment.duration ?? "",
        servicesRequested: appointment.servicesRequested ?? "",
        priceEstimate: appointment.priceEstimate ?? "",
        notes: appointment.notes ?? "",
        status: appointment.status ?? "scheduled",
      });
      setEditMode(false);
    }
  }, [appointment?.id]);

  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: allPianos } = useQuery<Piano[]>({ queryKey: ["/api/pianos"] });

  const customer = customers?.find(c => c.id === appointment?.customerId);
  const piano = allPianos?.find(p => p.id === appointment?.pianoId);
  const pianoLabel = piano ? [piano.make, piano.model, piano.pianoType].filter(Boolean).join(" ") : null;

  const updateMutation = useMutation({
    mutationFn: (data: Partial<FormState>) =>
      apiRequest("PATCH", `/api/appointments/${appointment?.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers", appointment?.customerId, "appointments"] });
      setEditMode(false);
      toast({ title: "Appointment updated" });
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/appointments/${appointment?.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      onOpenChange(false);
      toast({ title: "Appointment deleted" });
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  if (!appointment) return null;

  const isScheduled = appointment.status === "scheduled" || !appointment.status;

  function handleSave() {
    updateMutation.mutate(form);
  }

  function handleDelete() {
    if (confirm("Delete this appointment?")) deleteMutation.mutate();
  }

  function handleCreateInvoice() {
    onOpenChange(false);
    navigate(`/invoices/new?appointmentId=${appointment.id}`);
  }

  return (
    <>
      <Dialog open={open && !showCompleteDialog} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="pr-6">
              {customer ? (
                <Link href={`/customers/${customer.id}`} onClick={() => onOpenChange(false)}>
                  <span className="text-base font-semibold hover:underline cursor-pointer" data-testid="link-appt-customer">
                    {customer.firstName} {customer.lastName}
                  </span>
                </Link>
              ) : (
                <DialogTitle>Appointment</DialogTitle>
              )}
              <div className="flex items-center gap-2 mt-1.5">
                {statusBadge(appointment.status)}
                {appointment.isTuning && (
                  <Badge variant="secondary" className="text-xs">
                    <Music className="h-3 w-3 mr-1" /> Tuning
                  </Badge>
                )}
              </div>
            </div>
          </DialogHeader>

          <Separator />

          {editMode ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Date</Label>
                  <Input
                    value={form.date}
                    onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                    placeholder="M/D/YY"
                    className="h-8 text-sm"
                    data-testid="input-appt-date"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Time</Label>
                  <Input
                    value={form.time}
                    onChange={e => setForm(f => ({ ...f, time: e.target.value }))}
                    placeholder="10:00 AM"
                    className="h-8 text-sm"
                    data-testid="input-appt-time"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Duration</Label>
                  <Input
                    value={form.duration}
                    onChange={e => setForm(f => ({ ...f, duration: e.target.value }))}
                    placeholder="1.5 hr"
                    className="h-8 text-sm"
                    data-testid="input-appt-duration"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Price Estimate</Label>
                  <Input
                    value={form.priceEstimate}
                    onChange={e => setForm(f => ({ ...f, priceEstimate: e.target.value }))}
                    placeholder="$150"
                    className="h-8 text-sm"
                    data-testid="input-appt-price"
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Status</Label>
                <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                  <SelectTrigger className="h-8 text-sm" data-testid="select-appt-status">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="scheduled">Scheduled</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="no-show">No-show</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Services Requested</Label>
                <Textarea
                  value={form.servicesRequested}
                  onChange={e => setForm(f => ({ ...f, servicesRequested: e.target.value }))}
                  className="text-sm resize-none h-16"
                  placeholder="Services..."
                  data-testid="input-appt-services"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Notes</Label>
                <Textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  className="text-sm resize-none h-16"
                  placeholder="Notes..."
                  data-testid="input-appt-notes"
                />
              </div>
              <div className="flex gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={updateMutation.isPending}
                  className="flex-1"
                  data-testid="button-save-appt"
                >
                  {updateMutation.isPending ? "Saving…" : "Save Changes"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setEditMode(false)}
                  disabled={updateMutation.isPending}
                  data-testid="button-cancel-appt-edit"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-3 text-sm">
              <div className="flex items-center gap-4 text-muted-foreground flex-wrap">
                <span className="flex items-center gap-1.5">
                  <Calendar className="h-3.5 w-3.5 shrink-0" />
                  {appointment.date}
                </span>
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 shrink-0" />
                  {appointment.time}
                </span>
                {appointment.duration && (
                  <span>{appointment.duration}</span>
                )}
              </div>
              {pianoLabel && (
                <p className="text-muted-foreground">
                  Piano: <span className="text-foreground font-medium">{pianoLabel}</span>
                </p>
              )}
              {appointment.servicesRequested && (
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Services</p>
                  <p>{appointment.servicesRequested}</p>
                </div>
              )}
              {appointment.priceEstimate && (
                <p className="font-semibold text-base">{appointment.priceEstimate}</p>
              )}
              {appointment.notes && (
                <div>
                  <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-0.5">Notes</p>
                  <p className="text-muted-foreground">{appointment.notes}</p>
                </div>
              )}
            </div>
          )}

          {!editMode && (
            <>
              <Separator />
              <div className="flex flex-wrap gap-2 items-center justify-between">
                <div className="flex gap-2 flex-wrap">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditMode(true)}
                    data-testid="button-edit-appt"
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1" /> Edit
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={handleCreateInvoice}
                    data-testid="button-create-invoice-appt"
                  >
                    <FileText className="h-3.5 w-3.5 mr-1" /> Invoice
                  </Button>
                  {isScheduled && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowCompleteDialog(true)}
                      data-testid="button-complete-appt-dialog"
                    >
                      <CheckCircle className="h-3.5 w-3.5 mr-1" /> Complete
                    </Button>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={handleDelete}
                  disabled={deleteMutation.isPending}
                  data-testid="button-delete-appt-dialog"
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>

      {showCompleteDialog && (
        <CompleteAppointmentDialog
          appointment={appointment}
          open={showCompleteDialog}
          onOpenChange={(o) => {
            setShowCompleteDialog(o);
            if (!o) onOpenChange(false);
          }}
        />
      )}
    </>
  );
}
