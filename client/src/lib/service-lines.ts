// ─── Service line model (Gazelle-style itemized services) ───────────────────
//
// A ServiceLine is one billable item attached to a piano (or misc/standalone)
// on an appointment. Appointments persist these in the `serviceItems` JSON
// column as ServiceItemGroup[] — one group per piano.

import type { ServiceCatalogItem } from "@shared/schema";

export const EXPENSE_TYPES = [
  "Fixed Rate Labor",
  "Hourly Labor",
  "Parts",
  "Travel Fee",
  "Other",
] as const;

export type ExpenseType = (typeof EXPENSE_TYPES)[number];

export interface ServiceLine {
  /** Stable key for React lists / edits */
  lineId: string;
  name: string;
  expenseType: ExpenseType;
  /** For Hourly Labor, quantity = hours */
  quantity: number;
  /** Dollar amount per unit (per hour for Hourly Labor) */
  eachAmount: number;
  /** Minutes this service adds to the appointment length */
  durationMinutes: number;
  isTuning: boolean;
  isTaxable: boolean;
}

export interface ServiceItemGroup {
  /** null = misc / standalone services not tied to a piano */
  pianoId: number | null;
  lines: ServiceLine[];
}

export function newLineId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function parseMoney(s: string | null | undefined): number {
  if (!s) return 0;
  return parseFloat(String(s).replace(/[^0-9.]/g, "")) || 0;
}

export function parseDurationMins(s: string | null | undefined): number {
  if (!s) return 0;
  let total = 0;
  const hrMatch = String(s).match(/(\d+(?:\.\d+)?)\s*h/i);
  const minMatch = String(s).match(/(\d+)\s*m/i);
  if (hrMatch) total += Math.round(parseFloat(hrMatch[1]) * 60);
  if (minMatch) total += parseInt(minMatch[1]);
  if (total === 0) {
    const bare = parseInt(String(s), 10);
    if (!isNaN(bare)) total = bare;
  }
  return total;
}

/** Build a ServiceLine from a service-catalog entry, using its defaults. */
export function lineFromCatalog(svc: ServiceCatalogItem): ServiceLine {
  return {
    lineId: newLineId(),
    name: svc.name,
    expenseType: "Fixed Rate Labor",
    quantity: 1,
    eachAmount: parseMoney(svc.defaultCost),
    durationMinutes: parseDurationMins(svc.defaultDuration) || 90,
    isTuning: !!svc.isTuning,
    isTaxable: false,
  };
}

export function lineTotal(line: ServiceLine): number {
  return (line.quantity || 0) * (line.eachAmount || 0);
}

export function linesTotal(lines: ServiceLine[]): number {
  return lines.reduce((sum, l) => sum + lineTotal(l), 0);
}

export function linesDuration(lines: ServiceLine[]): number {
  return lines.reduce((sum, l) => sum + (l.durationMinutes || 0), 0);
}

export function groupsTotal(groups: ServiceItemGroup[]): number {
  return groups.reduce((sum, g) => sum + linesTotal(g.lines), 0);
}

export function groupsDuration(groups: ServiceItemGroup[]): number {
  return groups.reduce((sum, g) => sum + linesDuration(g.lines), 0);
}

export function groupsHaveTuning(groups: ServiceItemGroup[]): boolean {
  return groups.some((g) => g.lines.some((l) => l.isTuning));
}

export function groupsServiceNames(groups: ServiceItemGroup[]): string[] {
  const names: string[] = [];
  groups.forEach((g) => g.lines.forEach((l) => { if (!names.includes(l.name)) names.push(l.name); }));
  return names;
}

/** Serialize for the appointments.serviceItems column. */
export function serializeServiceItems(groups: ServiceItemGroup[]): string {
  return JSON.stringify(groups);
}

/** Parse the serviceItems column; tolerant of missing/bad data. */
export function parseServiceItems(raw: string | null | undefined): ServiceItemGroup[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return null;
    return parsed.map((g: any) => ({
      pianoId: typeof g?.pianoId === "number" ? g.pianoId : null,
      lines: Array.isArray(g?.lines)
        ? g.lines.map((l: any) => ({
            lineId: typeof l?.lineId === "string" ? l.lineId : newLineId(),
            name: String(l?.name ?? "Service"),
            expenseType: (EXPENSE_TYPES as readonly string[]).includes(l?.expenseType)
              ? (l.expenseType as ExpenseType)
              : "Fixed Rate Labor",
            quantity: Number(l?.quantity) || 1,
            eachAmount: Number(l?.eachAmount) || 0,
            durationMinutes: Number(l?.durationMinutes) || 0,
            isTuning: !!l?.isTuning,
            isTaxable: !!l?.isTaxable,
          }))
        : [],
    }));
  } catch {
    return null;
  }
}

export function formatMoney(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function formatLineSubline(line: ServiceLine): string {
  const unitWord = line.expenseType === "Hourly Labor"
    ? (line.quantity === 1 ? "hour" : "hours")
    : (line.quantity === 1 ? "unit" : "units");
  return `${line.quantity} ${unitWord} at ${formatMoney(line.eachAmount)} each`;
}

export function formatLineDuration(mins: number): string {
  if (!mins) return "";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m} minutes`;
  if (m === 0) return `${h} hour${h !== 1 ? "s" : ""}`;
  return `${h} hour${h !== 1 ? "s" : ""}, ${m} minutes`;
}
