import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Link } from "wouter";
import {
  Users,
  Piano,
  Clock,
  AlertTriangle,
  ArrowRight,
  CalendarDays,
  MapPin,
  Calendar,
} from "lucide-react";
import type { Customer, Appointment, Piano as PianoType } from "@shared/schema";

function StatCard({
  title,
  value,
  icon: Icon,
  description,
  loading,
  href,
}: {
  title: string;
  value: string | number;
  icon: any;
  description: string;
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

  const totalCustomers = customers?.length ?? 0;

  const scheduledTunings = allAppointments?.filter((a) => a.isTuning && a.status === "scheduled") ?? [];

  const overdueCustomers = customers?.filter((c) => {
    const months = getMonthsSinceLastTuned(c.lastTuned);
    return months !== null && months >= 12;
  }) ?? [];

  const totalPianos = allPianos?.length ?? 0;

  const needsAttention = customers
    ?.filter((c) => {
      const months = getMonthsSinceLastTuned(c.lastTuned);
      return months !== null && months >= 6;
    })
    .sort((a, b) => {
      const ma = getMonthsSinceLastTuned(a.lastTuned) ?? 0;
      const mb = getMonthsSinceLastTuned(b.lastTuned) ?? 0;
      return mb - ma;
    })
    .slice(0, 8) ?? [];

  const cityCounts = customers?.reduce<Record<string, number>>((acc, c) => {
    if (c.city) {
      acc[c.city] = (acc[c.city] || 0) + 1;
    }
    return acc;
  }, {}) ?? {};

  const topCities = Object.entries(cityCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

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
          description="Active client accounts"
          loading={isLoading}
          href="/customers"
        />
        <StatCard
          title="Total Pianos"
          value={totalPianos}
          icon={Piano}
          description="Pianos under service"
          loading={pianosLoading}
          href="/customers"
        />
        <StatCard
          title="Scheduled Appointments"
          value={scheduledTunings.length}
          icon={Calendar}
          description="Upcoming appointments"
          loading={appointmentsLoading}
          href="/appointments"
        />
        <StatCard
          title="Overdue"
          value={overdueCustomers.length}
          icon={AlertTriangle}
          description="Over 12 months since last tuning"
          loading={isLoading}
          href="/call-center"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader className="flex flex-row items-center justify-between gap-1 space-y-0">
            <CardTitle className="text-base font-semibold">Needs Attention</CardTitle>
            <Link href="/customers">
              <Button variant="ghost" size="sm" data-testid="link-view-all-customers">
                View All <ArrowRight className="ml-1 h-3 w-3" />
              </Button>
            </Link>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-14 w-full" />
                ))}
              </div>
            ) : needsAttention.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                <Clock className="h-8 w-8 mx-auto mb-2 opacity-40" />
                <p className="text-sm">All clients are up to date!</p>
              </div>
            ) : (
              <div className="space-y-2">
                {needsAttention.map((customer) => {
                  const months = getMonthsSinceLastTuned(customer.lastTuned);
                  return (
                    <Link
                      key={customer.id}
                      href={`/customers/${customer.id}`}
                    >
                      <div
                        className="flex items-center justify-between gap-3 p-3 rounded-md hover-elevate cursor-pointer bg-card border border-card-border"
                        data-testid={`customer-row-${customer.id}`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-muted text-sm font-medium">
                            {customer.firstName?.[0]}{customer.lastName?.[0]}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">
                              {customer.firstName} {customer.lastName}
                            </p>
                            <p className="text-xs text-muted-foreground truncate">
                              {customer.pianoType || "Unknown piano"}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <Badge
                            variant={months !== null && months >= 24 ? "destructive" : "outline"}
                            className={`no-default-active-elevate ${months !== null && months >= 12 && months < 24 ? "bg-orange-500 dark:bg-orange-600 text-white border-orange-600 dark:border-orange-500" : ""}`}
                          >
                            <CalendarDays className="h-3 w-3 mr-1" />
                            {months}mo ago
                          </Badge>
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <MapPin className="h-4 w-4" /> Service Areas
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full" />
                ))}
              </div>
            ) : topCities.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No location data</p>
            ) : (
              <div className="space-y-3">
                {topCities.map(([city, count]) => (
                  <div key={city} className="flex items-center justify-between gap-2">
                    <span className="text-sm truncate">{city}</span>
                    <div className="flex items-center gap-2">
                      <div className="h-2 bg-primary/20 rounded-full w-16 relative">
                        <div
                          className="h-2 bg-primary rounded-full absolute inset-y-0 left-0"
                          style={{
                            width: `${Math.min(100, (count / totalCustomers) * 100)}%`,
                          }}
                        />
                      </div>
                      <span className="text-xs text-muted-foreground w-6 text-right">
                        {count}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
