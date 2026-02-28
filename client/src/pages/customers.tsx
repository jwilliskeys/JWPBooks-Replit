import { useState, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import { formatPhone } from "@/lib/utils";
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
  LayoutGrid,
  List,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
} from "lucide-react";
import type { Customer, Piano as PianoType } from "@shared/schema";

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

function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split("/");
  if (parts.length !== 3) return null;
  let year = parseInt(parts[2]);
  if (year < 100) year += 2000;
  return new Date(year, parseInt(parts[0]) - 1, parseInt(parts[1]));
}

function getStatusBadge(dateStr: string | null | undefined) {
  const months = getMonthsSince(dateStr);
  if (months === null) return <Badge variant="secondary" className="no-default-active-elevate">No record</Badge>;
  if (months >= 24) return <Badge variant="destructive" className="no-default-active-elevate">Overdue</Badge>;
  if (months >= 12) return <Badge className="no-default-active-elevate bg-orange-500 dark:bg-orange-600 text-white border-orange-600 dark:border-orange-500">Overdue</Badge>;
  if (months >= 6) return <Badge variant="secondary" className="no-default-active-elevate">Due soon</Badge>;
  return <Badge className="no-default-active-elevate bg-emerald-600 dark:bg-emerald-700 text-white border-emerald-700 dark:border-emerald-600">Recently Tuned</Badge>;
}

function getStatusText(dateStr: string | null | undefined): string {
  const months = getMonthsSince(dateStr);
  if (months === null) return "No record";
  if (months >= 12) return "Overdue";
  if (months >= 6) return "Due soon";
  return "Recently Tuned";
}

type SortKey = "name" | "city" | "state" | "phone" | "email" | "pianoType" | "lastTuned" | "status" | "company";
type SortDir = "asc" | "desc";

