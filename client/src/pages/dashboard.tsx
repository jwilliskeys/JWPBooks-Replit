import { useMemo, useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Link } from "wouter";
import {
  ArrowRight,
  MapPin,
  Calendar,
  DollarSign,
  Car,
  Clock,
  Home,
  Inbox,
  CheckCircle2,
  MessageSquare,
  Trash2,
  ChevronDown,
  ChevronUp,
  AlertCircle,
  Mail,
  Plane,
  Activity,
} from "lucide-react";
import { apiRequest } from "@/lib/queryClient";
import { formatPhone } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { Customer, Appointment, Invoice, BookingRequest, Trip, TripAppointment } from "@shared/schema";
import {
  getServiceArea,
  parseTimeToMinutes,
  minutesToTimeStr,
  parseDurationToMinutes,
} from "@/lib/scheduling";

// Primary home base (Somerville). Only swaps to the Centerville, UT base
// below during SLC trip days — see isSLCDay in TodayItinerary.
const HOME_ADDRESS_BOSTON = "14 Murdock St Apt #3-4, Somerville, MA";
const HOME_ADDRESS_SLC = "868 S 700 E, Centerville, UT 84014";

function buildAddress(cust: Customer | undefined, homeFallback: string = HOME_ADDRESS_BOSTON): string {
  if (!cust) return homeFallback;
  const parts = [cust.address, cust.city, cust.state, cust.zipCode].filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : homeFallback;
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

function parseDollar(value: string | null | undefined): number {
  if (!value) return 0;
  const num = parseFloat(value.replace(/[$,]/g, ""));
  return isNaN(num) ? 0 : num;
}

function getMonthsSince(dateStr: string | null | undefined): number | null {
  const d = parseDate(dateStr);
  if (!d) return null;
  const now = new Date();
  return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
}

/** Classify a customer into a revenue bucket. */
function classifyCustomer(cust: Customer): "boston" | "slc" | "other" {
  const stateUp = (cust.state ?? "").toUpperCase();
  // NE states → Boston
  if (["MA", "RI", "CT", "NH", "ME", "VT", "VA"].includes(stateUp)) return "boston";
  // Utah → SLC
  if (stateUp === "UT") return "slc";
  // Fall back on city cluster
  const area = getServiceArea(cust.city ?? "", cust.state ?? "");
  if (area === "Boston") return "boston";
  if (["Davis County", "Salt Lake City", "South Jordan"].includes(area)) return "slc";
  return "other";
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

function getCurrentWeekBounds(): { start: Date; end: Date } {
  const now = new Date();
  const day = now.getDay(); // 0=Sun
  const diffToMon = day === 0 ? -6 : 1 - day;
  const mon = new Date(now);
  mon.setDate(now.getDate() + diffToMon);
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(mon);
  sun.setDate(mon.getDate() + 6);
  sun.setHours(23, 59, 59, 999);
  return { start: mon, end: sun };
}

// ── Action Center ──────────────────────────────────────────────────────────────

function ActionCenter({
  invoices,
  customers,
}: {
  invoices: Invoice[] | undefined;
  customers: Customer[] | undefined;
}) {
  const unpaidInvoices = useMemo(
    () =>
      (invoices ?? []).filter(
        (inv) => inv.status === "sent" || inv.status === "draft"
      ),
    [invoices]
  );

  const bostonDue = useMemo(() => {
    return (customers ?? []).filter((c) => {
      if (classifyCustomer(c) !== "boston") return false;
      const months = getMonthsSince(c.lastTuned);
      return months !== null && months >= 6;
    });
  }, [customers]);

  const slcDue = useMemo(() => {
    return (customers ?? []).filter((c) => {
      if (classifyCustomer(c) !== "slc") return false;
      const months = getMonthsSince(c.lastTuned);
      return months !== null && months >= 6;
    });
  }, [customers]);

  const hasItems = unpaidInvoices.length > 0 || bostonDue.length > 0 || slcDue.length > 0;
  if (!hasItems) return null;

  const unpaidTotal = unpaidInvoices.reduce(
    (sum, inv) => sum + parseDollar(inv.total),
    0
  );

  const draftSubject = encodeURIComponent("Time for your piano's checkup!");
  const draftBody = encodeURIComponent(
    `Hi,\n\nI wanted to reach out — it's been a while since your piano was last tuned and it's likely due for service.\n\nI'd love to schedule a time that works for you. Feel free to reply here or call/text me directly.\n\nBest,\nJohn Willis\nJohn Willis Piano`
  );

  return (
    <Card className="border-l-4 border-l-blue-500 bg-blue-50/40 dark:bg-blue-950/20 dark:border-blue-700">
      <CardHeader className="pb-2 pt-4 px-4">
        <CardTitle className="text-sm font-semibold flex items-center gap-2 text-blue-800 dark:text-blue-300">
          <AlertCircle className="h-4 w-4" />
          Action Center
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-2.5">
        {unpaidInvoices.length > 0 && (
          <div className="flex items-center justify-between gap-3 bg-white dark:bg-slate-900 rounded-lg border px-3 py-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 dark:bg-amber-900/40">
                <DollarSign className="h-3.5 w-3.5 text-amber-600 dark:text-amber-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {unpaidInvoices.length} unpaid{" "}
                  {unpaidInvoices.length === 1 ? "invoice" : "invoices"} pending
                </p>
                <p className="text-xs text-muted-foreground">
                  ${unpaidTotal.toFixed(0)} outstanding
                </p>
              </div>
            </div>
            <Link href="/invoices">
              <Button size="sm" variant="outline" className="h-8 text-xs shrink-0">
                Review <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </div>
        )}

        {bostonDue.length > 0 && (
          <div className="flex items-center justify-between gap-3 bg-white dark:bg-slate-900 rounded-lg border px-3 py-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/40">
                <MapPin className="h-3.5 w-3.5 text-green-600 dark:text-green-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {bostonDue.length} Boston{" "}
                  {bostonDue.length === 1 ? "client" : "clients"} due for
                  6-month checkup
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {bostonDue
                    .slice(0, 2)
                    .map((c) => `${c.firstName} ${c.lastName}`)
                    .join(", ")}
                  {bostonDue.length > 2 ? ` +${bostonDue.length - 2} more` : ""}
                </p>
              </div>
            </div>
            <a
              href={`mailto:?subject=${draftSubject}&body=${draftBody}`}
              target="_blank"
              rel="noreferrer"
            >
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs shrink-0 gap-1"
              >
                <Mail className="h-3 w-3" />
                Draft Email
              </Button>
            </a>
          </div>
        )}

        {slcDue.length > 0 && (
          <div className="flex items-center justify-between gap-3 bg-white dark:bg-slate-900 rounded-lg border px-3 py-2.5">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-purple-100 dark:bg-purple-900/40">
                <MapPin className="h-3.5 w-3.5 text-purple-600 dark:text-purple-400" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {slcDue.length} SLC{" "}
                  {slcDue.length === 1 ? "client" : "clients"} due for
                  6-month checkup
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {slcDue
                    .slice(0, 2)
                    .map((c) => `${c.firstName} ${c.lastName}`)
                    .join(", ")}
                  {slcDue.length > 2 ? ` +${slcDue.length - 2} more` : ""}
                </p>
              </div>
            </div>
            <a
              href={`mailto:?subject=${draftSubject}&body=${draftBody}`}
              target="_blank"
              rel="noreferrer"
            >
              <Button
                size="sm"
                variant="outline"
                className="h-8 text-xs shrink-0 gap-1"
              >
                <Mail className="h-3 w-3" />
                Draft Email
              </Button>
            </a>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Today's Itinerary ─────────────────────────────────────────────────────────

function TodayItinerary({
  appointments,
  customers,
}: {
  appointments: Appointment[];
  customers: Customer[] | undefined;
}) {
  const todayStr = useMemo(() => {
    const now = new Date();
    return `${now.getMonth() + 1}/${now.getDate()}/${String(now.getFullYear()).slice(-2)}`;
  }, []);

  const todayAppointments = useMemo(() => {
    return appointments
      .filter((a) => a.date === todayStr)
      .sort((a, b) => {
        const ma = parseTimeToMinutes(a.time || "");
        const mb = parseTimeToMinutes(b.time || "");
        if (ma < 0 && mb < 0) return 0;
        if (ma < 0) return 1;
        if (mb < 0) return -1;
        return ma - mb;
      });
  }, [appointments, todayStr]);

  const addresses = useMemo(() => {
    if (todayAppointments.length === 0) return [];
    const cust = todayAppointments.map((a) =>
      customers?.find((c) => c.id === a.customerId)
    );
    // Today counts as an SLC trip day (home base = Centerville, UT) only if
    // every appointment on the books today is in the SLC area. Otherwise
    // default to the Somerville home base.
    const isSLCDay = cust.length > 0 && cust.every((c) => c && classifyCustomer(c) === "slc");
    const home = isSLCDay ? HOME_ADDRESS_SLC : HOME_ADDRESS_BOSTON;
    return [home, ...cust.map((c) => buildAddress(c, home)), home];
  }, [todayAppointments, customers]);

  const { data: drivingData } = useQuery<{
    durations: number[] | null;
    distances: number[] | null;
    error?: string;
  }>({
    queryKey: ["/api/driving-times", addresses.join("|")],
    queryFn: async () => {
      const res = await apiRequest("POST", "/api/driving-times", { addresses });
      return res.json();
    },
    enabled: addresses.length >= 2,
    staleTime: 15 * 60 * 1000,
  });

  const drivingTimes = drivingData?.durations ?? null;
  const drivingDistances = drivingData?.distances ?? null;

  const leaveByTime = useMemo(() => {
    if (
      !todayAppointments.length ||
      !drivingTimes ||
      drivingTimes[0] == null ||
      drivingTimes[0] < 0
    )
      return null;
    const firstMins = parseTimeToMinutes(todayAppointments[0].time || "");
    if (firstMins < 0) return null;
    const leaveMins = firstMins - drivingTimes[0];
    return leaveMins > 0 ? minutesToTimeStr(leaveMins) : null;
  }, [todayAppointments, drivingTimes]);

  // No empty state — Action Center handles the "nothing today" messaging
  if (todayAppointments.length === 0) return null;

  return (
    <Card data-testid="today-itinerary-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Calendar className="h-4 w-4" /> Today's Itinerary
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-0.5">
        <div className="flex items-center gap-1.5 px-1 py-1.5">
          <Home className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="text-xs text-muted-foreground">Start of day</span>
            {leaveByTime && (
              <span className="ml-2 text-xs text-blue-600 dark:text-blue-400 font-semibold">
                Leave by {leaveByTime}
              </span>
            )}
          </div>
        </div>

        {todayAppointments.map((appt, i) => {
          const cust = customers?.find((c) => c.id === appt.customerId);
          const href = cust ? `/customers/${cust.id}` : "/appointments";
          const driveMinutes = drivingTimes ? drivingTimes[i] : null;
          const driveMiles = drivingDistances ? drivingDistances[i] : null;
          const durationMins = parseDurationToMinutes(appt.duration || "2 hours");
          const startMins = parseTimeToMinutes(appt.time || "");
          const endTime = startMins >= 0 ? minutesToTimeStr(startMins + durationMins) : null;

          return (
            <div key={appt.id}>
              {driveMinutes != null && driveMinutes >= 0 && (
                <div className="flex items-center gap-1.5 px-1 py-0.5 text-[11px] text-muted-foreground">
                  <Car className="h-3 w-3 shrink-0" />
                  <span>
                    Driving ({driveMinutes}m
                    {driveMiles != null && driveMiles >= 0
                      ? ` · ${driveMiles.toFixed(1)} mi`
                      : ""}
                    )
                  </span>
                  <div className="flex-1 border-t border-dashed border-muted-foreground/25" />
                </div>
              )}
              <Link href={href}>
                <div
                  className="flex items-start justify-between gap-3 p-2 rounded-md hover:bg-accent cursor-pointer"
                  data-testid={`today-appt-${appt.id}`}
                >
                  <div className="flex flex-col gap-0.5 min-w-0">
                    <span className="text-sm font-medium truncate">
                      {cust
                        ? `${cust.firstName} ${cust.lastName}`
                        : "Unknown Client"}
                    </span>
                    {cust?.city && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3 shrink-0" />
                        {cust.city}
                      </span>
                    )}
                    {appt.servicesRequested && (
                      <span className="text-xs text-muted-foreground truncate">
                        {appt.servicesRequested}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1 shrink-0">
                    {appt.time && (
                      <span className="text-xs text-muted-foreground flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {appt.time}
                        {endTime ? ` – ${endTime}` : ""}
                      </span>
                    )}
                    <Badge
                      variant={
                        appt.status === "completed" ? "default" : "outline"
                      }
                      className="text-[10px] capitalize"
                      data-testid={`today-appt-status-${appt.id}`}
                    >
                      {appt.status}
                    </Badge>
                  </div>
                </div>
              </Link>
            </div>
          );
        })}

        {drivingTimes &&
          drivingTimes[todayAppointments.length] != null &&
          drivingTimes[todayAppointments.length]! >= 0 && (
            <div className="flex items-center gap-1.5 px-1 py-0.5 text-[11px] text-muted-foreground">
              <Car className="h-3 w-3 shrink-0" />
              <span>
                Driving ({drivingTimes[todayAppointments.length]}m
                {drivingDistances &&
                drivingDistances[todayAppointments.length] != null &&
                drivingDistances[todayAppointments.length]! >= 0
                  ? ` · ${drivingDistances[todayAppointments.length]!.toFixed(1)} mi`
                  : ""}
                ) home
              </span>
              <div className="flex-1 border-t border-dashed border-muted-foreground/25" />
            </div>
          )}
        {drivingTimes && (
          <div className="flex items-center gap-1.5 px-1 py-1.5">
            <Home className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground">Return home</span>
            {drivingDistances && drivingDistances.length > 0 && (
              <span className="ml-auto text-[11px] text-muted-foreground">
                {drivingDistances
                  .filter((d) => d != null && d >= 0)
                  .reduce((sum, d) => sum + d, 0)
                  .toFixed(1)}{" "}
                mi total
              </span>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Revenue Chart ─────────────────────────────────────────────────────────────

type RevenueFilter = "all" | "boston" | "slc" | "falcetti" | "other";

// Brand color for Falcetti Pianos income — matches the rose accent already
// used for the "BU · Falcetti Pianos" work block on the calendar page.
const FALCETTI_COLOR = "hsl(142 71% 45%)";

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

function CustomTooltip({ active, payload, label, filter, monthData }: CustomTooltipProps) {
  if (!active || !label) return null;
  const d = monthData.find((m) => m.month === label);
  if (!d) return null;

  const rows: { label: string; total: number; paid: number; color: string }[] =
    filter === "all"
      ? [
          { label: "Boston", total: d.bostonTotal, paid: d.bostonPaid, color: "hsl(221 83% 53%)" },
          { label: "SLC", total: d.slcTotal, paid: d.slcPaid, color: "hsl(38 92% 50%)" },
          { label: "Falcetti", total: d.falcettiTotal, paid: d.falcettiPaid, color: FALCETTI_COLOR },
          { label: "Other", total: d.otherTotal, paid: d.otherPaid, color: "hsl(var(--muted-foreground))" },
        ]
      : filter === "boston"
      ? [{ label: "Boston", total: d.bostonTotal, paid: d.bostonPaid, color: "hsl(221 83% 53%)" }]
      : filter === "slc"
      ? [{ label: "SLC", total: d.slcTotal, paid: d.slcPaid, color: "hsl(38 92% 50%)" }]
      : filter === "falcetti"
      ? [{ label: "Falcetti", total: d.falcettiTotal, paid: d.falcettiPaid, color: FALCETTI_COLOR }]
      : [{ label: "Other", total: d.otherTotal, paid: d.otherPaid, color: "hsl(var(--muted-foreground))" }];

  return (
    <div className="bg-popover border border-border rounded-md shadow-md px-3 py-2 text-xs space-y-1.5">
      <p className="font-semibold">{label}</p>
      {rows.map((r) => (
        <div key={r.label}>
          <p className="font-medium" style={{ color: r.color }}>{r.label}</p>
          <p className="text-muted-foreground">
            Billed:{" "}
            <span className="text-foreground font-medium">${r.total.toFixed(0)}</span>
          </p>
          <p className="text-muted-foreground">
            Paid:{" "}
            <span className="text-foreground font-medium">${r.paid.toFixed(0)}</span>
          </p>
        </div>
      ))}
    </div>
  );
}

const FILTER_PILLS: { key: RevenueFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "boston", label: "Boston" },
  { key: "slc", label: "SLC" },
  { key: "falcetti", label: "Falcetti" },
  { key: "other", label: "Other" },
];

function MonthlyIncomeChart({
  invoices,
  customers,
  loading,
}: {
  invoices: Invoice[] | undefined;
  customers: Customer[] | undefined;
  loading: boolean;
}) {
  const [filter, setFilter] = useState<RevenueFilter>("all");

  const customerMap = useMemo(() => {
    const map = new Map<number, Customer>();
    customers?.forEach((c) => map.set(c.id, c));
    return map;
  }, [customers]);

  const monthlyData: MonthlyIncomeData[] = useMemo(() => {
    const now = new Date();
    const months: MonthlyIncomeData[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      months.push({
        monthKey: getMonthKey(d.getFullYear(), d.getMonth() + 1),
        month: `${MONTH_NAMES[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`,
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

    invoices?.forEach((inv) => {
      const date = parseDate(inv.invoiceDate);
      if (!date) return;
      const key = getMonthKey(date.getFullYear(), date.getMonth() + 1);
      const entry = months.find((m) => m.monthKey === key);
      if (!entry) return;
      const total = parseDollar(inv.total);
      const paid = inv.status === "paid" ? parseDollar(inv.paidAmount ?? inv.total) : 0;
      // Falcetti paychecks are their own bucket regardless of customer
      // address — it's payroll income, not regional client billing.
      if (inv.incomeSource === "falcetti") {
        entry.falcettiTotal += total;
        entry.falcettiPaid += paid;
        return;
      }
      const cust = inv.customerId != null ? customerMap.get(inv.customerId) : undefined;
      const bucket = cust ? classifyCustomer(cust) : "other";
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

  // Build chart-ready data based on selected filter
  const chartData = useMemo(() => {
    return monthlyData.map((d) => {
      if (filter === "all") {
        return {
          month: d.month,
          Boston: d.bostonPaid,
          SLC: d.slcPaid,
          Falcetti: d.falcettiPaid,
          Other: d.otherPaid,
          bostonTotal: d.bostonTotal,
          slcTotal: d.slcTotal,
          falcettiTotal: d.falcettiTotal,
          otherTotal: d.otherTotal,
        };
      }
      if (filter === "boston")
        return { month: d.month, Paid: d.bostonPaid, Total: d.bostonTotal };
      if (filter === "slc")
        return { month: d.month, Paid: d.slcPaid, Total: d.slcTotal };
      if (filter === "falcetti")
        return { month: d.month, Paid: d.falcettiPaid, Total: d.falcettiTotal };
      return { month: d.month, Paid: d.otherPaid, Total: d.otherTotal };
    });
  }, [monthlyData, filter]);

  return (
    <Card data-testid="monthly-income-card" className="flex flex-col">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2 flex-wrap">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <DollarSign className="h-4 w-4" /> Revenue
          </CardTitle>
          {/* Filter pills */}
          <div className="flex items-center gap-1 flex-wrap">
            {FILTER_PILLS.map((p) => (
              <button
                key={p.key}
                onClick={() => setFilter(p.key)}
                className={`px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors ${
                  filter === p.key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-muted/80"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex-1">
        {loading ? (
          <Skeleton className="h-40 w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={155}>
            <BarChart
              data={chartData}
              margin={{ top: 4, right: 4, left: -20, bottom: 0 }}
            >
              <XAxis
                dataKey="month"
                tick={{ fontSize: 9 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 9 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip
                content={
                  <CustomTooltip filter={filter} monthData={monthlyData} />
                }
                cursor={{ fill: "hsl(var(--muted))" }}
              />
              {filter === "all" ? (
                <>
                  <Bar
                    dataKey="Boston"
                    stackId="paid"
                    fill="hsl(221 83% 53%)"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="SLC"
                    stackId="paid"
                    fill="hsl(38 92% 50%)"
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="Falcetti"
                    stackId="paid"
                    fill={FALCETTI_COLOR}
                    radius={[0, 0, 0, 0]}
                  />
                  <Bar
                    dataKey="Other"
                    stackId="paid"
                    fill="hsl(var(--muted-foreground) / 0.4)"
                    radius={[3, 3, 0, 0]}
                  />
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
        <div className="flex items-center gap-3 mt-2 justify-center flex-wrap">
          {filter === "all" ? (
            <>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ background: "hsl(221 83% 53%)" }}
                />
                Boston
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ background: "hsl(38 92% 50%)" }}
                />
                SLC
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span
                  className="inline-block h-2.5 w-2.5 rounded-sm"
                  style={{ background: FALCETTI_COLOR }}
                />
                Falcetti
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-muted-foreground/40" />
                Other
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary/25" />
                Total Billed
              </div>
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary" />
                Paid
              </div>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

// ── Upcoming Trip Widget ───────────────────────────────────────────────────────

const TRIP_MAX_SLOTS = 20;

function UpcomingTripWidget() {
  const { data: trips, isLoading: tripsLoading } = useQuery<Trip[]>({
    queryKey: ["/api/trips"],
  });

  const upcomingTrip = useMemo(() => {
    if (!trips) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const candidates = trips
      .filter((t) => {
        // keep trips that haven't fully ended yet
        const end = parseDate(t.endDate);
        return end !== null && end >= today;
      })
      .sort((a, b) => {
        const da = parseDate(a.startDate);
        const db = parseDate(b.startDate);
        if (!da || !db) return 0;
        return da.getTime() - db.getTime();
      });
    return candidates[0] ?? null;
  }, [trips]);

  const { data: tripAppts, isLoading: apptsLoading } = useQuery<
    TripAppointment[]
  >({
    queryKey: [`/api/trips/${upcomingTrip?.id}/appointments`],
    enabled: !!upcomingTrip,
  });

  const bookedSlots = tripAppts?.length ?? 0;
  const remainingSlots = TRIP_MAX_SLOTS - bookedSlots;
  const pct = Math.min(100, (bookedSlots / TRIP_MAX_SLOTS) * 100);

  const formatTripDates = (trip: Trip) => {
    const start = parseDate(trip.startDate);
    const end = parseDate(trip.endDate);
    if (!start || !end) return `${trip.startDate} — ${trip.endDate}`;
    const opts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
    if (start.getFullYear() !== end.getFullYear()) {
      return `${start.toLocaleDateString("en-US", { ...opts, year: "numeric" })} — ${end.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
    }
    return `${start.toLocaleDateString("en-US", opts)} — ${end.toLocaleDateString("en-US", { ...opts, year: "numeric" })}`;
  };

  const isLoading = tripsLoading || (!!upcomingTrip && apptsLoading);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Plane className="h-4 w-4" /> Upcoming Trip
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : !upcomingTrip ? (
          <div className="flex flex-col items-center justify-center py-6 gap-2 text-center">
            <Plane className="h-8 w-8 text-muted-foreground/30" />
            <p className="text-sm text-muted-foreground">No upcoming trips planned.</p>
            <Link href="/slc-schedule">
              <Button size="sm" variant="outline" className="mt-1 text-xs">
                Plan SLC Trip
              </Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Trip name + dates */}
            <div>
              <Link href="/slc-schedule">
                <p className="text-sm font-semibold hover:underline cursor-pointer">
                  {upcomingTrip.name}
                </p>
              </Link>
              <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                <Calendar className="h-3 w-3" />
                {formatTripDates(upcomingTrip)}
              </p>
            </div>

            {/* Slots progress */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="text-muted-foreground">Slots booked</span>
                <span className="font-semibold">
                  {bookedSlots} / {TRIP_MAX_SLOTS}
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    pct >= 90
                      ? "bg-green-500"
                      : pct >= 60
                      ? "bg-amber-400"
                      : "bg-primary"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-[11px] text-muted-foreground">
                {pct >= 100
                  ? "🎉 Fully booked!"
                  : pct >= 80
                  ? `Almost full — ${remainingSlots} slot${remainingSlots !== 1 ? "s" : ""} left.`
                  : `${remainingSlots} open slot${remainingSlots !== 1 ? "s" : ""} remaining.`}
              </p>
            </div>

            {/* Action CTA */}
            {remainingSlots > 0 && (
              <div className="rounded-md bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 px-3 py-2 text-xs text-amber-800 dark:text-amber-300">
                <p className="font-medium mb-1">Suggested action</p>
                <p>
                  Email the Davis County list to fill remaining{" "}
                  {remainingSlots} slot{remainingSlots !== 1 ? "s" : ""}.
                </p>
                <Link href="/customers?area=Davis+County">
                  <Button
                    size="sm"
                    variant="outline"
                    className="mt-2 h-7 text-xs gap-1 border-amber-300"
                  >
                    <Mail className="h-3 w-3" />
                    View Davis County Clients
                  </Button>
                </Link>
              </div>
            )}

            <Link href="/slc-schedule">
              <Button
                size="sm"
                variant="ghost"
                className="w-full text-xs h-8 mt-1"
              >
                Open Trip Planner <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Bandwidth Tracker ─────────────────────────────────────────────────────────

const MAX_PRIVATE_SLOTS = 9; // 5 late-afternoon weekday slots + 4 weekend slots

function BandwidthTracker({
  appointments,
  customers,
}: {
  appointments: Appointment[];
  customers: Customer[] | undefined;
}) {
  const { privateCount, weekLabel } = useMemo(() => {
    const { start, end } = getCurrentWeekBounds();

    const weekPrivate = appointments.filter((a) => {
      if (a.status === "cancelled") return false;
      const d = parseDate(a.date);
      if (!d) return false;
      if (d < start || d > end) return false;
      const cust = customers?.find((c) => c.id === a.customerId);
      if (!cust) return false;
      return classifyCustomer(cust) === "boston";
    });

    const label = `${start.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })} – ${end.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    })}`;

    return { privateCount: weekPrivate.length, weekLabel: label };
  }, [appointments, customers]);

  const pct = Math.min(100, (privateCount / MAX_PRIVATE_SLOTS) * 100);
  const isFull = privateCount >= MAX_PRIVATE_SLOTS;
  const isHeavy = !isFull && privateCount >= 7;

  return (
    <Card
      className={
        isFull
          ? "border-red-300 dark:border-red-700"
          : isHeavy
          ? "border-orange-300 dark:border-orange-700"
          : ""
      }
    >
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-semibold flex items-center gap-2">
            <Activity className="h-4 w-4" />
            Private Bandwidth
          </CardTitle>
          <span className="text-xs text-muted-foreground">{weekLabel}</span>
        </div>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-2">
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground text-xs">
            Private slots this week
          </span>
          <span
            className={`font-semibold text-sm ${
              isFull
                ? "text-red-500"
                : isHeavy
                ? "text-orange-500"
                : "text-foreground"
            }`}
          >
            {privateCount} / {MAX_PRIVATE_SLOTS}
          </span>
        </div>
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ${
              isFull
                ? "bg-red-500"
                : isHeavy
                ? "bg-orange-400"
                : pct >= 40
                ? "bg-primary"
                : "bg-primary/60"
            }`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <p
          className={`text-xs ${
            isFull
              ? "text-red-500 font-medium"
              : isHeavy
              ? "text-orange-500"
              : "text-muted-foreground"
          }`}
        >
          {isFull
            ? "⚠ At capacity — protect your recovery time."
            : isHeavy
            ? "Heavy week — consider limiting new private bookings."
            : privateCount === 0
            ? `${MAX_PRIVATE_SLOTS} open private slots this week.`
            : `${MAX_PRIVATE_SLOTS - privateCount} open slot${
                MAX_PRIVATE_SLOTS - privateCount !== 1 ? "s" : ""
              } remaining.`}
        </p>
      </CardContent>
    </Card>
  );
}

// ── Pending Booking Requests Panel ────────────────────────────────────────────

interface ApproveModalState {
  request: BookingRequest;
  date: string;
  time: string;
  duration: string;
  notes: string;
}

/** "4:00 PM" → "16:00" for <input type="time"> prefill. */
function to24h(label: string | null | undefined): string {
  if (!label) return "";
  const m = label.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/i);
  if (!m) return "";
  let h = parseInt(m[1], 10);
  const ampm = m[3]?.toUpperCase();
  if (ampm === "PM" && h !== 12) h += 12;
  if (ampm === "AM" && h === 12) h = 0;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

function PendingBookingRequestsPanel() {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [collapsed, setCollapsed] = useState(false);
  const [approveModal, setApproveModal] = useState<ApproveModalState | null>(
    null
  );

  const { data: allRequests, isLoading } = useQuery<BookingRequest[]>({
    queryKey: ["/api/booking-requests"],
  });

  const pending = useMemo(
    () => (allRequests ?? []).filter((r) => r.status === "pending"),
    [allRequests]
  );

  const declineMutation = useMutation({
    mutationFn: async (id: number) =>
      apiRequest("DELETE", `/api/booking-requests/${id}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/booking-requests"] });
      toast({ title: "Request archived" });
    },
  });

  const approveMutation = useMutation({
    mutationFn: async ({
      id,
      date,
      time,
      duration,
      notes,
    }: {
      id: number;
      date: string;
      time: string;
      duration: string;
      notes: string;
    }) =>
      apiRequest("POST", `/api/booking-requests/${id}/approve`, {
        date,
        time,
        duration,
        notes,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["/api/booking-requests"] });
      qc.invalidateQueries({ queryKey: ["/api/appointments"] });
      qc.invalidateQueries({ queryKey: ["/api/customers"] });
      setApproveModal(null);
      toast({ title: "Approved! Client and appointment created." });
    },
    onError: (err: Error) => {
      toast({
        title: "Error approving request",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  if (isLoading) return null;
  if (pending.length === 0) return null;

  function formatDate(ts: Date | string | null | undefined): string {
    if (!ts) return "";
    return new Date(ts).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  }

  return (
    <>
      <Card className="border-amber-300 bg-amber-50 dark:bg-amber-950/20 dark:border-amber-800">
        <CardHeader className="pb-2 pt-4 px-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Inbox className="h-4 w-4 text-amber-600" />
              <CardTitle className="text-sm font-semibold text-amber-800 dark:text-amber-400">
                Pending Booking Requests
              </CardTitle>
              <Badge className="bg-amber-600 text-white text-xs px-1.5 py-0.5 rounded-full">
                {pending.length}
              </Badge>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0 text-amber-700"
              onClick={() => setCollapsed((v) => !v)}
            >
              {collapsed ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronUp className="h-4 w-4" />
              )}
            </Button>
          </div>
        </CardHeader>

        {!collapsed && (
          <CardContent className="px-4 pb-4 space-y-3">
            {pending.map((req) => (
              <div
                key={req.id}
                className="bg-white dark:bg-slate-900 rounded-xl border border-amber-200 dark:border-amber-800 p-3 space-y-2"
              >
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-sm text-slate-900 dark:text-slate-100">
                      {req.firstName} {req.lastName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {req.cityNeighborhood && (
                        <span>{req.cityNeighborhood} · </span>
                      )}
                      {req.pianoType && <span>{req.pianoType} piano · </span>}
                      {req.lastTuned && (
                        <span>Last tuned: {req.lastTuned}</span>
                      )}
                    </p>
                    {req.requestedDate && req.requestedTime && (
                      <p className="text-xs font-medium text-slate-700 dark:text-slate-300 mt-1">
                        Requested: {req.requestedDate} at {req.requestedTime}
                      </p>
                    )}
                    {req.preferredTimes && (
                      <p className="text-xs text-slate-600 dark:text-slate-400 mt-1 italic line-clamp-2">
                        "{req.preferredTimes}"
                      </p>
                    )}
                  </div>
                  <span className="text-xs text-slate-400 shrink-0">
                    {formatDate(req.createdAt)}
                  </span>
                </div>

                <div className="flex flex-wrap gap-1 text-xs">
                  {req.email && (
                    <a
                      href={`mailto:${req.email}`}
                      className="text-blue-600 hover:underline"
                    >
                      {req.email}
                    </a>
                  )}
                  {req.phone && (
                    <>
                      <span className="text-slate-300">·</span>
                      <a
                        href={`tel:${req.phone}`}
                        className="text-blue-600 hover:underline"
                      >
                        {formatPhone(req.phone)}
                      </a>
                    </>
                  )}
                </div>

                <div className="flex gap-2 pt-1 flex-wrap">
                  <Button
                    size="sm"
                    className="h-8 text-xs gap-1 bg-green-600 hover:bg-green-700"
                    onClick={() =>
                      setApproveModal({
                        request: req,
                        // Prefill with the slot the client picked on the calendar
                        date: req.requestedDate ?? "",
                        time: to24h(req.requestedTime),
                        duration: "1 hr 30 min",
                        notes: "",
                      })
                    }
                  >
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Approve &amp; Schedule
                  </Button>

                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1"
                    asChild
                  >
                    <a
                      href={
                        req.phone
                          ? `sms:${req.phone}`
                          : `mailto:${req.email}?subject=Your%20Piano%20Tuning%20Request&body=Hi%20${encodeURIComponent(req.firstName)}%2C%0A%0AThanks%20for%20reaching%20out!%20I'd%20love%20to%20schedule%20a%20time%20to%20tune%20your%20piano.%0A%0A`
                      }
                    >
                      <MessageSquare className="h-3.5 w-3.5" />
                      Contact Client
                    </a>
                  </Button>

                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-8 text-xs gap-1 text-slate-500 hover:text-red-600"
                    disabled={declineMutation.isPending}
                    onClick={() => declineMutation.mutate(req.id)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Decline
                  </Button>
                </div>
              </div>
            ))}
          </CardContent>
        )}
      </Card>

      {approveModal && (() => {
        const req = approveModal.request;
        const durMins = parseDurationToMinutes(approveModal.duration);
        const startMins = parseTimeToMinutes(approveModal.time);
        const endsAt = startMins >= 0 ? minutesToTimeStr(startMins + durMins) : "";
        const fmtDur = (mins: number) => {
          const h = Math.floor(mins / 60);
          const m = mins % 60;
          if (h === 0) return `${m} min`;
          if (m === 0) return `${h} hr`;
          return `${h} hr ${m} min`;
        };
        const bumpDuration = (delta: number) => {
          const next = Math.max(15, durMins + delta);
          setApproveModal((mo) => (mo ? { ...mo, duration: fmtDur(next) } : mo));
        };
        const initials = `${req.firstName?.[0] ?? ""}${req.lastName?.[0] ?? ""}`.toUpperCase();
        const stepBtn =
          "h-7 px-2 rounded-md bg-primary text-primary-foreground text-xs font-semibold hover:bg-primary/90";
        return (
          <Dialog open onOpenChange={() => setApproveModal(null)}>
            <DialogContent className="w-[calc(100%-2rem)] rounded-lg sm:max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Approve &amp; Schedule</DialogTitle>
              </DialogHeader>

              <div className="grid sm:grid-cols-2 gap-4 py-1">
                {/* ── Left: Date & Time ─────────────────────────────── */}
                <div className="space-y-4">
                  <div className="bg-muted/60 rounded-lg px-3 py-2 text-sm font-semibold">
                    Date &amp; Time
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="appr-date" className="text-sm">Date</Label>
                    <Input
                      id="appr-date"
                      type="date"
                      className="text-base h-11"
                      data-testid="input-approve-date"
                      value={approveModal.date}
                      onChange={(e) =>
                        setApproveModal((m) => (m ? { ...m, date: e.target.value } : m))
                      }
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="appr-time" className="text-sm">Start time</Label>
                    <Input
                      id="appr-time"
                      type="time"
                      className="text-base h-11"
                      data-testid="input-approve-time"
                      value={approveModal.time}
                      onChange={(e) =>
                        setApproveModal((m) => (m ? { ...m, time: e.target.value } : m))
                      }
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-sm">Duration</Label>
                    <div className="flex items-center gap-2">
                      <div className="flex flex-col gap-1">
                        <button type="button" className={stepBtn} onClick={() => bumpDuration(60)} data-testid="button-duration-plus-hour">+1h</button>
                        <button type="button" className={stepBtn} onClick={() => bumpDuration(-60)} data-testid="button-duration-minus-hour">-1h</button>
                      </div>
                      <div
                        className="flex-1 h-11 border rounded-md flex items-center justify-center text-sm font-semibold tabular-nums"
                        data-testid="text-approve-duration"
                      >
                        {fmtDur(durMins)}
                      </div>
                      <div className="flex flex-col gap-1">
                        <button type="button" className={stepBtn} onClick={() => bumpDuration(15)} data-testid="button-duration-plus-15">+15m</button>
                        <button type="button" className={stepBtn} onClick={() => bumpDuration(-15)} data-testid="button-duration-minus-15">-15m</button>
                      </div>
                    </div>
                    {endsAt && (
                      <p className="text-xs text-muted-foreground pl-1">Ends at {endsAt}</p>
                    )}
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="appr-notes" className="text-sm">
                      Internal Notes <span className="text-muted-foreground font-normal">(optional)</span>
                    </Label>
                    <Textarea
                      id="appr-notes"
                      rows={3}
                      className="text-base resize-none"
                      data-testid="input-approve-notes"
                      value={approveModal.notes}
                      onChange={(e) =>
                        setApproveModal((m) => (m ? { ...m, notes: e.target.value } : m))
                      }
                    />
                  </div>
                </div>

                {/* ── Right: Client Information ─────────────────────── */}
                <div className="space-y-4">
                  <div className="bg-muted/60 rounded-lg px-3 py-2 text-sm font-semibold">
                    Client Information
                  </div>

                  <div className="rounded-lg border p-3 flex items-start gap-3">
                    <div className="w-9 h-9 rounded-full bg-primary/15 text-primary flex items-center justify-center text-sm font-bold shrink-0">
                      {initials || "?"}
                    </div>
                    <div className="min-w-0 text-sm">
                      <p className="font-semibold">{req.firstName} {req.lastName}</p>
                      {(req.streetAddress || req.cityNeighborhood) && (
                        <p className="text-muted-foreground flex items-start gap-1 mt-0.5">
                          <MapPin className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                          <span className="break-words">{req.streetAddress || req.cityNeighborhood}</span>
                        </p>
                      )}
                      <p className="text-xs mt-1 space-x-2">
                        {req.email && (
                          <a href={`mailto:${req.email}`} className="text-primary hover:underline">{req.email}</a>
                        )}
                        {req.phone && (
                          <a href={`tel:${req.phone}`} className="text-primary hover:underline">{formatPhone(req.phone)}</a>
                        )}
                      </p>
                    </div>
                  </div>

                  <div className="rounded-lg border p-3 space-y-2 text-sm">
                    <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                      Piano &amp; Service
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {req.serviceRequested && (
                        <span className="inline-flex items-center rounded-md bg-primary/10 text-primary px-2 py-1 text-xs font-semibold">
                          {req.serviceRequested}
                        </span>
                      )}
                      {req.pianoType && (
                        <span className="inline-flex items-center rounded-md bg-muted px-2 py-1 text-xs font-medium">
                          {req.pianoType}
                        </span>
                      )}
                    </div>
                    {req.lastTuned && (
                      <p className="text-xs text-muted-foreground">Last tuned: {req.lastTuned}</p>
                    )}
                    {req.preferredTimes && (
                      <p className="text-xs text-muted-foreground border-t pt-2 italic">
                        {req.preferredTimes}
                      </p>
                    )}
                  </div>

                  <div className="rounded-lg border bg-muted/40 p-3 flex items-center justify-between text-sm">
                    <span className="font-semibold">Total</span>
                    <span className="font-semibold tabular-nums">
                      {fmtDur(durMins)}{approveModal.date ? ` · ${approveModal.date}` : ""}
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground">
                    Approving creates a new client record and a scheduled appointment,
                    and emails {req.firstName} a confirmation.
                  </p>
                </div>
              </div>

              <DialogFooter className="gap-2">
                <Button variant="outline" onClick={() => setApproveModal(null)} data-testid="button-approve-cancel">
                  Cancel
                </Button>
                <Button
                  disabled={
                    !approveModal.date ||
                    !approveModal.time ||
                    approveMutation.isPending
                  }
                  onClick={() =>
                    approveMutation.mutate({
                      id: approveModal.request.id,
                      date: approveModal.date,
                      time: approveModal.time,
                      duration: approveModal.duration,
                      notes: approveModal.notes,
                    })
                  }
                  data-testid="button-approve-save"
                >
                  {approveMutation.isPending ? "Saving…" : "Book Appointment"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        );
      })()}
    </>
  );
}

// ── Dashboard page ─────────────────────────────────────────────────────────────

export default function Dashboard() {
  const { data: customers, isLoading: customersLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: allAppointments, isLoading: appointmentsLoading } =
    useQuery<Appointment[]>({
      queryKey: ["/api/appointments"],
    });

  const { data: invoices, isLoading: invoicesLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });

  const scheduledAppointments = useMemo(
    () => allAppointments?.filter((a) => a.status === "scheduled") ?? [],
    [allAppointments]
  );

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">
            Dashboard
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Your piano service business at a glance
          </p>
        </div>
        <Link href="/customers/new">
          <Button data-testid="button-add-customer-dashboard">
            Add Client
          </Button>
        </Link>
      </div>

      {/* Booking requests (amber banner) */}
      <PendingBookingRequestsPanel />

      {/* Action Center — unpaid invoices + Boston follow-ups */}
      <ActionCenter invoices={invoices} customers={customers} />

      {/* Today's Itinerary — hidden when no appointments */}
      {appointmentsLoading ? (
        <Skeleton className="h-8 w-full" data-testid="today-loading" />
      ) : (
        <TodayItinerary
          appointments={allAppointments ?? []}
          customers={customers}
        />
      )}

      {/* Revenue chart + Trip widget */}
      <div className="grid gap-4 grid-cols-1 md:grid-cols-2">
        <MonthlyIncomeChart
          invoices={invoices}
          customers={customers}
          loading={invoicesLoading || customersLoading}
        />
        <UpcomingTripWidget />
      </div>

      {/* Bandwidth tracker */}
      <BandwidthTracker
        appointments={allAppointments ?? []}
        customers={customers}
      />

      {/* Upcoming Appointments */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Upcoming Appointments
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium flex items-center gap-1.5">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-primary/10 text-primary text-xs font-bold">
                  {scheduledAppointments.length}
                </span>
                Scheduled
              </h3>
              <Link href="/appointments">
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs h-7"
                  data-testid="link-view-appointments"
                >
                  View All <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            </div>
            {appointmentsLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : scheduledAppointments.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3 text-center">
                No scheduled appointments
              </p>
            ) : (
              <div className="space-y-1">
                {scheduledAppointments.slice(0, 5).map((appt) => {
                  const cust = customers?.find((c) => c.id === appt.customerId);
                  return (
                    <Link
                      key={appt.id}
                      href={cust ? `/customers/${cust.id}` : "/appointments"}
                    >
                      <div
                        className="flex items-center justify-between gap-2 p-2 rounded-md hover:bg-accent text-xs cursor-pointer"
                        data-testid={`scheduled-appt-${appt.id}`}
                      >
                        <span className="font-medium truncate">
                          {cust
                            ? `${cust.firstName} ${cust.lastName}`
                            : "Unknown"}
                        </span>
                        <span className="text-muted-foreground shrink-0">
                          {appt.date} {appt.time && `· ${appt.time}`}
                        </span>
                      </div>
                    </Link>
                  );
                })}
                {scheduledAppointments.length > 5 && (
                  <p className="text-xs text-muted-foreground text-center pt-1">
                    +{scheduledAppointments.length - 5} more
                  </p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
