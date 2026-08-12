import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Link, useLocation } from "wouter";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { formatPhone } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import {
  Plus,
  Search,
  ClipboardList,
  CheckCircle,
  XCircle,
  Clock,
  FileText,
  MoreHorizontal,
  Trash2,
  Edit,
  DollarSign,
  AlertTriangle,
  Music,
  User,
  Calendar,
  ArrowRight,
  CheckSquare,
  Square,
} from "lucide-react";
import type { Inspection, Customer, Piano } from "@shared/schema";
import { clientName, clientSearchText } from "@shared/client-name";

// ── Types ──────────────────────────────────────────────────────────────────

interface ChecklistItem {
  item: string;
  status: "ok" | "needs_attention" | "critical" | "na";
  notes: string;
}

interface RecommendedService {
  service: string;
  estimatedCost: string;
}

const DEFAULT_CHECKLIST: ChecklistItem[] = [
  { item: "Tuning pins — tightness & condition", status: "ok", notes: "" },
  { item: "Pin block — cracks, condition", status: "ok", notes: "" },
  { item: "Strings — broken, rusted, wound", status: "ok", notes: "" },
  { item: "Soundboard — cracks, ribs, belly", status: "ok", notes: "" },
  { item: "Bridges — cracks, condition", status: "ok", notes: "" },
  { item: "Dampers — felt, alignment, function", status: "ok", notes: "" },
  { item: "Hammers — voicing, grooving, alignment", status: "ok", notes: "" },
  { item: "Action — regulation, lost motion", status: "ok", notes: "" },
  { item: "Keys — level, weight, ivory/plastic", status: "ok", notes: "" },
  { item: "Pedals — function, squeaks, sustain", status: "ok", notes: "" },
  { item: "Case — finish, hardware, lid", status: "ok", notes: "" },
  { item: "Fallboard & music desk", status: "ok", notes: "" },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

function parseChecklist(raw: string | null | undefined): ChecklistItem[] {
  if (!raw) return DEFAULT_CHECKLIST;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : DEFAULT_CHECKLIST;
  } catch {
    return DEFAULT_CHECKLIST;
  }
}

