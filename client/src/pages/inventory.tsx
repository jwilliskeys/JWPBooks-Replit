import { useState, useCallback, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Plus,
  Minus,
  Trash2,
  Edit,
  Package,
  Calculator,
  Search,
  MapPin,
  Box,
  RefreshCw,
} from "lucide-react";

// ── Constants ───────────────────────────────────────────────────────────────

const LOCATIONS = ["Apartment", "BU", "Newton Shop"];
const UNASSIGNED = "Unassigned";

const SUPPLY_CATEGORIES = [
  "Capstans",
  "Front Rail Punchings",
  "Nameboard Felt",
  "Bushing Cloth",
  "Ecsaine Leather",
  "Damper Felt",
  "Other Supplies",
];

const OTHER_PART_CATEGORIES = [
  "Strings", "Dampers", "Keys", "Hammers (Other)", "Shanks & Flanges",
  "Whippens", "Key Bushings", "Key Tops / Keytops", "Pedals & Trapwork",
  "Tuning Pins & Pin Block", "Bridge & Soundboard", "Case / Lid",
  "Felts & Cloth", "Springs", "Screws & Hardware", "Tools", "Other",
];

// ── Types ──────────────────────────────────────────────────────────────────

interface HammerEntry {
  id: string;
  make: string;
  model: string;
  setType: string;        // "H" | "S & F" | "HSF"
  feltColor: string;
  wood: string;
  totalNotes: string;
  bassCount: string;
  trebleCount: string;
  bassBore: string;
  trebleBore: string;
  bassAngle: string;
  trebleAngle: string;
  shankInput: string;     // mm from shank center pin
  shankLength: string;    // mm
  hammerOutput: string;   // mm
  quantity: string;
  location: string;
  container: string;
  notes: string;
}

interface WhippenEntry {
  id: string;
  kind: string;           // "Whippen" | "Flange" | "Underlever"
  model: string;
  quantity: string;
  inputMm: string;        // capstan → center
  outputMm: string;       // center → jack
  location: string;
  container: string;
  notes: string;
}

interface WireEntry {
  id: string;
  size: string;
  form: string;           // "1 lb coil" | "5 lb coil" | ...
  quantity: string;
  location: string;
  container: string;
  notes: string;
}

interface TuningPinEntry {
  id: string;
  size: string;           // "1/0".."7/0"
  length: string;         // 2 3/8" | 2 1/2"
  quantity: string;
  location: string;
  container: string;
  notes: string;
}

interface CenterPinEntry {
  id: string;
  size: string;
  inKitQty: string;
  extraQty: string;
  location: string;
  container: string;
  notes: string;
}

interface SupplyItem {
  id: string;
  category: string;
  name: string;
  variant: string;
  quantity: string;
  unit: string;
  location: string;
  container: string;
  notes: string;
}

interface OtherPart {
  id: string;
  name: string;
  category: string;
  partNumber: string;
  quantity: string;
  unit: string;
  location: string;
  container: string;
  notes: string;
}

interface Inventory {
  hammers: HammerEntry[];
  whippens: WhippenEntry[];
  wire: WireEntry[];
  tuningPins: TuningPinEntry[];
  centerPins: CenterPinEntry[];
  supplies: SupplyItem[];
  otherParts: OtherPart[];
  rennerParts?: unknown[]; // legacy — preserved on save, no UI
}

const emptyInventory: Inventory = {
  hammers: [], whippens: [], wire: [], tuningPins: [],
  centerPins: [], supplies: [], otherParts: [], rennerParts: [],
};

type ListKey = "hammers" | "whippens" | "wire" | "tuningPins" | "centerPins" | "supplies" | "otherParts";

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function ratioOf(output: string, input: string): string {
  const o = parseFloat(output);
  const i = parseFloat(input);
  if (isNaN(o) || isNaN(i) || i === 0) return "—";
  return (o / i).toFixed(2);
}

function locLabel(loc: string) {
  return loc || UNASSIGNED;
}

// ── Generic add/edit dialog ─────────────────────────────────────────────────

interface FieldDef {
  key: string;
  label: string;
  type?: "text" | "select" | "textarea";
  options?: string[];
  placeholder?: string;
  span2?: boolean;
}

const locField: FieldDef = { key: "location", label: "Location", type: "select", options: [UNASSIGNED, ...LOCATIONS] };
const boxField: FieldDef = { key: "container", label: "Box / Kit / Bag", placeholder: "bag #1, center pin kit, shelf…" };
const notesField: FieldDef = { key: "notes", label: "Notes", type: "textarea", span2: true };

