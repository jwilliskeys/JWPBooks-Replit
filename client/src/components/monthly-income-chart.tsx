import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bar, BarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { DollarSign } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { getServiceArea } from "@/lib/scheduling";
import type { Customer, Invoice } from "@shared/schema";

type RevenueFilter = "all" | "boston" | "slc" | "falcetti" | "other";

interface MonthlyIncomeData {
  month: string;
  monthKey: string;
  bostonPaid: number;
  slcPaid: number;
  falcettiPaid: number;
  otherPaid: number;
  bostonTotal: number;
  slcTotal: number;
  falcettiTotal: number;
  otherTotal: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; name: string; fill: string }>;
  label?: string;
  filter: RevenueFilter;
  monthData: MonthlyIncomeData[];
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const FALCETTI_COLOR = "hsl(142 71% 45%)";

const FILTER_PILLS: { key: RevenueFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "boston", label: "Boston" },
  { key: "slc", label: "SLC" },
  { key: "falcetti", label: "Falcetti" },
  { key: "other", label: "Other" },
];

function parseInvoiceDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;
  const month = Number(parts[0]);
  const day = Number(parts[1]);
  let year = Number(parts[2]);
  if (year < 100) year += 2000;
  const date = new Date(year, month - 1, day);
  return Number.isNaN(date.getTime()) ? null : date;
}

function parseDollar(value: string | null | undefined): number {
  if (!value) return 0;
  const amount = Number.parseFloat(value.replace(/[$,]/g, ""));
  return Number.isNaN(amount) ? 0 : amount;
}

function classifyCustomer(customer: Customer): "boston" | "slc" | "other" {
  const state = (customer.state ?? "").toUpperCase();
  if (["MA", "RI", "CT", "NH", "ME", "VT", "VA"].includes(state)) return "boston";
  if (state === "UT") return "slc";
  const area = getServiceArea(customer.city ?? "", customer.state ?? "");
  if (area === "Boston") return "boston";
  if (["Davis County", "Salt Lake City", "South Jordan"].includes(area)) return "slc";
  return "other";
}

function monthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function CustomTooltip({ active, label, filter, monthData }: CustomTooltipProps) {
  if (!active || !label) return null;
  const data = monthData.find((month) => month.month === label);
  if (!data) return null;

  const rows =
    filter === "all"
      ? [
          { label: "Boston", total: data.bostonTotal, paid: data.bostonPaid, color: "hsl(221 83% 53%)" },
          { label: "SLC", total: data.slcTotal, paid: data.slcPaid, color: "hsl(38 92% 50%)" },
          { label: "Falcetti", total: data.falcettiTotal, paid: data.falcettiPaid, color: FALCETTI_COLOR },
          { label: "Other", total: data.otherTotal, paid: data.otherPaid, color: "hsl(var(--muted-foreground))" },
        ]
      : filter === "boston"
        ? [{ label: "Boston", total: data.bostonTotal, paid: data.bostonPaid, color: "hsl(221 83% 53%)" }]
        : filter === "slc"
          ? [{ label: "SLC", total: data.slcTotal, paid: data.slcPaid, color: "hsl(38 92% 50%)" }]
          : filter === "falcetti"
            ? [{ label: "Falcetti", total: data.falcettiTotal, paid: data.falcettiPaid, color: FALCETTI_COLOR }]
            : [{ label: "Other", total: data.otherTotal, paid: data.otherPaid, color: "hsl(var(--muted-foreground))" }];

  return (
    <div className="space-y-1.5 rounded-md border border-border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="font-semibold">{label}</p>
      {rows.map((row) => (
        <div key={row.label}>
          <p className="font-medium" style={{ color: row.color }}>{row.label}</p>
          <p className="text-muted-foreground">Billed: <span className="font-medium text-foreground">${row.total.toFixed(0)}</span></p>
          <p className="text-muted-foreground">Paid: <span className="font-medium text-foreground">${row.paid.toFixed(0)}</span></p>
        </div>
      ))}
    </div>
  );
}

