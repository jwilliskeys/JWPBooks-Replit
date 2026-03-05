import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { apiRequest } from "@/lib/queryClient";
import { queryClient } from "@/lib/queryClient";
import { formatPhone } from "@/lib/utils";
import {
  Phone,
  CalendarDays,
  CheckCircle,
  Search,
  ExternalLink,
  Calendar,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Piano,
  MapPin,
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
    return new Date(year, month, day);
  }
  return null;
}

function getMonthsSince(dateStr: string | null | undefined): number | null {
  const date = parseDate(dateStr);
  if (!date) return null;
  const now = new Date();
  return (now.getFullYear() - date.getFullYear()) * 12 + (now.getMonth() - date.getMonth());
}

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return "Never";
  return dateStr;
}

function todayFormatted(): string {
  const now = new Date();
  return `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;
}

function getOverdueBadge(months: number | null) {
  if (months === null) return <Badge variant="secondary" className="text-xs">No record</Badge>;
  if (months >= 24) return <Badge variant="destructive" className="text-xs">Overdue {months}mo</Badge>;
  if (months >= 12) return <Badge className="text-xs bg-orange-500 dark:bg-orange-600 text-white border-orange-600 dark:border-orange-500">Overdue {months}mo</Badge>;
  if (months >= 6) return <Badge variant="secondary" className="text-xs">Due soon</Badge>;
  return <Badge className="text-xs bg-emerald-600 dark:bg-emerald-700 text-white border-emerald-700 dark:border-emerald-600">Recently Tuned</Badge>;
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

export default function CallCenter() {
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>("priority");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [areaFilter, setAreaFilter] = useState<string>("all");
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

  const pianosByCustomer = new Map<number, PianoType>();
  const customersWithAllInactivePianos = new Set<number>();
  if (pianos) {
    const customerPianoMap = new Map<number, PianoType[]>();
    pianos.forEach((p) => {
      if (!customerPianoMap.has(p.customerId)) customerPianoMap.set(p.customerId, []);
      customerPianoMap.get(p.customerId)!.push(p);
    });
    customerPianoMap.forEach((pianosArr, custId) => {
      const activePiano = pianosArr.find(p => p.isActive !== false);
      if (activePiano) {
        pianosByCustomer.set(custId, activePiano);
      } else if (pianosArr.length > 0) {
        customersWithAllInactivePianos.add(custId);
      }
    });
  }

  const nextAppointmentMap = new Map<number, string>();
  appointments
    ?.filter((a) => a.status === "scheduled")
    .sort((a, b) => a.date.localeCompare(b.date))
    .forEach((a) => {
      if (!nextAppointmentMap.has(a.customerId)) {
        nextAppointmentMap.set(a.customerId, a.date);
      }
    });

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

  function handleSortChange(newSort: SortOption) {
    if (newSort === sortBy) {
      setSortDir(d => d === "asc" ? "desc" : "asc");
    } else {
      setSortBy(newSort);
      setSortDir(DEFAULT_DIRECTIONS[newSort]);
    }
  }

  function matchesAreaFilter(customer: Customer): boolean {
    if (areaFilter === "all") return true;

    const isAreaKey = areaFilter in SERVICE_AREA_CLUSTERS;
    if (isAreaKey) {
      const cities = SERVICE_AREA_CLUSTERS[areaFilter];
      const custCity = (customer.city ?? "").trim().toLowerCase();
      if (custCity === "slc") return cities.some(c => c.toLowerCase() === "salt lake city");
      return cities.some(c => c.toLowerCase() === custCity);
    }

    const custCity = (customer.city ?? "").trim().toLowerCase();
    const filterCity = areaFilter.toLowerCase();
    if (custCity === "slc" && filterCity === "salt lake city") return true;
    return custCity === filterCity;
  }

  const sorted = customers
    ?.filter((c) => {
      if (customersWithAllInactivePianos.has(c.id)) return false;
      if (!matchesAreaFilter(c)) return false;
      if (!search) return true;
      const s = search.toLowerCase();
      return (
        `${c.firstName} ${c.lastName}`.toLowerCase().includes(s) ||
        c.phone?.includes(search) ||
        c.city?.toLowerCase().includes(s) ||
        c.pianoType?.toLowerCase().includes(s)
      );
    })
    .sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "priority": {
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
          const aType = (a.pianoType ?? "").toLowerCase();
          const bType = (b.pianoType ?? "").toLowerCase();
          if (!aType && !bType) cmp = 0;
          else if (!aType) cmp = 1;
          else if (!bType) cmp = -1;
          else cmp = aType.localeCompare(bType);
          break;
        }
        default:
          cmp = 0;
      }
      return sortDir === "asc" ? cmp : -cmp;
    }) ?? [];

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-5xl mx-auto">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Call Center</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Clients sorted by who needs to be contacted next
        </p>
      </div>

      <div className="space-y-3">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name, phone, city, or piano type..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
            data-testid="input-call-search"
          />
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={areaFilter} onValueChange={setAreaFilter}>
            <SelectTrigger className="w-full sm:w-[200px]" data-testid="select-area-filter">
              <MapPin className="h-3.5 w-3.5 mr-1 text-muted-foreground shrink-0" />
              <SelectValue placeholder="Filter by area..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Areas</SelectItem>
              {Object.entries(SERVICE_AREA_CLUSTERS).map(([area, cities]) => (
                <SelectGroup key={area}>
                  <SelectLabel className="text-xs font-semibold">{area}</SelectLabel>
                  <SelectItem value={area} className="font-medium">All {area}</SelectItem>
                  {cities.filter(c => c !== "SLC").map((city) => (
                    <SelectItem key={city} value={city} className="pl-6">{city}</SelectItem>
                  ))}
                </SelectGroup>
              ))}
            </SelectContent>
          </Select>

          <div className="flex items-center gap-1 flex-1 sm:flex-none">
            <Select value={sortBy} onValueChange={(v) => handleSortChange(v as SortOption)}>
              <SelectTrigger className="w-full sm:w-[180px]" data-testid="select-call-sort">
                <ArrowUpDown className="h-3.5 w-3.5 mr-1 text-muted-foreground shrink-0" />
                <SelectValue placeholder="Sort by..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="priority">Priority (Default)</SelectItem>
                <SelectItem value="lastTuned">Last Tuned</SelectItem>
                <SelectItem value="lastContacted">Last Contacted</SelectItem>
                <SelectItem value="nextAppointment">Next Appointment</SelectItem>
                <SelectItem value="location">Location</SelectItem>
                <SelectItem value="lastName">Last Name</SelectItem>
                <SelectItem value="pianoType">Piano Type</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              size="icon"
              className="h-9 w-9 shrink-0"
              onClick={() => setSortDir(d => d === "asc" ? "desc" : "asc")}
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
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-20 w-full rounded-lg" />
          ))}
        </div>
      ) : sorted.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <Phone className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="text-sm">No clients found</p>
        </div>
      ) : (
        <div className="space-y-2" data-testid="call-list">
          <p className="text-xs text-muted-foreground">{sorted.length} clients</p>
          {sorted.map((customer) => {
            const tunedMonths = getMonthsSince(customer.lastTuned);
            const primaryPiano = pianosByCustomer.get(customer.id);
            const nextAppt = nextAppointmentMap.get(customer.id);
            return (
              <div
                key={customer.id}
                className="border rounded-lg p-3 sm:p-4 hover:bg-muted/30 transition-colors"
                data-testid={`call-row-${customer.id}`}
              >
                <div className="flex items-start justify-between gap-2 mb-2">
                  <div className="min-w-0 flex-1">
                    <Link href={`/customers/${customer.id}`}>
                      <span className="text-sm font-medium hover:underline cursor-pointer flex items-center gap-1" data-testid={`call-name-${customer.id}`}>
                        {customer.firstName} {customer.lastName}
                        <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
                      </span>
                    </Link>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5 flex-wrap">
                      {customer.phone && (
                        <span className="flex items-center gap-1">
                          <Phone className="h-3 w-3 shrink-0" /> {formatPhone(customer.phone)}
                        </span>
                      )}
                      {customer.city && <span>{customer.city}, {customer.state}</span>}
                      {primaryPiano && (primaryPiano.make || primaryPiano.pianoType) && (
                        <span className="flex items-center gap-1" data-testid={`call-piano-${customer.id}`}>
                          <Piano className="h-3 w-3 shrink-0" />
                          {[primaryPiano.make, primaryPiano.pianoType].filter(Boolean).join(" · ")}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0">
                    {getOverdueBadge(tunedMonths)}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-3 sm:gap-4 text-xs text-muted-foreground flex-wrap">
                    <span className="flex items-center gap-1">
                      <CalendarDays className="h-3 w-3 shrink-0" />
                      Tuned: {formatDate(customer.lastTuned)}
                    </span>
                    <span data-testid={`call-contacted-${customer.id}`}>
                      Contacted: {formatDate(customer.lastContacted)}
                    </span>
                    {nextAppt && (
                      <span className="flex items-center gap-1 text-primary">
                        <Calendar className="h-3 w-3 shrink-0" />
                        Next: {nextAppt}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
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
                </div>
              </div>
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
