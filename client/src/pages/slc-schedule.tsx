import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Plus,
  Trash2,
  MapPin,
  Clock,
  DollarSign,
  Calendar,
  CheckCircle,
  X,
  Search,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Trip, TripAppointment, Customer } from "@shared/schema";

function parseDateStr(dateStr: string): Date {
  if (!dateStr) return new Date(NaN);
  const parts = dateStr.split("/");
  if (parts.length !== 3) return new Date(NaN);
  const month = parseInt(parts[0]);
  const day = parseInt(parts[1]);
  let year = parseInt(parts[2]);
  if (isNaN(month) || isNaN(day) || isNaN(year)) return new Date(NaN);
  if (year < 100) year += 2000;
  return new Date(year, month - 1, day);
}

function formatDateStr(date: Date): string {
  return `${date.getMonth() + 1}/${date.getDate()}/${String(date.getFullYear()).slice(2)}`;
}

function getDayName(date: Date): string {
  return date.toLocaleDateString("en-US", { weekday: "long" });
}

function getDatesInRange(startStr: string, endStr: string): string[] {
  const start = parseDateStr(startStr);
  const end = parseDateStr(endStr);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) return [];
  const dates: string[] = [];
  const current = new Date(start);
  while (current <= end) {
    dates.push(formatDateStr(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function parsePrice(str: string | null | undefined): number {
  if (!str) return 0;
  const num = parseFloat(str.replace(/[^0-9.]/g, ""));
  return isNaN(num) ? 0 : num;
}

export default function SlcSchedule() {
  const { toast } = useToast();
  const [tripName, setTripName] = useState("");
  const [tripStart, setTripStart] = useState("");
  const [tripEnd, setTripEnd] = useState("");
  const [tripNotes, setTripNotes] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogDate, setDialogDate] = useState("");
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [apptTime, setApptTime] = useState("10:00 AM");
  const [apptDuration, setApptDuration] = useState("2 hours");
  const [apptServices, setApptServices] = useState("");
  const [apptPrice, setApptPrice] = useState("");
  const [apptNotes, setApptNotes] = useState("");
  const [apptServiceArea, setApptServiceArea] = useState("");

  const { data: trips, isLoading: tripsLoading } = useQuery<Trip[]>({
    queryKey: ["/api/trips"],
  });

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const activeTrip = trips && trips.length > 0 ? trips[0] : null;

  const { data: tripAppointments } = useQuery<TripAppointment[]>({
    queryKey: ["/api/trips", activeTrip?.id, "appointments"],
    enabled: !!activeTrip,
  });

  const customerMap = useMemo(
    () => new Map(customers?.map((c) => [c.id, c]) ?? []),
    [customers]
  );

  const createTripMutation = useMutation({
    mutationFn: (data: { name: string; startDate: string; endDate: string; notes?: string }) =>
      apiRequest("POST", "/api/trips", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
      toast({ title: "Trip created" });
      setTripName("");
      setTripStart("");
      setTripEnd("");
      setTripNotes("");
    },
    onError: () => {
      toast({ title: "Failed to create trip", variant: "destructive" });
    },
  });

  const deleteTripMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/trips/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips"] });
      toast({ title: "Trip deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete trip", variant: "destructive" });
    },
  });

  const createAppointmentMutation = useMutation({
    mutationFn: (data: {
      tripId: number;
      customerId: number;
      date: string;
      time: string;
      duration: string;
      servicesRequested?: string;
      priceEstimate?: string;
      notes?: string;
      serviceArea?: string;
    }) => apiRequest("POST", `/api/trips/${data.tripId}/appointments`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips", activeTrip?.id, "appointments"] });
      toast({ title: "Appointment added" });
      closeDialog();
    },
    onError: () => {
      toast({ title: "Failed to add appointment", variant: "destructive" });
    },
  });

  const completeAppointmentMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("PATCH", `/api/trip-appointments/${id}`, { status: "completed" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips", activeTrip?.id, "appointments"] });
      toast({ title: "Appointment completed" });
    },
    onError: () => {
      toast({ title: "Failed to update appointment", variant: "destructive" });
    },
  });

  const deleteAppointmentMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("DELETE", `/api/trip-appointments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/trips", activeTrip?.id, "appointments"] });
      toast({ title: "Appointment deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete appointment", variant: "destructive" });
    },
  });

  function openDialog(date: string) {
    setDialogDate(date);
    setSelectedCustomerId("");
    setCustomerSearch("");
    setApptTime("10:00 AM");
    setApptDuration("2 hours");
    setApptServices("");
    setApptPrice("");
    setApptNotes("");
    setApptServiceArea("");
    setDialogOpen(true);
  }

  function closeDialog() {
    setDialogOpen(false);
  }

  function handleCustomerSelect(custId: string) {
    setSelectedCustomerId(custId);
    const cust = customerMap.get(parseInt(custId));
    if (cust?.city) {
      setApptServiceArea(cust.city);
    }
  }

  function handleCreateAppointment() {
    if (!activeTrip || !selectedCustomerId) return;
    createAppointmentMutation.mutate({
      tripId: activeTrip.id,
      customerId: parseInt(selectedCustomerId),
      date: dialogDate,
      time: apptTime,
      duration: apptDuration,
      servicesRequested: apptServices || undefined,
      priceEstimate: apptPrice || undefined,
      notes: apptNotes || undefined,
      serviceArea: apptServiceArea || undefined,
    });
  }

  function handleCreateTrip(e: React.FormEvent) {
    e.preventDefault();
    if (!tripName || !tripStart || !tripEnd) return;
    createTripMutation.mutate({
      name: tripName,
      startDate: tripStart,
      endDate: tripEnd,
      notes: tripNotes || undefined,
    });
  }

  const dates = activeTrip ? getDatesInRange(activeTrip.startDate, activeTrip.endDate) : [];

  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, TripAppointment[]>();
    tripAppointments?.forEach((a) => {
      const list = map.get(a.date) ?? [];
      list.push(a);
      map.set(a.date, list);
    });
    return map;
  }, [tripAppointments]);

  const totalRevenue = useMemo(() => {
    return tripAppointments?.reduce((sum, a) => sum + parsePrice(a.priceEstimate), 0) ?? 0;
  }, [tripAppointments]);

  const filteredCustomers = useMemo(() => {
    if (!customers) return [];
    if (!customerSearch) return customers;
    const s = customerSearch.toLowerCase();
    return customers.filter(
      (c) =>
        `${c.firstName} ${c.lastName}`.toLowerCase().includes(s) ||
        c.city?.toLowerCase().includes(s)
    );
  }, [customers, customerSearch]);

  if (tripsLoading) {
    return (
      <div className="p-4 sm:p-6 max-w-5xl mx-auto">
        <div className="space-y-4">
          <div className="h-8 bg-muted rounded animate-pulse w-48" />
          <div className="h-32 bg-muted rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (!activeTrip) {
    return (
      <div className="p-4 sm:p-6 max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight" data-testid="text-slc-title">
            SLC Schedule
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Plan your next trip</p>
        </div>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Calendar className="h-5 w-5" />
              Create New Trip
            </CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleCreateTrip} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="trip-name">Trip Name</Label>
                <Input
                  id="trip-name"
                  value={tripName}
                  onChange={(e) => setTripName(e.target.value)}
                  placeholder="e.g., Salt Lake City June Trip"
                  data-testid="input-trip-name"
                />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="trip-start">Start Date (M/D/YY)</Label>
                  <Input
                    id="trip-start"
                    value={tripStart}
                    onChange={(e) => setTripStart(e.target.value)}
                    placeholder="6/15/25"
                    data-testid="input-trip-start"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="trip-end">End Date (M/D/YY)</Label>
                  <Input
                    id="trip-end"
                    value={tripEnd}
                    onChange={(e) => setTripEnd(e.target.value)}
                    placeholder="6/20/25"
                    data-testid="input-trip-end"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="trip-notes">Notes (optional)</Label>
                <Textarea
                  id="trip-notes"
                  value={tripNotes}
                  onChange={(e) => setTripNotes(e.target.value)}
                  placeholder="Any trip notes..."
                  data-testid="input-trip-notes"
                />
              </div>
              <Button
                type="submit"
                disabled={createTripMutation.isPending || !tripName || !tripStart || !tripEnd}
                data-testid="button-create-trip"
              >
                <Plus className="h-4 w-4 mr-2" />
                Create Trip
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight" data-testid="text-trip-name">
            {activeTrip.name}
          </h1>
          <p className="text-muted-foreground text-sm mt-1 flex items-center gap-2 flex-wrap">
            <Calendar className="h-3.5 w-3.5" />
            {activeTrip.startDate} — {activeTrip.endDate}
            {activeTrip.notes && <span>· {activeTrip.notes}</span>}
          </p>
        </div>
        <Button
          variant="outline"
          className="text-destructive self-start"
          onClick={() => {
            if (confirm("Delete this trip and all its appointments?")) {
              deleteTripMutation.mutate(activeTrip.id);
            }
          }}
          disabled={deleteTripMutation.isPending}
          data-testid="button-delete-trip"
        >
          <Trash2 className="h-4 w-4 mr-2" />
          Delete Trip
        </Button>
      </div>

      <Card>
        <CardContent className="py-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <DollarSign className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm font-medium" data-testid="text-total-revenue">
                Total Estimated: ${totalRevenue.toFixed(2)}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground" data-testid="text-trip-days">
                {dates.length} days · {tripAppointments?.length ?? 0} appointments
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-4">
        {dates.map((dateStr) => {
          const dayDate = parseDateStr(dateStr);
          const dayName = getDayName(dayDate);
          const dayAppointments = appointmentsByDate.get(dateStr) ?? [];
          const appointmentCount = dayAppointments.length;
          const dayRevenue = dayAppointments.reduce((s, a) => s + parsePrice(a.priceEstimate), 0);

          const groupedByArea = new Map<string, TripAppointment[]>();
          dayAppointments.forEach((a) => {
            const area = a.serviceArea || "Unassigned";
            const list = groupedByArea.get(area) ?? [];
            list.push(a);
            groupedByArea.set(area, list);
          });

          return (
            <Card key={dateStr} data-testid={`card-day-${dateStr}`}>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
                <div className="min-w-0">
                  <CardTitle className="text-base">{dayName}</CardTitle>
                  <p className="text-sm text-muted-foreground mt-0.5">{dateStr}</p>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Badge variant="secondary" data-testid={`badge-progress-${dateStr}`}>
                    {appointmentCount}/4 appointments
                  </Badge>
                  {dayRevenue > 0 && (
                    <Badge variant="outline" data-testid={`badge-day-revenue-${dateStr}`}>
                      <DollarSign className="h-3 w-3 mr-0.5" />
                      {dayRevenue.toFixed(2)}
                    </Badge>
                  )}
                  <Button
                    size="sm"
                    onClick={() => openDialog(dateStr)}
                    data-testid={`button-add-appointment-${dateStr}`}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Add
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                {dayAppointments.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-2">No appointments scheduled</p>
                ) : (
                  <div className="space-y-3">
                    {Array.from(groupedByArea.entries()).map(([area, appts]) => (
                      <div key={area}>
                        <div className="flex items-center gap-1.5 mb-2">
                          <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                          <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                            {area}
                          </span>
                        </div>
                        <div className="space-y-2">
                          {appts.map((appt) => {
                            const cust = customerMap.get(appt.customerId);
                            const isCompleted = appt.status === "completed";
                            return (
                              <div
                                key={appt.id}
                                className={`flex items-start justify-between gap-2 rounded-md border p-3 ${isCompleted ? "opacity-60" : ""}`}
                                data-testid={`trip-appointment-${appt.id}`}
                              >
                                <div className="min-w-0 flex-1 space-y-1">
                                  <div className="flex items-center gap-2 flex-wrap">
                                    <span className="text-sm font-medium" data-testid={`text-appt-customer-${appt.id}`}>
                                      {cust ? `${cust.firstName} ${cust.lastName}` : "Unknown"}
                                    </span>
                                    {isCompleted && (
                                      <Badge variant="secondary" className="text-xs">
                                        <CheckCircle className="h-3 w-3 mr-1" />
                                        Done
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-3 text-xs text-muted-foreground flex-wrap">
                                    <span className="flex items-center gap-1">
                                      <Clock className="h-3 w-3" />
                                      {appt.time}
                                    </span>
                                    {appt.serviceArea && (
                                      <span className="flex items-center gap-1">
                                        <MapPin className="h-3 w-3" />
                                        {appt.serviceArea}
                                      </span>
                                    )}
                                    {appt.priceEstimate && (
                                      <span className="flex items-center gap-1">
                                        <DollarSign className="h-3 w-3" />
                                        {appt.priceEstimate}
                                      </span>
                                    )}
                                  </div>
                                  {appt.servicesRequested && (
                                    <p className="text-xs">{appt.servicesRequested}</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-1 shrink-0">
                                  {!isCompleted && (
                                    <Button
                                      variant="ghost"
                                      size="icon"
                                      onClick={() => completeAppointmentMutation.mutate(appt.id)}
                                      disabled={completeAppointmentMutation.isPending}
                                      data-testid={`button-complete-trip-appt-${appt.id}`}
                                    >
                                      <CheckCircle className="h-4 w-4" />
                                    </Button>
                                  )}
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="text-destructive"
                                    onClick={() => {
                                      if (confirm("Delete this appointment?")) {
                                        deleteAppointmentMutation.mutate(appt.id);
                                      }
                                    }}
                                    disabled={deleteAppointmentMutation.isPending}
                                    data-testid={`button-delete-trip-appt-${appt.id}`}
                                  >
                                    <Trash2 className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Plus className="h-5 w-5" />
              Add Appointment — {dialogDate}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Customer</Label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={customerSearch}
                  onChange={(e) => setCustomerSearch(e.target.value)}
                  placeholder="Search customers..."
                  className="pl-9"
                  data-testid="input-customer-search"
                />
              </div>
              <Select value={selectedCustomerId} onValueChange={handleCustomerSelect}>
                <SelectTrigger data-testid="select-customer">
                  <SelectValue placeholder="Select a customer" />
                </SelectTrigger>
                <SelectContent>
                  {filteredCustomers.map((c) => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {c.firstName} {c.lastName}{c.city ? ` — ${c.city}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="appt-service-area">Service Area</Label>
              <Input
                id="appt-service-area"
                value={apptServiceArea}
                onChange={(e) => setApptServiceArea(e.target.value)}
                placeholder="e.g., Salt Lake City"
                data-testid="input-service-area"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="appt-time">Time</Label>
                <Input
                  id="appt-time"
                  value={apptTime}
                  onChange={(e) => setApptTime(e.target.value)}
                  placeholder="10:00 AM"
                  data-testid="input-appt-time"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="appt-duration">Duration</Label>
                <Input
                  id="appt-duration"
                  value={apptDuration}
                  onChange={(e) => setApptDuration(e.target.value)}
                  placeholder="2 hours"
                  data-testid="input-appt-duration"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="appt-services">Services Requested</Label>
              <Input
                id="appt-services"
                value={apptServices}
                onChange={(e) => setApptServices(e.target.value)}
                placeholder="Tuning, voicing..."
                data-testid="input-appt-services"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="appt-price">Price Estimate</Label>
              <Input
                id="appt-price"
                value={apptPrice}
                onChange={(e) => setApptPrice(e.target.value)}
                placeholder="$150"
                data-testid="input-appt-price"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="appt-notes">Notes</Label>
              <Textarea
                id="appt-notes"
                value={apptNotes}
                onChange={(e) => setApptNotes(e.target.value)}
                placeholder="Any notes..."
                data-testid="input-appt-notes"
              />
            </div>
            <div className="flex items-center justify-end gap-2">
              <Button variant="outline" onClick={closeDialog} data-testid="button-cancel-appointment">
                <X className="h-4 w-4 mr-1" />
                Cancel
              </Button>
              <Button
                onClick={handleCreateAppointment}
                disabled={!selectedCustomerId || createAppointmentMutation.isPending}
                data-testid="button-save-appointment"
              >
                <Plus className="h-4 w-4 mr-1" />
                Add Appointment
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
