export const SERVICE_AREA_CLUSTERS: Record<string, string[]> = {
  "Davis County": ["Bountiful", "Centerville", "North Salt Lake", "Kaysville", "Farmington", "Layton", "Syracuse", "Ogden", "Farr West", "Davis County"],
  "Salt Lake City": ["Salt Lake City", "SLC", "Midvale", "Taylorsville", "Sandy", "Cottonwood Heights", "Draper", "Highland", "West Jordan", "Kamas", "Heber City", "Midway", "Alpine"],
  "South Jordan": ["South Jordan", "Herriman", "Bluffdale", "Riverton", "Copperton", "Lehi", "Orem", "Provo"],
  "Boston": ["Somerville", "Boston", "Cambridge", "Brookline"],
};

export const SERVICE_AREA_STATES: Record<string, string> = {
  MA: "Boston",
  RI: "Boston",
  CT: "Boston",
  VA: "Boston",
  NH: "Boston",
  ME: "Boston",
};

export const SERVICE_REGIONS: Record<string, string[]> = {
  "Salt Lake City": ["Davis County", "Salt Lake City", "South Jordan"],
  "Boston": ["Boston"],
};

const CITY_CLUSTERS: string[][] = Object.values(SERVICE_AREA_CLUSTERS);

function normalizeCity(city: string): string {
  const trimmed = city.trim();
  if (trimmed.toLowerCase() === "slc") return "Salt Lake City";
  return trimmed;
}

function findCluster(city: string): string[] | null {
  const norm = normalizeCity(city).toLowerCase();
  for (const cluster of CITY_CLUSTERS) {
    if (cluster.some((c) => c.toLowerCase() === norm)) {
      return cluster;
    }
  }
  return null;
}

export function getServiceArea(city: string, state?: string): string {
  if (state) {
    const stateUpper = state.trim().toUpperCase();
    if (stateUpper in SERVICE_AREA_STATES) {
      return SERVICE_AREA_STATES[stateUpper];
    }
  }
  if (!city) return "Other";
  const norm = normalizeCity(city).toLowerCase();
  for (const [area, cities] of Object.entries(SERVICE_AREA_CLUSTERS)) {
    if (cities.some((c) => c.toLowerCase() === norm)) {
      return area;
    }
  }
  return "Other";
}

export function getServiceRegion(city: string): string {
  const area = getServiceArea(city);
  for (const [region, areas] of Object.entries(SERVICE_REGIONS)) {
    if (areas.includes(area)) return region;
  }
  return "Other";
}

export function getNearbyCities(city: string): string[] {
  if (!city) return [];
  const cluster = findCluster(city);
  if (!cluster) return [normalizeCity(city)];
  return cluster.map((c) => normalizeCity(c));
}

export function areSameCity(city1: string, city2: string): boolean {
  if (!city1 || !city2) return false;
  return normalizeCity(city1).toLowerCase() === normalizeCity(city2).toLowerCase();
}

export function areNearby(city1: string, city2: string): boolean {
  if (!city1 || !city2) return false;
  if (areSameCity(city1, city2)) return true;
  const cluster1 = findCluster(city1);
  const cluster2 = findCluster(city2);
  if (!cluster1 || !cluster2) return false;
  return cluster1 === cluster2;
}

export function getClusterName(city: string): string {
  if (!city) return "";
  return getServiceArea(city);
}

export function parseTimeToMinutes(timeStr: string): number {
  if (!timeStr) return -1;
  const cleaned = timeStr.trim().toUpperCase();
  const match = cleaned.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (!match) return -1;
  let hours = parseInt(match[1]);
  const mins = parseInt(match[2]);
  const period = match[3];
  if (period === "PM" && hours !== 12) hours += 12;
  if (period === "AM" && hours === 12) hours = 0;
  return hours * 60 + mins;
}