function parseRecommended(raw: string | null | undefined): RecommendedService[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function statusColor(status: string) {
  switch (status) {
    case "approved": return "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700";
    case "declined": return "bg-red-500/10 text-red-700 dark:text-red-400 border-red-300 dark:border-red-700";
    case "converted": return "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-300 dark:border-blue-700";
    default: return "bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-300 dark:border-yellow-700";
  }
}

function conditionColor(condition: string | null | undefined) {
  switch (condition) {
    case "excellent": return "text-emerald-600 dark:text-emerald-400";
    case "good": return "text-blue-600 dark:text-blue-400";
    case "fair": return "text-yellow-600 dark:text-yellow-400";
    case "poor": return "text-red-600 dark:text-red-400";
    default: return "text-muted-foreground";
  }
}

function checklistStatusIcon(status: string) {
  switch (status) {
    case "ok": return <CheckCircle className="h-4 w-4 text-emerald-500" />;
    case "needs_attention": return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
    case "critical": return <XCircle className="h-4 w-4 text-red-500" />;
    default: return <Square className="h-4 w-4 text-muted-foreground" />;
  }
}

// ── New Inspection Dialog ───────────────────────────────────────────────────

function NewInspectionDialog({
  open,
  onOpenChange,
  customers,
  pianos,
  prefillCustomerId,
  prefillPianoId,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  customers: Customer[];
  pianos: Piano[];
  prefillCustomerId?: number;
  prefillPianoId?: number;
}) {
  const { toast } = useToast();
  const today = new Date();
  const dateStr = `${today.getMonth() + 1}/${today.getDate()}/${String(today.getFullYear()).slice(-2)}`;

  const [form, setForm] = useState({
    customerId: prefillCustomerId ? String(prefillCustomerId) : "",
    pianoId: prefillPianoId ? String(prefillPianoId) : "",
    type: "inspection" as "inspection" | "estimate",
    inspectionDate: dateStr,
    overallCondition: "",
    findings: "",
    summary: "",
    estimatedTotal: "",
    internalNotes: "",
  });
  const [checklist, setChecklist] = useState<ChecklistItem[]>(DEFAULT_CHECKLIST.map(i => ({ ...i })));
  const [recommended, setRecommended] = useState<RecommendedService[]>([{ service: "", estimatedCost: "" }]);

  const customerPianos = useMemo(
    () => pianos.filter(p => p.customerId === parseInt(form.customerId) && p.isActive !== false),
    [pianos, form.customerId]
  );

  const createMutation = useMutation({
    mutationFn: async (data: any) => apiRequest("POST", "/api/inspections", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspections"] });
      toast({ title: "Inspection created" });
      onOpenChange(false);
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function handleSave() {
    if (!form.customerId || !form.inspectionDate) {
      toast({ title: "Required fields missing", description: "Customer and date are required.", variant: "destructive" });
      return;
    }
    createMutation.mutate({
      customerId: parseInt(form.customerId),
      pianoId: form.pianoId ? parseInt(form.pianoId) : null,
      type: form.type,
      inspectionDate: form.inspectionDate,
      status: "pending",
      overallCondition: form.overallCondition || null,
      findings: form.findings || null,
      summary: form.summary || null,
      estimatedTotal: form.estimatedTotal || null,
      internalNotes: form.internalNotes || null,
      checklistItems: JSON.stringify(checklist),
      recommendedServices: JSON.stringify(recommended.filter(r => r.service.trim())),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New {form.type === "estimate" ? "Estimate" : "Inspection"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Type */}
          <div className="flex gap-2">
            {(["inspection", "estimate"] as const).map(t => (
              <Button
                key={t}
                variant={form.type === t ? "default" : "outline"}
                size="sm"
                onClick={() => setForm(f => ({ ...f, type: t }))}
                className="capitalize"
              >
                {t === "inspection" ? <ClipboardList className="h-3.5 w-3.5 mr-1.5" /> : <FileText className="h-3.5 w-3.5 mr-1.5" />}
                {t}
              </Button>
            ))}
          </div>

          <div className="grid grid-cols-2 gap-3">
            {/* Customer */}
            <div className="space-y-1">
              <Label>Customer *</Label>
              <Select
                value={form.customerId}
                onValueChange={v => setForm(f => ({ ...f, customerId: v, pianoId: "" }))}
              >
                <SelectTrigger><SelectValue placeholder="Select client…" /></SelectTrigger>
                <SelectContent>
                  {customers.map(c => (
                    <SelectItem key={c.id} value={String(c.id)}>
                      {clientName(c)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Piano */}
            <div className="space-y-1">
              <Label>Piano</Label>
              <Select
                value={form.pianoId}
                onValueChange={v => setForm(f => ({ ...f, pianoId: v }))}
                disabled={!form.customerId}
              >
                <SelectTrigger><SelectValue placeholder="Select piano…" /></SelectTrigger>
                <SelectContent>
                  {customerPianos.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {[p.make, p.model, p.pianoType].filter(Boolean).join(" ") || `Piano #${p.id}`}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Date */}
            <div className="space-y-1">
              <Label>Date *</Label>
              <Input
                placeholder="M/D/YY"
                value={form.inspectionDate}
                onChange={e => setForm(f => ({ ...f, inspectionDate: e.target.value }))}
              />
            </div>

            {/* Overall Condition */}
            <div className="space-y-1">
              <Label>Overall Condition</Label>
              <Select
                value={form.overallCondition}
                onValueChange={v => setForm(f => ({ ...f, overallCondition: v }))}
              >
                <SelectTrigger><SelectValue placeholder="Select…" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="excellent">Excellent</SelectItem>
                  <SelectItem value="good">Good</SelectItem>
                  <SelectItem value="fair">Fair</SelectItem>
                  <SelectItem value="poor">Poor</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Checklist */}
          <div>
            <Label className="text-sm font-semibold mb-2 block">Inspection Checklist</Label>
            <div className="border rounded-md overflow-hidden">
              {checklist.map((item, i) => (
                <div key={i} className="flex items-start gap-2 p-2 border-b last:border-0 hover:bg-muted/30">
                  <div className="pt-0.5">
                    <Select
                      value={item.status}
                      onValueChange={v => {
                        const next = [...checklist];
                        next[i] = { ...next[i], status: v as any };
                        setChecklist(next);
                      }}
                    >
                      <SelectTrigger className="w-[120px] h-7 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ok">✅ OK</SelectItem>
                        <SelectItem value="needs_attention">⚠️ Attention</SelectItem>
                        <SelectItem value="critical">🔴 Critical</SelectItem>
                        <SelectItem value="na">— N/A</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium">{item.item}</p>
                    <Input
                      className="h-6 text-xs mt-1"
                      placeholder="Notes…"
                      value={item.notes}
                      onChange={e => {
                        const next = [...checklist];
                        next[i] = { ...next[i], notes: e.target.value };
                        setChecklist(next);
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Findings */}
          <div className="space-y-1">
            <Label>Findings / Details</Label>
            <Textarea
              placeholder="Describe what you found…"
              value={form.findings}
              onChange={e => setForm(f => ({ ...f, findings: e.target.value }))}
              rows={3}
            />
          </div>

          {/* Recommended Services */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <Label className="text-sm font-semibold">Recommended Services</Label>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => setRecommended(r => [...r, { service: "", estimatedCost: "" }])}
              >
                <Plus className="h-3 w-3 mr-1" /> Add
              </Button>
            </div>
            <div className="space-y-2">
              {recommended.map((r, i) => (
                <div key={i} className="flex gap-2 items-center">
                  <Input
                    className="flex-1 h-8 text-sm"
                    placeholder="Service description…"
                    value={r.service}
                    onChange={e => {
                      const next = [...recommended];
                      next[i] = { ...next[i], service: e.target.value };
                      setRecommended(next);
                    }}
                  />
                  <Input
                    className="w-24 h-8 text-sm"
                    placeholder="$0.00"
                    value={r.estimatedCost}
                    onChange={e => {
                      const next = [...recommended];
                      next[i] = { ...next[i], estimatedCost: e.target.value };
                      setRecommended(next);
                    }}
                  />
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 shrink-0"
                    onClick={() => setRecommended(r => r.filter((_, j) => j !== i))}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              ))}
            </div>
            {recommended.filter(r => r.estimatedCost).length > 0 && (
              <div className="mt-1 flex items-center gap-2">
                <Label className="text-xs text-muted-foreground">Est. Total</Label>
                <Input
                  className="w-28 h-7 text-sm"
                  placeholder="$0.00"
                  value={form.estimatedTotal}
                  onChange={e => setForm(f => ({ ...f, estimatedTotal: e.target.value }))}
                />
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="space-y-1">
            <Label>Summary (for client)</Label>
            <Textarea
              placeholder="What the client needs to know…"
              value={form.summary}
              onChange={e => setForm(f => ({ ...f, summary: e.target.value }))}
              rows={2}
            />
          </div>

          {/* Internal Notes */}
          <div className="space-y-1">
            <Label>Internal Notes</Label>
            <Textarea
              placeholder="Private notes…"
              value={form.internalNotes}
              onChange={e => setForm(f => ({ ...f, internalNotes: e.target.value }))}
              rows={2}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={createMutation.isPending}>
            Create {form.type === "estimate" ? "Estimate" : "Inspection"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Inspection Detail Dialog ────────────────────────────────────────────────

function InspectionDetailDialog({
  inspection,
  customer,
  piano,
  open,
  onOpenChange,
}: {
  inspection: Inspection | null;
  customer: Customer | undefined;
  piano: Piano | undefined;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState(inspection?.status ?? "pending");

  const checklist = parseChecklist(inspection?.checklistItems);
  const recommended = parseRecommended(inspection?.recommendedServices);

  const statusMutation = useMutation({
    mutationFn: (newStatus: string) =>
      apiRequest("PATCH", `/api/inspections/${inspection!.id}`, { status: newStatus }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspections"] });
      toast({ title: "Status updated" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: () => apiRequest("DELETE", `/api/inspections/${inspection!.id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspections"] });
      toast({ title: "Deleted" });
      onOpenChange(false);
    },
  });

  if (!inspection) return null;

  const criticalItems = checklist.filter(i => i.status === "critical");
  const attentionItems = checklist.filter(i => i.status === "needs_attention");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-start justify-between gap-2">
            <div>
              <DialogTitle className="capitalize">
                {inspection.type === "estimate" ? "Estimate" : "Inspection"} — {inspection.inspectionDate}
              </DialogTitle>
              {customer && (
                <Link href={`/customers/${customer.id}`}>
                  <p className="text-sm text-muted-foreground hover:underline cursor-pointer mt-0.5">
                    {clientName(customer)}
                    {piano && ` · ${[piano.make, piano.pianoType].filter(Boolean).join(" ")}`}
                  </p>
                </Link>
              )}
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <Badge className={`border text-xs ${statusColor(inspection.status)}`}>
                {inspection.status}
              </Badge>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-5">
          {/* Quick stats */}
          <div className="flex flex-wrap gap-3">
            {inspection.overallCondition && (
              <div className="text-sm">
                <span className="text-muted-foreground">Condition: </span>
                <span className={`font-semibold capitalize ${conditionColor(inspection.overallCondition)}`}>
                  {inspection.overallCondition}
                </span>
              </div>
            )}
            {inspection.estimatedTotal && (
              <div className="text-sm">
                <span className="text-muted-foreground">Est. Total: </span>
                <span className="font-semibold">{inspection.estimatedTotal}</span>
              </div>
            )}
            {criticalItems.length > 0 && (
              <Badge variant="destructive" className="text-xs">
                {criticalItems.length} critical
              </Badge>
            )}
            {attentionItems.length > 0 && (
              <Badge className="text-xs bg-yellow-500/10 text-yellow-700 dark:text-yellow-400 border-yellow-300">
                {attentionItems.length} need attention
              </Badge>
            )}
          </div>

          {/* Status actions */}
          <div className="flex gap-2 flex-wrap">
            {(["pending", "approved", "declined", "converted"] as const).map(s => (
              <Button
                key={s}
                variant={inspection.status === s ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs capitalize"
                onClick={() => statusMutation.mutate(s)}
                disabled={statusMutation.isPending}
              >
                {s}
              </Button>
            ))}
          </div>

          {/* Checklist summary */}
          {checklist.length > 0 && (
            <div>
              <p className="text-sm font-semibold mb-2">Checklist</p>
              <div className="grid gap-1">
                {checklist.filter(i => i.status !== "ok" && i.status !== "na").map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm p-2 rounded-md bg-muted/40">
                    {checklistStatusIcon(item.status)}
                    <div>
                      <span className="font-medium">{item.item}</span>
                      {item.notes && <span className="text-muted-foreground ml-2">— {item.notes}</span>}
                    </div>
                  </div>
                ))}
                {checklist.filter(i => i.status !== "ok" && i.status !== "na").length === 0 && (
                  <p className="text-sm text-muted-foreground flex items-center gap-1.5">
                    <CheckSquare className="h-4 w-4 text-emerald-500" /> All items OK
                  </p>
                )}
              </div>
              <details className="mt-2">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                  Show all checklist items
                </summary>
                <div className="mt-2 grid gap-1">
                  {checklist.map((item, i) => (
                    <div key={i} className="flex items-start gap-2 text-sm py-1">
                      {checklistStatusIcon(item.status)}
                      <span className={item.status === "ok" ? "text-muted-foreground" : ""}>{item.item}</span>
                      {item.notes && <span className="text-muted-foreground text-xs">— {item.notes}</span>}
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}

          {/* Findings */}
          {inspection.findings && (
            <div>
              <p className="text-sm font-semibold mb-1">Findings</p>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{inspection.findings}</p>
            </div>
          )}

          {/* Recommended services */}
          {recommended.length > 0 && (
            <div>
              <p className="text-sm font-semibold mb-2">Recommended Services</p>
              <div className="space-y-1">
                {recommended.map((r, i) => (
                  <div key={i} className="flex items-center justify-between text-sm py-1 border-b last:border-0">
                    <span>{r.service}</span>
                    {r.estimatedCost && <span className="font-medium tabular-nums">{r.estimatedCost}</span>}
                  </div>
                ))}
                {inspection.estimatedTotal && (
                  <div className="flex items-center justify-between text-sm font-semibold pt-1">
                    <span>Estimated Total</span>
                    <span>{inspection.estimatedTotal}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Summary */}
          {inspection.summary && (
            <div>
              <p className="text-sm font-semibold mb-1">Summary (for client)</p>
              <p className="text-sm text-muted-foreground whitespace-pre-wrap">{inspection.summary}</p>
            </div>
          )}

          {/* Internal notes */}
          {inspection.internalNotes && (
            <div className="p-3 rounded-md bg-yellow-500/5 border border-yellow-200 dark:border-yellow-800">
              <p className="text-xs font-semibold text-yellow-700 dark:text-yellow-400 mb-1">Internal Notes</p>
              <p className="text-sm whitespace-pre-wrap">{inspection.internalNotes}</p>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2">
          <Button
            variant="destructive"
            size="sm"
            onClick={() => {
              if (confirm("Delete this inspection?")) deleteMutation.mutate();
            }}
            disabled={deleteMutation.isPending}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          {customer && (
            <Link href={`/customers/${customer.id}`}>
              <Button size="sm">
                <User className="h-3.5 w-3.5 mr-1.5" /> View Client
              </Button>
            </Link>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── InspectionCard ──────────────────────────────────────────────────────────

function InspectionCard({
  inspection,
  customer,
  piano,
  onClick,
}: {
  inspection: Inspection;
  customer: Customer | undefined;
  piano: Piano | undefined;
  onClick: () => void;
}) {
  const recommended = parseRecommended(inspection.recommendedServices);
  const checklist = parseChecklist(inspection.checklistItems);
  const criticalCount = checklist.filter(i => i.status === "critical").length;
  const attentionCount = checklist.filter(i => i.status === "needs_attention").length;

  return (
    <Card
      className="cursor-pointer hover-elevate transition-all"
      onClick={onClick}
    >
      <CardContent className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-medium text-sm">
                {customer ? clientName(customer) : `Customer #${inspection.customerId}`}
              </span>
              <Badge className={`border text-xs ${statusColor(inspection.status)}`}>
                {inspection.status}
              </Badge>
              {inspection.type === "estimate" && (
                <Badge variant="outline" className="text-xs">Estimate</Badge>
              )}
            </div>
            {piano && (
              <p className="text-xs text-muted-foreground mt-0.5">
                <Music className="h-3 w-3 inline mr-1" />
                {[piano.make, piano.pianoType, piano.model].filter(Boolean).join(" ")}
              </p>
            )}
          </div>
          <div className="text-right shrink-0">
            <p className="text-xs text-muted-foreground">{inspection.inspectionDate}</p>
            {inspection.estimatedTotal && (
              <p className="text-sm font-semibold">{inspection.estimatedTotal}</p>
            )}
          </div>
        </div>

        {/* Condition + issues */}
        <div className="flex items-center gap-3 mt-2 flex-wrap">
          {inspection.overallCondition && (
            <span className={`text-xs font-medium capitalize ${conditionColor(inspection.overallCondition)}`}>
              {inspection.overallCondition} condition
            </span>
          )}
          {criticalCount > 0 && (
            <span className="text-xs text-red-500 font-medium flex items-center gap-1">
              <XCircle className="h-3 w-3" /> {criticalCount} critical
            </span>
          )}
          {attentionCount > 0 && (
            <span className="text-xs text-yellow-500 font-medium flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" /> {attentionCount} attention
            </span>
          )}
          {recommended.length > 0 && (
            <span className="text-xs text-muted-foreground">{recommended.length} recommended services</span>
          )}
        </div>

        {inspection.summary && (
          <p className="text-xs text-muted-foreground mt-2 line-clamp-2">{inspection.summary}</p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Page ────────────────────────────────────────────────────────────────

export default function InspectionsPage() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"all" | "inspection" | "estimate">("all");
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<Inspection | null>(null);
  const [prefillCustomerId, setPrefillCustomerId] = useState<number | undefined>(undefined);
  const [prefillPianoId, setPrefillPianoId] = useState<number | undefined>(undefined);

  // Auto-open new dialog when arriving from piano detail with URL params
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const cid = params.get("customerId");
    const pid = params.get("pianoId");
    if (cid || pid) {
      if (cid) setPrefillCustomerId(parseInt(cid));
      if (pid) setPrefillPianoId(parseInt(pid));
      setShowNew(true);
      // Clean the URL without reloading
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  const { data: inspectionList = [], isLoading } = useQuery<Inspection[]>({
    queryKey: ["/api/inspections"],
  });

  const { data: customers = [] } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
  });

  const { data: allPianos = [] } = useQuery<Piano[]>({
    queryKey: ["/api/pianos"],
  });

  const customerMap = useMemo(() => {
    const map = new Map<number, Customer>();
    customers.forEach(c => map.set(c.id, c));
    return map;
  }, [customers]);

  const pianoMap = useMemo(() => {
    const map = new Map<number, Piano>();
    allPianos.forEach(p => map.set(p.id, p));
    return map;
  }, [allPianos]);

  const filtered = useMemo(() => {
    return inspectionList.filter(i => {
      if (tab !== "all" && i.type !== tab) return false;
      if (statusFilter !== "all" && i.status !== statusFilter) return false;
      if (search) {
        const customer = customerMap.get(i.customerId);
        const q = search.toLowerCase();
        const name = customer ? clientSearchText(customer) : "";
        if (!name.includes(q) && !i.inspectionDate.includes(q) && !(i.findings ?? "").toLowerCase().includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [inspectionList, tab, statusFilter, search, customerMap]);

  const selectedCustomer = selected ? customerMap.get(selected.customerId) : undefined;
  const selectedPiano = selected?.pianoId ? pianoMap.get(selected.pianoId) : undefined;

  // Counts
  const pendingCount = inspectionList.filter(i => i.status === "pending").length;
  const approvedCount = inspectionList.filter(i => i.status === "approved").length;

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Inspections & Estimates</h1>
          <p className="text-sm text-muted-foreground">
            {inspectionList.length} total · {pendingCount} pending · {approvedCount} approved
          </p>
        </div>
        <Button onClick={() => setShowNew(true)}>
          <Plus className="h-4 w-4 mr-1.5" /> New Inspection
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2 items-center">
        <div className="relative flex-1 min-w-[180px] max-w-xs">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            className="pl-8 h-8 text-sm"
            placeholder="Search clients…"
            value={search}
            onChange={e => setSearch(e.target.value)}
          />
        </div>

        <Tabs value={tab} onValueChange={v => setTab(v as any)}>
          <TabsList className="h-8">
            <TabsTrigger value="all" className="text-xs h-full px-3">All</TabsTrigger>
            <TabsTrigger value="inspection" className="text-xs h-full px-3">Inspections</TabsTrigger>
            <TabsTrigger value="estimate" className="text-xs h-full px-3">Estimates</TabsTrigger>
          </TabsList>
        </Tabs>

        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[130px] h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="declined">Declined</SelectItem>
            <SelectItem value="converted">Converted</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      {isLoading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <Skeleton key={i} className="h-24 w-full rounded-lg" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ClipboardList className="h-10 w-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">No inspections found</p>
          <p className="text-sm mt-1">Create your first inspection to get started</p>
          <Button className="mt-4" onClick={() => setShowNew(true)}>
            <Plus className="h-4 w-4 mr-1.5" /> New Inspection
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(inspection => (
            <InspectionCard
              key={inspection.id}
              inspection={inspection}
              customer={customerMap.get(inspection.customerId)}
              piano={inspection.pianoId ? pianoMap.get(inspection.pianoId) : undefined}
              onClick={() => setSelected(inspection)}
            />
          ))}
        </div>
      )}

      <NewInspectionDialog
        open={showNew}
        onOpenChange={setShowNew}
        customers={customers}
        pianos={allPianos}
        prefillCustomerId={prefillCustomerId}
        prefillPianoId={prefillPianoId}
      />

      <InspectionDetailDialog
        inspection={selected}
        customer={selectedCustomer}
        piano={selectedPiano}
        open={!!selected}
        onOpenChange={open => { if (!open) setSelected(null); }}
      />
    </div>
  );
}
