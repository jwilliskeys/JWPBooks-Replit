import { useState, useEffect } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Plus, Pencil, Trash2, Search, Settings, ClipboardList, Music,
  ChevronUp, ChevronDown, FolderPlus, GripVertical, CreditCard,
  Copy, ExternalLink, CalendarCheck,
} from "lucide-react";
import { DurationStepperWidget, formatDurationMinutes } from "@/components/time-stepper";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { ServiceCatalogItem, ServiceGroup, UserSettings, SchedulerSettings } from "@shared/schema";

// ── Service type helpers ─────────────────────────────────────────────────────

export type ServiceItemType = "fixed-rate-labor" | "hourly-labor" | "parts" | "travel-fee" | "other" | "";

export const SERVICE_TYPE_LABELS: Record<string, string> = {
  "fixed-rate-labor": "Fixed Rate Labor",
  "hourly-labor": "Hourly Labor",
  "parts": "Parts",
  "travel-fee": "Travel Fee",
  "other": "Other",
  "": "Fixed Rate Labor", // default display
};

// Encode serviceType + plain text into the description field (no schema migration needed)
function encodeDescription(serviceType: ServiceItemType, text: string): string {
  if (!serviceType && !text) return "";
  return JSON.stringify({ t: serviceType || "", d: text });
}

function decodeDescription(raw: string | null | undefined): { serviceType: ServiceItemType; text: string } {
  if (!raw) return { serviceType: "", text: "" };
  try {
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === "object" && ("t" in parsed || "d" in parsed)) {
      return { serviceType: (parsed.t ?? "") as ServiceItemType, text: parsed.d ?? "" };
    }
  } catch { /* not JSON, treat as plain text */ }
  return { serviceType: "", text: raw };
}

// Format cost as "$X.00"
function formatCostDisplay(cost: string | null | undefined): string {
  if (!cost) return "";
  const n = parseFloat(cost.replace(/[^0-9.]/g, ""));
  if (isNaN(n)) return cost;
  return `$${n.toFixed(2)}`;
}

function parseDurationHours(s: string): number {
  if (!s) return 0;
  const numMatch = s.match(/(\d+(?:\.\d+)?)/);
  if (!numMatch) return 0;
  const val = parseFloat(numMatch[1]);
  const isMin = /min/i.test(s);
  return isMin ? val / 60 : val;
}

function durationHoursToMinutes(h: number): number {
  return Math.round(h * 60);
}

function minutesToDurationStr(m: number): string {
  if (m <= 0) return "0 hr";
  return `${(m / 60).toFixed(1)} hr`;
}

interface CatalogForm {
  name: string;
  category: string;
  defaultCost: string;
  defaultDuration: string;
  durationMinutes: number;
  isTuning: boolean;
  isDefault: boolean;
  serviceType: ServiceItemType;
  descriptionText: string;
  sortOrder: number;
}

const emptyCatalogForm = (category = "", sortOrder = 0): CatalogForm => ({
  name: "",
  category,
  defaultCost: "",
  defaultDuration: "0 hr",
  durationMinutes: 0,
  isTuning: false,
  isDefault: false,
  serviceType: "fixed-rate-labor",
  descriptionText: "",
  sortOrder,
});

