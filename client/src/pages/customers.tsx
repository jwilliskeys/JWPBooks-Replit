import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useSearch, useLocation } from "wouter";
import { formatPhone } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
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
  MapPin,
  CalendarDays,
  Piano,
  LayoutGrid,
  List,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  CheckCircle,
  Calendar,
  Star,
} from "lucide-react";
import type { Customer, Appointment, Piano as PianoType } from "@shared/schema";
import { AppointmentDialog } from "@/components/appointment-dialog";
import { SERVICE_AREA_CLUSTERS, getServiceArea } from "@/lib/scheduling";

function parseDate(dateStr: string | null | undefined): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split("/");
  if (parts.length === 3) {
    const month = parseInt(parts[0]) - 1;
    const day = parseInt(parts[1]);
    let year = parseInt(parts[2]);
    if (year < 100) year += 2000;
    const d = new Date(year, month, day);
    if (isNaN(d.getTime())) return null;
    return d;
  }
  const tryParse = new Date(dateStr);
  if (!isNaN(tryParse.getTime())) return tryParse;
  return null;
}

function getMonthsSince(dateStr: string | null | undefined): number | null {
  const date = parseDate(dateStr);
  if (!date) return null;
  const now = new Date();
  return (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
}

function getStatusBadge(dateStr: string | null | undefined) {
  const months = getMonthsSince(dateStr);
  if (months === null) return <Badge variant="secondary" className="no-default-active-elevate text-xs">No record</Badge>;
  if (months >= 24) return <Badge variant="destructive" className="no-default-active-elevate text-xs">Overdue {months}mo</Badge>;
  if (months >= 12) return <Badge className="no-default-active-elevate text-xs bg-orange-500 dark:bg-orange-600 text-white border-orange-600 dark:border-orange-500">Overdue {months}mo</Badge>;
  if (months >= 6) return <Badge variant="secondary" className="no-default-active-elevate text-xs">Due soon</Badge>;
  return <Badge className="no-default-active-elevate text-xs bg-emerald-600 dark:bg-emerald-700 text-white border-emerald-700 dark:border-emerald-600">Recently Tuned</Badge>;
}

function formatDateDisplay(dateStr: string | null | undefined): string {
  if (!dateStr) return "Never";
  return dateStr;
}

function todayFormatted(): string {
  const now = new Date();
  return `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
}

type SortOption = "priority" | "lastTuned" | "lastContacted" | "nextAppointment" | "location" | "lastName" | "pianoType";

const DEFAULT_DIRECTIONS: Record<SortOption, "asc" | "desc"> = {
  priority: "desc",
  lastTuned: "asc",
  lastContacted: "asc",
  nextAppointment: "asc",
  location: "asc",
  lastName: "asc",
  pianoType: "asc",
};

const PARAM_DEFAULTS: Record<string, string> = {
  q: "", area: "all", filter: "all", view: "list", sort: "lastName", dir: "asc",
};

export default function Customers() {
  const rawSearch = useSearch();
  const [, navigate] = useLocation();
  const params = useMemo(() => new URLSearchParams(rawSearch), [rawSearch]);

  const search = params.get("q") ?? "";
  const areaFilter = params.get("area") ?? "all";
  const quickFiltersRaw = params.get("filter") ?? "";
  const activeFilters = useMemo(
    () => new Set(quickFiltersRaw ? quickFiltersRaw.split(",") : []),
    [quickFiltersRaw]
  );
  const viewMode = (params.get("view") ?? "list") as "card" | "list";
  const sortBy = (params.get("sort") ?? "lastName") as SortOption;
  const sortDir = (params.get("dir") ?? "asc") as "asc" | "desc";

  function setParams(updates: Record<string, string>) {
    const p = new URLSearchParams(rawSearch);
    for (const [key, value] of Object.entries(updates)) {
      if (value === (PARAM_DEFAULTS[key] ?? "")) {
        p.delete(key);
      } else {
        p.set(key, value);
      }
    }
    const qs = p.toString();
    navigate(`/customers${qs ? `?${qs}` : ""}`, { replace: true });
  }

  function toggleQuickFilter(key: string) {
    const next = new Set(activeFilters);
    if (next.has(key)) {
      next.delete(key);
    } else {
      next.add(key);
    }
    const joined = [...next].join(",");
    const p = new URLSearchParams(rawSearch);
    if (joined) {
      p.set("filter", joined);
    } else {
      p.delete("filter");
    }
    const qs = p.toString();
    navigate(`/customers${qs ? `?${qs}` : ""}`, { replace: true });
  }

  const [showAppointmentDialog, setShowAppointmentDialog] = useState(false);
  const [appointmentCustomerId, setAppointmentCustomerId] = useState<number | undefined>(undefined);
  const [appointmentCustomerName, setAppointmentCustomerName] = useState<string>("");
  const { toast } = useToast();

  const { data: customers, isLoading } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: appointments } = useQuery<Appointment[]>({
    queryKey: ["/api/appointments"],
  });

  const { data: pianos } = useQuery<PianoType[]>({
    queryKey: ["/api/pianos"],
  });

  const { pianosByCustomer, customersWithAllInactivePianos } = useMemo(() => {
    const map = new Map<number, PianoType>();
    const allInactive = new Set<number>();
    if (pianos) {
      const customerPianoMap = new Map<number, PianoType[]>();
      pianos.forEach((p) => {
        if (!customerPianoMap.has(p.customerId)) customerPianoMap.set(p.customerId, []);
        customerPianoMap.get(p.customerId)!.push(p);
      });
      customerPianoMap.forEach((pianosArr, custId) => {
        const activePiano = pianosArr.find(p => p.isActive !== false);
        if (activePiano) {
          map.set(custId, activePiano);
        } else if (pianosArr.length > 0) {
          allInactive.add(custId);
        }
      });
    }
    return { pianosByCustomer: map, customersWithAllInactivePianos: allInactive };
  }, [pianos]);

  const nextAppointmentMap = useMemo(() => {
    const map = new Map<number, string>();
    appointments
      ?.filter((a) => a.status === "scheduled")
      .sort((a, b) => a.date.localeCompare(b.date))
      .forEach((a) => {
        if (!map.has(a.customerId)) {
          map.set(a.customerId, a.date);
        }
      });
    return map;
  }, [appointments]);

  const markContactedMutation = useMutation({
    mutationFn: ({ id, date }: { id: number; date: string }) =>
      apiRequest("PATCH", `/api/customers/${id}`, { lastContacted: date }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      toast({ title: "Marked as contacted" });
    },
    onError: () => {
      toast({ title: "Failed to update", variant: "destructive" });
    },
  });

  const toggleStarMutation = useMutation({
    mutationFn: ({ id, isStarred }: { id: number; isStarred: boolean }) =>
      apiRequest("PATCH", `/api/customers/${id}`, { isStarred }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
    },
    onError: () => {
      toast({ title: "Failed to update", variant: "destructive" });
    },
  });

  function matchesAreaFilter(customer: Customer): boolean {
    if (areaFilter === "all") return true;
    const custArea = getServiceArea(customer.city ?? "", customer.state ?? "");
    return custArea === areaFilter;
  }

  const filtered = useMemo(() => {
    if (!customers) return [];
    return customers.filter((c) => {
      if (customersWithAllInactivePianos.has(c.id)) return false;
      if (!matchesAreaFilter(c)) return false;

      const searchLower = search.toLowerCase();
      const matchesSearch =
        !search ||
        `${c.firstName} ${c.lastName}`.toLowerCase().includes(searchLower) ||
        c.email?.toLowerCase().includes(searchLower) ||
        c.phone?.includes(search) ||
        c.pianoType?.toLowerCase().includes(searchLower) ||
        c.city?.toLowerCase().includes(searchLower) ||
        c.companyName?.toLowerCase().includes(searchLower);

      let matchesQuickFilter = true;
      if (activeFilters.size > 0) {
        const piano = pianosByCustomer.get(c.id);
        const pianoTypeStr = (piano?.pianoType ?? c.pianoType ?? "").toLowerCase();
        if (activeFilters.has("grand")) {
          if (!pianoTypeStr.includes("grand")) matchesQuickFilter = false;
        }
        if (activeFilters.has("upright")) {
          if (!pianoTypeStr.includes("upright") && !pianoTypeStr.includes("spinet")) matchesQuickFilter = false;
        }
        if (activeFilters.has("not-contacted-6mo")) {
          const contactedMonths = getMonthsSince(c.lastContacted);
          if (!(contactedMonths === null || contactedMonths >= 6)) matchesQuickFilter = false;
        }
        if (activeFilters.has("slc-only")) {
          const custArea = getServiceArea(c.city ?? "", c.state ?? "");
          const isSlc = custArea === "Davis County" || custArea === "Salt Lake City" || custArea === "South Jordan";
          if (!isSlc) matchesQuickFilter = false;
        }
      }

      return matchesSearch && matchesQuickFilter;
    });
  }, [customers, search, areaFilter, activeFilters, customersWithAllInactivePianos, pianosByCustomer]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "priority": {
          const aStarred = a.isStarred ? 1 : 0;
          const bStarred = b.isStarred ? 1 : 0;
          if (aStarred !== bStarred) {
            cmp = aStarred - bStarred;
            break;
          }
          const aContacted = getMonthsSince(a.lastContacted);
          const bContacted = getMonthsSince(b.lastContacted);
          const aTuned = getMonthsSince(a.lastTuned);
          const bTuned = getMonthsSince(b.lastTuned);
          const aScore = Math.max(aContacted ?? 999, aTuned ?? 999);
          const bScore = Math.max(bContacted ?? 999, bTuned ?? 999);
          cmp = aScore - bScore;
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
        case "lastContacted": {
          const aDate = parseDate(a.lastContacted);
          const bDate = parseDate(b.lastContacted);
          if (!aDate && !bDate) cmp = 0;
          else if (!aDate) cmp = 1;
          else if (!bDate) cmp = -1;
          else cmp = aDate.getTime() - bDate.getTime();
          break;
        }
        case "nextAppointment": {
          const aAppt = nextAppointmentMap.get(a.id);
          const bAppt = nextAppointmentMap.get(b.id);
          if (!aAppt && !bAppt) cmp = 0;
          else if (!aAppt) cmp = 1;
          else if (!bAppt) cmp = -1;
          else cmp = aAppt.localeCompare(bAppt);
          break;
        }
        case "location": {
          const aCity = (a.city ?? "").toLowerCase();
          const bCity = (b.city ?? "").toLowerCase();
          if (!aCity && !bCity) cmp = 0;
          else if (!aCity) cmp = 1;
          else if (!bCity) cmp = -1;
          else cmp = aCity.localeCompare(bCity);
          break;
        }
        case "lastName": {
          cmp = (a.lastName ?? "").localeCompare(b.lastName ?? "");
          break;
        }
        case "pianoType": {
          const aPiano = pianosByCustomer.get(a.id);
          const bPiano = pianosByCustomer.get(b.id);
          const aType = (aPiano?.pianoType ?? a.pianoType ?? "").toLowerCase();
          const bType = (bPiano?.pianoType ?? b.pianoType ?? "").toLowerCase();
          if (!aType && !bType) cmp = 0;
          else if (!aType) cmp = 1;
          else if (!bType) cmp = -1;
          else cmp = aType.localeCompare(bType);
          break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortBy, sortDir, nextAppointmentMap, pianosByCustomer]);

  function handleSortChange(newSort: SortOption) {
    if (newSort === sortBy) {
      setParams({ dir: sortDir === "asc" ? "desc" : "asc" });
    } else {
      setParams({ sort: newSort, dir: DEFAULT_DIRECTIONS[newSort] });
    }
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-7xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3 flex-wrap">
          <div>
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Clients</h1>
            <p className="text-muted-foreground text-sm mt-1">
              {isLoading
                ? "Loading..."
                : `${sorted.length} of ${customers?.length ?? 0} clients`}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center border rounded-md" data-testid="view-toggle">
              <Button
                variant={viewMode === "card" ? "default" : "ghost"}
                size="icon"
                className="h-8 w-8 rounded-r-none"
                onClick={() => setParams({ view: "card" })}
                data-testid="button-view-card"
              >
                <LayoutGrid className="h-4 w-4" />
              </Button>
              <Button
                variant={viewMode === "list" ? "default" : "ghost"}
                size="icon"
                className="h-8 w-8 rounded-l-none"
                onClick={() => setParams({ view: "list" })}
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
      </div>

      <div className="space-y-3 sm:space-y-0 sm:flex sm:items-center sm:gap-3 sm:flex-wrap">
        <div className="relative flex-1 min-w-0 sm:min-w-[200px] sm:max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search clients..."
            value={search}
            onChange={(e) => setParams({ q: e.target.value })}
            className="pl-9"
            data-testid="input-search"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={areaFilter} onValueChange={(v) => setParams({ area: v })}>
            <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-area-filter">
              <MapPin className="h-3.5 w-3.5 mr-1 text-muted-foreground shrink-0" />
              <SelectValue placeholder="All Areas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Areas</SelectItem>
              {Object.keys(SERVICE_AREA_CLUSTERS).map((area) => (
                <SelectItem key={area} value={area}>{area}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1.5 flex-wrap" data-testid="quick-filters">
            {([ 
              { key: "grand", label: "Grand Piano" },
              { key: "upright", label: "Upright Piano" },
              { key: "not-contacted-6mo", label: "Not contacted 6+ mo" },
              { key: "slc-only", label: "SLC only" },
            ] as const).map(({ key, label }) => (
              <Button
                key={key}
                variant={activeFilters.has(key) ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs rounded-full px-3"
                onClick={() => toggleQuickFilter(key)}
                data-testid={`filter-chip-${key}`}
              >
                {label}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-1">
            <Select value={sortBy} onValueChange={(v) => handleSortChange(v as SortOption)}>
              <SelectTrigger className="w-full sm:w-[170px]" data-testid="select-sort">
                <ArrowUpDown className="h-3.5 w-3.5 mr-1 text-muted-foreground shrink-0" />
                <SelectValue placeholder="Sort by..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="lastName">Last Name</SelectItem>
                <SelectItem value="priority">Priority</SelectItem>
                <SelectItem value="lastTuned">Last Tuned</SelectItem>
                <SelectItem value="lastContacted">Last Contacted</SelectItem>
                <SelectItem value="nextAppointment">Next Appointment</SelectItem>
                <SelectItem value="location">Location</SelectItem>
                <SelectItem value="pianoType">Piano Type</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => setParams({ dir: sortDir === "asc" ? "desc" : "asc" })}
              data-testid="button-sort-direction"
            >
              {sortDir === "asc" ? (
                <ArrowUp className="h-4 w-4" />
              ) : (
                <ArrowDown className="h-4 w-4" />
              )}
            </Button>
          </div>
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
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Search className="h-10 w-10 text-muted-foreground/30 mb-3" />
            <h3 className="font-medium text-sm">No clients found</h3>
            <p className="text-sm text-muted-foreground mt-1">
              {search || areaFilter !== "all" || activeFilters.size > 0
                ? "Try adjusting your filters"
                : "Import from Google Sheets or add clients manually"}
            </p>
          </CardContent>
        </Card>
      ) : viewMode === "list" ? (
        <div className="overflow-x-auto border rounded-lg" data-testid="list-view">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b bg-muted/50">
                <th className="text-left px-2 py-2 font-medium text-xs text-muted-foreground w-8">
                  <Star className="h-3 w-3" />
                </th>
                {([
                  ["lastName", "Name"],
                  ["location", "Location"],
                  ["pianoType", "Piano"],
                  ["lastTuned", "Last Tuned"],
                  ["lastContacted", "Contacted"],
                  ["nextAppointment", "Next Appt"],
                ] as [SortOption, string][]).map(([key, label]) => (
                  <th
                    key={key}
                    className="text-left px-3 py-2 font-medium text-xs text-muted-foreground cursor-pointer hover:text-foreground select-none whitespace-nowrap"
                    onClick={() => handleSortChange(key)}
                    data-testid={`th-sort-${key}`}
                  >
                    <span className="inline-flex items-center gap-1">
                      {label}
                      {sortBy === key ? (
                        sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />
                      ) : (
                        <ArrowUpDown className="h-3 w-3 opacity-30" />
                      )}
                    </span>
                  </th>
                ))}
                <th className="text-left px-3 py-2 font-medium text-xs text-muted-foreground whitespace-nowrap">Status</th>
                <th className="text-right px-3 py-2 font-medium text-xs text-muted-foreground whitespace-nowrap">Actions</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((customer) => {
                const primaryPiano = pianosByCustomer.get(customer.id);
                const pianoLabel = primaryPiano && (primaryPiano.make || primaryPiano.pianoType)
                  ? [primaryPiano.make, primaryPiano.pianoType].filter(Boolean).join(" · ")
                  : customer.pianoType;
                const nextAppt = nextAppointmentMap.get(customer.id);

                return (
                  <tr
                    key={customer.id}
                    className="border-b last:border-b-0 hover:bg-muted/30 transition-colors"
                    data-testid={`row-customer-${customer.id}`}
                  >
                    <td className="px-2 py-2 whitespace-nowrap">
                      <button
                        className="flex items-center justify-center"
                        onClick={() => toggleStarMutation.mutate({ id: customer.id, isStarred: !customer.isStarred })}
                        data-testid={`button-star-${customer.id}`}
                      >
                        <Star className={`h-4 w-4 ${customer.isStarred ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground/40"}`} />
                      </button>
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Link href={`/customers/${customer.id}`}>
                        <span className="font-medium hover:underline cursor-pointer" data-testid={`text-customer-name-${customer.id}`}>
                          {customer.firstName} {customer.lastName}
                        </span>
                      </Link>
                      {customer.phone && (
                        <div className="text-xs text-muted-foreground">{formatPhone(customer.phone)}</div>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                      {customer.city}{customer.state ? `, ${customer.state}` : ""}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground" data-testid={`text-piano-${customer.id}`}>
                      {pianoLabel || "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateDisplay(customer.lastTuned)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground" data-testid={`text-contacted-${customer.id}`}>
                      {formatDateDisplay(customer.lastContacted)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs">
                      {nextAppt ? (
                        <span className="text-primary">{nextAppt}</span>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {getStatusBadge(customer.lastTuned)}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7"
                          disabled={markContactedMutation.isPending}
                          onClick={() =>
                            markContactedMutation.mutate({
                              id: customer.id,
                              date: todayFormatted(),
                            })
                          }
                          data-testid={`button-contacted-${customer.id}`}
                        >
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Contacted
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-xs h-7"
                          onClick={() => {
                            setAppointmentCustomerId(customer.id);
                            setAppointmentCustomerName(`${customer.firstName} ${customer.lastName}`);
                            setShowAppointmentDialog(true);
                          }}
                          data-testid={`button-schedule-${customer.id}`}
                        >
                          <Calendar className="h-3 w-3 mr-1" />
                          Appt
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {sorted.map((customer) => {
            const primaryPiano = pianosByCustomer.get(customer.id);
            const pianoLabel = primaryPiano && (primaryPiano.make || primaryPiano.pianoType)
              ? [primaryPiano.make, primaryPiano.pianoType].filter(Boolean).join(" · ")
              : customer.pianoType;
            const nextAppt = nextAppointmentMap.get(customer.id);

            return (
              <Card key={customer.id} className="h-full" data-testid={`card-customer-${customer.id}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <button
                        className="shrink-0"
                        onClick={() => toggleStarMutation.mutate({ id: customer.id, isStarred: !customer.isStarred })}
                        data-testid={`button-star-${customer.id}`}
                      >
                        <Star className={`h-4 w-4 ${customer.isStarred ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground/40"}`} />
                      </button>
                      <Link href={`/customers/${customer.id}`}>
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary text-sm font-semibold cursor-pointer hover:bg-primary/20 transition-colors">
                          {customer.firstName?.[0]}{customer.lastName?.[0]}
                        </div>
                      </Link>
                      <div className="min-w-0">
                        <Link href={`/customers/${customer.id}`}>
                          <p className="font-semibold text-sm truncate hover:underline cursor-pointer" data-testid={`text-customer-name-${customer.id}`}>
                            {customer.firstName} {customer.lastName}
                          </p>
                        </Link>
                        {customer.companyName && (
                          <p className="text-xs text-muted-foreground truncate">{customer.companyName}</p>
                        )}
                      </div>
                    </div>
                    {getStatusBadge(customer.lastTuned)}
                  </div>

                  <div className="space-y-1.5">
                    {pianoLabel && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground" data-testid={`text-piano-${customer.id}`}>
                        <Piano className="h-3 w-3 shrink-0" />
                        <span className="truncate">{pianoLabel}</span>
                      </div>
                    )}
                    {customer.phone && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <Phone className="h-3 w-3 shrink-0" />
                        <span>{formatPhone(customer.phone)}</span>
                      </div>
                    )}
                    {customer.city && (
                      <div className="flex items-center gap-2 text-xs text-muted-foreground">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{customer.city}{customer.state ? `, ${customer.state}` : ""}</span>
                      </div>
                    )}
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <CalendarDays className="h-3 w-3 shrink-0" />
                      <span>Tuned: {formatDateDisplay(customer.lastTuned)}</span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground" data-testid={`text-contacted-${customer.id}`}>
                      <Phone className="h-3 w-3 shrink-0" />
                      <span>Contacted: {formatDateDisplay(customer.lastContacted)}</span>
                    </div>
                    {nextAppt && (
                      <div className="flex items-center gap-2 text-xs text-primary">
                        <Calendar className="h-3 w-3 shrink-0" />
                        <span>Next appt: {nextAppt}</span>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7 flex-1"
                      disabled={markContactedMutation.isPending}
                      onClick={() =>
                        markContactedMutation.mutate({
                          id: customer.id,
                          date: todayFormatted(),
                        })
                      }
                      data-testid={`button-contacted-${customer.id}`}
                    >
                      <CheckCircle className="h-3 w-3 mr-1" />
                      Contacted
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7 flex-1"
                      onClick={() => {
                        setAppointmentCustomerId(customer.id);
                        setAppointmentCustomerName(`${customer.firstName} ${customer.lastName}`);
                        setShowAppointmentDialog(true);
                      }}
                      data-testid={`button-schedule-${customer.id}`}
                    >
                      <Calendar className="h-3 w-3 mr-1" />
                      Appt
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <AppointmentDialog
        open={showAppointmentDialog}
        onOpenChange={setShowAppointmentDialog}
        customerId={appointmentCustomerId}
        customerName={appointmentCustomerName}
      />
    </div>
  );
}