export default function Customers() {
  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [viewMode, setViewMode] = useState<"card" | "list">("card");
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const { data: customers, isLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: pianos } = useQuery<PianoType[]>({
    queryKey: ["/api/pianos"],
  });

  const pianosByCustomer = useMemo(() => {
    const map = new Map<number, PianoType>();
    pianos?.forEach((p) => {
      if (!map.has(p.customerId)) {
        map.set(p.customerId, p);
      }
    });
    return map;
  }, [pianos]);

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

  const sorted = useMemo(() => {
    if (viewMode !== "list") return filtered;
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      const dir = sortDir === "asc" ? 1 : -1;
      switch (sortKey) {
        case "name": {
          const aName = `${a.lastName} ${a.firstName}`.toLowerCase();
          const bName = `${b.lastName} ${b.firstName}`.toLowerCase();
          cmp = aName.localeCompare(bName);
          break;
        }
        case "company": {
          const aCo = (a.companyName || "").toLowerCase();
          const bCo = (b.companyName || "").toLowerCase();
          if (!aCo && !bCo) cmp = 0;
          else if (!aCo) cmp = 1;
          else if (!bCo) cmp = -1;
          else cmp = aCo.localeCompare(bCo);
          break;
        }
        case "city": {
          const aCity = (a.city || "").toLowerCase();
          const bCity = (b.city || "").toLowerCase();
          if (!aCity && !bCity) cmp = 0;
          else if (!aCity) cmp = 1;
          else if (!bCity) cmp = -1;
          else cmp = aCity.localeCompare(bCity);
          break;
        }
        case "state": {
          const aState = (a.state || "").toLowerCase();
          const bState = (b.state || "").toLowerCase();
          if (!aState && !bState) cmp = 0;
          else if (!aState) cmp = 1;
          else if (!bState) cmp = -1;
          else cmp = aState.localeCompare(bState);
          break;
        }
        case "phone": {
          const aPhone = a.phone || "";
          const bPhone = b.phone || "";
          cmp = aPhone.localeCompare(bPhone);
          break;
        }
        case "email": {
          const aEmail = (a.email || "").toLowerCase();
          const bEmail = (b.email || "").toLowerCase();
          if (!aEmail && !bEmail) cmp = 0;
          else if (!aEmail) cmp = 1;
          else if (!bEmail) cmp = -1;
          else cmp = aEmail.localeCompare(bEmail);
          break;
        }
        case "pianoType": {
          const aPiano = (a.pianoType || "").toLowerCase();
          const bPiano = (b.pianoType || "").toLowerCase();
          if (!aPiano && !bPiano) cmp = 0;
          else if (!aPiano) cmp = 1;
          else if (!bPiano) cmp = -1;
          else cmp = aPiano.localeCompare(bPiano);
          break;
        }
        case "lastTuned": {
          const aDate = parseDate(a.lastTuned);
          const bDate = parseDate(b.lastTuned);
          if (!aDate && !bDate) cmp = 0;
          else if (!aDate) cmp = 1;
          else if (!bDate) cmp = -1;
          else cmp = aDate.getTime() - bDate.getTime();
          break;
        }
        case "status": {
          const aMonths = getMonthsSince(a.lastTuned);
          const bMonths = getMonthsSince(b.lastTuned);
          const aPri = aMonths === null ? 999 : aMonths;
          const bPri = bMonths === null ? 999 : bMonths;
          cmp = bPri - aPri;
          break;
        }
      }
      return cmp * dir;
    });
  }, [filtered, viewMode, sortKey, sortDir]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(sortDir === "asc" ? "desc" : "asc");
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ column }: { column: SortKey }) => {
    if (sortKey !== column) return <ArrowUpDown className="h-3 w-3 ml-1 opacity-40" />;
    return sortDir === "asc"
      ? <ArrowUp className="h-3 w-3 ml-1" />
      : <ArrowDown className="h-3 w-3 ml-1" />;
  };

  const displayList = viewMode === "list" ? sorted : filtered;

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Clients</h1>
          <p className="text-muted-foreground text-sm mt-1">
            {isLoading
              ? "Loading..."
              : `${displayList.length} of ${customers?.length ?? 0} clients`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center border rounded-md" data-testid="view-toggle">
            <Button
              variant={viewMode === "card" ? "default" : "ghost"}
              size="icon"
              className="h-8 w-8 rounded-r-none"
              onClick={() => setViewMode("card")}
              data-testid="button-view-card"
            >
              <LayoutGrid className="h-4 w-4" />
            </Button>
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="icon"
              className="h-8 w-8 rounded-l-none"
              onClick={() => setViewMode("list")}
              data-testid="button-view-list"
            >
              <List className="h-4 w-4" />
            </Button>
          </div>
          <Link href="/customers/new">
            <Button data-testid="button-add-customer">
              <UserPlus className="h-4 w-4 mr-1 sm:mr-2" /> <span className="hidden sm:inline">Add Client</span>
            </Button>
          </Link>
        </div>
      </div>

      <div className="space-y-3 sm:space-y-0 sm:flex sm:items-center sm:gap-3 sm:flex-wrap">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search clients..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-search"
          />
        </div>
        <div className="flex items-center gap-2">
          <SlidersHorizontal className="h-4 w-4 text-muted-foreground shrink-0 hidden sm:block" />
          <Select value={cityFilter} onValueChange={setCityFilter}>
            <SelectTrigger className="w-full sm:w-[140px]" data-testid="select-city-filter">
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
            <SelectTrigger className="w-full sm:w-[140px]" data-testid="select-status-filter">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="current">Recently Tuned</SelectItem>
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
      ) : displayList.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Search className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <h3 className="font-medium text-sm">No clients found</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {search || cityFilter !== "all" || statusFilter !== "all"
                ? "Try adjusting your filters"
                : "Import from Google Sheets or add clients manually"}
            </p>
          </CardContent>
        </Card>
      ) : viewMode === "card" ? (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {displayList.map((customer) => (
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
                    {(() => {
                      const primaryPiano = pianosByCustomer.get(customer.id);
                      const pianoLabel = primaryPiano && (primaryPiano.make || primaryPiano.pianoType)
                        ? [primaryPiano.make, primaryPiano.pianoType].filter(Boolean).join(" · ")
                        : customer.pianoType;
                      return pianoLabel ? (
                        <div className="flex items-center gap-2 text-xs text-muted-foreground" data-testid={`text-piano-${customer.id}`}>
                          <Piano className="h-3 w-3 shrink-0" />
                          <span className="truncate">{pianoLabel}</span>
                        </div>
                      ) : null;
                    })()}
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
                        <span>{formatPhone(customer.phone)}</span>
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
      ) : (
        <div className="overflow-x-auto rounded-lg border bg-card" data-testid="list-view-table">
          <div className="min-w-[900px]">
            <div className="flex items-center border-b bg-muted/50 text-xs font-medium text-muted-foreground sticky top-0 z-10">
              <button
                className="flex items-center px-3 py-2.5 w-[200px] shrink-0 hover:text-foreground transition-colors text-left"
                onClick={() => handleSort("name")}
                data-testid="sort-name"
              >
                Name <SortIcon column="name" />
              </button>
              <button
                className="flex items-center px-3 py-2.5 w-[130px] shrink-0 hover:text-foreground transition-colors text-left"
                onClick={() => handleSort("phone")}
                data-testid="sort-phone"
              >
                Phone <SortIcon column="phone" />
              </button>
              <button
                className="flex items-center px-3 py-2.5 w-[180px] shrink-0 hover:text-foreground transition-colors text-left"
                onClick={() => handleSort("email")}
                data-testid="sort-email"
              >
                Email <SortIcon column="email" />
              </button>
              <button
                className="flex items-center px-3 py-2.5 w-[120px] shrink-0 hover:text-foreground transition-colors text-left"
                onClick={() => handleSort("city")}
                data-testid="sort-city"
              >
                City <SortIcon column="city" />
              </button>
              <button
                className="flex items-center px-3 py-2.5 w-[60px] shrink-0 hover:text-foreground transition-colors text-left"
                onClick={() => handleSort("state")}
                data-testid="sort-state"
              >
                ST <SortIcon column="state" />
              </button>
              <button
                className="flex items-center px-3 py-2.5 flex-1 min-w-[140px] hover:text-foreground transition-colors text-left"
                onClick={() => handleSort("pianoType")}
                data-testid="sort-piano"
              >
                Piano <SortIcon column="pianoType" />
              </button>
              <button
                className="flex items-center px-3 py-2.5 w-[100px] shrink-0 hover:text-foreground transition-colors text-left"
                onClick={() => handleSort("lastTuned")}
                data-testid="sort-last-tuned"
              >
                Last Tuned <SortIcon column="lastTuned" />
              </button>
              <button
                className="flex items-center px-3 py-2.5 w-[110px] shrink-0 hover:text-foreground transition-colors text-left"
                onClick={() => handleSort("status")}
                data-testid="sort-status"
              >
                Status <SortIcon column="status" />
              </button>
            </div>
            <div>
              {sorted.map((customer) => (
                <Link key={customer.id} href={`/customers/${customer.id}`}>
                  <div
                    className="flex items-center border-b last:border-b-0 hover:bg-muted/50 cursor-pointer transition-colors text-sm"
                    data-testid={`row-customer-${customer.id}`}
                  >
                    <div className="px-3 py-2.5 w-[200px] shrink-0 font-medium truncate" data-testid={`text-customer-name-${customer.id}`}>
                      {customer.firstName} {customer.lastName}
                      {customer.companyName && (
                        <span className="text-xs text-muted-foreground ml-1">({customer.companyName})</span>
                      )}
                    </div>
                    <div className="px-3 py-2.5 w-[130px] shrink-0 text-muted-foreground truncate">
                      {customer.phone ? formatPhone(customer.phone) : "—"}
                    </div>
                    <div className="px-3 py-2.5 w-[180px] shrink-0 text-muted-foreground truncate">
                      {customer.email || "—"}
                    </div>
                    <div className="px-3 py-2.5 w-[120px] shrink-0 text-muted-foreground truncate">
                      {customer.city || "—"}
                    </div>
                    <div className="px-3 py-2.5 w-[60px] shrink-0 text-muted-foreground">
                      {customer.state || "—"}
                    </div>
                    <div className="px-3 py-2.5 flex-1 min-w-[140px] text-muted-foreground truncate">
                      {customer.pianoType || "—"}
                    </div>
                    <div className="px-3 py-2.5 w-[100px] shrink-0 text-muted-foreground">
                      {customer.lastTuned || "—"}
                    </div>
                    <div className="px-3 py-2.5 w-[110px] shrink-0">
                      {getStatusBadge(customer.lastTuned)}
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
