import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation, useSearch } from "wouter";
import { useIncrementalList } from "@/hooks/use-incremental-list";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Search, ChevronDown, ArrowUpDown, ArrowUp, ArrowDown, Music2 } from "lucide-react";
import type { Piano, Customer } from "@shared/schema";

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
  const t = new Date(dateStr);
  return isNaN(t.getTime()) ? null : t;
}

function getMonthsSince(dateStr: string | null | undefined): number | null {
  const d = parseDate(dateStr);
  if (!d) return null;
  const now = new Date();
  return (now.getFullYear() - d.getFullYear()) * 12 + (now.getMonth() - d.getMonth());
}

function formatLastTuned(dateStr: string | null | undefined): string {
  if (!dateStr) return "Never";
  return dateStr;
}

/** Tier score for "warm leads" sort. Lower = shown first. */
function warmLeadsTier(months: number | null): number {
  if (months === null) return 5; // never tuned — bottom
  if (months >= 12 && months <= 18) return 0; // prime orange zone — top
  if (months >= 10 && months < 12) return 1; // yellow / due soon
  if (months > 18 && months < 24) return 2; // slightly past prime
  if (months < 10) return 3; // too fresh
  return 4; // 24+ months deeply overdue — low priority
}

/** Background class for a row based on tuning age. */
function getRowTierClass(months: number | null, isActive: boolean | null): string {
  if (isActive === false) return "";
  if (months === null) return "";
  if (months >= 24) return "bg-muted/30 opacity-75"; // deeply overdue — muted
  if (months >= 12 && months <= 18) return "bg-orange-50 dark:bg-orange-950/20"; // orange prime
  if (months >= 10 && months < 12) return "bg-yellow-50 dark:bg-yellow-950/20"; // yellow due soon
  return "";
}

