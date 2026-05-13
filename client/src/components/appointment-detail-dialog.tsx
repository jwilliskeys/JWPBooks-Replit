import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Calendar, Clock, Music, Pencil, FileText, CheckCircle,
  Trash2, ExternalLink, MapPin, User, X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Appointment, Customer, Piano, Invoice } from "@shared/schema";
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

export function AppointmentDetailDialog({ appointment, open, onOpenChange }: Props) {
  const [editMode, setEditMode] = useState(false);
  const [showCompleteDialog, setShowCompleteDialog] = useState(false);
  const [localAppt, setLocalAppt] = useState<Appointment | null>(null);
  const [localCreatedInvoice, setLocalCreatedInvoice] = useState<Invoice | null>(null);
  const [form, setForm] = useState<FormState>({
    date: "", time: "", duration: "",
    servicesRequested: "", priceEstimate: "", notes: "", status: "scheduled",
  });
  const { toast } = useToast();

  useEffect(() => {
    if (appointment) {
      setLocalAppt(appointment);
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
      setLocalCreatedInvoice(null);
    }
  }, [appointment?.id]);

  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: allPianos } = useQuery<Piano[]>({ queryKey: ["/api/pianos"] });
  const { data: allInvoices } = useQuery<Invoice[]>({ queryKey: ["/api/invoices"], enabled: open });

  const displayed = localAppt ?? appointment;
  const customer = customers?.find(c => c.id === displayed?.customerId);
  const piano = allPianos?.find(p => p.id === displayed?.pianoId);
  const pianoLabel = piano ? [piano.make, piano.model, piano.pianoType].filter(Boolean).join(" ") : null;

  const linkedInvoice = localCreatedInvoice
    ?? allInvoices?.find(inv => inv.appointmentId === displayed?.id)
    ?? null;

  const customerAddress = customer
    ? [customer.address, customer.city, customer.state, customer.zipCode].filter(Boolean).join(", ")
    : null;
  const mapsUrl = customerAddress
    ? `https://maps.google.com/?q=${encodeURIComponent(customerAddress)}`
    : null;

  const updateMutation = useMutation({
    mutationFn: (data: Partial<FormState>) =>
      apiRequest("PATCH", `/api/appointments/${displayed?.id}`, data),
    onSuccess: async (res) => {
      const updated = await res.json();
      setLocalAppt(updated);
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers", String(displayed?.customerId), "appointments"] });
      setEditMode(false);
      toast({ title: "Appointment updated" });
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/appointments/${displayed?.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      onOpenChange(false);
      toast({ title: "Appointment deleted" });
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const createInvoiceMutation = useMutation({
    mutationFn: async () => {
      const today = new Date();
      const mdyy = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear() % 100}`;
      const invoiceDate = mdyy(today);
      const due = new Date(today);
      due.setDate(due.getDate() + 30);
      const dueDate = mdyy(due);

      const numRes = await fetch("/api/invoices/next-number");
      const numData = await numRes.json();
      const invoiceNumber = String(numData.nextNumber ?? "1");

      const customerName = customer
        ? `${customer.firstName} ${customer.lastName}`
        : "";
      const rawPrice = parseFloat(displayed?.priceEstimate?.replace(/[^0-9.]/g, "") || "0") || 0;
      const priceStr = `$${rawPrice.toFixed(2)}`;
      const lineItems = displayed?.servicesRequested
        ? JSON.stringify([{
            description: displayed.servicesRequested,
            quantity: 1,
            unitPrice: rawPrice,
          }])
        : JSON.stringify([]);

      const res = await apiRequest("POST", "/api/invoices", {
        customerId: displayed?.customerId,
        appointmentId: displayed?.id,
        pianoId: displayed?.pianoId ?? null,
        invoiceDate,
        dueDate,
        invoiceNumber,
        status: "draft",
        lineItems,
        subtotal: priceStr,
        total: priceStr,
        customerName,
        pianoDescription: pianoLabel ?? "",
      });
      return res.json();
    },
    onSuccess: (invoice) => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      setLocalCreatedInvoice(invoice);
      toast({ title: `Invoice #${invoice.invoiceNumber} created` });
    },
    onError: () => toast({ title: "Failed to create invoice", variant: "destructive" }),
  });

  if (!displayed) return null;

  const isScheduled = displayed.status === "scheduled" || !displayed.status;

  function handleSave() {
    updateMutation.mutate(form);
  }

  function handleDelete() {
    if (confirm("Delete this appointment?")) deleteMutation.mutate();
  }

  async function handleCompleteSuccess() {
    await queryClient.refetchQueries({ queryKey: ["/api/appointments"] });
    queryClient.invalidateQueries({ queryKey: ["/api/customers", String(displayed?.customerId), "appointments"] });
    const refreshed = queryClient.getQueryData<Appointment[]>(["/api/appointments"]);
    const fresh = refreshed?.find(a => a.id === displayed?.id);
    if (fresh) setLocalAppt(fresh);
  }

  const serviceLines = displayed.servicesRequested
    ? displayed.servicesRequested.split(/\n|,/).map(s => s.trim()).filter(Boolean)
    : [];

  return (
    <>
      <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
          <DialogPrimitive.Content
            className={cn(
              "fixed z-50 bg-background shadow-xl overflow-hidden",
              "inset-x-0 bottom-0 max-h-[92vh] rounded-t-2xl",
              "data-[state=open]:animate-in data-[state=closed]:animate-out",
              "data-[state=closed]:slide-out-to-bottom data-[state=open]:slide-in-from-bottom",
              "sm:inset-auto sm:left-1/2 sm:top-1/2 sm:-translate-x-1/2 sm:-translate-y-1/2",
              "sm:max-w-lg sm:w-full sm:rounded-2xl sm:max-h-[88vh]",
              "duration-200 flex flex-col"
            )}
          >
            <DialogPrimitive.Title className="sr-only">Appointment Details</DialogPrimitive.Title>

            {editMode ? (
              <div className="overflow-y-auto flex-1">
                <div className="p-5 space-y-3">
                  <div className="flex items-center justify-between mb-1">
                    <h2 className="text-base font-semibold">Edit Appointment</h2>
                    <div className="flex items-center gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 px-2 text-xs"
                        onClick={() => {
                          setForm({
                            date: displayed.date ?? "",
                            time: displayed.time ?? "",
                            duration: displayed.duration ?? "",
                            servicesRequested: displayed.servicesRequested ?? "",
                            priceEstimate: displayed.priceEstimate ?? "",
                            notes: displayed.notes ?? "",
                            status: displayed.status ?? "scheduled",
                          });
                          setEditMode(false);
                        }}
                        data-testid="button-cancel-appt-edit"
                      >
                        Cancel
                      </Button>
                      <DialogPrimitive.Close
                        className="rounded-lg p-1.5 opacity-60 hover:opacity-100 hover:bg-muted transition-opacity focus:outline-none focus:ring-2 focus:ring-ring"
                        data-testid="button-close-appt-dialog-edit"
                      >
                        <X className="h-4 w-4" />
                        <span className="sr-only">Close</span>
                      </DialogPrimitive.Close>
                    </div>
                  </div>
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
                  <Button
                    onClick={handleSave}
                    disabled={updateMutation.isPending}
                    className="w-full"
                    data-testid="button-save-appt"
                  >
                    {updateMutation.isPending ? "Saving…" : "Save Changes"}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                {/* ── Header band ── */}
                <div className="relative bg-primary/10 dark:bg-primary/15 px-5 pt-5 pb-4 shrink-0">
                  <DialogPrimitive.Close
                    className="absolute right-3 top-3 rounded-lg p-1.5 opacity-60 hover:opacity-100 hover:bg-primary/10 transition-opacity focus:outline-none focus:ring-2 focus:ring-primary/30"
                    data-testid="button-close-appt-dialog"
                  >
                    <X className="h-4 w-4 text-primary" />
                    <span className="sr-only">Close</span>
                  </DialogPrimitive.Close>

                  <p className="text-[10px] font-semibold tracking-widest uppercase text-primary/70 mb-1">Appointment</p>

                  {customer ? (
                    <Link href={`/customers/${customer.id}`} onClick={() => onOpenChange(false)}>
                      <h2 className="text-xl font-bold text-foreground hover:underline cursor-pointer leading-tight" data-testid="link-appt-customer">
                        {customer.firstName} {customer.lastName}
                      </h2>
                    </Link>
                  ) : (
                    <h2 className="text-xl font-bold text-foreground leading-tight">Appointment</h2>
                  )}

                  <div className="mt-3 space-y-1.5 text-sm text-foreground/80">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span>{displayed.date}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span>{displayed.time}{displayed.duration ? ` (${displayed.duration})` : ""}</span>
                    </div>
                    {customerAddress && mapsUrl && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 text-primary shrink-0" />
                        <a
                          href={mapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline underline-offset-2 text-primary hover:text-primary/80"
                          data-testid="link-appt-address"
                        >
                          {customerAddress}
                        </a>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-2 mt-3 flex-wrap">
                    {displayed.status === "completed" && (
                      <Badge variant="secondary" className="text-xs">Completed</Badge>
                    )}
                    {displayed.status === "no-show" && (
                      <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">No-show</Badge>
                    )}
                    {displayed.status === "cancelled" && (
                      <Badge variant="secondary" className="text-xs bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">Cancelled</Badge>
                    )}
                    {displayed.isTuning && (
                      <Badge variant="secondary" className="text-xs">
                        <Music className="h-3 w-3 mr-1" /> Tuning
                      </Badge>
                    )}
                  </div>
                </div>

                {/* ── Action row ── */}
                <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-background/95 shrink-0 overflow-x-auto">
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => setEditMode(true)}
                    data-testid="button-edit-appt"
                  >
                    <Pencil className="h-3.5 w-3.5 mr-1.5" /> Edit
                  </Button>
                  {isScheduled && (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => setShowCompleteDialog(true)}
                      data-testid="button-complete-appt-dialog"
                    >
                      <CheckCircle className="h-3.5 w-3.5 mr-1.5" /> Complete
                    </Button>
                  )}
                  {linkedInvoice ? (
                    <Link href={`/invoices/${linkedInvoice.id}`} onClick={() => onOpenChange(false)}>
                      <Button size="sm" variant="outline" className="shrink-0" data-testid="button-open-invoice-action">
                        <FileText className="h-3.5 w-3.5 mr-1.5" /> Invoice
                      </Button>
                    </Link>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      className="shrink-0"
                      onClick={() => createInvoiceMutation.mutate()}
                      disabled={createInvoiceMutation.isPending}
                      data-testid="button-create-invoice-action"
                    >
                      <FileText className="h-3.5 w-3.5 mr-1.5" />
                      {createInvoiceMutation.isPending ? "Creating…" : "New Invoice"}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    className="shrink-0 text-destructive hover:text-destructive hover:bg-destructive/10 ml-auto"
                    onClick={handleDelete}
                    disabled={deleteMutation.isPending}
                    data-testid="button-delete-appt-dialog"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
                  </Button>
                </div>

                {/* ── Body ── */}
                <div className="overflow-y-auto flex-1 divide-y divide-border">

                  {/* CLIENT */}
                  {customer && (
                    <div className="px-5 py-4">
                      <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground mb-2">Client</p>
                      <Link href={`/customers/${customer.id}`} onClick={() => onOpenChange(false)}>
                        <div className="flex items-center gap-3 hover:opacity-80 transition-opacity cursor-pointer" data-testid="link-appt-customer-section">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                            <User className="h-4 w-4 text-primary" />
                          </div>
                          <div>
                            <p className="text-sm font-semibold">{customer.firstName} {customer.lastName}</p>
                            {customer.phone && <p className="text-xs text-muted-foreground">{customer.phone}</p>}
                          </div>
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0" />
                        </div>
                      </Link>
                    </div>
                  )}

                  {/* PIANOS & SERVICES */}
                  {(pianoLabel || serviceLines.length > 0 || displayed.priceEstimate) && (
                    <div className="px-5 py-4">
                      <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground mb-2">Pianos &amp; Services</p>
                      {pianoLabel && (
                        <div className="flex items-center gap-2 mb-2">
                          <Music className="h-4 w-4 text-muted-foreground shrink-0" />
                          <span className="text-sm font-semibold">{pianoLabel}</span>
                          {displayed.isTuning && (
                            <Badge className="text-[10px] px-1.5 py-0 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-700">
                              Tuning
                            </Badge>
                          )}
                          {piano && (
                            <Link href={`/pianos/${piano.id}`} onClick={() => onOpenChange(false)}>
                              <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground ml-1 cursor-pointer" data-testid="link-appt-piano" />
                            </Link>
                          )}
                        </div>
                      )}
                      {serviceLines.length > 0 && (
                        <ul className="space-y-0.5 ml-6 text-sm text-muted-foreground">
                          {serviceLines.map((s, i) => (
                            <li key={i} className="flex items-start gap-1.5">
                              <span className="mt-1.5 h-1 w-1 rounded-full bg-muted-foreground/60 shrink-0" />
                              <span>{s}{displayed.priceEstimate && i === serviceLines.length - 1 ? ` (${displayed.priceEstimate})` : ""}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                      {serviceLines.length === 0 && displayed.priceEstimate && (
                        <p className="text-sm font-semibold">{displayed.priceEstimate}</p>
                      )}
                    </div>
                  )}

                  {/* NOTES */}
                  {displayed.notes && (
                    <div className="px-5 py-4">
                      <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground mb-2">Appointment Notes</p>
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap">{displayed.notes}</p>
                    </div>
                  )}

                  {/* INVOICE */}
                  <div className="px-5 py-4" data-testid="invoice-panel">
                    <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground mb-2">Invoice</p>
                    {linkedInvoice ? (
                      <div className="flex items-center gap-2 flex-wrap">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="text-sm font-medium">#{linkedInvoice.invoiceNumber}</span>
                        {invoiceStatusBadge(linkedInvoice.status)}
                        <div className="flex gap-1 ml-auto">
                          <Link href={`/invoices/${linkedInvoice.id}`} onClick={() => onOpenChange(false)}>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" data-testid="link-open-invoice">
                              Open <ExternalLink className="h-3 w-3" />
                            </Button>
                          </Link>
                          <Link href={`/invoices/${linkedInvoice.id}?edit=1`} onClick={() => onOpenChange(false)}>
                            <Button variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" data-testid="link-edit-invoice">
                              <Pencil className="h-3 w-3" /> Edit
                            </Button>
                          </Link>
                        </div>
                      </div>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => createInvoiceMutation.mutate()}
                        disabled={createInvoiceMutation.isPending}
                        className="w-full h-9 text-xs"
                        data-testid="button-create-invoice-panel"
                      >
                        <FileText className="h-3.5 w-3.5 mr-1.5" />
                        {createInvoiceMutation.isPending ? "Creating…" : "Create Invoice"}
                      </Button>
                    )}
                  </div>

                </div>
              </>
            )}
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>

      {showCompleteDialog && displayed && (
        <CompleteAppointmentDialog
          appointment={displayed}
          open={showCompleteDialog}
          onOpenChange={(o) => { if (!o) setShowCompleteDialog(false); }}
          onComplete={handleCompleteSuccess}
        />
      )}
    </>
  );
}
