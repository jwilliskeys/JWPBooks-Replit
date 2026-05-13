import { useState, useMemo } from "react";
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
import { useToast } from "@/hooks/use-toast";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  DollarSign, TrendingUp, Car, Receipt, Plus, Trash2, Printer, Calculator,
  CheckCircle2, Route,
} from "lucide-react";
import type { Invoice, MileageLog, BusinessExpense, Appointment, Customer } from "@shared/schema";

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const IRS_RATE = 0.70;
const SE_TAX_RATE = 0.153;
const EXPENSE_CATEGORIES = ["Equipment", "Vehicle", "Marketing", "Office", "Software", "Meals", "Other"];
const HOME_ADDRESS = "868 S 700 E, Centerville, UT 84014";

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

function TaxPanel({ invoices, loading }: { invoices: Invoice[] | undefined; loading: boolean }) {
  const [incomeTaxRate, setIncomeTaxRate] = useState(22);
  const currentYear = new Date().getFullYear();

  const quarterlyData = useMemo(() => {
    const quarters: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
    invoices?.forEach((inv) => {
      if (inv.status !== "paid") return;
      const date = parseDate(inv.invoiceDate);
      if (!date || date.getFullYear() !== currentYear) return;
      const q = getQuarter(date);
      quarters[q] += parseDollar(inv.paidAmount || inv.total);
    });
    return quarters;
  }, [invoices, currentYear]);

  const totalRate = SE_TAX_RATE + incomeTaxRate / 100;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Calculator className="h-4 w-4" /> Quarterly Tax Estimates
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-center gap-3 flex-wrap">
          <Label className="text-xs text-muted-foreground whitespace-nowrap">Income tax bracket %</Label>
          <Input
            type="number"
            min={0}
            max={50}
            value={incomeTaxRate}
            onChange={e => setIncomeTaxRate(Number(e.target.value))}
            className="w-20 h-7 text-sm"
            data-testid="input-income-tax-rate"
          />
          <span className="text-xs text-muted-foreground">+ 15.3% SE = {(totalRate * 100).toFixed(1)}% total</span>
        </div>
        <div className="space-y-2">
          {([1, 2, 3, 4] as const).map(q => {
            const income = quarterlyData[q];
            const setAside = income * totalRate;
            return (
              <div key={q} className="flex items-center justify-between rounded-md bg-muted/40 px-3 py-2">
                <div>
                  <span className="text-sm font-medium">Q{q} {currentYear}</span>
                  <span className="text-xs text-muted-foreground ml-2">Due {QUARTER_DUE_DATES[q]}</span>
                </div>
                <div className="text-right">
                  {loading ? <Skeleton className="h-4 w-24" /> : (
                    <>
                      <p className="text-xs text-muted-foreground">Income: {fmt(income)}</p>
                      <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
                        Set aside: {fmt(setAside)}
                      </p>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">
          Estimates only — consult a tax professional. SE tax = 15.3%; adjust income bracket above.
        </p>
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
  const addresses = useMemo(() => {
    const apptAddresses = dayAppts.map(a => buildCustomerAddress(customerMap.get(a.customerId)));
    return [HOME_ADDRESS, ...apptAddresses, HOME_ADDRESS];
  }, [dayAppts, customerMap]);

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

  const cities = [...new Set(dayAppts.map(a => customerMap.get(a.customerId)?.city).filter(Boolean))].join(", ");
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
    const now = new Date();
    const past = new Date(now); past.setDate(past.getDate() - 60);
    const future = new Date(now); future.setDate(future.getDate() + 30);

    const byDate = new Map<string, Appointment[]>();
    appointments.forEach(a => {
      const d = parseDate(a.date);
      if (!d || d < past || d > future) return;
      if (!byDate.has(a.date)) byDate.set(a.date, []);
      byDate.get(a.date)!.push(a);
    });

    return Array.from(byDate.entries())
      .sort((a, b) => dateToSortKey(b[0]) - dateToSortKey(a[0]));
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

      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Log History</p>
          <div className="flex-1 border-t" />
        </div>
        {logsLoading ? (
          <div className="space-y-2">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}</div>
        ) : logs && logs.length > 0 ? (
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40">
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Date</th>
                  <th className="text-left px-3 py-2 text-xs font-medium text-muted-foreground">Purpose</th>
                  <th className="text-right px-3 py-2 text-xs font-medium text-muted-foreground">Miles</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {[...logs].sort((a, b) => dateToSortKey(b.date) - dateToSortKey(a.date)).map(log => (
                  <tr key={log.id} className="border-b last:border-0 hover:bg-muted/20" data-testid={`mileage-row-${log.id}`}>
                    <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{log.date}</td>
                    <td className="px-3 py-2 text-xs truncate max-w-[180px]">{log.description || "—"}</td>
                    <td className="px-3 py-2 text-xs text-right font-medium">{parseFloat(log.miles).toLocaleString()}</td>
                    <td className="px-2 py-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                        onClick={() => deleteMutation.mutate(log.id)}
                        data-testid={`button-delete-mileage-${log.id}`}
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
          <p className="text-sm text-muted-foreground py-4 text-center">No mileage entries yet</p>
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
  const [form, setForm] = useState({ date: todayStr(), description: "", category: "Equipment", amount: "" });

  const { data: expenses, isLoading } = useQuery<BusinessExpense[]>({ queryKey: ["/api/business-expenses"] });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => apiRequest("POST", "/api/business-expenses", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/business-expenses"] });
      setOpen(false);
      setForm({ date: todayStr(), description: "", category: "Equipment", amount: "" });
      toast({ title: "Expense saved" });
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

    const rows = EXPENSE_CATEGORIES
      .filter(cat => byCategory[cat])
      .map(cat => {
        const items = forYear.filter(e => e.category === cat);
        const catTotal = items.reduce((s, e) => s + parseDollar(e.amount), 0);
        const itemRows = items.map(e =>
          `<tr>
            <td style="padding:4px 8px;color:#555">${e.date}</td>
            <td style="padding:4px 8px">${e.description}</td>
            <td style="padding:4px 8px;text-align:right">${fmt(parseDollar(e.amount))}</td>
          </tr>`
        ).join("");
        return `
          <tr><td colspan="3" style="background:#f5f5f5;font-weight:600;padding:6px 8px;border-top:2px solid #ddd">${cat}</td></tr>
          ${itemRows}
          <tr>
            <td colspan="2" style="padding:4px 8px;text-align:right;font-style:italic;color:#555">Subtotal</td>
            <td style="padding:4px 8px;text-align:right;font-weight:600">${fmt(catTotal)}</td>
          </tr>`;
      }).join("");

    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <title>Expense Report ${yearFilter}</title>
  <style>
    body { font-family: Arial, sans-serif; font-size: 13px; margin: 40px; color: #222; }
    h1 { font-size: 18px; margin-bottom: 4px; }
    .meta { color: #666; font-size: 12px; margin-bottom: 24px; }
    table { width: 100%; border-collapse: collapse; }
    th { text-align: left; padding: 6px 8px; border-bottom: 2px solid #333; font-size: 12px; }
    th:last-child { text-align: right; }
    .total-row td { border-top: 2px solid #333; font-size: 14px; font-weight: 700; padding: 8px; }
    .total-row td:last-child { text-align: right; }
    @media print { button { display: none; } }
  </style>
</head>
<body>
  <h1>Business Expense Report — ${yearFilter}</h1>
  <p class="meta">John Willis Piano · Generated ${new Date().toLocaleDateString()}</p>
  <table>
    <thead>
      <tr>
        <th>Date</th>
        <th>Description</th>
        <th style="text-align:right">Amount</th>
      </tr>
    </thead>
    <tbody>
      ${rows}
      <tr class="total-row">
        <td colspan="2">Total ${yearFilter} Expenses</td>
        <td>${fmt(ytdTotal)}</td>
      </tr>
    </tbody>
  </table>
  <br/>
  <button onclick="window.print()" style="padding:8px 20px;font-size:13px;cursor:pointer">Print / Save as PDF</button>
</body>
</html>`);
    win.document.close();
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
              YTD: <span className="font-semibold text-foreground" data-testid="finances-ytd-expenses">{fmt(ytdTotal)}</span>
            </span>
            <span className="text-xs text-muted-foreground">
              Deductible: <span className="font-semibold text-green-600 dark:text-green-400">{fmt(ytdTotal)}</span>
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={handlePrintReport} data-testid="button-print-report">
            <Printer className="h-4 w-4 mr-1" /> Download Report
          </Button>
          <Button size="sm" onClick={() => setOpen(true)} data-testid="button-add-expense">
            <Plus className="h-4 w-4 mr-1" /> Add Expense
          </Button>
        </div>
      </div>

      {usedCategories.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {usedCategories.map(cat => (
            <button
              key={cat}
              onClick={() => setCategoryFilter(f => f === cat ? "All" : cat)}
              data-testid={`badge-category-${cat.toLowerCase()}`}
            >
              <Badge
                variant={categoryFilter === cat ? "default" : "secondary"}
                className="text-xs cursor-pointer"
              >
                {cat}: {fmt(byCategory[cat])}
              </Badge>
            </button>
          ))}
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
              </tr>
            </thead>
            <tbody>
              {filtered.map(exp => (
                <tr key={exp.id} className="border-b last:border-0 hover:bg-muted/20" data-testid={`expense-row-${exp.id}`}>
                  <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">{exp.date}</td>
                  <td className="px-3 py-2 text-xs truncate max-w-[140px]">{exp.description}</td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="text-[10px]">{exp.category}</Badge>
                  </td>
                  <td className="px-3 py-2 text-xs text-right font-medium">{fmt(parseDollar(exp.amount))}</td>
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

      <Dialog open={open} onOpenChange={setOpen}>
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
                <SelectTrigger data-testid="select-expense-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button
              onClick={() => createMutation.mutate(form)}
              disabled={!form.date || !form.description || !form.amount || createMutation.isPending}
              data-testid="button-save-expense"
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DeductiblesPanel() {
  const [tab, setTab] = useState<"mileage" | "expenses">("mileage");

  return (
    <Card>
      <CardHeader className="pb-0">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Deductibles
          </CardTitle>
          <div className="flex rounded-md border overflow-hidden">
            <button
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors ${tab === "mileage" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50"}`}
              onClick={() => setTab("mileage")}
              data-testid="tab-mileage"
            >
              <Car className="h-3.5 w-3.5" /> Mileage
            </button>
            <button
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium transition-colors border-l ${tab === "expenses" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted/50"}`}
              onClick={() => setTab("expenses")}
              data-testid="tab-expenses"
            >
              <Receipt className="h-3.5 w-3.5" /> Expenses
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-4">
        {tab === "mileage" ? <MileageTab /> : <ExpensesTab />}
      </CardContent>
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

      <DeductiblesPanel />
    </div>
  );
}
