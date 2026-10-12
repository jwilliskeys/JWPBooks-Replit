import { useMemo } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Plus, CalendarClock, X } from "lucide-react";
import type { Customer, OutreachLead, Piano, Trip, TripOutreachCandidate } from "@shared/schema";
import { clientName } from "@shared/client-name";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getServiceRegion } from "@/lib/scheduling";

function monthsSince(value: string | null | undefined): number | null {
  if (!value) return null;
  const mdy = value.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  const date = mdy
    ? new Date(Number(mdy[3]) < 100 ? 2000 + Number(mdy[3]) : Number(mdy[3]), Number(mdy[1]) - 1, Number(mdy[2]))
    : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const now = new Date();
  return (now.getFullYear() - date.getFullYear()) * 12 + now.getMonth() - date.getMonth();
}

function intervalMonths(value: string | null | undefined): number {
  const number = Number(value?.match(/\d+/)?.[0]);
  return Number.isFinite(number) && number > 0 ? number : 10;
}

function contactDigits(value: string | null | undefined): string {
  return (value ?? "").replace(/\D/g, "");
}

function warmthFor(customer: Customer, leads: OutreachLead[]): { label: string; score: number } {
  const email = customer.email?.trim().toLowerCase();
  const phone = contactDigits(customer.phone);
  const lead = leads.find((item) =>
    (email && item.email?.trim().toLowerCase() === email) ||
    (phone.length >= 7 && contactDigits(item.phone) === phone)
  );
  if (!lead) return { label: "Neutral", score: 1 };
  const status = (lead.status ?? "").toLowerCase();
  if (status.includes("not interested") || status.includes("not in service") || status.includes("disconnect")) {
    return { label: lead.status ?? "Not interested", score: 0 };
  }
  if (lead.followUpDate && lead.followUpDate <= new Date().toISOString().slice(0, 10)) return { label: "Follow-up due", score: 4 };
  if (status.includes("interested") || status.includes("conversation") || status.includes("callback")) return { label: lead.status ?? "Warm", score: 3 };
  if (!lead.contactedDate) return { label: "Not contacted", score: 2 };
  return { label: lead.status ?? "Contacted", score: 1 };
}

