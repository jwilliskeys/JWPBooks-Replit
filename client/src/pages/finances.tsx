import { useState, useMemo, useRef } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  DollarSign, TrendingUp, Car, Receipt, Plus, Trash2, Printer, Calculator,
  CheckCircle2, Route, Paperclip, X, FileText, Download,
  ClipboardCheck, ChevronDown, ExternalLink,
} from "lucide-react";
import { parseTimeToMinutes } from "@/lib/scheduling";
import {
  SCHEDULE_C_CATEGORIES,
  getCatInfo,
  IRS_MILEAGE_RATE as IRS_RATE,
  SE_TAX_RATE,
  type SchedCCat,
} from "@/lib/schedule-c";
import type { Invoice, MileageLog, BusinessExpense, Appointment, Customer, BankAccount, BankTransaction } from "@shared/schema";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const STANDARD_DEDUCTION = 15000; // 2026 single filer
const HOME_ADDRESS = "14 Murdock St Apt #3-4, Somerville, MA"; // Boston home base (customer fallback)
const MILEAGE_ORIGIN = "Somerville, MA"; // Boston mileage start point

function buildCustomerAddress(cust: Customer | undefined): string {
  if (!cust) return HOME_ADDRESS;
  const parts = [cust.address, cust.city, cust.state, cust.zipCode].filter(Boolean) as string[];
  return parts.length > 0 ? parts.join(", ") : HOME_ADDRESS;
}

function parseDollar(v: string | null | undefined): number {
  if (!v) return 0;
  const n = parseFloat(v.replace(/[$,]/g, ""));
  return isNaN(n) ? 0 : n;
}

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

function getQuarter(date: Date): number {
  const m = date.getMonth();
  if (m <= 2) return 1;
  if (m <= 4) return 2;
  if (m <= 7) return 3;
  return 4;
}

