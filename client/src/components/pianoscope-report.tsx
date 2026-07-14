import { useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Upload, LineChart, Check, X } from "lucide-react";
import {
  type PianoscopeSummary,
  parsePianoscopeText,
  PianoscopeParseError,
  pitchHzLabel,
  pitchDevLabel,
  nearestStandard,
} from "@/lib/pianoscope";

// ─── graph (reproduces Pianoscope's pre-measure view: orange measured line +
//     grey target curve, cents relative to ET at the file's concert pitch) ─────
export function PianoscopeGraph({ summary, height = 300 }: { summary: PianoscopeSummary; height?: number }) {
  const { notes, measured, target } = summary;
  const w = 800;
  const h = height;
  const all = measured.filter((x): x is number => x != null).concat(target);
  let lo = Math.min(...all);
  let hi = Math.max(...all);
  const range = hi - lo;
  const step = range > 70 ? 15 : range > 35 ? 10 : 5;
  lo = Math.floor((lo - 4) / step) * step;
  hi = Math.ceil((hi + 4) / step) * step;
  const pL = 8, pR = 42, pT = 14, pB = 26;
  const n = notes.length;
  const X = (i: number) => pL + (i / (n - 1)) * (w - pL - pR);
  const Y = (c: number) => pT + (1 - (c - lo) / (hi - lo)) * (h - pT - pB);

  const BG = "#242426";       // dark gray plotting background (pianoscope-like)
  const gridlines: JSX.Element[] = [];
  for (let c = lo; c <= hi + 0.1; c += step) {
    const y = Y(c);
    gridlines.push(<line key={`g${c}`} x1={pL} y1={y} x2={w - pR} y2={y} stroke="#3d3d40" />);
    gridlines.push(<text key={`t${c}`} x={w - pR + 6} y={y + 4} fill="#9a9a9e" fontSize={12}>{c}</text>);
  }
  const octTicks: JSX.Element[] = [];
  for (let oc = 1; oc <= 8; oc++) {
    let i = notes.indexOf(`C${oc}`);
    if (i < 0 && oc === 8) i = n - 1;
    if (i >= 0) octTicks.push(<text key={`o${oc}`} x={X(i)} y={h - 6} fill="#9a9a9e" fontSize={11} textAnchor="middle">{oc}</text>);
  }
  const targetPts = target.map((c, i) => `${X(i)},${Y(c)}`).join(" ");
  const segs: string[][] = [];
  let cur: string[] = [];
  measured.forEach((c, i) => {
    if (c == null) { if (cur.length) segs.push(cur); cur = []; }
    else cur.push(`${X(i)},${Y(c)}`);
  });
  if (cur.length) segs.push(cur);
  const ai = notes.indexOf("A4");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} width="100%" style={{ display: "block" }}>
      <rect x={0} y={0} width={w} height={h} fill={BG} />
      {gridlines}
      <line x1={pL} y1={Y(0)} x2={w - pR} y2={Y(0)} stroke="#6f6f74" strokeWidth={1.2} />
      {octTicks}
      {/* target tuning curve — white */}
      <polyline points={targetPts} fill="none" stroke="#ffffff" strokeWidth={1.8} />
      {/* measured pitch — yellow line + readable yellow dots */}
      {segs.map((s, k) => <polyline key={k} points={s.join(" ")} fill="none" stroke="#ffd60a" strokeWidth={2} />)}
      {measured.map((c, i) => c != null ? <circle key={i} cx={X(i)} cy={Y(c)} r={2.8} fill="#ffd60a" stroke="#000000" strokeWidth={0.5} /> : null)}
      {ai >= 0 && measured[ai] != null && <circle cx={X(ai)} cy={Y(measured[ai] as number)} r={4.5} fill="#34c759" stroke="#0b3d22" strokeWidth={0.6} />}
    </svg>
  );
}

