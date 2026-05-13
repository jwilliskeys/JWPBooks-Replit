import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation, Link } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Music,
  Edit,
  Trash2,
  Plus,
  FileText,
  ImagePlus,
  X,
  Calendar,
  Clock,
  MoreHorizontal,
  Wrench,
  Phone,
  MapPin,
  Mail,
  ChevronRight,
  Tag,
  ChevronLeft,
  CheckCircle2,
  Circle,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatPhone } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { Piano, Customer, ServiceRecord, Invoice, Appointment } from "@shared/schema";
import { AppointmentDetailDialog } from "@/components/appointment-detail-dialog";
import { AppointmentDialog } from "@/components/appointment-dialog";

// ─── helpers ────────────────────────────────────────────────────────────────

function parseDate(s: string | null | undefined): Date | null {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  const parts = s.split("/");
  if (parts.length !== 3) return null;
  let yr = parseInt(parts[2]);
  if (yr < 100) yr += 2000;
  const d = new Date(yr, parseInt(parts[0]) - 1, parseInt(parts[1]));
  return isNaN(d.getTime()) ? null : d;
}

function monthsDiff(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

function getMonthsSince(s: string | null | undefined): number | null {
  const d = parseDate(s);
  if (!d) return null;
  return monthsDiff(d, new Date());
}

function relativeLabel(d: Date): string {
  const diff = monthsDiff(new Date(), d);
  const absDiff = Math.abs(diff);
  if (absDiff === 0) return "— This month";
  if (diff > 0) return `— in ${diff} month${diff !== 1 ? "s" : ""}`;
  return `— ${absDiff} month${absDiff !== 1 ? "s" : ""} ago`;
}

function parseIntervalMonths(interval: string | null | undefined): number | null {
  if (!interval) return null;
  const m = interval.match(/(\d+)/);
  return m ? parseInt(m[1]) : null;
}

function calcNextTuningDue(lastTuned: string | null | undefined, interval: string | null | undefined): Date | null {
  const d = parseDate(lastTuned);
  const months = parseIntervalMonths(interval);
  if (!d || !months) return null;
  const next = new Date(d);
  next.setMonth(next.getMonth() + months);
  return next;
}

function formatDateShort(d: Date): string {
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function parseSortTs(s: string | null | undefined): number {
  const d = parseDate(s);
  return d ? d.getTime() : 0;
}

function getYearLabel(s: string): string {
  if (!s) return "Unknown";
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 4);
  const p = s.split("/");
  if (p.length !== 3) return "Unknown";
  let yr = parseInt(p[2]);
  if (yr < 100) yr += 2000;
  return String(yr);
}

function tuningStatusClass(months: number | null): { label: string; cls: string } {
  if (months === null) return { label: "Never", cls: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300" };
  if (months >= 24) return { label: "Overdue", cls: "bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300" };
  if (months >= 12) return { label: "Due Soon", cls: "bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300" };
  return { label: "Current", cls: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300" };
}

// ─── types ───────────────────────────────────────────────────────────────────

type TimelineEntry =
  | { kind: "service"; date: string; sortTs: number; record: ServiceRecord }
  | { kind: "invoice"; date: string; sortTs: number; invoice: Invoice }
  | { kind: "appointment"; date: string; sortTs: number; appointment: Appointment };

function buildTimeline(services: ServiceRecord[], invoices: Invoice[], appointments: Appointment[]): TimelineEntry[] {
  return [
    ...services.map((r): TimelineEntry => ({ kind: "service", date: r.serviceDate, sortTs: parseSortTs(r.serviceDate), record: r })),
    ...invoices.map((inv): TimelineEntry => ({ kind: "invoice", date: inv.invoiceDate, sortTs: parseSortTs(inv.invoiceDate), invoice: inv })),
    ...appointments.map((a): TimelineEntry => ({ kind: "appointment", date: a.date, sortTs: parseSortTs(a.date), appointment: a })),
  ].sort((a, b) => b.sortTs - a.sortTs);
}

const INTERVAL_OPTIONS = ["3 months", "6 months", "12 months", "18 months", "24 months"];
const PIANO_TYPES = ["Grand", "Upright", "Unknown"] as const;

// ─── component ───────────────────────────────────────────────────────────────

export default function PianoDetail() {
  const [, params] = useRoute("/pianos/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const pianoId = params?.id;

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Piano>>({});

  const [showServiceDialog, setShowServiceDialog] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<number | null>(null);
  const [serviceForm, setServiceForm] = useState({ serviceDate: "", serviceType: "tuning", notes: "", cost: "" });

  const [showAppointmentDialog, setShowAppointmentDialog] = useState(false);
  const [detailAppt, setDetailAppt] = useState<Appointment | null>(null);

  const [editingLastTuned, setEditingLastTuned] = useState(false);
  const [lastTunedValue, setLastTunedValue] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── queries ──
  const { data: pianoData, isLoading } = useQuery<{ piano: Piano; customer: Customer }>({
    queryKey: ["/api/pianos", pianoId],
    enabled: !!pianoId,
  });
  const { data: serviceRecords } = useQuery<ServiceRecord[]>({
    queryKey: ["/api/pianos", pianoId, "services"],
    enabled: !!pianoId,
  });
  const { data: pianoInvoices } = useQuery<Invoice[]>({
    queryKey: ["/api/pianos", pianoId, "invoices"],
    enabled: !!pianoId,
  });
  const { data: pianoAppointments } = useQuery<Appointment[]>({
    queryKey: ["/api/pianos", pianoId, "appointments"],
    enabled: !!pianoId,
  });

  const piano = pianoData?.piano;
  const customer = pianoData?.customer;

  const invalidateAll = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/pianos", pianoId] });
    queryClient.invalidateQueries({ queryKey: ["/api/pianos", pianoId, "services"] });
    queryClient.invalidateQueries({ queryKey: ["/api/pianos", pianoId, "invoices"] });
    queryClient.invalidateQueries({ queryKey: ["/api/pianos", pianoId, "appointments"] });
    if (piano) queryClient.invalidateQueries({ queryKey: ["/api/customers", String(piano.customerId), "pianos"] });
    queryClient.invalidateQueries({ queryKey: ["/api/pianos"] });
    queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
  };

  // ── mutations ──
  const updatePiano = useMutation({
    mutationFn: (data: Partial<Piano>) => apiRequest("PATCH", `/api/pianos/${pianoId}`, data),
    onSuccess: () => { invalidateAll(); setIsEditing(false); setEditingLastTuned(false); toast({ title: "Piano updated" }); },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const deletePiano = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/pianos/${pianoId}`),
    onSuccess: () => {
      navigate("/pianos");
      queryClient.invalidateQueries({ queryKey: ["/api/pianos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({ title: "Piano deleted" });
    },
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const toggleActive = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/pianos/${pianoId}`, { isActive: !piano?.isActive }),
    onSuccess: () => { invalidateAll(); toast({ title: piano?.isActive ? "Marked inactive" : "Marked active" }); },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const uploadPhotos = useMutation({
    mutationFn: async (files: FileList) => {
      const fd = new FormData();
      Array.from(files).forEach((f) => fd.append("photos", f));
      const res = await fetch(`/api/pianos/${pianoId}/photos`, { method: "POST", body: fd });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: () => { invalidateAll(); toast({ title: "Photos uploaded" }); },
    onError: () => toast({ title: "Upload failed", variant: "destructive" }),
  });

  const deletePhoto = useMutation({
    mutationFn: (url: string) => apiRequest("DELETE", `/api/pianos/${pianoId}/photos`, { photoUrl: url }),
    onSuccess: () => { invalidateAll(); toast({ title: "Photo removed" }); },
  });

  const addService = useMutation({
    mutationFn: (data: typeof serviceForm) => apiRequest("POST", `/api/pianos/${pianoId}/services`, data),
    onSuccess: () => {
      invalidateAll();
      setShowServiceDialog(false);
      setEditingServiceId(null);
      toast({ title: "Service record added" });
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const updateService = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof serviceForm }) =>
      apiRequest("PATCH", `/api/services/${id}`, data),
    onSuccess: () => {
      invalidateAll();
      setShowServiceDialog(false);
      setEditingServiceId(null);
      toast({ title: "Service record updated" });
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const deleteService = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/services/${id}`),
    onSuccess: () => { invalidateAll(); toast({ title: "Service record deleted" }); },
  });

  // ── loading / not found ──
  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-4">
        <Skeleton className="h-6 w-48" />
        <div className="grid lg:grid-cols-[2fr_3fr] gap-6">
          <div className="space-y-4">
            <Skeleton className="h-40 w-full" />
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-28 w-full" />
          </div>
          <Skeleton className="h-96 w-full" />
        </div>
      </div>
    );
  }

  if (!piano || !customer) {
    return (
      <div className="p-4 sm:p-6 text-center py-24">
        <p className="text-muted-foreground mb-4">Piano not found</p>
        <Button variant="ghost" onClick={() => navigate("/pianos")} data-testid="button-back">
          <ChevronLeft className="h-4 w-4 mr-1" /> Back to Pianos
        </Button>
      </div>
    );
  }

  // ── computed ──
  const isInactive = piano.isActive === false;
  const pianoLabel = [piano.year, piano.make, piano.model].filter(Boolean).join(" ") || "Unnamed Piano";
  const monthsSince = getMonthsSince(piano.lastTuned);
  const { label: statusLabel, cls: statusCls } = tuningStatusClass(monthsSince);
  const nextDue = calcNextTuningDue(piano.lastTuned, piano.tuningInterval);
  const nowTs = Date.now();
  const timeline = buildTimeline(serviceRecords ?? [], pianoInvoices ?? [], pianoAppointments ?? []);
  const futureEntries = timeline.filter((e) => e.sortTs > nowTs);
  const pastEntries = timeline.filter((e) => e.sortTs <= nowTs);

  // ── handlers ──
  const openAddService = () => {
    setServiceForm({
      serviceDate: new Date().toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" }),
      serviceType: "tuning",
      notes: "",
      cost: "",
    });
    setEditingServiceId(null);
    setShowServiceDialog(true);
  };

  const openEditService = (r: ServiceRecord) => {
    setServiceForm({ serviceDate: r.serviceDate, serviceType: r.serviceType, notes: r.notes || "", cost: r.cost || "" });
    setEditingServiceId(r.id);
    setShowServiceDialog(true);
  };

  const handleServiceSubmit = () => {
    if (editingServiceId) updateService.mutate({ id: editingServiceId, data: serviceForm });
    else addService.mutate(serviceForm);
  };

  const openEdit = () => {
    setEditForm({
      make: piano.make,
      model: piano.model,
      pianoType: piano.pianoType,
      year: piano.year,
      serialNumber: piano.serialNumber,
      location: piano.location,
      lastTuned: piano.lastTuned,
      tuningInterval: piano.tuningInterval,
      tags: piano.tags ?? [],
      notes: piano.notes,
      caseColor: piano.caseColor,
      caseFinish: piano.caseFinish,
      size: piano.size,
      useType: piano.useType,
      onConsignment: piano.onConsignment ?? false,
      hasIvory: piano.hasIvory ?? false,
      needsRepair: piano.needsRepair ?? false,
      totalLoss: piano.totalLoss ?? false,
      playerInstalled: piano.playerInstalled ?? false,
      pianoLifeSaver: piano.pianoLifeSaver ?? false,
      rentalPiano: piano.rentalPiano ?? false,
    });
    setIsEditing(true);
  };

  // ── badge helpers ──
  const apptStatusBadge = (status: string | null | undefined) => {
    const s = status ?? "scheduled";
    if (s === "completed") return <Badge variant="secondary" className="text-[10px]">Completed</Badge>;
    if (s === "no-show") return <Badge className="text-[10px] bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400 border-0">No-show</Badge>;
    if (s === "cancelled") return <Badge className="text-[10px] bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400 border-0">Cancelled</Badge>;
    return <Badge className="text-[10px]">Scheduled</Badge>;
  };

  const invoiceBadge = (status: string | null | undefined) => {
    const s = status ?? "draft";
    if (s === "paid") return <Badge className="text-[10px] bg-emerald-600 text-white border-0">Paid</Badge>;
    if (s === "open") return <Badge className="text-[10px]">Open</Badge>;
    if (s === "cancelled") return <Badge variant="secondary" className="text-[10px]">Cancelled</Badge>;
    return <Badge variant="secondary" className="text-[10px]">Draft</Badge>;
  };

  // ── detail row helper ──
  const DetailRow = ({ label, value }: { label: string; value?: string | null }) =>
    value ? (
      <div className="flex justify-between py-1.5 border-b last:border-0 text-sm">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-medium">{value}</span>
      </div>
    ) : null;

  const BoolRow = ({ label, value }: { label: string; value?: boolean | null }) => (
    <div className="flex justify-between py-1.5 border-b last:border-0 text-sm">
      <span className="text-muted-foreground">{label}</span>
      <span className={value ? "font-medium text-foreground" : "text-muted-foreground"}>{value ? "Yes" : "No"}</span>
    </div>
  );

  // ── timeline entry renderers ──
  let lastYearLabel = "";

  const renderEntry = (entry: TimelineEntry) => {
    const yearLabel = getYearLabel(entry.date);
    const showYear = yearLabel !== lastYearLabel;
    lastYearLabel = yearLabel;

    if (entry.kind === "service") {
      const r = entry.record;
      return (
        <div key={`s-${r.id}`}>
          {showYear && <p className="text-xs font-semibold text-muted-foreground pt-3 pb-1 px-1">{yearLabel}</p>}
          <div
            className="rounded-lg border bg-card hover:bg-muted/40 transition-colors cursor-pointer mb-2"
            onClick={() => openEditService(r)}
            data-testid={`timeline-service-${r.id}`}
          >
            <div className="p-3 flex gap-3 items-start">
              <div className="h-8 w-8 shrink-0 rounded-md bg-blue-50 dark:bg-blue-950 flex items-center justify-center">
                <Wrench className="h-4 w-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold uppercase tracking-wide text-blue-700 dark:text-blue-400">Service History</span>
                </div>
                {r.notes && <p className="text-sm mt-0.5 whitespace-pre-line">{r.notes}</p>}
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                  <span className="capitalize">{r.serviceType}</span>
                  {r.cost && <span className="font-medium text-foreground">{r.cost}</span>}
                  <span>{r.serviceDate}</span>
                </div>
              </div>
              <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                onClick={(e) => { e.stopPropagation(); if (confirm("Delete this record?")) deleteService.mutate(r.id); }}
                data-testid={`button-delete-service-${r.id}`}>
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      );
    }

    if (entry.kind === "invoice") {
      const inv = entry.invoice;
      return (
        <div key={`i-${inv.id}`}>
          {showYear && <p className="text-xs font-semibold text-muted-foreground pt-3 pb-1 px-1">{yearLabel}</p>}
          <Link href={`/invoices/${inv.id}`}>
            <div className="rounded-lg border bg-card hover:bg-muted/40 transition-colors cursor-pointer mb-2" data-testid={`timeline-invoice-${inv.id}`}>
              <div className="p-3 flex gap-3 items-start">
                <div className="h-8 w-8 shrink-0 rounded-md bg-violet-50 dark:bg-violet-950 flex items-center justify-center">
                  <FileText className="h-4 w-4 text-violet-600 dark:text-violet-400" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-bold uppercase tracking-wide text-violet-700 dark:text-violet-400">Invoice #{inv.invoiceNumber}</span>
                    {invoiceBadge(inv.status)}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                    {inv.total && inv.total !== "$0.00" && <span className="font-medium text-foreground">{inv.total}</span>}
                    <span>Invoice date: {inv.invoiceDate}</span>
                    {inv.dueDate && <span>Due: {inv.dueDate}</span>}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
              </div>
            </div>
          </Link>
        </div>
      );
    }

    if (entry.kind === "appointment") {
      const appt = entry.appointment;
      const isCompleted = appt.status === "completed";
      return (
        <div key={`a-${appt.id}`}>
          {showYear && <p className="text-xs font-semibold text-muted-foreground pt-3 pb-1 px-1">{yearLabel}</p>}
          <div
            className={`rounded-lg border bg-card hover:bg-muted/40 transition-colors cursor-pointer mb-2 ${isCompleted ? "opacity-55" : ""}`}
            onClick={() => setDetailAppt(appt)}
            data-testid={`timeline-appointment-${appt.id}`}
          >
            <div className="p-3 flex gap-3 items-start">
              <div className="h-8 w-8 shrink-0 rounded-md bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center">
                <Calendar className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-400">Appointment</span>
                  {apptStatusBadge(appt.status)}
                </div>
                {appt.servicesRequested && <p className="text-sm mt-0.5">{appt.servicesRequested}</p>}
                <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground flex-wrap">
                  <span>{appt.date}</span>
                  {appt.time && <span className="flex items-center gap-0.5"><Clock className="h-3 w-3" />{appt.time}</span>}
                  {appt.priceEstimate && <span className="font-medium text-foreground">{appt.priceEstimate}</span>}
                </div>
              </div>
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
            </div>
          </div>
        </div>
      );
    }
    return null;
  };

  // ─── render ────────────────────────────────────────────────────────────────
  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto">

      {/* ── Top bar: breadcrumb + actions ── */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <nav className="flex items-center gap-1.5 text-sm min-w-0 flex-1">
          <Link href="/pianos" className="text-muted-foreground hover:text-foreground flex items-center gap-1" data-testid="link-back-pianos">
            <Music className="h-3.5 w-3.5 shrink-0" />
            <span>Pianos</span>
          </Link>
          <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="font-medium truncate">{pianoLabel}</span>
        </nav>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 shrink-0">
          <Button variant="outline" size="sm" className="h-8 text-xs gap-1" onClick={openEdit} data-testid="button-edit-piano">
            <Edit className="h-3.5 w-3.5" /> Edit
          </Button>
          <Button
            variant="outline" size="sm" className="h-8 text-xs gap-1"
            onClick={() => navigate(`/invoices/new?pianoId=${piano.id}&customerId=${customer.id}`)}
            data-testid="button-invoice-piano"
          >
            <FileText className="h-3.5 w-3.5" /> Invoice
          </Button>

          {/* Status */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1" data-testid="button-status">
                <span className={`inline-block h-1.5 w-1.5 rounded-full ${isInactive ? "bg-gray-400" : "bg-emerald-500"}`} />
                {isInactive ? "Inactive" : "Active"}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-36">
              <DropdownMenuItem onClick={() => !isInactive || toggleActive.mutate()} data-testid="menuitem-set-active">
                <CheckCircle2 className={`h-4 w-4 mr-2 ${!isInactive ? "text-emerald-600" : "text-muted-foreground"}`} />
                Active
                {!isInactive && <span className="ml-auto text-emerald-600 text-xs">✓</span>}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => isInactive || toggleActive.mutate()} data-testid="menuitem-set-inactive">
                <Circle className={`h-4 w-4 mr-2 ${isInactive ? "text-foreground" : "text-muted-foreground"}`} />
                Inactive
                {isInactive && <span className="ml-auto text-xs">✓</span>}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>

          {/* More */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 w-8 p-0" data-testid="button-more">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => setShowAppointmentDialog(true)} data-testid="menuitem-new-appt">
                <Calendar className="h-4 w-4 mr-2" /> New Appointment
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openAddService} data-testid="menuitem-log-service">
                <Wrench className="h-4 w-4 mr-2" /> Add Service History Note
              </DropdownMenuItem>
              <DropdownMenuItem onClick={openEdit} data-testid="menuitem-add-tag">
                <Tag className="h-4 w-4 mr-2" /> Add Tag
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => { if (confirm("Delete this piano and all its history?")) deletePiano.mutate(); }}
                data-testid="menuitem-delete-piano"
              >
                <Trash2 className="h-4 w-4 mr-2" /> Delete Piano
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* ── Two-column grid ── */}
      <div className="grid lg:grid-cols-[2fr_3fr] gap-5 items-start">

        {/* ══ LEFT PANEL ══════════════════════════════════════════════════ */}
        <div className="space-y-4">

          {/* Piano header */}
          <div className={`text-center pb-1 ${isInactive ? "opacity-70" : ""}`} data-testid="piano-hero-card">
            {/* Photo / icon */}
            <div className="flex justify-center mb-3">
              {piano.photos && piano.photos.length > 0 ? (
                <img src={piano.photos[0]} alt="Piano" className="h-28 w-28 object-cover rounded-xl border shadow-sm" data-testid="piano-hero-photo" />
              ) : (
                <div className="h-28 w-28 rounded-xl bg-primary/8 border flex items-center justify-center">
                  <Music className="h-12 w-12 text-primary/30" />
                </div>
              )}
            </div>
            <h1 className="text-xl font-bold" data-testid="piano-title">{pianoLabel}</h1>
            <Link href={`/customers/${customer.id}`} className="text-sm text-muted-foreground hover:text-foreground hover:underline" data-testid="link-customer">
              {customer.firstName} {customer.lastName}
            </Link>
            <div className="text-xs text-muted-foreground mt-1 space-y-0.5">
              {(piano.serialNumber || piano.location) && (
                <p>
                  {piano.serialNumber ? `Serial Number: ${piano.serialNumber}` : ""}
                  {piano.serialNumber && piano.location ? ", " : ""}
                  {piano.location ? `Location: ${piano.location}` : ""}
                </p>
              )}
              {nextDue && (
                <p className="text-xs">Next Tuning Scheduled: <span className="font-medium">{formatDateShort(nextDue)}</span></p>
              )}
            </div>
            {/* Tags */}
            <div className="flex flex-wrap justify-center gap-1 mt-2" data-testid="piano-tags">
              {(piano.tags ?? []).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs">{tag}</Badge>
              ))}
              <button
                onClick={openEdit}
                className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-muted-foreground/40 rounded px-1.5 py-0.5"
                data-testid="button-add-tag"
              >
                <Tag className="h-2.5 w-2.5" /> Add Tag
              </button>
            </div>
            {/* Status badge */}
            <div className="mt-2">
              {isInactive ? (
                <Badge variant="secondary" className="uppercase text-[10px] tracking-wide">Inactive</Badge>
              ) : (
                <Badge className={`uppercase text-[10px] tracking-wide border-0 ${statusCls}`}>{statusLabel}</Badge>
              )}
            </div>
          </div>

          {/* Tuning Schedule */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-semibold">Tuning Schedule</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-0">
              {/* Last tuned */}
              <div className="flex items-center justify-between py-2.5 border-b">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                    <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Last tuned</p>
                    {editingLastTuned ? (
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <Input
                          value={lastTunedValue}
                          onChange={(e) => setLastTunedValue(e.target.value)}
                          placeholder="M/D/YY"
                          className="h-6 text-xs w-24"
                          data-testid="input-last-tuned"
                          onKeyDown={(e) => {
                            if (e.key === "Enter") updatePiano.mutate({ lastTuned: lastTunedValue });
                            if (e.key === "Escape") setEditingLastTuned(false);
                          }}
                          autoFocus
                        />
                        <Button size="sm" className="h-6 text-xs px-2" onClick={() => updatePiano.mutate({ lastTuned: lastTunedValue })} data-testid="button-save-last-tuned">Save</Button>
                        <Button variant="ghost" size="sm" className="h-6 text-xs px-1" onClick={() => setEditingLastTuned(false)}>✕</Button>
                      </div>
                    ) : (
                      <p className="text-sm font-medium" data-testid="text-last-tuned">
                        {piano.lastTuned ? (
                          <>{piano.lastTuned} <span className="text-xs text-muted-foreground font-normal">{relativeLabel(parseDate(piano.lastTuned)!)}</span></>
                        ) : "No record"}
                      </p>
                    )}
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0"
                  onClick={() => { setLastTunedValue(piano.lastTuned || ""); setEditingLastTuned(true); }}
                  data-testid="button-edit-last-tuned">
                  <Edit className="h-3 w-3" />
                </Button>
              </div>

              {/* Tuning interval */}
              <div className="flex items-center justify-between py-2.5 border-b">
                <div className="flex items-center gap-2.5">
                  <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                    <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Tuning interval</p>
                    <p className="text-sm font-medium">{piano.tuningInterval || <span className="text-muted-foreground font-normal">Not set</span>}</p>
                  </div>
                </div>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" data-testid="button-edit-interval">
                      <Edit className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuLabel className="text-xs">Set interval</DropdownMenuLabel>
                    {INTERVAL_OPTIONS.map((opt) => (
                      <DropdownMenuItem key={opt} onClick={() => updatePiano.mutate({ tuningInterval: opt })}
                        className={piano.tuningInterval === opt ? "font-medium" : ""}
                        data-testid={`interval-${opt.replace(" ", "-")}`}>
                        {opt}
                        {piano.tuningInterval === opt && <span className="ml-auto text-xs">✓</span>}
                      </DropdownMenuItem>
                    ))}
                    {piano.tuningInterval && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem onClick={() => updatePiano.mutate({ tuningInterval: null })} className="text-destructive">
                          Clear
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {/* Next tuning due */}
              <div className="flex items-center gap-2.5 py-2.5">
                <div className="h-7 w-7 rounded-md bg-muted flex items-center justify-center shrink-0">
                  <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Next tuning due</p>
                  <p className="text-sm font-medium">
                    {nextDue ? (
                      <>{formatDateShort(nextDue)} <span className="text-xs text-muted-foreground font-normal">{relativeLabel(nextDue)}</span></>
                    ) : <span className="text-muted-foreground font-normal">—</span>}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Piano Details */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-semibold">Piano Details</CardTitle>
              <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={openEdit} data-testid="button-edit-details">
                <Edit className="h-3 w-3 mr-1" /> Edit
              </Button>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="divide-y text-sm">
                <DetailRow label="Case color" value={piano.caseColor} />
                <DetailRow label="Case finish" value={piano.caseFinish} />
                <DetailRow label="Size" value={piano.size} />
                <DetailRow label="Use type" value={piano.useType} />
                <BoolRow label="Player installed?" value={piano.playerInstalled} />
                <BoolRow label="Piano Life Saver?" value={piano.pianoLifeSaver} />
                <BoolRow label="Rental piano?" value={piano.rentalPiano} />
                <BoolRow label="On consignment?" value={piano.onConsignment} />
                <BoolRow label="Has ivory?" value={piano.hasIvory} />
                <BoolRow label="Needs repair?" value={piano.needsRepair} />
                <BoolRow label="Total loss?" value={piano.totalLoss} />
              </div>
              {piano.notes && (
                <div className="mt-3 pt-3 border-t">
                  <p className="text-xs text-muted-foreground mb-1">Notes</p>
                  <p className="text-sm whitespace-pre-wrap" data-testid="text-piano-notes">{piano.notes}</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Client */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold">Client</CardTitle>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <Link href={`/customers/${customer.id}`} className="flex items-center justify-between group" data-testid="link-customer-card">
                <div className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-full bg-primary/10 flex items-center justify-center shrink-0 text-sm font-bold text-primary/60">
                    {customer.firstName[0]}{customer.lastName[0]}
                  </div>
                  <div>
                    <p className="text-sm font-medium group-hover:underline">{customer.firstName} {customer.lastName}</p>
                    {customer.companyName && <p className="text-xs text-muted-foreground">{customer.companyName}</p>}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
              <div className="mt-3 space-y-1.5 pl-12">
                {customer.address && (
                  <div className="flex items-start gap-1.5 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 mt-0.5 shrink-0" />
                    <span>{customer.address}{customer.city ? `, ${customer.city}` : ""}{customer.state ? `, ${customer.state}` : ""}{customer.zipCode ? ` ${customer.zipCode}` : ""}</span>
                  </div>
                )}
                {customer.phone && (
                  <a href={`tel:${customer.phone}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                    <Phone className="h-3 w-3 shrink-0" />
                    <span>{formatPhone(customer.phone)}</span>
                  </a>
                )}
                {customer.email && (
                  <a href={`mailto:${customer.email}`} className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground">
                    <Mail className="h-3 w-3 shrink-0" />
                    <span>{customer.email}</span>
                  </a>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Photos */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4 flex flex-row items-center justify-between space-y-0">
              <CardTitle className="text-sm font-semibold">Photos</CardTitle>
              <div>
                <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
                  onChange={(e) => { if (e.target.files?.length) { uploadPhotos.mutate(e.target.files); e.target.value = ""; } }} />
                <Button variant="outline" size="sm" className="h-6 text-xs px-2" onClick={() => fileInputRef.current?.click()}
                  disabled={uploadPhotos.isPending} data-testid="button-add-photos">
                  <ImagePlus className="h-3 w-3 mr-1" /> {uploadPhotos.isPending ? "Uploading…" : "Add"}
                </Button>
              </div>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              {!piano.photos?.length ? (
                <p className="text-xs text-muted-foreground text-center py-3">No photos yet</p>
              ) : (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {piano.photos.map((photo, idx) => (
                    <div key={idx} className="relative shrink-0 group">
                      <img src={photo} alt={`Photo ${idx + 1}`} className="h-20 w-20 object-cover rounded-md border" data-testid={`piano-photo-${idx}`} />
                      <button onClick={() => deletePhoto.mutate(photo)}
                        className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full h-5 w-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                        data-testid={`button-remove-photo-${idx}`}>
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ══ RIGHT PANEL: Timeline ════════════════════════════════════════ */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-base font-semibold">Timeline</h2>
            <div className="flex items-center gap-1.5">
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={() => setShowAppointmentDialog(true)} data-testid="button-new-appt">
                <Plus className="h-3 w-3" /> Appointment
              </Button>
              <Button variant="outline" size="sm" className="h-7 text-xs gap-1" onClick={openAddService} data-testid="button-add-service">
                <Plus className="h-3 w-3" /> Service Note
              </Button>
            </div>
          </div>

          {timeline.length === 0 ? (
            <div className="rounded-lg border bg-card py-14 text-center">
              <Calendar className="h-8 w-8 mx-auto mb-2 text-muted-foreground/30" />
              <p className="text-sm text-muted-foreground">No activity yet</p>
            </div>
          ) : (
            <div>
              {/* Future entries */}
              {futureEntries.length > 0 && (
                <div>
                  <p className="text-sm font-semibold text-muted-foreground mb-2 px-1">Future</p>
                  {(() => { lastYearLabel = ""; return null; })()}
                  {[...futureEntries].reverse().map(renderEntry)}
                </div>
              )}
              {/* Past entries */}
              {pastEntries.length > 0 && (
                <div>
                  {(() => { lastYearLabel = ""; return null; })()}
                  {pastEntries.map(renderEntry)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ══ Edit Piano Dialog ════════════════════════════════════════════════ */}
      <Dialog open={isEditing} onOpenChange={(o) => { if (!o) setIsEditing(false); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Piano</DialogTitle>
          </DialogHeader>

          {/* Piano type visual selector */}
          <div className="grid grid-cols-3 gap-3 mt-1">
            {PIANO_TYPES.map((type) => {
              const normalized = (editForm.pianoType ?? "").toLowerCase();
              const active = normalized === type.toLowerCase() || (type === "Unknown" && !["grand", "upright"].some((t) => normalized.includes(t)) && normalized !== "");
              const isGrand = normalized.includes("grand") && type === "Grand";
              const isUpright = normalized.includes("upright") && type === "Upright";
              const isSelected = isGrand || isUpright || (type !== "Grand" && type !== "Upright" && active);
              const selected = editForm.pianoType?.toLowerCase() === type.toLowerCase() || (type === "Unknown" && !editForm.pianoType);
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setEditForm({ ...editForm, pianoType: type === "Unknown" ? "" : type })}
                  className={`rounded-xl border-2 p-4 flex flex-col items-center gap-2 transition-colors ${
                    (editForm.pianoType === type || (type === "Unknown" && !editForm.pianoType))
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-muted-foreground/40"
                  }`}
                  data-testid={`type-select-${type.toLowerCase()}`}
                >
                  <Music className={`h-8 w-8 ${
                    (editForm.pianoType === type || (type === "Unknown" && !editForm.pianoType))
                      ? "text-primary"
                      : "text-muted-foreground/50"
                  }`} />
                  <span className="text-sm font-medium">{type}</span>
                  {(editForm.pianoType === type || (type === "Unknown" && !editForm.pianoType)) && (
                    <CheckCircle2 className="h-4 w-4 text-primary absolute top-2 left-2" />
                  )}
                </button>
              );
            })}
          </div>

          {/* Core fields */}
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Make</Label>
              <Input value={editForm.make || ""} onChange={(e) => setEditForm({ ...editForm, make: e.target.value })} placeholder="Yamaha" data-testid="input-piano-make" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Model <span className="text-muted-foreground font-normal">optional</span></Label>
              <Input value={editForm.model || ""} onChange={(e) => setEditForm({ ...editForm, model: e.target.value })} placeholder="C3X" data-testid="input-piano-model" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Year <span className="text-muted-foreground font-normal">optional</span></Label>
              <Input value={editForm.year || ""} onChange={(e) => setEditForm({ ...editForm, year: e.target.value })} placeholder="2018" data-testid="input-piano-year" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Serial # <span className="text-muted-foreground font-normal">optional</span></Label>
              <Input value={editForm.serialNumber || ""} onChange={(e) => setEditForm({ ...editForm, serialNumber: e.target.value })} placeholder="e.g. J4115897" data-testid="input-piano-serial" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Location <span className="text-muted-foreground font-normal">optional</span></Label>
              <Input value={editForm.location || ""} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })} placeholder="e.g. Living Room" data-testid="input-piano-location" />
            </div>
          </div>

          {/* Tuning */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Last tuned (M/D/YY)</Label>
              <Input value={editForm.lastTuned || ""} onChange={(e) => setEditForm({ ...editForm, lastTuned: e.target.value })} placeholder="1/15/25" data-testid="input-piano-tuned" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tuning interval</Label>
              <Select value={editForm.tuningInterval || ""} onValueChange={(v) => setEditForm({ ...editForm, tuningInterval: v || undefined })}>
                <SelectTrigger data-testid="select-tuning-interval"><SelectValue placeholder="Select interval" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">Not set</SelectItem>
                  {INTERVAL_OPTIONS.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Case details */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Case color <span className="text-muted-foreground font-normal">optional</span></Label>
              <Input value={editForm.caseColor || ""} onChange={(e) => setEditForm({ ...editForm, caseColor: e.target.value })} placeholder="e.g. Ebony" data-testid="input-case-color" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Case finish <span className="text-muted-foreground font-normal">optional</span></Label>
              <Input value={editForm.caseFinish || ""} onChange={(e) => setEditForm({ ...editForm, caseFinish: e.target.value })} placeholder="e.g. Polished" data-testid="input-case-finish" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs">Size <span className="text-muted-foreground font-normal">optional</span></Label>
              <Input value={editForm.size || ""} onChange={(e) => setEditForm({ ...editForm, size: e.target.value })} placeholder='e.g. 5&apos;7"' data-testid="input-size" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Use type <span className="text-muted-foreground font-normal">optional</span></Label>
              <Input value={editForm.useType || ""} onChange={(e) => setEditForm({ ...editForm, useType: e.target.value })} placeholder="e.g. Institutional" data-testid="input-use-type" />
            </div>
          </div>

          {/* Boolean flags */}
          <div className="grid grid-cols-2 gap-x-6 gap-y-2.5 pt-1">
            {[
              { key: "playerInstalled" as const, label: "Player installed?" },
              { key: "pianoLifeSaver" as const, label: "Piano Life Saver installed?" },
              { key: "rentalPiano" as const, label: "Rental piano?" },
              { key: "onConsignment" as const, label: "On consignment?" },
              { key: "hasIvory" as const, label: "Piano has ivory?" },
              { key: "needsRepair" as const, label: "Needs repair or rebuilding?" },
              { key: "totalLoss" as const, label: "Total loss?" },
            ].map(({ key, label }) => (
              <div key={key} className="flex items-center gap-2">
                <Checkbox
                  id={`edit-${key}`}
                  checked={!!(editForm[key])}
                  onCheckedChange={(v) => setEditForm({ ...editForm, [key]: !!v })}
                  data-testid={`checkbox-${key}`}
                />
                <Label htmlFor={`edit-${key}`} className="text-sm cursor-pointer">{label}</Label>
              </div>
            ))}
          </div>

          {/* Tags */}
          <div className="space-y-1.5">
            <Label className="text-xs">Tags</Label>
            <div className="flex flex-wrap gap-1 mb-1">
              {(editForm.tags ?? []).map((tag) => (
                <Badge key={tag} variant="secondary" className="text-xs gap-1 pr-1">
                  {tag}
                  <button type="button" onClick={() => setEditForm({ ...editForm, tags: (editForm.tags ?? []).filter((t) => t !== tag) })}
                    className="ml-0.5 hover:text-destructive" data-testid={`button-remove-tag-${tag}`}>
                    <X className="h-2.5 w-2.5" />
                  </button>
                </Badge>
              ))}
            </div>
            <Input
              placeholder="Add tag and press Enter"
              className="h-8 text-xs"
              data-testid="input-add-tag"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  const val = (e.target as HTMLInputElement).value.trim();
                  if (val && !(editForm.tags ?? []).includes(val)) {
                    setEditForm({ ...editForm, tags: [...(editForm.tags ?? []), val] });
                  }
                  (e.target as HTMLInputElement).value = "";
                }
              }}
            />
          </div>

          {/* Notes */}
          <div className="space-y-1.5">
            <Label className="text-xs">Notes</Label>
            <Textarea value={editForm.notes || ""} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} className="min-h-[80px] text-sm" data-testid="input-piano-notes" />
          </div>

          <div className="flex gap-2 justify-end pt-1">
            <Button variant="secondary" onClick={() => setIsEditing(false)}>Cancel</Button>
            <Button onClick={() => updatePiano.mutate(editForm)} disabled={updatePiano.isPending} data-testid="button-save-piano">
              {updatePiano.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* ══ Service Dialog ═══════════════════════════════════════════════════ */}
      <Dialog open={showServiceDialog} onOpenChange={(o) => { setShowServiceDialog(o); if (!o) setEditingServiceId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingServiceId ? "Edit Service Record" : "Add Service History Note"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-1">
            <div className="space-y-1.5">
              <Label>Date (M/D/YY)</Label>
              <Input value={serviceForm.serviceDate} onChange={(e) => setServiceForm({ ...serviceForm, serviceDate: e.target.value })} placeholder="1/15/25" data-testid="input-service-date" />
            </div>
            <div className="space-y-1.5">
              <Label>Service Type</Label>
              <Select value={serviceForm.serviceType} onValueChange={(v) => setServiceForm({ ...serviceForm, serviceType: v })}>
                <SelectTrigger data-testid="select-service-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tuning">Tuning</SelectItem>
                  <SelectItem value="repair">Repair</SelectItem>
                  <SelectItem value="regulation">Regulation</SelectItem>
                  <SelectItem value="voicing">Voicing</SelectItem>
                  <SelectItem value="inspection">Inspection</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Cost</Label>
              <Input value={serviceForm.cost} onChange={(e) => setServiceForm({ ...serviceForm, cost: e.target.value })} placeholder="$150" data-testid="input-service-cost" />
            </div>
            <div className="space-y-1.5">
              <Label>Notes</Label>
              <Textarea value={serviceForm.notes} onChange={(e) => setServiceForm({ ...serviceForm, notes: e.target.value })} placeholder="Service details…" className="min-h-[80px]" data-testid="input-service-notes" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { setShowServiceDialog(false); setEditingServiceId(null); }}>Cancel</Button>
              <Button onClick={handleServiceSubmit} disabled={addService.isPending || updateService.isPending} data-testid="button-save-service">
                {(addService.isPending || updateService.isPending) ? "Saving…" : "Save"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AppointmentDialog
        open={showAppointmentDialog}
        onOpenChange={setShowAppointmentDialog}
        customerId={customer.id}
        pianoId={piano.id}
        customerName={`${customer.firstName} ${customer.lastName}`}
      />

      <AppointmentDetailDialog
        appointment={detailAppt}
        open={!!detailAppt}
        onOpenChange={(open) => {
          if (!open) {
            setDetailAppt(null);
            queryClient.invalidateQueries({ queryKey: ["/api/pianos", pianoId, "appointments"] });
          }
        }}
      />
    </div>
  );
}
