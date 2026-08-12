import { useMemo, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Search, ArrowRight, AlertTriangle, Music, Check, Users } from "lucide-react";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import type { Piano, Customer } from "@shared/schema";
import { clientNameWithContact } from "@shared/client-name";

// ─── helpers ────────────────────────────────────────────────────────────────

export function customerLabel(c: Customer | undefined | null): string {
  return clientNameWithContact(c);
}

export function pianoLabel(p: Piano | undefined | null): string {
  if (!p) return "Unknown piano";
  const parts = [p.make, p.model, p.pianoType].filter(Boolean).join(" ");
  return parts || `Piano #${p.id}`;
}

function pianoSubLabel(p: Piano): string {
  const bits: string[] = [];
  if (p.serialNumber) bits.push(`Serial ${p.serialNumber}`);
  if (p.year) bits.push(p.year);
  if (p.location) bits.push(p.location);
  if (p.lastTuned) bits.push(`Tuned ${p.lastTuned}`);
  return bits.join(" · ");
}

function customerHaystack(c: Customer): string {
  return [c.firstName, c.lastName, c.companyName, c.email, c.phone, c.city, c.address]
    .filter(Boolean).join(" ").toLowerCase();
}

/** "3 service records, 1 invoice" — skips anything that's zero. */
function summarizeCounts(counts: Record<string, number>): string {
  const labels: Record<string, [string, string]> = {
    serviceRecords: ["service record", "service records"],
    appointments: ["appointment", "appointments"],
    tripAppointments: ["trip appointment", "trip appointments"],
    invoices: ["invoice", "invoices"],
    inspections: ["estimate", "estimates"],
  };
  const parts = Object.entries(labels)
    .map(([key, [one, many]]) => {
      const n = counts[key] ?? 0;
      return n > 0 ? `${n} ${n === 1 ? one : many}` : null;
    })
    .filter(Boolean);
  return parts.length ? parts.join(", ") : "no attached records";
}

// ─── Reassign piano to a different client ───────────────────────────────────

interface ReassignProps {
  piano: Piano;
  currentOwner: Customer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

export function ReassignPianoDialog({ piano, currentOwner, open, onOpenChange, onDone }: ReassignProps) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [pickedId, setPickedId] = useState<number | null>(null);

  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"], enabled: open });

  const matches = useMemo(() => {
    const list = (customers ?? []).filter(c => c.id !== currentOwner.id);
    const q = search.trim().toLowerCase();
    const filtered = q ? list.filter(c => customerHaystack(c).includes(q)) : list;
    return filtered
      .sort((a, b) => customerLabel(a).localeCompare(customerLabel(b)))
      .slice(0, 60);
  }, [customers, search, currentOwner.id]);

  const picked = (customers ?? []).find(c => c.id === pickedId) ?? null;

