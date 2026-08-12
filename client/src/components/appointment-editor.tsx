// ─── Shared Gazelle-style appointment editor pieces ──────────────────────────
//
// Used by BOTH the New Appointment flow (appointment-dialog.tsx) and the Edit
// Appointment dialog (appointment-detail-dialog.tsx) so the two stay identical:
// section bars, the rich piano card (photo, details, link, tuning badges), the
// piano picker, the client search box, and the repeat-frequency fields.
//
// All components are module-level — never define a component inside another
// component's body in this codebase (it remounts on every keystroke).

import { useState, useEffect, useMemo, useRef } from "react";
import { Link } from "wouter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, ArrowLeft, X, ExternalLink, UserRound, Repeat, Car, Clock } from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DatePickerPopover,
  StepperGroup,
  formatTimeMinutes,
  formatDurationMinutes,
} from "@/components/time-stepper";
import type { Customer, Piano } from "@shared/schema";
import { ServiceLineEditor } from "@/components/service-line-editor";
import { type ServiceLine, linesTotal, formatMoney } from "@/lib/service-lines";
import { clientName, clientSearchText } from "@shared/client-name";

// ─── Date helpers (M/D/YY ↔ YYYY-MM-DD) ─────────────────────────────────────

export function todayMDYY(): string {
  const d = new Date();
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
}

/** M/D/YY → YYYY-MM-DD for <input type="date"> */
export function toInputDate(mdyy: string): string {
  if (!mdyy) return "";
  const parts = mdyy.split("/");
  if (parts.length !== 3) return "";
  const m = parts[0].padStart(2, "0");
  const d = parts[1].padStart(2, "0");
  let yr = parseInt(parts[2], 10);
  if (yr < 100) yr += 2000;
  return `${yr}-${m}-${d}`;
}

/** YYYY-MM-DD → M/D/YY (app-internal format) */
export function fromInputDate(iso: string): string {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return `${m}/${d}/${y % 100}`;
}

/** Human-readable label from M/D/YY */
export function dateLabel(mdyy: string): string {
  if (!mdyy) return "";
  const parts = mdyy.split("/");
  if (parts.length !== 3) return mdyy;
  let yr = parseInt(parts[2], 10);
  if (yr < 100) yr += 2000;
  const d = new Date(yr, parseInt(parts[0], 10) - 1, parseInt(parts[1], 10));
  if (isNaN(d.getTime())) return mdyy;
  return d.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" });
}

export function parseDateStr(s: string | null | undefined): Date | null {
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const d = new Date(s); return isNaN(d.getTime()) ? null : d;
  }
  const p = s.split("/");
  if (p.length !== 3) return null;
  let yr = parseInt(p[2]); if (yr < 100) yr += 2000;
  const d = new Date(yr, parseInt(p[0]) - 1, parseInt(p[1]));
  return isNaN(d.getTime()) ? null : d;
}

export function monthsDiff(from: Date, to: Date): number {
  return (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth());
}

