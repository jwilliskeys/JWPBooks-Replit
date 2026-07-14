// ─── Pianoscope import helpers ────────────────────────────────────────────────
// Parses a raw .pianoscope document (plain JSON exported from the Pianoscope
// iOS/iPadOS app) into a compact summary we can store on a service record and
// redraw as a report graph. Pianoscope files are JSON; a piano's measurements
// live in `tuning.points` (calculated target frequencies), `measuredTuning`
// (actual measured frequencies) and, for pitch raises, `overpull.points`
// (the "pre-measure" arrival sample). All frequencies are absolute Hz.
//
// Cents are computed relative to equal temperament AT THE FILE'S OWN CONCERT
// PITCH (440 or 441), which is exactly what the app's on-screen graph shows.

export interface PianoscopeStats {
  mean: number;        // mean measured deviation (cents)
  std: number;         // evenness (population stdev, cents)
  mn: number;          // most-flat note (cents)
  mx: number;          // most-sharp note (cents)
  a4: number | null;   // A4 measured deviation if A4 was sampled (cents)
  pitchCents: number;  // overall pitch level vs concert pitch (cents) — A4 if sampled, else midrange mean
  a4hz: number;        // absolute Hz that pitchCents corresponds to at A4
}

// A piano's inharmonicity "fingerprint" — stable for the life of the instrument.
// Used to recognise the same physical piano across visits / re-named files.
export interface PianoscopeFingerprint {
  sB: number; sT: number; yB: number; yT: number; // fitted curve parameters
  sample: Record<string, number>;                 // a few per-note inharmonicity coefficients
}

export interface PianoscopeSummary {
  concertPitch: number;       // file target, 440 or 441
  pitchRaise: boolean;        // was pitch-raise / overpull mode used
  notes: string[];            // note names in keyboard order, e.g. "A0".."C8"
  measured: (number | null)[]; // measured cents per note (null = not sampled)
  target: number[];           // target tuning-curve cents per note
  stats: PianoscopeStats;
  fingerprint?: PianoscopeFingerprint | null;
  name?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  fileName?: string | null;
  measuredAt?: string | null; // ISO date the measurement was taken (from the file)
}

const NOTE_SEMITONE: Record<string, number> = {
  C: 0, "C#": 1, D: 2, "D#": 3, E: 4, F: 5, "F#": 6, G: 7, "G#": 8, A: 9, "A#": 10, B: 11,
};