export function SlcOutreachPipeline({
  trip,
  customers,
  pianos,
  onSchedule,
}: {
  trip: Trip | null;
  customers: Customer[];
  pianos: Piano[];
  onSchedule: (customer: Customer) => void;
}) {
  const { toast } = useToast();
  const candidatesKey = trip ? `/api/trips/${trip.id}/outreach-candidates` : "";
  const { data: candidates = [] } = useQuery<TripOutreachCandidate[]>({
    queryKey: [candidatesKey],
    enabled: !!trip,
  });
  const { data: leads = [] } = useQuery<OutreachLead[]>({ queryKey: ["/api/outreach-leads"] });

  const addMutation = useMutation({
    mutationFn: (customerId: number) =>
      apiRequest("POST", `/api/trips/${trip!.id}/outreach-candidates`, { customerId }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [candidatesKey] }),
    onError: () => toast({ title: "Couldn't add this client to outreach", variant: "destructive" }),
  });
  const removeMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/trips/${trip!.id}/outreach-candidates/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [candidatesKey] }),
    onError: () => toast({ title: "Couldn't remove this candidate", variant: "destructive" }),
  });

  const suggestions = useMemo(() => {
    const alreadySelected = new Set(candidates.map((candidate) => candidate.customerId));
    return customers.flatMap((customer) => {
      if (getServiceRegion(customer.city ?? "") !== "Salt Lake City" || alreadySelected.has(customer.id)) return [];
      const activePianos = pianos.filter((piano) => piano.customerId === customer.id && piano.isActive !== false);
      const due = activePianos.map((piano) => {
        const tuned = monthsSince(piano.lastTuned ?? customer.lastTuned);
        const overdueMonths = tuned === null ? null : tuned - intervalMonths(piano.tuningInterval);
        return { piano, overdueMonths };
      }).filter((item) => item.overdueMonths !== null && item.overdueMonths >= 0);
      if (!due.length) return [];
      const warmth = warmthFor(customer, leads);
      const mostOverdue = Math.max(...due.map((item) => item.overdueMonths ?? 0));
      return [{ customer, warmth, due, mostOverdue }];
    }).sort((a, b) =>
      b.warmth.score - a.warmth.score ||
      b.mostOverdue - a.mostOverdue ||
      clientName(a.customer).localeCompare(clientName(b.customer))
    );
  }, [customers, pianos, leads, candidates]);

  const stageCounts = {
    candidate: candidates.filter((item) => item.status === "candidate").length,
    scheduled: candidates.filter((item) => item.status === "scheduled").length,
    booked: candidates.filter((item) => item.status === "booked").length,
  };

  return (
    <Card data-testid="slc-outreach-pipeline">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <CardTitle className="text-base">SLC Tuning Outreach</CardTitle>
          {trip && <span className="text-xs text-muted-foreground">{trip.name}</span>}
        </div>
        <div className="flex flex-wrap gap-1.5">
          <Badge variant="outline">{stageCounts.candidate} candidates</Badge>
          <Badge variant="outline">{stageCounts.scheduled} scheduled</Badge>
          <Badge variant="outline">{stageCounts.booked} booked</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!trip ? (
          <p className="text-sm text-muted-foreground">Create a trip to start an outreach list.</p>
        ) : (
          <>
            <div>
              <h3 className="mb-2 text-sm font-medium">Suggested SLC tunings</h3>
              {suggestions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No unselected SLC pianos are currently due based on their tuning history.</p>
              ) : (
                <div className="max-h-64 space-y-1 overflow-y-auto">
                  {suggestions.map(({ customer, warmth, due, mostOverdue }) => (
                    <div key={customer.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-medium">{clientName(customer)}</div>
                        <div className="text-xs text-muted-foreground">
                          {due.length} piano{due.length === 1 ? "" : "s"} due · {mostOverdue}mo past interval · {warmth.label}
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => addMutation.mutate(customer.id)}
                        disabled={addMutation.isPending}
                        aria-label={`Add ${clientName(customer)} to outreach candidates`}
                      >
                        <Plus className="mr-1 h-3.5 w-3.5" /> Add
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div>
              <h3 className="mb-2 text-sm font-medium">Selected clients</h3>
              {candidates.length === 0 ? (
                <p className="text-sm text-muted-foreground">Suggested customers stay here only after you add them.</p>
              ) : (
                <div className="space-y-1">
                  {candidates.map((candidate) => {
                    const customer = customers.find((item) => item.id === candidate.customerId);
                    const linkedTripAppointment = candidate.tripAppointmentId;
                    return (
                      <div key={candidate.id} className="flex items-center gap-2 rounded-md border px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm font-medium">{customer ? clientName(customer) : "Client"}</div>
                          <div className="text-xs text-muted-foreground">
                            {candidate.status === "booked" ? "Booked" : candidate.status === "scheduled" ? "Scheduled" : "Outreach candidate"}
                            {linkedTripAppointment ? ` · Trip stop #${linkedTripAppointment}` : ""}
                          </div>
                        </div>
                        <Badge variant={candidate.status === "booked" ? "default" : "outline"}>{candidate.status}</Badge>
                        {candidate.status === "candidate" && customer && (
                          <Button size="sm" variant="outline" onClick={() => onSchedule(customer)}>
                            <CalendarClock className="mr-1 h-3.5 w-3.5" /> Schedule
                          </Button>
                        )}
                        {candidate.status === "candidate" && (
                          <Button
                            size="icon"
                            variant="ghost"
                            className="h-8 w-8"
                            onClick={() => removeMutation.mutate(candidate.id)}
                            aria-label="Remove candidate"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