// ─── compact chips shown inline on a timeline entry / attach preview ──────────
export function PianoscopeChips({ summary }: { summary: PianoscopeSummary }) {
  const near = nearestStandard(summary.stats.a4hz);
  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${summary.pitchRaise ? "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" : "bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"}`}>
        {summary.pitchRaise ? "Pitch Raise" : "Fine Tuning"}
      </span>
      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
        {pitchHzLabel(summary.stats)} · ~A{near}
      </span>
      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
        {pitchDevLabel(summary)}
      </span>
      <span className="text-[11px] font-medium px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
        ±{summary.stats.std.toFixed(1)}¢ even
      </span>
    </div>
  );
}

// ─── full report dialog ───────────────────────────────────────────────────────
export function PianoscopeReportDialog({
  summary, open, onOpenChange, title,
}: {
  summary: PianoscopeSummary | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  title?: string;
}) {
  if (!summary) return null;
  const s = summary.stats;
  const near = nearestStandard(s.a4hz);
  const a4meas = summary.measured[summary.notes.indexOf("A4")];
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>Pianoscope Report</DialogTitle>
          {title && <p className="text-sm text-muted-foreground">{title}</p>}
        </DialogHeader>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <Kpi k="Pitch raise" v={summary.pitchRaise ? "Yes" : "No"} sub={summary.pitchRaise ? "overpull used" : "fine tuning"} />
          <Kpi k="Pitch on arrival" v={pitchHzLabel(s)} sub={`${pitchDevLabel(summary)} · ~A${near}`} />
          <Kpi k="Evenness" v={`±${s.std.toFixed(1)}¢`} sub="lower = more even" />
          <Kpi k="Spread" v={`${s.mn} to +${s.mx}`} sub="cents, flat → sharp" />
        </div>

        <div className="rounded-xl px-1.5 pt-2 pb-1 mt-1" style={{ background: "#242426" }}>
          <div className="text-center text-[13px] pt-1.5" style={{ color: "#e5e5e7" }}>Pre-Measure Tuning</div>
          <PianoscopeGraph summary={summary} />
          <div className="text-center text-xs pb-2 pt-1" style={{ color: "#9a9a9e" }}>
            {a4meas != null ? `A4 measured: ${a4meas >= 0 ? "+" : ""}${a4meas.toFixed(1)} ¢ · ` : ""}
            {summary.notes.length} notes · target A={summary.concertPitch} Hz
          </div>
        </div>

        <div className="flex items-center justify-center gap-4 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1.5"><i className="inline-block w-3 h-3 rounded-full" style={{ background: "#ffd60a" }} />Measured pitch</span>
          <span className="inline-flex items-center gap-1.5"><i className="inline-block w-4 h-[3px] rounded-sm" style={{ background: "#ffffff", border: "1px solid #ccc" }} />Target tuning curve</span>
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap text-xs text-muted-foreground border-t border-dashed pt-2.5 mt-1">
          <span>Source: {summary.fileName || "uploaded .pianoscope file"}</span>
          <span>Nearest standard pitch: A{near}</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Kpi({ k, v, sub }: { k: string; v: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-muted/30 px-3 py-2">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{k}</div>
      <div className="text-lg font-bold tabular-nums leading-tight mt-0.5">{v}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

// ─── attach control used inside the service dialog ────────────────────────────
export function PianoscopeAttach({
  summary, onChange, onPreview,
}: {
  summary: PianoscopeSummary | null;
  onChange: (s: PianoscopeSummary | null) => void;
  onPreview: () => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [hot, setHot] = useState(false);

  const handleFile = (file: File) => {
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parsePianoscopeText(String(reader.result), file.name);
        onChange(parsed);
      } catch (e) {
        onChange(null);
        setError(e instanceof PianoscopeParseError ? e.message : "Couldn't read that file.");
      }
    };
    reader.readAsText(file);
  };

  if (summary) {
    return (
      <div className="rounded-lg border border-emerald-500/60 bg-emerald-50 dark:bg-emerald-950/40 p-3 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <span className="text-sm font-semibold inline-flex items-center gap-1.5">
            <Check className="h-4 w-4 text-emerald-600" /> {summary.fileName || "Pianoscope file attached"}
          </span>
          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => onChange(null)} data-testid="button-pianoscope-remove">
            <X className="h-3.5 w-3.5" />
          </Button>
        </div>
        <PianoscopeChips summary={summary} />
        <Button type="button" size="sm" variant="secondary" onClick={onPreview} data-testid="button-pianoscope-preview">
          <LineChart className="h-3.5 w-3.5 mr-1.5" /> Preview report
        </Button>
        <p className="text-[11px] text-muted-foreground">These details attach automatically — your written note stays yours.</p>
      </div>
    );
  }

  return (
    <div>
      <div
        className={`rounded-lg border-2 border-dashed p-4 text-center cursor-pointer transition-colors ${hot ? "border-primary bg-primary/5" : "border-muted-foreground/30 bg-muted/20"}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setHot(true); }}
        onDragLeave={() => setHot(false)}
        onDrop={(e) => { e.preventDefault(); setHot(false); if (e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]); }}
        data-testid="dropzone-pianoscope"
      >
        <div className="text-sm inline-flex items-center gap-1.5"><Upload className="h-4 w-4" /> <b>Attach a .pianoscope file</b></div>
        <div className="text-[11px] text-muted-foreground mt-1">Drop it here or tap to choose — parsed on-device, graph &amp; summary come from the file.</div>
        <input
          ref={inputRef}
          type="file"
          accept=".pianoscope,application/json"
          className="hidden"
          onChange={(e) => { const f = e.target.files?.[0]; if (f) handleFile(f); e.target.value = ""; }}
          data-testid="input-pianoscope-file"
        />
      </div>
      {error && <p className="text-xs text-red-600 mt-1.5">{error}</p>}
    </div>
  );
}
