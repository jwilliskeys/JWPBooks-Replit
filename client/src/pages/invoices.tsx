import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, FileText, ChevronRight } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Invoice, Customer } from "@shared/schema";

function statusBadge(status: string | null) {
  switch (status) {
    case "paid":
      return <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-0">Paid</Badge>;
    case "sent":
      return <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-0">Sent</Badge>;
    default:
      return <Badge variant="secondary">Draft</Badge>;
  }
}

function formatDate(dateStr: string) {
  if (!dateStr) return "";
  const parts = dateStr.split("/");
  if (parts.length !== 3) return dateStr;
  const month = parseInt(parts[0]);
  const day = parseInt(parts[1]);
  let year = parseInt(parts[2]);
  if (year < 100) year += 2000;
  const names = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];
  return `${names[month - 1]} ${day}, ${year}`;
}

export default function InvoicesPage() {
  const { toast } = useToast();
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");

  const { data: invoices, isLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const customerMap = useMemo(
    () => new Map(customers?.map((c) => [c.id, c]) ?? []),
    [customers]
  );

  const filtered = useMemo(() => {
    if (!invoices) return [];
    const q = search.trim().toLowerCase();
    if (!q) return invoices;
    return invoices.filter((inv) => {
      const customer = customerMap.get(inv.customerId);
      const name = customer
        ? `${customer.firstName} ${customer.lastName}`.toLowerCase()
        : (inv.customerName ?? "").toLowerCase();
      return (
        name.includes(q) ||
        inv.invoiceNumber.toLowerCase().includes(q) ||
        (inv.status ?? "").toLowerCase().includes(q)
      );
    });
  }, [invoices, search, customerMap]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      const numA = parseInt(a.invoiceNumber, 10) || 0;
      const numB = parseInt(b.invoiceNumber, 10) || 0;
      return numB - numA;
    });
  }, [filtered]);

  const deleteInvoiceMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/invoices/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/invoices"] });
      toast({ title: "Invoice deleted" });
    },
    onError: () => {
      toast({ title: "Failed to delete invoice", variant: "destructive" });
    },
  });

  function getCustomerName(inv: Invoice) {
    if (inv.customerName) return inv.customerName;
    const c = customerMap.get(inv.customerId);
    if (c) return `${c.firstName} ${c.lastName}`;
    return `Customer #${inv.customerId}`;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Invoices</h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {invoices ? `${invoices.length} invoice${invoices.length !== 1 ? "s" : ""}` : "Loading..."}
          </p>
        </div>
        <Button onClick={() => navigate("/invoices/new")} data-testid="button-new-invoice">
          <Plus className="h-4 w-4 mr-1.5" />
          New Invoice
        </Button>
      </div>

      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search by customer name or invoice number..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          data-testid="input-invoice-search"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <FileText className="h-10 w-10 mx-auto mb-3 opacity-30" />
          {search ? (
            <p>No invoices match your search.</p>
          ) : (
            <>
              <p className="font-medium mb-1">No invoices yet</p>
              <p className="text-sm">Create your first invoice from an appointment or manually.</p>
            </>
          )}
        </div>
      ) : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 border-b">
              <tr>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Invoice #</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Customer</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground hidden sm:table-cell">Date</th>
                <th className="text-left px-4 py-2.5 font-medium text-muted-foreground">Status</th>
                <th className="text-right px-4 py-2.5 font-medium text-muted-foreground">Total</th>
                <th className="px-2 py-2.5" />
              </tr>
            </thead>
            <tbody>
              {sorted.map((inv, idx) => (
                <tr
                  key={inv.id}
                  className={`border-b last:border-0 hover:bg-muted/30 cursor-pointer transition-colors ${idx % 2 === 0 ? "" : "bg-muted/10"}`}
                  onClick={() => navigate(`/invoices/${inv.id}`)}
                  data-testid={`row-invoice-${inv.id}`}
                >
                  <td className="px-4 py-3 font-mono font-medium">#{inv.invoiceNumber}</td>
                  <td className="px-4 py-3">{getCustomerName(inv)}</td>
                  <td className="px-4 py-3 text-muted-foreground hidden sm:table-cell">{formatDate(inv.invoiceDate)}</td>
                  <td className="px-4 py-3">{statusBadge(inv.status)}</td>
                  <td className="px-4 py-3 text-right font-medium tabular-nums">{inv.total}</td>
                  <td className="px-2 py-3 text-muted-foreground">
                    <ChevronRight className="h-4 w-4" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
