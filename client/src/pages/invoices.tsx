import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Plus, Search, FileText, Mail } from "lucide-react";
import type { Invoice, Customer } from "@shared/schema";

function parseDollar(str: string | null | undefined): number {
  if (!str) return 0;
  const n = parseFloat(str.replace(/[^0-9.]/g, ""));
  return isNaN(n) ? 0 : n;
}

function formatDollar(n: number): string {
  return `$${n.toFixed(2)}`;
}

function amountDue(inv: Invoice): string {
  return formatDollar(Math.max(0, parseDollar(inv.total) - parseDollar(inv.paidAmount)));
}

function statusBadge(status: string | null) {
  switch (status) {
    case "paid":
      return (
        <Badge className="bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200 border-0 uppercase text-xs font-semibold tracking-wide px-2 py-0.5">
          Paid
        </Badge>
      );
    case "open":
      return (
        <Badge className="bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 border-0 uppercase text-xs font-semibold tracking-wide px-2 py-0.5">
          Open
        </Badge>
      );
    case "cancelled":
      return (
        <Badge className="bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border-0 uppercase text-xs font-semibold tracking-wide px-2 py-0.5">
          Cancelled
        </Badge>
      );
    default:
      return (
        <Badge variant="secondary" className="uppercase text-xs font-semibold tracking-wide px-2 py-0.5">
          Draft
        </Badge>
      );
  }
}

function formatDate(dateStr: string | null | undefined) {
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

  function getCustomerName(inv: Invoice) {
    if (inv.customerName) return inv.customerName;
    const c = customerMap.get(inv.customerId);
    if (c) return `${c.firstName} ${c.lastName}`;
    return "";
  }

  const filtered = useMemo(() => {
    if (!invoices) return [];
    const q = search.trim().toLowerCase();
    if (!q) return invoices;
    return invoices.filter((inv) => {
      const name = getCustomerName(inv).toLowerCase();
      return (
        name.includes(q) ||
        inv.invoiceNumber.toLowerCase().includes(q) ||
        (inv.status ?? "").toLowerCase().includes(q) ||
        (inv.assignedTo ?? "").toLowerCase().includes(q)
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

  return (
    <div className="p-6 max-w-7xl mx-auto">
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
          placeholder="Search by client, invoice number, or status..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
          data-testid="input-invoice-search"
        />
      </div>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
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
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="text-left px-4 py-2.5 font-semibold text-foreground">Number</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-foreground">Status</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-foreground">Client</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-foreground whitespace-nowrap">Invoice Date</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-foreground whitespace-nowrap">Due Date</th>
                  <th className="text-left px-4 py-2.5 font-semibold text-foreground whitespace-nowrap">Assigned To</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-foreground">Total</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-foreground">Paid</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-foreground whitespace-nowrap">Amount Due</th>
                  <th className="px-2 py-2.5"></th>
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
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                        <span className="font-medium tabular-nums">#{inv.invoiceNumber}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">{statusBadge(inv.status)}</td>
                    <td className="px-4 py-3 font-medium">{getCustomerName(inv)}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(inv.invoiceDate)}</td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{formatDate(inv.dueDate)}</td>
                    <td className="px-4 py-3 text-muted-foreground">{inv.assignedTo ?? "John Willis"}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{inv.total ?? "$0.00"}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">{inv.paidAmount ?? "$0.00"}</td>
                    <td className="px-4 py-3 text-right font-medium tabular-nums">{amountDue(inv)}</td>
                    <td className="px-4 py-2 text-right" onClick={e => e.stopPropagation()}>
                      {inv.customerEmail && (
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title={`Email invoice to ${inv.customerEmail}`}
                          onClick={() => {
                            const subject = encodeURIComponent(`Invoice #${inv.invoiceNumber} – John Willis Piano`);
                            const body = encodeURIComponent(
                              `Hi ${inv.customerName ?? getCustomerName(inv)},\n\nPlease find your invoice below:\n\nInvoice #${inv.invoiceNumber}\nDate: ${inv.invoiceDate ?? ""}\nDue: ${inv.dueDate ?? ""}\nTotal: ${inv.total ?? "$0.00"}\n\nThank you!\nJohn Willis Piano`
                            );
                            window.location.href = `mailto:${inv.customerEmail}?subject=${subject}&body=${body}`;
                          }}
                          data-testid={`button-email-invoice-${inv.id}`}
                        >
                          <Mail className="h-3.5 w-3.5" />
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
