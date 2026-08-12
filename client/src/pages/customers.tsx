import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useSearch, useLocation } from "wouter";
import { formatPhone, cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
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
  Pin,
  Pencil,
  X,
  ChevronDown,
  Users,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import type { Customer, Appointment, Piano as PianoType } from "@shared/schema";
import { AppointmentDialog } from "@/components/appointment-dialog";
import { SERVICE_AREA_CLUSTERS, getServiceArea } from "@/lib/scheduling";
import { useIncrementalList } from "@/hooks/use-incremental-list";
import { clientName, clientSearchText, clientContactLine, clientInitials } from "@shared/client-name";

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

function getStatusBadge(lastTuned: string | null | undefined, lastContacted?: string | null | undefined) {
  const tunedMonths = getMonthsSince(lastTuned);
  const contactedMonths = getMonthsSince(lastContacted);
  const tunedScore = tunedMonths ?? Infinity;
  const contactedScore = contactedMonths ?? Infinity;
  const score = Math.max(tunedScore, contactedScore);
  const base = "no-default-active-elevate text-xs font-semibold border";
  if (tunedScore === Infinity && contactedScore === Infinity) {
    return <Badge className={`${base} bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800`}>Never contacted</Badge>;
  }
  if (tunedScore === Infinity) {
    return <Badge className={`${base} bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800`}>Never tuned</Badge>;
  }
  if (score >= 30) {
    return <Badge className={`${base} bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-300 dark:border-red-800`}>Overdue {tunedMonths}mo</Badge>;
  }
  if (score >= 18) {
    return <Badge className={`${base} bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/40 dark:text-orange-300 dark:border-orange-800`}>Overdue {tunedMonths}mo</Badge>;
  }
  if (score >= 12) {
    return <Badge className={`${base} bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-300 dark:border-amber-800`}>Overdue {tunedMonths}mo</Badge>;
  }
  if (score >= 6) {
    return <Badge className={`${base} bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800`}>Due soon</Badge>;
  }
  return <Badge className={`${base} bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800`}>Up to date</Badge>;
}

/** Compact status dot + 2-letter state — matches pianos page style. */
function StatusDot({ active, state }: { active: boolean; state: string | null | undefined }) {
  const stateLabel = state ? state.trim().toUpperCase().slice(0, 2) : null;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${
        active ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"
      }`} />
      {stateLabel && (
        <span className="text-[10px] font-semibold text-muted-foreground tracking-wide">
          {stateLabel}
        </span>
      )}
    </span>
  );
}

// ── Inline pinned-note editor ─────────────────────────────────────────────────
interface PinnedNoteProps {
  customerId: number;
  value: string | null | undefined;
  onSave: (id: number, note: string) => void;
  isSaving: boolean;
}

function PinnedNoteCell({ customerId, value, onSave, isSaving }: PinnedNoteProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value ?? "");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => { if (editing) setTimeout(() => inputRef.current?.focus(), 30); }, [editing]);

  function commit() {
    onSave(customerId, draft.trim());
    setEditing(false);
  }

  function cancel() {
    setDraft(value ?? "");
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-1 min-w-[160px]">
        <Textarea
          ref={inputRef}
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); commit(); } if (e.key === "Escape") cancel(); }}
          className="text-xs min-h-[56px] resize-none p-1.5"
          placeholder="Add a pinned note…"
        />
        <div className="flex gap-1">
          <Button size="sm" className="h-6 text-xs px-2" disabled={isSaving} onClick={commit}>Save</Button>
          <Button size="sm" variant="ghost" className="h-6 text-xs px-1" onClick={cancel}><X className="h-3 w-3" /></Button>
        </div>
      </div>
    );
  }

  if (value) {
    return (
      <div className="flex items-start gap-1 group max-w-[200px]">
        <Pin className="h-3 w-3 text-amber-500 shrink-0 mt-0.5" />
        <span className="text-xs text-foreground line-clamp-2 leading-snug flex-1">{value}</span>
        <button onClick={() => setEditing(true)} className="opacity-0 group-hover:opacity-100 shrink-0 transition-opacity">
          <Pencil className="h-3 w-3 text-muted-foreground hover:text-foreground" />
        </button>
      </div>
    );
  }

  return (
    <button
      onClick={() => setEditing(true)}
      className="text-xs text-muted-foreground/50 hover:text-muted-foreground flex items-center gap-1 transition-colors"
    >
      <Pin className="h-3 w-3" />
      Add note
    </button>
  );
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

const SORT_LABELS: Record<SortOption, string> = {
  priority: "Next Action Required",
  lastName: "Last Name",
  lastTuned: "Last Tuned",
  lastContacted: "Last Contacted",
  nextAppointment: "Next Appointment",
  location: "Location",
  pianoType: "Piano Type",
};

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
  q: "", stateTab: "MA", area: "all", filter: "", view: "list", sort: "priority", dir: "desc",
};

const UT_AREAS = ["Davis County", "Salt Lake City", "South Jordan"] as const;
type UtArea = typeof UT_AREAS[number];

const QUICK_FILTERS = [
  { key: "grand", label: "Grand Piano" },
  { key: "upright", label: "Upright Piano" },
  { key: "not-contacted-6mo", label: "Not contacted 6+ mo" },
  { key: "slc-only", label: "SLC only" },
  { key: "inactive", label: "Inactive Piano" },
] as const;

export default function Customers() {
  const rawSearch = useSearch();
  const [, navigate] = useLocation();
  const params = useMemo(() => new URLSearchParams(rawSearch), [rawSearch]);

  const search = params.get("q") ?? "";
  const stateTab = (params.get("stateTab") ?? "MA") as "MA" | "UT";
  const areaFilter = params.get("area") ?? "all";
  const quickFiltersRaw = params.get("filter") ?? "";
  const activeFilters = useMemo(
    () => new Set(quickFiltersRaw ? quickFiltersRaw.split(",") : []),
    [quickFiltersRaw]
  );
  const viewMode = (params.get("view") ?? "list") as "card" | "list";
  const sortBy = (params.get("sort") ?? "priority") as SortOption;
  const sortDir = (params.get("dir") ?? "desc") as "asc" | "desc";

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
    if (next.has(key)) next.delete(key); else next.add(key);
    const joined = Array.from(next).join(",");
    const p = new URLSearchParams(rawSearch);
    if (joined) p.set("filter", joined); else p.delete("filter");
    const qs = p.toString();
    navigate(`/customers${qs ? `?${qs}` : ""}`, { replace: true });
  }

  const [showAppointmentDialog, setShowAppointmentDialog] = useState(false);
  const [appointmentCustomerId, setAppointmentCustomerId] = useState<number | undefined>(undefined);
  const [appointmentCustomerName, setAppointmentCustomerName] = useState<string>("");
  const { toast } = useToast();

  const { data: customers, isLoading } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: appointments } = useQuery<Appointment[]>({ queryKey: ["/api/appointments"] });
  const { data: pianos } = useQuery<PianoType[]>({ queryKey: ["/api/pianos"] });

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
          map.set(custId, pianosArr[0]);
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
      .forEach((a) => { if (!map.has(a.customerId)) map.set(a.customerId, a.date); });
    return map;
  }, [appointments]);

  // Optimistic: flip the row instantly, roll back if the server rejects it.
  const markContactedMutation = useMutation({
    mutationFn: ({ id, date }: { id: number; date: string }) =>
      apiRequest("PATCH", `/api/customers/${id}`, { lastContacted: date }),
    onMutate: async ({ id, date }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/customers"] });
      const prev = queryClient.getQueryData<Customer[]>(["/api/customers"]);
      queryClient.setQueryData<Customer[]>(["/api/customers"], (old) =>
        old?.map((c) => (c.id === id ? { ...c, lastContacted: date } : c))
      );
      return { prev };
    },
    onSuccess: () => toast({ title: "Marked as contacted" }),
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["/api/customers"], ctx.prev);
      toast({ title: "Failed to update", variant: "destructive" });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/customers"] }),
  });

  const saveNoteMutation = useMutation({
    mutationFn: ({ id, personalNotes }: { id: number; personalNotes: string }) =>
      apiRequest("PATCH", `/api/customers/${id}`, { personalNotes }),
    onMutate: async ({ id, personalNotes }) => {
      await queryClient.cancelQueries({ queryKey: ["/api/customers"] });
      const prev = queryClient.getQueryData<Customer[]>(["/api/customers"]);
      queryClient.setQueryData<Customer[]>(["/api/customers"], (old) =>
        old?.map((c) => (c.id === id ? { ...c, personalNotes } : c))
      );
      return { prev };
    },
    onSuccess: () => toast({ title: "Note saved" }),
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(["/api/customers"], ctx.prev);
      toast({ title: "Failed to save note", variant: "destructive" });
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["/api/customers"] }),
  });

  const filtered = useMemo(() => {
    if (!customers) return [];
    return customers.filter((c) => {
      const custArea = getServiceArea(c.city ?? "", c.state ?? "");
      if (stateTab === "MA") {
        if (custArea !== "Boston") return false;
      } else {
        // UT: always restrict to UT areas, then optionally sub-filter
        if (!(UT_AREAS as readonly string[]).includes(custArea)) return false;
        if (areaFilter !== "all" && custArea !== areaFilter) return false;
      }

      const searchLower = search.toLowerCase();
      const matchesSearch =
        !search ||
        clientSearchText(c).includes(searchLower) ||
        c.email?.toLowerCase().includes(searchLower) ||
        c.phone?.includes(search) ||
        c.pianoType?.toLowerCase().includes(searchLower) ||
        c.city?.toLowerCase().includes(searchLower) ||
        c.companyName?.toLowerCase().includes(searchLower);

      if (customersWithAllInactivePianos.has(c.id) && !activeFilters.has("inactive")) return false;

      let matchesQuickFilter = true;
      if (activeFilters.size > 0) {
        const piano = pianosByCustomer.get(c.id);
        const pianoTypeStr = (piano?.pianoType ?? c.pianoType ?? "").toLowerCase();
        if (activeFilters.has("grand") && !pianoTypeStr.includes("grand")) matchesQuickFilter = false;
        if (activeFilters.has("upright") && !pianoTypeStr.includes("upright") && !pianoTypeStr.includes("spinet")) matchesQuickFilter = false;
        if (activeFilters.has("not-contacted-6mo")) {
          const m = getMonthsSince(c.lastContacted);
          if (!(m === null || m >= 6)) matchesQuickFilter = false;
        }
        if (activeFilters.has("slc-only")) {
          const custArea = getServiceArea(c.city ?? "", c.state ?? "");
          if (!["Davis County", "Salt Lake City", "South Jordan"].includes(custArea)) matchesQuickFilter = false;
        }
        if (activeFilters.has("inactive") && !customersWithAllInactivePianos.has(c.id)) matchesQuickFilter = false;
      }

      return matchesSearch && matchesQuickFilter;
    });
  }, [customers, search, stateTab, areaFilter, activeFilters, customersWithAllInactivePianos, pianosByCustomer]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case "priority": {
          const aScore = Math.max(getMonthsSince(a.lastContacted) ?? Infinity, getMonthsSince(a.lastTuned) ?? Infinity);
          const bScore = Math.max(getMonthsSince(b.lastContacted) ?? Infinity, getMonthsSince(b.lastTuned) ?? Infinity);
          if (aScore === Infinity && bScore === Infinity) cmp = 0;
          else if (aScore === Infinity) cmp = 1;
          else if (bScore === Infinity) cmp = -1;
          else cmp = aScore - bScore;
          break;
        }
        case "lastTuned": {
          const aDate = parseDate(a.lastTuned), bDate = parseDate(b.lastTuned);
          if (!aDate && !bDate) cmp = 0; else if (!aDate) cmp = -1; else if (!bDate) cmp = 1;
          else cmp = aDate.getTime() - bDate.getTime();
          break;
        }
        case "lastContacted": {
          const aDate = parseDate(a.lastContacted), bDate = parseDate(b.lastContacted);
          if (!aDate && !bDate) cmp = 0; else if (!aDate) cmp = -1; else if (!bDate) cmp = 1;
          else cmp = aDate.getTime() - bDate.getTime();
          break;
        }
        case "nextAppointment": {
          const aA = nextAppointmentMap.get(a.id), bA = nextAppointmentMap.get(b.id);
          if (!aA && !bA) cmp = 0; else if (!aA) cmp = 1; else if (!bA) cmp = -1;
          else cmp = aA.localeCompare(bA);
          break;
        }
        case "location":
          cmp = (a.city ?? "").localeCompare(b.city ?? ""); break;
        case "lastName":
          cmp = (a.lastName ?? "").localeCompare(b.lastName ?? ""); break;
        case "pianoType": {
          const aP = pianosByCustomer.get(a.id), bP = pianosByCustomer.get(b.id);
          cmp = (aP?.pianoType ?? a.pianoType ?? "").localeCompare(bP?.pianoType ?? b.pianoType ?? ""); break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortBy, sortDir, nextAppointmentMap, pianosByCustomer]);

  // Incremental rendering: keeps the DOM small on big lists so scrolling
  // stays smooth. Window resets when filters/sort/search change.
  const listKey = `${stateTab}|${areaFilter}|${quickFiltersRaw}|${search}|${sortBy}|${sortDir}|${viewMode}`;
  const { visible: visibleCustomers, hasMore, sentinelRef } = useIncrementalList(sorted, listKey);

  function handleSortChange(newSort: SortOption) {
    if (newSort === sortBy) {
      setParams({ dir: sortDir === "asc" ? "desc" : "asc" });
    } else {
      setParams({ sort: newSort, dir: DEFAULT_DIRECTIONS[newSort] });
    }
  }

  const filterLabel = activeFilters.size > 0
    ? `Filter (${activeFilters.size})`
    : "Filter";

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Header — matches pianos page layout */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <h1 className="text-2xl font-bold tracking-tight flex-1">Clients</h1>
        <div className="flex items-center gap-2">
          <div className="relative flex-1 sm:w-64">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search clients…"
              value={search}
              onChange={(e) => setParams({ q: e.target.value })}
              className="pl-8 h-8 text-sm"
              data-testid="input-search"
            />
          </div>
          <Link href="/customers/new">
            <Button size="sm" className="h-8 text-xs gap-1 shrink-0" data-testid="button-add-customer">
              <UserPlus className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Add Client</span>
            </Button>
          </Link>
        </div>
      </div>

      {/* Controls row — matches pianos page style */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        {/* State tab switcher */}
        <div className="flex rounded-md border overflow-hidden h-8 shrink-0" data-testid="state-tab-switcher">
          {(["MA", "UT"] as const).map((st) => (
            <button
              key={st}
              onClick={() => setParams({ stateTab: st, area: "all" })}
              className={cn(
                "px-3 text-xs font-medium transition-colors",
                stateTab === st
                  ? "bg-foreground text-background"
                  : "bg-background text-muted-foreground hover:text-foreground"
              )}
            >
              {st}
            </button>
          ))}
        </div>

        {/* UT sub-area pills — only shown when UT is active */}
        {stateTab === "UT" && (
          <>
            {(["all", ...UT_AREAS] as const).map((area) => (
              <Button
                key={area}
                variant={areaFilter === area ? "default" : "outline"}
                size="sm"
                className="h-8 text-xs"
                onClick={() => setParams({ area })}
                data-testid={`button-ut-area-${area}`}
              >
                {area === "all" ? "All UT" : area}
              </Button>
            ))}
          </>
        )}

        {/* Quick filters */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant={activeFilters.size > 0 ? "default" : "outline"}
              size="sm"
              className="h-8 text-xs gap-1"
              data-testid="button-quick-filter-dropdown"
            >
              {filterLabel}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-52 p-1" data-testid="quick-filters">
            {QUICK_FILTERS.map(({ key, label }) => (
              <div
                key={key}
                className="flex items-center gap-2 rounded px-2 py-1.5 hover:bg-muted cursor-pointer"
                onClick={() => toggleQuickFilter(key)}
                data-testid={`filter-chip-${key}`}
              >
                <Checkbox
                  id={`filter-${key}`}
                  checked={activeFilters.has(key)}
                  onClick={(e) => e.stopPropagation()}
                  onCheckedChange={() => toggleQuickFilter(key)}
                />
                <Label htmlFor={`filter-${key}`} className="text-xs cursor-pointer select-none">
                  {label}
                </Label>
              </div>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Count */}
        {!isLoading && (
          <span className="text-sm text-muted-foreground" data-testid="text-clients-count">
            {sorted.length} client{sorted.length !== 1 ? "s" : ""}
          </span>
        )}

        {/* Right side */}
        <div className="ml-auto flex items-center gap-2">
          {/* View toggle */}
          <div className="flex items-center border rounded-md" data-testid="view-toggle">
            <Button
              variant={viewMode === "list" ? "default" : "ghost"}
              size="icon"
              className="h-8 w-8 rounded-r-none"
              onClick={() => setParams({ view: "list" })}
              data-testid="button-view-list"
            >
              <List className="h-3.5 w-3.5" />
            </Button>
            <Button
              variant={viewMode === "card" ? "default" : "ghost"}
              size="icon"
              className="h-8 w-8 rounded-l-none"
              onClick={() => setParams({ view: "card" })}
              data-testid="button-view-card"
            >
              <LayoutGrid className="h-3.5 w-3.5" />
            </Button>
          </div>

          {/* Sort */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1" data-testid="select-sort">
                Sort: {SORT_LABELS[sortBy]}
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(Object.entries(SORT_LABELS) as [SortOption, string][]).map(([key, label]) => (
                <DropdownMenuItem
                  key={key}
                  onClick={() => handleSortChange(key)}
                  className={sortBy === key ? "font-medium" : ""}
                  data-testid={`sort-option-${key}`}
                >
                  {label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          <Button
            variant="outline"
            size="icon"
            className="h-8 w-8"
            onClick={() => setParams({ dir: sortDir === "asc" ? "desc" : "asc" })}
            data-testid="button-sort-direction"
          >
            {sortDir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* Content */}
      {isLoading ? (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="border-b last:border-0">
                  <td className="px-4 py-3"><Skeleton className="h-4 w-10" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-36" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-24" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                  <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : sorted.length === 0 ? (
        <div className="border rounded-lg overflow-hidden">
          <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
            <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">
              {search || activeFilters.size > 0
                ? "No clients match your search or filter."
                : "No clients yet — add your first client to get started."}
            </p>
          </div>
        </div>
      ) : viewMode === "list" ? (
        <div className="border rounded-lg overflow-hidden" data-testid="list-view">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="border-b">
                  {/* Status dot + state — replaces star */}
                  <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-xs whitespace-nowrap w-16">
                    Status
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
                      className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-xs whitespace-nowrap cursor-pointer hover:text-foreground select-none"
                      onClick={() => handleSortChange(key)}
                      data-testid={`th-sort-${key}`}
                    >
                      <span className="inline-flex items-center gap-1">
                        {label}
                        {sortBy === key
                          ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
                          : <ArrowUpDown className="h-3 w-3 opacity-30" />}
                      </span>
                    </th>
                  ))}
                  <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-xs whitespace-nowrap hidden lg:table-cell">
                    <span className="flex items-center gap-1"><Pin className="h-3 w-3 text-amber-500" />Note</span>
                  </th>
                  <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-xs whitespace-nowrap">Urgency</th>
                  <th className="text-right px-4 py-2.5 font-semibold text-muted-foreground text-xs whitespace-nowrap">Actions</th>
                </tr>
              </thead>
              <tbody>
                {visibleCustomers.map((customer) => {
                  const primaryPiano = pianosByCustomer.get(customer.id);
                  const pianoLabel = primaryPiano && (primaryPiano.make || primaryPiano.pianoType)
                    ? [primaryPiano.make, primaryPiano.pianoType].filter(Boolean).join(" · ")
                    : customer.pianoType;
                  const nextAppt = nextAppointmentMap.get(customer.id);
                  const isActive = !customersWithAllInactivePianos.has(customer.id);

                  return (
                    <tr
                      key={customer.id}
                      className="border-b last:border-b-0 hover:bg-muted/40 cursor-pointer transition-colors"
                      onClick={() => navigate(`/customers/${customer.id}`)}
                      data-testid={`row-customer-${customer.id}`}
                    >
                      <td className="px-4 py-3">
                        <StatusDot active={isActive} state={customer.state} />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span className="font-medium" data-testid={`text-customer-name-${customer.id}`}>
                          {clientName(customer)}
                        </span>
                        {clientContactLine(customer) && (
                          <div className="text-xs text-muted-foreground">{clientContactLine(customer)}</div>
                        )}
                        {customer.phone && (
                          <div className="text-xs text-muted-foreground">{formatPhone(customer.phone)}</div>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                        {customer.city}{customer.state ? `, ${customer.state}` : ""}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground" data-testid={`text-piano-${customer.id}`}>
                        {pianoLabel || <span className="opacity-40">—</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground">
                        {formatDateDisplay(customer.lastTuned)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs text-muted-foreground" data-testid={`text-contacted-${customer.id}`}>
                        {formatDateDisplay(customer.lastContacted)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-xs">
                        {nextAppt
                          ? <span className="text-primary">{nextAppt}</span>
                          : <span className="text-muted-foreground opacity-40">—</span>}
                      </td>
                      <td className="px-4 py-3 hidden lg:table-cell" onClick={(e) => e.stopPropagation()}>
                        <PinnedNoteCell
                          customerId={customer.id}
                          value={customer.personalNotes}
                          onSave={(id, note) => saveNoteMutation.mutate({ id, personalNotes: note })}
                          isSaving={saveNoteMutation.isPending}
                        />
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        {customersWithAllInactivePianos.has(customer.id)
                          ? <Badge variant="secondary" className="no-default-active-elevate text-xs">Inactive</Badge>
                          : getStatusBadge(customer.lastTuned, customer.lastContacted)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7"
                            disabled={markContactedMutation.isPending}
                            onClick={() => markContactedMutation.mutate({ id: customer.id, date: todayFormatted() })}
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
                              setAppointmentCustomerName(clientName(customer));
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
        </div>
      ) : (
        /* Card view */
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visibleCustomers.map((customer) => {
            const primaryPiano = pianosByCustomer.get(customer.id);
            const pianoLabel = primaryPiano && (primaryPiano.make || primaryPiano.pianoType)
              ? [primaryPiano.make, primaryPiano.pianoType].filter(Boolean).join(" · ")
              : customer.pianoType;
            const nextAppt = nextAppointmentMap.get(customer.id);
            const isActive = !customersWithAllInactivePianos.has(customer.id);

            return (
              <Card key={customer.id} className="h-full" data-testid={`card-customer-${customer.id}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-3 min-w-0">
                      <Link href={`/customers/${customer.id}`}>
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary text-sm font-semibold cursor-pointer hover:bg-primary/20 transition-colors">
                          {clientInitials(customer)}
                        </div>
                      </Link>
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <StatusDot active={isActive} state={customer.state} />
                          <Link href={`/customers/${customer.id}`}>
                            <p className="font-semibold text-sm truncate hover:underline cursor-pointer" data-testid={`text-customer-name-${customer.id}`}>
                              {clientName(customer)}
                            </p>
                          </Link>
                        </div>
                        {clientContactLine(customer) && (
                          <p className="text-xs text-muted-foreground truncate">{clientContactLine(customer)}</p>
                        )}
                      </div>
                    </div>
                    {customersWithAllInactivePianos.has(customer.id)
                      ? <Badge variant="secondary" className="no-default-active-elevate text-xs">Inactive</Badge>
                      : getStatusBadge(customer.lastTuned, customer.lastContacted)}
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

                  <div className="pt-1">
                    <PinnedNoteCell
                      customerId={customer.id}
                      value={customer.personalNotes}
                      onSave={(id, note) => saveNoteMutation.mutate({ id, personalNotes: note })}
                      isSaving={saveNoteMutation.isPending}
                    />
                  </div>

                  <div className="flex items-center gap-1 pt-1">
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs h-7 flex-1"
                      disabled={markContactedMutation.isPending}
                      onClick={() => markContactedMutation.mutate({ id: customer.id, date: todayFormatted() })}
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
                        setAppointmentCustomerName(clientName(customer));
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

      {/* Sentinel: when this scrolls into view, the next chunk of rows renders */}
      {hasMore && <div ref={sentinelRef} className="h-8" aria-hidden="true" />}

      <AppointmentDialog
        open={showAppointmentDialog}
        onOpenChange={setShowAppointmentDialog}
        customerId={appointmentCustomerId}
        customerName={appointmentCustomerName}
      />
    </div>
  );
}
