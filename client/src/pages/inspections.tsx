import { useState, useMemo, useEffect, useRef } from "react";
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
  ImagePlus,
  X,
  Loader2,
  FileDown,
} from "lucide-react";
import type { Inspection, Customer, Piano } from "@shared/schema";
import { clientName, clientSearchText } from "@shared/client-name";
import { InspectionPdfDocument } from "@/components/inspection-pdf";

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
  const fileInputRef = useRef<HTMLInputElement>(null);

  const today = new Date();
  const dateStr = `${today.getMonth() + 1}/${today.getDate()}/${String(today.getFullYear()).slice(-2)}`;

  // ── Customer type-ahead ──────────────────────────────────────────────────
  const [customerSearch, setCustomerSearch] = useState("");
  const [showCustomerResults, setShowCustomerResults] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);

  // ── Piano selection ──────────────────────────────────────────────────────
  const [selectedPianoId, setSelectedPianoId] = useState<number | null>(null);
  const [showNewPianoForm, setShowNewPianoForm] = useState(false);
  const [newPianoMake, setNewPianoMake] = useState("");
  const [newPianoModel, setNewPianoModel] = useState("");
  const [newPianoType, setNewPianoType] = useState("Upright");
  const [newPianoYear, setNewPianoYear] = useState("");

  // ── Photos ───────────────────────────────────────────────────────────────
  const [pendingPhotos, setPendingPhotos] = useState<File[]>([]);
  const [photoPreviewUrls, setPhotoPreviewUrls] = useState<string[]>([]);

  // ── Form fields ──────────────────────────────────────────────────────────
  const [formFields, setFormFields] = useState({
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
  const [isSaving, setIsSaving] = useState(false);

  // ── Reset on open ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    const prefillCust = prefillCustomerId ? customers.find(c => c.id === prefillCustomerId) ?? null : null;
    const prefillPiano = prefillPianoId ? pianos.find(p => p.id === prefillPianoId) ?? null : null;
    setSelectedCustomer(prefillCust);
    setCustomerSearch(prefillCust ? `${prefillCust.firstName} ${prefillCust.lastName}` : "");
    setShowCustomerResults(false);
    setSelectedPianoId(prefillPiano?.id ?? null);
    setShowNewPianoForm(false);
    setNewPianoMake(""); setNewPianoModel(""); setNewPianoType("Upright"); setNewPianoYear("");
    setPendingPhotos([]);
    photoPreviewUrls.forEach(u => URL.revokeObjectURL(u));
    setPhotoPreviewUrls([]);
    setFormFields({ type: "inspection", inspectionDate: dateStr, overallCondition: "", findings: "", summary: "", estimatedTotal: "", internalNotes: "" });
    setChecklist(DEFAULT_CHECKLIST.map(i => ({ ...i })));
    setRecommended([{ service: "", estimatedCost: "" }]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // ── Derived ──────────────────────────────────────────────────────────────
  const customerResults = useMemo(() => {
    if (!customerSearch.trim() || selectedCustomer) return [];
    const q = customerSearch.toLowerCase();
    return customers.filter(c =>
      [`${c.firstName} ${c.lastName}`, c.email ?? "", c.phone ?? "", c.city ?? ""]
        .some(v => v.toLowerCase().includes(q))
    ).slice(0, 8);
  }, [customers, customerSearch, selectedCustomer]);

  const customerPianos = useMemo(
    () => selectedCustomer
      ? pianos.filter(p => p.customerId === selectedCustomer.id && p.isActive !== false)
      : [],
    [pianos, selectedCustomer]
  );

  // ── Photo helpers ────────────────────────────────────────────────────────
  function addPhotos(files: File[]) {
    setPendingPhotos(prev => [...prev, ...files]);
    setPhotoPreviewUrls(prev => [...prev, ...files.map(f => URL.createObjectURL(f))]);
  }

  function removePhoto(idx: number) {
    URL.revokeObjectURL(photoPreviewUrls[idx]);
    setPendingPhotos(prev => prev.filter((_, i) => i !== idx));
    setPhotoPreviewUrls(prev => prev.filter((_, i) => i !== idx));
  }

  // ── Save ─────────────────────────────────────────────────────────────────
  async function handleSave() {
    if (!selectedCustomer || !formFields.inspectionDate) {
      toast({ title: "Required fields missing", description: "Customer and date are required.", variant: "destructive" });
      return;
    }
    setIsSaving(true);
    try {
      // 1. Create new piano if needed
      let finalPianoId: number | null = selectedPianoId;
      if (showNewPianoForm && (newPianoMake || newPianoModel || newPianoType)) {
        const pianoRes = await fetch(`/api/customers/${selectedCustomer.id}/pianos`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
          body: JSON.stringify({
            make: newPianoMake || null,
            model: newPianoModel || null,
            pianoType: newPianoType,
            year: newPianoYear || null,
            isActive: true,
          }),
        });
        if (!pianoRes.ok) throw new Error("Failed to create piano");
        const piano = await pianoRes.json();
        finalPianoId = piano.id;
        queryClient.invalidateQueries({ queryKey: ["/api/pianos"] });
      }

      // 2. Create inspection
      const inspRes = await fetch("/api/inspections", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          customerId: selectedCustomer.id,
          pianoId: finalPianoId,
          type: formFields.type,
          inspectionDate: formFields.inspectionDate,
          status: "pending",
          overallCondition: formFields.overallCondition || null,
          findings: formFields.findings || null,
          summary: formFields.summary || null,
          estimatedTotal: formFields.estimatedTotal || null,
          internalNotes: formFields.internalNotes || null,
          checklistItems: JSON.stringify(checklist),
          recommendedServices: JSON.stringify(recommended.filter(r => r.service.trim())),
        }),
      });
      if (!inspRes.ok) {
        const err = await inspRes.json().catch(() => ({}));
        throw new Error((err as any).message || "Failed to create inspection");
      }
      const inspection = await inspRes.json();

      // 3. Upload photos if any
      if (pendingPhotos.length > 0) {
        const fd = new FormData();
        // Capture files into stable array before async gap
        const filesToUpload = [...pendingPhotos];
        filesToUpload.forEach(f => fd.append("photos", f));
        const uploadRes = await fetch(`/api/inspections/${inspection.id}/photos`, {
          method: "POST",
          body: fd,
          credentials: "include",
        });
        if (!uploadRes.ok) {
          toast({ title: "Inspection created, but photos failed to upload — try again from the detail view.", variant: "destructive" });
        }
      }

      queryClient.invalidateQueries({ queryKey: ["/api/inspections"] });
      toast({ title: "Inspection created" });
      onOpenChange(false);
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New {formFields.type === "estimate" ? "Estimate" : "Inspection"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Type */}
          <div className="flex gap-2">
            {(["inspection", "estimate"] as const).map(t => (
              <Button
                key={t}
                variant={formFields.type === t ? "default" : "outline"}
                size="sm"
                onClick={() => setFormFields(f => ({ ...f, type: t }))}
                className="capitalize"
              >
                {t === "inspection" ? <ClipboardList className="h-3.5 w-3.5 mr-1.5" /> : <FileText className="h-3.5 w-3.5 mr-1.5" />}
                {t}
              </Button>
            ))}
          </div>

          {/* Piano selection (only shown once customer is picked) */}
          {selectedCustomer && (
            <div className="space-y-2">
              <Label>Piano</Label>
              {customerPianos.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {customerPianos.map(p => {
                    const label = [p.make, p.model, p.pianoType].filter(Boolean).join(" ") || `Piano #${p.id}`;
                    const sel = selectedPianoId === p.id;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => { setSelectedPianoId(sel ? null : p.id); setShowNewPianoForm(false); }}
                        className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${
                          sel ? "bg-primary text-primary-foreground border-primary" : "bg-background hover:bg-muted border-input"
                        }`}
                      >
                        {label}
                      </button>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() => { setShowNewPianoForm(v => !v); setSelectedPianoId(null); }}
                    className={`px-3 py-1.5 rounded-md border text-sm transition-colors ${
                      showNewPianoForm
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted border-input text-muted-foreground"
                    }`}
                  >
                    <Plus className="h-3.5 w-3.5 inline mr-1" />New piano
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground">No pianos on file.</p>
                  <button
                    type="button"
                    onClick={() => setShowNewPianoForm(true)}
                    className="text-sm text-primary underline-offset-4 hover:underline"
                  >
                    Add one now
                  </button>
                </div>
              )}

              {showNewPianoForm && (
                <div className="grid grid-cols-2 gap-2 p-3 rounded-md border bg-muted/20">
                  <div className="space-y-1">
                    <Label className="text-xs">Make</Label>
                    <Input className="h-8 text-sm" placeholder="e.g. Steinway" value={newPianoMake} onChange={e => setNewPianoMake(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Model</Label>
                    <Input className="h-8 text-sm" placeholder="e.g. Model L" value={newPianoModel} onChange={e => setNewPianoModel(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Type *</Label>
                    <Select value={newPianoType} onValueChange={setNewPianoType}>
                      <SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {["Grand", "Upright", "Studio", "Console", "Spinet", "Digital", "Other"].map(t => (
                          <SelectItem key={t} value={t}>{t}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Year <span className="font-normal text-muted-foreground">optional</span></Label>
                    <Input className="h-8 text-sm" placeholder="e.g. 1972" value={newPianoYear} onChange={e => setNewPianoYear(e.target.value)} />
                  </div>
                </div>
              )}
            </div>
          )}

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
                    <p className="text-sm font-medium">{item.item.split(/\s[—–-]\s/)[0]}</p>
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
              value={formFields.findings}
              onChange={e => setFormFields(f => ({ ...f, findings: e.target.value }))}
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
                  value={formFields.estimatedTotal}
                  onChange={e => setFormFields(f => ({ ...f, estimatedTotal: e.target.value }))}
                />
              </div>
            )}
          </div>

          {/* Summary */}
          <div className="space-y-1">
            <Label>Summary (for client)</Label>
            <Textarea
              placeholder="What the client needs to know…"
              value={formFields.summary}
              onChange={e => setFormFields(f => ({ ...f, summary: e.target.value }))}
              rows={2}
            />
          </div>

          {/* Internal Notes */}
          <div className="space-y-1">
            <Label>Internal Notes</Label>
            <Textarea
              placeholder="Private notes…"
              value={formFields.internalNotes}
              onChange={e => setFormFields(f => ({ ...f, internalNotes: e.target.value }))}
              rows={2}
            />
          </div>

          {/* Photos */}
          <div className="space-y-2">
            <Label>Photos</Label>
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={e => {
                const picked = e.target.files ? Array.from(e.target.files) : [];
                if (picked.length) { addPhotos(picked); e.target.value = ""; }
              }}
            />
            {photoPreviewUrls.length > 0 && (
              <div className="flex gap-2 flex-wrap">
                {photoPreviewUrls.map((url, idx) => (
                  <div key={idx} className="relative group">
                    <img src={url} alt={`Photo ${idx + 1}`} className="h-16 w-16 object-cover rounded-md border" />
                    <button
                      type="button"
                      onClick={() => removePhoto(idx)}
                      className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full h-4 w-4 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus className="h-3.5 w-3.5 mr-1.5" />
              {photoPreviewUrls.length > 0 ? "Add more photos" : "Add photos"}
            </Button>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving
              ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving…</>
              : `Create ${formFields.type === "estimate" ? "Estimate" : "Inspection"}`
            }
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
  onDownloadPdf,
}: {
  inspection: Inspection | null;
  customer: Customer | undefined;
  piano: Piano | undefined;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onDownloadPdf: (inspection: Inspection, customer: Customer | undefined, piano: Piano | undefined) => void;
}) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const photoFileInputRef = useRef<HTMLInputElement>(null);

  // ── Edit form state ──────────────────────────────────────────────────────
  const [editFields, setEditFields] = useState({
    type: "inspection" as "inspection" | "estimate",
    inspectionDate: "",
    overallCondition: "",
    findings: "",
    summary: "",
    estimatedTotal: "",
    internalNotes: "",
  });
  const [editChecklist, setEditChecklist] = useState<ChecklistItem[]>([]);
  const [editRecommended, setEditRecommended] = useState<RecommendedService[]>([]);

  // Populate edit state when entering edit mode
  function startEditing() {
    if (!inspection) return;
    setEditFields({
      type: (inspection.type as "inspection" | "estimate") ?? "inspection",
      inspectionDate: inspection.inspectionDate ?? "",
      overallCondition: inspection.overallCondition ?? "",
      findings: inspection.findings ?? "",
      summary: inspection.summary ?? "",
      estimatedTotal: inspection.estimatedTotal ?? "",
      internalNotes: inspection.internalNotes ?? "",
    });
    setEditChecklist(parseChecklist(inspection.checklistItems).map(i => ({ ...i })));
    const rec = parseRecommended(inspection.recommendedServices);
    setEditRecommended(rec.length > 0 ? rec : [{ service: "", estimatedCost: "" }]);
    setEditing(true);
  }

  // ── Mutations ────────────────────────────────────────────────────────────
  const uploadPhotosMutation = useMutation({
    mutationFn: async (files: File[]) => {
      const fd = new FormData();
      files.forEach((f) => fd.append("photos", f));
      const res = await fetch(`/api/inspections/${inspection!.id}/photos`, {
        method: "POST",
        body: fd,
        credentials: "include",
      });
      if (!res.ok) {
        let msg = "Upload failed";
        try { const d = await res.json(); if (d?.message) msg = d.message; } catch {}
        throw new Error(msg);
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspections"] });
      toast({ title: "Photos uploaded" });
    },
    onError: (err: any) =>
      toast({ title: err?.message || "Upload failed", variant: "destructive" }),
  });

  const deletePhotoMutation = useMutation({
    mutationFn: (photoUrl: string) =>
      apiRequest("DELETE", `/api/inspections/${inspection!.id}/photos`, { photoUrl }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspections"] });
      toast({ title: "Photo removed" });
    },
    onError: () => toast({ title: "Couldn't remove photo", variant: "destructive" }),
  });

  const saveMutation = useMutation({
    mutationFn: () =>
      apiRequest("PATCH", `/api/inspections/${inspection!.id}`, {
        type: editFields.type,
        inspectionDate: editFields.inspectionDate,
        findings: editFields.findings || null,
        summary: editFields.summary || null,
        estimatedTotal: editFields.estimatedTotal || null,
        internalNotes: editFields.internalNotes || null,
        checklistItems: JSON.stringify(editChecklist),
        recommendedServices: JSON.stringify(editRecommended.filter(r => r.service.trim())),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inspections"] });
      toast({ title: "Inspection saved" });
      setEditing(false);
    },
    onError: (err: any) =>
      toast({ title: err?.message || "Save failed", variant: "destructive" }),
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

  const checklist = parseChecklist(inspection?.checklistItems);
  const recommended = parseRecommended(inspection?.recommendedServices);
  const criticalItems = checklist.filter(i => i.status === "critical");
  const attentionItems = checklist.filter(i => i.status === "needs_attention");

  // ── Edit mode UI ─────────────────────────────────────────────────────────
  if (editing) {
    return (
      <Dialog open={open} onOpenChange={v => { if (!v) setEditing(false); onOpenChange(v); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit {editFields.type === "estimate" ? "Estimate" : "Inspection"}</DialogTitle>
            {customer && (
              <p className="text-sm text-muted-foreground mt-0.5">
                {clientName(customer)}
                {piano && ` · ${[piano.make, piano.pianoType].filter(Boolean).join(" ")}`}
              </p>
            )}
          </DialogHeader>

          <div className="space-y-4">
            {/* Type */}
            <div className="flex gap-2">
              {(["inspection", "estimate"] as const).map(t => (
                <Button
                  key={t}
                  variant={editFields.type === t ? "default" : "outline"}
                  size="sm"
                  onClick={() => setEditFields(f => ({ ...f, type: t }))}
                  className="capitalize"
                >
                  {t === "inspection" ? <ClipboardList className="h-3.5 w-3.5 mr-1.5" /> : <FileText className="h-3.5 w-3.5 mr-1.5" />}
                  {t}
                </Button>
              ))}
            </div>

            {/* Date */}
            <div className="space-y-1">
              <Label>Inspection Date</Label>
              <Input
                value={editFields.inspectionDate}
                onChange={e => setEditFields(f => ({ ...f, inspectionDate: e.target.value }))}
                placeholder="M/D/YY"
              />
            </div>

            {/* Checklist */}
            <div>
              <Label className="text-sm font-semibold mb-2 block">Inspection Checklist</Label>
              <div className="border rounded-md overflow-hidden">
                {editChecklist.map((item, i) => (
                  <div key={i} className="flex items-start gap-2 p-2 border-b last:border-0 hover:bg-muted/30">
                    <div className="pt-0.5">
                      <Select
                        value={item.status}
                        onValueChange={v => {
                          const next = [...editChecklist];
                          next[i] = { ...next[i], status: v as any };
                          setEditChecklist(next);
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
                      <p className="text-sm font-medium">{item.item.split(/\s[—–-]\s/)[0]}</p>
                      <Input
                        className="h-6 text-xs mt-1"
                        placeholder="Notes…"
                        value={item.notes}
                        onChange={e => {
                          const next = [...editChecklist];
                          next[i] = { ...next[i], notes: e.target.value };
                          setEditChecklist(next);
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
                value={editFields.findings}
                onChange={e => setEditFields(f => ({ ...f, findings: e.target.value }))}
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
                  onClick={() => setEditRecommended(r => [...r, { service: "", estimatedCost: "" }])}
                >
                  <Plus className="h-3 w-3 mr-1" /> Add
                </Button>
              </div>
              <div className="space-y-2">
                {editRecommended.map((r, i) => (
                  <div key={i} className="flex gap-2 items-center">
                    <Input
                      className="flex-1 h-8 text-sm"
                      placeholder="Service description…"
                      value={r.service}
                      onChange={e => {
                        const next = [...editRecommended];
                        next[i] = { ...next[i], service: e.target.value };
                        setEditRecommended(next);
                      }}
                    />
                    <Input
                      className="w-24 h-8 text-sm"
                      placeholder="$0.00"
                      value={r.estimatedCost}
                      onChange={e => {
                        const next = [...editRecommended];
                        next[i] = { ...next[i], estimatedCost: e.target.value };
                        setEditRecommended(next);
                      }}
                    />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 shrink-0"
                      onClick={() => setEditRecommended(r => r.filter((_, j) => j !== i))}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                ))}
              </div>
              {editRecommended.filter(r => r.estimatedCost).length > 0 && (
                <div className="mt-1 flex items-center gap-2">
                  <Label className="text-xs text-muted-foreground">Est. Total</Label>
                  <Input
                    className="w-28 h-7 text-sm"
                    placeholder="$0.00"
                    value={editFields.estimatedTotal}
                    onChange={e => setEditFields(f => ({ ...f, estimatedTotal: e.target.value }))}
                  />
                </div>
              )}
            </div>

            {/* Summary */}
            <div className="space-y-1">
              <Label>Summary (for client)</Label>
              <Textarea
                placeholder="What the client needs to know…"
                value={editFields.summary}
                onChange={e => setEditFields(f => ({ ...f, summary: e.target.value }))}
                rows={2}
              />
            </div>

            {/* Internal Notes */}
            <div className="space-y-1">
              <Label>Internal Notes</Label>
              <Textarea
                placeholder="Private notes…"
                value={editFields.internalNotes}
                onChange={e => setEditFields(f => ({ ...f, internalNotes: e.target.value }))}
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
            <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
              {saveMutation.isPending
                ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />Saving…</>
                : "Save Changes"
              }
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ── Read-only view ───────────────────────────────────────────────────────
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
          </div>
        </DialogHeader>

        <div className="space-y-5">
          {/* Quick stats */}
          <div className="flex flex-wrap gap-3">
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

          {/* Checklist summary */}
          {checklist.length > 0 && (
            <div>
              <p className="text-sm font-semibold mb-2">Checklist</p>
              <div className="grid gap-1">
                {checklist.filter(i => i.status !== "ok" && i.status !== "na").map((item, i) => (
                  <div key={i} className="flex items-start gap-2 text-sm p-2 rounded-md bg-muted/40">
                    {checklistStatusIcon(item.status)}
                    <div>
                      <span className="font-medium">{item.item.split(/\s[—–-]\s/)[0]}</span>
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
                      <span className={item.status === "ok" ? "text-muted-foreground" : ""}>{item.item.split(/\s[—–-]\s/)[0]}</span>
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

          {/* Photos */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold">Photos</p>
              <input
                ref={photoFileInputRef}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => {
                  const picked = e.target.files ? Array.from(e.target.files) : [];
                  if (picked.length) {
                    uploadPhotosMutation.mutate(picked);
                    e.target.value = "";
                  }
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => photoFileInputRef.current?.click()}
                disabled={uploadPhotosMutation.isPending}
              >
                {uploadPhotosMutation.isPending ? (
                  <><Loader2 className="h-3 w-3 mr-1 animate-spin" />Uploading…</>
                ) : (
                  <><ImagePlus className="h-3 w-3 mr-1" />Add photos</>
                )}
              </Button>
            </div>
            {inspection.photos && inspection.photos.length > 0 ? (
              <div className="flex gap-2 flex-wrap">
                {inspection.photos.map((photo, idx) => (
                  <div key={idx} className="relative group">
                    <a href={photo} target="_blank" rel="noopener noreferrer">
                      <img
                        src={photo}
                        alt={`Photo ${idx + 1}`}
                        className="h-20 w-20 object-cover rounded-md border hover:opacity-90 transition-opacity"
                      />
                    </a>
                    <button
                      type="button"
                      onClick={() => deletePhotoMutation.mutate(photo)}
                      disabled={deletePhotoMutation.isPending}
                      className="absolute -top-1 -right-1 bg-destructive text-destructive-foreground rounded-full h-5 w-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                      aria-label="Remove photo"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">No photos yet</p>
            )}
          </div>
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDownloadPdf(inspection, customer, piano)}
          >
            <FileDown className="h-3.5 w-3.5 mr-1.5" /> Download PDF
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          <Button variant="outline" size="sm" onClick={startEditing}>
            <Edit className="h-3.5 w-3.5 mr-1.5" /> Edit
          </Button>
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
  onDownloadPdf,
}: {
  inspection: Inspection;
  customer: Customer | undefined;
  piano: Piano | undefined;
  onClick: () => void;
  onDownloadPdf: (inspection: Inspection, customer: Customer | undefined, piano: Piano | undefined) => void;
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
          <div className="flex items-start gap-2 shrink-0">
            <div className="text-right">
              <p className="text-xs text-muted-foreground">{inspection.inspectionDate}</p>
              {inspection.estimatedTotal && (
                <p className="text-sm font-semibold">{inspection.estimatedTotal}</p>
              )}
            </div>
            <button
              type="button"
              title="Download PDF"
              onClick={e => { e.stopPropagation(); onDownloadPdf(inspection, customer, piano); }}
              className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <FileDown className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>

        {/* Issues */}
        <div className="flex items-center gap-3 mt-2 flex-wrap">
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

type PdfTarget = {
  inspection: Inspection;
  customer: Customer | undefined;
  piano: Piano | undefined;
};

export default function InspectionsPage() {
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState<"all" | "inspection" | "estimate">("all");
  const [showNew, setShowNew] = useState(false);
  const [selected, setSelected] = useState<Inspection | null>(null);
  const [prefillCustomerId, setPrefillCustomerId] = useState<number | undefined>(undefined);
  const [prefillPianoId, setPrefillPianoId] = useState<number | undefined>(undefined);

  // PDF generation state
  const [pdfTarget, setPdfTarget] = useState<PdfTarget | null>(null);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const pdfRef = useRef<HTMLDivElement>(null);

  const { toast } = useToast();

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
  }, [inspectionList, tab, search, customerMap]);

  // Derive from live query data so the dialog reflects uploads/removals immediately
  const liveSelected = selected
    ? (inspectionList.find(i => i.id === selected.id) ?? selected)
    : null;
  const selectedCustomer = liveSelected ? customerMap.get(liveSelected.customerId) : undefined;
  const selectedPiano = liveSelected?.pianoId ? pianoMap.get(liveSelected.pianoId) : undefined;


  // ── PDF download ──────────────────────────────────────────────────────────
  async function downloadPdf(
    inspection: Inspection,
    customer: Customer | undefined,
    piano: Piano | undefined,
  ) {
    if (downloadingPdf) return;
    setDownloadingPdf(true);
    setPdfTarget({ inspection, customer, piano });

    // Wait two animation frames for React to commit the hidden element into the DOM
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve()))
    );

    try {
      if (!pdfRef.current) throw new Error("PDF container not found");
      const html2pdf = (await import("html2pdf.js")).default;
      const lastName = customer?.lastName ?? "Inspection";
      const date     = inspection.inspectionDate.replace(/\//g, "-");
      const type     = inspection.type === "estimate" ? "Estimate" : "Inspection";
      const filename = `${lastName}_${date}_${type}.pdf`;

      // Generate PDF, then stamp page numbers before saving
      const worker = html2pdf()
        .set({
          margin: [12.7, 12.7, 12.7, 12.7],
          filename,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2, useCORS: true },
          jsPDF: { unit: "mm", format: "letter", orientation: "portrait" },
        })
        .from(pdfRef.current)
        .toPdf();

      // Add "Page N of M" footer on every page
      const pdf = await worker.get("pdf") as any;
      const totalPages: number = pdf.internal.getNumberOfPages();
      const pageW: number = pdf.internal.pageSize.getWidth();
      const pageH: number = pdf.internal.pageSize.getHeight();
      for (let i = 1; i <= totalPages; i++) {
        pdf.setPage(i);
        pdf.setFontSize(8);
        pdf.setTextColor(160, 160, 160);
        pdf.text(`Page ${i} of ${totalPages}`, pageW / 2, pageH - 6, { align: "center" });
      }
      pdf.save(filename);
    } catch (err) {
      console.error("PDF generation failed:", err);
      toast({ title: "Failed to generate PDF", variant: "destructive" });
    } finally {
      setDownloadingPdf(false);
      setPdfTarget(null);
    }
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Inspections & Estimates</h1>
          <p className="text-sm text-muted-foreground">
            {inspectionList.length} total
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
              onDownloadPdf={downloadPdf}
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
        inspection={liveSelected}
        customer={selectedCustomer}
        piano={selectedPiano}
        open={!!selected}
        onOpenChange={open => { if (!open) setSelected(null); }}
        onDownloadPdf={downloadPdf}
      />

      {/* ── Hidden PDF render target ─────────────────────────────────────── */}
      {pdfTarget && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: "-9999px",
            width: "816px",  /* 8.5in × 96dpi */
            background: "white",
            padding: "48px",
            zIndex: -1,
          }}
        >
          <div ref={pdfRef}>
            <InspectionPdfDocument
              inspection={pdfTarget.inspection}
              customer={pdfTarget.customer}
              piano={pdfTarget.piano}
            />
          </div>
        </div>
      )}

      {/* PDF generating overlay */}
      {downloadingPdf && (
        <div className="fixed inset-0 bg-background/70 backdrop-blur-sm flex items-center justify-center z-50 gap-3">
          <Loader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm font-medium">Generating PDF…</span>
        </div>
      )}
    </div>
  );
}