/** Monthly regional revenue chart moved from the dashboard to Finances. */
export function MonthlyIncomeChart() {
  const [filter, setFilter] = useState<RevenueFilter>("all");
  const { data: invoices, isLoading: invoicesLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });
  const { data: customers, isLoading: customersLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const customerMap = useMemo(
    () => new Map(customers?.map((customer) => [customer.id, customer]) ?? []),
    [customers],
  );

  const monthlyData = useMemo<MonthlyIncomeData[]>(() => {
    const now = new Date();
    const months: MonthlyIncomeData[] = [];
    for (let i = 5; i >= 0; i--) {
      const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        monthKey: monthKey(date.getFullYear(), date.getMonth() + 1),
        month: `${MONTH_NAMES[date.getMonth()]} ${String(date.getFullYear()).slice(-2)}`,
        bostonPaid: 0,
        slcPaid: 0,
        falcettiPaid: 0,
        otherPaid: 0,
        bostonTotal: 0,
        slcTotal: 0,
        falcettiTotal: 0,
        otherTotal: 0,
      });
    }

    invoices?.forEach((invoice) => {
      const date = parseInvoiceDate(invoice.invoiceDate);
      if (!date) return;
      const entry = months.find((month) => month.monthKey === monthKey(date.getFullYear(), date.getMonth() + 1));
      if (!entry) return;
      const total = parseDollar(invoice.total);
      const paid = invoice.status === "paid" ? parseDollar(invoice.paidAmount ?? invoice.total) : 0;
      if (invoice.incomeSource === "falcetti") {
        entry.falcettiTotal += total;
        entry.falcettiPaid += paid;
        return;
      }
      const customer = invoice.customerId != null ? customerMap.get(invoice.customerId) : undefined;
      const bucket = customer ? classifyCustomer(customer) : "other";
      if (bucket === "boston") {
        entry.bostonTotal += total;
        entry.bostonPaid += paid;
      } else if (bucket === "slc") {
        entry.slcTotal += total;
        entry.slcPaid += paid;
      } else {
        entry.otherTotal += total;
        entry.otherPaid += paid;
      }
    });
    return months;
  }, [invoices, customerMap]);

  const chartData = useMemo(
    () => monthlyData.map((month) => {
      if (filter === "all") {
        return {
          month: month.month,
          Boston: month.bostonPaid,
          SLC: month.slcPaid,
          Falcetti: month.falcettiPaid,
          Other: month.otherPaid,
        };
      }
      const dataKey = filter === "boston" ? "boston" : filter;
      return {
        month: month.month,
        Paid: month[`${dataKey}Paid` as keyof MonthlyIncomeData] as number,
        Total: month[`${dataKey}Total` as keyof MonthlyIncomeData] as number,
      };
    }),
    [monthlyData, filter],
  );

  const isLoading = invoicesLoading || customersLoading;

  return (
    <Card data-testid="monthly-income-card">
      <CardHeader className="pb-2">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <CardTitle className="flex items-center gap-2 text-base font-semibold">
            <DollarSign className="h-4 w-4" /> Revenue
          </CardTitle>
          <div className="flex flex-wrap items-center gap-1" aria-label="Revenue filters">
            {FILTER_PILLS.map((pill) => (
              <button
                key={pill.key}
                type="button"
                onClick={() => setFilter(pill.key)}
                aria-pressed={filter === pill.key}
                className={`rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                  filter === pill.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {pill.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={155}>
            <BarChart data={chartData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis dataKey="month" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={(value) => `$${value}`} />
              <Tooltip content={<CustomTooltip filter={filter} monthData={monthlyData} />} cursor={{ fill: "hsl(var(--muted))" }} />
              {filter === "all" ? (
                <>
                  <Bar dataKey="Boston" stackId="paid" fill="hsl(221 83% 53%)" />
                  <Bar dataKey="SLC" stackId="paid" fill="hsl(38 92% 50%)" />
                  <Bar dataKey="Falcetti" stackId="paid" fill={FALCETTI_COLOR} />
                  <Bar dataKey="Other" stackId="paid" fill="hsl(var(--muted-foreground) / 0.4)" radius={[3, 3, 0, 0]} />
                </>
              ) : (
                <>
                  <Bar
                    dataKey="Total"
                    fill={
                      filter === "boston"
                        ? "hsl(221 83% 53% / 0.25)"
                        : filter === "slc"
                          ? "hsl(38 92% 50% / 0.25)"
                          : filter === "falcetti"
                            ? "hsl(142 71% 45% / 0.25)"
                            : "hsl(var(--muted-foreground) / 0.2)"
                    }
                    radius={[3, 3, 0, 0]}
                  />
                  <Bar
                    dataKey="Paid"
                    fill={
                      filter === "boston"
                        ? "hsl(221 83% 53%)"
                        : filter === "slc"
                          ? "hsl(38 92% 50%)"
                          : filter === "falcetti"
                            ? FALCETTI_COLOR
                            : "hsl(var(--muted-foreground))"
                    }
                    radius={[3, 3, 0, 0]}
                  />
                </>
              )}
            </BarChart>
          </ResponsiveContainer>
        )}
        <div className="mt-2 flex flex-wrap items-center justify-center gap-3">
          {filter === "all" ? (
            <>
              <LegendItem color="hsl(221 83% 53%)" label="Boston" />
              <LegendItem color="hsl(38 92% 50%)" label="SLC" />
              <LegendItem color={FALCETTI_COLOR} label="Falcetti" />
              <LegendItem color="hsl(var(--muted-foreground) / 0.4)" label="Other" />
            </>
          ) : (
            <>
              <LegendItem color="hsl(var(--primary) / 0.25)" label="Total Billed" />
              <LegendItem color="hsl(var(--primary))" label="Paid" />
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />
      {label}
    </span>
  );
}
