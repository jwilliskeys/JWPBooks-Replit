import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import {
  Phone,
  CalendarDays,
  CheckCircle,
  Search,
  ExternalLink,
} from "lucide-react";
import type { Customer } from "@shared/schema";

function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split("/");
  if (parts.length === 3) {
    const month = parseInt(parts[0]) - 1;
    const day = parseInt(parts[1]);
    let year = parseInt(parts[2]);
    if (year < 100) year += 2000;
    return new Date(year, month, day);
  }
  return null;
}

function getMonthsSince(dateStr: string | null | undefined): number | null {
  const date = parseDate(dateStr);
  if (!date) return null;
  const now = new Date();
  return (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "Never";
  return dateStr;
}

function todayFormatted(): string {
  const now = new Date();
  return `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
}

function getOverdueBadge(months: number | null) {
  if (months === null) return <Badge variant="secondary" className="text-xs">No record</Badge>;
  if (months >= 24) return <Badge variant="destructive" className="text-xs">Overdue {months}mo</Badge>;
  if (months >= 12) return <Badge className="text-xs bg-orange-500 dark:bg-orange-600 text-white border-orange-600 dark:border-orange-500">Overdue {months}mo</Badge>;
  if (months >= 6) return <Badge variant="secondary" className="text-xs">Due soon</Badge>;
  return <Badge className="text-xs bg-emerald-600 dark:bg-emerald-700 text-white border-emerald-700 dark:border-emerald-600">Recently Tuned</Badge>;
}

export default function CallCenter() {
  const [search, setSearch] = useState("");
  const { toast } = useToast();

  const { data: customers, isLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const markContactedMutation = useMutation({
    mutationFn: ({ id, date }: { id: number; date: string }) =>
      apiRequest("PATCH", `/api/customers/${id}`, { lastContacted: date }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({ title: "Marked as contacted" });
    },
    onError: () => {
      toast({ title: "Failed to update", variant: "destructive" });
    },
  });

  const sorted = customers
    ?.filter((c) => {
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        `${c.firstName} ${c.lastName}`.toLowerCase().includes(s) ||
        c.phone?.includes(search) ||
        c.city?.toLowerCase().includes(s)
      );
    })
    .sort((a, b) => {
      const aContacted = getMonthsSince(a.lastContacted);
      const bContacted = getMonthsSince(b.lastContacted);
      const aTuned = getMonthsSince(a.lastTuned);
      const bTuned = getMonthsSince(b.lastTuned);

      const aScore = Math.max(aContacted ?? 999, aTuned ?? 999);
      const bScore = Math.max(bContacted ?? 999, bTuned ?? 999);
      return bScore - aScore;
    }) ?? [];

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Call Center</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Customers sorted by who needs to be contacted next
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by name, phone, or city..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          data-testid="input-call-search"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-14 w-full" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Phone className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No customers found</p>
        </div>
      ) : (
        <div className="border rounded-lg divide-y" data-testid="call-list">
          <div className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-4 py-2 text-xs font-medium text-muted-foreground bg-muted/50 rounded-t-lg">
            <span>Customer</span>
            <span className="w-28 text-center">Last Tuned</span>
            <span className="w-28 text-center">Last Contacted</span>
            <span className="w-24 text-center">Status</span>
            <span className="w-28 text-center">Action</span>
          </div>
          {sorted.map((customer) => {
            const tunedMonths = getMonthsSince(customer.lastTuned);
            return (
              <div
                key={customer.id}
                className="grid grid-cols-[1fr_auto_auto_auto_auto] gap-4 px-4 py-3 items-center hover:bg-muted/30 transition-colors"
                data-testid={`call-row-${customer.id}`}
              >
                <div className="min-w-0">
                  <Link href={`/customers/${customer.id}`}>
                    <span className="text-sm font-medium hover:underline cursor-pointer flex items-center gap-1" data-testid={`call-name-${customer.id}`}>
                      {customer.firstName} {customer.lastName}
                      <ExternalLink className="h-3 w-3 text-muted-foreground" />
                    </span>
                  </Link>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
                    {customer.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-3 w-3" /> {customer.phone}
                      </span>
                    )}
                    {customer.city && <span>{customer.city}, {customer.state}</span>}
                  </div>
                </div>

                <div className="w-28 text-center">
                  <span className="text-xs flex items-center justify-center gap-1">
                    <CalendarDays className="h-3 w-3 text-muted-foreground" />
                    {formatDate(customer.lastTuned)}
                  </span>
                </div>

                <div className="w-28 text-center">
                  <span className="text-xs" data-testid={`call-contacted-${customer.id}`}>
                    {formatDate(customer.lastContacted)}
                  </span>
                </div>

                <div className="w-24 text-center">
                  {getOverdueBadge(tunedMonths)}
                </div>

                <div className="w-28 text-center">
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-xs h-7"
                    disabled={markContactedMutation.isPending}
                    onClick={() =>
                      markContactedMutation.mutate({
                        id: customer.id,
                        date: todayFormatted(),
                      })
                    }
                    data-testid={`button-contacted-${customer.id}`}
                  >
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Contacted
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
