import { useState, useEffect, useRef, useCallback } from "react";
import { Search, MapPin, X, Loader2 } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface PlaceAddressResult {
  street: string;
  city: string;
  state: string;
  zipCode: string;
}

/**
 * Shape returned by GET /api/places/autocomplete.
 *
 * NOTE (Aug 5, 2026): the server migrated to Places API (New) on Jul 6, 2026 and
 * emits `mainText`/`secondaryText`. This component still declared the LEGACY
 * `structured_formatting.main_text` shape, so rendering a suggestion threw
 * "Cannot read properties of undefined" and — with no error boundary — blanked
 * the whole app. Both shapes are accepted now, and every field is optional so a
 * missing one can never crash the render again.
 */
interface Prediction {
  place_id: string;
  description?: string;
  mainText?: string;
  secondaryText?: string;
  /** Legacy Places API shape — tolerated, no longer required. */
  structured_formatting?: {
    main_text?: string;
    secondary_text?: string;
  };
}

/** Primary line of a suggestion, whichever API shape it arrived in. */
function predMainText(p: Prediction): string {
  return p.mainText || p.structured_formatting?.main_text || p.description || "";
}

/** Secondary (city/state) line of a suggestion, whichever shape it arrived in. */
function predSecondaryText(p: Prediction): string {
  return p.secondaryText || p.structured_formatting?.secondary_text || "";
}

// ─── Debounce hook ───────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── Component ───────────────────────────────────────────────────────────────

interface AddressSearchProps {
  /** Called when user picks a suggestion — fields pre-populated from Places API */
  onSelect: (result: PlaceAddressResult) => void;
  /** Starting display value (e.g. the existing formatted address) */
  initialValue?: string;
  placeholder?: string;
  className?: string;
}

export function AddressSearch({
  onSelect,
  initialValue = "",
  placeholder = "Search address…",
  className,
}: AddressSearchProps) {
  const [query, setQuery] = useState(initialValue);
  const [predictions, setPredictions] = useState<Prediction[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  // True after user has picked a suggestion — suppresses further API calls
  const [locked, setLocked] = useState(initialValue.length > 0);
  // Places lookup errored — tell the user to type it in below rather than
  // silently doing nothing (or, previously, blanking the page).
  const [lookupFailed, setLookupFailed] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const debouncedQuery = useDebounce(query, 320);

  // Autocomplete fetch
  useEffect(() => {
    if (locked || debouncedQuery.length < 3) {
      setPredictions([]);
      setOpen(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    fetch(`/api/places/autocomplete?input=${encodeURIComponent(debouncedQuery)}`, {
      credentials: "include",
    })
      .then((r) => (r.ok ? r.json() : { predictions: [] }))
      .then((data: { predictions?: Prediction[] }) => {
        if (cancelled) return;
        // Drop anything without a place_id — it can't be looked up anyway.
        const preds = (data.predictions ?? []).filter((p) => p && p.place_id);
        setPredictions(preds);
        setOpen(preds.length > 0);
        setActiveIdx(-1);
      })
      .catch(() => {
        if (!cancelled) setPredictions([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [debouncedQuery, locked]);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const handleSelect = useCallback(
    async (pred: Prediction) => {
      setQuery(pred.description || predMainText(pred));
      setOpen(false);
      setLocked(true);
      setLoading(true);
      setLookupFailed(false);
      try {
        const res = await fetch(
          `/api/places/details?place_id=${encodeURIComponent(pred.place_id)}`,
          { credentials: "include" },
        );
        // A non-OK response body is {error: "..."} — never a usable address.
        // Surface it inline instead of writing undefined into the form fields.
        if (!res.ok) {
          setLookupFailed(true);
          return;
        }
        const result = (await res.json()) as Partial<PlaceAddressResult>;
        onSelect({
          street: result.street ?? "",
          city: result.city ?? "",
          state: result.state ?? "",
          zipCode: result.zipCode ?? "",
        });
      } catch {
        setLookupFailed(true);
      } finally {
        setLoading(false);
      }
    },
    [onSelect],
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!open) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, predictions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      handleSelect(predictions[activeIdx]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  const handleClear = () => {
    setQuery("");
    setPredictions([]);
    setOpen(false);
    setLocked(false);
    setLookupFailed(false);
  };

  return (
    <div ref={containerRef} className={cn("relative", className)}>
      {/* Input row */}
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setLocked(false);
            setLookupFailed(false);
          }}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (!locked && predictions.length > 0) setOpen(true);
          }}
          placeholder={placeholder}
          className="pl-9 pr-9 text-base md:text-sm"
          autoComplete="off"
          aria-autocomplete="list"
          aria-expanded={open}
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : query ? (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition-colors hover:text-foreground"
            aria-label="Clear address"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      {/* Dropdown */}
      {open && (
        <div
          role="listbox"
          className="absolute z-50 mt-1 w-full overflow-hidden rounded-md border bg-popover shadow-md"
        >
          {predictions.map((pred, i) => (
            <button
              key={pred.place_id}
              role="option"
              aria-selected={i === activeIdx}
              type="button"
              // mousedown fires before blur — prevent losing input focus
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => handleSelect(pred)}
              className={cn(
                "flex w-full items-start gap-2.5 px-3 py-2.5 text-left text-sm transition-colors",
                i === activeIdx
                  ? "bg-accent text-accent-foreground"
                  : "hover:bg-accent/60",
              )}
            >
              <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <div className="font-medium leading-snug">
                  {predMainText(pred)}
                </div>
                <div className="truncate text-xs text-muted-foreground">
                  {predSecondaryText(pred)}
                </div>
              </div>
            </button>
          ))}
          <div className="border-t px-3 py-2 text-xs text-muted-foreground">
            Don&apos;t see it? Fill in manually below.
          </div>
        </div>
      )}

      {lookupFailed && (
        <p className="mt-1.5 text-xs text-destructive">
          Couldn&apos;t look up that address. Type the street, city, state and ZIP
          into the fields below instead — they save the same way.
        </p>
      )}
    </div>
  );
}