function ServiceDialog({
  open,
  onOpenChange,
  item,
  groupName,
  groups,
  nextSortOrder,
  onSave,
  isSaving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: ServiceCatalogItem | null;
  groupName: string;
  groups: ServiceGroup[];
  nextSortOrder: number;
  onSave: (data: CatalogForm) => void;
  isSaving: boolean;
}) {
  function buildForm(): CatalogForm {
    if (item) {
      const hours = parseDurationHours(item.defaultDuration || "");
      const { serviceType, text } = decodeDescription(item.description);
      return {
        name: item.name,
        category: item.category || groupName || "__uncategorized__",
        defaultCost: item.defaultCost ? item.defaultCost.replace(/[^0-9.]/g, "") : "",
        defaultDuration: item.defaultDuration || "0 hr",
        durationMinutes: durationHoursToMinutes(hours),
        isTuning: item.isTuning ?? false,
        isDefault: item.isDefault ?? false,
        serviceType: serviceType || "fixed-rate-labor",
        descriptionText: text,
        sortOrder: item.sortOrder ?? 0,
      };
    }
    return emptyCatalogForm(groupName || "__uncategorized__", nextSortOrder);
  }

  const [form, setForm] = useState<CatalogForm>(buildForm);

  function handleOpen(v: boolean) {
    if (v) setForm(buildForm());
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" data-testid="dialog-service-catalog">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">{item ? "Edit Item" : "New Item"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-5 py-1">

          {/* Name */}
          <div className="space-y-1.5">
            <Label htmlFor="svc-name" className="font-semibold">Name</Label>
            <Input
              id="svc-name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="e.g. Standard Tuning"
              className="text-base"
              autoFocus
              data-testid="input-service-name"
            />
          </div>

          {/* Description */}
          <div className="space-y-1.5">
            <Label htmlFor="svc-desc" className="font-semibold">Description</Label>
            <Textarea
              id="svc-desc"
              value={form.descriptionText}
              onChange={e => setForm(f => ({ ...f, descriptionText: e.target.value }))}
              placeholder="e.g. Our standard tuning includes…"
              rows={3}
              data-testid="input-service-description"
            />
          </div>

          {/* Type + Amount */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="svc-type" className="font-semibold">Type</Label>
              <Select
                value={form.serviceType}
                onValueChange={v => setForm(f => ({ ...f, serviceType: v as ServiceItemType }))}
              >
                <SelectTrigger id="svc-type" data-testid="select-service-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed-rate-labor">Fixed Rate Labor</SelectItem>
                  <SelectItem value="hourly-labor">Hourly Labor</SelectItem>
                  <SelectItem value="parts">Parts</SelectItem>
                  <SelectItem value="travel-fee">Travel Fee</SelectItem>
                  <SelectItem value="other">Other</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="svc-cost" className="font-semibold">Each amount</Label>
              <div className="flex items-center rounded-md border border-input overflow-hidden focus-within:ring-2 focus-within:ring-ring">
                <span className="px-2.5 text-muted-foreground text-sm bg-muted border-r border-input h-9 flex items-center">$</span>
                <input
                  id="svc-cost"
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.defaultCost}
                  onChange={e => setForm(f => ({ ...f, defaultCost: e.target.value }))}
                  placeholder="0.00"
                  className="flex-1 h-9 px-2.5 text-sm bg-background outline-none"
                  data-testid="input-service-cost"
                />
              </div>
            </div>
          </div>

          {/* Duration */}
          <div className="space-y-1.5">
            <Label className="font-semibold">Duration</Label>
            <DurationStepperWidget
              minutes={form.durationMinutes}
              onChange={m => setForm(f => ({ ...f, durationMinutes: m, defaultDuration: minutesToDurationStr(m) }))}
              testIdPrefix="svc-duration"
            />
          </div>

          {/* Group (editing only — subtle) */}
          {item && (
            <div className="space-y-1.5">
              <Label htmlFor="svc-group" className="text-xs text-muted-foreground">Group</Label>
              <Select value={form.category} onValueChange={v => setForm(f => ({ ...f, category: v }))}>
                <SelectTrigger id="svc-group" className="h-8 text-sm" data-testid="select-service-group">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {groups.map(g => <SelectItem key={g.id} value={g.name}>{g.name}</SelectItem>)}
                  <SelectItem value="__uncategorized__">Uncategorized</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Checkboxes */}
          <div className="space-y-3 pt-1 border-t">
            <label className="flex items-center gap-3 cursor-pointer pt-2">
              <Checkbox
                checked={form.isDefault}
                onCheckedChange={v => setForm(f => ({ ...f, isDefault: !!v }))}
                data-testid="checkbox-is-default"
              />
              <span className="text-sm">Select this service by default</span>
              {form.isDefault && (
                <Badge className="bg-primary text-primary-foreground hover:bg-primary text-[10px]">DEFAULT</Badge>
              )}
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <Checkbox
                checked={form.isTuning}
                onCheckedChange={v => setForm(f => ({ ...f, isTuning: !!v }))}
                data-testid="checkbox-is-tuning"
              />
              <span className="text-sm">This item is a tuning</span>
              {form.isTuning && (
                <Badge className="bg-teal-600 text-white hover:bg-teal-600 text-[10px]">TUNING</Badge>
              )}
            </label>
          </div>
        </div>

        <DialogFooter className="pt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-service-cancel">
            Cancel
          </Button>
          <Button
            onClick={() => onSave(form)}
            disabled={isSaving || !form.name.trim()}
            data-testid="button-service-save"
          >
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function GroupDialog({
  open,
  onOpenChange,
  group,
  onSave,
  isSaving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  group: ServiceGroup | null;
  onSave: (name: string) => void;
  isSaving: boolean;
}) {
  const [name, setName] = useState(group?.name ?? "");

  function handleOpen(v: boolean) {
    if (v) setName(group?.name ?? "");
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-sm" data-testid="dialog-service-group">
        <DialogHeader>
          <DialogTitle>{group ? "Rename Group" : "Add Service Group"}</DialogTitle>
        </DialogHeader>
        <div className="py-2">
          <Label htmlFor="group-name">Group Name</Label>
          <Input
            id="group-name"
            value={name}
            onChange={e => setName(e.target.value)}
            className="mt-1.5"
            data-testid="input-group-name"
            onKeyDown={e => { if (e.key === "Enter" && name.trim()) onSave(name.trim()); }}
          />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-group-cancel">
            Cancel
          </Button>
          <Button
            onClick={() => onSave(name.trim())}
            disabled={isSaving || !name.trim()}
            data-testid="button-group-save"
          >
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function SortableItemRow({
  item,
  onEdit,
  onDelete,
  dragDisabled,
}: {
  item: ServiceCatalogItem;
  onEdit: (item: ServiceCatalogItem) => void;
  onDelete: (id: number) => void;
  dragDisabled?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: item.id, disabled: dragDisabled });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: isDragging ? ("relative" as const) : undefined,
    zIndex: isDragging ? 10 : undefined,
  };
  return (
    <div
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-2 px-3 py-2"
      data-testid={`service-row-${item.id}`}
    >
      <button
        {...attributes}
        {...(dragDisabled ? {} : listeners)}
        className={`p-0.5 rounded text-muted-foreground transition-colors shrink-0 ${dragDisabled ? "cursor-default opacity-30" : "cursor-grab active:cursor-grabbing hover:text-foreground"}`}
        data-testid={`button-drag-item-${item.id}`}
        type="button"
        disabled={dragDisabled}
        title={dragDisabled ? "Clear search to reorder" : "Drag to reorder"}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-medium text-sm" data-testid={`service-name-${item.id}`}>
            {item.name}
          </span>
          {item.isTuning && (
            <Badge className="bg-teal-600 text-white hover:bg-teal-600 text-[10px] px-1.5 py-0 gap-0.5">
              <Music className="h-2.5 w-2.5" /> TUNING
            </Badge>
          )}
          {item.isDefault && (
            <Badge className="bg-primary text-primary-foreground hover:bg-primary text-[10px] px-1.5 py-0" data-testid={`badge-default-${item.id}`}>
              DEFAULT
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 truncate" data-testid={`service-subline-${item.id}`}>
          {SERVICE_TYPE_LABELS[decodeDescription(item.description).serviceType || ""] ?? "Fixed Rate Labor"}
          {item.defaultCost ? ` — ${formatCostDisplay(item.defaultCost)}` : ""}
          {item.defaultDuration && item.defaultDuration !== "0 hr"
            ? ` — ${item.defaultDuration}`
            : " — No time added"}
        </p>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => onEdit(item)}
          data-testid={`button-edit-service-${item.id}`}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={() => onDelete(item.id)}
          data-testid={`button-delete-service-${item.id}`}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

// ── Self-Scheduler Panel ─────────────────────────────────────────────────────
const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
type DayHours = { enabled: boolean; start: string; end: string };
// Mirrors DEFAULT_AVAILABILITY in server/booking.ts
const DEFAULT_WEEK: Record<string, DayHours> = {
  "0": { enabled: true, start: "09:00", end: "16:30" },
  "1": { enabled: true, start: "16:00", end: "19:00" },
  "2": { enabled: true, start: "16:00", end: "19:00" },
  "3": { enabled: true, start: "16:00", end: "19:00" },
  "4": { enabled: true, start: "16:00", end: "19:00" },
  "5": { enabled: true, start: "16:00", end: "19:00" },
  "6": { enabled: true, start: "09:00", end: "16:30" },
};

function parseWeek(json: string | null | undefined): Record<string, DayHours> {
  if (!json) return { ...DEFAULT_WEEK };
  try {
    const parsed = JSON.parse(json);
    const out = { ...DEFAULT_WEEK };
    for (const k of Object.keys(out)) {
      const d = parsed?.[k];
      if (d && typeof d.enabled === "boolean" && d.start && d.end) out[k] = { enabled: d.enabled, start: d.start, end: d.end };
    }
    return out;
  } catch {
    return { ...DEFAULT_WEEK };
  }
}

function SelfSchedulerPanel() {
  const { toast } = useToast();
  const { data: schedulerData, isLoading: schedulerLoading } = useQuery<SchedulerSettings>({
    queryKey: ["/api/scheduler-settings"],
  });

  const defaultForm = {
    approvalMode: "manual" as string,
    slotDurationMinutes: "90",
    slotBufferMinutes: "0",
    maxPerWeek: "2",
    bookingHorizonWeeks: "12",
    showServiceCost: false,
    showServiceDuration: true,
    completionRedirectUrl: "",
    serviceAreaEnabled: false,
    serviceAreaLat: "",
    serviceAreaLng: "",
    serviceAreaRadiusMiles: "40",
    welcomeMessage: "",
    reservationCompleteMessage: "",
    outsideServiceAreaMessage: "",
    privacyPolicyUrl: "",
    termsOfServiceUrl: "",
  };

  const [form, setForm] = useState(defaultForm);
  const [week, setWeek] = useState<Record<string, DayHours>>({ ...DEFAULT_WEEK });
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (schedulerData) {
      setWeek(parseWeek(schedulerData.availabilityJson));
      setForm({
        approvalMode: schedulerData.approvalMode === "auto" ? "auto" : "manual",
        slotDurationMinutes: String(schedulerData.slotDurationMinutes ?? 90),
        slotBufferMinutes: String(schedulerData.slotBufferMinutes ?? 0),
        maxPerWeek: String(schedulerData.maxPerWeek ?? 2),
        bookingHorizonWeeks: String(schedulerData.bookingHorizonWeeks ?? 12),
        showServiceCost: schedulerData.showServiceCost ?? false,
        showServiceDuration: schedulerData.showServiceDuration ?? true,
        completionRedirectUrl: schedulerData.completionRedirectUrl ?? "",
        serviceAreaEnabled: schedulerData.serviceAreaEnabled ?? false,
        serviceAreaLat: schedulerData.serviceAreaLat ?? "",
        serviceAreaLng: schedulerData.serviceAreaLng ?? "",
        serviceAreaRadiusMiles: schedulerData.serviceAreaRadiusMiles ?? "40",
        welcomeMessage: schedulerData.welcomeMessage ?? "",
        reservationCompleteMessage: schedulerData.reservationCompleteMessage ?? "",
        outsideServiceAreaMessage: schedulerData.outsideServiceAreaMessage ?? "",
        privacyPolicyUrl: schedulerData.privacyPolicyUrl ?? "",
        termsOfServiceUrl: schedulerData.termsOfServiceUrl ?? "",
      });
    }
  }, [schedulerData]);

  const saveSchedulerMutation = useMutation({
    mutationFn: (data: typeof form) =>
      apiRequest("PUT", "/api/scheduler-settings", {
        ...data,
        availabilityJson: JSON.stringify(week),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/scheduler-settings"] });
      toast({ title: "Self-Scheduler settings saved" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const bookingUrl = `${window.location.origin}/book`;
  const embedCode = `<!-- JWP booking scheduler -->
<iframe id="jwp-book" src="${bookingUrl}?embed=true" title="Book a piano appointment"
style="width:100%;min-height:760px;border:0;border-radius:12px;" loading="lazy"></iframe>
<script>
window.addEventListener("message", function (e) {
  if (e && e.data && e.data.type === "jwp-book-height") {
    var f = document.getElementById("jwp-book");
    if (f) f.style.height = Math.max(560, e.data.height + 24) + "px";
  }
});
</script>
<noscript><a href="${bookingUrl}">Book an appointment</a></noscript>`;
  const fallbackLink = `<a href="${bookingUrl}" target="_blank" rel="noopener"
style="display:inline-block;background:#1e293b;color:#fff;padding:14px 28px;border-radius:10px;text-decoration:none;font-weight:600;">
Book an Appointment
</a>`;

  function handleCopy(text: string) {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  function toggle(key: keyof typeof form, val: boolean) {
    setForm(f => ({ ...f, [key]: val }));
  }
  function set(key: keyof typeof form, val: string) {
    setForm(f => ({ ...f, [key]: val }));
  }

  if (schedulerLoading) {
    return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-16 w-full rounded-lg" />)}</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <CalendarCheck className="h-5 w-5 text-primary" /> Self-Scheduler
        </h2>
        <p className="text-sm text-muted-foreground mt-0.5">
          Configure the public booking page that clients use to request appointments.
        </p>
      </div>

      {/* ── Booking Link ── */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <p className="text-sm font-semibold">Your Booking Link</p>
        <div className="flex items-center gap-2">
          <code className="flex-1 text-xs bg-muted px-3 py-2 rounded-md truncate">{bookingUrl}</code>
          <Button size="sm" variant="outline" className="gap-1.5 shrink-0" onClick={() => handleCopy(bookingUrl)}>
            <Copy className="h-3.5 w-3.5" />{copied ? "Copied!" : "Copy"}
          </Button>
          <Button size="sm" variant="outline" className="gap-1.5 shrink-0" asChild>
            <a href={bookingUrl} target="_blank" rel="noopener noreferrer"><ExternalLink className="h-3.5 w-3.5" />Open</a>
          </Button>
        </div>
      </div>

      {/* ── Embed Widget ── */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <p className="text-sm font-semibold">Embed on johnwillispiano.com</p>
        <p className="text-xs text-muted-foreground">Paste this snippet into a Code/HTML block on your website. The form auto-sizes to its content, so there's no inner scrollbar on desktop or mobile.</p>
        <div className="relative">
          <pre className="text-xs bg-muted px-3 py-3 rounded-md overflow-x-auto whitespace-pre max-h-56">{embedCode}</pre>
          <Button size="sm" variant="outline" className="absolute top-2 right-2 gap-1.5 text-xs" onClick={() => handleCopy(embedCode)} data-testid="button-copy-embed">
            <Copy className="h-3 w-3" />{copied ? "Copied!" : "Copy"}
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">If your website builder doesn't allow iframes, use this button that opens the scheduler in a new tab instead:</p>
        <div className="relative">
          <pre className="text-xs bg-muted px-3 py-3 rounded-md overflow-x-auto whitespace-pre">{fallbackLink}</pre>
          <Button size="sm" variant="outline" className="absolute top-2 right-2 gap-1.5 text-xs" onClick={() => handleCopy(fallbackLink)} data-testid="button-copy-fallback-link">
            <Copy className="h-3 w-3" />{copied ? "Copied!" : "Copy"}
          </Button>
        </div>
      </div>

      {/* ── Approval Mode ── */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Auto-approve bookings</p>
            <p className="text-xs text-muted-foreground">
              On: a booking instantly becomes a confirmed appointment on your calendar and the slot is locked.
              Off: it stays a pending request you confirm in one tap (from the dashboard or the email link).
            </p>
          </div>
          <Switch
            checked={form.approvalMode === "auto"}
            onCheckedChange={v => setForm(f => ({ ...f, approvalMode: v ? "auto" : "manual" }))}
            data-testid="switch-approval-mode"
          />
        </div>
      </div>

      {/* ── Availability ── */}
      <div className="rounded-xl border bg-card p-4 space-y-4">
        <div>
          <p className="text-sm font-semibold">Weekly Availability</p>
          <p className="text-xs text-muted-foreground">The hours clients can book, per day. Times already taken by appointments or held requests are removed automatically.</p>
        </div>
        <div className="space-y-2">
          {WEEKDAY_NAMES.map((name, i) => {
            const key = String(i);
            const day = week[key];
            return (
              <div key={key} className="flex items-center gap-3 flex-wrap">
                <Switch
                  checked={day.enabled}
                  onCheckedChange={v => setWeek(w => ({ ...w, [key]: { ...w[key], enabled: v } }))}
                  data-testid={`switch-avail-${name.toLowerCase()}`}
                />
                <span className={`text-sm w-24 ${day.enabled ? "" : "text-muted-foreground line-through"}`}>{name}</span>
                {day.enabled && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="time"
                      value={day.start}
                      onChange={e => setWeek(w => ({ ...w, [key]: { ...w[key], start: e.target.value } }))}
                      className="w-28 h-9"
                      data-testid={`input-avail-start-${name.toLowerCase()}`}
                    />
                    <span className="text-xs text-muted-foreground">to</span>
                    <Input
                      type="time"
                      value={day.end}
                      onChange={e => setWeek(w => ({ ...w, [key]: { ...w[key], end: e.target.value } }))}
                      className="w-28 h-9"
                      data-testid={`input-avail-end-${name.toLowerCase()}`}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-2 border-t">
          <div className="space-y-1.5">
            <Label className="text-xs">Appointment length (min)</Label>
            <Input inputMode="numeric" value={form.slotDurationMinutes} onChange={e => set("slotDurationMinutes", e.target.value)} data-testid="input-slot-duration" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Buffer between (min)</Label>
            <Input inputMode="numeric" value={form.slotBufferMinutes} onChange={e => set("slotBufferMinutes", e.target.value)} data-testid="input-slot-buffer" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Max bookings / week</Label>
            <Input inputMode="numeric" value={form.maxPerWeek} onChange={e => set("maxPerWeek", e.target.value)} data-testid="input-max-per-week" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Book ahead (weeks)</Label>
            <Input inputMode="numeric" value={form.bookingHorizonWeeks} onChange={e => set("bookingHorizonWeeks", e.target.value)} data-testid="input-horizon-weeks" />
          </div>
        </div>
        <p className="text-xs text-muted-foreground">Slot times are generated from these: e.g. 9:00 AM–4:30 PM with 90-minute appointments offers 9:00, 10:30, 12:00, 1:30, and 3:00. Utah trip dates use their own all-day trip schedule.</p>
      </div>

      {/* ── Behavior ── */}
      <div className="rounded-xl border bg-card p-4 space-y-4">
        <p className="text-sm font-semibold">Behavior</p>

        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Show service cost to clients</p>
            <p className="text-xs text-muted-foreground">Display price estimates on the booking form</p>
          </div>
          <Switch checked={form.showServiceCost} onCheckedChange={v => toggle("showServiceCost", v)} />
        </div>

        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-medium">Show service duration to clients</p>
            <p className="text-xs text-muted-foreground">Display estimated appointment length</p>
          </div>
          <Switch checked={form.showServiceDuration} onCheckedChange={v => toggle("showServiceDuration", v)} />
        </div>

        <div className="space-y-1.5">
          <Label className="text-sm font-medium">Completion redirect URL</Label>
          <Input
            placeholder="https://johnwillispiano.com/thank-you (leave blank to use built-in confirmation)"
            value={form.completionRedirectUrl}
            onChange={e => set("completionRedirectUrl", e.target.value)}
          />
        </div>
      </div>

      {/* ── Service Area ── */}
      <div className="rounded-xl border bg-card p-4 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-sm font-semibold">Service Area Validation</p>
            <p className="text-xs text-muted-foreground">Warn clients outside your travel radius</p>
          </div>
          <Switch checked={form.serviceAreaEnabled} onCheckedChange={v => toggle("serviceAreaEnabled", v)} />
        </div>

        {form.serviceAreaEnabled && (
          <div className="space-y-3 pt-1 border-t">
            <p className="text-xs text-muted-foreground">Set your home base coordinates and max travel radius. Use <a href="https://maps.google.com" target="_blank" rel="noopener noreferrer" className="underline">Google Maps</a> to find lat/lng (right-click a location → copy coordinates).</p>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-xs">Center Latitude</Label>
                <Input placeholder="e.g. 42.3601" value={form.serviceAreaLat} onChange={e => set("serviceAreaLat", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">Center Longitude</Label>
                <Input placeholder="e.g. -71.0589" value={form.serviceAreaLng} onChange={e => set("serviceAreaLng", e.target.value)} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Radius (miles)</Label>
              <Input placeholder="40" value={form.serviceAreaRadiusMiles} onChange={e => set("serviceAreaRadiusMiles", e.target.value)} className="w-32" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Outside service area message</Label>
              <Textarea
                rows={3}
                placeholder="Unfortunately your address appears to be outside our normal service area. Please contact us directly to discuss options."
                value={form.outsideServiceAreaMessage}
                onChange={e => set("outsideServiceAreaMessage", e.target.value)}
                className="resize-none text-sm"
              />
            </div>
          </div>
        )}
      </div>

      {/* ── Page Content ── */}
      <div className="rounded-xl border bg-card p-4 space-y-4">
        <p className="text-sm font-semibold">Page Content</p>
        <div className="space-y-1.5">
          <Label className="text-sm">Welcome message</Label>
          <Textarea
            rows={3}
            placeholder="e.g. Welcome! I'm John Willis, a piano technician serving Greater Boston. Fill out the form below and I'll be in touch within one business day."
            value={form.welcomeMessage}
            onChange={e => set("welcomeMessage", e.target.value)}
            className="resize-none text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">Reservation complete message</Label>
          <Textarea
            rows={3}
            placeholder="e.g. Your request has been received! I'll review it and reach out shortly to confirm your appointment time."
            value={form.reservationCompleteMessage}
            onChange={e => set("reservationCompleteMessage", e.target.value)}
            className="resize-none text-sm"
          />
        </div>
      </div>

      {/* ── Legal ── */}
      <div className="rounded-xl border bg-card p-4 space-y-4">
        <p className="text-sm font-semibold">Legal Notices</p>
        <div className="space-y-1.5">
          <Label className="text-sm">Privacy Policy URL</Label>
          <Input placeholder="https://johnwillispiano.com/privacy" value={form.privacyPolicyUrl} onChange={e => set("privacyPolicyUrl", e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <Label className="text-sm">Terms of Service URL</Label>
          <Input placeholder="https://johnwillispiano.com/terms" value={form.termsOfServiceUrl} onChange={e => set("termsOfServiceUrl", e.target.value)} />
        </div>
      </div>

      <div className="flex justify-end pt-1">
        <Button onClick={() => saveSchedulerMutation.mutate(form)} disabled={saveSchedulerMutation.isPending}>
          {saveSchedulerMutation.isPending ? "Saving…" : "Save Self-Scheduler Settings"}
        </Button>
      </div>
    </div>
  );
}

export default function SettingsPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [editItem, setEditItem] = useState<ServiceCatalogItem | null>(null);
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [activeGroupName, setActiveGroupName] = useState("");
  const [nextItemOrder, setNextItemOrder] = useState(0);
  const [editGroup, setEditGroup] = useState<ServiceGroup | null>(null);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [deleteItemId, setDeleteItemId] = useState<number | null>(null);
  const [deleteGroupId, setDeleteGroupId] = useState<number | null>(null);

  const [payForm, setPayForm] = useState({
    zelleHandle: "",
    paypalMe: "",
    venmoHandle: "",
    cashAppHandle: "",
    stripePaymentLink: "",
  });

  const { data: userSettings } = useQuery<UserSettings>({
    queryKey: ["/api/settings"],
  });

  useEffect(() => {
    if (userSettings) {
      setPayForm({
        zelleHandle: userSettings.zelleHandle ?? "",
        paypalMe: userSettings.paypalMe ?? "",
        venmoHandle: userSettings.venmoHandle ?? "",
        cashAppHandle: userSettings.cashAppHandle ?? "",
        stripePaymentLink: userSettings.stripePaymentLink ?? "",
      });
    }
  }, [userSettings]);

  const savePaymentMutation = useMutation({
    mutationFn: (data: typeof payForm) => apiRequest("PATCH", "/api/settings", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/settings"] });
      toast({ title: "Payment methods saved" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const { data: groups = [], isLoading: groupsLoading } = useQuery<ServiceGroup[]>({
    queryKey: ["/api/service-groups"],
  });

  const { data: catalog = [], isLoading: catalogLoading } = useQuery<ServiceCatalogItem[]>({
    queryKey: ["/api/service-catalog"],
  });

  const isLoading = groupsLoading || catalogLoading;

  const createGroupMutation = useMutation({
    mutationFn: (data: { name: string; sortOrder: number }) => apiRequest("POST", "/api/service-groups", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-groups"] });
      setGroupDialogOpen(false);
      toast({ title: "Group added" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateGroupMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<{ name: string; sortOrder: number }> }) =>
      apiRequest("PATCH", `/api/service-groups/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-groups"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteGroupMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/service-groups/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-groups"] });
      queryClient.invalidateQueries({ queryKey: ["/api/service-catalog"] });
      setDeleteGroupId(null);
      toast({ title: "Group deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  type CatalogPayload = {
    name: string;
    category: string;
    defaultCost: string;
    defaultDuration: string;
    description: string;
    isTuning: boolean;
    sortOrder: number;
  };

  const createItemMutation = useMutation({
    mutationFn: async (data: CatalogPayload): Promise<ServiceCatalogItem> => {
      const res = await apiRequest("POST", "/api/service-catalog", data);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-catalog"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CatalogPayload> }) =>
      apiRequest("PATCH", `/api/service-catalog/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-catalog"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteItemMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/service-catalog/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-catalog"] });
      setDeleteItemId(null);
      toast({ title: "Service deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const setDefaultMutation = useMutation({
    mutationFn: (id: number) => apiRequest("POST", `/api/service-catalog/${id}/set-default`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-catalog"] });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function handleSaveService(data: CatalogForm) {
    const { isDefault, durationMinutes, serviceType, descriptionText, ...fields } = data;
    const costRaw = parseFloat(fields.defaultCost.replace(/[^0-9.]/g, ""));
    const payload: CatalogPayload = {
      name: fields.name,
      category: fields.category === "__uncategorized__" ? "" : fields.category,
      defaultCost: isNaN(costRaw) ? "" : costRaw.toFixed(2),
      defaultDuration: minutesToDurationStr(durationMinutes),
      description: encodeDescription(serviceType, descriptionText),
      isTuning: fields.isTuning,
      sortOrder: fields.sortOrder,
    };
    if (editItem) {
      updateItemMutation.mutate({ id: editItem.id, data: payload }, {
        onSuccess: () => {
          setServiceDialogOpen(false);
          setEditItem(null);
          if (isDefault) setDefaultMutation.mutate(editItem.id);
        },
      });
    } else {
      createItemMutation.mutate(payload, {
        onSuccess: (createdItem) => {
          setServiceDialogOpen(false);
          toast({ title: "Service added" });
          if (isDefault) setDefaultMutation.mutate(createdItem.id);
        },
      });
    }
  }

  function handleSaveGroup(name: string) {
    if (editGroup) {
      updateGroupMutation.mutate({ id: editGroup.id, data: { name } }, {
        onSuccess: () => {
          setGroupDialogOpen(false);
          setEditGroup(null);
        },
      });
      const oldName = editGroup.name;
      catalog.filter(i => i.category === oldName).forEach(i => {
        updateItemMutation.mutate({ id: i.id, data: { category: name } });
      });
    } else {
      const nextOrder = groups.length > 0 ? Math.max(...groups.map(g => g.sortOrder ?? 0)) + 1 : 0;
      createGroupMutation.mutate({ name, sortOrder: nextOrder });
    }
  }

  function moveGroup(group: ServiceGroup, direction: "up" | "down") {
    const sorted = [...groups].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const idx = sorted.findIndex(g => g.id === group.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    updateGroupMutation.mutate({ id: group.id, data: { sortOrder: other.sortOrder ?? 0 } });
    updateGroupMutation.mutate({ id: other.id, data: { sortOrder: group.sortOrder ?? 0 } });
  }

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }));

  function handleItemDragEnd(event: DragEndEvent, groupItems: ServiceCatalogItem[]) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const sorted = [...groupItems].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const oldIndex = sorted.findIndex(i => i.id === active.id);
    const newIndex = sorted.findIndex(i => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const reordered = arrayMove(sorted, oldIndex, newIndex);
    reordered.forEach((item, idx) => {
      if ((item.sortOrder ?? 0) !== idx) {
        updateItemMutation.mutate({ id: item.id, data: { sortOrder: idx } });
      }
    });
  }

  function openAddItem(groupName: string, groupItems: ServiceCatalogItem[]) {
    setEditItem(null);
    setActiveGroupName(groupName);
    const nextOrder = groupItems.length > 0 ? Math.max(...groupItems.map(i => i.sortOrder ?? 0)) + 1 : 0;
    setNextItemOrder(nextOrder);
    setServiceDialogOpen(true);
  }

  function openEditItem(item: ServiceCatalogItem) {
    setEditItem(item);
    setActiveGroupName(item.category || "");
    setServiceDialogOpen(true);
  }

  const sortedGroups = [...groups].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  function getGroupItems(groupName: string): ServiceCatalogItem[] {
    const items = catalog.filter(i => i.category === groupName);
    const filtered = search
      ? items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
      : items;
    return [...filtered].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }

  const groupNames = new Set(groups.map(g => g.name));
  const uncategorized = catalog.filter(i => !i.category || !groupNames.has(i.category));
  const filteredUncategorized = search
    ? uncategorized.filter(i => i.name.toLowerCase().includes(search.toLowerCase()))
    : uncategorized;

  const isSavingItem = createItemMutation.isPending || updateItemMutation.isPending || setDefaultMutation.isPending;
  const isSavingGroup = createGroupMutation.isPending || updateGroupMutation.isPending;

  // ── Nav state ────────────────────────────────────────────────────────────────
  type SettingsSection = "payment-methods" | "master-service-list" | "company-profile" | "scheduling" | "self-scheduler";
  const [activeSection, setActiveSection] = useState<SettingsSection>("master-service-list");

  const NAV_GROUPS: { heading: string; items: { id: SettingsSection; label: string }[] }[] = [
    {
      heading: "Your Business",
      items: [
        { id: "company-profile", label: "Company Profile" },
        { id: "payment-methods", label: "Payment Methods" },
      ],
    },
    {
      heading: "Configuration",
      items: [
        { id: "master-service-list", label: "Master Service List" },
        { id: "scheduling", label: "Scheduling" },
        { id: "self-scheduler", label: "Self-Scheduler" },
      ],
    },
  ];

  // ── Content panels ────────────────────────────────────────────────────────
  function PaymentMethodsPanel() {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-semibold">Payment Methods</h2>
          <p className="text-sm text-muted-foreground mt-0.5">These appear on printed invoices so clients know how to pay you.</p>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label htmlFor="pay-zelle" className="text-sm">Zelle (phone or email)</Label>
            <Input id="pay-zelle" placeholder="e.g. 555-555-5555" value={payForm.zelleHandle} onChange={e => setPayForm(f => ({ ...f, zelleHandle: e.target.value }))} data-testid="input-zelle-handle" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-venmo" className="text-sm">Venmo handle</Label>
            <Input id="pay-venmo" placeholder="e.g. @JohnWillis" value={payForm.venmoHandle} onChange={e => setPayForm(f => ({ ...f, venmoHandle: e.target.value }))} data-testid="input-venmo-handle" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-cashapp" className="text-sm">Cash App $cashtag</Label>
            <Input id="pay-cashapp" placeholder="e.g. $JohnWillis" value={payForm.cashAppHandle} onChange={e => setPayForm(f => ({ ...f, cashAppHandle: e.target.value }))} data-testid="input-cashapp-handle" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pay-paypal" className="text-sm">PayPal.me link</Label>
            <Input id="pay-paypal" placeholder="e.g. paypal.me/johnwillis" value={payForm.paypalMe} onChange={e => setPayForm(f => ({ ...f, paypalMe: e.target.value }))} data-testid="input-paypal-me" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="pay-stripe" className="text-sm">Stripe payment link (credit/debit card)</Label>
            <Input id="pay-stripe" placeholder="e.g. https://buy.stripe.com/…" value={payForm.stripePaymentLink} onChange={e => setPayForm(f => ({ ...f, stripePaymentLink: e.target.value }))} data-testid="input-stripe-link" />
            <p className="text-xs text-muted-foreground">Create a payment link in your Stripe dashboard (Dashboard → Payment Links → + New) and paste the URL here.</p>
          </div>
        </div>
        <div className="flex justify-end pt-1">
          <Button size="sm" onClick={() => savePaymentMutation.mutate(payForm)} disabled={savePaymentMutation.isPending} data-testid="button-save-payment-methods">
            {savePaymentMutation.isPending ? "Saving…" : "Save Payment Methods"}
          </Button>
        </div>
      </div>
    );
  }

  function MasterServiceListPanel() {
    return (
      <div className="space-y-4">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold">Master Service List</h2>
            <p className="text-sm text-muted-foreground mt-0.5">Services available when scheduling appointments.</p>
          </div>
          <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => { setEditGroup(null); setGroupDialogOpen(true); }} data-testid="button-add-group">
            <FolderPlus className="h-3.5 w-3.5" /> Add Group
          </Button>
        </div>

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
          <Input className="pl-8 h-9 text-sm" placeholder="Search services…" value={search} onChange={e => setSearch(e.target.value)} data-testid="input-search-services" />
        </div>

        {isLoading ? (
          <div className="space-y-3">{Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-24 w-full rounded-md" />)}</div>
        ) : (
          <div className="space-y-3">
            {sortedGroups.map((group, groupIdx) => {
              const groupItems = getGroupItems(group.name);
              const allGroupItems = catalog.filter(i => i.category === group.name);
              const isFirst = groupIdx === 0;
              const isLast = groupIdx === sortedGroups.length - 1;
              return (
                <div key={group.id} className="rounded-md border overflow-hidden" data-testid={`group-${group.id}`}>
                  <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b">
                    <div className="flex flex-col -space-y-1">
                      <button className="p-0.5 rounded hover:bg-accent disabled:opacity-30" disabled={isFirst || updateGroupMutation.isPending} onClick={() => moveGroup(group, "up")} data-testid={`button-group-up-${group.id}`}><ChevronUp className="h-3 w-3" /></button>
                      <button className="p-0.5 rounded hover:bg-accent disabled:opacity-30" disabled={isLast || updateGroupMutation.isPending} onClick={() => moveGroup(group, "down")} data-testid={`button-group-down-${group.id}`}><ChevronDown className="h-3 w-3" /></button>
                    </div>
                    <span className="font-semibold text-sm flex-1" data-testid={`group-name-${group.id}`}>{group.name}</span>
                    <span className="text-xs text-muted-foreground">{allGroupItems.length} {allGroupItems.length === 1 ? "item" : "items"}</span>
                    <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setEditGroup(group); setGroupDialogOpen(true); }} data-testid={`button-rename-group-${group.id}`}><Pencil className="h-3 w-3" /></Button>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleteGroupId(group.id)} data-testid={`button-delete-group-${group.id}`}><Trash2 className="h-3 w-3" /></Button>
                  </div>
                  {groupItems.length === 0 && !search && <p className="text-xs text-muted-foreground text-center py-3">No services yet</p>}
                  {groupItems.length > 0 && (
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={(e) => handleItemDragEnd(e, groupItems)}>
                      <SortableContext items={groupItems.map(i => i.id)} strategy={verticalListSortingStrategy}>
                        <div className="divide-y">
                          {groupItems.map((item) => (
                            <SortableItemRow key={item.id} item={item} onEdit={openEditItem} onDelete={setDeleteItemId} dragDisabled={!!search} />
                          ))}
                        </div>
                      </SortableContext>
                    </DndContext>
                  )}
                  <div className="px-3 py-2 border-t bg-muted/20">
                    <Button variant="ghost" size="sm" className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground w-full justify-start" onClick={() => openAddItem(group.name, allGroupItems)} data-testid={`button-add-item-${group.id}`}>
                      <Plus className="h-3 w-3" /> Add Item
                    </Button>
                  </div>
                </div>
              );
            })}

            {filteredUncategorized.length > 0 && (
              <div className="rounded-md border overflow-hidden opacity-80" data-testid="group-uncategorized">
                <div className="flex items-center gap-2 px-3 py-2 bg-muted/30 border-b">
                  <span className="font-semibold text-sm flex-1 text-muted-foreground">Uncategorized</span>
                  <span className="text-xs text-muted-foreground">{filteredUncategorized.length} items</span>
                </div>
                <div className="divide-y">
                  {filteredUncategorized.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map(item => (
                    <div key={item.id} className="flex items-center gap-2 px-3 py-2" data-testid={`service-row-${item.id}`}>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-medium text-sm" data-testid={`service-name-${item.id}`}>{item.name}</span>
                          {item.isTuning && <Badge className="bg-teal-600 text-white hover:bg-teal-600 text-[10px] px-1.5 py-0 gap-0.5"><Music className="h-2.5 w-2.5" /> TUNING</Badge>}
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 truncate">
                          {SERVICE_TYPE_LABELS[decodeDescription(item.description).serviceType || ""] ?? "Fixed Rate Labor"}
                          {item.defaultCost ? ` — ${formatCostDisplay(item.defaultCost)}` : ""}
                          {item.defaultDuration && item.defaultDuration !== "0 hr"
                            ? ` — ${item.defaultDuration}`
                            : " — No time added"}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditItem(item)} data-testid={`button-edit-service-${item.id}`}><Pencil className="h-3.5 w-3.5" /></Button>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => setDeleteItemId(item.id)} data-testid={`button-delete-service-${item.id}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {groups.length === 0 && catalog.length === 0 && !isLoading && (
              <div className="rounded-lg border border-dashed py-10 text-center">
                <ClipboardList className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No service groups yet.</p>
                <Button size="sm" variant="outline" className="mt-3 text-xs gap-1.5" onClick={() => { setEditGroup(null); setGroupDialogOpen(true); }}>
                  <FolderPlus className="h-3.5 w-3.5" /> Add Your First Group
                </Button>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  function StubPanel({ title, description }: { title: string; description: string }) {
    return (
      <div className="space-y-2">
        <h2 className="text-lg font-semibold">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
        <div className="rounded-lg border border-dashed py-12 text-center mt-4">
          <p className="text-sm text-muted-foreground">Coming soon</p>
        </div>
      </div>
    );
  }


  // NOTE: the hook-less panels are invoked as plain functions (not JSX components).
  // Rendering them as <PaymentMethodsPanel /> remounted the whole form on every parent
  // re-render (new function identity each render), which dropped input focus after each
  // keystroke and closed the iOS keyboard. SelfSchedulerPanel has its own hooks, so it
  // lives at module level (stable identity) and is rendered as a real component.
  function activePanel() {
    if (activeSection === "payment-methods") return PaymentMethodsPanel();
    if (activeSection === "master-service-list") return MasterServiceListPanel();
    if (activeSection === "company-profile") return StubPanel({ title: "Company Profile", description: "Your business name, address, and contact info shown on invoices." });
    if (activeSection === "scheduling") return StubPanel({ title: "Scheduling", description: "Default appointment duration, buffer time, and calendar preferences." });
    if (activeSection === "self-scheduler") return <SelfSchedulerPanel />;
    return null;
  }

  return (
    <div className="flex min-h-0 h-full">
      {/* ── Left nav ── */}
      <aside className="hidden sm:flex flex-col w-52 shrink-0 border-r bg-muted/20 p-4 gap-6 overflow-y-auto">
        <h1 className="text-base font-bold tracking-tight px-1" data-testid="text-settings-title">Settings</h1>
        {NAV_GROUPS.map(group => (
          <div key={group.heading}>
            <p className="text-xs font-bold text-foreground px-1 mb-1">{group.heading}</p>
            <div className="space-y-0.5">
              {group.items.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveSection(item.id)}
                  className={`w-full text-left text-sm px-2 py-1.5 rounded-md transition-colors ${
                    activeSection === item.id
                      ? "bg-accent text-accent-foreground font-medium"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        ))}
      </aside>

      {/* ── Mobile: horizontal pill tabs ── */}
      <div className="sm:hidden w-full">
        <div className="flex overflow-x-auto gap-1 px-4 py-3 border-b bg-muted/20 no-scrollbar">
          {NAV_GROUPS.flatMap(g => g.items).map(item => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveSection(item.id)}
              className={`shrink-0 text-xs px-3 py-1.5 rounded-full border transition-colors ${
                activeSection === item.id
                  ? "bg-foreground text-background border-foreground font-medium"
                  : "border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="p-4">
          {activePanel()}
        </div>
      </div>

      {/* ── Right content ── */}
      <main className="hidden sm:block flex-1 overflow-y-auto p-6 max-w-3xl">
        {activePanel()}
      </main>

      <ServiceDialog
        key={editItem?.id ?? "new"}
        open={serviceDialogOpen}
        onOpenChange={v => { setServiceDialogOpen(v); if (!v) setEditItem(null); }}
        item={editItem}
        groupName={activeGroupName}
        groups={groups}
        nextSortOrder={nextItemOrder}
        onSave={handleSaveService}
        isSaving={isSavingItem}
      />

      <GroupDialog
        open={groupDialogOpen}
        onOpenChange={v => { setGroupDialogOpen(v); if (!v) setEditGroup(null); }}
        group={editGroup}
        onSave={handleSaveGroup}
        isSaving={isSavingGroup}
      />

      <AlertDialog open={deleteItemId !== null} onOpenChange={v => { if (!v) setDeleteItemId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Service</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this service from the catalog? This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteItemId !== null && deleteItemMutation.mutate(deleteItemId)}
              disabled={deleteItemMutation.isPending}
              data-testid="button-delete-confirm"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteGroupId !== null} onOpenChange={v => { if (!v) setDeleteGroupId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Group</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete this group? Services in this group will become uncategorized.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-group-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteGroupId !== null && deleteGroupMutation.mutate(deleteGroupId)}
              disabled={deleteGroupMutation.isPending}
              data-testid="button-delete-group-confirm"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
