import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Users,
  Piano,
  ArrowRight,
  MapPin,
  Calendar,
  DollarSign,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { Customer, Appointment, Piano as PianoType, Invoice } from "@shared/schema";
import {
  getServiceArea,
  getServiceRegion,
  SERVICE_REGIONS,
} from "@/lib/scheduling";

function StatCard({
  title,
  value,
  icon: Icon,
  loading,
  href,
}: {
  title: string;
  value: string | number;
  icon: any;
  loading: boolean;
  href: string;
}) {
  return (
    <Link href={href}>
      <Card className="cursor-pointer hover-elevate">
        <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0 pb-1 pt-3 px-4">
          <CardTitle className="text-xs font-medium text-muted-foreground">{title}</CardTitle>
          <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        </CardHeader>
        <CardContent className="pb-3 px-4">
          {loading ? (
            <Skeleton className="h-7 w-16" />
          ) : (
            <div className="text-xl font-bold" data-testid={`stat-${title.toLowerCase().replace(/\s+/g, '-')}`}>{value}</div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
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

function getMonthsSinceLastTuned(dateStr: string | null | undefined): number | null {
  const date = parseDate(dateStr);
  if (!date) return null;
  const now = new Date();
  const months = (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
  return months;
}

function parseDollar(value: string | null | undefined): number {
  if (!value) return 0;
  const num = parseFloat(value.replace(/[$,]/g, ""));
  return isNaN(num) ? 0 : num;
}

const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function getMonthKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

interface MonthlyIncomeData {
  month: string;
  monthKey: string;
  total: number;
  paid: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number; name: string }>;
  label?: string;
  monthData?: MonthlyIncomeData[];
}

function CustomTooltip({ active, payload, label, monthData }: CustomTooltipProps) {
  if (!active || !payload || !label) return null;
  const data = monthData?.find((d) => d.month === label);
  return (
    <div className="bg-popover border border-border rounded-md shadow-md px-3 py-2 text-xs">
      <p className="font-semibold mb-1">{label}</p>
      <p className="text-muted-foreground">Total billed: <span className="text-foreground font-medium">${data?.total.toFixed(2)}</span></p>
      <p className="text-muted-foreground">Total paid: <span className="text-foreground font-medium">${data?.paid.toFixed(2)}</span></p>
    </div>
  );
}

function TodayItinerary({ appointments, customers }: { appointments: Appointment[]; customers: Customer[] | undefined }) {
  const todayStr = useMemo(() => {
    const now = new Date();
    return `${now.getMonth() + 1}/${now.getDate()}/${String(now.getFullYear()).slice(-2)}`;
  }, []);

  const todayAppointments = useMemo(() => {
    return appointments.filter((a) => a.date === todayStr);
  }, [appointments, todayStr]);

  if (todayAppointments.length === 0) {
    return (
      <div
        className="flex items-center gap-2 px-3 py-2 rounded-md bg-muted/40 text-muted-foreground text-sm"
        data-testid="today-no-appointments"
      >
        <Calendar className="h-3.5 w-3.5 shrink-0" />
        <span>No appointments today</span>
      </div>
    );
  }

  return (
    <Card data-testid="today-itinerary-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <Calendar className="h-4 w-4" /> Today's Appointments
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1">
        {todayAppointments.map((appt) => {
          const cust = customers?.find((c) => c.id === appt.customerId);
          const href = cust ? `/customers/${cust.id}` : "/appointments";
          return (
            <Link key={appt.id} href={href}>
              <div
                className="flex items-center justify-between gap-3 p-2 rounded-md hover:bg-accent cursor-pointer text-xs"
                data-testid={`today-appt-${appt.id}`}
              >
                <div className="flex flex-col gap-0.5 min-w-0">
                  <span className="font-medium truncate">
                    {cust ? `${cust.firstName} ${cust.lastName}` : "Unknown Client"}
                  </span>
                  {appt.servicesRequested && (
                    <span className="text-muted-foreground truncate">{appt.servicesRequested}</span>
                  )}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {appt.time && (
                    <span className="text-muted-foreground">{appt.time}</span>
                  )}
                  <Badge
                    variant={appt.status === "completed" ? "default" : "outline"}
                    className="text-[10px] capitalize"
                    data-testid={`today-appt-status-${appt.id}`}
                  >
                    {appt.status}
                  </Badge>
                </div>
              </div>
            </Link>
          );
        })}
      </CardContent>
    </Card>
  );
}

function MonthlyIncomeChart({ invoices, loading }: { invoices: Invoice[] | undefined; loading: boolean }) {
  const monthlyData: MonthlyIncomeData[] = useMemo(() => {
    const now = new Date();
    const months: MonthlyIncomeData[] = [];

    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = getMonthKey(d.getFullYear(), d.getMonth() + 1);
      months.push({
        monthKey: key,
        month: `${MONTH_NAMES[d.getMonth()]} ${String(d.getFullYear()).slice(-2)}`,
        total: 0,
        paid: 0,
      });
    }

    invoices?.forEach((inv) => {
      const date = parseDate(inv.invoiceDate);
      if (!date) return;
      const key = getMonthKey(date.getFullYear(), date.getMonth() + 1);
      const entry = months.find((m) => m.monthKey === key);
      if (!entry) return;
      const total = parseDollar(inv.total);
      entry.total += total;
      if (inv.status === "paid") {
        entry.paid += parseDollar(inv.paidAmount || inv.total);
      }
    });

    return months;
  }, [invoices]);

  return (
    <Card data-testid="monthly-income-card">
      <CardHeader className="pb-2">
        <CardTitle className="text-base font-semibold flex items-center gap-2">
          <DollarSign className="h-4 w-4" /> Monthly Income
        </CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <Skeleton className="h-48 w-full" />
        ) : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={monthlyData} margin={{ top: 4, right: 4, left: -20, bottom: 0 }}>
              <XAxis
                dataKey="month"
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 10 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v) => `$${v}`}
              />
              <Tooltip
                content={<CustomTooltip monthData={monthlyData} />}
                cursor={{ fill: "hsl(var(--muted))" }}
              />
              <Bar
                dataKey="total"
                name="Total Billed"
                fill="hsl(var(--primary) / 0.25)"
                radius={[3, 3, 0, 0]}
              />
              <Bar
                dataKey="paid"
                name="Paid"
                fill="hsl(var(--primary))"
                radius={[3, 3, 0, 0]}
              />
            </BarChart>
          </ResponsiveContainer>
        )}
        <div className="flex items-center gap-4 mt-2 justify-center">
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary/25" />
            Total Billed
          </div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <span className="inline-block h-2.5 w-2.5 rounded-sm bg-primary" />
            Paid
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { data: customers, isLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: allAppointments, isLoading: appointmentsLoading } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments"],
  });

  const { data: allPianos, isLoading: pianosLoading } = useQuery<PianoType[]>({
    queryKey: ["/api/pianos"],
  });

  const { data: invoices, isLoading: invoicesLoading } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
  });

  const totalCustomers = customers?.length ?? 0;
  const totalPianos = allPianos?.length ?? 0;

  const scheduledAppointments = useMemo(() =>
    allAppointments?.filter((a) => a.status === "scheduled") ?? [],
    [allAppointments]
  );

  const overdueCustomers = useMemo(() =>
    customers?.filter((c) => {
      const months = getMonthsSinceLastTuned(c.lastTuned);
      return months !== null && months >= 12;
    }) ?? [],
    [customers]
  );

  const serviceAreaCounts = useMemo(() => {
    const counts: Record<string, Record<string, number>> = {};
    customers?.forEach((c) => {
      if (!c.city) return;
      const region = getServiceRegion(c.city);
      const area = getServiceArea(c.city);
      if (!counts[region]) counts[region] = {};
      counts[region][area] = (counts[region][area] || 0) + 1;
    });
    return counts;
  }, [customers]);

  const regionTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const [region, areas] of Object.entries(serviceAreaCounts)) {
      totals[region] = Object.values(areas).reduce((s, c) => s + c, 0);
    }
    return totals;
  }, [serviceAreaCounts]);

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Dashboard</h1>
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

      {appointmentsLoading ? (
        <Skeleton className="h-8 w-full" data-testid="today-loading" />
      ) : (
        <TodayItinerary
          appointments={allAppointments ?? []}
          customers={customers}
        />
      )}

      <div className="grid gap-3 grid-cols-2">
        <StatCard
          title="Total Clients"
          value={totalCustomers}
          icon={Users}
          loading={isLoading}
          href="/customers"
        />
        <StatCard
          title="Total Pianos"
          value={totalPianos}
          icon={Piano}
          loading={pianosLoading}
          href="/customers"
        />
      </div>

      <MonthlyIncomeChart invoices={invoices} loading={invoicesLoading} />

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <MapPin className="h-4 w-4" /> Service Areas
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-8 w-full" />
              ))}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              {Object.entries(SERVICE_REGIONS).map(([region, subAreas]) => {
                const regionCount = regionTotals[region] || 0;
                const areaCounts = serviceAreaCounts[region] || {};
                return (
                  <div key={region} className="space-y-2" data-testid={`region-${region.toLowerCase().replace(/\s+/g, '-')}`}>
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-semibold">{region}</h3>
                      <span className="text-xs text-muted-foreground">{regionCount} clients</span>
                    </div>
                    <div className="space-y-1.5 pl-3 border-l-2 border-muted">
                      {subAreas.map((area) => {
                        const count = areaCounts[area] || 0;
                        return (
                          <Link key={area} href={`/customers?area=${encodeURIComponent(area)}`}>
                            <div className="flex items-center justify-between gap-2 rounded px-1 py-0.5 hover:bg-accent cursor-pointer" data-testid={`area-link-${area.toLowerCase().replace(/\s+/g, '-')}`}>
                              <span className="text-xs truncate">{area}</span>
                              <div className="flex items-center gap-2">
                                <div className="h-1.5 bg-primary/15 rounded-full w-12 relative">
                                  <div
                                    className="h-1.5 bg-primary rounded-full absolute inset-y-0 left-0"
                                    style={{
                                      width: `${regionCount > 0 ? Math.min(100, (count / regionCount) * 100) : 0}%`,
                                    }}
                                  />
                                </div>
                                <span className="text-[10px] text-muted-foreground w-4 text-right">
                                  {count}
                                </span>
                              </div>
                            </div>
                          </Link>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
              {serviceAreaCounts["Other"] && (
                <div className="space-y-2" data-testid="region-other">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold">Other</h3>
                    <span className="text-xs text-muted-foreground">
                      {Object.values(serviceAreaCounts["Other"]).reduce((s, c) => s + c, 0)} clients
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Calendar className="h-4 w-4" /> Appointments & Overdue
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
                <Button variant="ghost" size="sm" className="text-xs h-7" data-testid="link-view-appointments">
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
              <p className="text-xs text-muted-foreground py-3 text-center">No scheduled appointments</p>
            ) : (
              <div className="space-y-1">
                {scheduledAppointments.slice(0, 5).map((appt) => {
                  const cust = customers?.find((c) => c.id === appt.customerId);
                  return (
                    <Link key={appt.id} href={cust ? `/customers/${cust.id}` : "/appointments"}>
                      <div className="flex items-center justify-between gap-2 p-2 rounded-md hover:bg-accent text-xs cursor-pointer" data-testid={`scheduled-appt-${appt.id}`}>
                        <span className="font-medium truncate">
                          {cust ? `${cust.firstName} ${cust.lastName}` : "Unknown"}
                        </span>
                        <span className="text-muted-foreground shrink-0">
                          {appt.date} {appt.time && `· ${appt.time}`}
                        </span>
                      </div>
                    </Link>
                  );
                })}
                {scheduledAppointments.length > 5 && (
                  <p className="text-xs text-muted-foreground text-center pt-1">+{scheduledAppointments.length - 5} more</p>
                )}
              </div>
            )}
          </div>

          <div className="border-t pt-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-medium flex items-center gap-1.5">
                <span className="flex h-5 w-5 items-center justify-center rounded bg-amber-500/10 text-amber-600 dark:text-amber-400 text-xs font-bold">
                  {overdueCustomers.length}
                </span>
                Overdue
                <span className="text-xs text-muted-foreground font-normal">12+ months</span>
              </h3>
              <Link href="/call-center">
                <Button variant="ghost" size="sm" className="text-xs h-7" data-testid="link-view-overdue">
                  Call Center <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            </div>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : overdueCustomers.length === 0 ? (
              <p className="text-xs text-muted-foreground py-3 text-center">All clients up to date</p>
            ) : (
              <div className="space-y-1">
                {overdueCustomers.slice(0, 5).map((customer) => {
                  const months = getMonthsSinceLastTuned(customer.lastTuned);
                  return (
                    <Link key={customer.id} href={`/customers/${customer.id}`}>
                      <div className="flex items-center justify-between gap-2 p-2 rounded-md hover:bg-accent text-xs cursor-pointer" data-testid={`overdue-customer-${customer.id}`}>
                        <span className="font-medium truncate">
                          {customer.firstName} {customer.lastName}
                        </span>
                        <Badge variant="outline" className="text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-600 text-[10px] shrink-0">
                          {months}mo
                        </Badge>
                      </div>
                    </Link>
                  );
                })}
                {overdueCustomers.length > 5 && (
                  <p className="text-xs text-muted-foreground text-center pt-1">+{overdueCustomers.length - 5} more</p>
                )}
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