  const reassign = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/pianos/${piano.id}/reassign`, { customerId: pickedId });
      return res.json();
    },
    onSuccess: (data: any) => {
      const moved = data?.moved ?? {};
      const skipped = moved.skippedShared ?? 0;
      toast({
        title: `Moved to ${customerLabel(picked)}`,
        description: skipped > 0
          ? `Brought ${summarizeCounts(moved)}. ${skipped} shared visit${skipped === 1 ? "" : "s"} stayed with ${customerLabel(currentOwner)} because ${skipped === 1 ? "it covers" : "they cover"} other pianos too.`
          : `Brought ${summarizeCounts(moved)} along.`,
      });
      onOpenChange(false);
      setSearch("");
      setPickedId(null);
      onDone();
    },
    onError: (err: any) => toast({
      title: "Couldn't move the piano",
      description: String(err?.message ?? "").replace(/^\d+:\s*/, ""),
      variant: "destructive",
    }),
  });

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!reassign.isPending) { onOpenChange(o); if (!o) { setSearch(""); setPickedId(null); } } }}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign piano to a different client</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="flex items-center gap-2 font-medium">
              <Music className="h-4 w-4 text-muted-foreground" />
              {pianoLabel(piano)}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-2 text-muted-foreground">
              <span>{customerLabel(currentOwner)}</span>
              <ArrowRight className="h-3.5 w-3.5" />
              <span className={picked ? "font-medium text-foreground" : "italic"}>
                {picked ? customerLabel(picked) : "pick a client below"}
              </span>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Move to</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search clients by name, company, city…"
                className="pl-8"
                data-testid="input-reassign-search"
              />
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
            {matches.length === 0 && (
              <div className="p-4 text-center text-sm text-muted-foreground">
                No clients match. If the new client doesn't exist yet, add them on the Clients page first.
              </div>
            )}
            {matches.map((c) => (
              <button
                key={c.id}
                type="button"
                onClick={() => setPickedId(c.id)}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted ${pickedId === c.id ? "bg-muted" : ""}`}
                data-testid={`reassign-client-${c.id}`}
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{customerLabel(c)}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {[c.city, c.phone].filter(Boolean).join(" · ") || "—"}
                  </div>
                </div>
                {pickedId === c.id && <Check className="h-4 w-4 shrink-0 text-primary" />}
              </button>
            ))}
          </div>

          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-muted-foreground">
            <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
              <AlertTriangle className="h-3.5 w-3.5" /> What moves
            </div>
            The piano and everything attached to it — service history, appointments, invoices, and
            estimates — all follow it to the new client. Visits that also covered the old client's
            other pianos stay put, so a shared invoice isn't rewritten.
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={reassign.isPending}>Cancel</Button>
            <Button
              onClick={() => reassign.mutate()}
              disabled={!pickedId || reassign.isPending}
              data-testid="button-confirm-reassign"
            >
              {reassign.isPending ? "Moving…" : "Move piano"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Merge two piano records ────────────────────────────────────────────────

interface MergeProps {
  piano: Piano;
  currentOwner: Customer;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone: () => void;
}

export function MergePianosDialog({ piano, currentOwner, open, onOpenChange, onDone }: MergeProps) {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [pickedId, setPickedId] = useState<number | null>(null);
  const [confirmed, setConfirmed] = useState(false);

  const { data: allPianos } = useQuery<Piano[]>({ queryKey: ["/api/pianos"], enabled: open });
  const { data: customers } = useQuery<Customer[]>({ queryKey: ["/api/customers"], enabled: open });

  const ownerOf = (p: Piano) => (customers ?? []).find(c => c.id === p.customerId);

  const matches = useMemo(() => {
    const list = (allPianos ?? []).filter(p => p.id !== piano.id);
    const q = search.trim().toLowerCase();
    const filtered = q
      ? list.filter(p =>
          [pianoLabel(p), p.serialNumber, customerLabel(ownerOf(p))]
            .filter(Boolean).join(" ").toLowerCase().includes(q))
      : list;
    // Same client first — those are the likeliest duplicates.
    return filtered
      .sort((a, b) => {
        const aSame = a.customerId === piano.customerId ? 0 : 1;
        const bSame = b.customerId === piano.customerId ? 0 : 1;
        if (aSame !== bSame) return aSame - bSame;
        return pianoLabel(a).localeCompare(pianoLabel(b));
      })
      .slice(0, 60);
  }, [allPianos, customers, search, piano.id, piano.customerId]);

  const picked = (allPianos ?? []).find(p => p.id === pickedId) ?? null;
  const pickedOwner = picked ? ownerOf(picked) : null;
  const crossClient = !!picked && picked.customerId !== piano.customerId;

  const merge = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/pianos/${piano.id}/merge`, { mergePianoId: pickedId });
      return res.json();
    },
    onSuccess: (data: any) => {
      toast({
        title: "Pianos merged",
        description: `Moved ${summarizeCounts(data?.merged ?? {})} onto ${pianoLabel(piano)}. The duplicate record is gone.`,
      });
      onOpenChange(false);
      setSearch("");
      setPickedId(null);
      setConfirmed(false);
      onDone();
    },
    onError: (err: any) => toast({
      title: "Couldn't merge",
      description: String(err?.message ?? "").replace(/^\d+:\s*/, ""),
      variant: "destructive",
    }),
  });

  const close = (o: boolean) => {
    if (merge.isPending) return;
    onOpenChange(o);
    if (!o) { setSearch(""); setPickedId(null); setConfirmed(false); }
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Merge pianos</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div className="rounded-md border bg-muted/40 p-3 text-sm">
            <div className="mb-1 text-xs uppercase tracking-wide text-muted-foreground">Keeping this record</div>
            <div className="flex items-center gap-2 font-medium">
              <Music className="h-4 w-4 text-muted-foreground" />
              {pianoLabel(piano)}
            </div>
            <div className="mt-0.5 text-xs text-muted-foreground">
              {customerLabel(currentOwner)}{pianoSubLabel(piano) ? ` · ${pianoSubLabel(piano)}` : ""}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">Duplicate to merge in (this record disappears)</Label>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by make, model, serial, or client…"
                className="pl-8"
                data-testid="input-merge-search"
              />
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto rounded-md border divide-y">
            {matches.length === 0 && (
              <div className="p-4 text-center text-sm text-muted-foreground">No other pianos match.</div>
            )}
            {matches.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => { setPickedId(p.id); setConfirmed(false); }}
                className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-muted ${pickedId === p.id ? "bg-muted" : ""}`}
                data-testid={`merge-piano-${p.id}`}
              >
                <div className="min-w-0">
                  <div className="truncate font-medium">{pianoLabel(p)}</div>
                  <div className="truncate text-xs text-muted-foreground">
                    {customerLabel(ownerOf(p))}{pianoSubLabel(p) ? ` · ${pianoSubLabel(p)}` : ""}
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {p.customerId !== piano.customerId && (
                    <Badge variant="outline" className="text-[10px]">other client</Badge>
                  )}
                  {pickedId === p.id && <Check className="h-4 w-4 text-primary" />}
                </div>
              </button>
            ))}
          </div>

          {picked && (
            <div className="space-y-3">
              <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-muted-foreground">
                <div className="mb-1 flex items-center gap-1.5 font-medium text-foreground">
                  <AlertTriangle className="h-3.5 w-3.5" /> This can't be undone
                </div>
                Everything on <span className="font-medium text-foreground">{pianoLabel(picked)}</span> — service
                history, appointments, invoices, estimates, and photos — moves onto{" "}
                <span className="font-medium text-foreground">{pianoLabel(piano)}</span>, then the duplicate record is
                deleted. Details you've filled in on the record you're keeping win; blanks get filled from the duplicate.
              </div>

              {crossClient && (
                <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/10 p-3 text-xs">
                  <Users className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
                  <div>
                    <div className="font-medium text-foreground">These belong to different clients</div>
                    <div className="text-muted-foreground">
                      {customerLabel(pickedOwner)}'s records — including invoices — will be re-billed to{" "}
                      {customerLabel(currentOwner)}. Only do this if they're truly the same instrument.
                    </div>
                  </div>
                </div>
              )}

              <label className="flex cursor-pointer items-start gap-2 text-xs">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                  className="mt-0.5"
                  data-testid="checkbox-confirm-merge"
                />
                <span>I understand the duplicate record will be permanently deleted.</span>
              </label>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => close(false)} disabled={merge.isPending}>Cancel</Button>
            <Button
              variant="destructive"
              onClick={() => merge.mutate()}
              disabled={!pickedId || !confirmed || merge.isPending}
              data-testid="button-confirm-merge"
            >
              {merge.isPending ? "Merging…" : "Merge pianos"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
