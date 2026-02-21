import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Link } from "wouter";
import {
  Calendar,
  Clock,
  Search,
  ExternalLink,
  Trash2,
  CheckCircle,
  Music,
} from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Appointment, Customer } from "@shared/schema";

export default function Appointments() {
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  const { data: appointments, isLoading } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments"],
  });

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const customerMap = new Map(customers?.map((c) => [c.id, c]) ?? []);

  const deleteAppointmentMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/appointments/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({ title: "Appointment deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete appointment", variant: "destructive" });
    },
  });

  const completeAppointmentMutation = useMutation({
    mutationFn: (id: number) =>
      apiRequest("PATCH", `/api/appointments/${id}`, { status: "completed" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/appointments"] });
      toast({ title: "Appointment marked as completed" });
    },
    onError: () => {
      toast({ title: "Failed to update appointment", variant: "destructive" });
    },
  });

  const filtered = appointments
    ?.filter((a) => {
      if (!search) return true;
      const s = search.toLowerCase();
      const customer = customerMap.get(a.customerId);
      const name = customer ? `${customer.firstName} ${customer.lastName}`.toLowerCase() : "";
      return (
        name.includes(s) ||
        a.servicesRequested?.toLowerCase().includes(s) ||
        a.date.includes(search)
      );
    })
    .sort((a, b) => {
      if (a.status === "scheduled" && b.status !== "scheduled") return -1;
      if (a.status !== "scheduled" && b.status === "scheduled") return 1;
      return a.date.localeCompare(b.date);
    }) ?? [];

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight" data-testid="text-appointments-title">Appointments</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Manage scheduled appointments
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by client, service, or date..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          data-testid="input-appointment-search"
        />
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Calendar className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No appointments found</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((appointment) => {
            const customer = customerMap.get(appointment.customerId);
            const isCompleted = appointment.status === "completed";
            return (
              <Card key={appointment.id} className={isCompleted ? "opacity-60" : ""} data-testid={`appointment-card-${appointment.id}`}>
                <CardContent className="py-4 px-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        {customer ? (
                          <Link href={`/customers/${customer.id}`}>
                            <span className="text-sm font-medium hover:underline cursor-pointer flex items-center gap-1" data-testid={`appointment-client-${appointment.id}`}>
                              {customer.firstName} {customer.lastName}
                              <ExternalLink className="h-3 w-3 text-muted-foreground" />
                            </span>
                          </Link>
                        ) : (
                          <span className="text-sm font-medium">Unknown Client</span>
                        )}
                        {appointment.isTuning && (
                          <Badge variant="secondary" className="text-xs">
                            <Music className="h-3 w-3 mr-1" />
                            Tuning
                          </Badge>
                        )}
                        <Badge variant={isCompleted ? "secondary" : "default"} className="text-xs" data-testid={`appointment-status-${appointment.id}`}>
                          {isCompleted ? "Completed" : "Scheduled"}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 text-xs text-muted-foreground mt-1">
                        <span className="flex items-center gap-1">
                          <Calendar className="h-3 w-3" />
                          {appointment.date}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {appointment.time}
                        </span>
                        {appointment.priceEstimate && (
                          <span className="font-medium text-foreground">{appointment.priceEstimate}</span>
                        )}
                      </div>
                      {appointment.servicesRequested && (
                        <p className="text-sm mt-1">{appointment.servicesRequested}</p>
                      )}
                      {appointment.notes && (
                        <p className="text-xs text-muted-foreground mt-1">{appointment.notes}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {!isCompleted && (
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => completeAppointmentMutation.mutate(appointment.id)}
                          disabled={completeAppointmentMutation.isPending}
                          data-testid={`button-complete-appointment-${appointment.id}`}
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Complete
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 text-destructive"
                        onClick={() => {
                          if (confirm("Delete this appointment?")) {
                            deleteAppointmentMutation.mutate(appointment.id);
                          }
                        }}
                        data-testid={`button-delete-appointment-${appointment.id}`}
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
      )}
    </div>
  );
}
