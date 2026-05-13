import { useState, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useRoute, useLocation } from "wouter";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
  Phone,
  Mail,
  MapPin,
  Piano as PianoIcon,
  Edit,
  Trash2,
  Plus,
  Building,
  FileText,
  ImagePlus,
  X,
  Music,
  Calendar,
  CheckCircle,
  EyeOff,
  Eye,
  PhoneCall,
  Star,
  ExternalLink,
  Users,
  Crown,
  ChevronRight,
  Wrench,
  MoreHorizontal,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { formatPhone } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { Customer, Piano, ServiceRecord, Appointment, CustomerContact, Invoice } from "@shared/schema";
import { AppointmentDetailDialog } from "@/components/appointment-detail-dialog";
import { Link } from "wouter";
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

function parseMDYY(dateStr: string | null | undefined): Date {
  if (!dateStr) return new Date(0);
  const parts = dateStr.split("/");
  if (parts.length !== 3) return new Date(0);
  let year = parseInt(parts[2]);
  if (year < 100) year += 2000;
  return new Date(year, parseInt(parts[0]) - 1, parseInt(parts[1]));
}

function getNextTuningDue(lastTuned: string | null | undefined, intervalMonths?: number | null): string {
  if (!lastTuned) return "Unknown";
  const parts = lastTuned.split("/");
  if (parts.length !== 3) return "Unknown";
  let year = parseInt(parts[2]);
  if (year < 100) year += 2000;
  const d = new Date(year, parseInt(parts[0]) - 1, parseInt(parts[1]));
  const interval = intervalMonths ?? 12;
  d.setMonth(d.getMonth() + interval);
  return d.toLocaleDateString("en-US", { month: "short", year: "numeric" });
}

type TimelineEntry =
  | { type: "service"; date: Date; raw: ServiceRecord; pianoLabel: string }
  | { type: "appointment"; date: Date; raw: Appointment; pianoLabel: string }
  | { type: "invoice"; date: Date; raw: Invoice; pianoLabel: string };

