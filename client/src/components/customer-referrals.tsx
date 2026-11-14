import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Customer } from "@shared/schema";
import { clientName } from "@shared/client-name";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export function CustomerReferrals({ customer }: { customer: Customer }) {
  const { toast } = useToast();
  const [referralTarget, setReferralTarget] = useState("");
  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });
  const referredBy = customers.find((candidate) => candidate.id === customer.referredByCustomerId);
  const referredClients = customers.filter((candidate) => candidate.referredByCustomerId === customer.id);
  const possibleReferrers = customers.filter((candidate) => candidate.id !== customer.id);
  const possibleReferrals = customers.filter(
    (candidate) => candidate.id !== customer.id && candidate.referredByCustomerId == null,
  );

  const invalidateCustomers = () => {
    queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
    queryClient.invalidateQueries({ queryKey: ["/api/customers", String(customer.id)] });
  };

  const setReferrer = useMutation({
    mutationFn: (referrerId: number | null) =>
      apiRequest("PATCH", `/api/customers/${customer.id}`, { referredByCustomerId: referrerId }),
    onSuccess: () => {
      invalidateCustomers();
      toast({ title: "Referral updated" });
    },
    onError: () => toast({ title: "Could not update referral", variant: "destructive" }),
  });

  const addReferral = useMutation({
    mutationFn: (referredCustomerId: number) =>
      apiRequest("PATCH", `/api/customers/${referredCustomerId}`, { referredByCustomerId: customer.id }),
    onSuccess: () => {
      setReferralTarget("");
      invalidateCustomers();
      toast({ title: "Referred client added" });
    },
    onError: () => toast({ title: "Could not add referred client", variant: "destructive" }),
  });

  return (
    <Card data-testid="customer-referrals">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-semibold">Referrals</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4 pt-0">
        <div className="space-y-1.5">
          <label className="text-xs text-muted-foreground" id="referrer-label">Referred by</label>
          <Select
            value={referredBy ? String(referredBy.id) : "none"}
            onValueChange={(value) => setReferrer.mutate(value === "none" ? null : Number(value))}
            disabled={setReferrer.isPending || customers.length === 0}
          >
            <SelectTrigger aria-labelledby="referrer-label" data-testid="select-referred-by">
              <SelectValue placeholder="Choose a client" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No referrer</SelectItem>
              {possibleReferrers.map((candidate) => (
                <SelectItem key={candidate.id} value={String(candidate.id)}>
                  {clientName(candidate)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2 border-t pt-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-medium text-muted-foreground">
              Referred clients ({referredClients.length})
            </h3>
            <Select
              value={referralTarget}
              onValueChange={(value) => {
                setReferralTarget(value);
                addReferral.mutate(Number(value));
              }}
              disabled={addReferral.isPending || possibleReferrals.length === 0}
            >
              <SelectTrigger className="h-8 w-auto min-w-[150px] text-xs" aria-label="Add a referred client" data-testid="select-add-referred-client">
                <SelectValue placeholder={possibleReferrals.length ? "Add a client" : "No clients available"} />
              </SelectTrigger>
              <SelectContent>
                {possibleReferrals.map((candidate) => (
                  <SelectItem key={candidate.id} value={String(candidate.id)}>
                    {clientName(candidate)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {referredClients.length > 0 ? (
            <ul className="divide-y">
              {referredClients.map((referredClient) => (
                <li key={referredClient.id} className="py-2 first:pt-0 last:pb-0">
                  <Link
                    href={`/customers/${referredClient.id}`}
                    className="text-sm font-medium text-primary hover:underline"
                    data-testid={`referred-client-${referredClient.id}`}
                  >
                    {clientName(referredClient)}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">No referred clients yet.</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