function GenericDialog({
  title,
  fields,
  entry,
  onSave,
  onClose,
}: {
  title: string;
  fields: FieldDef[];
  entry: Record<string, string>;
  onSave: (e: Record<string, string>) => void;
  onClose: () => void;
}) {
  const [form, setForm] = useState<Record<string, string>>(entry);
  const set = (key: string, val: string) => setForm(prev => ({ ...prev, [key]: val }));

  return (
    <Dialog open onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          {fields.map(f => (
            <div key={f.key} className={f.span2 ? "col-span-2" : ""}>
              <Label className="text-xs">{f.label}</Label>
              {f.type === "select" ? (
                <Select
                  value={form[f.key] || (f.options?.includes(UNASSIGNED) ? UNASSIGNED : undefined)}
                  onValueChange={v => set(f.key, v === UNASSIGNED ? "" : v)}
                >
                  <SelectTrigger data-testid={`select-${f.key}`}><SelectValue placeholder="…" /></SelectTrigger>
                  <SelectContent>
                    {(f.options ?? []).map(o => <SelectItem key={o} value={o}>{o}</SelectItem>)}
                  </SelectContent>
                </Select>
              ) : f.type === "textarea" ? (
                <Textarea value={form[f.key] ?? ""} onChange={e => set(f.key, e.target.value)} rows={2} />
              ) : (
                <Input value={form[f.key] ?? ""} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder} />
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(form)} data-testid="button-save-inventory-item">Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Dialog field configs per section ────────────────────────────────────────

const DIALOG_CONFIGS: Record<ListKey, { title: string; fields: FieldDef[] }> = {
  hammers: {
    title: "Hammer Set",
    fields: [
      { key: "make", label: "Make", placeholder: "Renner, Baldwin, Steinway…" },
      { key: "model", label: "Model / Serial", placeholder: "913001, L, R, C7…" },
      { key: "setType", label: "Set Type", type: "select", options: ["H", "S & F", "HSF", "Other"] },
      { key: "feltColor", label: "Felt Color", placeholder: "Red, Maroon, Green…" },
      { key: "wood", label: "Wood", placeholder: "Birch, Maple…" },
      { key: "quantity", label: "Sets in Stock", placeholder: "1" },
      { key: "totalNotes", label: "Total Hammers", placeholder: "88" },
      { key: "bassCount", label: "Bass Count", placeholder: "26" },
      { key: "trebleCount", label: "Treble Count", placeholder: "62" },
      { key: "bassBore", label: "Bass Bore", placeholder: "58" },
      { key: "trebleBore", label: "Treble Bore", placeholder: "50" },
      { key: "bassAngle", label: "Bass Angle", placeholder: "10" },
      { key: "trebleAngle", label: "Treble Angle", placeholder: "" },
      { key: "shankInput", label: "Shank Input (mm)", placeholder: "22" },
      { key: "shankLength", label: "Shank Length (mm)", placeholder: "140" },
      { key: "hammerOutput", label: "Hammer Output (mm)", placeholder: "145.1" },
      locField,
      boxField,
      notesField,
    ],
  },
  whippens: {
    title: "Whippen / Flange / Underlever",
    fields: [
      { key: "kind", label: "Kind", type: "select", options: ["Whippen", "Flange", "Underlever"] },
      { key: "model", label: "Model", placeholder: "New Steinway, 913010, Baldwin R…" },
      { key: "quantity", label: "Quantity", placeholder: "8" },
      { key: "inputMm", label: "Capstan → Center (mm)", placeholder: "67" },
      { key: "outputMm", label: "Center → Jack (mm)", placeholder: "96" },
      locField,
      boxField,
      notesField,
    ],
  },
  wire: {
    title: "String Wire",
    fields: [
      { key: "size", label: "Wire Size", placeholder: "14, 14.5, 15…" },
      { key: "form", label: "Form", type: "select", options: ["1 lb coil", "5 lb coil", "Partial coil", "Other"] },
      { key: "quantity", label: "Quantity", placeholder: "1" },
      locField,
      boxField,
      notesField,
    ],
  },
  tuningPins: {
    title: "Tuning Pins",
    fields: [
      { key: "size", label: "Pin Size", placeholder: "2/0, 3/0…" },
      { key: "length", label: "Length", type: "select", options: ['2 3/8"', '2 1/2"', "Other"] },
      { key: "quantity", label: "Quantity", placeholder: "12" },
      locField,
      boxField,
      notesField,
    ],
  },
  centerPins: {
    title: "Center Pins",
    fields: [
      { key: "size", label: "Pin Size", placeholder: "20.5, 21…" },
      { key: "inKitQty", label: "Qty in Kit", placeholder: "1" },
      { key: "extraQty", label: "Extra Qty", placeholder: "3" },
      locField,
      boxField,
      notesField,
    ],
  },
  supplies: {
    title: "Supply",
    fields: [
      { key: "category", label: "Category", type: "select", options: SUPPLY_CATEGORIES },
      { key: "name", label: "Item", placeholder: "Mono precut, Backchecks, APSCO set…", span2: false },
      { key: "variant", label: "Variant / Color", placeholder: "White, Red, Black…" },
      { key: "quantity", label: "Quantity", placeholder: "2" },
      { key: "unit", label: "Unit", type: "select", options: ["each", "set", "pair", "strip", "sheet", "roll", "box", "ft", "yard"] },
      locField,
      boxField,
      notesField,
    ],
  },
  otherParts: {
    title: "Part",
    fields: [
      { key: "name", label: "Part Name", span2: true, placeholder: "e.g. Steinway bass damper felt" },
      { key: "category", label: "Category", type: "select", options: OTHER_PART_CATEGORIES },
      { key: "partNumber", label: "Part Number / SKU", placeholder: "optional" },
      { key: "quantity", label: "Quantity", placeholder: "1" },
      { key: "unit", label: "Unit", type: "select", options: ["each", "set", "pair", "ft", "m", "yard", "box", "roll", "oz", "lb"] },
      locField,
      boxField,
      notesField,
    ],
  },
};

const BLANKS: Record<ListKey, () => Record<string, string>> = {
  hammers: () => ({
    id: genId(), make: "", model: "", setType: "H", feltColor: "", wood: "",
    totalNotes: "", bassCount: "", trebleCount: "", bassBore: "", trebleBore: "",
    bassAngle: "", trebleAngle: "", shankInput: "", shankLength: "", hammerOutput: "",
    quantity: "1", location: "", container: "", notes: "",
  }),
  whippens: () => ({
    id: genId(), kind: "Whippen", model: "", quantity: "1",
    inputMm: "", outputMm: "", location: "", container: "", notes: "",
  }),
  wire: () => ({
    id: genId(), size: "", form: "1 lb coil", quantity: "1",
    location: "", container: "", notes: "",
  }),
  tuningPins: () => ({
    id: genId(), size: "", length: '2 1/2"', quantity: "",
    location: "", container: "", notes: "",
  }),
  centerPins: () => ({
    id: genId(), size: "", inKitQty: "", extraQty: "",
    location: "", container: "", notes: "",
  }),
  supplies: () => ({
    id: genId(), category: "Other Supplies", name: "", variant: "",
    quantity: "", unit: "each", location: "", container: "", notes: "",
  }),
  otherParts: () => ({
    id: genId(), name: "", category: "", partNumber: "",
    quantity: "1", unit: "each", location: "", container: "", notes: "",
  }),
};

// ── Qty stepper (tap +/- from the table, no dialog needed) ─────────────────

function QtyStepper({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const n = parseInt(value, 10);
  const isPlainInt = !isNaN(n) && /^\d+$/.test((value ?? "").trim());
  if (!isPlainInt) return <span className="tabular-nums text-sm">{value || "—"}</span>;
  return (
    <div className="flex items-center gap-1">
      <Button variant="outline" size="icon" className="h-6 w-6 shrink-0" disabled={n <= 0}
        onClick={() => onChange(String(n - 1))} data-testid="button-qty-minus">
        <Minus className="h-3 w-3" />
      </Button>
      <span className="tabular-nums w-9 text-center text-sm">{n}</span>
      <Button variant="outline" size="icon" className="h-6 w-6 shrink-0"
        onClick={() => onChange(String(n + 1))} data-testid="button-qty-plus">
        <Plus className="h-3 w-3" />
      </Button>
    </div>
  );
}

function LocBadge({ loc, container }: { loc: string; container: string }) {
  return (
    <div className="text-xs">
      <span className={loc ? "" : "text-muted-foreground italic"}>{locLabel(loc)}</span>
      {container && <div className="text-muted-foreground">{container}</div>}
    </div>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex gap-1">
      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onEdit}>
        <Edit className="h-3 w-3" />
      </Button>
      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={onDelete}>
        <Trash2 className="h-3 w-3" />
      </Button>
    </div>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="text-center py-10 text-muted-foreground text-sm">
      <Package className="h-8 w-8 mx-auto mb-3 opacity-40" />
      <p>{text}</p>
    </div>
  );
}

// ── Action Geometry Calculator (unchanged) ──────────────────────────────────

interface GeoInputs {
  blowDistance: string;
  keyTravel: string;
  capstanHeight: string;
  jackLength: string;
  knuckleRadius: string;
  wippen_length: string;
  balanceRailPos: string;
  keyLength: string;
  letOff: string;
  drop: string;
  afterTouch: string;
}

interface GeoResults {
  blowRatio: number | null;
  leverRatio: number | null;
  jackTravel: number | null;
  hammerVelocityFactor: number | null;
  letOffPercent: number | null;
  efficiency: string;
}

function calcGeometry(inputs: GeoInputs): GeoResults {
  const blow = parseFloat(inputs.blowDistance);
  const keyDip = parseFloat(inputs.keyTravel);
  const wl = parseFloat(inputs.wippen_length);
  const kl = parseFloat(inputs.keyLength);
  const bal = parseFloat(inputs.balanceRailPos);
  const letOff = parseFloat(inputs.letOff);

  const blowRatio = (!isNaN(blow) && !isNaN(keyDip) && keyDip !== 0)
    ? Math.round((blow / keyDip) * 100) / 100 : null;

  const frontSection = bal;
  const backSection = kl - bal;
  const leverRatio = (!isNaN(kl) && !isNaN(bal) && frontSection !== 0)
    ? Math.round((backSection / frontSection) * 100) / 100 : null;

  const jackTravel = (!isNaN(blow) && !isNaN(wl) && !isNaN(kl) && !isNaN(bal) && backSection !== 0)
    ? Math.round((blow * (frontSection / backSection)) * 100) / 100 : null;

  const letOffPercent = (!isNaN(letOff) && !isNaN(blow) && blow !== 0)
    ? Math.round((letOff / blow) * 1000) / 10 : null;

  const hammerVelocityFactor = blowRatio !== null ? Math.round(blowRatio * 100) / 100 : null;

  let efficiency = "—";
  if (blowRatio !== null) {
    if (blowRatio < 3.5) efficiency = "Low — sluggish action";
    else if (blowRatio < 4.5) efficiency = "Normal";
    else if (blowRatio < 5.5) efficiency = "High — responsive";
    else efficiency = "Very high — may feel stiff";
  }

  return { blowRatio, leverRatio, jackTravel, hammerVelocityFactor, letOffPercent, efficiency };
}

// ── Find It: flattened item index ───────────────────────────────────────────

interface FlatItem {
  key: ListKey;
  id: string;
  section: string;
  label: string;
  detail: string;
  qty: string;
  location: string;
  container: string;
}

function flattenInventory(inv: Inventory): FlatItem[] {
  const out: FlatItem[] = [];
  inv.hammers.forEach(h => out.push({
    key: "hammers", id: h.id, section: "Hammers",
    label: [h.make, h.model].filter(Boolean).join(" "),
    detail: [h.setType, h.feltColor && `${h.feltColor} felt`, h.totalNotes && `${h.totalNotes} hammers`].filter(Boolean).join(" · "),
    qty: h.quantity || "1", location: h.location, container: h.container,
  }));
  inv.whippens.forEach(w => out.push({
    key: "whippens", id: w.id, section: "Whippens",
    label: `${w.model} ${w.kind !== "Whippen" ? w.kind : "whippen"}`.trim(),
    detail: w.inputMm && w.outputMm ? `${w.inputMm} → ${w.outputMm} mm` : "",
    qty: w.quantity, location: w.location, container: w.container,
  }));
  inv.wire.forEach(w => out.push({
    key: "wire", id: w.id, section: "String Wire",
    label: `Wire #${w.size}`, detail: w.form,
    qty: w.quantity, location: w.location, container: w.container,
  }));
  inv.tuningPins.forEach(p => out.push({
    key: "tuningPins", id: p.id, section: "Tuning Pins",
    label: `Tuning pins ${p.size}`, detail: p.length,
    qty: p.quantity, location: p.location, container: p.container,
  }));
  inv.centerPins.forEach(p => out.push({
    key: "centerPins", id: p.id, section: "Center Pins",
    label: `Center pins ${p.size}`,
    detail: [p.inKitQty && `${p.inKitQty} in kit`, p.extraQty && `${p.extraQty} extra`].filter(Boolean).join(" · "),
    qty: "", location: p.location, container: p.container,
  }));
  inv.supplies.forEach(s => out.push({
    key: "supplies", id: s.id, section: s.category,
    label: [s.name, s.variant && `(${s.variant})`].filter(Boolean).join(" "),
    detail: "",
    qty: [s.quantity, s.quantity && s.unit].filter(Boolean).join(" "),
    location: s.location, container: s.container,
  }));
  inv.otherParts.forEach(p => out.push({
    key: "otherParts", id: p.id, section: p.category || "Other Parts",
    label: p.name, detail: p.partNumber,
    qty: [p.quantity, p.quantity && p.unit].filter(Boolean).join(" "),
    location: p.location ?? "", container: p.container ?? "",
  }));
  return out;
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const { toast } = useToast();

  const { data: inv, isLoading } = useQuery<Inventory>({
    queryKey: ["/api/inventory"],
    select: (d) => ({ ...emptyInventory, ...(d ?? {}) }),
  });

  const saveMutation = useMutation({
    mutationFn: (data: Inventory) => apiRequest("PUT", "/api/inventory", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const inventory = inv ?? emptyInventory;

  // One shared dialog for every section
  const [dialog, setDialog] = useState<{ key: ListKey; entry: Record<string, string> } | null>(null);

  const openAdd = (key: ListKey, preset?: Record<string, string>) =>
    setDialog({ key, entry: { ...BLANKS[key](), ...(preset ?? {}) } });
  const openEdit = (key: ListKey, entry: unknown) =>
    setDialog({ key, entry: { ...(entry as Record<string, string>) } });

  const saveItem = useCallback((key: ListKey, item: Record<string, string>) => {
    const list = (inventory[key] as unknown as Record<string, string>[]) ?? [];
    const idx = list.findIndex(x => x.id === item.id);
    const updated = idx >= 0 ? list.map(x => (x.id === item.id ? item : x)) : [...list, item];
    saveMutation.mutate({ ...inventory, [key]: updated });
    setDialog(null);
    toast({ title: "Saved" });
  }, [inventory, saveMutation, toast]);

  const deleteItem = useCallback((key: ListKey, id: string) => {
    const list = (inventory[key] as { id: string }[]).filter(x => x.id !== id);
    saveMutation.mutate({ ...inventory, [key]: list });
  }, [inventory, saveMutation]);

  const patchField = useCallback((key: ListKey, id: string, field: string, value: string) => {
    const list = (inventory[key] as unknown as Record<string, string>[]).map(x =>
      x.id === id ? { ...x, [field]: value } : x);
    saveMutation.mutate({ ...inventory, [key]: list });
  }, [inventory, saveMutation]);

  // ── Find It state ──────────────────────────────────────────────────────
  const [query, setQuery] = useState("");
  const [locFilter, setLocFilter] = useState<string>("All");
  const [grouped, setGrouped] = useState(true);

  const flat = useMemo(() => flattenInventory(inventory), [inventory]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return flat.filter(item => {
      if (locFilter !== "All") {
        if (locFilter === UNASSIGNED ? item.location !== "" : item.location !== locFilter) return false;
      }
      if (!q) return true;
      return [item.label, item.detail, item.section, item.container, item.location]
        .join(" ").toLowerCase().includes(q);
    });
  }, [flat, query, locFilter]);

  const locCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    flat.forEach(i => { const l = locLabel(i.location); counts[l] = (counts[l] ?? 0) + 1; });
    return counts;
  }, [flat]);

  // Grouped: location → container → items
  const groupedItems = useMemo(() => {
    const locOrder = [...LOCATIONS, UNASSIGNED];
    const byLoc = new Map<string, Map<string, FlatItem[]>>();
    filtered.forEach(item => {
      const l = locLabel(item.location);
      const c = item.container || "Loose / unboxed";
      if (!byLoc.has(l)) byLoc.set(l, new Map());
      const m = byLoc.get(l)!;
      if (!m.has(c)) m.set(c, []);
      m.get(c)!.push(item);
    });
    const locs = Array.from(byLoc.keys()).sort((a, b) => {
      const ia = locOrder.indexOf(a); const ib = locOrder.indexOf(b);
      return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    });
    return locs.map(l => ({
      location: l,
      containers: Array.from(byLoc.get(l)!.entries())
        .sort(([a], [b]) => (a === "Loose / unboxed" ? 1 : b === "Loose / unboxed" ? -1 : a.localeCompare(b))),
    }));
  }, [filtered]);

  // Supplies grouped by category for the Supplies tab
  const suppliesByCategory = useMemo(() => {
    const cats = [...SUPPLY_CATEGORIES];
    inventory.supplies.forEach(s => { if (s.category && !cats.includes(s.category)) cats.push(s.category); });
    return cats
      .map(c => ({ category: c, items: inventory.supplies.filter(s => s.category === c) }))
      .filter(g => g.items.length > 0);
  }, [inventory.supplies]);

  // ── Calculator state (unchanged) ───────────────────────────────────────
  const [geo, setGeo] = useState<GeoInputs>({
    blowDistance: "48", keyTravel: "10", capstanHeight: "18", jackLength: "32",
    knuckleRadius: "6.5", wippen_length: "85", balanceRailPos: "160",
    keyLength: "490", letOff: "2", drop: "1", afterTouch: "1",
  });
  const geoResults = calcGeometry(geo);
  const setGeoField = (field: keyof GeoInputs, val: string) =>
    setGeo(prev => ({ ...prev, [field]: val }));

  if (isLoading) {
    return (
      <div className="p-6 flex items-center gap-2 text-muted-foreground">
        <RefreshCw className="h-4 w-4 animate-spin" />
        Loading inventory…
      </div>
    );
  }

  const wireAndPinCount = inventory.wire.length + inventory.tuningPins.length + inventory.centerPins.length;
  const suppliesCount = inventory.supplies.length + inventory.otherParts.length;

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Package className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold" data-testid="text-inventory-title">Parts Inventory</h1>
          <p className="text-sm text-muted-foreground">
            Every part, box, and kit — Apartment · BU · Newton Shop
          </p>
        </div>
      </div>

      <Tabs defaultValue="find">
        <div className="overflow-x-auto mb-4">
          <TabsList className="w-max">
            <TabsTrigger value="find" data-testid="tab-find-it">
              <Search className="h-3.5 w-3.5 mr-1.5" /> Find It
            </TabsTrigger>
            <TabsTrigger value="hammers">
              Hammers
              {inventory.hammers.length > 0 && <Badge variant="secondary" className="ml-2 text-xs">{inventory.hammers.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="whippens">
              Whippens
              {inventory.whippens.length > 0 && <Badge variant="secondary" className="ml-2 text-xs">{inventory.whippens.length}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="wirepins">
              Wire &amp; Pins
              {wireAndPinCount > 0 && <Badge variant="secondary" className="ml-2 text-xs">{wireAndPinCount}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="supplies">
              Felts &amp; Supplies
              {suppliesCount > 0 && <Badge variant="secondary" className="ml-2 text-xs">{suppliesCount}</Badge>}
            </TabsTrigger>
            <TabsTrigger value="calculator">
              <Calculator className="h-3.5 w-3.5 mr-1.5" /> Calculator
            </TabsTrigger>
          </TabsList>
        </div>

        {/* ── FIND IT ──────────────────────────────────────────────────── */}
        <TabsContent value="find">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            <div className="relative flex-1 min-w-[200px]">
              <Search className="h-4 w-4 absolute left-2.5 top-2.5 text-muted-foreground" />
              <Input
                className="pl-8"
                placeholder="Search parts, boxes, kits…"
                value={query}
                onChange={e => setQuery(e.target.value)}
                data-testid="input-inventory-search"
              />
            </div>
            <Button variant="outline" size="sm" onClick={() => setGrouped(g => !g)} data-testid="button-toggle-grouping">
              {grouped ? "Flat list" : "Group by location"}
            </Button>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            {["All", ...LOCATIONS, UNASSIGNED].map(l => (
              <Button
                key={l}
                variant={locFilter === l ? "default" : "outline"}
                size="sm"
                className="h-7 text-xs"
                onClick={() => setLocFilter(l)}
                data-testid={`filter-loc-${l}`}
              >
                <MapPin className="h-3 w-3 mr-1" />
                {l}
                {l !== "All" && <span className="ml-1.5 opacity-70 tabular-nums">{locCounts[l] ?? 0}</span>}
              </Button>
            ))}
          </div>

          {filtered.length === 0 ? (
            <EmptyState text="Nothing matches. Try a different search or location." />
          ) : grouped ? (
            <div className="space-y-4">
              {groupedItems.map(g => (
                <Card key={g.location}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-semibold flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-primary" />
                      {g.location}
                      <Badge variant="secondary" className="text-xs">
                        {g.containers.reduce((n, [, items]) => n + items.length, 0)} items
                      </Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {g.containers.map(([container, items]) => (
                      <div key={container}>
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1 flex items-center gap-1.5">
                          <Box className="h-3 w-3" /> {container}
                        </p>
                        <div className="rounded-md border divide-y">
                          {items.map(item => (
                            <button
                              key={`${item.key}-${item.id}`}
                              className="w-full flex items-center justify-between gap-2 px-3 py-1.5 text-left hover:bg-muted/50"
                              onClick={() => openEdit(item.key, (inventory[item.key] as { id: string }[]).find(x => x.id === item.id))}
                            >
                              <div className="min-w-0">
                                <span className="text-sm font-medium">{item.label || "—"}</span>
                                {item.detail && <span className="text-xs text-muted-foreground ml-2">{item.detail}</span>}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                {item.qty && <span className="text-sm tabular-nums">{item.qty}</span>}
                                <Badge variant="outline" className="text-xs">{item.section}</Badge>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Item</TableHead>
                        <TableHead>Section</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Box / Kit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map(item => (
                        <TableRow
                          key={`${item.key}-${item.id}`}
                          className="text-sm cursor-pointer"
                          onClick={() => openEdit(item.key, (inventory[item.key] as { id: string }[]).find(x => x.id === item.id))}
                        >
                          <TableCell>
                            <span className="font-medium">{item.label || "—"}</span>
                            {item.detail && <span className="text-xs text-muted-foreground ml-2">{item.detail}</span>}
                          </TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{item.section}</Badge></TableCell>
                          <TableCell className="tabular-nums">{item.qty || "—"}</TableCell>
                          <TableCell className="text-xs">{locLabel(item.location)}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{item.container || "—"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── HAMMERS ──────────────────────────────────────────────────── */}
        <TabsContent value="hammers">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold">Hammer Sets, Shanks &amp; Flanges</CardTitle>
              <Button size="sm" onClick={() => openAdd("hammers")} data-testid="button-add-hammer">
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Set
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {inventory.hammers.length === 0 ? (
                <EmptyState text="No hammer sets yet." />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Make / Model</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Felt</TableHead>
                        <TableHead>Total (B/T)</TableHead>
                        <TableHead>Bore B/T</TableHead>
                        <TableHead>Shank In/Len</TableHead>
                        <TableHead>Ratio</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead className="w-16"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inventory.hammers.map(h => (
                        <TableRow key={h.id} className="text-sm">
                          <TableCell className="font-medium">
                            <div>{h.make}</div>
                            {h.model && <div className="text-xs text-muted-foreground">{h.model}</div>}
                          </TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{h.setType || "—"}</Badge></TableCell>
                          <TableCell className="text-xs">{h.feltColor || "—"}</TableCell>
                          <TableCell className="tabular-nums text-xs">
                            {h.totalNotes || "—"}
                            {(h.bassCount || h.trebleCount) && (
                              <span className="text-muted-foreground"> ({h.bassCount || "?"}/{h.trebleCount || "?"})</span>
                            )}
                          </TableCell>
                          <TableCell className="tabular-nums text-xs">
                            {h.bassBore || h.trebleBore ? `${h.bassBore || "—"} / ${h.trebleBore || "—"}` : "—"}
                          </TableCell>
                          <TableCell className="tabular-nums text-xs">
                            {h.shankInput || h.shankLength ? `${h.shankInput || "—"} / ${h.shankLength || "—"}` : "—"}
                          </TableCell>
                          <TableCell className="tabular-nums text-xs">{ratioOf(h.hammerOutput, h.shankInput)}</TableCell>
                          <TableCell><LocBadge loc={h.location} container={h.container} /></TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate" title={h.notes}>
                            {h.notes || "—"}
                          </TableCell>
                          <TableCell>
                            <RowActions
                              onEdit={() => openEdit("hammers", h)}
                              onDelete={() => deleteItem("hammers", h.id)}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── WHIPPENS ─────────────────────────────────────────────────── */}
        <TabsContent value="whippens">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">Whippens, Flanges &amp; Underlevers</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Ratio = center→jack ÷ capstan→center.
                </p>
              </div>
              <Button size="sm" onClick={() => openAdd("whippens")} data-testid="button-add-whippen">
                <Plus className="h-3.5 w-3.5 mr-1" /> Add
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {inventory.whippens.length === 0 ? (
                <EmptyState text="No whippens recorded yet." />
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Model</TableHead>
                        <TableHead>Kind</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Capstan→Center</TableHead>
                        <TableHead>Center→Jack</TableHead>
                        <TableHead>Ratio</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead className="w-16"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inventory.whippens.map(w => (
                        <TableRow key={w.id} className="text-sm">
                          <TableCell className="font-medium">{w.model || "—"}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{w.kind}</Badge></TableCell>
                          <TableCell>
                            <QtyStepper value={w.quantity} onChange={v => patchField("whippens", w.id, "quantity", v)} />
                          </TableCell>
                          <TableCell className="tabular-nums text-xs">{w.inputMm ? `${w.inputMm} mm` : "—"}</TableCell>
                          <TableCell className="tabular-nums text-xs">{w.outputMm ? `${w.outputMm} mm` : "—"}</TableCell>
                          <TableCell className="tabular-nums text-xs">{ratioOf(w.outputMm, w.inputMm)}</TableCell>
                          <TableCell><LocBadge loc={w.location} container={w.container} /></TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[140px] truncate" title={w.notes}>
                            {w.notes || "—"}
                          </TableCell>
                          <TableCell>
                            <RowActions
                              onEdit={() => openEdit("whippens", w)}
                              onDelete={() => deleteItem("whippens", w.id)}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── WIRE & PINS ──────────────────────────────────────────────── */}
        <TabsContent value="wirepins">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            {/* String wire */}
            <Card className="xl:col-span-2">
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold">String Wire</CardTitle>
                <Button size="sm" onClick={() => openAdd("wire")} data-testid="button-add-wire">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Wire
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {inventory.wire.length === 0 ? (
                  <EmptyState text="No wire recorded yet." />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Size</TableHead>
                          <TableHead>Form</TableHead>
                          <TableHead>Qty</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead>Notes</TableHead>
                          <TableHead className="w-16"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {inventory.wire.map(w => (
                          <TableRow key={w.id} className={`text-sm ${w.quantity === "0" ? "opacity-60" : ""}`}>
                            <TableCell className="font-medium tabular-nums">#{w.size}</TableCell>
                            <TableCell className="text-xs">{w.form}</TableCell>
                            <TableCell>
                              <QtyStepper value={w.quantity} onChange={v => patchField("wire", w.id, "quantity", v)} />
                            </TableCell>
                            <TableCell><LocBadge loc={w.location} container={w.container} /></TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate" title={w.notes}>
                              {w.notes || "—"}
                            </TableCell>
                            <TableCell>
                              <RowActions
                                onEdit={() => openEdit("wire", w)}
                                onDelete={() => deleteItem("wire", w.id)}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Tuning pins */}
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold">Tuning Pins</CardTitle>
                <Button size="sm" onClick={() => openAdd("tuningPins")} data-testid="button-add-tuning-pin">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {inventory.tuningPins.length === 0 ? (
                  <EmptyState text="No tuning pins recorded yet." />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Size</TableHead>
                        <TableHead>Length</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead className="w-16"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inventory.tuningPins.map(p => (
                        <TableRow key={p.id} className="text-sm">
                          <TableCell className="font-medium tabular-nums">{p.size}</TableCell>
                          <TableCell className="tabular-nums text-xs">{p.length}</TableCell>
                          <TableCell>
                            <QtyStepper value={p.quantity} onChange={v => patchField("tuningPins", p.id, "quantity", v)} />
                          </TableCell>
                          <TableCell><LocBadge loc={p.location} container={p.container} /></TableCell>
                          <TableCell>
                            <RowActions
                              onEdit={() => openEdit("tuningPins", p)}
                              onDelete={() => deleteItem("tuningPins", p.id)}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>

            {/* Center pins */}
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold">Center Pins</CardTitle>
                <Button size="sm" onClick={() => openAdd("centerPins")} data-testid="button-add-center-pin">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {inventory.centerPins.length === 0 ? (
                  <EmptyState text="No center pins recorded yet." />
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Size</TableHead>
                        <TableHead>In Kit</TableHead>
                        <TableHead>Extra</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead className="w-16"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inventory.centerPins.map(p => (
                        <TableRow key={p.id} className="text-sm">
                          <TableCell className="font-medium tabular-nums">{p.size}</TableCell>
                          <TableCell>
                            <QtyStepper value={p.inKitQty} onChange={v => patchField("centerPins", p.id, "inKitQty", v)} />
                          </TableCell>
                          <TableCell>
                            <QtyStepper value={p.extraQty} onChange={v => patchField("centerPins", p.id, "extraQty", v)} />
                          </TableCell>
                          <TableCell><LocBadge loc={p.location} container={p.container} /></TableCell>
                          <TableCell>
                            <RowActions
                              onEdit={() => openEdit("centerPins", p)}
                              onDelete={() => deleteItem("centerPins", p.id)}
                            />
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── FELTS & SUPPLIES ─────────────────────────────────────────── */}
        <TabsContent value="supplies">
          <div className="space-y-4">
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-sm font-semibold">Felts, Cloth, Leather &amp; Capstans</CardTitle>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Punchings, nameboard felt, bushing cloth, Ecsaine, damper felts, capstans.
                  </p>
                </div>
                <Button size="sm" onClick={() => openAdd("supplies")} data-testid="button-add-supply">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Supply
                </Button>
              </CardHeader>
              <CardContent className={inventory.supplies.length === 0 ? "p-0" : "space-y-4"}>
                {inventory.supplies.length === 0 ? (
                  <EmptyState text="No supplies recorded yet." />
                ) : (
                  suppliesByCategory.map(g => (
                    <div key={g.category}>
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">
                        {g.category}
                      </p>
                      <div className="overflow-x-auto rounded-md border">
                        <Table>
                          <TableBody>
                            {g.items.map(s => (
                              <TableRow key={s.id} className="text-sm">
                                <TableCell className="font-medium">
                                  {s.name}
                                  {s.variant && <Badge variant="outline" className="ml-2 text-xs">{s.variant}</Badge>}
                                </TableCell>
                                <TableCell className="w-36">
                                  <div className="flex items-center gap-1">
                                    <QtyStepper value={s.quantity} onChange={v => patchField("supplies", s.id, "quantity", v)} />
                                    {s.quantity && /^\d+$/.test(s.quantity.trim()) && (
                                      <span className="text-xs text-muted-foreground">{s.unit}</span>
                                    )}
                                  </div>
                                </TableCell>
                                <TableCell className="w-36"><LocBadge loc={s.location} container={s.container} /></TableCell>
                                <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate" title={s.notes}>
                                  {s.notes || "—"}
                                </TableCell>
                                <TableCell className="w-16">
                                  <RowActions
                                    onEdit={() => openEdit("supplies", s)}
                                    onDelete={() => deleteItem("supplies", s.id)}
                                  />
                                </TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {/* Other parts */}
            <Card>
              <CardHeader className="pb-3 flex flex-row items-center justify-between">
                <CardTitle className="text-sm font-semibold">Other Parts &amp; Misc</CardTitle>
                <Button size="sm" onClick={() => openAdd("otherParts")} data-testid="button-add-other-part">
                  <Plus className="h-3.5 w-3.5 mr-1" /> Add Part
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                {inventory.otherParts.length === 0 ? (
                  <EmptyState text="No misc parts recorded yet." />
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Part Name</TableHead>
                          <TableHead>Category</TableHead>
                          <TableHead>Part #</TableHead>
                          <TableHead>Qty</TableHead>
                          <TableHead>Location</TableHead>
                          <TableHead>Notes</TableHead>
                          <TableHead className="w-16"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {inventory.otherParts.map(p => (
                          <TableRow key={p.id} className="text-sm">
                            <TableCell className="font-medium">{p.name}</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{p.category || "—"}</Badge></TableCell>
                            <TableCell className="font-mono text-xs">{p.partNumber || "—"}</TableCell>
                            <TableCell className="tabular-nums">{p.quantity} <span className="text-xs text-muted-foreground">{p.unit}</span></TableCell>
                            <TableCell><LocBadge loc={p.location ?? ""} container={p.container ?? ""} /></TableCell>
                            <TableCell className="text-xs text-muted-foreground max-w-[160px] truncate" title={p.notes}>
                              {p.notes || "—"}
                            </TableCell>
                            <TableCell>
                              <RowActions
                                onEdit={() => openEdit("otherParts", p)}
                                onDelete={() => deleteItem("otherParts", p.id)}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* ── ACTION GEOMETRY CALCULATOR ───────────────────────────────── */}
        <TabsContent value="calculator">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <Calculator className="h-4 w-4" />
                  Action Geometry Inputs
                </CardTitle>
                <p className="text-xs text-muted-foreground">
                  Enter measurements in mm. Results update automatically.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Hammer Travel</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Blow Distance (mm)</Label>
                      <Input className="h-8 text-sm tabular-nums" value={geo.blowDistance}
                        onChange={e => setGeoField("blowDistance", e.target.value)} placeholder="48" />
                    </div>
                    <div>
                      <Label className="text-xs">Key Dip / Travel (mm)</Label>
                      <Input className="h-8 text-sm tabular-nums" value={geo.keyTravel}
                        onChange={e => setGeoField("keyTravel", e.target.value)} placeholder="10" />
                    </div>
                    <div>
                      <Label className="text-xs">Let-Off Distance (mm)</Label>
                      <Input className="h-8 text-sm tabular-nums" value={geo.letOff}
                        onChange={e => setGeoField("letOff", e.target.value)} placeholder="2" />
                    </div>
                    <div>
                      <Label className="text-xs">Drop (mm)</Label>
                      <Input className="h-8 text-sm tabular-nums" value={geo.drop}
                        onChange={e => setGeoField("drop", e.target.value)} placeholder="1" />
                    </div>
                    <div>
                      <Label className="text-xs">After-Touch (mm)</Label>
                      <Input className="h-8 text-sm tabular-nums" value={geo.afterTouch}
                        onChange={e => setGeoField("afterTouch", e.target.value)} placeholder="1" />
                    </div>
                  </div>
                </div>
                <Separator />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Key / Lever</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Total Key Length (mm)</Label>
                      <Input className="h-8 text-sm tabular-nums" value={geo.keyLength}
                        onChange={e => setGeoField("keyLength", e.target.value)} placeholder="490" />
                    </div>
                    <div>
                      <Label className="text-xs">Balance Rail Pos. from Front (mm)</Label>
                      <Input className="h-8 text-sm tabular-nums" value={geo.balanceRailPos}
                        onChange={e => setGeoField("balanceRailPos", e.target.value)} placeholder="160" />
                    </div>
                  </div>
                </div>
                <Separator />
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">Whippen / Action</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <Label className="text-xs">Whippen Length (mm)</Label>
                      <Input className="h-8 text-sm tabular-nums" value={geo.wippen_length}
                        onChange={e => setGeoField("wippen_length", e.target.value)} placeholder="85" />
                    </div>
                    <div>
                      <Label className="text-xs">Jack Length (mm)</Label>
                      <Input className="h-8 text-sm tabular-nums" value={geo.jackLength}
                        onChange={e => setGeoField("jackLength", e.target.value)} placeholder="32" />
                    </div>
                    <div>
                      <Label className="text-xs">Knuckle Radius (mm)</Label>
                      <Input className="h-8 text-sm tabular-nums" value={geo.knuckleRadius}
                        onChange={e => setGeoField("knuckleRadius", e.target.value)} placeholder="6.5" />
                    </div>
                    <div>
                      <Label className="text-xs">Capstan Height (mm)</Label>
                      <Input className="h-8 text-sm tabular-nums" value={geo.capstanHeight}
                        onChange={e => setGeoField("capstanHeight", e.target.value)} placeholder="18" />
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-semibold">Results</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <ResultRow
                  label="Blow Ratio (Strike Ratio)"
                  value={geoResults.blowRatio !== null ? geoResults.blowRatio.toFixed(2) : "—"}
                  unit="× key travel"
                  description="Hammer travel ÷ key dip. Standard grand: ~4.5–5.0"
                  highlight={geoResults.blowRatio !== null}
                />
                <ResultRow
                  label="Key Leverage Ratio"
                  value={geoResults.leverRatio !== null ? geoResults.leverRatio.toFixed(2) : "—"}
                  unit="× (back/front)"
                  description="Capstan side ÷ player side of key (from balance rail)"
                />
                <ResultRow
                  label="Est. Jack Travel"
                  value={geoResults.jackTravel !== null ? `${geoResults.jackTravel.toFixed(1)} mm` : "—"}
                  description="Approximate jack displacement during keystroke"
                />
                <ResultRow
                  label="Let-Off %"
                  value={geoResults.letOffPercent !== null ? `${geoResults.letOffPercent.toFixed(1)}%` : "—"}
                  unit="of blow distance"
                  description="Let-off distance as % of total blow. Typical: 3–5%"
                />
                <Separator />
                <div className="rounded-md border p-3">
                  <p className="text-xs font-semibold mb-1">Action Efficiency Assessment</p>
                  <p className="text-sm">{geoResults.efficiency}</p>
                </div>

                <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground space-y-1 mt-2">
                  <p className="font-semibold">Reference values (grand piano):</p>
                  <p>Blow ratio: 4.5–5.0 | Key dip (treble): 9–10mm</p>
                  <p>Let-off: 1.5–2.5mm from string | After-touch: ~1mm</p>
                  <p>Drop: 0.5–1.5mm below let-off point</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>

      {/* Shared dialog */}
      {dialog && (
        <GenericDialog
          title={DIALOG_CONFIGS[dialog.key].title}
          fields={DIALOG_CONFIGS[dialog.key].fields}
          entry={dialog.entry}
          onSave={e => saveItem(dialog.key, e)}
          onClose={() => setDialog(null)}
        />
      )}
    </div>
  );
}

function ResultRow({
  label,
  value,
  unit,
  description,
  highlight,
}: {
  label: string;
  value: string;
  unit?: string;
  description?: string;
  highlight?: boolean;
}) {
  return (
    <div className={`flex items-start justify-between gap-2 py-2 border-b last:border-0 ${highlight ? "" : ""}`}>
      <div className="flex-1">
        <p className="text-xs font-medium">{label}</p>
        {description && <p className="text-xs text-muted-foreground">{description}</p>}
      </div>
      <div className="text-right shrink-0">
        <span className="font-mono text-sm font-semibold tabular-nums">{value}</span>
        {unit && <span className="text-xs text-muted-foreground ml-1">{unit}</span>}
      </div>
    </div>
  );
}
