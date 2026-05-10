import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Plus, Trash2, Music, ChevronDown, FileText, ExternalLink, Pencil } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Appointment, Piano, ServiceCatalogItem, Invoice, Customer } from "@shared/schema";

interface SelectedService {
  catalogId: number;
  name: string;
  price: string;
  duration: string;
  isTuning: boolean;
  quantity: number;
}

interface PianoRecord {
  pianoId: number | null;
  label: string;
  isTuning: boolean;
  notes: string;
  humidity: string;
  temperature: string;
  services: SelectedService[];
}

interface CompleteAppointmentDialogProps {
  appointment: Appointment;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

const PAYMENT_METHODS = ["Zelle", "Venmo", "CashApp", "PayPal", "Stripe", "Cash", "Check", "Other"];

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

export function CompleteAppointmentDialog({
  appointment,
  open,
  onOpenChange,
  onComplete,
}: CompleteAppointmentDialogProps) {
  const { toast } = useToast();
  const [result, setResult] = useState("completed");
  const [clientNotes, setClientNotes] = useState(appointment.notes || "");
  const [pianoRecords, setPianoRecords] = useState<PianoRecord[]>([]);
  const [miscServices, setMiscServices] = useState<SelectedService[]>([]);
  const [addServiceOpenFor, setAddServiceOpenFor] = useState<string | null>(null);
  const [paymentMethod, setPaymentMethod] = useState<string>("");
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [localCreatedInvoice, setLocalCreatedInvoice] = useState<Invoice | null>(null);

  const { data: pianos } = useQuery<Piano[]>({
    queryKey: ["/api/customers", appointment.customerId, "pianos"],
    queryFn: () => fetch(`/api/customers/${appointment.customerId}/pianos`).then(r => r.json()),
    enabled: open,
  });

  const { data: catalog } = useQuery<ServiceCatalogItem[]>({
    queryKey: ["/api/service-catalog"],
    enabled: open,
  });

  const { data: allInvoices } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
    enabled: open,
  });

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    enabled: open,
  });

  const linkedInvoice = localCreatedInvoice
    ?? allInvoices?.find(inv => inv.appointmentId === appointment.id)
    ?? null;

  const customer = customers?.find(c => c.id === appointment.customerId);

  function deriveIsTuning(): boolean {
    if (appointment.isTuning) return true;
    if (!catalog || !appointment.servicesRequested) return false;
    const requestedNames = appointment.servicesRequested.split(",").map(s => s.trim().toLowerCase());
    return catalog.some(item => item.isTuning && requestedNames.includes(item.name.toLowerCase()));
  }

  useEffect(() => {
    if (!open || !pianos) return;
    const isTuning = deriveIsTuning();
    const initialRecords: PianoRecord[] = [];
    if (appointment.pianoId) {
      const piano = pianos.find(p => p.id === appointment.pianoId);
      if (piano) {
        initialRecords.push({
          pianoId: piano.id,
          label: [piano.make, piano.model, piano.pianoType].filter(Boolean).join(" ") || `Piano #${piano.id}`,
          isTuning,
          notes: "",
          humidity: "",
          temperature: "",
          services: [],
        });
      }
    } else if (pianos.length === 1) {
      const piano = pianos[0];
      initialRecords.push({
        pianoId: piano.id,
        label: [piano.make, piano.model, piano.pianoType].filter(Boolean).join(" ") || `Piano #${piano.id}`,
        isTuning,
        notes: "",
        humidity: "",
        temperature: "",
        services: [],
      });
    }
    setPianoRecords(initialRecords);
    setMiscServices([]);
    setResult("completed");
    setClientNotes(appointment.notes || "");
    setPaymentMethod("");
    setPaymentAmount("");
    setLocalCreatedInvoice(null);
  }, [open, pianos, catalog, appointment.pianoId, appointment.isTuning, appointment.servicesRequested, appointment.notes, appointment.id]);

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

      const customerName = customer ? `${customer.firstName} ${customer.lastName}` : "";
      const rawPrice = parseFloat(appointment.priceEstimate?.replace(/[^0-9.]/g, "") || "0") || 0;
      const priceStr = `$${rawPrice.toFixed(2)}`;
      const lineItems = appointment.servicesRequested
        ? JSON.stringify([{ description: appointment.servicesRequested, quantity: 1, unitPrice: rawPrice }])
        : JSON.stringify([]);

      const res = await apiRequest("POST", "/api/invoices", {
        customerId: appointment.customerId,
        appointmentId: appointment.id,
        pianoId: appointment.pianoId ?? null,
        invoiceDate,
        dueDate,
        invoiceNumber,
        status: "draft",
        lineItems,
        subtotal: priceStr,
        total: priceStr,
        customerName,
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

  const completeMutation = useMutation({
    mutationFn: () =>
      apiRequest("POST", `/api/appointments/${appointment.id}/complete`, {
        result,
        clientNotes,
        pianoRecords: pianoRecords.map(r => ({
          pianoId: r.pianoId,
          isTuning: r.isTuning,
          notes: r.notes,
          humidity: r.humidity,
          temperature: r.temperature,
          services: JSON.stringify(r.services),
        })),
        miscServices: JSON.stringify(miscServices),
        paymentMethod: paymentMethod && paymentMethod !== "none" ? paymentMethod : null,
        paymentAmount: paymentMethod && paymentMethod !== "none" ? (paymentAmount || null) : null,
      }),
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });

      let invoiceUpdateFailed = false;
      if (paymentMethod && paymentMethod !== "none" && linkedInvoice && linkedInvoice.status !== "paid") {
        try {
          const paidAmount = paymentAmount || linkedInvoice.total || "$0.00";
          const existingNotes = linkedInvoice.notes ? `${linkedInvoice.notes}\n` : "";
          await apiRequest("PATCH", `/api/invoices/${linkedInvoice.id}`, {
            status: "paid",
            paidAmount,
            notes: `${existingNotes}Paid via ${paymentMethod}`,
          });
          queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
        } catch {
          invoiceUpdateFailed = true;
        }
      }

      toast({
        title: invoiceUpdateFailed
          ? "Appointment completed — invoice could not be updated"
          : "Appointment completed successfully",
        variant: invoiceUpdateFailed ? "destructive" : "default",
      });
      onOpenChange(false);
      onComplete?.();
    },
    onError: (err: Error) => {
      toast({ title: "Failed to complete appointment", description: err.message, variant: "destructive" });
    },
  });

  function updatePianoRecord(index: number, updates: Partial<PianoRecord>) {
    setPianoRecords(prev => prev.map((r, i) => i === index ? { ...r, ...updates } : r));
  }

  function removePianoRecord(index: number) {
    setPianoRecords(prev => prev.filter((_, i) => i !== index));
  }

  function addPianoToRecords(piano: Piano) {
    if (pianoRecords.some(r => r.pianoId === piano.id)) return;
    setPianoRecords(prev => [...prev, {
      pianoId: piano.id,
      label: [piano.make, piano.model, piano.pianoType].filter(Boolean).join(" ") || `Piano #${piano.id}`,
      isTuning: deriveIsTuning(),
      notes: "",
      humidity: "",
      temperature: "",
      services: [],
    }]);
  }

  function addServiceToPiano(index: number, item: ServiceCatalogItem) {
    const service: SelectedService = {
      catalogId: item.id,
      name: item.name,
      price: item.defaultCost || "",
      duration: item.defaultDuration || "",
      isTuning: item.isTuning ?? false,
      quantity: 1,
    };
    updatePianoRecord(index, {
      services: [...pianoRecords[index].services, service],
      ...(item.isTuning ? { isTuning: true } : {}),
    });
    setAddServiceOpenFor(null);
  }

  function addServiceToMisc(item: ServiceCatalogItem) {
    const service: SelectedService = {
      catalogId: item.id,
      name: item.name,
      price: item.defaultCost || "",
      duration: item.defaultDuration || "",
      isTuning: item.isTuning ?? false,
      quantity: 1,
    };
    setMiscServices(prev => [...prev, service]);
    setAddServiceOpenFor(null);
  }

  function updatePianoService(pianoIndex: number, serviceIndex: number, field: keyof SelectedService, value: string | number) {
    const parsedValue = field === "quantity" ? (parseInt(String(value)) || 1) : value;
    const newServices = [...pianoRecords[pianoIndex].services];
    newServices[serviceIndex] = { ...newServices[serviceIndex], [field]: parsedValue };
    updatePianoRecord(pianoIndex, { services: newServices });
  }

  function removePianoService(pianoIndex: number, serviceIndex: number) {
    const newServices = pianoRecords[pianoIndex].services.filter((_, i) => i !== serviceIndex);
    updatePianoRecord(pianoIndex, { services: newServices });
  }

  function updateMiscService(index: number, field: keyof SelectedService, value: string | number) {
    const parsedValue = field === "quantity" ? (parseInt(String(value)) || 1) : value;
    setMiscServices(prev => prev.map((s, i) => i === index ? { ...s, [field]: parsedValue } : s));
  }

  function removeMiscService(index: number) {
    setMiscServices(prev => prev.filter((_, i) => i !== index));
  }

  const activeCatalog = catalog?.filter(c => c.isActive) || [];
  const availablePianos = pianos?.filter(p => !pianoRecords.some(r => r.pianoId === p.id)) || [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl w-full max-h-[90vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-5 pb-3 border-b shrink-0">
          <DialogTitle className="text-base font-semibold">Complete Appointment</DialogTitle>
          <p className="text-sm text-muted-foreground mt-0.5">
            {appointment.date} at {appointment.time}
          </p>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label htmlFor="result-select">Result</Label>
                <Select value={result} onValueChange={setResult}>
                  <SelectTrigger id="result-select" data-testid="select-completion-result">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="no-show">No-show</SelectItem>
                    <SelectItem value="cancelled">Cancelled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="client-notes">Client Notes</Label>
              <Textarea
                id="client-notes"
                placeholder="Notes about the client visit..."
                value={clientNotes}
                onChange={e => setClientNotes(e.target.value)}
                rows={2}
                data-testid="textarea-client-notes"
              />
            </div>

            <Separator />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">Pianos</h3>
                {availablePianos.length > 0 && (
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 text-xs gap-1" data-testid="button-add-piano">
                        <Plus className="h-3 w-3" />
                        Add Piano
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-56 p-1" align="end">
                      {availablePianos.map(p => (
                        <button
                          key={p.id}
                          className="w-full text-left text-sm px-3 py-1.5 hover:bg-muted rounded"
                          onClick={() => addPianoToRecords(p)}
                          data-testid={`button-add-piano-${p.id}`}
                        >
                          {[p.make, p.model, p.pianoType].filter(Boolean).join(" ") || `Piano #${p.id}`}
                        </button>
                      ))}
                    </PopoverContent>
                  </Popover>
                )}
              </div>

              {pianoRecords.length === 0 && (
                <p className="text-xs text-muted-foreground">No pianos added yet. Use "Add Piano" to add one.</p>
              )}

              {pianoRecords.map((rec, idx) => (
                <div key={idx} className="border rounded-lg p-4 space-y-3 bg-muted/20" data-testid={`piano-record-${idx}`}>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">{rec.label}</span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-destructive"
                      onClick={() => removePianoRecord(idx)}
                      data-testid={`button-remove-piano-${idx}`}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>

                  <div className="flex items-center gap-2">
                    <Checkbox
                      id={`tuning-${idx}`}
                      checked={rec.isTuning}
                      onCheckedChange={v => updatePianoRecord(idx, { isTuning: !!v })}
                      data-testid={`checkbox-tuning-${idx}`}
                    />
                    <label htmlFor={`tuning-${idx}`} className="text-sm cursor-pointer select-none">
                      This is a tuning for this piano
                    </label>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Service History Notes</Label>
                    <Textarea
                      placeholder="What was done..."
                      value={rec.notes}
                      onChange={e => updatePianoRecord(idx, { notes: e.target.value })}
                      rows={2}
                      className="text-sm"
                      data-testid={`textarea-piano-notes-${idx}`}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <Label className="text-xs">Humidity</Label>
                      <Input
                        placeholder="e.g. 45% RH"
                        value={rec.humidity}
                        onChange={e => updatePianoRecord(idx, { humidity: e.target.value })}
                        className="h-8 text-sm"
                        data-testid={`input-humidity-${idx}`}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs">Temperature</Label>
                      <Input
                        placeholder="e.g. 68°F"
                        value={rec.temperature}
                        onChange={e => updatePianoRecord(idx, { temperature: e.target.value })}
                        className="h-8 text-sm"
                        data-testid={`input-temperature-${idx}`}
                      />
                    </div>
                  </div>

                  {rec.services.length > 0 && (
                    <div className="space-y-2">
                      {rec.services.map((svc, si) => (
                        <div key={si} className="flex items-center gap-2 bg-background rounded border px-2 py-1.5" data-testid={`piano-service-${idx}-${si}`}>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1 flex-wrap">
                              <span className="text-xs font-medium">{svc.name}</span>
                              {svc.isTuning && (
                                <Badge variant="secondary" className="text-xs h-4 px-1">
                                  <Music className="h-2.5 w-2.5 mr-0.5" />
                                  TUNING
                                </Badge>
                              )}
                            </div>
                            <div className="flex gap-2 mt-1">
                              <Input
                                type="number"
                                min="1"
                                value={svc.quantity}
                                onChange={e => updatePianoService(idx, si, "quantity", e.target.value)}
                                className="h-6 text-xs w-14"
                                placeholder="Qty"
                                data-testid={`input-service-qty-${idx}-${si}`}
                              />
                              <Input
                                value={svc.price}
                                onChange={e => updatePianoService(idx, si, "price", e.target.value)}
                                className="h-6 text-xs w-20"
                                placeholder="Price"
                                data-testid={`input-service-price-${idx}-${si}`}
                              />
                              <Input
                                value={svc.duration}
                                onChange={e => updatePianoService(idx, si, "duration", e.target.value)}
                                className="h-6 text-xs w-24"
                                placeholder="Duration"
                                data-testid={`input-service-duration-${idx}-${si}`}
                              />
                            </div>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 text-destructive shrink-0"
                            onClick={() => removePianoService(idx, si)}
                            data-testid={`button-remove-service-${idx}-${si}`}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}

                  <Popover
                    open={addServiceOpenFor === `piano-${idx}`}
                    onOpenChange={o => setAddServiceOpenFor(o ? `piano-${idx}` : null)}
                  >
                    <PopoverTrigger asChild>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 text-xs gap-1 w-full"
                        data-testid={`button-add-service-piano-${idx}`}
                      >
                        <Plus className="h-3 w-3" />
                        Add Service
                        <ChevronDown className="h-3 w-3 ml-auto" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-64 p-1" align="start">
                      <div className="max-h-48 overflow-y-auto">
                        {activeCatalog.length === 0 && (
                          <p className="text-xs text-muted-foreground px-3 py-2">No services in catalog</p>
                        )}
                        {activeCatalog.map(item => (
                          <button
                            key={item.id}
                            className="w-full text-left px-3 py-2 hover:bg-muted rounded text-xs"
                            onClick={() => addServiceToPiano(idx, item)}
                            data-testid={`catalog-item-${item.id}`}
                          >
                            <div className="flex items-center gap-1">
                              <span className="font-medium">{item.name}</span>
                              {item.isTuning && (
                                <Badge variant="secondary" className="text-xs h-4 px-1">TUNING</Badge>
                              )}
                            </div>
                            <div className="text-muted-foreground mt-0.5">
                              {item.defaultCost && <span>{item.defaultCost}</span>}
                              {item.defaultCost && item.defaultDuration && <span> · </span>}
                              {item.defaultDuration && <span>{item.defaultDuration}</span>}
                            </div>
                          </button>
                        ))}
                      </div>
                    </PopoverContent>
                  </Popover>
                </div>
              ))}
            </div>

            <Separator />

            <div className="space-y-3">
              <h3 className="text-sm font-semibold">Misc Services</h3>
              <p className="text-xs text-muted-foreground">Services not tied to a specific piano</p>

              {miscServices.length > 0 && (
                <div className="space-y-2">
                  {miscServices.map((svc, si) => (
                    <div key={si} className="flex items-center gap-2 bg-muted/20 rounded border px-2 py-1.5" data-testid={`misc-service-${si}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1 flex-wrap">
                          <span className="text-xs font-medium">{svc.name}</span>
                          {svc.isTuning && (
                            <Badge variant="secondary" className="text-xs h-4 px-1">
                              <Music className="h-2.5 w-2.5 mr-0.5" />
                              TUNING
                            </Badge>
                          )}
                        </div>
                        <div className="flex gap-2 mt-1">
                          <Input
                            type="number"
                            min="1"
                            value={svc.quantity}
                            onChange={e => updateMiscService(si, "quantity", e.target.value)}
                            className="h-6 text-xs w-14"
                            placeholder="Qty"
                            data-testid={`input-misc-service-qty-${si}`}
                          />
                          <Input
                            value={svc.price}
                            onChange={e => updateMiscService(si, "price", e.target.value)}
                            className="h-6 text-xs w-20"
                            placeholder="Price"
                            data-testid={`input-misc-service-price-${si}`}
                          />
                          <Input
                            value={svc.duration}
                            onChange={e => updateMiscService(si, "duration", e.target.value)}
                            className="h-6 text-xs w-24"
                            placeholder="Duration"
                            data-testid={`input-misc-service-duration-${si}`}
                          />
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive shrink-0"
                        onClick={() => removeMiscService(si)}
                        data-testid={`button-remove-misc-service-${si}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}

              <Popover
                open={addServiceOpenFor === "misc"}
                onOpenChange={o => setAddServiceOpenFor(o ? "misc" : null)}
              >
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    data-testid="button-add-misc-service"
                  >
                    <Plus className="h-3 w-3" />
                    Add Misc Service
                    <ChevronDown className="h-3 w-3 ml-1" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-1" align="start">
                  <div className="max-h-48 overflow-y-auto">
                    {activeCatalog.length === 0 && (
                      <p className="text-xs text-muted-foreground px-3 py-2">No services in catalog</p>
                    )}
                    {activeCatalog.map(item => (
                      <button
                        key={item.id}
                        className="w-full text-left px-3 py-2 hover:bg-muted rounded text-xs"
                        onClick={() => addServiceToMisc(item)}
                        data-testid={`misc-catalog-item-${item.id}`}
                      >
                        <div className="flex items-center gap-1">
                          <span className="font-medium">{item.name}</span>
                          {item.isTuning && (
                            <Badge variant="secondary" className="text-xs h-4 px-1">TUNING</Badge>
                          )}
                        </div>
                        <div className="text-muted-foreground mt-0.5">
                          {item.defaultCost && <span>{item.defaultCost}</span>}
                          {item.defaultCost && item.defaultDuration && <span> · </span>}
                          {item.defaultDuration && <span>{item.defaultDuration}</span>}
                        </div>
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>

            <Separator />

            <div className="space-y-3" data-testid="invoice-payment-section">
              <h3 className="text-sm font-semibold">Invoice</h3>

              <div className="rounded-md border border-border bg-muted/30 px-3 py-2.5 space-y-2">
                {linkedInvoice ? (
                  <div className="flex items-center gap-2 flex-wrap">
                    <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                    <span className="text-sm font-medium">#{linkedInvoice.invoiceNumber}</span>
                    {invoiceStatusBadge(linkedInvoice.status)}
                    <div className="flex gap-1 ml-auto">
                      <Link href={`/invoices/${linkedInvoice.id}`} onClick={() => onOpenChange(false)}>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" data-testid="link-open-invoice-complete">
                          Open <ExternalLink className="h-3 w-3" />
                        </Button>
                      </Link>
                      <Link href={`/invoices/${linkedInvoice.id}?edit=1`} onClick={() => onOpenChange(false)}>
                        <Button variant="ghost" size="sm" className="h-6 px-2 text-xs gap-1" data-testid="link-edit-invoice-complete">
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
                    className="w-full h-8 text-xs"
                    data-testid="button-create-invoice-complete"
                  >
                    <FileText className="h-3.5 w-3.5 mr-1" />
                    {createInvoiceMutation.isPending ? "Creating…" : "Create Invoice"}
                  </Button>
                )}
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-semibold">Payment Received</h3>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Payment Method</Label>
                    <Select value={paymentMethod} onValueChange={setPaymentMethod}>
                      <SelectTrigger className="h-8 text-sm" data-testid="select-payment-method">
                        <SelectValue placeholder="None" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">None</SelectItem>
                        {PAYMENT_METHODS.map(m => (
                          <SelectItem key={m} value={m}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs">Amount Paid</Label>
                    <Input
                      value={paymentAmount}
                      onChange={e => setPaymentAmount(e.target.value)}
                      placeholder={linkedInvoice?.total ?? "$0.00"}
                      className="h-8 text-sm"
                      data-testid="input-payment-amount"
                    />
                  </div>
                </div>
                {paymentMethod && paymentMethod !== "none" && linkedInvoice && linkedInvoice.status !== "paid" && (
                  <p className="text-xs text-muted-foreground">
                    Invoice will be marked as <span className="font-medium text-green-700 dark:text-green-400">Paid</span> when you save.
                  </p>
                )}
              </div>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="px-6 py-4 border-t shrink-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-complete-cancel">
            Cancel
          </Button>
          <Button
            onClick={() => completeMutation.mutate()}
            disabled={completeMutation.isPending}
            data-testid="button-complete-save"
          >
            {completeMutation.isPending ? "Saving..." : "Save Completion"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
