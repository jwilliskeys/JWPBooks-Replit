export type TripPianoServiceLine = {
  name?: string;
  isTuning?: boolean;
  [key: string]: unknown;
};

export type TripPianoServiceGroup = {
  pianoId: number | null;
  lines: TripPianoServiceLine[];
};

export function parseServiceDate(value: string | null | undefined): number | null {
  if (!value) return null;
  const text = value.trim();
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  const iso = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!slash && !iso) return null;
  let year = Number(slash ? slash[3] : iso![1]);
  const month = Number(slash ? slash[1] : iso![2]);
  const day = Number(slash ? slash[2] : iso![3]);
  if (year < 100) year += 2000;
  const stamp = Date.UTC(year, month - 1, day);
  const parsed = new Date(stamp);
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return stamp;
}

export function isLaterServiceDate(candidate: string, current: string | null | undefined): boolean {
  const next = parseServiceDate(candidate);
  const existing = parseServiceDate(current);
  return next !== null && (existing === null || next > existing);
}

export function shouldRecordCompletedServices(result: string): boolean {
  return result === "completed";
}

export function hasTuningService(
  explicitFlag: boolean | null | undefined,
  serviceType: string | null | undefined,
  services: string | null | undefined,
): boolean {
  if (explicitFlag || /tuning/i.test(serviceType || "")) return true;
  try {
    const parsed: unknown = JSON.parse(services || "[]");
    return Array.isArray(parsed) && parsed.some((line) =>
      !!line && typeof line === "object" &&
      ((line as { isTuning?: unknown }).isTuning === true ||
        /tuning/i.test(String((line as { name?: unknown }).name ?? ""))));
  } catch {
    return false;
  }
}

export function getTripPianoServiceGroups(
  rawServiceItems: string | null | undefined,
  fallbackPianoId: number | null | undefined,
  servicesRequested: string | null | undefined,
): TripPianoServiceGroup[] {
  if (rawServiceItems) {
    try {
      const parsed: unknown = JSON.parse(rawServiceItems);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed
          .filter((group): group is { pianoId?: unknown; lines?: unknown } =>
            !!group && typeof group === "object" && !Array.isArray(group))
          .map((group) => ({
            pianoId: Number.isSafeInteger(group.pianoId) && Number(group.pianoId) > 0
              ? Number(group.pianoId)
              : null,
            lines: Array.isArray(group.lines)
              ? group.lines.filter((line): line is TripPianoServiceLine =>
                  !!line && typeof line === "object" && !Array.isArray(line))
              : [],
          }));
      }
    } catch {
      // Fall back to legacy free-text services below.
    }
  }

  if (!Number.isSafeInteger(fallbackPianoId) || Number(fallbackPianoId) <= 0) return [];
  const lines = (servicesRequested || "")
    .split(/\n|,/)
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({ name, isTuning: /tuning/i.test(name) }));
  return [{ pianoId: Number(fallbackPianoId), lines }];
}