export function parseDurationToMinutes(durationStr: string): number {
  if (!durationStr) return 120;
  const lower = durationStr.toLowerCase().trim();
  const hourMatch = lower.match(/(\d+(?:\.\d+)?)\s*h/);
  const minMatch = lower.match(/(\d+)\s*m/);
  let total = 0;
  if (hourMatch) total += parseFloat(hourMatch[1]) * 60;
  if (minMatch) total += parseInt(minMatch[1]);
  if (total === 0) {
    const num = parseFloat(lower);
    if (!isNaN(num)) total = num * 60;
  }
  return total || 120;
}

export function minutesToTimeStr(minutes: number): string {
  if (minutes < 0) return "";
  const h24 = Math.floor(minutes / 60);
  const m = minutes % 60;
  const period = h24 >= 12 ? "PM" : "AM";
  let h12 = h24 % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

export interface ExistingAppointment {
  time: string;
  duration?: string;
  city?: string;
}

export interface ConflictResult {
  valid: boolean;
  message?: string;
  suggestedTime?: string;
}

export function checkTimeConflict(
  newStartStr: string,
  newDurationStr: string,
  newCity: string,
  existing: ExistingAppointment[]
): ConflictResult {
  const newStart = parseTimeToMinutes(newStartStr);
  if (newStart < 0) return { valid: false, message: "Invalid time format. Use H:MM AM/PM." };
  const newDur = parseDurationToMinutes(newDurationStr);
  const newEnd = newStart + newDur;

  const sorted = existing
    .map((e) => ({
      start: parseTimeToMinutes(e.time),
      dur: parseDurationToMinutes(e.duration || "2 hours"),
      city: e.city || "",
    }))
    .filter((e) => e.start >= 0)
    .sort((a, b) => a.start - b.start);

  for (const appt of sorted) {
    const apptEnd = appt.start + appt.dur;
    const sameCity = areSameCity(newCity, appt.city);
    const gap = sameCity ? 0 : 30;

    if (newStart < apptEnd + gap && newEnd + gap > appt.start) {
      const conflictTimeStr = minutesToTimeStr(appt.start);
      const msg = sameCity
        ? `Overlaps with appointment at ${conflictTimeStr}.`
        : `Conflicts with appointment at ${conflictTimeStr}. Different cities require a 30-minute travel gap.`;
      const suggested = findNextAvailableSlot(newDur, newCity, sorted);
      return { valid: false, message: msg, suggestedTime: suggested };
    }
  }

  return { valid: true };
}

function findNextAvailableSlot(
  duration: number,
  newCity: string,
  sorted: { start: number; dur: number; city: string }[]
): string | undefined {
  const dayStart = 8 * 60;
  const dayEnd = 18 * 60;
  let candidate = dayStart;

  for (const appt of sorted) {
    const apptEnd = appt.start + appt.dur;
    const sameCity = areSameCity(newCity, appt.city);
    const gapBefore = sameCity ? 0 : 30;
    const gapAfter = sameCity ? 0 : 30;

    if (candidate + duration + gapBefore <= appt.start) {
      if (candidate + duration <= dayEnd) return minutesToTimeStr(candidate);
    }
    candidate = Math.max(candidate, apptEnd + gapAfter);
  }

  if (candidate + duration <= dayEnd) return minutesToTimeStr(candidate);
  return undefined;
}

export function getNextAvailableTime(
  newCity: string,
  newDurationStr: string,
  existing: ExistingAppointment[]
): string {
  const dur = parseDurationToMinutes(newDurationStr);
  const sorted = existing
    .map((e) => ({
      start: parseTimeToMinutes(e.time),
      dur: parseDurationToMinutes(e.duration || "2 hours"),
      city: e.city || "",
    }))
    .filter((e) => e.start >= 0)
    .sort((a, b) => a.start - b.start);

  const slot = findNextAvailableSlot(dur, newCity, sorted);
  return slot || "8:00 AM";
}