/** Compact status indicator: colored dot + state abbreviation. */
function StatusDot({ isActive, state }: { isActive: boolean | null; state: string | null | undefined }) {
  const active = isActive !== false;
  const stateLabel = state ? state.trim().toUpperCase().slice(0, 2) : null;
  return (
    <span className="inline-flex items-center gap-1.5">
      <span
        className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${
          active ? "bg-emerald-500" : "bg-gray-300 dark:bg-gray-600"
        }`}
        aria-label={active ? "Active" : "Inactive"}
      />
      {stateLabel && (
        <span className="text-[10px] font-semibold text-muted-foreground tracking-wide">
          {stateLabel}
        </span>
      )}
    </span>
  );
}

type FilterKey =
  | "all"
  | "active"
  | "inactive"
  | "not-tuned-24"
  | "not-tuned-36"
  | "not-tuned-60"
  | "never-tuned"
  | "grand"
  | "upright";

type SortKey = "warm-leads" | "make" | "last-tuned" | "client" | "created" | "type";
type SortDir = "asc" | "desc";

const FILTER_LABELS: Record<FilterKey, string> = {
  all: "All Pianos",
  active: "Active",
  inactive: "Inactive",
  "not-tuned-24": "Not tuned 24+ months",
  "not-tuned-36": "Not tuned 36+ months",
  "not-tuned-60": "Not tuned 60+ months",
  "never-tuned": "Never tuned",
  grand: "Grand pianos",
  upright: "Upright pianos",
};

const SORT_LABELS: Record<SortKey, string> = {
  "warm-leads": "Warm Leads First",
  make: "Make & Model",
  "last-tuned": "Last Tuned",
  client: "Client",
  created: "Date Created",
  type: "Piano Type",
};

// URL-persisted params (like the Clients page) so filters/sort/search survive
// navigating into a piano and back.
const PIANOS_PARAM_DEFAULTS: Record<string, string> = {
  q: "", filter: "active", sort: "warm-leads", dir: "asc",
};

export default function PianosPage() {
  const [, navigate] = useLocation();
  const rawSearch = useSearch();
  const params = useMemo(() => new URLSearchParams(rawSearch), [rawSearch]);

  const search = params.get("q") ?? "";
  const filter = (params.get("filter") ?? "active") as FilterKey;
  const sortKey = (params.get("sort") ?? "warm-leads") as SortKey;
  const sortDir = (params.get("dir") ?? "asc") as SortDir;

  function setParams(updates: Record<string, string>) {
    const p = new URLSearchParams(rawSearch);
    for (const [key, value] of Object.entries(updates)) {
      if (value === (PIANOS_PARAM_DEFAULTS[key] ?? "")) p.delete(key);
      else p.set(key, value);
    }
    const qs = p.toString();
    navigate(`/pianos${qs ? `?${qs}` : ""}`, { replace: true });
  }

  const setSearch = (q: string) => setParams({ q });
  const setFilter = (f: FilterKey) => setParams({ filter: f });

  const { data: pianos, isLoading } = useQuery<Piano[]>({
    queryKey: ["/api/pianos"],
  });

  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const customerMap = useMemo(
    () => new Map((customers ?? []).map((c) => [c.id, c])),
    [customers]
  );

  function applyFilter(piano: Piano): boolean {
    const months = getMonthsSince(piano.lastTuned);
    const type = (piano.pianoType ?? "").toLowerCase();
    switch (filter) {
      case "all": return true;
      case "active": return piano.isActive !== false;
      case "inactive": return piano.isActive === false;
      case "not-tuned-24": return months === null || months >= 24;
      case "not-tuned-36": return months === null || months >= 36;
      case "not-tuned-60": return months === null || months >= 60;
      case "never-tuned": return !piano.lastTuned;
      case "grand": return type.includes("grand");
      case "upright": return type.includes("upright");
      default: return true;
    }
  }

  const filtered = useMemo(() => {
    if (!pianos) return [];
    const q = search.trim().toLowerCase();

    let result = pianos.filter((p) => {
      if (!applyFilter(p)) return false;
      if (!q) return true;
      const customer = customerMap.get(p.customerId);
      const clientName = customer
        ? `${customer.firstName} ${customer.lastName}`.toLowerCase()
        : "";
      return (
        (p.make ?? "").toLowerCase().includes(q) ||
        (p.model ?? "").toLowerCase().includes(q) ||
        (p.pianoType ?? "").toLowerCase().includes(q) ||
        (p.serialNumber ?? "").toLowerCase().includes(q) ||
        (p.location ?? "").toLowerCase().includes(q) ||
        (p.year ?? "").toLowerCase().includes(q) ||
        clientName.includes(q)
      );
    });

    result = result.slice().sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "warm-leads": {
          const ma = getMonthsSince(a.lastTuned);
          const mb = getMonthsSince(b.lastTuned);
          const ta = warmLeadsTier(ma);
          const tb = warmLeadsTier(mb);
          if (ta !== tb) { cmp = ta - tb; break; }
          // Within same tier, sort most overdue first
          if (ma === null && mb === null) { cmp = 0; break; }
          if (ma === null) { cmp = 1; break; }
          if (mb === null) { cmp = -1; break; }
          cmp = mb - ma; // higher months first within tier
          break;
        }
        case "make": {
          const am = [a.make, a.model, a.pianoType].filter(Boolean).join(" ");
          const bm = [b.make, b.model, b.pianoType].filter(Boolean).join(" ");
          cmp = am.localeCompare(bm);
          break;
        }
        case "type": {
          cmp = (a.pianoType ?? "").localeCompare(b.pianoType ?? "");
          break;
        }
        case "last-tuned": {
          const da = parseDate(a.lastTuned);
          const db = parseDate(b.lastTuned);
          if (!da && !db) cmp = 0;
          else if (!da) cmp = 1;
          else if (!db) cmp = -1;
          else cmp = da.getTime() - db.getTime();
          break;
        }
        case "client": {
          const ca = customerMap.get(a.customerId);
          const cb = customerMap.get(b.customerId);
          const na = ca ? `${ca.lastName} ${ca.firstName}` : "";
          const nb = cb ? `${cb.lastName} ${cb.firstName}` : "";
          cmp = na.localeCompare(nb);
          break;
        }
        case "created": {
          const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          cmp = da - db;
          break;
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });

    return result;
  }, [pianos, search, filter, sortKey, sortDir, customerMap]);

  // Incremental rendering keeps big piano lists smooth.
  const listKey = `${search}|${filter}|${sortKey}|${sortDir}`;
  const { visible: visiblePianos, hasMore, sentinelRef } = useIncrementalList(filtered, listKey);

  function clickSort(key: SortKey) {
    if (sortKey === key) {
      setParams({ dir: sortDir === "asc" ? "desc" : "asc" });
    } else {
      setParams({ sort: key, dir: "asc" });
    }
  }

  function HeaderSort({ col, label }: { col: SortKey; label: string }) {
    const active = sortKey === col;
    return (
      <th
        className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-xs whitespace-nowrap cursor-pointer hover:text-foreground select-none"
        onClick={() => clickSort(col)}
        data-testid={`th-pianos-${col}`}
      >
        <span className="inline-flex items-center gap-1">
          {label}
          {active
            ? (sortDir === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" />)
            : <ArrowUpDown className="h-3 w-3 opacity-30" />}
        </span>
      </th>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-5">
        <h1 className="text-2xl font-bold tracking-tight flex-1">Pianos</h1>
        <div className="relative flex-1 sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search make, model, serial, client…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-8 text-sm"
            data-testid="input-pianos-search"
          />
        </div>
      </div>

      {/* Controls row */}
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs gap-1" data-testid="button-filter-pianos">
              {FILTER_LABELS[filter]}
              <ChevronDown className="h-3 w-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-56">
            <DropdownMenuLabel className="text-xs text-muted-foreground">Status</DropdownMenuLabel>
            {(["all", "active", "inactive"] as FilterKey[]).map((f) => (
              <DropdownMenuItem
                key={f}
                onClick={() => setFilter(f)}
                className={filter === f ? "font-medium" : ""}
                data-testid={`filter-pianos-${f}`}
              >
                {FILTER_LABELS[f]}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Tuning age</DropdownMenuLabel>
            {(["not-tuned-24", "not-tuned-36", "not-tuned-60", "never-tuned"] as FilterKey[]).map((f) => (
              <DropdownMenuItem
                key={f}
                onClick={() => setFilter(f)}
                className={filter === f ? "font-medium" : ""}
                data-testid={`filter-pianos-${f}`}
              >
                {FILTER_LABELS[f]}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Piano type</DropdownMenuLabel>
            {(["grand", "upright"] as FilterKey[]).map((f) => (
              <DropdownMenuItem
                key={f}
                onClick={() => setFilter(f)}
                className={filter === f ? "font-medium" : ""}
                data-testid={`filter-pianos-${f}`}
              >
                {FILTER_LABELS[f]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        {!isLoading && (
          <span className="text-sm text-muted-foreground" data-testid="text-pianos-count">
            {filtered.length} piano{filtered.length !== 1 ? "s" : ""}
          </span>
        )}

        {/* Legend */}
        <div className="hidden sm:flex items-center gap-3 ml-1">
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="w-2.5 h-2.5 rounded-sm bg-orange-100 dark:bg-orange-950/40 border border-orange-200 dark:border-orange-800 inline-block" />
            Prime (12–18 mo)
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="w-2.5 h-2.5 rounded-sm bg-yellow-100 dark:bg-yellow-950/40 border border-yellow-200 dark:border-yellow-800 inline-block" />
            Due soon (10–11 mo)
          </span>
          <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
            <span className="w-2.5 h-2.5 rounded-sm bg-muted/60 border border-border inline-block" />
            Deeply overdue (24+ mo)
          </span>
        </div>

        <div className="ml-auto flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="h-8 text-xs gap-1" data-testid="button-sort-pianos">
                Sort: {SORT_LABELS[sortKey]}
                <ChevronDown className="h-3 w-3" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              {(Object.entries(SORT_LABELS) as [SortKey, string][]).map(([key, label]) => (
                <DropdownMenuItem
                  key={key}
                  onClick={() => setParams({ sort: key, dir: "asc" })}
                  className={sortKey === key ? "font-medium" : ""}
                  data-testid={`sort-pianos-${key}`}
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
            data-testid="button-sort-dir-pianos"
          >
            {sortDir === "asc" ? <ArrowUp className="h-3.5 w-3.5" /> : <ArrowDown className="h-3.5 w-3.5" />}
          </Button>
        </div>
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr className="border-b">
                <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-xs whitespace-nowrap w-16">
                  Status
                </th>
                <HeaderSort col="make" label="Make & Model" />
                <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-xs whitespace-nowrap">
                  Serial #
                </th>
                <HeaderSort col="type" label="Type" />
                <HeaderSort col="client" label="Client" />
                <HeaderSort col="last-tuned" label="Last Tuned" />
                <th className="text-left px-4 py-2.5 font-semibold text-muted-foreground text-xs whitespace-nowrap hidden md:table-cell">
                  Location
                </th>
              </tr>
            </thead>
            <tbody>
              {isLoading ? (
                Array.from({ length: 8 }).map((_, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="px-4 py-3"><Skeleton className="h-4 w-10" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-40" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-16" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-28" /></td>
                    <td className="px-4 py-3"><Skeleton className="h-4 w-20" /></td>
                    <td className="px-4 py-3 hidden md:table-cell"><Skeleton className="h-4 w-16" /></td>
                  </tr>
                ))
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">
                    <Music2 className="h-8 w-8 mx-auto mb-2 opacity-30" />
                    <p className="text-sm">No pianos match your search or filter.</p>
                  </td>
                </tr>
              ) : (
                visiblePianos.map((piano) => {
                  const customer = customerMap.get(piano.customerId);
                  const months = getMonthsSince(piano.lastTuned);
                  const tierClass = getRowTierClass(months, piano.isActive);
                  const makeModel =
                    [piano.make, piano.model].filter(Boolean).join(" ") ||
                    piano.pianoType ||
                    "Unnamed Piano";
                  const displayName = piano.year ? `${piano.year} ${makeModel}` : makeModel;

                  return (
                    <tr
                      key={piano.id}
                      className={`border-b last:border-0 hover:brightness-95 cursor-pointer transition-colors ${tierClass}`}
                      onClick={() => navigate(`/pianos/${piano.id}`)}
                      data-testid={`row-piano-${piano.id}`}
                    >
                      <td className="px-4 py-3">
                        <StatusDot
                          isActive={piano.isActive}
                          state={customer?.state}
                        />
                      </td>
                      <td className="px-4 py-3 font-medium">{displayName}</td>
                      <td className="px-4 py-3 text-muted-foreground font-mono text-xs">
                        {piano.serialNumber || <span className="opacity-40">—</span>}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {piano.pianoType || <span className="opacity-40">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {customer ? (
                          <span
                            className="text-primary hover:underline"
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/customers/${customer.id}`);
                            }}
                            data-testid={`link-piano-client-${piano.id}`}
                          >
                            {customer.firstName} {customer.lastName}
                          </span>
                        ) : (
                          <span className="text-muted-foreground opacity-40">—</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">
                        {formatLastTuned(piano.lastTuned)}
                      </td>
                      <td className="px-4 py-3 text-muted-foreground hidden md:table-cell">
                        {piano.location || <span className="opacity-40">—</span>}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Sentinel: when this scrolls into view, the next chunk of rows renders */}
      {hasMore && <div ref={sentinelRef} className="h-8" aria-hidden="true" />}
    </div>
  );
}
