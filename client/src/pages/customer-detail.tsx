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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowLeft,
  Phone,
  Mail,
  MapPin,
  CalendarDays,
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
  Clock,
  CheckCircle,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Customer, Piano, ServiceRecord, Appointment } from "@shared/schema";
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

function getStatusBadge(dateStr: string | null | undefined) {
  const months = getMonthsSince(dateStr);
  if (months === null) return <Badge variant="secondary">No record</Badge>;
  if (months >= 24) return <Badge variant="destructive">Overdue</Badge>;
  if (months >= 12) return <Badge className="bg-orange-500 dark:bg-orange-600 text-white border-orange-600 dark:border-orange-500">Overdue</Badge>;
  if (months >= 6) return <Badge variant="secondary">Due soon</Badge>;
  return <Badge className="bg-emerald-600 dark:bg-emerald-700 text-white border-emerald-700 dark:border-emerald-600">Recently Tuned</Badge>;
}

function PianoCard({ piano, customerId, onScheduleAppointment }: { piano: Piano; customerId: string; onScheduleAppointment?: (pianoId: number) => void }) {
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [showServiceDialog, setShowServiceDialog] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Piano>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [serviceForm, setServiceForm] = useState({
    serviceDate: new Date().toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" }),
    serviceType: "tuning",
    notes: "",
    cost: "",
  });

  const { data: serviceRecords } = useQuery<ServiceRecord[]>({
    queryKey: ["/api/pianos", piano.id, "services"],
  });

  const updatePianoMutation = useMutation({
    mutationFn: (data: Partial<Piano>) =>
      apiRequest("PATCH", `/api/pianos/${piano.id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "pianos"] });
      setIsEditing(false);
      toast({ title: "Piano updated" });
    },
    onError: () => {
      toast({ title: "Failed to update piano", variant: "destructive" });
    },
  });

  const deletePianoMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/pianos/${piano.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "pianos"] });
      toast({ title: "Piano removed" });
    },
    onError: () => {
      toast({ title: "Failed to remove piano", variant: "destructive" });
    },
  });

  const addServiceMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest("POST", `/api/pianos/${piano.id}/services`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/pianos", piano.id, "services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "pianos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setShowServiceDialog(false);
      setServiceForm({ serviceDate: "", serviceType: "tuning", notes: "", cost: "" });
      toast({ title: "Service record added" });
    },
    onError: () => {
      toast({ title: "Failed to add service record", variant: "destructive" });
    },
  });

  const uploadPhotosMutation = useMutation({
    mutationFn: async (files: FileList) => {
      const formData = new FormData();
      Array.from(files).forEach((file) => formData.append("photos", file));
      const res = await fetch(`/api/pianos/${piano.id}/photos`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Upload failed");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "pianos"] });
      toast({ title: "Photos uploaded" });
    },
    onError: () => {
      toast({ title: "Failed to upload photos", variant: "destructive" });
    },
  });

  const deletePhotoMutation = useMutation({
    mutationFn: (photoUrl: string) =>
      apiRequest("DELETE", `/api/pianos/${piano.id}/photos`, { photoUrl }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "pianos"] });
      toast({ title: "Photo removed" });
    },
  });

  const startEditing = () => {
    setEditForm({
      make: piano.make,
      model: piano.model,
      pianoType: piano.pianoType,
      year: piano.year,
      notes: piano.notes,
      lastTuned: piano.lastTuned,
    });
    setIsEditing(true);
  };

  const pianoLabel = [piano.make, piano.model, piano.pianoType].filter(Boolean).join(" ") || "Unnamed Piano";

  return (
    <Card data-testid={`piano-card-${piano.id}`}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-3">
        <div className="flex items-center gap-2 min-w-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Music className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <CardTitle className="text-base truncate" data-testid={`piano-name-${piano.id}`}>{pianoLabel}</CardTitle>
            {piano.year && <p className="text-xs text-muted-foreground">Year: {piano.year}</p>}
          </div>
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {getStatusBadge(piano.lastTuned)}
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={startEditing} data-testid={`button-edit-piano-${piano.id}`}>
            <Edit className="h-3 w-3" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-destructive"
            onClick={() => {
              if (confirm("Remove this piano and its service history?")) {
                deletePianoMutation.mutate();
              }
            }}
            data-testid={`button-delete-piano-${piano.id}`}
          >
            <Trash2 className="h-3 w-3" />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {isEditing ? (
          <div className="space-y-3 p-3 bg-muted/50 rounded-md">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <Label className="text-xs">Make</Label>
                <Input value={editForm.make || ""} onChange={(e) => setEditForm({ ...editForm, make: e.target.value })} placeholder="Steinway" data-testid={`input-piano-make-${piano.id}`} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Model</Label>
                <Input value={editForm.model || ""} onChange={(e) => setEditForm({ ...editForm, model: e.target.value })} placeholder="Model B" data-testid={`input-piano-model-${piano.id}`} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Type</Label>
                <Input value={editForm.pianoType || ""} onChange={(e) => setEditForm({ ...editForm, pianoType: e.target.value })} placeholder="Grand" data-testid={`input-piano-type-${piano.id}`} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Year</Label>
                <Input value={editForm.year || ""} onChange={(e) => setEditForm({ ...editForm, year: e.target.value })} placeholder="1985" data-testid={`input-piano-year-${piano.id}`} />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Last Tuned (M/D/YY)</Label>
                <Input value={editForm.lastTuned || ""} onChange={(e) => setEditForm({ ...editForm, lastTuned: e.target.value })} placeholder="1/15/25" data-testid={`input-piano-tuned-${piano.id}`} />
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">Notes</Label>
              <Textarea value={editForm.notes || ""} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} className="min-h-[60px]" data-testid={`input-piano-notes-${piano.id}`} />
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="secondary" size="sm" onClick={() => setIsEditing(false)}>Cancel</Button>
              <Button size="sm" onClick={() => updatePianoMutation.mutate(editForm)} disabled={updatePianoMutation.isPending} data-testid={`button-save-piano-${piano.id}`}>
                {updatePianoMutation.isPending ? "Saving..." : "Save"}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="grid gap-2 sm:grid-cols-2 text-sm">
              {piano.make && (
                <div><span className="text-muted-foreground text-xs">Make:</span> <span className="font-medium">{piano.make}</span></div>
              )}
              {piano.model && (
                <div><span className="text-muted-foreground text-xs">Model:</span> <span className="font-medium">{piano.model}</span></div>
              )}
              {piano.pianoType && (
                <div><span className="text-muted-foreground text-xs">Type:</span> <span className="font-medium">{piano.pianoType}</span></div>
              )}
              {piano.year && (
                <div><span className="text-muted-foreground text-xs">Year:</span> <span className="font-medium">{piano.year}</span></div>
              )}
              <div>
                <span className="text-muted-foreground text-xs">Last Tuned:</span>{" "}
                <span className="font-medium">{piano.lastTuned || "No record"}</span>
              </div>
            </div>
            {piano.notes && (
              <div className="text-sm">
                <span className="text-muted-foreground text-xs">Notes:</span>
                <p className="whitespace-pre-wrap mt-0.5">{piano.notes}</p>
              </div>
            )}
          </>
        )}

        {(piano.photos && piano.photos.length > 0) && (
          <div className="space-y-2">
            <p className="text-xs text-muted-foreground font-medium">Photos</p>
            <div className="flex flex-wrap gap-2">
              {piano.photos.map((photo, idx) => (
                <div key={idx} className="relative group">
                  <img src={photo} alt={`Piano photo ${idx + 1}`} className="h-20 w-20 object-cover rounded-md border" data-testid={`piano-photo-${piano.id}-${idx}`} />
                  <button
                    onClick={() => deletePhotoMutation.mutate(photo)}
                    className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full h-5 w-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    data-testid={`button-remove-photo-${piano.id}-${idx}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files && e.target.files.length > 0) {
                uploadPhotosMutation.mutate(e.target.files);
                e.target.value = "";
              }
            }}
          />
          <Button
            variant="outline"
            size="sm"
            className="text-xs"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploadPhotosMutation.isPending}
            data-testid={`button-upload-photo-${piano.id}`}
          >
            <ImagePlus className="h-3 w-3 mr-1" />
            {uploadPhotosMutation.isPending ? "Uploading..." : "Add Photos"}
          </Button>
          {onScheduleAppointment && (
            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => onScheduleAppointment(piano.id)}
              data-testid={`button-schedule-piano-${piano.id}`}
            >
              <Calendar className="h-3 w-3 mr-1" />
              Schedule
            </Button>
          )}
        </div>

        <div className="border-t pt-3">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium">Service History</p>
            <Dialog open={showServiceDialog} onOpenChange={setShowServiceDialog}>
              <DialogTrigger asChild>
                <Button size="sm" variant="outline" className="text-xs h-7" data-testid={`button-add-service-${piano.id}`}>
                  <Plus className="h-3 w-3 mr-1" /> Add Record
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Service Record</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 mt-2">
                  <div className="space-y-2">
                    <Label>Service Date (M/D/YY)</Label>
                    <Input
                      value={serviceForm.serviceDate}
                      onChange={(e) => setServiceForm({ ...serviceForm, serviceDate: e.target.value })}
                      placeholder="1/15/25"
                      data-testid="input-service-date"
                    />
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
                    <Button variant="secondary" onClick={() => setShowServiceDialog(false)}>Cancel</Button>
                    <Button onClick={() => addServiceMutation.mutate(serviceForm)} disabled={addServiceMutation.isPending} data-testid="button-save-service">
                      {addServiceMutation.isPending ? "Saving..." : "Save"}
                    </Button>
                  </div>
                </div>
              </DialogContent>
            </Dialog>
          </div>
          {!serviceRecords || serviceRecords.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-3">No service records yet</p>
          ) : (
            <div className="space-y-1.5">
              {serviceRecords.map((record) => (
                <div key={record.id} className="flex items-center justify-between gap-2 p-2 rounded bg-muted/40 text-sm" data-testid={`service-record-${record.id}`}>
                  <div className="min-w-0">
                    <span className="font-medium">{record.serviceType.charAt(0).toUpperCase() + record.serviceType.slice(1)}</span>
                    <span className="text-muted-foreground ml-2 text-xs">{record.serviceDate}</span>
                    {record.notes && <p className="text-xs text-muted-foreground truncate mt-0.5">{record.notes}</p>}
                  </div>
                  {record.cost && <span className="text-sm font-medium shrink-0">{record.cost}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
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
  const [editForm, setEditForm] = useState<Partial<Customer>>({});
  const [newPianoForm, setNewPianoForm] = useState({
    make: "",
    model: "",
    pianoType: "",
    year: "",
    notes: "",
    lastTuned: "",
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

  const { data: customerAppointments } = useQuery<Appointment[]>({
    queryKey: ["/api/customers", customerId, "appointments"],
    enabled: !!customerId,
  });

  const completeAppointmentMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("PATCH", `/api/appointments/${id}`, { status: "completed" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "appointments"] });
      toast({ title: "Appointment completed" });
    },
  });

  const deleteAppointmentMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/appointments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "appointments"] });
      toast({ title: "Appointment deleted" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Customer>) =>
      apiRequest("PATCH", `/api/customers/${customerId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setIsEditing(false);
      toast({ title: "Client updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update client", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/customers/${customerId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      navigate("/customers");
      toast({ title: "Client deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete client", variant: "destructive" });
    },
  });

  const addPianoMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest("POST", `/api/customers/${customerId}/pianos`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "pianos"] });
      setShowAddPiano(false);
      setNewPianoForm({ make: "", model: "", pianoType: "", year: "", notes: "", lastTuned: "" });
      toast({ title: "Piano added" });
    },
    onError: () => {
      toast({ title: "Failed to add piano", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4 sm:space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 sm:grid-cols-2">
          <Skeleton className="h-48" />
          <Skeleton className="h-48" />
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
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Clients
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

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4 sm:space-y-6">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <Link href="/customers">
            <Button variant="ghost" size="icon" data-testid="button-back">
              <ArrowLeft className="h-4 w-4" />
            </Button>
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight truncate" data-testid="text-customer-name">
              {customer.firstName} {customer.lastName}
            </h1>
            {customer.companyName && (
              <p className="text-muted-foreground text-sm mt-0.5 truncate">{customer.companyName}</p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            onClick={() => {
              setAppointmentPianoId(undefined);
              setShowAppointmentDialog(true);
            }}
            data-testid="button-schedule-appointment"
          >
            <Calendar className="h-3 w-3 mr-1.5" /> Schedule
          </Button>
          <Button variant="secondary" size="sm" onClick={startEditing} data-testid="button-edit">
            <Edit className="h-3 w-3 mr-1.5" /> Edit
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (confirm("Are you sure you want to delete this client and all their pianos?")) {
                deleteMutation.mutate();
              }
            }}
            data-testid="button-delete"
          >
            <Trash2 className="h-3 w-3 mr-1.5" /> Delete
          </Button>
        </div>
      </div>

      {isEditing ? (
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
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Contact Information</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              {customer.phone && (
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Phone</p>
                    <a href={`tel:${customer.phone}`} className="text-sm font-medium" data-testid="text-phone">{customer.phone}</a>
                  </div>
                </div>
              )}
              {customer.email && (
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Email</p>
                    <a href={`mailto:${customer.email}`} className="text-sm font-medium" data-testid="text-email">{customer.email}</a>
                  </div>
                </div>
              )}
              {customer.address && (
                <div className="flex items-center gap-3 sm:col-span-2">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Address</p>
                    <p className="text-sm font-medium" data-testid="text-address">
                      {customer.address}
                      {customer.city && <>, {customer.city}</>}
                      {customer.state && <>, {customer.state}</>}
                      {customer.zipCode && <> {customer.zipCode}</>}
                    </p>
                  </div>
                </div>
              )}
              {customer.companyName && (
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                    <Building className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Company</p>
                    <p className="text-sm font-medium" data-testid="text-company">{customer.companyName}</p>
                  </div>
                </div>
              )}
            </div>
            {customer.personalNotes && (
              <div className="flex items-start gap-3 pt-2 border-t">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted shrink-0">
                  <FileText className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Notes</p>
                  <p className="text-sm whitespace-pre-wrap" data-testid="text-notes">{customer.personalNotes}</p>
                </div>
              </div>
            )}
            {!customer.phone && !customer.email && !customer.address && (
              <p className="text-sm text-muted-foreground text-center py-4">No contact information available</p>
            )}
          </CardContent>
        </Card>
      )}

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <PianoIcon className="h-5 w-5" /> Pianos
            {customerPianos && <Badge variant="secondary">{customerPianos.length}</Badge>}
          </h2>
          <Dialog open={showAddPiano} onOpenChange={setShowAddPiano}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-add-piano">
                <Plus className="h-3 w-3 mr-1.5" /> Add Piano
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

        {!customerPianos || customerPianos.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12">
              <PianoIcon className="h-10 w-10 text-muted-foreground/30 mb-3" />
              <h3 className="font-medium text-sm">No pianos registered</h3>
              <p className="text-sm text-muted-foreground mt-1">Add a piano to start tracking service history</p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-4">
            {customerPianos.map((piano) => (
              <PianoCard
                key={piano.id}
                piano={piano}
                customerId={customerId!}
                onScheduleAppointment={(pianoId) => {
                  setAppointmentPianoId(pianoId);
                  setShowAppointmentDialog(true);
                }}
              />
            ))}
          </div>
        )}
      </div>

      {customerAppointments && customerAppointments.length > 0 && (
        <div className="space-y-4">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Calendar className="h-5 w-5" /> Appointments
            <Badge variant="secondary">{customerAppointments.length}</Badge>
          </h2>
          <div className="space-y-2">
            {customerAppointments.map((appt) => {
              const isCompleted = appt.status === "completed";
              const piano = customerPianos?.find((p) => p.id === appt.pianoId);
              const pianoLabel = piano ? [piano.make, piano.model, piano.pianoType].filter(Boolean).join(" ") : null;
              return (
                <Card key={appt.id} className={isCompleted ? "opacity-60" : ""} data-testid={`client-appointment-${appt.id}`}>
                  <CardContent className="py-3 px-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-sm font-medium">{appt.date} at {appt.time}</span>
                          {appt.isTuning && (
                            <Badge variant="secondary" className="text-xs">
                              <Music className="h-3 w-3 mr-1" />Tuning
                            </Badge>
                          )}
                          <Badge variant={isCompleted ? "secondary" : "default"} className="text-xs">
                            {isCompleted ? "Completed" : "Scheduled"}
                          </Badge>
                        </div>
                        {pianoLabel && (
                          <p className="text-xs text-muted-foreground">Piano: {pianoLabel}</p>
                        )}
                        {appt.servicesRequested && (
                          <p className="text-sm mt-0.5">{appt.servicesRequested}</p>
                        )}
                        <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                          {appt.priceEstimate && <span className="font-medium text-foreground">{appt.priceEstimate}</span>}
                          {appt.notes && <span>{appt.notes}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        {!isCompleted && (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => completeAppointmentMutation.mutate(appt.id)}
                            disabled={completeAppointmentMutation.isPending}
                            data-testid={`button-complete-appt-${appt.id}`}
                          >
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Done
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7 text-destructive"
                          onClick={() => {
                            if (confirm("Delete this appointment?")) {
                              deleteAppointmentMutation.mutate(appt.id);
                            }
                          }}
                          data-testid={`button-delete-appt-${appt.id}`}
                        >
                          <Trash2 className="h-3 w-3" />
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      )}

      <AppointmentDialog
        open={showAppointmentDialog}
        onOpenChange={setShowAppointmentDialog}
        customerId={customer.id}
        pianoId={appointmentPianoId}
        customerName={`${customer.firstName} ${customer.lastName}`}
      />
    </div>
  );
}
