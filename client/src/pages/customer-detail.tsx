import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation, useSearch, Link } from "wouter";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  MapPin,
  Piano as PianoIcon,
  Edit,
  Trash2,
  Plus,
  Calendar,
  PhoneCall,
  Star,
  ChevronRight,
  MoreHorizontal,
  Pencil,
  CheckCircle,
  FileText,
  ClipboardList,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import type {
  Customer,
  Piano,
  ServiceRecord,
  Appointment,
  CustomerContact,
  Invoice,
  Inspection,
} from "@shared/schema";
import { AppointmentDialog } from "@/components/appointment-dialog";
import { ServiceTimeline } from "@/components/service-timeline";
import { ContactManager } from "@/components/contact-manager";

// ── Utilities ─────────────────────────────────────────────────────────────────

function computeNextDueDays(
  lastTuned: string | null | undefined,
  intervalMonths: string | null | undefined
): number | null {
  if (!lastTuned) return null;
  const parts = lastTuned.split("/");
  if (parts.length !== 3) return null;
  let year = parseInt(parts[2]);
  if (year < 100) year += 2000;
  const last = new Date(year, parseInt(parts[0]) - 1, parseInt(parts[1]));
  const interval = parseInt(intervalMonths ?? "12") || 12;
  const nextDue = new Date(last);
  nextDue.setMonth(nextDue.getMonth() + interval);
  const now = new Date();
  return Math.round((nextDue.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function formatIntervalLabel(intervalMonths: string | null | undefined): string | null {
  if (!intervalMonths) return null;
  const n = parseInt(intervalMonths);
  if (isNaN(n)) return null;
  if (n === 1) return "EVERY MONTH";
  if (n === 12) return "EVERY YEAR";
  return `EVERY ${n} MONTHS`;
}

const CLIENT_TYPES = [
  "Residential",
  "Music Studio",
  "Church",
  "School / University",
  "Concert Venue",
  "Other",
] as const;

// ── Section helpers ──────────────────────────────────────────────────────────

function SectionHeader({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <CardTitle className="text-sm font-semibold">{title}</CardTitle>
      {action}
    </div>
  );
}

// ── Pianos Inventory Card ─────────────────────────────────────────────────────

function PianosInventoryCard({
  pianos: customerPianos,
  onAddPiano,
  showAddForm,
  newPianoForm,
  setNewPianoForm,
  onSave,
  onCancel,
  isSaving,
}: {
  pianos: Piano[] | undefined;
  onAddPiano: () => void;
  showAddForm: boolean;
  newPianoForm: NewPianoFormState;
  setNewPianoForm: (f: NewPianoFormState) => void;
  onSave: () => void;
  onCancel: () => void;
  isSaving: boolean;
}) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <SectionHeader
          title={
            customerPianos && customerPianos.length > 0
              ? `Pianos (${customerPianos.length})`
              : "Pianos"
          }
          action={
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onAddPiano}
              data-testid="button-add-piano">
              <Plus className="h-3 w-3 mr-1" /> New Piano
            </Button>
          }
        />
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {!customerPianos || customerPianos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <PianoIcon className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No pianos registered yet</p>
          </div>
        ) : (
          customerPianos.map((piano) => {
            const isInactive = piano.isActive === false;
            const header = [piano.year, piano.make, piano.model, piano.size, piano.serialNumber]
              .filter(Boolean).join(" ") || "Unnamed Piano";
            const dueDays = computeNextDueDays(piano.lastTuned, piano.tuningInterval);
            const freqLabel = formatIntervalLabel(piano.tuningInterval);
            const isOverdue = dueDays !== null && dueDays < 0;
            const isDueSoon = dueDays !== null && dueDays >= 0 && dueDays <= 30;

            return (
              <Link key={piano.id} href={`/pianos/${piano.id}`}>
                <div
                  className={cn(
                    "p-3 rounded-lg border cursor-pointer hover:bg-muted/30 transition-colors",
                    isOverdue
                      ? "border-orange-200 bg-orange-50/40 dark:border-orange-800/30 dark:bg-orange-900/10"
                      : isDueSoon
                      ? "border-yellow-200 bg-yellow-50/30 dark:border-yellow-800/30 dark:bg-yellow-900/10"
                      : "border-border bg-muted/20",
                    isInactive && "opacity-60"
                  )}
                  data-testid={`piano-card-${piano.id}`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold leading-snug" data-testid={`piano-name-${piano.id}`}>
                          {header}
                        </span>
                        {isInactive && (
                          <Badge variant="secondary" className="text-xs shrink-0">Inactive</Badge>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-1">
                        {piano.location && (
                          <span className="text-xs text-muted-foreground flex items-center gap-1">
                            <MapPin className="h-3 w-3" /> {piano.location}
                          </span>
                        )}
                        {piano.lastTuned && (
                          <span className="text-xs text-muted-foreground">
                            Last tuned: {piano.lastTuned}
                          </span>
                        )}
                        {freqLabel && (
                          <span className="text-[10px] bg-muted text-muted-foreground font-semibold px-1.5 py-px rounded uppercase tracking-wide">
                            {freqLabel}
                          </span>
                        )}
                      </div>
                    </div>
                    {dueDays !== null && (
                      <span
                        className={cn(
                          "text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0",
                          isOverdue
                            ? "bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800"
                            : isDueSoon
                            ? "bg-yellow-100 text-yellow-700 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800"
                            : "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800"
                        )}
                      >
                        {isOverdue
                          ? `${Math.abs(dueDays)}d overdue`
                          : dueDays === 0
                          ? "Due today"
                          : `Due in ${dueDays}d`}
                      </span>
                    )}
                  </div>
                </div>
              </Link>
            );
          })
        )}

        {/* Add piano inline form */}
        {showAddForm && (
          <div className="p-3 rounded-lg border bg-muted/20 space-y-3">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">New Piano</p>
            <div className="grid gap-2 sm:grid-cols-3">
              <div className="space-y-1">
                <Label className="text-xs">Make</Label>
                <Input value={newPianoForm.make} onChange={(e) => setNewPianoForm({ ...newPianoForm, make: e.target.value })}
                  placeholder="Steinway" data-testid="input-new-piano-make" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Model</Label>
                <Input value={newPianoForm.model} onChange={(e) => setNewPianoForm({ ...newPianoForm, model: e.target.value })}
                  placeholder="Model B" data-testid="input-new-piano-model" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Year</Label>
                <Input value={newPianoForm.year} onChange={(e) => setNewPianoForm({ ...newPianoForm, year: e.target.value })}
                  placeholder="1985" data-testid="input-new-piano-year" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <Input value={newPianoForm.pianoType} onChange={(e) => setNewPianoForm({ ...newPianoForm, pianoType: e.target.value })}
                  placeholder="Grand" data-testid="input-new-piano-type" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Size</Label>
                <Input value={newPianoForm.size} onChange={(e) => setNewPianoForm({ ...newPianoForm, size: e.target.value })}
                  placeholder="9'" data-testid="input-new-piano-size" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Serial #</Label>
                <Input value={newPianoForm.serialNumber} onChange={(e) => setNewPianoForm({ ...newPianoForm, serialNumber: e.target.value })}
                  placeholder="123456" data-testid="input-new-piano-serial" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Room / Location</Label>
                <Input value={newPianoForm.location} onChange={(e) => setNewPianoForm({ ...newPianoForm, location: e.target.value })}
                  placeholder="Recital Hall" data-testid="input-new-piano-location" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Last Tuned (M/D/YY)</Label>
                <Input value={newPianoForm.lastTuned} onChange={(e) => setNewPianoForm({ ...newPianoForm, lastTuned: e.target.value })}
                  placeholder="5/1/26" data-testid="input-new-piano-tuned" />
              </div>
            </div>
            <Textarea value={newPianoForm.notes} onChange={(e) => setNewPianoForm({ ...newPianoForm, notes: e.target.value })}
              className="min-h-[60px]" placeholder="Notes" data-testid="input-new-piano-notes" />
            <div className="flex gap-2 pt-1">
              <Button size="sm" onClick={onSave} disabled={isSaving} data-testid="button-save-piano">
                {isSaving ? "Saving…" : "Save Piano"}
              </Button>
              <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Invoices list (per-customer) ─────────────────────────────────────────────

function parseDollarLocal(str: string | null | undefined): number {
  if (!str) return 0;
  const n = parseFloat(str.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}

function invoiceStatusBadge(status: string | null) {
  const base = "no-default-active-elevate uppercase text-[10px] font-semibold tracking-wide px-1.5 py-0 border-0";
  switch (status) {
    case "paid":
      return <Badge className={`${base} bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200`}>Paid</Badge>;
    case "open":
      return <Badge className={`${base} bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200`}>Open</Badge>;
    case "cancelled":
      return <Badge className={`${base} bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200`}>Cancelled</Badge>;
    default:
      return <Badge variant="secondary" className={base}>Draft</Badge>;
  }
}

function CustomerInvoicesList({
  invoices,
  customerId,
}: {
  invoices: Invoice[] | undefined;
  customerId: number;
}) {
  const sorted = [...(invoices ?? [])].sort(
    (a, b) => (parseInt(b.invoiceNumber, 10) || 0) - (parseInt(a.invoiceNumber, 10) || 0)
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <SectionHeader
          title={sorted.length > 0 ? `Invoices (${sorted.length})` : "Invoices"}
          action={
            <Link href={`/invoices/new?customerId=${customerId}`}>
              <Button size="sm" variant="outline" className="h-7 text-xs" data-testid="button-new-invoice-for-customer">
                <Plus className="h-3 w-3 mr-1" /> New Invoice
              </Button>
            </Link>
          }
        />
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <FileText className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No invoices for this client yet</p>
          </div>
        ) : (
          sorted.map((inv) => {
            const due = Math.max(0, parseDollarLocal(inv.total) - parseDollarLocal(inv.paidAmount));
            return (
              <Link key={inv.id} href={`/invoices/${inv.id}`}>
                <div
                  className="p-3 rounded-lg border bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors flex items-center gap-3"
                  data-testid={`customer-invoice-${inv.id}`}
                >
                  <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold tabular-nums">#{inv.invoiceNumber}</span>
                      {invoiceStatusBadge(inv.status)}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {inv.invoiceDate}
                      {inv.pianoDescription ? ` · ${inv.pianoDescription}` : ""}
                    </p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-sm font-medium tabular-nums">{inv.total ?? "$0.00"}</p>
                    {due > 0 && inv.status !== "cancelled" && (
                      <p className="text-xs text-orange-600 dark:text-orange-400 tabular-nums">
                        ${due.toFixed(2)} due
                      </p>
                    )}
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              </Link>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

// ── Estimates / inspections list (per-customer) ──────────────────────────────

function CustomerEstimatesList({ inspections }: { inspections: Inspection[] | undefined }) {
  const sorted = [...(inspections ?? [])].sort((a, b) =>
    (b.inspectionDate ?? "").localeCompare(a.inspectionDate ?? "")
  );

  const statusColors: Record<string, string> = {
    pending: "bg-yellow-50 text-yellow-700 dark:bg-yellow-950 dark:text-yellow-300",
    approved: "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300",
    declined: "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300",
    converted: "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <SectionHeader
          title={sorted.length > 0 ? `Estimates & Inspections (${sorted.length})` : "Estimates & Inspections"}
          action={
            <Link href="/inspections">
              <Button size="sm" variant="outline" className="h-7 text-xs" data-testid="button-open-inspections">
                Open Inspections
              </Button>
            </Link>
          }
        />
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-center">
            <ClipboardList className="h-8 w-8 text-muted-foreground/30 mb-2" />
            <p className="text-sm text-muted-foreground">No estimates or inspections yet</p>
          </div>
        ) : (
          sorted.map((ins) => {
            const statusColor = statusColors[ins.status ?? "pending"] ?? statusColors.pending;
            return (
              <Link key={ins.id} href="/inspections">
                <div
                  className="p-3 rounded-lg border bg-muted/20 cursor-pointer hover:bg-muted/40 transition-colors flex items-center gap-3"
                  data-testid={`customer-inspection-${ins.id}`}
                >
                  <ClipboardList className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold">
                        {ins.type === "estimate" ? "Estimate" : "Inspection"}
                      </span>
                      <Badge className={`text-[10px] px-1.5 py-0 border-0 capitalize ${statusColor}`}>
                        {ins.status}
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                      {ins.inspectionDate}
                      {ins.summary ? ` · ${ins.summary}` : ""}
                    </p>
                  </div>
                  {ins.estimatedTotal && (
                    <span className="text-sm font-medium tabular-nums shrink-0">
                      {ins.estimatedTotal}
                    </span>
                  )}
                  <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                </div>
              </Link>
            );
          })
        )}
      </CardContent>
    </Card>
  );
}

// ── Additional Info Card (read-only) ─────────────────────────────────────────

function AdditionalInfoCard({
  customer,
  serviceArea,
}: {
  customer: Customer;
  serviceArea?: string | null;
}) {
  const personalNotes = customer.personalNotes;
  const hasAny =
    customer.companyName ||
    (customer as any).clientType ||
    serviceArea ||
    personalNotes;
  if (!hasAny) return null;
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Additional Info</CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-sm">
          {customer.companyName && (
            <div>
              <dt className="text-xs text-muted-foreground mb-0.5">Company</dt>
              <dd className="font-medium">{customer.companyName}</dd>
            </div>
          )}
          {(customer as any).clientType && (
            <div>
              <dt className="text-xs text-muted-foreground mb-0.5">Client Type</dt>
              <dd className="font-medium">{(customer as any).clientType}</dd>
            </div>
          )}
          {serviceArea && (
            <div>
              <dt className="text-xs text-muted-foreground mb-0.5">Service Area</dt>
              <dd className="font-medium">{serviceArea}</dd>
            </div>
          )}
          {personalNotes && (
            <div className="sm:col-span-2">
              <dt className="text-xs text-muted-foreground mb-0.5">Notes</dt>
              <dd className="text-foreground whitespace-pre-wrap leading-relaxed">{personalNotes}</dd>
            </div>
          )}
        </dl>
      </CardContent>
    </Card>
  );
}

// ── Edit Client dialog (companyName / clientType / personalNotes only) ───────

type ClientInfoPatch = {
  companyName: string | null;
  clientType: string | null;
  personalNotes: string | null;
};

function EditClientDialog({
  open,
  onClose,
  customer,
  onSave,
  saving,
}: {
  open: boolean;
  onClose: () => void;
  customer: Customer;
  onSave: (patch: ClientInfoPatch) => void;
  saving: boolean;
}) {
  const [form, setForm] = useState<ClientInfoPatch>({
    companyName: customer.companyName ?? null,
    clientType: (customer as any).clientType ?? null,
    personalNotes: customer.personalNotes ?? null,
  });

  // Reset form whenever the dialog (re-)opens with a (potentially) different customer.
  useEffect(() => {
    if (open) {
      setForm({
        companyName: customer.companyName ?? null,
        clientType: (customer as any).clientType ?? null,
        personalNotes: customer.personalNotes ?? null,
      });
    }
  }, [open, customer]);

  const setStr = (k: keyof ClientInfoPatch) => (v: string) =>
    setForm((p) => ({ ...p, [k]: v.trim() === "" ? null : v }));

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit client</DialogTitle>
          <DialogDescription>
            Company name, type, and notes. Contact details are managed on each contact card.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Company / organization name</Label>
            <Input
              value={form.companyName ?? ""}
              onChange={(e) => setStr("companyName")(e.target.value)}
              placeholder="Leave blank for residential clients"
              className="text-base md:text-sm"
              data-testid="input-edit-company-name"
            />
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Client type</Label>
            <Select
              value={form.clientType ?? ""}
              onValueChange={(v) =>
                setForm((p) => ({ ...p, clientType: v === "" ? null : v }))
              }
            >
              <SelectTrigger data-testid="select-edit-client-type">
                <SelectValue placeholder="Select a type…" />
              </SelectTrigger>
              <SelectContent>
                {CLIENT_TYPES.map((t) => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Notes</Label>
            <Textarea
              rows={3}
              value={form.personalNotes ?? ""}
              onChange={(e) => setStr("personalNotes")(e.target.value)}
              placeholder="Anything worth remembering about this client…"
              className="text-base md:text-sm"
              data-testid="input-edit-personal-notes"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button onClick={() => onSave(form)} disabled={saving} data-testid="button-save-client">
            {saving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface NewPianoFormState {
  make: string; model: string; pianoType: string; year: string;
  serialNumber: string; location: string; notes: string; lastTuned: string; size: string;
}

const BLANK_PIANO: NewPianoFormState = {
  make: "", model: "", pianoType: "", year: "", serialNumber: "",
  location: "", notes: "", lastTuned: "", size: "",
};

// ── Main Page ─────────────────────────────────────────────────────────────────

type HubTab = "pianos" | "history" | "appointments" | "estimates" | "invoices";
const HUB_TABS: { key: HubTab; label: string }[] = [
  { key: "pianos", label: "Pianos" },
  { key: "history", label: "History" },
  { key: "appointments", label: "Appointments" },
  { key: "estimates", label: "Estimates" },
  { key: "invoices", label: "Invoices" },
];

export default function CustomerDetail() {
  const [, params] = useRoute("/customers/:id");
  const [, navigate] = useLocation();
  const rawSearch = useSearch();
  const { toast } = useToast();
  const customerId = params?.id;

  // Active tab lives in the URL (?tab=…) so back/forward navigation and
  // page refreshes keep your place.
  const searchParams = new URLSearchParams(rawSearch);
  const tabParam = searchParams.get("tab") as HubTab | null;
  const activeTab: HubTab = HUB_TABS.some((t) => t.key === tabParam!)
    ? (tabParam as HubTab)
    : "pianos";

  function setActiveTab(tab: string) {
    const p = new URLSearchParams(rawSearch);
    if (tab === "pianos") p.delete("tab");
    else p.set("tab", tab);
    const qs = p.toString();
    navigate(`/customers/${customerId}${qs ? `?${qs}` : ""}`, { replace: true });
  }

  // UI state
  const [editClientOpen, setEditClientOpen] = useState(false);
  const [showAddPiano, setShowAddPiano] = useState(false);
  const [newPianoForm, setNewPianoForm] = useState<NewPianoFormState>(BLANK_PIANO);
  const [showAppointmentDialog, setShowAppointmentDialog] = useState(false);

  // Lazy migration guard — only attempt once per page load
  const [migrationAttempted, setMigrationAttempted] = useState(false);

  // ── Queries ──────────────────────────────────────────────────────────────────

  const { data: customer, isLoading } = useQuery<Customer>({
    queryKey: ["/api/customers", customerId],
    enabled: !!customerId,
  });

  const { data: customerPianos } = useQuery<Piano[]>({
    queryKey: ["/api/customers", customerId, "pianos"],
    enabled: !!customerId,
  });

  const { data: contacts } = useQuery<CustomerContact[]>({
    queryKey: ["/api/customers", customerId, "contacts"],
    enabled: !!customerId,
  });

  const { data: appointments } = useQuery<Appointment[]>({
    queryKey: ["/api/customers", customerId, "appointments"],
    enabled: !!customerId,
  });

  const { data: serviceRecords } = useQuery<ServiceRecord[]>({
    queryKey: ["/api/customers", customerId, "services"],
    enabled: !!customerId,
  });

  const { data: invoices } = useQuery<Invoice[]>({
    queryKey: ["/api/customers", customerId, "invoices"],
    enabled: !!customerId,
  });

  const { data: inspections } = useQuery<Inspection[]>({
    queryKey: ["/api/customers", customerId, "inspections"],
    enabled: !!customerId,
  });

  // ── Mutations ────────────────────────────────────────────────────────────────

  const updateClientMutation = useMutation({
    mutationFn: (data: ClientInfoPatch) =>
      apiRequest("PATCH", `/api/customers/${customerId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId] });
      setEditClientOpen(false);
      toast({ title: "Client updated" });
    },
    onError: () => toast({ title: "Failed to update client", variant: "destructive" }),
  });

  const markContactedMutation = useMutation({
    mutationFn: (date: string) => apiRequest("PATCH", `/api/customers/${customerId}`, { lastContacted: date }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId] });
      toast({ title: "Last contacted date updated" });
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const toggleStarMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/customers/${customerId}`, { isStarred: !customer?.isStarred }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId] });
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/customers/${customerId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      navigate("/customers");
      toast({ title: "Client deleted" });
    },
    onError: () => toast({ title: "Failed to delete client", variant: "destructive" }),
  });

  const addPianoMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", `/api/customers/${customerId}/pianos`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "pianos"] });
      setShowAddPiano(false);
      setNewPianoForm(BLANK_PIANO);
      toast({ title: "Piano added" });
    },
    onError: () => toast({ title: "Failed to add piano", variant: "destructive" }),
  });

  // Lazy migration: silently create the first Contact from legacy customer fields
  // when (a) contacts have loaded and are empty, and (b) the customer still has
  // legacy phone/email/address values on it.
  const lazyMigrateMutation = useMutation({
    mutationFn: async (cust: Customer) => {
      const patch = {
        firstName: cust.firstName?.trim() || "Primary",
        lastName: cust.lastName?.trim() || "",
        role: null,
        isPrimary: true,
        isBilling: true,
        doNotCall: false,
        phone: cust.phone ?? null,
        email: cust.email ?? null,
        address: cust.address ?? null,
        city: cust.city ?? null,
        state: cust.state ?? null,
        zipCode: cust.zipCode ?? null,
        notes: null,
      };
      const res = await apiRequest("POST", `/api/customers/${customerId}/contacts`, patch);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["/api/customers", customerId, "contacts"],
      });
    },
  });

  useEffect(() => {
    if (migrationAttempted) return;
    if (!customer || !contacts) return;
    // Only migrate if the contacts list has finished loading and is empty,
    // and the legacy customer record actually has something to copy.
    const hasLegacyContactData =
      !!(customer.phone || customer.email || customer.address);
    if (contacts.length === 0 && hasLegacyContactData) {
      setMigrationAttempted(true);
      lazyMigrateMutation.mutate(customer);
    } else {
      // Nothing to migrate — still mark attempted to avoid re-checking on every render.
      setMigrationAttempted(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customer, contacts, migrationAttempted]);

  // ── Loading / not found ───────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-4">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-10 w-56" />
        <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
          <div className="space-y-4">
            <Skeleton className="h-48" />
            <Skeleton className="h-36" />
          </div>
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto text-center py-20">
        <h2 className="text-lg font-semibold">Client not found</h2>
        <Link href="/customers">
          <Button variant="ghost" className="mt-4">
            <ChevronRight className="h-4 w-4 mr-2 rotate-180" /> Back to Clients
          </Button>
        </Link>
      </div>
    );
  }

  // ── Derived display data ────────────────────────────────────────────────────
  const sortedContacts = [...(contacts ?? [])].sort((a, b) => {
    if (!!a.isPrimary !== !!b.isPrimary) return a.isPrimary ? -1 : 1;
    if (!!a.isBilling !== !!b.isBilling) return a.isBilling ? -1 : 1;
    return a.id - b.id;
  });
  const primaryContact = sortedContacts.find((c) => c.isPrimary) ?? sortedContacts[0] ?? null;

  // Header title rules:
  //  - companyName set → title = company, subtitle = primary contact's full name
  //  - no companyName  → title = primary contact's full name (no subtitle)
  //  - no contacts yet (pre-migration) → fall back to customer first+last
  const primaryFullName = primaryContact
    ? `${primaryContact.firstName ?? ""}${primaryContact.lastName ? " " + primaryContact.lastName : ""}`.trim()
    : `${customer.firstName} ${customer.lastName}`.trim();

  const title = customer.companyName?.trim()
    ? customer.companyName
    : primaryFullName || "(Unnamed client)";
  const subtitle = customer.companyName?.trim() ? primaryFullName : null;

  // Location line: city/state/zip from primary contact (fall back to customer record).
  const loc = primaryContact ?? customer;
  const cityLine = [
    (loc as any).city,
    (loc as any).state,
    (loc as any).zipCode,
  ].filter(Boolean).join(", ");

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto">

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-4">
        <Link href="/customers">
          <span className="hover:text-foreground cursor-pointer" data-testid="link-back-to-clients">Clients</span>
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        <span className="text-foreground font-medium truncate">{title}</span>
      </nav>

      {/* ── Header ── */}
      <div className="flex items-start justify-between gap-4 mb-6 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-customer-name">
              {title}
            </h1>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setEditClientOpen(true)}
              title="Edit client"
              data-testid="button-edit-client"
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7"
              onClick={() => toggleStarMutation.mutate()}
              disabled={toggleStarMutation.isPending}
              data-testid="button-toggle-star">
              <Star className={cn("h-4 w-4", customer.isStarred ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground")} />
            </Button>
          </div>
          {subtitle && (
            <p className="text-sm text-foreground/80 mt-0.5" data-testid="text-subtitle">{subtitle}</p>
          )}
          {cityLine && (
            <p className="text-sm text-muted-foreground mt-0.5" data-testid="text-city-line">{cityLine}</p>
          )}
          {(customer as any).clientType && (
            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
              <Badge variant="secondary" className="text-xs">{(customer as any).clientType}</Badge>
            </div>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            className="h-9"
            onClick={() => setShowAppointmentDialog(true)}
            data-testid="button-schedule-appointment"
          >
            <Calendar className="h-3.5 w-3.5 mr-1.5" /> Schedule
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-9 w-9" data-testid="button-more">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => {
                  if (confirm("Delete this client and all their pianos?")) deleteMutation.mutate();
                }}
                data-testid="button-delete"
              >
                <Trash2 className="h-4 w-4 mr-2" /> Delete Client
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Body: contacts on top, then tabbed sections ── */}
      <div className="space-y-4 min-w-0">

        {/* Contacts */}
        <ContactManager customerId={customer.id} contacts={sortedContacts} />

        {/* Tabbed hub: Pianos / History / Appointments / Estimates / Invoices */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <div className="overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0">
            <TabsList className="w-full sm:w-auto justify-start" data-testid="customer-hub-tabs">
              {HUB_TABS.map(({ key, label }) => {
                const count =
                  key === "pianos" ? customerPianos?.length
                  : key === "invoices" ? invoices?.length
                  : key === "estimates" ? inspections?.length
                  : key === "appointments"
                  ? appointments?.filter((a) => (a.status ?? "scheduled") === "scheduled").length
                  : undefined;
                return (
                  <TabsTrigger
                    key={key}
                    value={key}
                    className="text-xs sm:text-sm"
                    data-testid={`tab-${key}`}
                  >
                    {label}
                    {count !== undefined && count > 0 && (
                      <span className="ml-1.5 text-[10px] font-semibold text-muted-foreground tabular-nums">
                        {count}
                      </span>
                    )}
                  </TabsTrigger>
                );
              })}
            </TabsList>
          </div>

          <TabsContent value="pianos" className="mt-3">
            <PianosInventoryCard
              pianos={customerPianos}
              onAddPiano={() => setShowAddPiano((v) => !v)}
              showAddForm={showAddPiano}
              newPianoForm={newPianoForm}
              setNewPianoForm={setNewPianoForm}
              onSave={() => addPianoMutation.mutate(newPianoForm)}
              onCancel={() => setShowAddPiano(false)}
              isSaving={addPianoMutation.isPending}
            />
          </TabsContent>

          <TabsContent value="history" className="mt-3">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold">Service History</CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <ServiceTimeline
                  appointments={appointments ?? []}
                  serviceRecords={serviceRecords ?? []}
                  pianos={customerPianos ?? []}
                  mode="past"
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="appointments" className="mt-3">
            <Card>
              <CardHeader className="pb-3">
                <SectionHeader
                  title="Upcoming Appointments"
                  action={
                    <Button size="sm" variant="outline" className="h-7 text-xs"
                      onClick={() => setShowAppointmentDialog(true)}
                      data-testid="button-schedule-from-tab">
                      <Plus className="h-3 w-3 mr-1" /> Schedule
                    </Button>
                  }
                />
              </CardHeader>
              <CardContent className="pt-0">
                <ServiceTimeline
                  appointments={appointments ?? []}
                  serviceRecords={serviceRecords ?? []}
                  pianos={customerPianos ?? []}
                  mode="upcoming"
                />
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="estimates" className="mt-3">
            <CustomerEstimatesList inspections={inspections} />
          </TabsContent>

          <TabsContent value="invoices" className="mt-3">
            <CustomerInvoicesList invoices={invoices} customerId={customer.id} />
          </TabsContent>
        </Tabs>

        {/* Additional Info (read-only) */}
        <AdditionalInfoCard customer={customer} />

        {/* Last contacted row */}
        <Card>
          <CardContent className="py-3 px-4">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <PhoneCall className="h-3.5 w-3.5 shrink-0" />
                <span>Last contacted:</span>
                <span className="font-medium text-foreground" data-testid="text-last-contacted">
                  {(customer as any).lastContacted || customer.lastTuned || "Never"}
                </span>
              </div>
              <div className="flex items-center gap-2 ml-auto flex-wrap">
                <Button variant="outline" size="sm" className="h-7 text-xs"
                  onClick={() => markContactedMutation.mutate(todayStr())}
                  disabled={markContactedMutation.isPending}
                  data-testid="button-mark-contacted-today">
                  <CheckCircle className="h-3 w-3 mr-1" /> Today
                </Button>
                <Input
                  type="text"
                  placeholder="M/D/YY"
                  className="h-7 text-xs w-20 px-1.5"
                  data-testid="input-last-contacted-date"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      const val = (e.target as HTMLInputElement).value.trim();
                      if (val) {
                        markContactedMutation.mutate(val);
                        (e.target as HTMLInputElement).value = "";
                      }
                    }
                  }}
                />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Dialogs */}
      <AppointmentDialog
        open={showAppointmentDialog}
        onOpenChange={setShowAppointmentDialog}
        customerId={customer.id}
        customerName={`${customer.firstName} ${customer.lastName}`}
      />

      <EditClientDialog
        open={editClientOpen}
        onClose={() => setEditClientOpen(false)}
        customer={customer}
        onSave={(patch) => updateClientMutation.mutate(patch)}
        saving={updateClientMutation.isPending}
      />
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function todayStr() {
  const now = new Date();
  return `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear().toString().slice(-2)}`;
}