export function daysDiff(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

// ─── Piano display helpers ───────────────────────────────────────────────────

export function calcNextTuningDue(lastTuned: string | null | undefined, interval: string | null | undefined): Date | null {
  const d = parseDateStr(lastTuned);
  if (!d || !interval) return null;
  const months = parseInt(interval);
  if (isNaN(months)) return null;
  const next = new Date(d);
  next.setMonth(next.getMonth() + months);
  return next;
}

export function nextTuningLabel(lastTuned: string | null | undefined, interval: string | null | undefined): { label: string | null; urgent: boolean } {
  const next = calcNextTuningDue(lastTuned, interval);
  if (!next) return { label: null, urgent: false };
  const days = daysDiff(new Date(), next);
  if (days === 0) return { label: "Next tuning: Today", urgent: true };
  if (days === -1) return { label: "Next tuning: Yesterday", urgent: true };
  if (days < 0) return { label: `Next tuning: ${Math.abs(days)} days overdue`, urgent: true };
  if (days === 1) return { label: "Next tuning: Tomorrow", urgent: false };
  if (days < 30) return { label: `Next tuning: in ${days} days`, urgent: false };
  const mos = Math.round(days / 30);
  return { label: `Next tuning: in ${mos} month${mos !== 1 ? "s" : ""}`, urgent: false };
}

export function lastTunedLabel(lastTuned: string | null | undefined): string {
  const d = parseDateStr(lastTuned);
  if (!d) return "Never tuned";
  const mos = monthsDiff(d, new Date());
  if (mos === 0) return "Last tuned: This month";
  if (mos === 1) return "Last tuned: Last month";
  if (mos < 12) return `Last tuned: ${mos} months ago`;
  const yrs = Math.floor(mos / 12);
  return `Last tuned: ${yrs} year${yrs !== 1 ? "s" : ""} ago`;
}

export function pianoTypeLabel(p: Piano): string {
  const t = (p.pianoType ?? "").toLowerCase();
  if (t.includes("grand")) return "GRAND";
  if (t.includes("upright") || t.includes("vertical")) return "UPRIGHT";
  if (t.includes("digital")) return "DIGITAL";
  return "UNKNOWN";
}

export function pianoDisplayName(p: Piano): string {
  return [p.year, p.make, p.model].filter(Boolean).join(" ") || `Piano #${p.id}`;
}

export function pianoSubline(p: Piano): string {
  return [p.serialNumber, p.location].filter(Boolean).join(", ");
}

function lastTunedBadge(lastTuned: string | null | undefined): string | null {
  const d = parseDateStr(lastTuned);
  if (!d) return null;
  const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
  return `LAST TUNED: ${months[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

function intervalBadge(interval: string | null | undefined): string | null {
  if (!interval) return null;
  const n = parseInt(interval);
  if (!isNaN(n)) return n === 1 ? "EVERY MONTH" : `EVERY ${n} MONTHS`;
  return `EVERY ${String(interval).toUpperCase()}`;
}

// ─── Section shapes ──────────────────────────────────────────────────────────

export interface PianoSection {
  sectionId: string;
  pianoId: number | null;
  lines: ServiceLine[];
  isMisc: boolean;
}

export function makeSection(pianoId: number | null = null, isMisc = false): PianoSection {
  return {
    sectionId: `${Date.now()}-${Math.random()}`,
    pianoId,
    lines: [],
    isMisc,
  };
}

// ─── Section header bar ──────────────────────────────────────────────────────

export function SectionBar({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-muted/50 border border-border/60">
      <span className="text-sm font-semibold text-foreground">{title}</span>
      {children && <div className="flex items-center gap-2">{children}</div>}
    </div>
  );
}

// ─── Piano card (Gazelle-style: photo, details, link, tuning badges) ─────────

interface PianoCardProps {
  section: PianoSection;
  piano: Piano | undefined;
  onUpdate: (patch: Partial<PianoSection>) => void;
  onRemove: () => void;
  showRemove: boolean;
  /** Called before navigating to the piano page (close the dialog). */
  onNavigate?: () => void;
}

export function PianoCard({ section, piano, onUpdate, onRemove, showRemove, onNavigate }: PianoCardProps) {
  const sectionTotal = useMemo(() => linesTotal(section.lines), [section.lines]);
  const photo = piano?.photos?.[0];
  const { label: nextLabel, urgent } = nextTuningLabel(piano?.lastTuned, piano?.tuningInterval);
  const tunedBadge = lastTunedBadge(piano?.lastTuned);
  const everyBadge = intervalBadge(piano?.tuningInterval);

  return (
    <div className="rounded-lg border border-border bg-card overflow-hidden">
      <div className="flex items-start gap-3 px-3 py-3 border-b border-border/50 bg-muted/20">
        <div className="shrink-0 flex flex-col items-center gap-0.5 pt-0.5">
          <span className="text-lg">🎹</span>
          <span className="text-[9px] font-bold text-muted-foreground tracking-wide">
            {piano ? pianoTypeLabel(piano) : "—"}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold leading-tight flex items-center gap-1.5">
            <span className="truncate">
              {section.isMisc ? "Misc / Standalone Service" : (piano ? pianoDisplayName(piano) : "Unknown Piano")}
            </span>
            {piano && (
              <Link href={`/pianos/${piano.id}`} onClick={onNavigate}>
                <ExternalLink
                  className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground shrink-0 cursor-pointer"
                  data-testid={`link-piano-card-${piano.id}`}
                />
              </Link>
            )}
          </p>
          {piano && pianoSubline(piano) && (
            <p className="text-xs text-muted-foreground mt-0.5">{pianoSubline(piano)}</p>
          )}
          {nextLabel && (
            <p className={`text-xs mt-0.5 ${urgent ? "text-red-500 font-medium" : "text-muted-foreground"}`}>
              {nextLabel}
            </p>
          )}
          {(tunedBadge || everyBadge) && (
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              {tunedBadge && (
                <span className="inline-flex items-center rounded bg-muted-foreground/80 text-background px-1.5 py-0.5 text-[9px] font-bold tracking-wide">
                  {tunedBadge}
                </span>
              )}
              {everyBadge && (
                <span className="inline-flex items-center rounded bg-muted-foreground/80 text-background px-1.5 py-0.5 text-[9px] font-bold tracking-wide">
                  {everyBadge}
                </span>
              )}
            </div>
          )}
        </div>
        {photo && (
          <img
            src={photo}
            alt=""
            className="shrink-0 h-14 w-14 rounded-md object-cover border"
            loading="lazy"
          />
        )}
        {showRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="shrink-0 p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
            title="Remove from appointment"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      <div className="px-3 py-2.5">
        <ServiceLineEditor
          lines={section.lines}
          onChange={lines => onUpdate({ lines })}
          autoAddDefault={!section.isMisc}
        />
        {section.lines.length > 1 && (
          <div className="flex items-center justify-end gap-2 mt-2 text-xs text-muted-foreground">
            Subtotal <span className="font-semibold text-foreground tabular-nums">{formatMoney(sectionTotal)}</span>
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Piano Picker View ───────────────────────────────────────────────────────

interface PianoPickerViewProps {
  pianos: Piano[];
  onSelect: (piano: Piano) => void;
  onClose: () => void;
}

export function PianoPickerView({ pianos, onSelect, onClose }: PianoPickerViewProps) {
  const [query, setQuery] = useState("");
  const [activeOnly, setActiveOnly] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { setTimeout(() => inputRef.current?.focus(), 50); }, []);

  const filtered = useMemo(() => {
    let list = activeOnly ? pianos.filter(p => p.isActive !== false) : pianos;
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(p =>
        [p.make, p.model, p.year, p.serialNumber, p.location, p.pianoType]
          .some(v => v?.toLowerCase().includes(q))
      );
    }
    return list.sort((a, b) => {
      const an = calcNextTuningDue(a.lastTuned, a.tuningInterval);
      const bn = calcNextTuningDue(b.lastTuned, b.tuningInterval);
      if (!an && !bn) return 0;
      if (!an) return 1;
      if (!bn) return -1;
      return an.getTime() - bn.getTime();
    });
  }, [pianos, query, activeOnly]);

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center gap-2 mb-3">
        <button
          type="button"
          onClick={onClose}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="relative flex-1">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input
            ref={inputRef}
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Find a piano by make, model, location, serial number…"
            className="pl-8 h-9 text-sm"
          />
        </div>
      </div>

      <label className="flex items-center gap-2 text-sm text-muted-foreground mb-3 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={activeOnly}
          onChange={e => setActiveOnly(e.target.checked)}
          className="rounded"
        />
        Only show active pianos
      </label>

      <div className="flex-1 overflow-y-auto rounded-lg border divide-y">
        {filtered.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            {pianos.length === 0 ? "No pianos on file for this client." : "No pianos match your search."}
          </div>
        ) : (
          filtered.map(piano => {
            const { label: nextLabel, urgent } = nextTuningLabel(piano.lastTuned, piano.tuningInterval);
            const typeLabel = pianoTypeLabel(piano);
            return (
              <button
                key={piano.id}
                type="button"
                onClick={() => onSelect(piano)}
                className="w-full flex items-center gap-3 px-3 py-3 hover:bg-muted/30 transition-colors text-left"
              >
                <div className="shrink-0 w-12 flex flex-col items-center gap-0.5">
                  {piano.photos?.[0] ? (
                    <img src={piano.photos[0]} alt="" className="h-9 w-9 rounded object-cover border" loading="lazy" />
                  ) : (
                    <span className="text-xl">🎹</span>
                  )}
                  <span className="text-[9px] font-bold text-muted-foreground tracking-wide">{typeLabel}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold leading-tight">{pianoDisplayName(piano)}</p>
                  {pianoSubline(piano) && (
                    <p className="text-xs text-muted-foreground mt-0.5">{pianoSubline(piano)}</p>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-xs text-muted-foreground">{lastTunedLabel(piano.lastTuned)}</p>
                  {nextLabel && (
                    <p className={`text-xs font-medium mt-0.5 ${urgent ? "text-red-500" : "text-muted-foreground"}`}>
                      {nextLabel}
                    </p>
                  )}
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Client search box (for Reset Client → pick a different client) ──────────

interface ClientSearchBoxProps {
  customers: Customer[] | undefined;
  onSelect: (c: Customer) => void;
  autoFocus?: boolean;
}

export function ClientSearchBox({ customers, onSelect, autoFocus }: ClientSearchBoxProps) {
  const [query, setQuery] = useState("");
  const [showResults, setShowResults] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) setTimeout(() => inputRef.current?.focus(), 50);
  }, [autoFocus]);

  const results = useMemo(() => {
    if (!customers || !query.trim()) return [];
    const q = query.toLowerCase();
    return customers.filter(c =>
      [clientSearchText(c), c.email ?? "", c.phone ?? "", c.city ?? ""]
        .some(v => v.toLowerCase().includes(q))
    ).slice(0, 8);
  }, [customers, query]);

  return (
    <div className="space-y-1">
      <div className="relative">
        <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          value={query}
          onChange={e => { setQuery(e.target.value); setShowResults(true); }}
          onFocus={() => setShowResults(true)}
          placeholder="Find a client by name, phone, email, etc."
          className="pl-8 text-sm"
          data-testid="input-client-search-box"
        />
      </div>
      {showResults && results.length > 0 && (
        <div className="rounded-lg border bg-popover shadow-md overflow-hidden z-50">
          {results.map(c => (
            <button
              key={c.id}
              type="button"
              onMouseDown={() => onSelect(c)}
              className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-accent transition-colors text-left"
              data-testid={`client-search-result-${c.id}`}
            >
              <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
                <UserRound className="h-3.5 w-3.5 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">{clientName(c)}</p>
                {(c.city || c.email) && (
                  <p className="text-xs text-muted-foreground truncate">{c.city ?? c.email}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Repeat fields (frequency + until) ───────────────────────────────────────

export const REPEAT_OPTIONS: { value: string; label: string }[] = [
  { value: "none", label: "Does not repeat" },
  { value: "weekly", label: "Weekly" },
  { value: "biweekly", label: "Every 2 weeks" },
  { value: "monthly", label: "Monthly" },
  { value: "every-2-months", label: "Every 2 months" },
  { value: "every-3-months", label: "Every 3 months" },
  { value: "every-6-months", label: "Every 6 months" },
  { value: "yearly", label: "Yearly" },
];

export function repeatLabel(freq: string | null | undefined): string {
  const opt = REPEAT_OPTIONS.find(o => o.value === freq);
  return opt && opt.value !== "none" ? opt.label : "";
}

// ─── Details fields (title, notes, travel mode) ──────────────────────────────
// THE shared "Details" block — every appointment window renders this one
// component, so a change here restyles all of them at once.

interface DetailsFieldsProps {
  title: string;
  onTitle: (v: string) => void;
  titlePlaceholder?: string;
  notes: string;
  onNotes: (v: string) => void;
  travelMode: string;
  onTravelMode: (v: string) => void;
  /** Hide title / travel mode for windows that don't support them. */
  showTitle?: boolean;
  showTravelMode?: boolean;
  testIdPrefix?: string;
}

export function DetailsFields({
  title, onTitle, titlePlaceholder,
  notes, onNotes,
  travelMode, onTravelMode,
  showTitle = true,
  showTravelMode = true,
  testIdPrefix = "appt",
}: DetailsFieldsProps) {
  return (
    <div className="space-y-4">
      {showTitle && (
        <Input
          value={title}
          onChange={e => onTitle(e.target.value)}
          placeholder={titlePlaceholder ?? "Appointment title"}
          className="text-sm font-medium"
          data-testid={`input-${testIdPrefix}-title`}
        />
      )}
      <Textarea
        value={notes}
        onChange={e => onNotes(e.target.value)}
        placeholder="Notes"
        className="min-h-[80px] resize-none text-sm"
        data-testid={`input-${testIdPrefix}-notes`}
      />
      {showTravelMode && (
        <div className="flex items-center gap-3">
          <Car className="h-4 w-4 text-muted-foreground shrink-0" />
          <Select value={travelMode} onValueChange={onTravelMode}>
            <SelectTrigger className="text-sm" data-testid={`select-${testIdPrefix}-travel-mode`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="Driving">Driving</SelectItem>
              <SelectItem value="Transit">Transit</SelectItem>
              <SelectItem value="Walking">Walking</SelectItem>
              <SelectItem value="Biking">Biking</SelectItem>
            </SelectContent>
          </Select>
        </div>
      )}
    </div>
  );
}

// ─── Date & Time fields (all-day, date, time + duration steppers, repeat) ────
// THE shared "Date & Time" block used by every appointment window.

export interface ApptDateTime {
  date: string;             // M/D/YY
  isAllDay: boolean;
  endDate: string;          // "" unless multi-day all-day
  timeMinutes: number;
  durationMinutes: number;
  repeatFrequency: string;  // "none" | weekly | …
  repeatEndDate: string;    // M/D/YY or ""
}

interface DateTimeFieldsProps {
  value: ApptDateTime;
  onChange: (patch: Partial<ApptDateTime>) => void;
  showAllDay?: boolean;
  showRepeat?: boolean;
  conflictError?: string;
  /** Called on user interaction that should clear a stale conflict error. */
  onInteract?: () => void;
  testIdPrefix?: string;
}

export function DateTimeFields({
  value: v,
  onChange,
  showAllDay = true,
  showRepeat = true,
  conflictError,
  onInteract,
  testIdPrefix = "appt",
}: DateTimeFieldsProps) {
  const set = (patch: Partial<ApptDateTime>) => { onInteract?.(); onChange(patch); };
  return (
    <div className="space-y-3">
      {showAllDay && (
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${testIdPrefix}-all-day`}
            checked={v.isAllDay}
            onCheckedChange={val => set({ isAllDay: !!val })}
            data-testid={`checkbox-${testIdPrefix}-all-day`}
          />
          <Label htmlFor={`${testIdPrefix}-all-day`} className="text-sm cursor-pointer">
            This is an all-day or multi-day event
          </Label>
        </div>
      )}

      {v.isAllDay && showAllDay ? (
        <div className="flex items-center gap-2 flex-wrap">
          <DatePickerPopover value={v.date} onChange={d => set({ date: d })} />
          <span className="text-sm text-muted-foreground">to</span>
          <DatePickerPopover
            value={v.endDate || v.date}
            onChange={d => set({ endDate: d === v.date ? "" : d })}
          />
        </div>
      ) : (
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
            <DatePickerPopover value={v.date} onChange={d => set({ date: d })} />
            <StepperGroup
              display={formatTimeMinutes(v.timeMinutes)}
              onStep={d => set({ timeMinutes: Math.min(Math.max(v.timeMinutes + d, 0), 23 * 60) })}
              testIdPrefix={`${testIdPrefix}-time`}
            />
            <span className="text-sm text-muted-foreground">for</span>
            <StepperGroup
              display={formatDurationMinutes(v.durationMinutes)}
              onStep={d => set({ durationMinutes: Math.min(Math.max(v.durationMinutes + d, 5), 8 * 60) })}
              testIdPrefix={`${testIdPrefix}-duration`}
            />
          </div>
          <p className="text-xs text-muted-foreground ml-6">
            Ends at {formatTimeMinutes(v.timeMinutes + v.durationMinutes)}
          </p>
        </div>
      )}

      {conflictError && (
        <div className="flex items-start gap-2 p-2 rounded-md bg-destructive/10 border border-destructive/30 text-sm text-destructive">
          <span className="mt-0.5 shrink-0">⚠</span>
          <span>{conflictError}</span>
        </div>
      )}

      {showRepeat && (
        <RepeatFields
          frequency={v.repeatFrequency}
          onFrequency={val => set({ repeatFrequency: val })}
          endDate={v.repeatEndDate}
          onEndDate={val => set({ repeatEndDate: val })}
        />
      )}
    </div>
  );
}

interface RepeatFieldsProps {
  /** "none" or a REPEAT_OPTIONS value */
  frequency: string;
  onFrequency: (v: string) => void;
  /** M/D/YY or "" */
  endDate: string;
  onEndDate: (v: string) => void;
}

export function RepeatFields({ frequency, onFrequency, endDate, onEndDate }: RepeatFieldsProps) {
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <Repeat className="h-4 w-4 text-muted-foreground shrink-0" />
        <Select value={frequency} onValueChange={onFrequency}>
          <SelectTrigger className="h-9 text-sm flex-1" data-testid="select-repeat-frequency">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REPEAT_OPTIONS.map(o => (
              <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {frequency !== "none" && (
        <div className="flex items-center gap-2 ml-6">
          <Label className="text-xs text-muted-foreground shrink-0">Repeat until</Label>
          <Input
            type="date"
            value={toInputDate(endDate)}
            onChange={e => onEndDate(fromInputDate(e.target.value))}
            className="h-9 text-sm flex-1"
            data-testid="input-repeat-end-date"
          />
          <span className="text-[11px] text-muted-foreground shrink-0">(blank = forever)</span>
        </div>
      )}
    </div>
  );
}
