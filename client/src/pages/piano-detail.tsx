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
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Music,
  Edit,
  Trash2,
  Plus,
  FileText,
  ImagePlus,
  X,
  Calendar,
  Clock,
  Eye,
  EyeOff,
  MoreVertical,
  Wrench,
  Phone,
  MapPin,
  User,
  ChevronRight,
  Tag,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatPhone } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { Piano, Customer, ServiceRecord, Invoice, Appointment } from "@shared/schema";
import { AppointmentDetailDialog } from "@/components/appointment-detail-dialog";
import { AppointmentDialog } from "@/components/appointment-dialog";

function getMonthsSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;
  const month = parseInt(parts[0]) - 1;
  const day = parseInt(parts[1]);
  let year = parseInt(parts[2]);
  if (year < 100) year += 2000;
  const date = new Date(year, month, day);
  const now = new Date();
  return (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
}

function getStatusBadge(dateStr: string | null | undefined) {
  const months = getMonthsSince(dateStr);
  if (months === null) return <Badge variant="secondary">No record</Badge>;
  if (months >= 24) return <Badge variant="destructive">Overdue</Badge>;
  if (months >= 12) return <Badge className="bg-orange-500 dark:bg-orange-600 text-white border-orange-600 dark:border-orange-500">Overdue</Badge>;
  if (months >= 6) return <Badge variant="secondary">Due soon</Badge>;
  return <Badge className="bg-emerald-600 dark:bg-emerald-700 text-white border-emerald-700 dark:border-emerald-600">Recently Tuned</Badge>;
}

function parseDateForSort(dateStr: string | null | undefined): number {
  if (!dateStr) return 0;
  // ISO format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? 0 : d.getTime();
  }
  // Slash format: M/D/YY or M/D/YYYY
  const parts = dateStr.split("/");
  if (parts.length !== 3) return 0;
  let year = parseInt(parts[2]);
  if (year < 100) year += 2000;
  const month = parseInt(parts[0]) - 1;
  const day = parseInt(parts[1]);
  return new Date(year, month, day).getTime();
}

type TimelineEntry =
  | { kind: "service"; date: string; sortTs: number; record: ServiceRecord }
  | { kind: "invoice"; date: string; sortTs: number; invoice: Invoice }
  | { kind: "appointment"; date: string; sortTs: number; appointment: Appointment };

function buildTimeline(
  services: ServiceRecord[],
  invoices: Invoice[],
  appointments: Appointment[]
): TimelineEntry[] {
  const entries: TimelineEntry[] = [
    ...services.map((r): TimelineEntry => ({
      kind: "service",
      date: r.serviceDate,
      sortTs: parseDateForSort(r.serviceDate),
      record: r,
    })),
    ...invoices.map((inv): TimelineEntry => ({
      kind: "invoice",
      date: inv.invoiceDate,
      sortTs: parseDateForSort(inv.invoiceDate),
      invoice: inv,
    })),
    ...appointments.map((a): TimelineEntry => ({
      kind: "appointment",
      date: a.date,
      sortTs: parseDateForSort(a.date),
      appointment: a,
    })),
  ];
  return entries.sort((a, b) => b.sortTs - a.sortTs);
}

function getYearLabel(dateStr: string): string {
  if (!dateStr) return "Unknown";
  // ISO format: YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}/.test(dateStr)) {
    return dateStr.slice(0, 4);
  }
  // Slash format: M/D/YY or M/D/YYYY
  const parts = dateStr.split("/");
  if (parts.length !== 3) return "Unknown";
  let year = parseInt(parts[2]);
  if (year < 100) year += 2000;
  return String(year);
}

