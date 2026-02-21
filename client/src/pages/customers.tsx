import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Search,
  UserPlus,
  Phone,
  Mail,
  MapPin,
  CalendarDays,
  Piano,
  SlidersHorizontal,
} from "lucide-react";
import type { Customer } from "@shared/schema";

function getMonthsSince(dateStr: string | null | undefined): number | null {
  if (!dateStr) return null;
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;
  const month = parseInt(parts[0]) - 1;
  const day = parseInt(parts[1]);
  let year = parseInt(parts[2]);
  if (year < 100) year += 2000;
  const date = new Date(year, month, day);
  const now = new Date();
  return (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
}

function getStatusBadge(dateStr: string | null | undefined) {
  const months = getMonthsSince(dateStr);
  if (months === null) return <Badge variant="secondary" className="no-default-active-elevate">No record</Badge>;
  if (months >= 12) return <Badge variant="destructive" className="no-default-active-elevate">Overdue</Badge>;
  if (months >= 6) return <Badge variant="secondary" className="no-default-active-elevate">Due soon</Badge>;
  return <Badge className="no-default-active-elevate bg-emerald-600 dark:bg-emerald-700 text-white border-emerald-700 dark:border-emerald-600">Current</Badge>;
}

export default function Customers() {
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const { data: customers, isLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const cities = useMemo(() => {
    if (!customers) return [];
    const set = new Set(customers.map((c) => c.city).filter(Boolean) as string[]);
    return Array.from(set).sort();
  }, [customers]);

  const filtered = useMemo(() => {
    if (!customers) return [];
    return customers.filter((c) => {
      const searchLower = search.toLowerCase();
      const matchesSearch =
        !search ||
        `${c.firstName} ${c.lastName}`.toLowerCase().includes(searchLower) ||
        c.email?.toLowerCase().includes(searchLower) ||
        c.phone?.includes(search) ||
        c.pianoType?.toLowerCase().includes(searchLower) ||
        c.city?.toLowerCase().includes(searchLower) ||
        c.companyName?.toLowerCase().includes(searchLower);

      const matchesCity = cityFilter === "all" || c.city === cityFilter;

      const months = getMonthsSince(c.lastTuned);
      const matchesStatus =
        statusFilter === "all" ||
        (statusFilter === "overdue" && months !== null && months >= 12) ||
        (statusFilter === "due" && months !== null && months >= 6 && months < 12) ||
        (statusFilter === "current" && months !== null && months < 6) ||
        (statusFilter === "unknown" && months === null);

      return matchesSearch && matchesCity && matchesStatus;
    });
  }, [customers, search, cityFilter, statusFilter]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Customers</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isLoading
              ? "Loading..."
              : `${filtered.length} of ${customers?.length ?? 0} customers`}
          </p>
        </div>
        <Link href="/customers/new">
          <Button data-testid="button-add-customer">
            <UserPlus className="h-4 w-4 mr-2" /> Add Customer
          </Button>
        </Link>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search customers..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground" />
          <Select value={cityFilter} onValueChange={setCityFilter}>
            <SelectTrigger className="w-[140px]" data-testid="select-city-filter">
              <SelectValue placeholder="All Cities" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Cities</SelectItem>
              {cities.map((city) => (
                <SelectItem key={city} value={city}>{city}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[140px]" data-testid="select-status-filter">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="current">Current</SelectItem>
              <SelectItem value="due">Due Soon</SelectItem>
              <SelectItem value="overdue">Overdue</SelectItem>
              <SelectItem value="unknown">No Record</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Card key={i}>
              <CardContent className="p-4 space-y-3">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-24" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Search className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <h3 className="font-medium text-sm">No customers found</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {search || cityFilter !== "all" || statusFilter !== "all"
                ? "Try adjusting your filters"
                : "Import from Google Sheets or add customers manually"}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((customer) => (
            <Link key={customer.id} href={`/customers/${customer.id}`}>
              <Card className="hover-elevate cursor-pointer h-full" data-testid={`card-customer-${customer.id}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary text-sm font-semibold">
                        {customer.firstName?.[0]}{customer.lastName?.[0]}
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-sm truncate" data-testid={`text-customer-name-${customer.id}`}>
                          {customer.firstName} {customer.lastName}
                        </p>
                        {customer.companyName && (
                          <p className="text-xs text-muted-foreground truncate">{customer.companyName}</p>
                        )}
                      </div>
                    </div>
                    {getStatusBadge(customer.lastTuned)}
                  </div>

                  <div className="space-y-1.5">
                    {customer.pianoType && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Piano className="h-3 w-3 shrink-0" />
                        <span className="truncate">{customer.pianoType}</span>
                      </div>
                    )}
                    {customer.lastTuned && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <CalendarDays className="h-3 w-3 shrink-0" />
                        <span>Last tuned: {customer.lastTuned}</span>
                      </div>
                    )}
                    {customer.city && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{customer.city}, {customer.state}</span>
                      </div>
                    )}
                    {customer.phone && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3 shrink-0" />
                        <span>{customer.phone}</span>
                      </div>
                    )}
                    {customer.email && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Mail className="h-3 w-3 shrink-0" />
                        <span className="truncate">{customer.email}</span>
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
