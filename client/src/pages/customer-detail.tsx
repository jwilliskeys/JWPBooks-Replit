import { useState } from "react";
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
  Piano,
  Edit,
  Trash2,
  Plus,
  Building,
  FileText,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Customer, ServiceRecord } from "@shared/schema";
import { Link } from "wouter";

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

function getStatusInfo(dateStr: string | null | undefined) {
  const months = getMonthsSince(dateStr);
  if (months === null) return { label: "No record", variant: "secondary" as const, color: "" };
  if (months >= 12) return { label: "Overdue", variant: "destructive" as const, color: "" };
  if (months >= 6) return { label: "Due soon", variant: "secondary" as const, color: "" };
  return { label: "Current", variant: "default" as const, color: "bg-emerald-600 dark:bg-emerald-700 text-white border-emerald-700 dark:border-emerald-600" };
}

export default function CustomerDetail() {
  const [, params] = useRoute("/customers/:id");
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [isEditing, setIsEditing] = useState(false);
  const [showServiceDialog, setShowServiceDialog] = useState(false);
  const [editForm, setEditForm] = useState<Partial<Customer>>({});
  const [serviceForm, setServiceForm] = useState({
    serviceDate: new Date().toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" }),
    serviceType: "tuning",
    notes: "",
    cost: "",
  });

  const customerId = params?.id;

  const { data: customer, isLoading } = useQuery<Customer>({
    queryKey: ["/api/customers", customerId],
    enabled: !!customerId,
  });

  const { data: serviceRecords } = useQuery<ServiceRecord[]>({
    queryKey: ["/api/customers", customerId, "services"],
    enabled: !!customerId,
  });

  const updateMutation = useMutation({
    mutationFn: (data: Partial<Customer>) =>
      apiRequest("PATCH", `/api/customers/${customerId}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setIsEditing(false);
      toast({ title: "Customer updated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to update customer", variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/customers/${customerId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      navigate("/customers");
      toast({ title: "Customer deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete customer", variant: "destructive" });
    },
  });

  const addServiceMutation = useMutation({
    mutationFn: (data: any) =>
      apiRequest("POST", `/api/customers/${customerId}/services`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers", customerId, "services"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setShowServiceDialog(false);
      setServiceForm({ serviceDate: "", serviceType: "tuning", notes: "", cost: "" });
      toast({ title: "Service record added" });
    },
    onError: () => {
      toast({ title: "Failed to add service record", variant: "destructive" });
    },
  });

  if (isLoading) {
    return (
      <div className="p-6 max-w-4xl mx-auto space-y-6">
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
      <div className="p-6 max-w-4xl mx-auto text-center py-20">
        <h2 className="text-lg font-semibold">Customer not found</h2>
        <Link href="/customers">
          <Button variant="ghost" className="mt-4" data-testid="link-back-to-customers">
            <ArrowLeft className="h-4 w-4 mr-2" /> Back to Customers
          </Button>
        </Link>
      </div>
    );
  }

  const status = getStatusInfo(customer.lastTuned);

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
      pianoType: customer.pianoType,
      lastTuned: customer.lastTuned,
      personalNotes: customer.personalNotes,
    });
    setIsEditing(true);
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3 flex-wrap">
        <Link href="/customers">
          <Button variant="ghost" size="icon" data-testid="button-back">
            <ArrowLeft className="h-4 w-4" />
          </Button>
        </Link>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 flex-wrap">
            <h1 className="text-2xl font-bold tracking-tight" data-testid="text-customer-name">
              {customer.firstName} {customer.lastName}
            </h1>
            <Badge variant={status.variant} className={`no-default-active-elevate ${status.color}`}>
              {status.label}
            </Badge>
          </div>
          {customer.companyName && (
            <p className="text-muted-foreground text-sm mt-0.5">{customer.companyName}</p>
          )}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="secondary"
            size="sm"
            onClick={startEditing}
            data-testid="button-edit"
          >
            <Edit className="h-3 w-3 mr-1.5" /> Edit
          </Button>
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (confirm("Are you sure you want to delete this customer?")) {
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
            <CardTitle className="text-base">Edit Customer</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label>First Name</Label>
                <Input
                  value={editForm.firstName || ""}
                  onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })}
                  data-testid="input-edit-first-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Last Name</Label>
                <Input
                  value={editForm.lastName || ""}
                  onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })}
                  data-testid="input-edit-last-name"
                />
              </div>
              <div className="space-y-2">
                <Label>Company</Label>
                <Input
                  value={editForm.companyName || ""}
                  onChange={(e) => setEditForm({ ...editForm, companyName: e.target.value })}
                  data-testid="input-edit-company"
                />
              </div>
              <div className="space-y-2">
                <Label>Piano</Label>
                <Input
                  value={editForm.pianoType || ""}
                  onChange={(e) => setEditForm({ ...editForm, pianoType: e.target.value })}
                  data-testid="input-edit-piano"
                />
              </div>
              <div className="space-y-2">
                <Label>Email</Label>
                <Input
                  value={editForm.email || ""}
                  onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
                  data-testid="input-edit-email"
                />
              </div>
              <div className="space-y-2">
                <Label>Phone</Label>
                <Input
                  value={editForm.phone || ""}
                  onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                  data-testid="input-edit-phone"
                />
              </div>
              <div className="space-y-2 sm:col-span-2">
                <Label>Address</Label>
                <Input
                  value={editForm.address || ""}
                  onChange={(e) => setEditForm({ ...editForm, address: e.target.value })}
                  data-testid="input-edit-address"
                />
              </div>
              <div className="space-y-2">
                <Label>City</Label>
                <Input
                  value={editForm.city || ""}
                  onChange={(e) => setEditForm({ ...editForm, city: e.target.value })}
                  data-testid="input-edit-city"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>State</Label>
                  <Input
                    value={editForm.state || ""}
                    onChange={(e) => setEditForm({ ...editForm, state: e.target.value })}
                    data-testid="input-edit-state"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Zip Code</Label>
                  <Input
                    value={editForm.zipCode || ""}
                    onChange={(e) => setEditForm({ ...editForm, zipCode: e.target.value })}
                    data-testid="input-edit-zip"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Last Tuned (M/D/YY)</Label>
                <Input
                  value={editForm.lastTuned || ""}
                  onChange={(e) => setEditForm({ ...editForm, lastTuned: e.target.value })}
                  data-testid="input-edit-last-tuned"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Personal Notes</Label>
              <Textarea
                value={editForm.personalNotes || ""}
                onChange={(e) => setEditForm({ ...editForm, personalNotes: e.target.value })}
                className="min-h-[100px]"
                data-testid="input-edit-notes"
              />
            </div>
            <div className="flex gap-2 justify-end flex-wrap">
              <Button variant="secondary" onClick={() => setIsEditing(false)} data-testid="button-cancel-edit">
                Cancel
              </Button>
              <Button
                onClick={() => updateMutation.mutate(editForm)}
                disabled={updateMutation.isPending}
                data-testid="button-save-edit"
              >
                {updateMutation.isPending ? "Saving..." : "Save Changes"}
              </Button>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                Contact Information
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {customer.phone && (
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Phone</p>
                    <a href={`tel:${customer.phone}`} className="text-sm font-medium" data-testid="text-phone">
                      {customer.phone}
                    </a>
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
                    <a href={`mailto:${customer.email}`} className="text-sm font-medium" data-testid="text-email">
                      {customer.email}
                    </a>
                  </div>
                </div>
              )}
              {customer.address && (
                <div className="flex items-center gap-3">
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
              {!customer.phone && !customer.email && !customer.address && (
                <p className="text-sm text-muted-foreground text-center py-4">No contact information available</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                Piano Details
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {customer.pianoType && (
                <div className="flex items-center gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                    <Piano className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Piano Type</p>
                    <p className="text-sm font-medium" data-testid="text-piano">{customer.pianoType}</p>
                  </div>
                </div>
              )}
              <div className="flex items-center gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                  <CalendarDays className="h-4 w-4 text-muted-foreground" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Last Tuned</p>
                  <p className="text-sm font-medium" data-testid="text-last-tuned">
                    {customer.lastTuned || "No record"}
                  </p>
                </div>
              </div>
              {customer.personalNotes && (
                <div className="flex items-start gap-3">
                  <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted shrink-0">
                    <FileText className="h-4 w-4 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">Notes</p>
                    <p className="text-sm whitespace-pre-wrap" data-testid="text-notes">
                      {customer.personalNotes}
                    </p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
          <CardTitle className="text-base">Service History</CardTitle>
          <Dialog open={showServiceDialog} onOpenChange={setShowServiceDialog}>
            <DialogTrigger asChild>
              <Button size="sm" data-testid="button-add-service">
                <Plus className="h-3 w-3 mr-1.5" /> Add Record
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
                  <Select
                    value={serviceForm.serviceType}
                    onValueChange={(v) => setServiceForm({ ...serviceForm, serviceType: v })}
                  >
                    <SelectTrigger data-testid="select-service-type">
                      <SelectValue />
                    </SelectTrigger>
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
                  <Input
                    value={serviceForm.cost}
                    onChange={(e) => setServiceForm({ ...serviceForm, cost: e.target.value })}
                    placeholder="$150"
                    data-testid="input-service-cost"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Notes</Label>
                  <Textarea
                    value={serviceForm.notes}
                    onChange={(e) => setServiceForm({ ...serviceForm, notes: e.target.value })}
                    placeholder="Service details..."
                    data-testid="input-service-notes"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="secondary" onClick={() => setShowServiceDialog(false)} data-testid="button-cancel-service">
                    Cancel
                  </Button>
                  <Button
                    onClick={() => addServiceMutation.mutate(serviceForm)}
                    disabled={addServiceMutation.isPending}
                    data-testid="button-save-service"
                  >
                    {addServiceMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent>
          {!serviceRecords || serviceRecords.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <CalendarDays className="h-8 w-8 mx-auto mb-2 opacity-40" />
              <p className="text-sm">No service records yet</p>
              <p className="text-xs mt-1">Add a service record to start tracking</p>
            </div>
          ) : (
            <div className="space-y-2">
              {serviceRecords.map((record) => (
                <div
                  key={record.id}
                  className="flex items-center justify-between gap-3 p-3 rounded-md bg-muted/50"
                  data-testid={`service-record-${record.id}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                      <CalendarDays className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {record.serviceType.charAt(0).toUpperCase() + record.serviceType.slice(1)}
                      </p>
                      <p className="text-xs text-muted-foreground">{record.serviceDate}</p>
                      {record.notes && (
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">{record.notes}</p>
                      )}
                    </div>
                  </div>
                  {record.cost && (
                    <span className="text-sm font-medium shrink-0">{record.cost}</span>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