export default function PianoDetail() {
  const [, params] = useRoute("/pianos/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const pianoId = params?.id;

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Piano>>({});
  const [showServiceDialog, setShowServiceDialog] = useState(false);
  const [editingServiceId, setEditingServiceId] = useState<number | null>(null);
  const [serviceForm, setServiceForm] = useState({
    serviceDate: new Date().toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" }),
    serviceType: "tuning",
    notes: "",
    cost: "",
  });
  const [showAppointmentDialog, setShowAppointmentDialog] = useState(false);
  const [detailAppt, setDetailAppt] = useState<Appointment | null>(null);
  const [editingNotes, setEditingNotes] = useState(false);
  const [notesValue, setNotesValue] = useState("");
  const [editingLastTuned, setEditingLastTuned] = useState(false);
  const [lastTunedValue, setLastTunedValue] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (piano) {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", String(piano.customerId), "pianos"] });
    }
    queryClient.invalidateQueries({ queryKey: ["/api/pianos"] });
    queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
  };

  const updatePianoMutation = useMutation({
    mutationFn: (data: Partial<Piano>) =>
      apiRequest("PATCH", `/api/pianos/${pianoId}`, data),
    onSuccess: () => {
      invalidateAll();
      setIsEditing(false);
      setEditingNotes(false);
      setEditingLastTuned(false);
      toast({ title: "Piano updated" });
    },
    onError: () => toast({ title: "Failed to update piano", variant: "destructive" }),
  });

  const deletePianoMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/pianos/${pianoId}`),
    onSuccess: () => {
      if (piano) navigate(`/customers/${piano.customerId}`);
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/pianos"] });
      toast({ title: "Piano removed" });
    },
    onError: () => toast({ title: "Failed to remove piano", variant: "destructive" }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/pianos/${pianoId}`, { isActive: !piano?.isActive }),
    onSuccess: () => {
      invalidateAll();
      toast({ title: piano?.isActive ? "Piano marked inactive" : "Piano marked active" });
    },
    onError: () => toast({ title: "Failed to update piano", variant: "destructive" }),
  });

  const uploadPhotosMutation = useMutation({
    mutationFn: async (files: FileList) => {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append("photos", file));
      const res = await fetch(`/api/pianos/${pianoId}/photos`, { method: "POST", body: formData });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: () => { invalidateAll(); toast({ title: "Photos uploaded" }); },
    onError: () => toast({ title: "Failed to upload photos", variant: "destructive" }),
  });

  const deletePhotoMutation = useMutation({
    mutationFn: (photoUrl: string) =>
      apiRequest("DELETE", `/api/pianos/${pianoId}/photos`, { photoUrl }),
    onSuccess: () => { invalidateAll(); toast({ title: "Photo removed" }); },
  });

  const addServiceMutation = useMutation({
    mutationFn: (data: { serviceDate: string; serviceType: string; notes: string; cost: string }) =>
      apiRequest("POST", `/api/pianos/${pianoId}/services`, data),
    onSuccess: () => {
      invalidateAll();
      setShowServiceDialog(false);
      setServiceForm({ serviceDate: new Date().toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" }), serviceType: "tuning", notes: "", cost: "" });
      toast({ title: "Service record added" });
    },
    onError: () => toast({ title: "Failed to add service record", variant: "destructive" }),
  });

  const updateServiceMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: { serviceDate: string; serviceType: string; notes: string; cost: string } }) =>
      apiRequest("PATCH", `/api/services/${id}`, data),
    onSuccess: () => {
      invalidateAll();
      setEditingServiceId(null);
      setShowServiceDialog(false);
      toast({ title: "Service record updated" });
    },
    onError: () => toast({ title: "Failed to update service record", variant: "destructive" }),
  });

  const deleteServiceMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/services/${id}`),
    onSuccess: () => { invalidateAll(); toast({ title: "Service record deleted" }); },
    onError: () => toast({ title: "Failed to delete service record", variant: "destructive" }),
  });

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-32 w-full" />
      </div>
    );
  }

  if (!piano || !customer) {
    return (
      <div className="p-4 sm:p-6 max-w-3xl mx-auto text-center py-20">
        <h2 className="text-lg font-semibold">Piano not found</h2>
        <Button variant="ghost" className="mt-4" onClick={() => navigate("/customers")} data-testid="button-back">
          <ArrowLeft className="h-4 w-4 mr-2" /> Back to clients
        </Button>
      </div>
    );
  }

  const isInactive = piano.isActive === false;
  const pianoLabel = [piano.year, piano.make, piano.model].filter(Boolean).join(" ") || "Unnamed Piano";
  const pianoTypeLabel = piano.pianoType || "";
  const heroPhoto = piano.photos && piano.photos.length > 0 ? piano.photos[0] : null;

  const timeline = buildTimeline(serviceRecords ?? [], pianoInvoices ?? [], pianoAppointments ?? []);

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

  const startEditingService = (record: ServiceRecord) => {
    setServiceForm({
      serviceDate: record.serviceDate,
      serviceType: record.serviceType,
      notes: record.notes || "",
      cost: record.cost || "",
    });
    setEditingServiceId(record.id);
    setShowServiceDialog(true);
  };

  const handleServiceSubmit = () => {
    if (editingServiceId) {
      updateServiceMutation.mutate({ id: editingServiceId, data: serviceForm });
    } else {
      addServiceMutation.mutate(serviceForm);
    }
  };

  const startEditing = () => {
    setEditForm({
      make: piano.make,
      model: piano.model,
      pianoType: piano.pianoType,
      year: piano.year,
      serialNumber: piano.serialNumber,
      location: piano.location,
      tags: piano.tags ?? [],
      notes: piano.notes,
      lastTuned: piano.lastTuned,
    });
    setIsEditing(true);
  };

  const startEditingNotes = () => {
    setNotesValue(piano.notes || "");
    setEditingNotes(true);
  };

  const startEditingLastTuned = () => {
    setLastTunedValue(piano.lastTuned || "");
    setEditingLastTuned(true);
  };

  const statusBadgeForAppt = (status: string | null | undefined) => {
    const s = status ?? "scheduled";
    if (s === "completed") return <Badge variant="secondary" className="text-xs">Completed</Badge>;
    if (s === "no-show") return <Badge variant="secondary" className="text-xs bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">No-show</Badge>;
    if (s === "cancelled") return <Badge variant="secondary" className="text-xs bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">Cancelled</Badge>;
    return <Badge className="text-xs">Scheduled</Badge>;
  };

  const invoiceStatusBadge = (status: string | null | undefined) => {
    const s = status ?? "draft";
    if (s === "paid") return <Badge className="text-xs bg-emerald-600 dark:bg-emerald-700 text-white border-emerald-600">Paid</Badge>;
    if (s === "open") return <Badge className="text-xs">Open</Badge>;
    if (s === "cancelled") return <Badge variant="secondary" className="text-xs">Cancelled</Badge>;
    return <Badge variant="secondary" className="text-xs">Draft</Badge>;
  };

  let lastYearLabel = "";

  return (
    <div className="p-4 sm:p-6 max-w-3xl mx-auto space-y-5">
      {/* Back nav */}
      <div className="flex items-center gap-2">
        <Link href={`/customers/${customer.id}`}>
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <span className="text-sm text-muted-foreground">
          <Link href={`/customers/${customer.id}`} className="hover:underline" data-testid="link-back-to-customer">
            {customer.firstName} {customer.lastName}
          </Link>
          <span className="mx-1.5">›</span>
          <span className="text-foreground font-medium">{pianoLabel}</span>
        </span>
      </div>

      {/* Hero */}
      <Card className={isInactive ? "opacity-70" : ""} data-testid="piano-hero-card">
        <CardContent className="pt-5 pb-4">
          <div className="flex gap-4">
            {/* Photo or icon */}
            <div className="shrink-0">
              {heroPhoto ? (
                <img
                  src={heroPhoto}
                  alt="Piano"
                  className="h-24 w-24 object-cover rounded-lg border"
                  data-testid="piano-hero-photo"
                />
              ) : (
                <div className="h-24 w-24 rounded-lg bg-primary/10 flex items-center justify-center border border-primary/20">
                  <Music className="h-10 w-10 text-primary/40" />
                </div>
              )}
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex items-start gap-2 justify-between">
                <div className="min-w-0">
                  <h1 className="text-xl font-bold truncate" data-testid="piano-title">{pianoLabel}</h1>
                  {pianoTypeLabel && <p className="text-sm text-muted-foreground">{pianoTypeLabel}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  {isInactive && <Badge variant="secondary" className="text-xs">Inactive</Badge>}
                  {!isInactive && getStatusBadge(piano.lastTuned)}
                </div>
              </div>

              {/* Serial / Location */}
              <div className="flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-muted-foreground">
                {piano.serialNumber && (
                  <span data-testid="text-serial-number">S/N: {piano.serialNumber}</span>
                )}
                {piano.location && (
                  <span className="flex items-center gap-0.5" data-testid="text-piano-location">
                    <MapPin className="h-3 w-3" /> {piano.location}
                  </span>
                )}
              </div>

              {/* Tags */}
              <div className="flex flex-wrap gap-1 pt-0.5" data-testid="piano-tags">
                {(piano.tags ?? []).map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs py-0 px-1.5">{tag}</Badge>
                ))}
                <button
                  onClick={startEditing}
                  className="inline-flex items-center gap-0.5 text-xs text-muted-foreground hover:text-foreground border border-dashed border-muted-foreground/40 rounded px-1.5 py-0.5 leading-none"
                  data-testid="button-add-tag"
                >
                  <Tag className="h-2.5 w-2.5" /> Add Tag
                </button>
              </div>

              {/* Action row */}
              <div className="flex items-center gap-1.5 flex-wrap pt-1">
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={startEditing}
                  data-testid="button-edit-piano"
                >
                  <Edit className="h-3 w-3 mr-1" /> Edit
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => navigate(`/invoices/new?pianoId=${piano.id}&customerId=${customer.id}`)}
                  data-testid="button-invoice-piano"
                >
                  <FileText className="h-3 w-3 mr-1" /> Invoice
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs h-7"
                  onClick={() => setShowAppointmentDialog(true)}
                  data-testid="button-schedule-piano"
                >
                  <Calendar className="h-3 w-3 mr-1" /> Schedule
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon" className="h-7 w-7" data-testid="button-more-menu">
                      <MoreVertical className="h-3 w-3" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => toggleActiveMutation.mutate()} data-testid="menuitem-toggle-active">
                      {isInactive ? <><Eye className="h-4 w-4 mr-2" />Mark Active</> : <><EyeOff className="h-4 w-4 mr-2" />Mark Inactive</>}
                    </DropdownMenuItem>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      className="text-destructive focus:text-destructive"
                      onClick={() => {
                        if (confirm("Remove this piano and its service history?")) deletePianoMutation.mutate();
                      }}
                      data-testid="menuitem-delete-piano"
                    >
                      <Trash2 className="h-4 w-4 mr-2" /> Delete Piano
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Edit form */}
      {isEditing && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Edit Piano</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Make</Label>
                <Input value={editForm.make || ""} onChange={(e) => setEditForm({ ...editForm, make: e.target.value })} placeholder="Steinway" data-testid="input-piano-make" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Model</Label>
                <Input value={editForm.model || ""} onChange={(e) => setEditForm({ ...editForm, model: e.target.value })} placeholder="Model B" data-testid="input-piano-model" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <Input value={editForm.pianoType || ""} onChange={(e) => setEditForm({ ...editForm, pianoType: e.target.value })} placeholder="Grand" data-testid="input-piano-type" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Year</Label>
                <Input value={editForm.year || ""} onChange={(e) => setEditForm({ ...editForm, year: e.target.value })} placeholder="1985" data-testid="input-piano-year" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Serial Number</Label>
                <Input value={editForm.serialNumber || ""} onChange={(e) => setEditForm({ ...editForm, serialNumber: e.target.value })} placeholder="e.g. 123456" data-testid="input-piano-serial" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Location</Label>
                <Input value={editForm.location || ""} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })} placeholder="e.g. Living room" data-testid="input-piano-location" />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Last Tuned (M/D/YY)</Label>
                <Input value={editForm.lastTuned || ""} onChange={(e) => setEditForm({ ...editForm, lastTuned: e.target.value })} placeholder="1/15/25" data-testid="input-piano-tuned" />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Tags</Label>
              <div className="flex flex-wrap gap-1 mb-1">
                {(editForm.tags ?? []).map((tag) => (
                  <Badge key={tag} variant="secondary" className="text-xs gap-1 pr-1">
                    {tag}
                    <button
                      type="button"
                      onClick={() => setEditForm({ ...editForm, tags: (editForm.tags ?? []).filter((t) => t !== tag) })}
                      className="ml-0.5 hover:text-destructive"
                      data-testid={`button-remove-tag-${tag}`}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </Badge>
                ))}
              </div>
              <div className="flex gap-2">
                <Input
                  placeholder="Add tag and press Enter"
                  className="h-7 text-xs"
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
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea value={editForm.notes || ""} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} className="min-h-[80px]" data-testid="input-piano-notes" />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" size="sm" onClick={() => setIsEditing(false)}>Cancel</Button>
              <Button size="sm" onClick={() => updatePianoMutation.mutate(editForm)} disabled={updatePianoMutation.isPending} data-testid="button-save-piano">
                {updatePianoMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Photo gallery */}
      <Card>
        <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-sm font-medium">Photos</CardTitle>
          <div>
            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files.length > 0) {
                  uploadPhotosMutation.mutate(e.target.files);
                  e.target.value = "";
                }
              }}
            />
            <Button variant="outline" size="sm" className="text-xs h-7"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadPhotosMutation.isPending}
              data-testid="button-add-photos"
            >
              <ImagePlus className="h-3 w-3 mr-1" />
              {uploadPhotosMutation.isPending ? "Uploading..." : "Add Photos"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {(!piano.photos || piano.photos.length === 0) ? (
            <p className="text-xs text-muted-foreground text-center py-4">No photos yet</p>
          ) : (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {piano.photos.map((photo, idx) => (
                <div key={idx} className="relative shrink-0 group">
                  <img src={photo} alt={`Photo ${idx + 1}`} className="h-20 w-20 object-cover rounded-md border" data-testid={`piano-photo-${idx}`} />
                  <button
                    onClick={() => deletePhotoMutation.mutate(photo)}
                    className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full h-5 w-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    data-testid={`button-remove-photo-${idx}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Specs + Tuning + Notes */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Details</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Specs grid */}
          <div className="grid gap-2 sm:grid-cols-2 text-sm">
            {piano.make && (
              <div><span className="text-xs text-muted-foreground">Make</span><p className="font-medium">{piano.make}</p></div>
            )}
            {piano.model && (
              <div><span className="text-xs text-muted-foreground">Model</span><p className="font-medium">{piano.model}</p></div>
            )}
            {piano.pianoType && (
              <div><span className="text-xs text-muted-foreground">Type</span><p className="font-medium">{piano.pianoType}</p></div>
            )}
            {piano.year && (
              <div><span className="text-xs text-muted-foreground">Year</span><p className="font-medium">{piano.year}</p></div>
            )}
          </div>

          {/* Last tuned */}
          <div className="border-t pt-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Last Tuned</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={startEditingLastTuned} data-testid="button-edit-last-tuned">
                <Edit className="h-3 w-3" />
              </Button>
            </div>
            {editingLastTuned ? (
              <div className="flex items-center gap-2 mt-1">
                <Input
                  value={lastTunedValue}
                  onChange={(e) => setLastTunedValue(e.target.value)}
                  placeholder="M/D/YY"
                  className="h-7 text-sm w-28"
                  data-testid="input-last-tuned"
                  onKeyDown={(e) => {
                    if (e.key === "Enter") updatePianoMutation.mutate({ lastTuned: lastTunedValue });
                    if (e.key === "Escape") setEditingLastTuned(false);
                  }}
                />
                <Button size="sm" className="h-7 text-xs" onClick={() => updatePianoMutation.mutate({ lastTuned: lastTunedValue })} disabled={updatePianoMutation.isPending} data-testid="button-save-last-tuned">Save</Button>
                <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditingLastTuned(false)}>Cancel</Button>
              </div>
            ) : (
              <div className="flex items-center gap-2 mt-0.5">
                <span className="text-sm font-medium" data-testid="text-last-tuned">{piano.lastTuned || "No record"}</span>
                {getStatusBadge(piano.lastTuned)}
              </div>
            )}
          </div>

          {/* Notes */}
          <div className="border-t pt-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs text-muted-foreground">Notes</span>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={startEditingNotes} data-testid="button-edit-notes">
                <Edit className="h-3 w-3" />
              </Button>
            </div>
            {editingNotes ? (
              <div className="space-y-2 mt-1">
                <Textarea value={notesValue} onChange={(e) => setNotesValue(e.target.value)} className="min-h-[80px] text-sm" data-testid="input-notes" />
                <div className="flex gap-2 justify-end">
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setEditingNotes(false)}>Cancel</Button>
                  <Button size="sm" className="h-7 text-xs" onClick={() => updatePianoMutation.mutate({ notes: notesValue })} disabled={updatePianoMutation.isPending} data-testid="button-save-notes">Save</Button>
                </div>
              </div>
            ) : (
              <p className="text-sm mt-0.5 whitespace-pre-wrap" data-testid="text-piano-notes">
                {piano.notes || <span className="text-muted-foreground italic">No notes</span>}
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Client strip */}
      <Card>
        <CardContent className="py-3 px-4">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
              <User className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground">Owner</p>
              <Link href={`/customers/${customer.id}`} className="text-sm font-medium hover:underline" data-testid="link-customer">
                {customer.firstName} {customer.lastName}
              </Link>
              {(customer.phone || customer.city) && (
                <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground flex-wrap">
                  {customer.phone && (
                    <a href={`tel:${customer.phone}`} className="flex items-center gap-1 hover:text-foreground">
                      <Phone className="h-3 w-3" /> {formatPhone(customer.phone)}
                    </a>
                  )}
                  {customer.city && (
                    <span className="flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {customer.city}{customer.state ? `, ${customer.state}` : ""}
                    </span>
                  )}
                </div>
              )}
            </div>
            <Link href={`/customers/${customer.id}`}>
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Unified Activity Timeline */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Activity</h2>
          <Button variant="outline" size="sm" className="text-xs h-7" onClick={openAddService} data-testid="button-add-service">
            <Plus className="h-3 w-3 mr-1" /> Log Service
          </Button>
        </div>

        {timeline.length === 0 ? (
          <Card>
            <CardContent className="py-10 text-center">
              <p className="text-sm text-muted-foreground">No activity yet</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-1.5">
            {timeline.map((entry, idx) => {
              const yearLabel = getYearLabel(entry.date);
              const showYearHeader = yearLabel !== lastYearLabel;
              lastYearLabel = yearLabel;

              if (entry.kind === "service") {
                const r = entry.record;
                return (
                  <div key={`s-${r.id}`}>
                    {showYearHeader && (
                      <p className="text-xs text-muted-foreground font-medium pt-2 pb-1 px-1">{yearLabel}</p>
                    )}
                    <Card
                      className="hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => startEditingService(r)}
                      data-testid={`timeline-service-${r.id}`}
                    >
                      <CardContent className="py-3 px-4">
                        <div className="flex items-start gap-3">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-blue-50 dark:bg-blue-950 text-blue-600 dark:text-blue-400 mt-0.5">
                            <Wrench className="h-3.5 w-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium capitalize" data-testid={`timeline-service-type-${r.id}`}>{r.serviceType}</span>
                              <span className="text-xs text-muted-foreground">{r.serviceDate}</span>
                              {r.cost && <span className="text-xs font-medium">{r.cost}</span>}
                            </div>
                            {r.notes && <p className="text-xs text-muted-foreground mt-0.5">{r.notes}</p>}
                          </div>
                          <div className="flex items-center gap-0.5 shrink-0">
                            <Button variant="ghost" size="icon" className="h-6 w-6" onClick={(e) => { e.stopPropagation(); startEditingService(r); }} data-testid={`button-edit-service-${r.id}`}>
                              <Edit className="h-3 w-3" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive"
                              onClick={(e) => { e.stopPropagation(); if (confirm("Delete this service record?")) deleteServiceMutation.mutate(r.id); }}
                              data-testid={`button-delete-service-${r.id}`}
                            >
                              <Trash2 className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                );
              }

              if (entry.kind === "invoice") {
                const inv = entry.invoice;
                return (
                  <div key={`i-${inv.id}`}>
                    {showYearHeader && (
                      <p className="text-xs text-muted-foreground font-medium pt-2 pb-1 px-1">{yearLabel}</p>
                    )}
                    <Link href={`/invoices/${inv.id}`}>
                      <Card className="hover:bg-muted/30 transition-colors cursor-pointer" data-testid={`timeline-invoice-${inv.id}`}>
                        <CardContent className="py-3 px-4">
                          <div className="flex items-start gap-3">
                            <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-purple-50 dark:bg-purple-950 text-purple-600 dark:text-purple-400 mt-0.5">
                              <FileText className="h-3.5 w-3.5" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-sm font-medium">Invoice #{inv.invoiceNumber}</span>
                                <span className="text-xs text-muted-foreground">{inv.invoiceDate}</span>
                                {invoiceStatusBadge(inv.status)}
                                {inv.total && inv.total !== "$0.00" && <span className="text-xs font-medium">{inv.total}</span>}
                              </div>
                            </div>
                            <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                          </div>
                        </CardContent>
                      </Card>
                    </Link>
                  </div>
                );
              }

              if (entry.kind === "appointment") {
                const appt = entry.appointment;
                const isCompleted = appt.status === "completed";
                return (
                  <div key={`a-${appt.id}`}>
                    {showYearHeader && (
                      <p className="text-xs text-muted-foreground font-medium pt-2 pb-1 px-1">{yearLabel}</p>
                    )}
                    <Card
                      className={`hover:bg-muted/30 transition-colors cursor-pointer ${isCompleted ? "opacity-60" : ""}`}
                      onClick={() => setDetailAppt(appt)}
                      data-testid={`timeline-appointment-${appt.id}`}
                    >
                      <CardContent className="py-3 px-4">
                        <div className="flex items-start gap-3">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-emerald-50 dark:bg-emerald-950 text-emerald-600 dark:text-emerald-400 mt-0.5">
                            <Calendar className="h-3.5 w-3.5" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium">{appt.date}</span>
                              {appt.time && <span className="text-xs text-muted-foreground flex items-center gap-0.5"><Clock className="h-3 w-3" />{appt.time}</span>}
                              {statusBadgeForAppt(appt.status)}
                              {appt.priceEstimate && <span className="text-xs font-medium">{appt.priceEstimate}</span>}
                            </div>
                            {appt.servicesRequested && (
                              <p className="text-xs text-muted-foreground mt-0.5 truncate">{appt.servicesRequested}</p>
                            )}
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                );
              }

              return null;
            })}
          </div>
        )}
      </div>

      {/* Service dialog */}
      <Dialog open={showServiceDialog} onOpenChange={(open) => { setShowServiceDialog(open); if (!open) setEditingServiceId(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingServiceId ? "Edit Service Record" : "Add Service Record"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="space-y-2">
              <Label>Service Date (M/D/YY)</Label>
              <Input value={serviceForm.serviceDate} onChange={(e) => setServiceForm({ ...serviceForm, serviceDate: e.target.value })} placeholder="1/15/25" data-testid="input-service-date" />
            </div>
            <div className="space-y-2">
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
            <div className="space-y-2">
              <Label>Cost</Label>
              <Input value={serviceForm.cost} onChange={(e) => setServiceForm({ ...serviceForm, cost: e.target.value })} placeholder="$150" data-testid="input-service-cost" />
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Textarea value={serviceForm.notes} onChange={(e) => setServiceForm({ ...serviceForm, notes: e.target.value })} placeholder="Service details..." data-testid="input-service-notes" />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => { setShowServiceDialog(false); setEditingServiceId(null); }}>Cancel</Button>
              <Button onClick={handleServiceSubmit} disabled={addServiceMutation.isPending || updateServiceMutation.isPending} data-testid="button-save-service">
                {(addServiceMutation.isPending || updateServiceMutation.isPending) ? "Saving..." : "Save"}
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
