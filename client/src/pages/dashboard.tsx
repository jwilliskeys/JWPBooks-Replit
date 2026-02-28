import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Link } from "wouter";
import {
  Users,
  Piano,
  Clock,
  ArrowRight,
  CalendarDays,
  MapPin,
  Calendar,
  AlertTriangle,
} from "lucide-react";
import type { Customer, Appointment, Piano as PianoType } from "@shared/schema";
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

const ATTENTION_THRESHOLDS = [12, 9, 6];
const ATTENTION_LABELS = ["Low", "Medium", "High"];

export default function Dashboard() {
  const [attentionLevel, setAttentionLevel] = useState(0);

  const { data: customers, isLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: allAppointments, isLoading: appointmentsLoading } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments"],
  });

  const { data: allPianos, isLoading: pianosLoading } = useQuery<PianoType[]>({
    queryKey: ["/api/pianos"],
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

  const threshold = ATTENTION_THRESHOLDS[attentionLevel];
  const needsAttention = useMemo(() =>
    customers
      ?.filter((c) => {
        const months = getMonthsSinceLastTuned(c.lastTuned);
        return months !== null && months >= threshold;
      })
      .sort((a, b) => {
        const ma = getMonthsSinceLastTuned(a.lastTuned) ?? 0;
        const mb = getMonthsSinceLastTuned(b.lastTuned) ?? 0;
        return mb - ma;
      })
      .slice(0, 10) ?? [],
    [customers, threshold]
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

      <div className="grid gap-4 lg:grid-cols-2">
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

        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle className="text-base font-semibold flex items-center gap-2">
                <AlertTriangle className="h-4 w-4" /> Needs Attention
              </CardTitle>
              <Link href="/customers">
                <Button variant="ghost" size="sm" className="text-xs h-7" data-testid="link-view-all-customers">
                  View All <ArrowRight className="ml-1 h-3 w-3" />
                </Button>
              </Link>
            </div>
            <div className="pt-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
                <span>Attention Level</span>
                <span className="font-medium text-foreground">{ATTENTION_LABELS[attentionLevel]} ({threshold}+ months)</span>
              </div>
              <Slider
                value={[attentionLevel]}
                onValueChange={([v]) => setAttentionLevel(v)}
                min={0}
                max={2}
                step={1}
                className="w-full"
                data-testid="slider-attention-level"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>Low</span>
                <span>Med</span>
                <span>High</span>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-10 w-full" />
                ))}
              </div>
            ) : needsAttention.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Clock className="h-6 w-6 mx-auto mb-2 opacity-40" />
                <p className="text-xs">All clients are up to date!</p>
              </div>
            ) : (
              <div className="space-y-1">
                {needsAttention.map((customer) => {
                  const months = getMonthsSinceLastTuned(customer.lastTuned);
                  return (
                    <Link key={customer.id} href={`/customers/${customer.id}`}>
                      <div
                        className="flex items-center justify-between gap-2 p-2 rounded-md hover:bg-accent cursor-pointer"
                        data-testid={`customer-row-${customer.id}`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-medium">
                            {customer.firstName?.[0]}{customer.lastName?.[0]}
                          </div>
                          <div className="min-w-0">
                            <p className="text-xs font-medium truncate">
                              {customer.firstName} {customer.lastName}
                            </p>
                            <p className="text-[10px] text-muted-foreground truncate">
                              {customer.city || customer.pianoType || "Unknown"}
                            </p>
                          </div>
                        </div>
                        <Badge
                          variant="outline"
                          className={`text-[10px] shrink-0 ${
                            months !== null && months >= 24
                              ? "text-amber-700 dark:text-amber-300 border-amber-400 dark:border-amber-600 bg-amber-50 dark:bg-amber-950"
                              : months !== null && months >= 12
                              ? "text-amber-600 dark:text-amber-400 border-amber-300 dark:border-amber-600"
                              : "text-muted-foreground"
                          }`}
                        >
                          <CalendarDays className="h-2.5 w-2.5 mr-0.5" />
                          {months}mo
                        </Badge>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

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
                          <div key={area} className="flex items-center justify-between gap-2">
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
    </div>
  );
}
