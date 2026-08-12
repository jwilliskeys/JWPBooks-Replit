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
  Trash2, ExternalLink, MapPin, User, X, Car, Repeat, Copy,
} from "lucide-react";
import {
  SectionBar,
  PianoCard,
  PianoPickerView,
  ClientSearchBox,
  DetailsFields,
  DateTimeFields,
  repeatLabel,
  type PianoSection,
} from "./appointment-editor";
import {
  DatePickerPopover,
  StepperGroup,
  formatTimeMinutes,
  formatDurationMinutes,
  parseTimeString,
  DEFAULT_TIME_MINUTES,
} from "./time-stepper";
import { parseDurationToMinutes } from "@/lib/scheduling";
import { Checkbox } from "@/components/ui/checkbox";
import { cn, formatPhone } from "@/lib/utils";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Appointment, Customer, Piano, Invoice, ServiceCatalogItem } from "@shared/schema";
import { CompleteAppointmentDialog } from "./complete-appointment-dialog";
import { ServiceLineEditor } from "./service-line-editor";
import {
  type ServiceItemGroup,
  parseServiceItems,
  serializeServiceItems,
  groupsServiceNames,
  groupsTotal,
  groupsHaveTuning,
  linesTotal,
  lineFromCatalog,
  lineTotal,
  formatMoney,
  formatLineSubline,
  formatLineDuration,
} from "@/lib/service-lines";
import { clientName } from "@shared/client-name";