function midiOf(note: string): number {
  const m = note.match(/([A-G]#?)(\d)/);
  if (!m) return 0;
  return NOTE_SEMITONE[m[1]] + 12 * (parseInt(m[2], 10) + 1);
}

function etFreq(note: string, concertPitch: number): number {
  return concertPitch * Math.pow(2, (midiOf(note) - 69) / 12);
}

// Keyboard order A0 .. C8 (matches Pianoscope's range)
export const KEYBOARD_ORDER: string[] = (() => {
  const out: string[] = [];
  for (let oct = 0; oct <= 8; oct++) {
    const names =
      oct === 0 ? ["A", "A#", "B"] : oct === 8 ? ["C"] : ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
    names.forEach((n) => out.push(`${n}${oct}`));
  }
  return out;
})();

const MIDRANGE = (() => {
  const out: string[] = [];
  [3, 4, 5].forEach((o) => ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"].forEach((p) => out.push(`${p}${o}`)));
  return out;
})();

// Apple / Core Data reference date is 2001-01-01 UTC.
function appleToISO(secs: unknown): string | null {
  if (typeof secs !== "number" || !isFinite(secs)) return null;
  return new Date(Date.UTC(2001, 0, 1) + secs * 1000).toISOString();
}

/** Returns 440 or 441 — whichever standard the measured pitch is closest to (Willis rarely tunes to 439). */
export function nearestStandard(hz: number): 440 | 441 {
  return Math.abs(hz - 441) < Math.abs(hz - 440) ? 441 : 440;
}

/** "A443.8" style absolute-pitch label. */
export function pitchHzLabel(s: PianoscopeStats): string {
  return `A${s.a4hz.toFixed(1)}`;
}

/** "+10.8¢ from 441" style deviation label, relative to the file's concert pitch. */
export function pitchDevLabel(summary: PianoscopeSummary): string {
  const c = summary.stats.pitchCents;
  return `${c >= 0 ? "+" : ""}${c.toFixed(1)}¢ from ${summary.concertPitch}`;
}

export class PianoscopeParseError extends Error {}

/**
 * Parse a raw pianoscope document object into a summary.
 * Throws PianoscopeParseError if it doesn't look like a pianoscope file.
 */
export function parsePianoscope(doc: any, fileName?: string): PianoscopeSummary {
  if (!doc || typeof doc !== "object" || !doc.tuning || !Array.isArray(doc.tuning.points)) {
    throw new PianoscopeParseError("This doesn't look like a .pianoscope file.");
  }
  const concertPitch: number = (doc.concertPitch && doc.concertPitch.frequency) || 440;
  const pitchRaise = !!doc.isPitchRaising;

  const target: Record<string, number> = {};
  for (const p of doc.tuning.points) target[p.note] = p.frequency;

  // Prefer the pitch-raise "pre-measure" arrival sample when present; otherwise
  // fall back to the measured tuning.
  const usePre = pitchRaise && doc.overpull && Array.isArray(doc.overpull.points);
  const srcArr: any[] = usePre ? doc.overpull.points : doc.measuredTuning || [];
  const src: Record<string, number> = {};
  for (const m of srcArr) src[m.note] = m.frequency;

  const notes: string[] = [];
  const measured: (number | null)[] = [];
  const targetCents: number[] = [];
  for (const note of KEYBOARD_ORDER) {
    if (target[note] == null) continue;
    notes.push(note);
    targetCents.push(round2(1200 * Math.log2(target[note] / etFreq(note, concertPitch))));
    measured.push(src[note] != null ? round2(1200 * Math.log2(src[note] / etFreq(note, concertPitch))) : null);
  }

  const vals = measured.filter((x): x is number => x != null);
  if (vals.length === 0) throw new PianoscopeParseError("No measured notes found in the file.");

  const byNote: Record<string, number> = {};
  notes.forEach((n, i) => { const v = measured[i]; if (v != null) byNote[n] = v; });

  let pitch = byNote["A4"];
  if (pitch == null) {
    const mids = MIDRANGE.map((n) => byNote[n]).filter((x): x is number => x != null);
    pitch = mids.reduce((a, b) => a + b, 0) / mids.length;
  }
  const a4hz = concertPitch * Math.pow(2, pitch / 1200);
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  const std = Math.sqrt(vals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / vals.length);

  const measuredAt =
    (usePre && appleToISO(doc.overpull?.startDate)) ||
    (Array.isArray(doc.measuredTuning) && doc.measuredTuning.length ? appleToISO(doc.measuredTuning[0]?.date) : null) ||
    null;

  // Inharmonicity fingerprint (stable per instrument)
  let fingerprint: PianoscopeFingerprint | null = null;
  const p = doc.inharmonicityCurve?.parameters;
  if (p && typeof p.sB === "number") {
    const sample: Record<string, number> = {};
    if (Array.isArray(doc.inharmonicityCurve?.points)) {
      for (const pt of doc.inharmonicityCurve.points) {
        if (["A0", "A1", "A2", "A4", "C3", "C5"].includes(pt.note)) sample[pt.note] = pt.inharmonicity;
      }
    }
    fingerprint = { sB: p.sB, sT: p.sT, yB: p.yB, yT: p.yT, sample };
  }

  return {
    concertPitch,
    pitchRaise,
    notes,
    measured,
    target: targetCents,
    fingerprint,
    stats: {
      mean: round2(mean),
      std: round2(std),
      mn: round1(Math.min(...vals)),
      mx: round1(Math.max(...vals)),
      a4: byNote["A4"] != null ? round2(byNote["A4"]) : null,
      pitchCents: round2(pitch),
      a4hz: round2(a4hz),
    },
    name: doc.name ?? null,
    manufacturer: doc.manufacturer ?? null,
    model: doc.model ?? null,
    fileName: fileName ?? null,
    measuredAt,
  };
}

/** Parse a raw text blob (file contents). */
export function parsePianoscopeText(text: string, fileName?: string): PianoscopeSummary {
  let doc: any;
  try {
    doc = JSON.parse(text);
  } catch {
    throw new PianoscopeParseError("Couldn't read that file — it isn't valid JSON.");
  }
  return parsePianoscope(doc, fileName);
}

/** Serialize for storage in the service_records.pianoscope text column. */
export function serializePianoscope(summary: PianoscopeSummary | null): string | null {
  return summary ? JSON.stringify(summary) : null;
}

/** Safely parse the stored column back into a summary (null on any problem). */
export function deserializePianoscope(raw: string | null | undefined): PianoscopeSummary | null {
  if (!raw) return null;
  try {
    const s = JSON.parse(raw);
    if (s && Array.isArray(s.notes) && s.stats) return s as PianoscopeSummary;
  } catch { /* ignore */ }
  return null;
}

function round1(n: number) { return Math.round(n * 10) / 10; }
function round2(n: number) { return Math.round(n * 100) / 100; }

// ─── fingerprint matching ─────────────────────────────────────────────────────
// Per-note inharmonicity coefficients are far more discriminative than the fitted
// curve params (different pianos can share a similar curve shape). We use the
// sampled notes when available (same instrument ≈ 0.02, different ≈ 0.12+), and
// fall back to a scaled param distance only when no sample is present.
/** Normalized distance between two fingerprints (0 = identical). Same instrument ≈ <0.06. */
export function fingerprintDistance(a?: PianoscopeFingerprint | null, b?: PianoscopeFingerprint | null): number {
  if (!a || !b) return Infinity;
  const shared = a.sample && b.sample ? Object.keys(a.sample).filter((n) => b.sample[n] != null) : [];
  if (shared.length >= 3) {
    let sum = 0;
    for (const k of shared) sum += Math.abs(a.sample[k] - b.sample[k]) / (Math.abs(a.sample[k]) + Math.abs(b.sample[k]) + 1e-9);
    return sum / shared.length;
  }
  const keys: (keyof PianoscopeFingerprint)[] = ["sB", "sT", "yB", "yT"];
  let sum = 0;
  for (const k of keys) {
    const av = a[k] as number, bv = b[k] as number;
    sum += Math.abs(av - bv) / (Math.abs(av) + Math.abs(bv) + 1e-6);
  }
  return (sum / keys.length) * 6; // scale param distance to match sample-distance range
}

export function fingerprintsMatch(a?: PianoscopeFingerprint | null, b?: PianoscopeFingerprint | null): boolean {
  return fingerprintDistance(a, b) < 0.06;
}

// ─── date + label helpers ─────────────────────────────────────────────────────
/** M/D/YY (the format the app stores service dates in) from the file's measurement date. */
export function measurementDateLabel(summary: PianoscopeSummary): string {
  const iso = summary.measuredAt;
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleDateString("en-US", { month: "numeric", day: "numeric", year: "2-digit" });
}

export function suggestServiceType(summary: PianoscopeSummary): string {
  return summary.pitchRaise ? "Pitch Raise + Fine Tuning" : "Fine Tuning";
}

/** A human label for a file when make/model are blank (falls back to the tech's own name). */
export function fileLabel(summary: PianoscopeSummary): string {
  return [summary.manufacturer, summary.model].filter(Boolean).join(" ") || summary.name || summary.fileName || "Untitled";
}