function fmt(n: number): string {
  return n.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function todayStr(): string {
  const d = new Date();
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(-2)}`;
}

function dateToSortKey(dateStr: string): number {
  const d = parseDate(dateStr);
  return d ? d.getTime() : 0;
}

function friendlyDate(dateStr: string): string {
  const d = parseDate(dateStr);
  if (!d) return dateStr;
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
}

interface MonthlyData {
  month: string;
  key: string;
  total: number;
  paid: number;
}

function IncomePanel({ invoices, loading }: { invoices: Invoice[] | undefined; loading: boolean }) {
  const currentYear = new Date().getFullYear();

  const monthlyData: MonthlyData[] = useMemo(() => {
    const now = new Date();
    const months: MonthlyData[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      months.push({ key, month: `${MONTH_NAMES[d.getMonth()]} '${String(d.getFullYear()).slice(-2)}`, total: 0, paid: 0 });
    }
    invoices?.forEach((inv) => {
      const date = parseDate(inv.invoiceDate);
      if (!date) return;
      const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
      const entry = months.find(m => m.key === key);
      if (!entry) return;
      entry.total += parseDollar(inv.total);
      if (inv.status === "paid") entry.paid += parseDollar(inv.paidAmount || inv.total);
    });
    return months;
  }, [invoices]);

  const ytd = useMemo(() => {
    let billed = 0, collected = 0;
    invoices?.forEach((inv) => {
      const date = parseDate(inv.invoiceDate);
      if (!date || date.getFullYear() !== currentYear) return;
      billed += parseDollar(inv.total);
      if (inv.status === "paid") collected += parseDollar(inv.paidAmount || inv.total);
    });
    return { billed, collected, outstanding: billed - collected };
  }, [invoices, currentYear]);

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <DollarSign className="h-4 w-4" /> Income & Invoices
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "YTD Billed", value: ytd.billed, color: "text-foreground" },
            { label: "YTD Collected", value: ytd.collected, color: "text-green-600 dark:text-green-400" },
            { label: "Outstanding", value: ytd.outstanding, color: "text-amber-600 dark:text-amber-400" },
          ].map(({ label, value, color }) => (
            <div key={label} className="rounded-md bg-muted/40 p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">{label}</p>
              {loading ? <Skeleton className="h-5 w-20 mx-auto" /> : (
                <p className={`text-sm font-bold ${color}`} data-testid={`finances-${label.toLowerCase().replace(/\s+/g, '-')}`}>{fmt(value)}</p>
              )}
            </div>
          ))}
        </div>
        {loading ? <Skeleton className="h-40 w-full" /> : (
          <>
            <ResponsiveContainer width="100%" height={150}>
              <BarChart data={monthlyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
                <XAxis dataKey="month" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} tickFormatter={v => `$${v}`} />
                <Tooltip
                  cursor={{ fill: "hsl(var(--muted))" }}
                  contentStyle={{ fontSize: 12, borderRadius: 6 }}
                  formatter={(v: number, name: string) => [fmt(v), name === "total" ? "Billed" : "Paid"]}
                />
                <Bar dataKey="total" name="total" fill="hsl(var(--primary) / 0.25)" radius={[3, 3, 0, 0]} />
                <Bar dataKey="paid" name="paid" fill="hsl(var(--primary))" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
            <div className="flex items-center gap-4 justify-center">
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary/25" /> Total Billed
              </span>
              <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary" /> Paid
              </span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

const QUARTER_DUE_DATES: Record<number, string> = {
  1: "Apr 15",
  2: "Jun 16",
  3: "Sep 15",
  4: "Jan 15 (next yr)",
};

const TAX_SAFE_HARBOR_RATE = 0.30;

function TaxPanel({ invoices, loading }: { invoices: Invoice[] | undefined; loading: boolean }) {
  const [showMath, setShowMath] = useState(false);
  const [incomeTaxRate, setIncomeTaxRate] = useState(22);
  const [useStdDed, setUseStdDed] = useState(true);
  const currentYear = new Date().getFullYear();

  // YTD collected income (paid invoices this year)
  const ytdCollected = useMemo(() => {
    let total = 0;
    invoices?.forEach(inv => {
      // Falcetti is W-9 payroll income, not self-employment billing — fully
      // excluded from tax calculations (SE tax, income tax, safe harbor).
      if (inv.incomeSource === "falcetti") return;
      if (inv.status !== "paid") return;
      const date = parseDate(inv.invoiceDate);
      if (!date || date.getFullYear() !== currentYear) return;
      total += parseDollar(inv.paidAmount || inv.total);
    });
    return total;
  }, [invoices, currentYear]);

  // Outstanding (billed but not yet paid)
  const ytdOutstanding = useMemo(() => {
    let total = 0;
    invoices?.forEach(inv => {
      if (inv.incomeSource === "falcetti") return;
      if (inv.status === "paid") return;
      const date = parseDate(inv.invoiceDate);
      if (!date || date.getFullYear() !== currentYear) return;
      total += parseDollar(inv.total);
    });
    return total;
  }, [invoices, currentYear]);

  const safeHarborTarget = ytdCollected * TAX_SAFE_HARBOR_RATE;

  // Detailed quarterly math (hidden by default)
  const quarterlyData = useMemo(() => {
    const quarters: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    invoices?.forEach(inv => {
      if (inv.incomeSource === "falcetti") return;
      if (inv.status !== "paid") return;
      const date = parseDate(inv.invoiceDate);
      if (!date || date.getFullYear() !== currentYear) return;
      quarters[getQuarter(date)] += parseDollar(inv.paidAmount || inv.total);
    });
    return quarters;
  }, [invoices, currentYear]);

  function calcSetAside(income: number) {
    const seTax = income * 0.9235 * SE_TAX_RATE;
    const halfSE = seTax / 2;
    const proratedStdDed = useStdDed ? STANDARD_DEDUCTION / 4 : 0;
    const taxableIncome = Math.max(0, income - halfSE - proratedStdDed);
    const incomeTax = taxableIncome * (incomeTaxRate / 100);
    return { seTax, incomeTax, total: seTax + incomeTax };
  }

  const annualIncome = Object.values(quarterlyData).reduce((s, v) => s + v, 0);
  const annualCalc = (() => {
    const seTax = annualIncome * 0.9235 * SE_TAX_RATE;
    const halfSE = seTax / 2;
    const stdDed = useStdDed ? STANDARD_DEDUCTION : 0;
    const taxableIncome = Math.max(0, annualIncome - halfSE - stdDed);
    const incomeTax = taxableIncome * (incomeTaxRate / 100);
    return { seTax, incomeTax, total: seTax + incomeTax };
  })();

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Calculator className="h-4 w-4" /> Tax Auto-Pilot
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {loading ? (
          <Skeleton className="h-28 w-full rounded-xl" />
        ) : ytdCollected === 0 ? (
          <div className="rounded-xl border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            No paid invoices yet this year — your tax number will appear here once you collect income.
          </div>
        ) : (
          <div className="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50/60 dark:bg-amber-900/10 px-4 py-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-400">
              Tax Safe Harbor
            </p>
            <p className="text-sm text-foreground leading-relaxed">
              You've collected{" "}
              <span className="font-bold">{fmt(ytdCollected)}</span> in income this year.
              {ytdOutstanding > 0 && (
                <> (<span className="text-muted-foreground">{fmt(ytdOutstanding)} still outstanding</span>)</>
              )}
            </p>
            <div className="rounded-lg bg-amber-100 dark:bg-amber-900/30 px-3 py-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-xs text-amber-700/70 dark:text-amber-400/60">Transfer to tax savings</p>
                <p className="text-2xl font-bold text-amber-700 dark:text-amber-300 tabular-nums">
                  {fmt(safeHarborTarget)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-xs text-amber-700/60 dark:text-amber-400/50">= 30% of income</p>
                <p className="text-xs text-amber-700/60 dark:text-amber-400/50 mt-0.5">safe harbor rate</p>
              </div>
            </div>
          </div>
        )}

        {/* Detailed math — hidden by default */}
        <button
          type="button"
          onClick={() => setShowMath(v => !v)}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          data-testid="toggle-tax-math"
        >
          <ChevronDown className={`h-3.5 w-3.5 transition-transform duration-200 ${showMath ? "rotate-180" : ""}`} />
          {showMath ? "Hide" : "View"} Detailed Tax Math
        </button>

        {showMath && (
          <div className="space-y-3 border rounded-lg p-3 bg-muted/20">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <div className="flex items-center gap-2">
                <Label className="text-xs text-muted-foreground whitespace-nowrap">Income bracket %</Label>
                <Input
                  type="number" min={0} max={50}
                  value={incomeTaxRate}
                  onChange={e => setIncomeTaxRate(Number(e.target.value))}
                  className="w-16 h-7 text-sm"
                  data-testid="input-income-tax-rate"
                />
              </div>
              <button
                type="button"
                onClick={() => setUseStdDed(v => !v)}
                className={`flex items-center gap-1.5 text-xs rounded-full px-3 py-1 border transition-colors ${
                  useStdDed ? "bg-primary/10 border-primary/40 text-primary font-medium" : "border-border text-muted-foreground hover:bg-muted/40"
                }`}
                data-testid="toggle-std-deduction"
              >
                {useStdDed ? "✓" : "○"} Std. deduction (${STANDARD_DEDUCTION.toLocaleString()})
              </button>
            </div>
            <div className="space-y-1.5">
              {([1, 2, 3, 4] as const).map(q => {
                const income = quarterlyData[q];
                const { seTax, incomeTax, total } = calcSetAside(income);
                return (
                  <div key={q} className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2 text-xs">
                    <div>
                      <span className="font-medium">Q{q} {currentYear}</span>
                      <span className="text-muted-foreground ml-2">Due {QUARTER_DUE_DATES[q]}</span>
                    </div>
                    <div className="text-right">
                      {loading ? <Skeleton className="h-4 w-24" /> : (
                        <>
                          <p className="text-muted-foreground">Income: {fmt(income)}</p>
                          <p className="text-muted-foreground">SE: {fmt(seTax)} · Inc: {fmt(incomeTax)}</p>
                          <p className="font-semibold text-amber-600 dark:text-amber-400">Set aside: {fmt(total)}</p>
                        </>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
            {!loading && annualIncome > 0 && (
              <div className="flex justify-between items-center rounded-md bg-muted/60 px-3 py-2 text-xs">
                <span className="font-medium">Annual IRS estimate {currentYear}</span>
                <div className="text-right">
                  <p className="font-bold">{fmt(annualCalc.total)}</p>
                  <p className="text-muted-foreground">SE: {fmt(annualCalc.seTax)} · Inc tax: {fmt(annualCalc.incomeTax)}</p>
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">Estimates only — consult your accountant. SE tax uses the 92.35% self-employment factor.</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface ItineraryDayRowProps {
  dateStr: string;
  dayAppts: Appointment[];
  customerMap: Map<number, Customer>;
  loggedDates: Set<string>;
  onAdd: (dateStr: string, miles: number, description: string) => void;
  isPending: boolean;
}

function ItineraryDayRow({ dateStr, dayAppts, customerMap, loggedDates, onAdd, isPending }: ItineraryDayRowProps) {
  const sortedAppts = useMemo(() => {
    return [...dayAppts].sort((a, b) => {
      const ma = parseTimeToMinutes(a.time || "");
      const mb = parseTimeToMinutes(b.time || "");
      if (ma < 0 && mb < 0) return 0;
      if (ma < 0) return 1;
      if (mb < 0) return -1;
      return ma - mb;
    });
  }, [dayAppts]);

  const addresses = useMemo(() => {
    const apptAddresses = sortedAppts.map(a => buildCustomerAddress(customerMap.get(a.customerId)));
    return [MILEAGE_ORIGIN, ...apptAddresses, MILEAGE_ORIGIN];
  }, [sortedAppts, customerMap]);

  const { data: drivingData, isLoading } = useQuery<{ distances: number[] | null; durations: number[] | null; error?: string }>({
    queryKey: ["/api/driving-times", addresses.join("|")],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/driving-times", { addresses });
      return res.json();
    },
    enabled: addresses.length >= 2,
    staleTime: 30 * 60 * 1000,
  });

  const totalMiles = useMemo(() => {
    const dists = drivingData?.distances;
    if (!dists || dists.length === 0) return null;
    const valid = dists.filter(d => d >= 0);
    if (valid.length === 0) return null;
    return Math.round(valid.reduce((s, d) => s + d, 0) * 10) / 10;
  }, [drivingData]);

  const isLogged = loggedDates.has(dateStr);
  const unavailable = !drivingData?.distances && !isLoading;
  const apiError = drivingData?.error;

  if (apiError || (unavailable && !isLoading)) return null;

  const cities = Array.from(new Set(dayAppts.map(a => customerMap.get(a.customerId)?.city).filter(Boolean))).join(", ");
  const description = `Service calls${cities ? ` — ${cities}` : ""} (${friendlyDate(dateStr)})`;
  const count = dayAppts.length;

  return (
    <div className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2.5 ${isLogged ? "opacity-50" : ""}`} data-testid={`itinerary-row-${dateStr}`}>
      <div className="flex items-center gap-2.5 min-w-0">
        <Route className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
        <div className="min-w-0">
          <p className="text-sm font-medium leading-none">{friendlyDate(dateStr)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{count} appointment{count !== 1 ? "s" : ""}{cities ? ` · ${cities}` : ""}</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {isLoading ? (
          <Skeleton className="h-4 w-16" />
        ) : totalMiles != null ? (
          <span className="text-sm font-semibold tabular-nums">{totalMiles} mi</span>
        ) : (
          <span className="text-xs text-muted-foreground">unavailable</span>
        )}
        {isLogged ? (
          <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
            <CheckCircle2 className="h-3.5 w-3.5" /> Logged
          </span>
        ) : (
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs"
            disabled={totalMiles == null || isPending}
            onClick={() => totalMiles != null && onAdd(dateStr, totalMiles, description)}
            data-testid={`button-log-itinerary-${dateStr}`}
          >
            Add to Log
          </Button>
        )}
      </div>
    </div>
  );
}

function MileageTab() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ date: todayStr(), description: "", miles: "" });

  const { data: logs, isLoading: logsLoading } = useQuery<MileageLog[]>({ queryKey: ["/api/mileage-logs"] });
  const { data: appointments } = useQuery<Appointment[]>({ queryKey: ["/api/appointments"] });
  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });

  const customerMap = useMemo(() => {
    const m = new Map<number, Customer>();
    customers?.forEach(c => m.set(c.id, c));
    return m;
  }, [customers]);

  const createMutation = useMutation({
    mutationFn: (data: { date: string; description: string; miles: string }) =>
      apiRequest("POST", "/api/mileage-logs", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/mileage-logs"] });
      setOpen(false);
      setForm({ date: todayStr(), description: "", miles: "" });
      toast({ title: "Mileage logged" });
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/mileage-logs/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/mileage-logs"] }),
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const totalMiles = useMemo(() => (logs ?? []).reduce((s, l) => s + (parseFloat(l.miles) || 0), 0), [logs]);
  const deduction = totalMiles * IRS_RATE;

  const loggedDates = useMemo(() => new Set((logs ?? []).map(l => l.date)), [logs]);

  const itineraryDays = useMemo(() => {
    if (!appointments) return [];
    // Show only the current week (Mon–Sun surrounding today)
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sun
    const monday = new Date(now);
    monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
    monday.setHours(0, 0, 0, 0);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23, 59, 59, 999);

    const byDate = new Map<string, Appointment[]>();
    appointments.forEach(a => {
      const d = parseDate(a.date);
      if (!d || d < monday || d > sunday) return;
      if (!byDate.has(a.date)) byDate.set(a.date, []);
      byDate.get(a.date)!.push(a);
    });

    return Array.from(byDate.entries())
      .sort((a, b) => dateToSortKey(a[0]) - dateToSortKey(b[0]));
  }, [appointments]);

  function handleAddFromItinerary(dateStr: string, miles: number, description: string) {
    createMutation.mutate({ date: dateStr, description, miles: String(miles) });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-5">
          <div>
            <p className="text-xs text-muted-foreground">Total Miles</p>
            <p className="text-sm font-bold" data-testid="finances-total-miles">{totalMiles.toLocaleString()}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">IRS Deduction (${IRS_RATE}/mi)</p>
            <p className="text-sm font-bold text-green-600 dark:text-green-400">{fmt(deduction)}</p>
          </div>
        </div>
        <Button size="sm" onClick={() => setOpen(true)} data-testid="button-add-miles">
          <Plus className="h-4 w-4 mr-1" /> Add Miles
        </Button>
      </div>

      {itineraryDays.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">From Itinerary</p>
            <div className="flex-1 border-t" />
          </div>
          <p className="text-xs text-muted-foreground -mt-1">Auto-calculated from your appointment schedule. Click "Add to Log" to record the miles.</p>
          <div className="space-y-1.5">
            {itineraryDays.map(([dateStr, appts]) => (
              <ItineraryDayRow
                key={dateStr}
                dateStr={dateStr}
                dayAppts={appts}
                customerMap={customerMap}
                loggedDates={loggedDates}
                onAdd={handleAddFromItinerary}
                isPending={createMutation.isPending}
              />
            ))}
          </div>
        </div>
      )}

      {/* Log history — collapsed to a single summary line */}
      <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2.5">
        <div className="flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs text-muted-foreground">Total YTD Deductible</span>
        </div>
        {logsLoading ? (
          <Skeleton className="h-4 w-20" />
        ) : (
          <span className="text-sm font-bold text-green-600 dark:text-green-400" data-testid="finances-ytd-deductible">
            {fmt(deduction)}
          </span>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Mileage</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Date</Label>
              <Input
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                placeholder="M/D/YY"
                data-testid="input-mileage-date"
              />
            </div>
            <div>
              <Label className="text-xs">Purpose / Description</Label>
              <Input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="e.g. Client visits — Davis County"
                data-testid="input-mileage-description"
              />
            </div>
            <div>
              <Label className="text-xs">Miles Driven</Label>
              <Input
                type="number"
                min="0"
                step="0.1"
                value={form.miles}
                onChange={e => setForm(f => ({ ...f, miles: e.target.value }))}
                placeholder="0"
                data-testid="input-mileage-miles"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate(form)}
              disabled={!form.date || !form.miles || createMutation.isPending}
              data-testid="button-save-mileage"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ExpensesTab() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()));
  const [categoryFilter, setCategoryFilter] = useState("All");
  const [form, setForm] = useState({ date: todayStr(), description: "", category: "Supplies", amount: "" });
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { data: expenses, isLoading } = useQuery<BusinessExpense[]>({ queryKey: ["/api/business-expenses"] });

  function handleReceiptChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null;
    setReceiptFile(file);
    if (file) {
      const url = URL.createObjectURL(file);
      setReceiptPreview(url);
    } else {
      setReceiptPreview(null);
    }
  }

  function resetForm() {
    setForm({ date: todayStr(), description: "", category: "Equipment", amount: "" });
    setReceiptFile(null);
    setReceiptPreview(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  const createMutation = useMutation({
    mutationFn: async (data: typeof form) => {
      const res = await apiRequest("POST", "/api/business-expenses", data);
      const created: BusinessExpense = await res.json();
      let receiptFailed = false;
      if (receiptFile) {
        const fd = new FormData();
        fd.append("receipt", receiptFile);
        const uploadRes = await fetch(`/api/business-expenses/${created.id}/receipt`, { method: "POST", body: fd });
        if (!uploadRes.ok) receiptFailed = true;
      }
      return { created, receiptFailed };
    },
    onSuccess: ({ receiptFailed }) => {
      queryClient.invalidateQueries({ queryKey: ["/api/business-expenses"] });
      setOpen(false);
      resetForm();
      if (receiptFailed) {
        toast({ title: "Expense saved", description: "Receipt upload failed — you can retry by editing the expense.", variant: "destructive" });
      } else {
        toast({ title: "Expense saved" });
      }
    },
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/business-expenses/${id}`),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/business-expenses"] }),
    onError: () => toast({ title: "Failed to delete", variant: "destructive" }),
  });

  const years = useMemo(() => {
    const set = new Set<string>();
    set.add(String(new Date().getFullYear()));
    expenses?.forEach(e => {
      const d = parseDate(e.date);
      if (d) set.add(String(d.getFullYear()));
    });
    return Array.from(set).sort((a, b) => parseInt(b) - parseInt(a));
  }, [expenses]);

  const forYear = useMemo(() =>
    (expenses ?? []).filter(e => {
      const d = parseDate(e.date);
      return d && String(d.getFullYear()) === yearFilter;
    }),
    [expenses, yearFilter]
  );

  const filtered = useMemo(() =>
    categoryFilter === "All" ? forYear : forYear.filter(e => e.category === categoryFilter),
    [forYear, categoryFilter]
  );

  const ytdTotal = useMemo(() => forYear.reduce((s, e) => s + parseDollar(e.amount), 0), [forYear]);

  const ytdDeductible = useMemo(() => forYear.reduce((s, e) => {
    const info = getCatInfo(e.category);
    return s + parseDollar(e.amount) * (info.deductPct / 100);
  }, 0), [forYear]);

  const byCategory = useMemo(() => {
    const map: Record<string, number> = {};
    forYear.forEach(e => {
      map[e.category] = (map[e.category] || 0) + parseDollar(e.amount);
    });
    return map;
  }, [forYear]);

  function handlePrintReport() {
    const win = window.open("", "_blank", "width=800,height=700");
    if (!win) return;

    // Group expenses by their IRS line, handling both old and new category names
    const seen = new Set<string>();
    const allCats = forYear.map(e => e.category).filter(c => { if (seen.has(c)) return false; seen.add(c); return true; });
    const sortedCats = allCats.sort((a, b) => {
      const la = getCatInfo(a).line;
      const lb = getCatInfo(b).line;
      return la.localeCompare(lb);
    });

    let totalDeductible = 0;
    const rows = sortedCats
      .filter(cat => byCategory[cat])
      .map(cat => {
        const info = getCatInfo(cat);
        const items = forYear.filter(e => e.category === cat);
        const catTotal = items.reduce((s, e) => s + parseDollar(e.amount), 0);
        const catDeductible = catTotal * (info.deductPct / 100);
        totalDeductible += catDeductible;
        const itemRows = items.map(e =>
          `<tr>
            <td style="padding:4px 8px;color:#555">${e.date}</td>
            <td style="padding:4px 8px">${e.description}</td>
            <td style="padding:4px 8px;text-align:right">${fmt(parseDollar(e.amount))}</td>
            <td style="padding:4px 8px;text-align:right;color:#444">${info.deductPct < 100 ? fmt(parseDollar(e.amount) * info.deductPct / 100) : "—"}</td>
          </tr>`
        ).join("");
        const headerLabel = `${info.line}: ${cat}${info.deductPct < 100 ? ` (${info.deductPct}% deductible)` : ""}`;
        return `
          <tr><td colspan="4" style="background:#f5f5f5;font-weight:600;padding:6px 8px;border-top:2px solid #ddd">${headerLabel}</td></tr>
          ${itemRows}
          <tr>
            <td colspan="2" style="padding:4px 8px;text-align:right;font-style:italic;color:#555">Subtotal</td>
            <td style="padding:4px 8px;text-align:right;font-weight:600">${fmt(catTotal)}</td>
            <td style="padding:4px 8px;text-align:right;font-weight:600;color:#16a34a">${fmt(catDeductible)}</td>
          </tr>`;
      }).join("");

    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Schedule C Expense Report ${yearFilter}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 13px; margin: 40px; color: #222; }
    h1 { font-size: 18px; margin-bottom: 4px; }
    .meta { color: #666; font-size: 12px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 6px 8px; border-bottom: 2px solid #333; font-size: 12px; }
    th:last-child, th:nth-last-child(2) { text-align: right; }
    .total-row td { border-top: 2px solid #333; font-size: 14px; font-weight: 700; padding: 8px; }
    .total-row td:last-child, .total-row td:nth-last-child(2) { text-align: right; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  <h1>IRS Schedule C Expense Report — ${yearFilter}</h1>
  <p class="meta">John Willis Piano · Generated ${new Date().toLocaleDateString()} · Expenses organized by Schedule C line</p>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Description</th>
        <th style="text-align:right">Amount</th>
        <th style="text-align:right">Deductible</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      <tr class="total-row">
        <td colspan="2">Total ${yearFilter} Deductible Expenses</td>
        <td>${fmt(ytdTotal)}</td>
        <td style="color:#16a34a">${fmt(totalDeductible)}</td>
      </tr>
    </tbody>
  </table>
  <br/>
  <button onclick="window.print()" style="padding:8px 20px;font-size:13px;cursor:pointer">Print / Save as PDF</button>
</body>
</html>`);
    win.document.close();
  }

  function handleScheduleCExport() {
    const rows: string[] = [
      `"IRS Schedule C Summary — ${yearFilter} — John Willis Piano"`,
      `"Generated: ${new Date().toLocaleDateString()}"`,
      `""`,
      `"IRS Line","Category","Total Spent","Deductible Amount","Notes"`,
    ];

    // Group by IRS line
    const catMap = new Map<string, { cat: string; info: SchedCCat; exps: BusinessExpense[] }>();
    for (const exp of forYear) {
      const info = getCatInfo(exp.category);
      const key = info.line + "__" + exp.category;
      if (!catMap.has(key)) catMap.set(key, { cat: exp.category, info, exps: [] });
      catMap.get(key)!.exps.push(exp);
    }

    let totalSpent = 0;
    let totalDeductible = 0;
    catMap.forEach(({ cat, info, exps }) => {
      const spent = exps.reduce((s, e) => s + parseDollar(e.amount), 0);
      const ded = spent * (info.deductPct / 100);
      totalSpent += spent;
      totalDeductible += ded;
      const note = info.deductPct < 100 ? `${info.deductPct}% deductible` : "";
      rows.push(`"${info.line}","${cat}","${spent.toFixed(2)}","${ded.toFixed(2)}","${note}"`);
    });

    rows.push(`"","","","",""`);
    rows.push(`"Line 9","Mileage (see Mileage log)","(see mileage tab)","${IRS_RATE}/mi × miles","IRS standard mileage rate"`);
    rows.push(`"","","","",""`);
    rows.push(`"TOTAL","All expense deductions","${totalSpent.toFixed(2)}","${totalDeductible.toFixed(2)}",""`);

    const csv = rows.join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `schedule-c-${yearFilter}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  const usedCategories = Object.keys(byCategory);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={yearFilter} onValueChange={v => { setYearFilter(v); setCategoryFilter("All"); }}>
            <SelectTrigger className="w-24 h-8 text-sm" data-testid="select-expense-year">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={categoryFilter} onValueChange={setCategoryFilter}>
            <SelectTrigger className="w-36 h-8 text-sm" data-testid="select-expense-category-filter">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="All">All Categories</SelectItem>
              {usedCategories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground">
              Spent: <span className="font-semibold text-foreground" data-testid="finances-ytd-expenses">{fmt(ytdTotal)}</span>
            </span>
            <span className="text-xs text-muted-foreground">
              Deductible: <span className="font-semibold text-green-600 dark:text-green-400">{fmt(ytdDeductible)}</span>
            </span>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={handleScheduleCExport} data-testid="button-schedule-c-export">
            <Download className="h-4 w-4 mr-1" /> Schedule C CSV
          </Button>
          <Button variant="outline" size="sm" onClick={handlePrintReport} data-testid="button-print-report">
            <Printer className="h-4 w-4 mr-1" /> Print Report
          </Button>
          <Button size="sm" onClick={() => setOpen(true)} data-testid="button-add-expense">
            <Plus className="h-4 w-4 mr-1" /> Add Expense
          </Button>
        </div>
      </div>

      {usedCategories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {usedCategories.map(cat => {
            const info = getCatInfo(cat);
            const ded = byCategory[cat] * (info.deductPct / 100);
            return (
              <button
                key={cat}
                onClick={() => setCategoryFilter(f => f === cat ? "All" : cat)}
                data-testid={`badge-category-${cat.toLowerCase().replace(/\s+/g, '-')}`}
              >
                <Badge
                  variant={categoryFilter === cat ? "default" : "secondary"}
                  className="text-xs cursor-pointer"
                >
                  {info.line}: {cat} · {fmt(ded)}{info.deductPct < 100 ? ` (${info.deductPct}%)` : ""}
                </Badge>
              </button>
            );
          })}
        </div>
      )}

      {isLoading ? (
        <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
      ) : filtered.length > 0 ? (
        <div className="rounded-md border overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Date</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Description</th>
                <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Category</th>
                <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Amount</th>
                <th className="w-8" />
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {filtered.map(exp => (
                <tr key={exp.id} className="border-b last:border-0 hover:bg-muted/20" data-testid={`expense-row-${exp.id}`}>
                  <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{exp.date}</td>
                  <td className="px-3 py-2 text-xs truncate max-w-[140px]">{exp.description}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="text-[10px]">{getCatInfo(exp.category).line}</Badge>
                    <span className="ml-1 text-[10px] text-muted-foreground hidden sm:inline">{exp.category}</span>
                  </td>
                  <td className="px-3 py-2 text-xs text-right font-medium">{fmt(parseDollar(exp.amount))}</td>
                  <td className="px-2 py-2">
                    {exp.receiptUrl ? (
                      <button
                        onClick={() => setLightboxUrl(exp.receiptUrl!)}
                        className="block w-7 h-7 rounded overflow-hidden border border-border hover:opacity-80 transition-opacity"
                        title="View receipt"
                        data-testid={`button-receipt-${exp.id}`}
                      >
                        <img src={exp.receiptUrl} alt="Receipt" className="w-full h-full object-cover" />
                      </button>
                    ) : (
                      <span className="flex items-center justify-center w-7 h-7 text-muted-foreground/30">
                        <Paperclip className="h-3.5 w-3.5" />
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-2">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 text-muted-foreground hover:text-destructive"
                      onClick={() => deleteMutation.mutate(exp.id)}
                      data-testid={`button-delete-expense-${exp.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="text-sm text-muted-foreground py-4 text-center">
          {forYear.length === 0 ? `No expenses for ${yearFilter}` : `No expenses in "${categoryFilter}" for ${yearFilter}`}
        </p>
      )}

      <Dialog open={open} onOpenChange={v => { setOpen(v); if (!v) resetForm(); }}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Add Expense</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Date</Label>
              <Input
                value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                placeholder="M/D/YY"
                data-testid="input-expense-date"
              />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Input
                value={form.description}
                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                placeholder="e.g. Tuning hammer replacement"
                data-testid="input-expense-description"
              />
            </div>
            <div>
              <Label className="text-xs">Category</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger data-testid="select-expense-category" className="text-base md:text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {SCHEDULE_C_CATEGORIES.map(c => (
                    <SelectItem key={c.label} value={c.label} className="py-3 sm:py-1.5">
                      <span className="text-muted-foreground text-xs mr-1.5">{c.line}</span>
                      {c.label}{c.deductPct < 100 ? ` (${c.deductPct}%)` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Amount</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
                placeholder="0.00"
                data-testid="input-expense-amount"
              />
            </div>
            <div>
              <Label className="text-xs">Receipt Photo (optional)</Label>
              <div className="flex items-center gap-2 mt-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 text-xs gap-1.5"
                  onClick={() => fileInputRef.current?.click()}
                  data-testid="button-attach-receipt"
                >
                  <Paperclip className="h-3.5 w-3.5" />
                  {receiptFile ? "Change photo" : "Attach photo"}
                </Button>
                {receiptFile && (
                  <span className="text-xs text-muted-foreground truncate max-w-[120px]">{receiptFile.name}</span>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleReceiptChange}
                  data-testid="input-receipt-file"
                />
              </div>
              {receiptPreview && (
                <div className="mt-2 relative inline-block">
                  <img
                    src={receiptPreview}
                    alt="Receipt preview"
                    className="h-24 w-auto rounded border border-border object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => { setReceiptFile(null); setReceiptPreview(null); if (fileInputRef.current) fileInputRef.current.value = ""; }}
                    className="absolute -top-1.5 -right-1.5 bg-background border border-border rounded-full p-0.5 hover:bg-muted"
                    data-testid="button-remove-receipt-preview"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setOpen(false); resetForm(); }}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate(form)}
              disabled={!form.date || !form.description || !form.amount || createMutation.isPending}
              data-testid="button-save-expense"
            >
              {createMutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {lightboxUrl && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80"
          onClick={() => setLightboxUrl(null)}
          data-testid="lightbox-overlay"
        >
          <div className="relative max-w-[90vw] max-h-[90vh]" onClick={e => e.stopPropagation()}>
            <img
              src={lightboxUrl}
              alt="Receipt"
              className="max-w-full max-h-[85vh] rounded-lg object-contain"
              data-testid="lightbox-image"
            />
            <button
              onClick={() => setLightboxUrl(null)}
              className="absolute -top-3 -right-3 bg-background border border-border rounded-full p-1 hover:bg-muted shadow"
              data-testid="button-close-lightbox"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      </div>
  );
}

function BankFeedTab({ invoices }: { invoices: Invoice[] | undefined }) {
  const { toast } = useToast();
  const [linking, setLinking] = useState(false);
  const [syncing, setSyncing] = useState<number | null>(null);

  const { data: plaidStatus } = useQuery<{ enabled: boolean; env: string; message: string }>({
    queryKey: ["/api/plaid/status"],
    staleTime: 60_000,
  });

  const { data: accounts, refetch: refetchAccounts } = useQuery<BankAccount[]>({
    queryKey: ["/api/bank-accounts"],
    enabled: plaidStatus?.enabled === true,
  });

  const { data: transactions, refetch: refetchTxns } = useQuery<BankTransaction[]>({
    queryKey: ["/api/bank-transactions"],
    enabled: plaidStatus?.enabled === true,
  });

  const tagMutation = useMutation({
    mutationFn: ({ id, tag, cat }: { id: number; tag: string; cat?: string }) =>
      apiRequest("PATCH", `/api/bank-transactions/${id}`, { businessTag: tag, schedCCategory: cat ?? null }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/bank-transactions"] }),
    onError: () => toast({ title: "Failed to save", variant: "destructive" }),
  });

  const disconnectMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/bank-accounts/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/bank-accounts"] });
      queryClient.invalidateQueries({ queryKey: ["/api/bank-transactions"] });
      toast({ title: "Account disconnected" });
    },
    onError: () => toast({ title: "Failed to disconnect", variant: "destructive" }),
  });

  async function handleSync(accountId: number) {
    setSyncing(accountId);
    try {
      const res = await apiRequest("POST", `/api/bank-accounts/${accountId}/sync`, {});
      const data = await res.json() as { synced: number };
      await refetchTxns();
      toast({ title: `Synced ${data.synced} new transaction${data.synced !== 1 ? "s" : ""}` });
    } catch {
      toast({ title: "Sync failed", variant: "destructive" });
    } finally {
      setSyncing(null);
    }
  }

  async function handleConnectAccount() {
    setLinking(true);
    try {
      const res = await apiRequest("POST", "/api/plaid/link-token", {});
      const { link_token } = await res.json() as { link_token: string };

      // Load Plaid Link SDK dynamically
      await new Promise<void>((resolve, reject) => {
        if ((window as any).Plaid) { resolve(); return; }
        const script = document.createElement("script");
        script.src = "https://cdn.plaid.com/link/v2/stable/link-initialize.js";
        script.onload = () => resolve();
        script.onerror = reject;
        document.head.appendChild(script);
      });

      const plaidLink = (window as any).Plaid.create({
        token: link_token,
        onSuccess: async (publicToken: string, metadata: any) => {
          const accounts = (metadata.accounts ?? []).map((a: any) => ({
            id: a.id,
            name: a.name,
            type: a.subtype ?? a.type,
            mask: a.mask,
          }));
          await apiRequest("POST", "/api/plaid/exchange-token", {
            public_token: publicToken,
            institution_name: metadata.institution?.name ?? null,
            accounts,
          });
          await refetchAccounts();
          toast({ title: "Account connected! Tap Sync to pull transactions." });
        },
        onExit: () => setLinking(false),
        onEvent: () => {},
      });
      plaidLink.open();
    } catch (e: any) {
      toast({ title: e?.message ?? "Failed to open bank connection", variant: "destructive" });
      setLinking(false);
    }
  }

  // Auto-match transactions to outstanding invoices by amount
  const invoiceAmountMap = useMemo(() => {
    const map = new Map<string, Invoice>();
    (invoices ?? []).filter(inv => inv.status !== "paid").forEach(inv => {
      const amount = parseDollar(inv.total).toFixed(2);
      map.set(amount, inv);
    });
    return map;
  }, [invoices]);

  const reviewQueue = useMemo(() =>
    (transactions ?? []).filter(t => !t.businessTag && !t.pending),
    [transactions]
  );

  const businessTxns = useMemo(() =>
    (transactions ?? []).filter(t => t.businessTag === "business"),
    [transactions]
  );

  if (!plaidStatus?.enabled) {
    return (
      <div className="space-y-4">
        <div className="rounded-md border border-dashed p-6 text-center space-y-3">
          <div className="text-2xl">🏦</div>
          <p className="font-semibold text-sm">Bank Feed Not Configured</p>
          <p className="text-xs text-muted-foreground max-w-sm mx-auto">
            {plaidStatus?.message ?? "Add PLAID_CLIENT_ID and PLAID_SECRET to your .env file to enable automatic transaction import from America First, Apple Card, and Amazon."}
          </p>
          <div className="rounded-md bg-muted/40 p-3 text-left text-xs font-mono space-y-1 max-w-sm mx-auto">
            <p className="text-muted-foreground"># Add to .env</p>
            <p>PLAID_CLIENT_ID=your_client_id</p>
            <p>PLAID_SECRET=your_secret_key</p>
            <p>PLAID_ENV=sandbox</p>
            <p className="mt-2 text-muted-foreground"># Then run:</p>
            <p>npm run db:push</p>
          </div>
          <p className="text-xs text-muted-foreground">Get free API keys at <strong>plaid.com/developers</strong>. Supports America First, Apple Card (via Apple Finance Kit), and Amazon.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Connected accounts */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Connected Accounts</p>
          <Button size="sm" onClick={handleConnectAccount} disabled={linking} data-testid="button-connect-bank">
            <Plus className="h-4 w-4 mr-1" />
            {linking ? "Connecting…" : "Connect Account"}
          </Button>
        </div>
        {!accounts || accounts.length === 0 ? (
          <p className="text-sm text-muted-foreground py-2 text-center">No accounts connected yet. Click "Connect Account" to link America First, Apple Card, or Amazon.</p>
        ) : (
          <div className="rounded-md border overflow-hidden">
            {accounts.map(acct => (
              <div key={acct.id} className="flex items-center justify-between px-3 py-2 border-b last:border-0 hover:bg-muted/20">
                <div>
                  <p className="text-sm font-medium">{acct.institutionName} — {acct.accountName}</p>
                  <p className="text-xs text-muted-foreground capitalize">{acct.accountType} ···{acct.accountMask}</p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={syncing === acct.id}
                    onClick={() => handleSync(acct.id)}
                    data-testid={`button-sync-account-${acct.id}`}
                  >
                    {syncing === acct.id ? "Syncing…" : "Sync"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-7 text-xs text-muted-foreground hover:text-destructive"
                    onClick={() => disconnectMutation.mutate(acct.id)}
                    data-testid={`button-disconnect-account-${acct.id}`}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Review queue */}
      {reviewQueue.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Review Queue</p>
            <Badge variant="secondary" className="text-xs">{reviewQueue.length} unreviewed</Badge>
            <div className="flex-1 border-t" />
          </div>
          <p className="text-xs text-muted-foreground -mt-1">Mark each transaction as Business or Personal. Business transactions are tracked against your Schedule C.</p>
          <div className="rounded-md border overflow-hidden">
            {reviewQueue.slice(0, 30).map(txn => {
              const amt = parseFloat(txn.amount);
              const isDebit = amt > 0;
              const matchedInvoice = invoiceAmountMap.get(Math.abs(amt).toFixed(2));
              return (
                <div key={txn.id} className="border-b last:border-0 px-3 py-2.5 hover:bg-muted/20" data-testid={`txn-row-${txn.id}`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{txn.merchantName ?? txn.description ?? "Unknown"}</p>
                      <p className="text-xs text-muted-foreground">{txn.date} · {txn.category}</p>
                      {matchedInvoice && (
                        <p className="text-xs text-green-600 dark:text-green-400 mt-0.5">
                          💡 Matches Invoice #{matchedInvoice.invoiceNumber} ({matchedInvoice.customerName})
                        </p>
                      )}
                    </div>
                    <span className={`text-sm font-semibold tabular-nums shrink-0 ${isDebit ? "text-red-600 dark:text-red-400" : "text-green-600 dark:text-green-400"}`}>
                      {isDebit ? "-" : "+"}{fmt(Math.abs(amt))}
                    </span>
                  </div>
                  <div className="flex gap-2 flex-wrap">
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-700 dark:text-blue-400"
                      onClick={() => tagMutation.mutate({ id: txn.id, tag: "business" })}
                      disabled={tagMutation.isPending}
                      data-testid={`button-tag-business-${txn.id}`}
                    >
                      Business
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs"
                      onClick={() => tagMutation.mutate({ id: txn.id, tag: "personal" })}
                      disabled={tagMutation.isPending}
                      data-testid={`button-tag-personal-${txn.id}`}
                    >
                      Personal
                    </Button>
                    {isDebit && (
                      <Select onValueChange={cat => tagMutation.mutate({ id: txn.id, tag: "business", cat })}>
                        <SelectTrigger className="h-7 w-36 text-xs">
                          <SelectValue placeholder="→ Sched C…" />
                        </SelectTrigger>
                        <SelectContent>
                          {SCHEDULE_C_CATEGORIES.map(c => (
                            <SelectItem key={c.label} value={c.label} className="text-xs">
                              {c.line}: {c.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
          {reviewQueue.length > 30 && (
            <p className="text-xs text-muted-foreground text-center">Showing 30 of {reviewQueue.length} — sync more or review these first.</p>
          )}
        </div>
      )}

      {/* Business summary */}
      {businessTxns.length > 0 && (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Business Transactions</p>
            <div className="flex-1 border-t" />
          </div>
          <div className="rounded-md bg-muted/40 px-3 py-2.5 flex justify-between items-center">
            <span className="text-sm">{businessTxns.length} transactions tagged as Business</span>
            <span className="text-sm font-bold text-red-600 dark:text-red-400">
              {fmt(businessTxns.filter(t => parseFloat(t.amount) > 0).reduce((s, t) => s + parseFloat(t.amount), 0))} expenses
            </span>
          </div>
        </div>
      )}

      {!accounts?.length && reviewQueue.length === 0 && (
        <p className="text-xs text-muted-foreground text-center py-2">Connect an account above, then sync to pull in transactions.</p>
      )}
    </div>
  );
}

function SalesTaxTab({ invoices }: { invoices: Invoice[] | undefined }) {
  const [yearFilter, setYearFilter] = useState(String(new Date().getFullYear()));

  const years = useMemo(() => {
    const set = new Set<string>([String(new Date().getFullYear())]);
    invoices?.forEach(inv => {
      const d = parseDate(inv.invoiceDate);
      if (d) set.add(String(d.getFullYear()));
    });
    return Array.from(set).sort((a, b) => parseInt(b) - parseInt(a));
  }, [invoices]);

  const yearInvoices = useMemo(() =>
    (invoices ?? []).filter(inv => {
      // Falcetti payroll income isn't piano-service billing — exclude from
      // sales-tax revenue tracking (labor/parts/untagged).
      if (inv.incomeSource === "falcetti") return false;
      const d = parseDate(inv.invoiceDate);
      return d && String(d.getFullYear()) === yearFilter && inv.status === "paid";
    }),
    [invoices, yearFilter]
  );

  const { laborRevenue, partsRevenue, unknownRevenue } = useMemo(() => {
    let labor = 0, parts = 0, unknown = 0;
    yearInvoices.forEach(inv => {
      let items: Array<{ lineTotal?: string; type?: string }> = [];
      try { items = JSON.parse(inv.lineItems); } catch {}
      items.forEach(li => {
        const amount = parseDollar(li.lineTotal ?? "0");
        if (li.type === "parts") parts += amount;
        else if (li.type === "labor") labor += amount;
        else unknown += amount;
      });
    });
    return { laborRevenue: labor, partsRevenue: parts, unknownRevenue: unknown };
  }, [yearInvoices]);

  const total = laborRevenue + partsRevenue + unknownRevenue;
  const pct = (n: number) => total > 0 ? Math.round(n / total * 100) : 0;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-wrap">
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-24 h-8 text-sm" data-testid="select-salestax-year">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map(y => <SelectItem key={y} value={y}>{y}</SelectItem>)}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">Paid invoices only · Tag line items as Labor/Parts on each invoice to populate this report</span>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-md bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground mb-1">Labor Revenue</p>
          <p className="text-sm font-bold text-green-600 dark:text-green-400">{fmt(laborRevenue)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{pct(laborRevenue)}% · Non-taxable (most states)</p>
        </div>
        <div className="rounded-md bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground mb-1">Parts Revenue</p>
          <p className="text-sm font-bold text-amber-600 dark:text-amber-400">{fmt(partsRevenue)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{pct(partsRevenue)}% · Collect &amp; remit sales tax</p>
        </div>
        <div className="rounded-md bg-muted/40 p-3">
          <p className="text-xs text-muted-foreground mb-1">Untagged</p>
          <p className="text-sm font-bold">{fmt(unknownRevenue)}</p>
          <p className="text-xs text-muted-foreground mt-0.5">{pct(unknownRevenue)}% · Edit invoices to tag</p>
        </div>
      </div>

      {total > 0 && (
        <div className="rounded-md border px-3 py-2.5 space-y-1.5 text-sm">
          <div className="flex justify-between"><span className="text-muted-foreground">Total Revenue</span><span className="font-semibold">{fmt(total)}</span></div>
          <div className="flex justify-between"><span className="text-muted-foreground">Labor (non-taxable)</span><span className="text-green-600 dark:text-green-400">{fmt(laborRevenue)}</span></div>
          <div className="flex justify-between border-t pt-1.5"><span className="font-medium">Parts taxable revenue</span><span className="font-semibold text-amber-600 dark:text-amber-400">{fmt(partsRevenue)}</span></div>
        </div>
      )}

      <div className="rounded-md bg-muted/20 border border-dashed p-3 text-xs text-muted-foreground space-y-1">
        <p className="font-medium text-foreground text-xs">Sales Tax Rates</p>
        <p><strong>MA:</strong> Labor generally non-taxable; piano parts &amp; supplies sold to customers taxable at <strong>6.25%</strong>.</p>
        <p><strong>UT:</strong> Labor non-taxable; tangible parts taxable at local rate (~<strong>7.1%</strong> Salt Lake County).</p>
        <p className="italic">Tag each line item as "Labor" or "Parts" on invoices to make this accurate.</p>
      </div>
    </div>
  );
}

function DeductiblesPanel({ invoices }: { invoices: Invoice[] | undefined }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Receipt className="h-4 w-4" /> Deductibles
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="mileage">
          <TabsList className="mb-4 flex-wrap h-auto gap-1">
            <TabsTrigger value="mileage" data-testid="tab-mileage"><Car className="h-3.5 w-3.5 mr-1.5" />Mileage</TabsTrigger>
            <TabsTrigger value="expenses" data-testid="tab-expenses"><Receipt className="h-3.5 w-3.5 mr-1.5" />Expenses</TabsTrigger>
            <TabsTrigger value="sales-tax" data-testid="tab-sales-tax"><FileText className="h-3.5 w-3.5 mr-1.5" />Sales Tax</TabsTrigger>
            <TabsTrigger value="bank-feed" data-testid="tab-bank-feed"><DollarSign className="h-3.5 w-3.5 mr-1.5" />Bank Feed</TabsTrigger>
          </TabsList>
          <TabsContent value="mileage">
            <MileageTab />
          </TabsContent>
          <TabsContent value="expenses">
            <ExpensesTab />
          </TabsContent>
          <TabsContent value="sales-tax">
            <SalesTaxTab invoices={invoices} />
          </TabsContent>
          <TabsContent value="bank-feed">
            <BankFeedTab invoices={invoices} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

// ─── Business Setup Checklist ────────────────────────────────────────────────

const BUSINESS_CHECKLIST: { id: string; title: string; desc: string; link?: string }[] = [
  {
    id: "biz-cert",
    title: "File 'John Willis Piano' DBA with Somerville City Clerk",
    desc: "Must be notarized. Renews every 4 years. ~$40 fee.",
    link: "https://www.somervillema.gov/departments/programs/doing-business-somerville",
  },
  {
    id: "ein",
    title: "Get a free EIN from the IRS",
    desc: "Instant online. Replaces your SSN on W-9s and business bank account applications.",
    link: "https://www.irs.gov/businesses/small-businesses-self-employed/apply-for-an-employer-identification-number-ein-online",
  },
  {
    id: "biz-bank",
    title: "Open a dedicated Business Checking Account",
    desc: "Keeps personal and business money separate — essential for clean tax filing.",
  },
  {
    id: "withholding",
    title: "Set up auto-withholding (30%) for estimated taxes",
    desc: "Transfer 30% of every payment you receive into a separate savings account. The Tax Auto-Pilot widget above tracks your target.",
  },
  {
    id: "masstaxconnect",
    title: "Register with MassTaxConnect (for parts/supplies sales tax)",
    desc: "Only required if you sell piano parts. Labor is generally non-taxable in MA. Free to register.",
    link: "https://mtc.dor.state.ma.us/",
  },
  {
    id: "google-biz",
    title: "Create Google Business Profile",
    desc: "Shows up in local searches and on Google Maps. Free — takes 15 minutes.",
    link: "https://business.google.com/",
  },
  {
    id: "sep-ira",
    title: "Establish SEP-IRA or Solo 401(k)",
    desc: "Contribute up to 25% of net self-employment income pre-tax. One of the biggest deductions available to a solo operator.",
    link: "https://www.irs.gov/retirement-plans/sep-plan-faqs",
  },
];

const CHECKLIST_STORAGE_KEY = "jwp-biz-checklist-v2";

function BusinessSetupChecklist() {
  const [open, setOpen] = useState(true);
  const [checked, setChecked] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem(CHECKLIST_STORAGE_KEY) ?? "{}") as Record<string, boolean>;
    } catch {
      return {};
    }
  });

  function toggle(id: string) {
    const next = { ...checked, [id]: !checked[id] };
    setChecked(next);
    try { localStorage.setItem(CHECKLIST_STORAGE_KEY, JSON.stringify(next)); } catch {}
  }

  const total = BUSINESS_CHECKLIST.length;
  const done = BUSINESS_CHECKLIST.filter(i => checked[i.id]).length;
  const allDone = done === total;

  // When all done → shrink to an unobtrusive badge
  if (allDone) {
    return (
      <div className="flex items-center gap-2 px-1">
        <Badge variant="outline" className="text-xs text-green-600 dark:text-green-400 border-green-300 dark:border-green-700 font-normal gap-1.5 py-1 px-2.5">
          <CheckCircle2 className="h-3 w-3" /> Setup Complete
        </Badge>
        <button
          type="button"
          onClick={() => {
            const last = BUSINESS_CHECKLIST[BUSINESS_CHECKLIST.length - 1];
            toggle(last.id); // uncheck last item to reopen
          }}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Edit
        </button>
      </div>
    );
  }

  return (
    <Card>
      <CardHeader
        className="pb-3 cursor-pointer select-none"
        onClick={() => setOpen(o => !o)}
      >
        <CardTitle className="text-base font-semibold flex items-center justify-between gap-2">
          <span className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4" /> Business Setup
          </span>
          <span className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground font-normal">{done}/{total}</span>
            <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-green-500 rounded-full transition-all duration-300"
                style={{ width: `${(done / total) * 100}%` }}
              />
            </div>
            <ChevronDown
              className={`h-4 w-4 text-muted-foreground transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            />
          </span>
        </CardTitle>
      </CardHeader>

      {open && (
        <CardContent className="space-y-2 pt-0">
          {BUSINESS_CHECKLIST.map(item => (
            <div
              key={item.id}
              className={`flex items-start gap-3 rounded-lg border px-3 py-3 cursor-pointer transition-all duration-150 ${
                checked[item.id]
                  ? "bg-muted/30 opacity-50"
                  : "hover:bg-muted/20 hover:border-border/80"
              }`}
              onClick={() => toggle(item.id)}
            >
              <CheckCircle2
                className={`h-4 w-4 mt-0.5 flex-shrink-0 transition-colors duration-150 ${
                  checked[item.id] ? "text-green-500" : "text-muted-foreground/25"
                }`}
              />
              <div className="flex-1 min-w-0">
                <p className={`text-sm font-medium leading-snug ${
                  checked[item.id] ? "line-through text-muted-foreground" : ""
                }`}>
                  {item.title}
                </p>
                {!checked[item.id] && (
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{item.desc}</p>
                )}
                {item.link && !checked[item.id] && (
                  <a
                    href={item.link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary mt-1 hover:underline"
                    onClick={e => e.stopPropagation()}
                  >
                    <ExternalLink className="h-3 w-3" /> Open
                  </a>
                )}
              </div>
            </div>
          ))}
        </CardContent>
      )}
    </Card>
  );
}

export default function FinancesPage() {
  const { data: invoices, isLoading: invoicesLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
          <TrendingUp className="h-5 w-5" /> Finances
        </h1>
        <p className="text-muted-foreground text-sm mt-1">
          Income summary, tax estimates, mileage, and expenses
        </p>
      </div>

      <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
        <IncomePanel invoices={invoices} loading={invoicesLoading} />
        <TaxPanel invoices={invoices} loading={invoicesLoading} />
      </div>

      <DeductiblesPanel invoices={invoices} />
      <BusinessSetupChecklist />
    </div>
  );
}
