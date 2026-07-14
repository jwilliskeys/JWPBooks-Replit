import { useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Upload, ChevronLeft, Check, AlertCircle, LineChart, Loader2 } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Piano, Customer } from "@shared/schema";
import { PianoscopeChips, PianoscopeReportDialog } from "@/components/pianoscope-report";
import {
  type PianoscopeSummary,
  parsePianoscopeText,
  PianoscopeParseError,
  serializePianoscope,
  fingerprintsMatch,
  measurementDateLabel,
  suggestServiceType,
  fileLabel,
} from "@/lib/pianoscope";

// ─── types ────────────────────────────────────────────────────────────────────
interface ParsedFile { fileName: string; summary: PianoscopeSummary; iso: string; }
interface Group {
  id: string;
  files: ParsedFile[];            // one per visit, newest first
  clientId: number | null;
  pianoId: number | "new" | null; // "new" = create a piano from the file
  skip: boolean;
}

// ─── tiny searchable dropdown (module-level component) ─────────────────────────
export function SearchSelect({
  value, onChange, options, placeholder, testId,
}: {
  value: number | "new" | null;
  onChange: (v: number | "new" | null) => void;
  options: { id: number | "new"; label: string; sub?: string }[];
  placeholder: string;
  testId?: string;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const selected = options.find((o) => o.id === value);
  const filtered = q.trim()
    ? options.filter((o) => (o.label + " " + (o.sub ?? "")).toLowerCase().includes(q.toLowerCase()))
    : options;
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`w-full text-left rounded-md border px-3 py-2 text-sm ${selected ? "" : "text-muted-foreground"}`}
        data-testid={testId}
      >
        {selected ? selected.label : placeholder}
      </button>
      {open && (
        <div className="absolute z-50 mt-1 w-full rounded-md border bg-popover shadow-lg">
          <div className="p-2 border-b">
            <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Type to search…" className="h-8 text-sm" />
          </div>
          <div className="max-h-56 overflow-auto py-1">
            {filtered.length === 0 && <div className="px-3 py-2 text-sm text-muted-foreground">No matches</div>}
            {filtered.map((o) => (
              <button
                key={String(o.id)}
                type="button"
                onClick={() => { onChange(o.id); setOpen(false); setQ(""); }}
                className={`w-full text-left px-3 py-2 text-sm hover:bg-muted/60 ${o.id === value ? "bg-muted/40" : ""}`}
              >
                <div className="font-medium">{o.label}</div>
                {o.sub && <div className="text-xs text-muted-foreground">{o.sub}</div>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── matching helpers ──────────────────────────────────────────────────────────
function fileHay(files: ParsedFile[]): string {
  return files.map((f) => `${f.summary.name ?? ""} ${f.summary.manufacturer ?? ""} ${f.summary.model ?? ""}`).join(" ").toLowerCase();
}
function suggestClient(files: ParsedFile[], customers: Customer[]): number | null {
  const hay = fileHay(files);
  let best: number | null = null, bestScore = 0;
  for (const c of customers) {
    const ln = (c.lastName ?? "").toLowerCase(), fn = (c.firstName ?? "").toLowerCase(), co = (c.companyName ?? "").toLowerCase();
    let score = 0;
    if (ln.length > 2 && hay.includes(ln)) score += 2;
    if (fn.length > 2 && hay.includes(fn)) score += 1;
    if (co.length > 2 && hay.includes(co)) score += 2;
    if (score > bestScore) { bestScore = score; best = c.id; }
  }
  return bestScore > 0 ? best : null;
}
function suggestPiano(files: ParsedFile[], pianos: Piano[]): number | null {
  const hay = fileHay(files);
  let best: number | null = null, bestScore = 0;
  for (const p of pianos) {
    const mk = (p.make ?? "").toLowerCase(), md = (p.model ?? "").toLowerCase();
    let score = 0;
    if (mk.length > 1 && hay.includes(mk)) score += 2;
    if (md.length > 0 && hay.includes(md)) score += 2;
    if (score > bestScore) { bestScore = score; best = p.id; }
  }
  return bestScore > 0 ? best : null;
}
// Guess make/model when creating a new piano from a name-only file.
function guessMakeModel(s: PianoscopeSummary): { make: string; model: string } {
  if (s.manufacturer || s.model) return { make: s.manufacturer ?? "", model: s.model ?? "" };
  const name = (s.name ?? "").trim();
  if (!name) return { make: "", model: "" };
  const parts = name.split(/\s+/);
  return { make: parts[0] ?? "", model: parts.slice(1).join(" ") };
}

// ─── page ───────────────────────────────────────────────────────────────────────
export default function ImportPianoscopePage() {
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const inputRef = useRef<HTMLInputElement>(null);

  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });
  const { data: pianos = [] } = useQuery<Piano[]>({ queryKey: ["/api/pianos"] });

  const [groups, setGroups] = useState<Group[]>([]);
  const [errors, setErrors] = useState<string[]>([]);
  const [hot, setHot] = useState(false);
  const [importing, setImporting] = useState(false);
  const [done, setDone] = useState<{ records: number; pianos: number } | null>(null);
  const [report, setReport] = useState<{ summary: PianoscopeSummary; title: string } | null>(null);

  const customerOptions = useMemo(
    () => customers
      .slice()
      .sort((a, b) => (a.lastName + a.firstName).localeCompare(b.lastName + b.firstName))
      .map((c) => ({ id: c.id as number, label: `${c.firstName} ${c.lastName}`, sub: [c.companyName, c.city].filter(Boolean).join(" · ") || undefined })),
    [customers],
  );

  const pianoOptionsFor = (clientId: number | null, g: Group) => {
    const opts: { id: number | "new"; label: string; sub?: string }[] = [];
    if (clientId != null) {
      for (const p of pianos.filter((p) => p.customerId === clientId)) {
        opts.push({ id: p.id as number, label: [p.year, p.make, p.model].filter(Boolean).join(" ") || "Piano", sub: p.serialNumber ? `S/N ${p.serialNumber}` : undefined });
      }
    }
    const gm = guessMakeModel(g.files[0].summary);
    opts.push({ id: "new", label: `＋ New piano: ${[gm.make, gm.model].filter(Boolean).join(" ") || "from file"}` });
    return opts;
  };

  const handleFiles = async (fileList: FileList) => {
    const files = Array.from(fileList);
    const parsed: ParsedFile[] = [];
    const errs: string[] = [];
    for (const f of files) {
      try {
        const text = await f.text();
        const summary = parsePianoscopeText(text, f.name);
        parsed.push({ fileName: f.name, summary, iso: summary.measuredAt ?? new Date().toISOString() });
      } catch (e) {
        errs.push(`${f.name}: ${e instanceof PianoscopeParseError ? e.message : "couldn't read"}`);
      }
    }

    // group by fingerprint (same instrument across visits); fall back to name.
    const built: Group[] = [];
    for (const pf of parsed) {
      let g = built.find((grp) => {
        const rep = grp.files[0].summary;
        if (rep.fingerprint && pf.summary.fingerprint) return fingerprintsMatch(rep.fingerprint, pf.summary.fingerprint);
        return (rep.name ?? "").toLowerCase() === (pf.summary.name ?? "").toLowerCase() && !!pf.summary.name;
      });
      if (!g) {
        g = { id: `g${built.length}`, files: [], clientId: null, pianoId: null, skip: false };
        built.push(g);
      }
      g.files.push(pf);
    }
    // sort visits newest-first, then compute suggestions
    for (const g of built) {
      g.files.sort((a, b) => b.iso.localeCompare(a.iso));
      g.clientId = suggestClient(g.files, customers);
      if (g.clientId != null) {
        g.pianoId = suggestPiano(g.files, pianos.filter((p) => p.customerId === g!.clientId)) ?? "new";
      }
    }
    setGroups((prev) => [...prev, ...built]);
    setErrors(errs);
    setDone(null);
  };

  const setGroup = (id: string, patch: Partial<Group>) =>
    setGroups((gs) => gs.map((g) => (g.id === id ? { ...g, ...patch } : g)));

  const readyCount = groups.filter((g) => !g.skip && g.clientId != null && g.pianoId != null).length;

  const runImport = async () => {
    setImporting(true);
    let records = 0, newPianos = 0;
    try {
      for (const g of groups) {
        if (g.skip || g.clientId == null || g.pianoId == null) continue;
        let pid: number;
        if (g.pianoId === "new") {
          const gm = guessMakeModel(g.files[0].summary);
          const res = await apiRequest("POST", `/api/customers/${g.clientId}/pianos`, { make: gm.make || null, model: gm.model || null });
          const created = await res.json();
          pid = created.id;
          newPianos++;
        } else {
          pid = g.pianoId;
        }
        // dedup against existing records on this piano (by measurement date)
        let existingDates = new Set<string>();
        try {
          const cur = await (await apiRequest("GET", `/api/pianos/${pid}/services`)).json();
          for (const r of cur as any[]) if (r.serviceDate) existingDates.add(r.serviceDate);
        } catch { /* ignore */ }
        // import each visit oldest-first so lastTuned ends on the newest
        for (const pf of g.files.slice().reverse()) {
          const dateLabel = measurementDateLabel(pf.summary);
          if (existingDates.has(dateLabel)) continue;
          await apiRequest("POST", `/api/pianos/${pid}/services`, {
            serviceDate: dateLabel,
            serviceType: suggestServiceType(pf.summary),
            notes: "",
            pianoscope: serializePianoscope(pf.summary),
          });
          records++;
        }
      }
      queryClient.invalidateQueries({ queryKey: ["/api/pianos"] });
      queryClient.invalidateQueries({ queryKey: ["/api/customers"] });
      setDone({ records, pianos: newPianos });
      setGroups([]);
      toast({ title: `Imported ${records} tuning${records === 1 ? "" : "s"}` });
    } catch (e: any) {
      toast({ title: "Import failed", description: e?.message, variant: "destructive" });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-4">
      <Button variant="ghost" size="sm" onClick={() => navigate("/pianos")} className="px-2"><ChevronLeft className="h-4 w-4 mr-1" /> Pianos</Button>
      <div>
        <h1 className="text-2xl">Import Pianoscope Files</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Select all your <code>.pianoscope</code> files from iCloud at once. Multiple visits of the same piano are grouped automatically.
          Confirm the client, then the piano, for each — dates come from the files.
        </p>
      </div>

      {/* drop zone */}
      <div
        className={`rounded-xl border-2 border-dashed p-6 text-center cursor-pointer transition-colors ${hot ? "border-primary bg-primary/5" : "border-muted-foreground/30 bg-muted/20"}`}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setHot(true); }}
        onDragLeave={() => setHot(false)}
        onDrop={(e) => { e.preventDefault(); setHot(false); if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files); }}
        data-testid="dropzone-bulk"
      >
        <Upload className="h-6 w-6 mx-auto text-muted-foreground" />
        <div className="text-sm mt-2"><b>Drop your .pianoscope files here</b> or tap to choose</div>
        <div className="text-xs text-muted-foreground mt-1">On a Mac: iCloud Drive → the Pianoscope folder → select all (⌘A).</div>
        <input ref={inputRef} type="file" accept=".pianoscope,application/json" multiple className="hidden"
          onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = ""; }}
          data-testid="input-bulk-files" />
      </div>

      {errors.length > 0 && (
        <div className="rounded-lg border border-amber-400/60 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm">
          <div className="font-semibold flex items-center gap-1.5 text-amber-700 dark:text-amber-400"><AlertCircle className="h-4 w-4" /> {errors.length} file(s) skipped</div>
          <ul className="list-disc ml-5 mt-1 text-xs text-muted-foreground">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
      )}

      {done && (
        <div className="rounded-lg border border-emerald-500/60 bg-emerald-50 dark:bg-emerald-950/30 p-4 text-sm">
          <div className="font-semibold flex items-center gap-1.5 text-emerald-700 dark:text-emerald-400"><Check className="h-4 w-4" /> Imported {done.records} tuning record(s){done.pianos ? `, created ${done.pianos} new piano(s)` : ""}.</div>
          <Button variant="secondary" size="sm" className="mt-2" onClick={() => navigate("/pianos")}>Go to Pianos</Button>
        </div>
      )}

      {/* review list */}
      {groups.length > 0 && (
        <>
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{groups.length} piano(s) · {groups.reduce((n, g) => n + g.files.length, 0)} tuning file(s) · <span className="text-foreground font-medium">{readyCount} ready</span></p>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => setGroups([])} disabled={importing}>Clear</Button>
              <Button size="sm" onClick={runImport} disabled={importing || readyCount === 0} data-testid="button-run-import">
                {importing ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> Importing…</> : `Import ${readyCount} piano(s)`}
              </Button>
            </div>
          </div>

          {groups.map((g) => {
            const rep = g.files[0].summary;
            const dates = g.files.map((f) => measurementDateLabel(f.summary));
            const ready = !g.skip && g.clientId != null && g.pianoId != null;
            return (
              <div key={g.id} className={`rounded-xl border p-4 space-y-3 ${g.skip ? "opacity-50" : ""}`}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div>
                    <div className="font-semibold">{fileLabel(rep)}{rep.name && fileLabel(rep) !== rep.name ? <span className="text-muted-foreground font-normal"> · “{rep.name}”</span> : null}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{g.files.length} visit(s): {dates.join(", ")}</div>
                    <div className="mt-1.5"><PianoscopeChips summary={rep} /></div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Button variant="ghost" size="sm" className="h-7" onClick={() => setReport({ summary: rep, title: `${fileLabel(rep)} · ${dates[0]}` })}>
                      <LineChart className="h-3.5 w-3.5 mr-1.5" /> Report
                    </Button>
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                      <Checkbox checked={g.skip} onCheckedChange={(v) => setGroup(g.id, { skip: !!v })} /> Skip
                    </label>
                  </div>
                </div>

                {!g.skip && (
                  <div className="grid sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">1 · Client {g.clientId == null && <span className="text-amber-600">(needs review)</span>}</Label>
                      <SearchSelect
                        value={g.clientId}
                        onChange={(v) => setGroup(g.id, { clientId: v as number, pianoId: v == null ? null : (suggestPiano(g.files, pianos.filter((p) => p.customerId === v)) ?? "new") })}
                        options={customerOptions}
                        placeholder="— choose client —"
                        testId={`select-client-${g.id}`}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-muted-foreground">2 · Piano</Label>
                      {g.clientId == null ? (
                        <div className="text-sm text-muted-foreground py-2">Choose a client first</div>
                      ) : (
                        <SearchSelect
                          value={g.pianoId}
                          onChange={(v) => setGroup(g.id, { pianoId: v })}
                          options={pianoOptionsFor(g.clientId, g)}
                          placeholder="— choose piano —"
                          testId={`select-piano-${g.id}`}
                        />
                      )}
                    </div>
                  </div>
                )}

                <div className="text-xs">
                  {g.skip ? <span className="text-muted-foreground">Skipped</span>
                    : ready ? <span className="text-emerald-600 inline-flex items-center gap-1"><Check className="h-3.5 w-3.5" /> Ready to import</span>
                    : <span className="text-amber-600 inline-flex items-center gap-1"><AlertCircle className="h-3.5 w-3.5" /> {g.clientId == null ? "Assign a client" : "Assign a piano"}</span>}
                </div>
              </div>
            );
          })}
        </>
      )}

      <PianoscopeReportDialog summary={report?.summary ?? null} open={!!report} onOpenChange={(o) => !o && setReport(null)} title={report?.title} />
    </div>
  );
}