function ClientTimeline({ customerId, pianos, onOpenAppointment }: {
  customerId: string;
  pianos: Piano[] | undefined;
  onOpenAppointment: (appt: Appointment) => void;
}) {
  const { data: services, isLoading: loadingServices } = useQuery<ServiceRecord[]>({
    queryKey: ["/api/customers", customerId, "services"],
    enabled: !!customerId,
  });

  const { data: appointments, isLoading: loadingAppts } = useQuery<Appointment[]>({
    queryKey: ["/api/customers", customerId, "appointments"],
    enabled: !!customerId,
  });

  const { data: invoicesData, isLoading: loadingInvoices } = useQuery<Invoice[]>({
    queryKey: ["/api/customers", customerId, "invoices"],
    enabled: !!customerId,
  });

  const isLoading = loadingServices || loadingAppts || loadingInvoices;

  const getPianoLabel = (pianoId: number | null | undefined) => {
    if (!pianoId || !pianos) return "";
    const p = pianos.find(p => p.id === pianoId);
    if (!p) return "";
    return [p.make, p.model, p.pianoType].filter(Boolean).join(" ") || "Piano";
  };

  const entries: TimelineEntry[] = [];
  (services ?? []).forEach(s => {
    entries.push({ type: "service", date: parseMDYY(s.serviceDate), raw: s, pianoLabel: getPianoLabel(s.pianoId) });
  });
  (appointments ?? []).forEach(a => {
    entries.push({ type: "appointment", date: parseMDYY(a.date), raw: a, pianoLabel: getPianoLabel(a.pianoId) });
  });
  (invoicesData ?? []).forEach(inv => {
    entries.push({ type: "invoice", date: parseMDYY(inv.invoiceDate), raw: inv, pianoLabel: getPianoLabel(inv.pianoId) });
  });
  entries.sort((a, b) => b.date.getTime() - a.date.getTime());

  const statusColors: Record<string, string> = {
    paid: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    draft: "bg-muted text-muted-foreground",
    open: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    sent: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
    cancelled: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
    completed: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
    scheduled: "bg-primary/10 text-primary",
    "no-show": "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  };

  return (
    <Card className="sticky top-4" data-testid="client-timeline-panel">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Timeline</CardTitle>
      </CardHeader>
      <CardContent className="pt-0 overflow-hidden">
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
          </div>
        ) : entries.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-6">No activity yet</p>
        ) : (
          <div className="relative space-y-0" data-testid="timeline-list">
            {entries.map((entry, idx) => {
              const isLast = idx === entries.length - 1;
              if (entry.type === "service") {
                const s = entry.raw;
                return (
                  <div key={`svc-${s.id}`} className="relative flex gap-3 pb-4" data-testid={`timeline-service-${s.id}`}>
                    <div className="flex flex-col items-center">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted border border-border z-10">
                        <Wrench className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      {!isLast && <div className="w-px flex-1 bg-border mt-1" />}
                    </div>
                    <div className="min-w-0 flex-1 pt-0.5 overflow-hidden">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-medium capitalize">{s.serviceType}</span>
                        {s.cost && <span className="text-xs text-muted-foreground">{s.cost}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{s.serviceDate}</p>
                      {entry.pianoLabel && <p className="text-xs text-muted-foreground truncate">{entry.pianoLabel}</p>}
                      {s.notes && <p className="text-xs text-muted-foreground truncate">{s.notes}</p>}
                    </div>
                  </div>
                );
              }
              if (entry.type === "appointment") {
                const a = entry.raw;
                const status = a.status ?? "scheduled";
                return (
                  <div key={`appt-${a.id}`} className="relative flex gap-3 pb-4" data-testid={`timeline-appointment-${a.id}`}>
                    <div className="flex flex-col items-center">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted border border-border z-10">
                        <Calendar className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      {!isLast && <div className="w-px flex-1 bg-border mt-1" />}
                    </div>
                    <div className="min-w-0 flex-1 pt-0.5 overflow-hidden">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <button
                          className="text-xs font-medium hover:underline text-left"
                          onClick={() => onOpenAppointment(a)}
                          data-testid={`timeline-appt-open-${a.id}`}
                        >
                          Appointment
                        </button>
                        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${statusColors[status] ?? "bg-muted text-muted-foreground"}`}>
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">{a.date}{a.time ? ` · ${a.time}` : ""}</p>
                      {entry.pianoLabel && <p className="text-xs text-muted-foreground truncate">{entry.pianoLabel}</p>}
                      {a.servicesRequested && <p className="text-xs text-muted-foreground truncate">{a.servicesRequested}</p>}
                      {a.priceEstimate && <p className="text-xs font-medium">{a.priceEstimate}</p>}
                    </div>
                  </div>
                );
              }
              if (entry.type === "invoice") {
                const inv = entry.raw;
                const status = inv.status ?? "draft";
                return (
                  <div key={`inv-${inv.id}`} className="relative flex gap-3 pb-4" data-testid={`timeline-invoice-${inv.id}`}>
                    <div className="flex flex-col items-center">
                      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-muted border border-border z-10">
                        <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      </div>
                      {!isLast && <div className="w-px flex-1 bg-border mt-1" />}
                    </div>
                    <div className="min-w-0 flex-1 pt-0.5 overflow-hidden">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Link href={`/invoices/${inv.id}`}>
                          <span className="text-xs font-medium hover:underline cursor-pointer" data-testid={`timeline-invoice-link-${inv.id}`}>
                            Invoice #{inv.invoiceNumber}
                          </span>
                        </Link>
                        <span className={`inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-medium ${statusColors[status] ?? "bg-muted text-muted-foreground"}`}>
                          {status.charAt(0).toUpperCase() + status.slice(1)}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{inv.invoiceDate}</p>
                      {entry.pianoLabel && <p className="text-xs text-muted-foreground truncate">{entry.pianoLabel}</p>}
                      {inv.total && <p className="text-xs font-medium">{inv.total}</p>}
                    </div>
                  </div>
                );
              }
              return null;
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function CustomerDetail() {
  const [, params] = useRoute("/customers/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [showAddPiano, setShowAddPiano] = useState(false);
  const [showAppointmentDialog, setShowAppointmentDialog] = useState(false);
  const [appointmentPianoId, setAppointmentPianoId] = useState<number | undefined>(undefined);
  const [detailAppt, setDetailAppt] = useState<Appointment | null>(null);
  const [editForm, setEditForm] = useState<Partial<Customer>>({});
  const [showAddContact, setShowAddContact] = useState(false);
  const [editingContact, setEditingContact] = useState<CustomerContact | null>(null);
  const [contactForm, setContactForm] = useState({ firstName: "", lastName: "", phone: "", email: "", role: "", isPrimary: false });
  const [newPianoForm, setNewPianoForm] = useState({
    make: "", model: "", pianoType: "", year: "", serialNumber: "", location: "", notes: "", lastTuned: "",
  });

  const customerId = params?.id;

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

  const invalidateContacts = () => queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "contacts"] });

  const createContactMutation = useMutation({
    mutationFn: (data: typeof contactForm) => apiRequest("POST", `/api/customers/${customerId}/contacts`, data),
    onSuccess: () => { invalidateContacts(); setShowAddContact(false); setContactForm({ firstName: "", lastName: "", phone: "", email: "", role: "", isPrimary: false }); toast({ title: "Contact added" }); },
    onError: () => toast({ title: "Failed to add contact", variant: "destructive" }),
  });

  const updateContactMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: typeof contactForm }) => apiRequest("PATCH", `/api/customer-contacts/${id}`, data),
    onSuccess: () => { invalidateContacts(); setEditingContact(null); toast({ title: "Contact updated" }); },
    onError: () => toast({ title: "Failed to update contact", variant: "destructive" }),
  });

  const deleteContactMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/customer-contacts/${id}`),
    onSuccess: () => { invalidateContacts(); toast({ title: "Contact removed" }); },
    onError: () => toast({ title: "Failed to remove contact", variant: "destructive" }),
  });

  const setPrimaryContactMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/customer-contacts/${id}/set-primary`, { customerId: parseInt(customerId!) }),
    onSuccess: () => { invalidateContacts(); toast({ title: "Primary contact updated" }); },
    onError: () => toast({ title: "Failed to update primary contact", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Customer>) => apiRequest("PATCH", `/api/customers/${customerId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setIsEditing(false);
      toast({ title: "Client updated successfully" });
    },
    onError: () => toast({ title: "Failed to update client", variant: "destructive" }),
  });

  const markContactedMutation = useMutation({
    mutationFn: (date: string) => apiRequest("PATCH", `/api/customers/${customerId}`, { lastContacted: date }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({ title: "Last contacted date updated" });
    },
    onError: () => toast({ title: "Failed to update", variant: "destructive" }),
  });

  const toggleStarMutation = useMutation({
    mutationFn: () => apiRequest("PATCH", `/api/customers/${customerId}`, { isStarred: !customer?.isStarred }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId] });
      toast({ title: customer?.isStarred ? "Removed from starred" : "Added to starred" });
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
      setNewPianoForm({ make: "", model: "", pianoType: "", year: "", serialNumber: "", location: "", notes: "", lastTuned: "" });
      toast({ title: "Piano added" });
    },
    onError: () => toast({ title: "Failed to add piano", variant: "destructive" }),
  });

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
          <Skeleton className="h-64" />
        </div>
      </div>
    );
  }

  if (!customer) {
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto text-center py-20">
        <h2 className="text-lg font-semibold">Client not found</h2>
        <Link href="/customers">
          <Button variant="ghost" className="mt-4" data-testid="link-back-to-clients">
            <ChevronRight className="h-4 w-4 mr-2 rotate-180" /> Back to Clients
          </Button>
        </Link>
      </div>
    );
  }

  const startEditing = () => {
    setEditForm({
      firstName: customer.firstName,
      lastName: customer.lastName,
      companyName: customer.companyName,
      email: customer.email,
      phone: customer.phone,
      address: customer.address,
      city: customer.city,
      state: customer.state,
      zipCode: customer.zipCode,
      personalNotes: customer.personalNotes,
    });
    setIsEditing(true);
  };

  const cityLine = [customer.city, customer.state, customer.zipCode].filter(Boolean).join(", ");

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">

      {/* Breadcrumb */}
      <nav className="flex items-center gap-1 text-sm text-muted-foreground mb-4" aria-label="breadcrumb">
        <Link href="/customers">
          <span className="hover:text-foreground transition-colors cursor-pointer" data-testid="link-back-to-clients">Clients</span>
        </Link>
        <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        <span className="text-foreground font-medium truncate">{customer.firstName} {customer.lastName}</span>
      </nav>

      {/* Name + actions */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-customer-name">
              {customer.firstName} {customer.lastName}
            </h1>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => toggleStarMutation.mutate()}
              disabled={toggleStarMutation.isPending}
              data-testid="button-toggle-star"
            >
              <Star className={`h-4 w-4 ${customer.isStarred ? "fill-yellow-400 text-yellow-400" : "text-muted-foreground"}`} />
            </Button>
          </div>
          {cityLine && <p className="text-sm text-muted-foreground mt-0.5" data-testid="text-city-line">{cityLine}</p>}
          {customer.companyName && <p className="text-sm text-muted-foreground" data-testid="text-company">{customer.companyName}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button
            size="sm"
            onClick={() => { setAppointmentPianoId(undefined); setShowAppointmentDialog(true); }}
            data-testid="button-schedule-appointment"
          >
            <Calendar className="h-3 w-3 mr-1.5" /> Schedule
          </Button>
          <Button variant="secondary" size="sm" onClick={startEditing} data-testid="button-edit">
            <Edit className="h-3 w-3 mr-1.5" /> Edit
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-8 w-8" data-testid="button-more">
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => {
                  if (confirm("Are you sure you want to delete this client and all their pianos?")) {
                    deleteMutation.mutate();
                  }
                }}
                data-testid="button-delete"
              >
                <Trash2 className="h-4 w-4 mr-2" /> Delete Client
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Two-column layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-4 sm:gap-6">
        <div className="space-y-4 min-w-0">

          {/* ── Edit form ── */}
          {isEditing && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Edit Client</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>First Name</Label>
                    <Input value={editForm.firstName || ""} onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })} data-testid="input-edit-first-name" />
                  </div>
                  <div className="space-y-2">
                    <Label>Last Name</Label>
                    <Input value={editForm.lastName || ""} onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })} data-testid="input-edit-last-name" />
                  </div>
                  <div className="space-y-2">
                    <Label>Company</Label>
                    <Input value={editForm.companyName || ""} onChange={(e) => setEditForm({ ...editForm, companyName: e.target.value })} data-testid="input-edit-company" />
                  </div>
                  <div className="space-y-2">
                    <Label>Email</Label>
                    <Input value={editForm.email || ""} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} data-testid="input-edit-email" />
                  </div>
                  <div className="space-y-2">
                    <Label>Phone</Label>
                    <Input value={editForm.phone || ""} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} data-testid="input-edit-phone" />
                  </div>
                  <div className="space-y-2 sm:col-span-2">
                    <Label>Address</Label>
                    <Input value={editForm.address || ""} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} data-testid="input-edit-address" />
                  </div>
                  <div className="space-y-2">
                    <Label>City</Label>
                    <Input value={editForm.city || ""} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} data-testid="input-edit-city" />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>State</Label>
                      <Input value={editForm.state || ""} onChange={(e) => setEditForm({ ...editForm, state: e.target.value })} data-testid="input-edit-state" />
                    </div>
                    <div className="space-y-2">
                      <Label>Zip Code</Label>
                      <Input value={editForm.zipCode || ""} onChange={(e) => setEditForm({ ...editForm, zipCode: e.target.value })} data-testid="input-edit-zip" />
                    </div>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Personal Notes</Label>
                  <Textarea value={editForm.personalNotes || ""} onChange={(e) => setEditForm({ ...editForm, personalNotes: e.target.value })} className="min-h-[100px]" data-testid="input-edit-notes" />
                </div>
                <div className="flex gap-2 justify-end flex-wrap">
                  <Button variant="secondary" onClick={() => setIsEditing(false)} data-testid="button-cancel-edit">Cancel</Button>
                  <Button onClick={() => updateMutation.mutate(editForm)} disabled={updateMutation.isPending} data-testid="button-save-edit">
                    {updateMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ── Contacts ── */}
          {!isEditing && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Contacts</CardTitle>
                  <div className="flex items-center gap-2">
                    {customer.address && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        asChild
                        data-testid="button-map-address"
                      >
                        <a
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([customer.address, customer.city, customer.state, customer.zipCode].filter(Boolean).join(", "))}`}
                          target="_blank"
                          rel="noopener noreferrer"
                        >
                          <MapPin className="h-3 w-3 mr-1" /> Map
                        </a>
                      </Button>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => { setContactForm({ firstName: "", lastName: "", phone: "", email: "", role: "", isPrimary: false }); setShowAddContact(true); setEditingContact(null); }}
                      data-testid="button-add-contact"
                    >
                      <Plus className="h-3 w-3 mr-1" /> New Contact
                    </Button>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 pt-0">
                {/* Primary — the account holder */}
                <div className="flex items-start justify-between gap-2 p-3 rounded-lg border bg-muted/20" data-testid="contact-row-client">
                  <div className="flex gap-3 min-w-0 flex-1">
                    <div className="h-8 w-8 shrink-0 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                      <Users className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-medium" data-testid="text-contact-name-client">{customer.firstName} {customer.lastName}</span>
                        {contacts && contacts.some(c => c.isPrimary)
                          ? <Badge variant="secondary" className="text-xs">Client</Badge>
                          : <Badge className="text-xs bg-amber-500 dark:bg-amber-600 text-white border-amber-600 dark:border-amber-500"><Crown className="h-2.5 w-2.5 mr-0.5" />Primary</Badge>
                        }
                      </div>
                      {customer.address && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate" data-testid="text-address">
                          {customer.address}{customer.city ? `, ${customer.city}` : ""}{customer.state ? `, ${customer.state}` : ""}{customer.zipCode ? ` ${customer.zipCode}` : ""}
                        </p>
                      )}
                      {customer.phone && (
                        <a href={`tel:${customer.phone}`} className="text-xs text-muted-foreground block mt-0.5 hover:text-foreground truncate" data-testid="text-phone">
                          {formatPhone(customer.phone)}
                        </a>
                      )}
                      {customer.email && (
                        <a href={`mailto:${customer.email}`} className="text-xs text-muted-foreground block truncate hover:text-foreground" data-testid="text-email">
                          {customer.email}
                        </a>
                      )}
                      {customer.companyName && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                          <Building className="h-3 w-3" />{customer.companyName}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Additional contacts */}
                {contacts && contacts.map(contact => (
                  <div key={contact.id} className="flex items-start justify-between gap-2 p-3 rounded-lg border bg-muted/20" data-testid={`contact-row-${contact.id}`}>
                    {editingContact?.id === contact.id ? (
                      <div className="flex-1 space-y-2">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <Input placeholder="First Name *" value={contactForm.firstName} onChange={e => setContactForm(f => ({ ...f, firstName: e.target.value }))} className="h-7 text-sm" data-testid="input-edit-contact-first" />
                          <Input placeholder="Last Name" value={contactForm.lastName} onChange={e => setContactForm(f => ({ ...f, lastName: e.target.value }))} className="h-7 text-sm" data-testid="input-edit-contact-last" />
                          <Input placeholder="Phone" value={contactForm.phone} onChange={e => setContactForm(f => ({ ...f, phone: e.target.value }))} className="h-7 text-sm" data-testid="input-edit-contact-phone" />
                          <Input placeholder="Email" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} className="h-7 text-sm" data-testid="input-edit-contact-email" />
                          <Input placeholder="Role (e.g. Wife, Music Director)" value={contactForm.role} onChange={e => setContactForm(f => ({ ...f, role: e.target.value }))} className="h-7 text-sm sm:col-span-2" data-testid="input-edit-contact-role" />
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                            <input type="checkbox" checked={contactForm.isPrimary} onChange={e => setContactForm(f => ({ ...f, isPrimary: e.target.checked }))} data-testid="checkbox-edit-contact-primary" />
                            Set as Primary Contact
                          </label>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" className="h-7 text-xs" onClick={() => updateContactMutation.mutate({ id: contact.id, data: contactForm })} disabled={updateContactMutation.isPending || !contactForm.firstName} data-testid="button-save-contact-edit">Save</Button>
                          <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setEditingContact(null)}>Cancel</Button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex gap-3 min-w-0 flex-1">
                          <div className="h-8 w-8 shrink-0 rounded-full bg-muted flex items-center justify-center">
                            <Users className="h-4 w-4 text-muted-foreground" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium" data-testid={`text-contact-name-${contact.id}`}>{contact.firstName}{contact.lastName ? ` ${contact.lastName}` : ""}</span>
                              {contact.role && <Badge variant="secondary" className="text-xs">{contact.role}</Badge>}
                              {contact.isPrimary && <Badge className="text-xs bg-amber-500 dark:bg-amber-600 text-white border-amber-600 dark:border-amber-500"><Crown className="h-2.5 w-2.5 mr-0.5" />Primary</Badge>}
                            </div>
                            {contact.phone && <a href={`tel:${contact.phone}`} className="text-xs text-muted-foreground block mt-0.5 hover:text-foreground truncate" data-testid={`text-contact-phone-${contact.id}`}>{formatPhone(contact.phone)}</a>}
                            {contact.email && <a href={`mailto:${contact.email}`} className="text-xs text-muted-foreground block truncate hover:text-foreground" data-testid={`text-contact-email-${contact.id}`}>{contact.email}</a>}
                          </div>
                        </div>
                        <div className="flex items-center gap-0.5 shrink-0">
                          {!contact.isPrimary && (
                            <Button variant="ghost" size="icon" className="h-6 w-6" title="Set as Primary" onClick={() => setPrimaryContactMutation.mutate(contact.id)} disabled={setPrimaryContactMutation.isPending} data-testid={`button-set-primary-${contact.id}`}>
                              <Crown className="h-3 w-3" />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setContactForm({ firstName: contact.firstName, lastName: contact.lastName ?? "", phone: contact.phone ?? "", email: contact.email ?? "", role: contact.role ?? "", isPrimary: contact.isPrimary ?? false }); setEditingContact(contact); setShowAddContact(false); }} data-testid={`button-edit-contact-${contact.id}`}>
                            <Edit className="h-3 w-3" />
                          </Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => { if (confirm("Remove this contact?")) deleteContactMutation.mutate(contact.id); }} disabled={deleteContactMutation.isPending} data-testid={`button-delete-contact-${contact.id}`}>
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </>
                    )}
                  </div>
                ))}

                {/* New contact inline form */}
                {showAddContact && (
                  <div className="p-3 rounded-lg border bg-muted/20 space-y-2">
                    <div className="grid gap-2 sm:grid-cols-2">
                      <Input placeholder="First Name *" value={contactForm.firstName} onChange={e => setContactForm(f => ({ ...f, firstName: e.target.value }))} className="h-7 text-sm" data-testid="input-new-contact-first" />
                      <Input placeholder="Last Name" value={contactForm.lastName} onChange={e => setContactForm(f => ({ ...f, lastName: e.target.value }))} className="h-7 text-sm" data-testid="input-new-contact-last" />
                      <Input placeholder="Phone" value={contactForm.phone} onChange={e => setContactForm(f => ({ ...f, phone: e.target.value }))} className="h-7 text-sm" data-testid="input-new-contact-phone" />
                      <Input placeholder="Email" value={contactForm.email} onChange={e => setContactForm(f => ({ ...f, email: e.target.value }))} className="h-7 text-sm" data-testid="input-new-contact-email" />
                      <Input placeholder="Role (e.g. Wife, Music Director)" value={contactForm.role} onChange={e => setContactForm(f => ({ ...f, role: e.target.value }))} className="h-7 text-sm sm:col-span-2" data-testid="input-new-contact-role" />
                    </div>
                    <div className="flex items-center gap-2">
                      <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                        <input type="checkbox" checked={contactForm.isPrimary} onChange={e => setContactForm(f => ({ ...f, isPrimary: e.target.checked }))} data-testid="checkbox-new-contact-primary" />
                        Set as Primary Contact
                      </label>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" className="h-7 text-xs" onClick={() => createContactMutation.mutate(contactForm)} disabled={createContactMutation.isPending || !contactForm.firstName} data-testid="button-save-new-contact">Add</Button>
                      <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowAddContact(false)}>Cancel</Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Pianos ── */}
          {!isEditing && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base flex items-center gap-2">
                    Pianos
                    {customerPianos && customerPianos.length > 0 && (
                      <Badge variant="secondary" className="text-xs">{customerPianos.length}</Badge>
                    )}
                  </CardTitle>
                  <Dialog open={showAddPiano} onOpenChange={setShowAddPiano}>
                    <DialogTrigger asChild>
                      <Button size="sm" variant="outline" className="h-7 text-xs" data-testid="button-add-piano">
                        <Plus className="h-3 w-3 mr-1" /> New Piano
                      </Button>
                    </DialogTrigger>
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add Piano</DialogTitle>
                      </DialogHeader>
                      <div className="space-y-4 mt-2">
                        <div className="grid gap-3 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label>Make</Label>
                            <Input value={newPianoForm.make} onChange={(e) => setNewPianoForm({ ...newPianoForm, make: e.target.value })} placeholder="Steinway" data-testid="input-new-piano-make" />
                          </div>
                          <div className="space-y-1">
                            <Label>Model</Label>
                            <Input value={newPianoForm.model} onChange={(e) => setNewPianoForm({ ...newPianoForm, model: e.target.value })} placeholder="Model B" data-testid="input-new-piano-model" />
                          </div>
                          <div className="space-y-1">
                            <Label>Type</Label>
                            <Input value={newPianoForm.pianoType} onChange={(e) => setNewPianoForm({ ...newPianoForm, pianoType: e.target.value })} placeholder="Grand" data-testid="input-new-piano-type" />
                          </div>
                          <div className="space-y-1">
                            <Label>Year</Label>
                            <Input value={newPianoForm.year} onChange={(e) => setNewPianoForm({ ...newPianoForm, year: e.target.value })} placeholder="1985" data-testid="input-new-piano-year" />
                          </div>
                          <div className="space-y-1">
                            <Label>Last Tuned (M/D/YY)</Label>
                            <Input value={newPianoForm.lastTuned} onChange={(e) => setNewPianoForm({ ...newPianoForm, lastTuned: e.target.value })} placeholder="1/15/25" data-testid="input-new-piano-tuned" />
                          </div>
                          <div className="space-y-1">
                            <Label>Serial Number</Label>
                            <Input value={newPianoForm.serialNumber} onChange={(e) => setNewPianoForm({ ...newPianoForm, serialNumber: e.target.value })} placeholder="e.g. 123456" data-testid="input-new-piano-serial" />
                          </div>
                          <div className="space-y-1">
                            <Label>Location</Label>
                            <Input value={newPianoForm.location} onChange={(e) => setNewPianoForm({ ...newPianoForm, location: e.target.value })} placeholder="e.g. Living room" data-testid="input-new-piano-location" />
                          </div>
                        </div>
                        <div className="space-y-1">
                          <Label>Notes</Label>
                          <Textarea value={newPianoForm.notes} onChange={(e) => setNewPianoForm({ ...newPianoForm, notes: e.target.value })} placeholder="Piano details..." data-testid="input-new-piano-notes" />
                        </div>
                        <div className="flex justify-end gap-2">
                          <Button variant="secondary" onClick={() => setShowAddPiano(false)}>Cancel</Button>
                          <Button onClick={() => addPianoMutation.mutate(newPianoForm)} disabled={addPianoMutation.isPending} data-testid="button-save-new-piano">
                            {addPianoMutation.isPending ? "Adding..." : "Add Piano"}
                          </Button>
                        </div>
                      </div>
                    </DialogContent>
                  </Dialog>
                </div>
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
                    const pianoLabel = [piano.year, piano.make, piano.model].filter(Boolean).join(" ") || "Unnamed Piano";
                    const intervalMonths = piano.tuningInterval ? parseInt(piano.tuningInterval) : null;
                    const nextDue = getNextTuningDue(piano.lastTuned, intervalMonths);
                    const months = getMonthsSince(piano.lastTuned);
                    const heroPhoto = piano.photos && piano.photos.length > 0 ? piano.photos[0] : null;

                    return (
                      <Link key={piano.id} href={`/pianos/${piano.id}`}>
                        <div
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/30 transition-colors ${isInactive ? "opacity-60" : ""}`}
                          data-testid={`piano-card-${piano.id}`}
                        >
                          {heroPhoto ? (
                            <img src={heroPhoto} alt="Piano" className="h-11 w-11 shrink-0 object-cover rounded-md border" />
                          ) : (
                            <div className="h-11 w-11 shrink-0 rounded-md bg-primary/10 flex items-center justify-center border border-primary/20">
                              <Music className="h-5 w-5 text-primary/40" />
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-sm font-medium truncate" data-testid={`piano-name-${piano.id}`}>{pianoLabel}</span>
                              {isInactive && <Badge variant="secondary" className="text-xs shrink-0">Inactive</Badge>}
                            </div>
                            {piano.serialNumber && (
                              <p className="text-xs text-muted-foreground">{piano.serialNumber}</p>
                            )}
                            <p className="text-xs text-muted-foreground">
                              Next tuning due: {piano.lastTuned ? nextDue : "Unknown"}
                            </p>
                            <div className="flex flex-wrap gap-1 mt-1">
                              <Badge variant="secondary" className="text-[10px] px-1.5 py-0 uppercase tracking-wide">
                                Last tuned: {piano.lastTuned || "Never"}
                              </Badge>
                              {piano.tuningInterval && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 uppercase tracking-wide">
                                  Every {piano.tuningInterval} months
                                </Badge>
                              )}
                              {isInactive && (
                                <Badge variant="secondary" className="text-[10px] px-1.5 py-0 uppercase tracking-wide bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800">
                                  Inactive
                                </Badge>
                              )}
                              {!isInactive && months !== null && months >= 12 && (
                                <Badge className="text-[10px] px-1.5 py-0 uppercase tracking-wide bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 border-orange-200 dark:border-orange-800">
                                  Overdue
                                </Badge>
                              )}
                            </div>
                          </div>
                          <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                        </div>
                      </Link>
                    );
                  })
                )}
              </CardContent>
            </Card>
          )}

          {/* ── Notes ── */}
          {!isEditing && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 pt-0">
                {/* Personal notes */}
                <div className="flex items-start gap-3 p-3 rounded-lg border bg-muted/20">
                  <div className="h-8 w-8 shrink-0 rounded-md bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
                    <FileText className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-muted-foreground mb-0.5">Personal notes</p>
                    <p className="text-sm whitespace-pre-wrap" data-testid="text-notes">
                      {customer.personalNotes || <span className="text-muted-foreground italic">None</span>}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={startEditing} data-testid="button-edit-notes" title="Edit notes">
                    <Edit className="h-3 w-3" />
                  </Button>
                </div>

                {/* Last contacted */}
                <div className="flex items-center gap-3 p-3 rounded-lg border bg-muted/20">
                  <div className="h-8 w-8 shrink-0 rounded-md bg-muted flex items-center justify-center">
                    <PhoneCall className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-muted-foreground mb-0.5">Last contacted</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium" data-testid="text-last-contacted">
                        {customer.lastContacted || customer.lastTuned || "Never"}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-6 text-xs px-2"
                        onClick={() => {
                          const now = new Date();
                          const dateStr = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear().toString().slice(-2)}`;
                          markContactedMutation.mutate(dateStr);
                        }}
                        disabled={markContactedMutation.isPending}
                        data-testid="button-mark-contacted-today"
                      >
                        Today
                      </Button>
                      <Input
                        type="text"
                        placeholder="M/D/YY"
                        className="h-6 text-xs w-20 px-1.5"
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
                </div>
              </CardContent>
            </Card>
          )}

        </div>

        {/* ── Timeline ── */}
        <div className="min-w-0">
          <ClientTimeline
            customerId={customerId!}
            pianos={customerPianos}
            onOpenAppointment={(appt) => setDetailAppt(appt)}
          />
        </div>
      </div>

      <AppointmentDialog
        open={showAppointmentDialog}
        onOpenChange={setShowAppointmentDialog}
        customerId={customer.id}
        pianoId={appointmentPianoId}
        customerName={`${customer.firstName} ${customer.lastName}`}
      />

      <AppointmentDetailDialog
        appointment={detailAppt}
        open={!!detailAppt}
        onOpenChange={(open) => { if (!open) setDetailAppt(null); }}
      />
    </div>
  );
}
