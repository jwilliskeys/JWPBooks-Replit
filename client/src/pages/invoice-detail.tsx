import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation, useRoute } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Printer, Pencil, Trash2, Plus, X, CheckCircle, ArrowLeft, Mail, Download, DollarSign } from "lucide-react";
import { EnterPaymentDialog } from "@/components/enter-payment-dialog";
import { PhoneInput } from "@/components/phone-input";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatPhone } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { Invoice, Customer, Piano, Appointment, ServiceCatalogItem, UserSettings, CustomerContact } from "@shared/schema";
import { clientName } from "@shared/client-name";

const COMPANY_NAME = "John Willis Piano";
const COMPANY_ADDRESS = "14 Murdock St. APT #3-4\nSomerville, MA 02145";

type LineItem = {
  description: string;
  quantity: number;
  unitPrice: string;
  taxes: string;
  lineTotal: string;
  type?: "labor" | "parts";
};

function parseMDYY(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;
  const month = parseInt(parts[0], 10);
  const day = parseInt(parts[1], 10);
  let year = parseInt(parts[2], 10);
  if (isNaN(month) || isNaN(day) || isNaN(year)) return null;
  if (year < 100) year += 2000;
  return new Date(year, month - 1, day);
}

function formatDateLong(dateStr: string) {
  const d = parseMDYY(dateStr);
  if (!d) return dateStr;
  const months = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function todayMDYY(): string {
  const d = new Date();
  return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear() % 100}`;
}

function parseDollar(str: string | number): number {
  if (typeof str === "number") return isNaN(str) ? 0 : str;
  if (!str) return 0;
  const n = parseFloat(str.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}

function formatDollar(n: number): string {
  return `$${n.toFixed(2)}`;
}

function computeLineTotal(qty: number, unitPrice: string): string {
  return formatDollar(qty * parseDollar(unitPrice));
}

function computeTotals(lineItems: LineItem[]): { subtotal: string; total: string } {
  const sum = lineItems.reduce((acc, li) => acc + parseDollar(li.lineTotal), 0);
  return { subtotal: formatDollar(sum), total: formatDollar(sum) };
}

function computeAmountDue(total: string, paid: string): string {
  return formatDollar(Math.max(0, parseDollar(total) - parseDollar(paid)));
}

function statusBadge(status: string | null) {
  switch (status) {
    case "paid":
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-0 print:bg-green-100 print:text-green-800">Paid</Badge>;
    case "open":
      return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-0 print:bg-blue-100 print:text-blue-800">Open</Badge>;
    case "cancelled":
      return <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-0 print:bg-red-100 print:text-red-800">Cancelled</Badge>;
    default:
      return <Badge variant="secondary" className="print:bg-gray-100 print:text-gray-700">Draft</Badge>;
  }
}

function buildLineItemsFromAppointment(appt: Appointment, catalog: ServiceCatalogItem[]): LineItem[] {
  const services = appt.servicesRequested
    ? appt.servicesRequested.split(",").map(s => s.trim()).filter(Boolean)
    : [];

  if (services.length === 0) {
    const price = appt.priceEstimate ?? "$0.00";
    return [{
      description: "Service",
      quantity: 1,
      unitPrice: price,
      taxes: "",
      lineTotal: price,
      type: "labor" as const,
    }];
  }

  return services.map(name => {
    const catalogItem = catalog.find(
      c => c.name.toLowerCase() === name.toLowerCase()
    );
    const price = catalogItem?.defaultCost ?? "$0.00";
    return {
      description: name,
      quantity: 1,
      unitPrice: price,
      taxes: "",
      lineTotal: price,
      type: "labor" as const,
    };
  });
}

interface InvoiceFormState {
  invoiceNumber: string;
  customerId: number;
  appointmentId: number | null;
  pianoId: number | null;
  invoiceDate: string;
  dueDate: string;
  status: string;
  lineItems: LineItem[];
  subtotal: string;
  total: string;
  paidAmount: string;
  notes: string;
  customerName: string;
  customerEmail: string;
  customerAddress: string;
  customerPhone: string;
  pianoDescription: string;
  assignedTo: string;
}

function defaultForm(): InvoiceFormState {
  return {
    invoiceNumber: "",
    customerId: 0,
    appointmentId: null,
    pianoId: null,
    invoiceDate: todayMDYY(),
    dueDate: todayMDYY(),
    status: "draft",
    lineItems: [{ description: "", quantity: 1, unitPrice: "$0.00", taxes: "", lineTotal: "$0.00", type: "labor" as const }],
    subtotal: "$0.00",
    total: "$0.00",
    paidAmount: "$0.00",
    notes: "",
    customerName: "",
    customerEmail: "",
    customerAddress: "",
    customerPhone: "",
    pianoDescription: "",
    assignedTo: "John Willis",
  };
}

function invoiceToForm(inv: Invoice): InvoiceFormState {
  let lineItems: LineItem[] = [];
  try { lineItems = JSON.parse(inv.lineItems); } catch {}
  // Normalize each line item — unitPrice/lineTotal may be numbers from older saves
  lineItems = lineItems.map(li => ({
    description: li.description ?? "",
    quantity: Number(li.quantity) || 1,
    unitPrice: formatDollar(parseDollar((li as any).unitPrice ?? "$0.00")),
    taxes: li.taxes ?? "",
    lineTotal: formatDollar(parseDollar((li as any).lineTotal ?? (li as any).unitPrice ?? "$0.00")),
    type: (li.type === "parts" ? "parts" : "labor") as "labor" | "parts",
  }));
  if (lineItems.length === 0) {
    lineItems = [{ description: "", quantity: 1, unitPrice: "$0.00", taxes: "", lineTotal: "$0.00" }];
  }
  return {
    invoiceNumber: inv.invoiceNumber,
    customerId: inv.customerId,
    appointmentId: inv.appointmentId ?? null,
    pianoId: inv.pianoId ?? null,
    invoiceDate: inv.invoiceDate,
    dueDate: inv.dueDate,
    status: inv.status ?? "draft",
    lineItems,
    subtotal: inv.subtotal ?? "$0.00",
    total: inv.total ?? "$0.00",
    paidAmount: inv.paidAmount ?? "$0.00",
    notes: inv.notes ?? "",
    customerName: inv.customerName ?? "",
    customerEmail: inv.customerEmail ?? "",
    customerAddress: inv.customerAddress ?? "",
    customerPhone: inv.customerPhone ?? "",
    pianoDescription: inv.pianoDescription ?? "",
    assignedTo: inv.assignedTo ?? "John Willis",
  };
}

export default function InvoiceDetailPage() {
  const [matchDetail, paramsDetail] = useRoute("/invoices/:id");
  const [matchNew] = useRoute("/invoices/new");
  const [, navigate] = useLocation();
  const { toast } = useToast();

  const isNew = matchNew;
  const invoiceId = matchDetail && paramsDetail?.id ? parseInt(paramsDetail.id) : null;

  const searchParams = typeof window !== "undefined"
    ? new URLSearchParams(window.location.search)
    : new URLSearchParams();
  const appointmentIdParam = searchParams.get("appointmentId");
  const editParam = searchParams.get("edit");

  const [editMode, setEditMode] = useState((isNew ?? false) || editParam === "1");
  const [form, setForm] = useState<InvoiceFormState>(defaultForm());
  const [printAfterSave, setPrintAfterSave] = useState(false);
  const [printAfterUpdate, setPrintAfterUpdate] = useState(false);
  const [savingPdf, setSavingPdf] = useState(false);
  const [showPaymentDialog, setShowPaymentDialog] = useState(false);

  const { data: invoice, isLoading: loadingInvoice } = useQuery<Invoice>({
    queryKey: ["/api/invoices", invoiceId],
    enabled: !!invoiceId,
  });

  const { data: nextNumber } = useQuery<{ nextNumber: number }>({
    queryKey: ["/api/invoices/next-number"],
    enabled: isNew === true,
  });

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: allPianos } = useQuery<Piano[]>({
    queryKey: ["/api/pianos"],
  });

  const { data: appointmentData } = useQuery<Appointment>({
    queryKey: ["/api/appointments", appointmentIdParam ? parseInt(appointmentIdParam) : null],
    enabled: !!appointmentIdParam && isNew === true,
  });

  const { data: serviceCatalog } = useQuery<ServiceCatalogItem[]>({
    queryKey: ["/api/service-catalog"],
    enabled: !!appointmentIdParam && isNew === true,
  });

  const { data: paymentSettings } = useQuery<UserSettings>({
    queryKey: ["/api/settings"],
  });

  const { data: customerContacts } = useQuery<CustomerContact[]>({
    queryKey: ["/api/customers", form.customerId, "contacts"],
    enabled: form.customerId > 0,
  });

  useEffect(() => {
    if (invoice && !isNew) {
      setForm(invoiceToForm(invoice));
    }
  }, [invoice, isNew]);

  useEffect(() => {
    if (isNew && nextNumber) {
      setForm(f => ({ ...f, invoiceNumber: String(nextNumber.nextNumber) }));
    }
  }, [isNew, nextNumber]);

  useEffect(() => {
    if (!isNew || !appointmentData) return;
    const customer = customers?.find(c => c.id === appointmentData.customerId);
    const piano = allPianos?.find(p => p.id === appointmentData.pianoId);
    const lineItems = buildLineItemsFromAppointment(appointmentData, serviceCatalog ?? []);
    const { subtotal, total } = computeTotals(lineItems);
    const pianoDesc = piano
      ? [piano.make, piano.model, piano.pianoType, piano.year].filter(Boolean).join(" ")
      : "";
    const custAddr = customer
      ? [customer.address, customer.city, customer.state, customer.zipCode].filter(Boolean).join(", ")
      : "";
    setForm(f => ({
      ...f,
      customerId: appointmentData.customerId,
      appointmentId: appointmentData.id,
      pianoId: appointmentData.pianoId ?? null,
      invoiceDate: appointmentData.date,
      dueDate: appointmentData.date,
      customerName: customer ? clientName(customer) : "",
      customerEmail: customer?.email ?? "",
      customerAddress: custAddr,
      customerPhone: customer?.phone ?? "",
      pianoDescription: pianoDesc,
      lineItems,
      subtotal,
      total,
    }));
  }, [appointmentData, customers, allPianos, isNew, serviceCatalog]);

  // Reactively update customerEmail to primary contact email once contacts load.
  // Runs whenever the selected customer or their contacts change, but only in
  // create/edit mode (never overrides a saved invoice being viewed).
  useEffect(() => {
    if (!isNew && !editMode) return;
    if (!form.customerId) return;
    const customer = customers?.find(c => c.id === form.customerId);
    if (!customer) return;
    const primary = customerContacts?.find(c => c.isPrimary);
    const resolvedEmail = primary?.email ?? customer.email ?? "";
    setForm(f => ({ ...f, customerEmail: resolvedEmail }));
  }, [form.customerId, customerContacts, customers, isNew, editMode]);

  const createMutation = useMutation({
    mutationFn: (data: object) => apiRequest("POST", "/api/invoices", data).then(r => r.json()),
    onSuccess: (created: Invoice) => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Invoice created" });
      const shouldPrint = printAfterSave;
      setPrintAfterSave(false);
      navigate(`/invoices/${created.id}`);
      if (shouldPrint) setTimeout(() => window.print(), 500);
    },
    onError: () => { toast({ title: "Failed to create invoice", variant: "destructive" }); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: object }) =>
      apiRequest("PATCH", `/api/invoices/${id}`, data).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices", invoiceId] });
      toast({ title: "Invoice saved" });
      setEditMode(false);
      const shouldPrint = printAfterUpdate;
      setPrintAfterUpdate(false);
      if (shouldPrint) window.print();
    },
    onError: () => { toast({ title: "Failed to save invoice", variant: "destructive" }); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/invoices/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Invoice deleted" });
      navigate("/invoices");
    },
    onError: () => { toast({ title: "Failed to delete invoice", variant: "destructive" }); },
  });

  const markPaidMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("PATCH", `/api/invoices/${id}`, { status: "paid", paidAmount: invoice?.total ?? "$0.00" }).then(r => r.json()),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      queryClient.invalidateQueries({ queryKey: ["/api/invoices", invoiceId] });
      toast({ title: "Invoice marked as paid" });
    },
    onError: () => { toast({ title: "Failed to update invoice", variant: "destructive" }); },
  });

  function updateLineItem(idx: number, field: keyof LineItem, value: string | number) {
    setForm(f => {
      const items = [...f.lineItems];
      const item = { ...items[idx], [field]: value };
      if (field === "quantity" || field === "unitPrice") {
        item.lineTotal = computeLineTotal(
          field === "quantity" ? Number(value) : item.quantity,
          field === "unitPrice" ? String(value) : item.unitPrice
        );
      }
      items[idx] = item;
      const { subtotal, total } = computeTotals(items);
      return { ...f, lineItems: items, subtotal, total };
    });
  }

  function addLineItem() {
    setForm(f => ({
      ...f,
      lineItems: [...f.lineItems, { description: "", quantity: 1, unitPrice: "$0.00", taxes: "", lineTotal: "$0.00", type: "labor" as const }],
    }));
  }

  function removeLineItem(idx: number) {
    setForm(f => {
      const items = f.lineItems.filter((_, i) => i !== idx);
      const { subtotal, total } = computeTotals(items);
      return { ...f, lineItems: items, subtotal, total };
    });
  }

  function buildPayload() {
    const { subtotal, total } = computeTotals(form.lineItems);
    return {
      invoiceNumber: form.invoiceNumber,
      customerId: form.customerId,
      appointmentId: form.appointmentId,
      pianoId: form.pianoId,
      invoiceDate: form.invoiceDate,
      dueDate: form.dueDate,
      status: form.status,
      lineItems: JSON.stringify(form.lineItems),
      subtotal,
      total,
      paidAmount: form.paidAmount,
      notes: form.notes || null,
      customerName: form.customerName || null,
      customerEmail: form.customerEmail || null,
      customerAddress: form.customerAddress || null,
      customerPhone: form.customerPhone || null,
      pianoDescription: form.pianoDescription || null,
      assignedTo: form.assignedTo || "John Willis",
    };
  }

  function handleSave() {
    if (!form.customerId) {
      toast({ title: "Please select a customer before saving.", variant: "destructive" });
      return;
    }
    if (isNew) {
      createMutation.mutate(buildPayload());
    } else if (invoiceId) {
      updateMutation.mutate({ id: invoiceId, data: buildPayload() });
    }
  }

  function handleSaveAndPrint() {
    if (!form.customerId) {
      toast({ title: "Please select a customer before saving.", variant: "destructive" });
      return;
    }
    if (isNew) {
      setPrintAfterSave(true);
      createMutation.mutate(buildPayload());
    } else if (invoiceId) {
      setPrintAfterUpdate(true);
      updateMutation.mutate({ id: invoiceId, data: buildPayload() });
    }
  }

  async function handleSaveAsPdf() {
    const element = document.getElementById("invoice-print-area");
    if (!element) return;
    setSavingPdf(true);
    try {
      const html2pdf = (await import("html2pdf.js")).default;
      await html2pdf()
        .set({
          margin: [12.7, 12.7, 12.7, 12.7],
          filename: `invoice-${displayData.invoiceNumber || "draft"}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: "mm", format: "letter", orientation: "portrait" },
        })
        .from(element)
        .save();
    } catch {
      toast({ title: "Failed to generate PDF. Please try again.", variant: "destructive" });
    } finally {
      setSavingPdf(false);
    }
  }

  const amountDue = computeAmountDue(form.total, form.paidAmount);

  const displayData = editMode ? form : (invoice ? invoiceToForm(invoice) : form);

  if (loadingInvoice && !isNew) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden !important; }
          #invoice-print-area, #invoice-print-area * { visibility: visible !important; }
          #invoice-print-area { position: fixed; top: 0; left: 0; width: 100%; padding: 40px; background: white; }
          .no-print { display: none !important; }
        }
      `}</style>

      <div className="p-4 sm:p-6 max-w-4xl mx-auto">
        {/* Toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-2 mb-5 no-print">
          <nav className="flex items-center gap-1.5 text-sm min-w-0 flex-wrap">
            <button
              onClick={() => navigate("/invoices")}
              className="text-muted-foreground hover:text-foreground flex items-center gap-1"
              data-testid="button-back-invoices"
            >
              <ArrowLeft className="h-3.5 w-3.5 shrink-0" />
              Invoices
            </button>
            <span className="text-muted-foreground">›</span>
            {!isNew && invoice?.customerId ? (
              <>
                <button
                  onClick={() => navigate(`/customers/${invoice.customerId}`)}
                  className="text-muted-foreground hover:text-foreground truncate max-w-[10rem] sm:max-w-none"
                  data-testid="link-crumb-invoice-customer"
                >
                  {displayData.customerName || "Client"}
                </button>
                <span className="text-muted-foreground">›</span>
              </>
            ) : null}
            <span className="font-medium truncate">
              {isNew ? "New Invoice" : `#${displayData.invoiceNumber}`}
            </span>
          </nav>
          <div className="flex flex-wrap items-center gap-2">
            {!isNew && !editMode && (
              <>
                {invoice?.status !== "paid" && invoice?.status !== "cancelled" && (
                  <>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowPaymentDialog(true)}
                      className="text-green-700 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-700 dark:hover:bg-green-900/30"
                      data-testid="button-enter-payment"
                    >
                      <DollarSign className="h-3.5 w-3.5 mr-1" />
                      Enter Payment
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => invoiceId && markPaidMutation.mutate(invoiceId)}
                      disabled={markPaidMutation.isPending}
                      className="text-green-700 border-green-300 hover:bg-green-50 dark:text-green-400 dark:border-green-700 dark:hover:bg-green-900/30"
                      data-testid="button-mark-paid"
                    >
                      <CheckCircle className="h-3.5 w-3.5 mr-1" />
                      Mark Paid
                    </Button>
                  </>
                )}
                {displayData.customerEmail && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      const subject = encodeURIComponent(`Invoice #${displayData.invoiceNumber} – John Willis Piano`);
                      const body = encodeURIComponent(
                        `Hi ${displayData.customerName},\n\nPlease find your invoice below:\n\nInvoice #${displayData.invoiceNumber}\nDate: ${displayData.invoiceDate}\nDue: ${displayData.dueDate}\nTotal: ${displayData.total}\n\nThank you!\nJohn Willis Piano`
                      );
                      window.location.href = `mailto:${displayData.customerEmail}?subject=${subject}&body=${body}`;
                    }}
                    data-testid="button-email-invoice"
                  >
                    <Mail className="h-3.5 w-3.5 mr-1" />
                    Email
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveAsPdf}
                  disabled={savingPdf}
                  data-testid="button-save-pdf-invoice"
                >
                  <Download className="h-3.5 w-3.5 mr-1" />
                  {savingPdf ? "Saving…" : "Save as PDF"}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.print()}
                  data-testid="button-print-invoice"
                >
                  <Printer className="h-3.5 w-3.5 mr-1" />
                  Print / PDF
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditMode(true)}
                  data-testid="button-edit-invoice"
                >
                  <Pencil className="h-3.5 w-3.5 mr-1" />
                  Edit
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive hover:bg-destructive/10" data-testid="button-delete-invoice">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete Invoice #{invoice?.invoiceNumber}?</AlertDialogTitle>
                      <AlertDialogDescription>This cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction
                        className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        onClick={() => invoiceId && deleteMutation.mutate(invoiceId)}
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </>
            )}
            {(isNew || editMode) && (
              <>
                {!isNew && (
                  <Button variant="ghost" size="sm" onClick={() => setEditMode(false)} data-testid="button-cancel-edit">
                    Cancel
                  </Button>
                )}
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleSave}
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-invoice"
                >
                  Save
                </Button>
                <Button
                  size="sm"
                  onClick={handleSaveAndPrint}
                  disabled={createMutation.isPending || updateMutation.isPending}
                  data-testid="button-save-print-invoice"
                >
                  <Printer className="h-3.5 w-3.5 mr-1" />
                  Save & Print
                </Button>
              </>
            )}
          </div>
        </div>

        {/* Invoice document */}
        <div
          id="invoice-print-area"
          className="bg-white dark:bg-background border rounded-lg p-6 sm:p-10 shadow-sm"
        >
          {/* Header row */}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-4 mb-8">
            {/* Company block */}
            <div>
              <div className="text-xl font-bold mb-1">{COMPANY_NAME}</div>
              <div className="text-sm text-muted-foreground whitespace-pre-line">{COMPANY_ADDRESS}</div>
            </div>

            {/* Invoice meta */}
            <div className="sm:text-right space-y-1.5">
              {editMode || isNew ? (
                <div className="flex sm:justify-end items-center gap-2 mb-2">
                  <span className="text-sm text-muted-foreground">Invoice #</span>
                  <Input
                    value={form.invoiceNumber}
                    onChange={e => setForm(f => ({ ...f, invoiceNumber: e.target.value }))}
                    className="w-28 h-7 text-sm font-mono"
                    data-testid="input-invoice-number"
                  />
                </div>
              ) : (
                <div className="text-lg font-bold">Invoice #{displayData.invoiceNumber}</div>
              )}
              <div className="flex sm:justify-end items-center gap-3 text-sm">
                <span className="text-muted-foreground w-28 sm:text-right">Invoice Date</span>
                {editMode || isNew ? (
                  <Input
                    value={form.invoiceDate}
                    onChange={e => setForm(f => ({ ...f, invoiceDate: e.target.value }))}
                    placeholder="M/D/YY"
                    className="w-28 h-7 text-sm"
                    data-testid="input-invoice-date"
                  />
                ) : (
                  <span className="font-medium">{formatDateLong(displayData.invoiceDate)}</span>
                )}
              </div>
              <div className="flex sm:justify-end items-center gap-3 text-sm">
                <span className="text-muted-foreground w-28 sm:text-right">Due Date</span>
                {editMode || isNew ? (
                  <Input
                    value={form.dueDate}
                    onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))}
                    placeholder="M/D/YY"
                    className="w-28 h-7 text-sm"
                    data-testid="input-due-date"
                  />
                ) : (
                  <span className="font-medium">{formatDateLong(displayData.dueDate)}</span>
                )}
              </div>
              <div className="flex sm:justify-end items-center gap-3 text-sm">
                <span className="text-muted-foreground w-28 sm:text-right">Status</span>
                {editMode || isNew ? (
                  <Select value={form.status} onValueChange={v => setForm(f => ({ ...f, status: v }))}>
                    <SelectTrigger className="w-28 h-7 text-sm" data-testid="select-invoice-status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="draft">Draft</SelectItem>
                      <SelectItem value="open">Open</SelectItem>
                      <SelectItem value="paid">Paid</SelectItem>
                      <SelectItem value="cancelled">Cancelled</SelectItem>
                    </SelectContent>
                  </Select>
                ) : (
                  statusBadge(displayData.status)
                )}
              </div>
              <div className="flex sm:justify-end items-center gap-3 text-sm pt-1">
                <span className="text-muted-foreground w-28 sm:text-right font-medium">Amount Due</span>
                <span className="font-bold text-base">{amountDue}</span>
              </div>
            </div>
          </div>

          {/* Customer block */}
          <div className="mb-8">
            <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Bill To</div>
            {editMode || isNew ? (
              <div className="space-y-2 max-w-sm">
                <Select
                  value={form.customerId ? String(form.customerId) : ""}
                  onValueChange={v => {
                    const cust = customers?.find(c => c.id === parseInt(v));
                    if (!cust) return;
                    const addr = [cust.address, cust.city, cust.state, cust.zipCode].filter(Boolean).join(", ");
                    setForm(f => ({
                      ...f,
                      customerId: cust.id,
                      customerName: clientName(cust),
                      customerEmail: cust.email ?? "",
                      customerPhone: cust.phone ?? "",
                      customerAddress: addr,
                    }));
                  }}
                >
                  <SelectTrigger className="h-8 text-sm" data-testid="select-customer">
                    <SelectValue placeholder="Select a customer…" />
                  </SelectTrigger>
                  <SelectContent className="max-h-60">
                    {(customers ?? [])
                      .slice()
                      .sort((a, b) => clientName(a, "").localeCompare(clientName(b, "")))
                      .map(c => (
                        <SelectItem key={c.id} value={String(c.id)}>
                          {clientName(c)}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
                <Input
                  value={form.customerName}
                  onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))}
                  placeholder="Customer name"
                  className="h-8 text-sm font-medium"
                  data-testid="input-customer-name"
                />
                <Input
                  value={form.customerEmail}
                  onChange={e => setForm(f => ({ ...f, customerEmail: e.target.value }))}
                  placeholder="Email address"
                  type="email"
                  className="h-8 text-sm"
                  data-testid="input-customer-email"
                />
                <Textarea
                  value={form.customerAddress}
                  onChange={e => setForm(f => ({ ...f, customerAddress: e.target.value }))}
                  placeholder="Address"
                  className="text-sm resize-none h-16"
                  data-testid="input-customer-address"
                />
                <PhoneInput
                  value={form.customerPhone}
                  onChange={v => setForm(f => ({ ...f, customerPhone: v }))}
                  placeholder="(801)-555-1234"
                  className="h-8 text-sm font-mono"
                  data-testid="input-customer-phone"
                />
              </div>
            ) : (
              <div className="text-sm space-y-0.5">
                <div className="font-medium">{displayData.customerName}</div>
                {displayData.customerEmail && (
                  <div className="text-muted-foreground">{displayData.customerEmail}</div>
                )}
                <div className="text-muted-foreground whitespace-pre-line">{displayData.customerAddress}</div>
                {displayData.customerPhone && (
                  <div className="text-muted-foreground">{formatPhone(displayData.customerPhone)}</div>
                )}
              </div>
            )}
          </div>

          {/* Piano description */}
          {(displayData.pianoDescription || editMode || isNew) && (
            <div className="mb-6">
              {editMode || isNew ? (
                <Input
                  value={form.pianoDescription}
                  onChange={e => setForm(f => ({ ...f, pianoDescription: e.target.value }))}
                  placeholder="Piano description (e.g. Baldwin Grand Baby)"
                  className="h-8 text-sm font-medium max-w-sm"
                  data-testid="input-piano-description"
                />
              ) : (
                <div className="font-medium text-sm">{displayData.pianoDescription}</div>
              )}
            </div>
          )}

          {/* Line items table */}
          <div className="mb-6 overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-y border-border">
                  <th className="text-left py-2 pr-4 font-semibold text-muted-foreground">Description</th>
                  <th className="text-left py-2 pr-4 font-semibold text-muted-foreground whitespace-nowrap">Quantity</th>
                  <th className="text-left py-2 pr-4 font-semibold text-muted-foreground">Subtotal</th>
                  <th className="text-left py-2 pr-4 font-semibold text-muted-foreground">Type</th>
                  <th className="text-right py-2 font-semibold text-muted-foreground">Line Total</th>
                  {(editMode || isNew) && <th className="py-2 w-8" />}
                </tr>
              </thead>
              <tbody>
                {displayData.lineItems.map((li, idx) => (
                  <tr key={idx} className="border-b border-border/50">
                    <td className="py-2.5 pr-4">
                      {editMode || isNew ? (
                        <Input
                          value={li.description}
                          onChange={e => updateLineItem(idx, "description", e.target.value)}
                          className="h-7 text-sm"
                          placeholder="Description"
                          data-testid={`input-line-desc-${idx}`}
                        />
                      ) : (
                        <span>{li.description}</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      {editMode || isNew ? (
                        <Input
                          type="number"
                          min="1"
                          value={li.quantity}
                          onChange={e => updateLineItem(idx, "quantity", parseInt(e.target.value) || 1)}
                          className="h-7 text-sm w-20"
                          data-testid={`input-line-qty-${idx}`}
                        />
                      ) : (
                        <span className="text-muted-foreground">{li.quantity} unit{li.quantity !== 1 ? "s" : ""} at {li.unitPrice}/each</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      {editMode || isNew ? (
                        <Input
                          value={li.unitPrice}
                          onChange={e => updateLineItem(idx, "unitPrice", e.target.value)}
                          className="h-7 text-sm w-28"
                          placeholder="$0.00"
                          data-testid={`input-line-price-${idx}`}
                        />
                      ) : (
                        <span className="tabular-nums">{li.lineTotal}</span>
                      )}
                    </td>
                    <td className="py-2.5 pr-4">
                      {editMode || isNew ? (
                        <button
                          type="button"
                          onClick={() => updateLineItem(idx, "type", li.type === "parts" ? "labor" : "parts")}
                          className={`text-[10px] px-2 py-1 rounded-full border font-medium transition-colors whitespace-nowrap ${
                            li.type === "parts"
                              ? "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700"
                              : "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-900/30 dark:text-blue-400 dark:border-blue-700"
                          }`}
                          data-testid={`toggle-line-type-${idx}`}
                        >
                          {li.type === "parts" ? "Parts" : "Labor"}
                        </button>
                      ) : (
                        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium whitespace-nowrap ${
                          li.type === "parts"
                            ? "text-amber-600 border-amber-200 dark:text-amber-400"
                            : "text-blue-600 border-blue-200 dark:text-blue-400"
                        }`}>
                          {li.type === "parts" ? "Parts" : "Labor"}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 text-right tabular-nums font-medium">
                      {computeLineTotal(li.quantity, li.unitPrice)}
                    </td>
                    {(editMode || isNew) && (
                      <td className="py-2.5 pl-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-6 w-6 text-muted-foreground hover:text-destructive"
                          onClick={() => removeLineItem(idx)}
                          disabled={displayData.lineItems.length <= 1}
                          data-testid={`button-remove-line-${idx}`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
            {(editMode || isNew) && (
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 text-xs h-7 text-muted-foreground"
                onClick={addLineItem}
                data-testid="button-add-line-item"
              >
                <Plus className="h-3 w-3 mr-1" />
                Add line item
              </Button>
            )}
          </div>

          {/* Footer: notes left, totals right */}
          <div className="flex flex-col sm:flex-row sm:justify-between gap-6">
            <div className="sm:max-w-xs">
              {editMode || isNew ? (
                <Textarea
                  value={form.notes}
                  onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                  placeholder="Footer notes (payment instructions, thank you message...)"
                  className="text-sm resize-none h-28"
                  data-testid="input-invoice-notes"
                />
              ) : (
                displayData.notes ? (
                  <p className="text-sm text-muted-foreground leading-relaxed">{displayData.notes}</p>
                ) : null
              )}
            </div>

            {/* Totals */}
            <div className="sm:min-w-[240px]">
              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between gap-8">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="tabular-nums font-medium">{displayData.subtotal}</span>
                </div>
                <div className="flex justify-between gap-8 border-t border-border pt-1.5">
                  <span className="font-semibold">Total</span>
                  <span className="tabular-nums font-bold">{displayData.total}</span>
                </div>
                <div className="flex justify-between gap-8 items-center">
                  <span className="text-muted-foreground">Paid</span>
                  {editMode || isNew ? (
                    <Input
                      value={form.paidAmount}
                      onChange={e => setForm(f => ({ ...f, paidAmount: e.target.value }))}
                      className="h-7 text-sm w-28 text-right"
                      placeholder="$0.00"
                      data-testid="input-paid-amount"
                    />
                  ) : (
                    <span className="tabular-nums">{displayData.paidAmount}</span>
                  )}
                </div>
                {!editMode && !isNew && invoice?.paymentMethod && (
                  <div className="flex justify-between gap-8 items-center">
                    <span className="text-muted-foreground">Via</span>
                    <span className="text-sm font-medium" data-testid="text-payment-method">{invoice.paymentMethod}</span>
                  </div>
                )}
                <div className="flex justify-between gap-8 border-t border-border pt-1.5">
                  <span className="font-semibold">Amount Due</span>
                  <span className="tabular-nums font-bold text-base">{amountDue}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Ways to Pay — print only */}
          {paymentSettings && (paymentSettings.zelleHandle || paymentSettings.venmoHandle || paymentSettings.cashAppHandle || paymentSettings.paypalMe || paymentSettings.stripePaymentLink) && (
            <div className="mt-8 pt-6 border-t border-border/50 hidden print:block">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-3">Payment Methods</div>
              <div className="flex flex-wrap gap-x-8 gap-y-1.5 text-sm">
                {paymentSettings.zelleHandle && (
                  <div><span className="font-medium">Zelle</span> — Send to <span>{paymentSettings.zelleHandle}</span></div>
                )}
                {paymentSettings.venmoHandle && (
                  <div><span className="font-medium">Venmo</span> — Send to <span>{paymentSettings.venmoHandle.startsWith("@") ? paymentSettings.venmoHandle : `@${paymentSettings.venmoHandle}`}</span></div>
                )}
                {paymentSettings.cashAppHandle && (
                  <div><span className="font-medium">Cash App</span> — Send to <span>{paymentSettings.cashAppHandle.startsWith("$") ? paymentSettings.cashAppHandle : `$${paymentSettings.cashAppHandle}`}</span></div>
                )}
                {paymentSettings.paypalMe && (
                  <div>
                    <span className="font-medium">PayPal</span> — Pay at{" "}
                    <a
                      href={paymentSettings.paypalMe.startsWith("http") ? paymentSettings.paypalMe : `https://${paymentSettings.paypalMe}`}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 underline break-all"
                    >
                      {paymentSettings.paypalMe}
                    </a>
                  </div>
                )}
                {paymentSettings.stripePaymentLink && (
                  <div className="w-full">
                    <span className="font-medium">Credit / Debit Card</span> — Pay at{" "}
                    <a
                      href={paymentSettings.stripePaymentLink}
                      target="_blank"
                      rel="noreferrer"
                      className="text-blue-600 underline break-all"
                    >
                      {paymentSettings.stripePaymentLink}
                    </a>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Print footer */}
          <div className="mt-6 pt-4 border-t border-border/50 text-xs text-muted-foreground text-center hidden print:block">
            Page 1 of 1
          </div>
        </div>
      </div>

      {invoiceId && (
        <EnterPaymentDialog
          open={showPaymentDialog}
          onOpenChange={setShowPaymentDialog}
          invoiceId={invoiceId}
          invoiceNumber={displayData.invoiceNumber}
          invoiceTotal={displayData.total}
        />
      )}
    </>
  );
}