interface Props {
  appointment: Appointment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type FormState = {
  customerId: number;
  title: string;
  notes: string;
  travelMode: string;
  status: string;
  date: string;              // M/D/YY
  isAllDay: boolean;
  endDate: string;           // M/D/YY or "" (multi-day all-day)
  repeatFrequency: string;   // "none" | weekly | biweekly | monthly | …
  repeatEndDate: string;     // M/D/YY or ""
  timeMinutes: number;
  durationMinutes: number;
};

function formFromAppointment(a: Appointment): FormState {
  const t = parseTimeString(a.time ?? "");
  return {
    customerId: a.customerId,
    title: a.title ?? "",
    notes: a.notes ?? "",
    travelMode: a.travelMode ?? "Driving",
    status: a.status ?? "scheduled",
    date: a.date ?? "",
    isAllDay: a.isAllDay ?? false,
    endDate: a.endDate ?? "",
    repeatFrequency: a.repeatFrequency ?? "none",
    repeatEndDate: a.repeatEndDate ?? "",
    timeMinutes: t >= 0 ? t : DEFAULT_TIME_MINUTES,
    durationMinutes: parseDurationToMinutes(a.duration || "1 hr 30 min") || 90,
  };
}

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
    customerId: 0, title: "", notes: "", travelMode: "Driving", status: "scheduled",
    date: "", isAllDay: false, endDate: "", repeatFrequency: "none", repeatEndDate: "",
    timeMinutes: DEFAULT_TIME_MINUTES, durationMinutes: 90,
  });
  // Itemized pianos + services (new-style appointments). null = legacy free-text.
  const [editGroups, setEditGroups] = useState<ServiceItemGroup[] | null>(null);
  const [resetClientMode, setResetClientMode] = useState(false);
  const [showEditPianoPicker, setShowEditPianoPicker] = useState(false);
  // Clone: duplicate this appointment onto another date
  const [showClone, setShowClone] = useState(false);
  const [cloneDate, setCloneDate] = useState("");
  const { toast } = useToast();

  useEffect(() => {
    if (appointment) {
      setLocalAppt(appointment);
      setForm(formFromAppointment(appointment));
      setEditGroups(parseServiceItems(appointment.serviceItems));
      setEditMode(false);
      setResetClientMode(false);
      setShowEditPianoPicker(false);
      setLocalCreatedInvoice(null);
    }
  }, [appointment?.id]);

  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: allPianos } = useQuery<Piano[]>({ queryKey: ["/api/pianos"] });
  const { data: allInvoices } = useQuery<Invoice[]>({ queryKey: ["/api/invoices"], enabled: open });
  const { data: catalog } = useQuery<ServiceCatalogItem[]>({ queryKey: ["/api/service-catalog"], enabled: open });

  const displayed = localAppt ?? appointment;
  const customer = customers?.find(c => c.id === displayed?.customerId);
  const piano = allPianos?.find(p => p.id === displayed?.pianoId);
  const pianoLabel = piano ? [piano.make, piano.model, piano.pianoType].filter(Boolean).join(" ") : null;
  const customerPianos = allPianos?.filter(p => p.customerId === displayed?.customerId && p.isActive !== false) ?? [];

  // Edit-mode client (may differ from the saved one after "Reset Client")
  const editCustomerId = form.customerId || displayed?.customerId || 0;
  const editCustomer = customers?.find(c => c.id === editCustomerId);
  const editClientPianos = allPianos?.filter(p => p.customerId === editCustomerId && p.isActive !== false) ?? [];
  const pianoById = new Map((allPianos ?? []).map(p => [p.id, p]));

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
    mutationFn: (data: Record<string, unknown>) =>
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

  const cloneMutation = useMutation({
    mutationFn: (newDate: string) =>
      apiRequest("POST", "/api/appointments", {
        customerId: displayed?.customerId,
        pianoId: displayed?.pianoId ?? undefined,
        date: newDate,
        time: displayed?.time,
        duration: displayed?.duration ?? undefined,
        servicesRequested: displayed?.servicesRequested ?? undefined,
        priceEstimate: displayed?.priceEstimate ?? undefined,
        notes: displayed?.notes ?? undefined,
        isTuning: displayed?.isTuning ?? false,
        serviceItems: displayed?.serviceItems ?? undefined,
        title: displayed?.title ?? undefined,
        travelMode: displayed?.travelMode ?? undefined,
        isAllDay: displayed?.isAllDay ?? false,
        status: "scheduled",
      }),
    onSuccess: (_res, newDate) => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      setShowClone(false);
      setCloneDate("");
      toast({ title: `Cloned to ${newDate}` });
    },
    onError: () => toast({ title: "Failed to clone", variant: "destructive" }),
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
        ? clientName(customer)
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
    // Price estimate is ALWAYS the sum of the service lines — never hand-edited.
    const groups = editGroups ?? [];
    const names = groupsServiceNames(groups);
    const total = groupsTotal(groups);
    updateMutation.mutate({
      customerId: form.customerId || displayed?.customerId,
      title: form.title.trim() || null,
      notes: form.notes || null,
      travelMode: form.travelMode,
      status: form.status,
      date: form.date,
      time: form.isAllDay ? "9:00 AM" : formatTimeMinutes(form.timeMinutes),
      duration: formatDurationMinutes(form.durationMinutes),
      isAllDay: form.isAllDay,
      endDate: form.isAllDay && form.endDate && form.endDate !== form.date ? form.endDate : null,
      repeatFrequency: form.repeatFrequency !== "none" ? form.repeatFrequency : null,
      repeatEndDate: form.repeatFrequency !== "none" && form.repeatEndDate ? form.repeatEndDate : null,
      servicesRequested: names.join(", ") || null,
      priceEstimate: total > 0 ? formatMoney(total) : null,
      isTuning: groupsHaveTuning(groups),
      pianoId: groups.find(g => g.pianoId != null)?.pianoId ?? null,
      serviceItems: serializeServiceItems(groups),
    });
  }

  /** Enter edit mode; legacy free-text appointments get auto-itemized so
   *  services are always editable line items. */
  function enterEditMode() {
    if (!parseServiceItems(displayed?.serviceItems)) itemizeLegacy();
    setResetClientMode(false);
    setShowEditPianoPicker(false);
    setEditMode(true);
  }

  function cancelEdit() {
    if (displayed) {
      setForm(formFromAppointment(displayed));
      setEditGroups(parseServiceItems(displayed.serviceItems));
    }
    setEditMode(false);
  }

  /** Reset Client: link this appointment to a different client (clears pianos). */
  function pickNewClient(c: Customer) {
    setForm(f => ({ ...f, customerId: c.id }));
    setEditGroups([]);
    setResetClientMode(false);
  }

  function addPianoGroup(p: Piano) {
    const defaultSvc = catalog?.find(s => s.isDefault && s.isActive !== false);
    setEditGroups(gs => [...(gs ?? []), { pianoId: p.id, lines: defaultSvc ? [lineFromCatalog(defaultSvc)] : [] }]);
    setShowEditPianoPicker(false);
  }

  function addMiscGroup() {
    setEditGroups(gs => [...(gs ?? []), { pianoId: null, lines: [] }]);
  }

  /** Convert a legacy free-text appointment into itemized piano/service lines. */
  function itemizeLegacy() {
    if (!displayed) return;
    const names = (displayed.servicesRequested ?? "")
      .split(/\n|,/).map(s => s.trim()).filter(Boolean);
    const price = parseFloat(displayed.priceEstimate?.replace(/[^0-9.]/g, "") || "0") || 0;
    const lines = names.map((name, i) => {
      const svc = catalog?.find(c => c.name.toLowerCase() === name.toLowerCase());
      const line = svc
        ? lineFromCatalog(svc)
        : {
            lineId: `${Date.now()}-${i}`,
            name,
            expenseType: "Fixed Rate Labor" as const,
            quantity: 1,
            eachAmount: 0,
            durationMinutes: 0,
            isTuning: !!displayed.isTuning && i === 0,
            isTaxable: false,
          };
      return line;
    });
    // Single service + known price → carry the price over
    if (lines.length === 1 && price > 0) lines[0].eachAmount = price;
    if (lines.length === 0) {
      const defaultSvc = catalog?.find(s => s.isDefault && s.isActive !== false);
      if (defaultSvc) lines.push(lineFromCatalog(defaultSvc));
    }
    setEditGroups([{ pianoId: displayed.pianoId ?? null, lines }]);
  }

  function addEditGroup(v: string) {
    const pianoId = v === "misc" ? null : parseInt(v);
    const defaultSvc = catalog?.find(s => s.isDefault && s.isActive !== false);
    // Adding a piano defaults to a tuning (catalog default service)
    const lines = pianoId != null && defaultSvc ? [lineFromCatalog(defaultSvc)] : [];
    setEditGroups(gs => [...(gs ?? []), { pianoId, lines }]);
  }

  function handleDelete() {
    if (confirm("Delete this appointment?")) deleteMutation.mutate();
  }

  async function handleCompleteSuccess() {
    await queryClient.refetchQueries({ queryKey: ["/api/appointments"] });
    queryClient.invalidateQueries({ queryKey: ["/api/customers", String(displayed?.customerId), "appointments"] });
    // Completion may have auto-created a draft invoice server-side; make sure this
    // dialog's own linkedInvoice lookup picks it up right away.
    queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
    const refreshed = queryClient.getQueryData<Appointment[]>(["/api/appointments"]);
    const fresh = refreshed?.find(a => a.id === displayed?.id);
    if (fresh) setLocalAppt(fresh);
  }

  const serviceLines = displayed.servicesRequested
    ? displayed.servicesRequested.split(/\n|,/).map(s => s.trim()).filter(Boolean)
    : [];

  // New-style itemized appointments render pianos + service lines from serviceItems
  const viewGroups = parseServiceItems(displayed.serviceItems);

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
              editMode ? "sm:max-w-3xl" : "sm:max-w-lg",
              "sm:w-full sm:rounded-2xl sm:max-h-[88vh]",
              "duration-200 flex flex-col"
            )}
          >
            <DialogPrimitive.Title className="sr-only">Appointment Details</DialogPrimitive.Title>

            {editMode ? (
              <div className="overflow-y-auto flex-1 flex flex-col">
                <div className="px-5 pt-4 pb-3 flex items-center justify-between border-b shrink-0">
                  <h2 className="text-lg font-bold">Edit Appointment</h2>
                  <DialogPrimitive.Close
                    className="rounded-lg p-1.5 opacity-60 hover:opacity-100 hover:bg-muted transition-opacity focus:outline-none focus:ring-2 focus:ring-ring"
                    data-testid="button-close-appt-dialog-edit"
                  >
                    <X className="h-4 w-4" />
                    <span className="sr-only">Close</span>
                  </DialogPrimitive.Close>
                </div>

                <div className="flex-1 overflow-y-auto">
                  <div className="grid sm:grid-cols-2 sm:divide-x min-h-full">

                    {/* ══ LEFT: status, details, date & time ══ */}
                    <div className="p-5 space-y-4">
                      {form.status === "completed" && (
                        <div className="flex items-center justify-between gap-2 rounded-lg bg-green-100 dark:bg-green-900/25 px-3 py-2.5 text-sm text-green-900 dark:text-green-200">
                          <span>This appointment has been marked as complete.</span>
                          <Button
                            size="sm"
                            className="h-7 text-xs bg-green-600 hover:bg-green-700 shrink-0"
                            onClick={() => setForm(f => ({ ...f, status: "scheduled" }))}
                            data-testid="button-undo-complete"
                          >
                            Undo
                          </Button>
                        </div>
                      )}
                      {(form.status === "cancelled" || form.status === "no-show") && (
                        <div className="flex items-center justify-between gap-2 rounded-lg bg-red-100 dark:bg-red-900/25 px-3 py-2.5 text-sm text-red-900 dark:text-red-200">
                          <span>This appointment is marked {form.status === "no-show" ? "as a no-show" : "cancelled"}.</span>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs shrink-0"
                            onClick={() => setForm(f => ({ ...f, status: "scheduled" }))}
                            data-testid="button-restore-appt"
                          >
                            Restore
                          </Button>
                        </div>
                      )}
                      {displayed.createdAt && (
                        <div className="rounded-lg bg-sky-100/70 dark:bg-sky-900/20 px-3 py-2.5 text-sm text-sky-900 dark:text-sky-200">
                          This appointment was created on{" "}
                          {new Date(displayed.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.
                        </div>
                      )}

                      <SectionBar title="Details" />

                      {/* SHARED Details block — same component as every other appointment window */}
                      <DetailsFields
                        title={form.title}
                        onTitle={v => setForm(f => ({ ...f, title: v }))}
                        titlePlaceholder={editCustomer ? clientName(editCustomer) : "Appointment title"}
                        notes={form.notes}
                        onNotes={v => setForm(f => ({ ...f, notes: v }))}
                        travelMode={form.travelMode}
                        onTravelMode={v => setForm(f => ({ ...f, travelMode: v }))}
                        testIdPrefix="edit"
                      />

                      <SectionBar title="Date &amp; Time" />

                      {/* SHARED Date & Time block */}
                      <DateTimeFields
                        value={{
                          date: form.date,
                          isAllDay: form.isAllDay,
                          endDate: form.endDate,
                          timeMinutes: form.timeMinutes,
                          durationMinutes: form.durationMinutes,
                          repeatFrequency: form.repeatFrequency,
                          repeatEndDate: form.repeatEndDate,
                        }}
                        onChange={patch => setForm(f => ({ ...f, ...patch }))}
                        testIdPrefix="edit"
                      />
                    </div>

                    {/* ══ RIGHT: client + pianos & services ══ */}
                    <div className="p-5 space-y-4">
                      <SectionBar title="Client Information">
                        <Button
                          type="button"
                          size="sm"
                          variant={resetClientMode ? "outline" : "secondary"}
                          className="h-7 text-xs"
                          onClick={() => setResetClientMode(v => !v)}
                          data-testid="button-reset-client"
                        >
                          {resetClientMode ? "Keep Current Client" : "Reset Client"}
                        </Button>
                      </SectionBar>

                      {resetClientMode ? (
                        <div className="space-y-2">
                          <p className="text-xs text-muted-foreground">
                            Pick a different client for this appointment. Pianos below will reset.
                          </p>
                          <ClientSearchBox customers={customers} onSelect={pickNewClient} autoFocus />
                        </div>
                      ) : editCustomer ? (
                        <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/20">
                          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                            <User className="h-4 w-4 text-primary" />
                          </div>
                          <div className="min-w-0">
                            <Link href={`/customers/${editCustomer.id}`} onClick={() => onOpenChange(false)}>
                              <p className="font-semibold text-sm leading-tight hover:underline cursor-pointer flex items-center gap-1">
                                {clientName(editCustomer)}
                                <ExternalLink className="h-3 w-3 text-muted-foreground" />
                              </p>
                            </Link>
                            {(editCustomer.address || editCustomer.city) && (
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {[editCustomer.address, editCustomer.city, editCustomer.state, editCustomer.zipCode].filter(Boolean).join(", ")}
                              </p>
                            )}
                            {editCustomer.phone && (
                              <p className="text-xs text-muted-foreground mt-0.5">{formatPhone(editCustomer.phone)}</p>
                            )}
                          </div>
                        </div>
                      ) : null}

                      {showEditPianoPicker ? (
                        <div className="h-[360px] flex flex-col">
                          <PianoPickerView
                            pianos={editClientPianos.filter(p => !(editGroups ?? []).some(g => g.pianoId === p.id))}
                            onSelect={addPianoGroup}
                            onClose={() => setShowEditPianoPicker(false)}
                          />
                        </div>
                      ) : (
                        <>
                          <SectionBar title="Pianos &amp; Services">
                            <Button
                              type="button"
                              size="sm"
                              className="h-7 text-xs"
                              onClick={() => setShowEditPianoPicker(true)}
                              data-testid="button-edit-add-piano"
                            >
                              Add Piano
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              onClick={addMiscGroup}
                              data-testid="button-edit-add-misc"
                            >
                              Add Misc Service
                            </Button>
                          </SectionBar>

                          <div className="space-y-2">
                            {(editGroups ?? []).length === 0 ? (
                              <p className="text-sm text-muted-foreground text-center py-4">
                                No pianos or services yet — add one above.
                              </p>
                            ) : (
                              (editGroups ?? []).map((g, gi) => {
                                const sec: PianoSection = {
                                  sectionId: `${g.pianoId ?? "misc"}-${gi}`,
                                  pianoId: g.pianoId,
                                  lines: g.lines,
                                  isMisc: g.pianoId == null,
                                };
                                return (
                                  <PianoCard
                                    key={sec.sectionId}
                                    section={sec}
                                    piano={g.pianoId != null ? pianoById.get(g.pianoId) : undefined}
                                    onUpdate={patch => {
                                      if (patch.lines) {
                                        setEditGroups(gs => gs!.map((gg, i) => i === gi ? { ...gg, lines: patch.lines! } : gg));
                                      }
                                    }}
                                    onRemove={() => setEditGroups(gs => gs!.filter((_, i) => i !== gi))}
                                    showRemove
                                    onNavigate={() => onOpenChange(false)}
                                  />
                                );
                              })
                            )}
                          </div>

                          {/* Price estimate = sum of services, never hand-edited */}
                          <div className="flex items-center justify-between px-3 py-2.5 rounded-lg bg-muted/40 border text-sm">
                            <span className="text-muted-foreground">Price estimate (sum of services)</span>
                            <span className="font-semibold tabular-nums" data-testid="text-edit-price-estimate">
                              {formatMoney(groupsTotal(editGroups ?? []))}
                            </span>
                          </div>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer */}
                <div className="shrink-0 border-t bg-background px-5 py-3 flex items-center justify-between gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                    onClick={handleDelete}
                    disabled={deleteMutation.isPending}
                    data-testid="button-edit-delete-appt"
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1.5" /> Delete
                  </Button>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={cancelEdit} data-testid="button-cancel-appt-edit">
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSave} disabled={updateMutation.isPending} data-testid="button-save-appt">
                      {updateMutation.isPending ? "Saving…" : "Save"}
                    </Button>
                  </div>
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
                        {clientName(customer)}
                      </h2>
                    </Link>
                  ) : (
                    <h2 className="text-xl font-bold text-foreground leading-tight">Appointment</h2>
                  )}
                  {displayed.title && displayed.title !== clientName(customer, "") && (
                    <p className="text-sm text-foreground/70 mt-0.5">{displayed.title}</p>
                  )}

                  <div className="mt-3 space-y-1.5 text-sm text-foreground/80">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span>
                        {displayed.date}
                        {displayed.isAllDay && displayed.endDate ? ` – ${displayed.endDate}` : ""}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5 text-primary shrink-0" />
                      <span>
                        {displayed.isAllDay
                          ? "All day"
                          : `${displayed.time}${displayed.duration ? ` (${displayed.duration})` : ""}`}
                      </span>
                    </div>
                    {repeatLabel(displayed.repeatFrequency) && (
                      <div className="flex items-center gap-2">
                        <Repeat className="h-3.5 w-3.5 text-primary shrink-0" />
                        <span>
                          Repeats {repeatLabel(displayed.repeatFrequency).toLowerCase()}
                          {displayed.repeatEndDate ? ` until ${displayed.repeatEndDate}` : ""}
                        </span>
                      </div>
                    )}
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
                    onClick={enterEditMode}
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
                  <Button
                    size="sm"
                    variant="outline"
                    className="shrink-0"
                    onClick={() => setShowClone(v => !v)}
                    data-testid="button-clone-appt-dialog"
                  >
                    <Copy className="h-3.5 w-3.5 mr-1.5" /> Clone
                  </Button>
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

                {/* ── Clone row (toggled by the Clone button) ── */}
                {showClone && (
                  <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-muted/30 shrink-0 flex-wrap">
                    <span className="text-xs text-muted-foreground">Clone this appointment to</span>
                    <DatePickerPopover
                      value={cloneDate || displayed.date}
                      onChange={setCloneDate}
                    />
                    <Button
                      size="sm"
                      className="h-7 text-xs"
                      disabled={!cloneDate || cloneMutation.isPending}
                      onClick={() => cloneMutation.mutate(cloneDate)}
                      data-testid="button-clone-confirm"
                    >
                      {cloneMutation.isPending ? "Cloning…" : "Clone"}
                    </Button>
                  </div>
                )}

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
                            <p className="text-sm font-semibold">{clientName(customer)}</p>
                            {customer.phone && <p className="text-xs text-muted-foreground">{formatPhone(customer.phone)}</p>}
                          </div>
                          <ExternalLink className="h-3.5 w-3.5 text-muted-foreground ml-auto shrink-0" />
                        </div>
                      </Link>
                    </div>
                  )}

                  {/* PIANOS & SERVICES (itemized, new-style) */}
                  {viewGroups && viewGroups.length > 0 ? (
                    <div className="px-5 py-4">
                      <p className="text-[10px] font-semibold tracking-widest uppercase text-muted-foreground mb-2">Pianos &amp; Services</p>
                      <div className="space-y-3">
                        {viewGroups.map((g, gi) => {
                          const gPiano = g.pianoId ? allPianos?.find(p => p.id === g.pianoId) : null;
                          const gLabel = g.pianoId == null
                            ? "Misc / Standalone Services"
                            : gPiano
                              ? [gPiano.year, gPiano.make, gPiano.model].filter(Boolean).join(" ") || `Piano #${g.pianoId}`
                              : `Piano #${g.pianoId}`;
                          return (
                            <div key={`${g.pianoId ?? "misc"}-${gi}`}>
                              <div className="flex items-center gap-2 mb-1.5">
                                <Music className="h-4 w-4 text-muted-foreground shrink-0" />
                                <span className="text-sm font-semibold">{gLabel}</span>
                                {gPiano && (
                                  <Link href={`/pianos/${gPiano.id}`} onClick={() => onOpenChange(false)}>
                                    <ExternalLink className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground ml-1 cursor-pointer" data-testid={`link-appt-piano-${gPiano.id}`} />
                                  </Link>
                                )}
                              </div>
                              <div className="ml-6 space-y-1.5">
                                {g.lines.map(line => (
                                  <div key={line.lineId} className="flex items-start justify-between gap-2 text-sm">
                                    <div className="min-w-0">
                                      <span className="text-foreground">{line.name}</span>
                                      {line.isTuning && (
                                        <Badge className="ml-1.5 text-[9px] px-1 py-0 bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border-amber-200 dark:border-amber-700 align-middle">
                                          Tuning
                                        </Badge>
                                      )}
                                      <p className="text-xs text-muted-foreground">
                                        {formatLineSubline(line)}
                                        {line.durationMinutes > 0 ? ` · ${formatLineDuration(line.durationMinutes)}` : ""}
                                      </p>
                                    </div>
                                    <span className="font-medium tabular-nums shrink-0">{formatMoney(lineTotal(line))}</span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          );
                        })}
                        <div className="flex items-center justify-between border-t pt-2 text-sm">
                          <span className="text-muted-foreground">Total</span>
                          <span className="font-semibold tabular-nums">{formatMoney(groupsTotal(viewGroups))}</span>
                        </div>
                      </div>
                    </div>
                  ) : (pianoLabel || serviceLines.length > 0 || displayed.priceEstimate) && (
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
