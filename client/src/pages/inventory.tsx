import { useState, useCallback } from "react";
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
  Trash2,
  Edit,
  Package,
  Calculator,
  Wrench,
  Save,
  RefreshCw,
} from "lucide-react";

// ── Types ──────────────────────────────────────────────────────────────────

interface HammerEntry {
  id: string;
  make: string;
  model: string;
  type: string; // "Full Set" | "Bass" | "Tenor" | "Treble" | "Bass-Tenor Split"
  bassCount: string;
  trebleCount: string;
  totalNotes: string;
  boreDepthMm: string;
  boreOffsetMm: string;
  taperRatio: string; // e.g. "8:6" or "11:7"
  shoulderSize: string; // small / medium / large / extra-large
  strikeWeight: string; // in grams
  noteRange: string; // e.g. "A0–B4 / C5–C8"
  compatibleBrands: string;
  quantity: string;
  location: string; // shelf/bin location
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
  notes: string;
}

interface RennerPart {
  id: string;
  partNumber: string;
  partName: string;
  // Whippen geometry specs
  jackLength: string; // mm
  jackWidth: string; // mm
  repetitionLeverRatio: string;
  capstanHeight: string; // mm
  knuckleRadius: string; // mm
  jackSpringTension: string;
  wippen_length: string; // mm — overall length
  quantity: string;
  notes: string;
}

interface Inventory {
  hammers: HammerEntry[];
  otherParts: OtherPart[];
  rennerParts: RennerPart[];
}

const emptyInventory: Inventory = { hammers: [], otherParts: [], rennerParts: [] };

function genId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ── Action Geometry Calculator ──────────────────────────────────────────────

interface GeoInputs {
  blowDistance: string;       // mm — hammer travel to string
  keyTravel: string;          // mm — key dip at front
  capstanHeight: string;      // mm — capstan screw height
  jackLength: string;         // mm
  knuckleRadius: string;      // mm — knuckle radius
  wippen_length: string;      // mm — overall whippen length (pivot to tip)
  balanceRailPos: string;     // mm — balance rail from front edge
  keyLength: string;          // mm — total key length
  letOff: string;             // mm — let-off distance from string
  drop: string;               // mm — drop after let-off
  afterTouch: string;         // mm — after-touch (key over-travel)
}

interface GeoResults {
  blowRatio: number | null;          // blow distance / key travel (strike ratio)
  leverRatio: number | null;         // whippen amplification
  jackTravel: number | null;         // mm
  hammerVelocityFactor: number | null; // relative
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
  const drop = parseFloat(inputs.drop);

  const blowRatio = (!isNaN(blow) && !isNaN(keyDip) && keyDip !== 0)
    ? Math.round((blow / keyDip) * 100) / 100 : null;

  // Leverage ratio: distance from balance to capstan / distance from balance to key tip
  const frontSection = bal; // from front to balance
  const backSection = kl - bal; // from balance to back (capstan side)
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

// ── Hammer Dialog ───────────────────────────────────────────────────────────

function HammerDialog({
  open,
  entry,
  onSave,
  onClose,
}: {
  open: boolean;
  entry: HammerEntry | null;
  onSave: (h: HammerEntry) => void;
  onClose: () => void;
}) {
  const blank: HammerEntry = {
    id: genId(), make: "", model: "", type: "Full Set",
    bassCount: "", trebleCount: "", totalNotes: "",
    boreDepthMm: "", boreOffsetMm: "", taperRatio: "",
    shoulderSize: "", strikeWeight: "", noteRange: "",
    compatibleBrands: "", quantity: "1", location: "", notes: "",
  };
  const [form, setForm] = useState<HammerEntry>(entry ?? blank);

  const set = (field: keyof HammerEntry, val: string) =>
    setForm(prev => ({ ...prev, [field]: val }));

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{entry ? "Edit Hammer Entry" : "Add Hammer Set"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <Label className="text-xs">Make</Label>
            <Input value={form.make} onChange={e => set("make", e.target.value)} placeholder="Abel, Renner, Ronsen…" />
          </div>
          <div>
            <Label className="text-xs">Model / Series</Label>
            <Input value={form.model} onChange={e => set("model", e.target.value)} placeholder="e.g. 40B, Presto, Custom" />
          </div>
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={form.type} onValueChange={v => set("type", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["Full Set", "Bass", "Tenor", "Treble", "Bass-Tenor Split", "Treble-Only", "Other"].map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Note Range</Label>
            <Input value={form.noteRange} onChange={e => set("noteRange", e.target.value)} placeholder="A0–B4 / C5–C8" />
          </div>
          <div>
            <Label className="text-xs">Bass Count</Label>
            <Input value={form.bassCount} onChange={e => set("bassCount", e.target.value)} placeholder="e.g. 18" />
          </div>
          <div>
            <Label className="text-xs">Treble Count</Label>
            <Input value={form.trebleCount} onChange={e => set("trebleCount", e.target.value)} placeholder="e.g. 70" />
          </div>
          <div>
            <Label className="text-xs">Total Notes</Label>
            <Input value={form.totalNotes} onChange={e => set("totalNotes", e.target.value)} placeholder="e.g. 88" />
          </div>
          <div>
            <Label className="text-xs">Shoulder Size</Label>
            <Select value={form.shoulderSize} onValueChange={v => set("shoulderSize", v)}>
              <SelectTrigger><SelectValue placeholder="Size…" /></SelectTrigger>
              <SelectContent>
                {["Extra Small", "Small", "Medium", "Large", "Extra Large", "Custom"].map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Bore Depth (mm)</Label>
            <Input value={form.boreDepthMm} onChange={e => set("boreDepthMm", e.target.value)} placeholder="e.g. 5.0" />
          </div>
          <div>
            <Label className="text-xs">Bore Offset (mm)</Label>
            <Input value={form.boreOffsetMm} onChange={e => set("boreOffsetMm", e.target.value)} placeholder="e.g. 1.5" />
          </div>
          <div>
            <Label className="text-xs">Taper Ratio</Label>
            <Input value={form.taperRatio} onChange={e => set("taperRatio", e.target.value)} placeholder="e.g. 8:6 or 11:7" />
          </div>
          <div>
            <Label className="text-xs">Strike Weight (g)</Label>
            <Input value={form.strikeWeight} onChange={e => set("strikeWeight", e.target.value)} placeholder="e.g. 8.5" />
          </div>
          <div>
            <Label className="text-xs">Compatible Brands / Pianos</Label>
            <Input value={form.compatibleBrands} onChange={e => set("compatibleBrands", e.target.value)} placeholder="Steinway, Yamaha, Baldwin…" />
          </div>
          <div>
            <Label className="text-xs">Quantity in Stock</Label>
            <Input value={form.quantity} onChange={e => set("quantity", e.target.value)} placeholder="1" />
          </div>
          <div>
            <Label className="text-xs">Storage Location</Label>
            <Input value={form.location} onChange={e => set("location", e.target.value)} placeholder="Shelf A, Bin 3…" />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Notes</Label>
            <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} placeholder="Any additional details…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(form)}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Other Part Dialog ───────────────────────────────────────────────────────

function OtherPartDialog({
  open,
  entry,
  onSave,
  onClose,
}: {
  open: boolean;
  entry: OtherPart | null;
  onSave: (p: OtherPart) => void;
  onClose: () => void;
}) {
  const blank: OtherPart = {
    id: genId(), name: "", category: "", partNumber: "",
    quantity: "1", unit: "each", location: "", notes: "",
  };
  const [form, setForm] = useState<OtherPart>(entry ?? blank);
  const set = (field: keyof OtherPart, val: string) =>
    setForm(prev => ({ ...prev, [field]: val }));

  const categories = [
    "Strings", "Dampers", "Keys", "Hammers (Other)", "Shanks & Flanges",
    "Whippens", "Key Bushings", "Key Tops / Keytops", "Pedals & Trapwork",
    "Tuning Pins & Pin Block", "Bridge & Soundboard", "Case / Lid",
    "Felts & Cloth", "Springs", "Screws & Hardware", "Tools", "Other",
  ];

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{entry ? "Edit Part" : "Add Part"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="col-span-2">
            <Label className="text-xs">Part Name</Label>
            <Input value={form.name} onChange={e => set("name", e.target.value)} placeholder="e.g. Steinway bass damper felt" />
          </div>
          <div>
            <Label className="text-xs">Category</Label>
            <Select value={form.category} onValueChange={v => set("category", v)}>
              <SelectTrigger><SelectValue placeholder="Category…" /></SelectTrigger>
              <SelectContent>
                {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Part Number / SKU</Label>
            <Input value={form.partNumber} onChange={e => set("partNumber", e.target.value)} placeholder="optional" />
          </div>
          <div>
            <Label className="text-xs">Quantity</Label>
            <Input value={form.quantity} onChange={e => set("quantity", e.target.value)} placeholder="1" />
          </div>
          <div>
            <Label className="text-xs">Unit</Label>
            <Select value={form.unit} onValueChange={v => set("unit", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {["each", "set", "pair", "ft", "m", "yard", "box", "roll", "oz", "lb"].map(u => (
                  <SelectItem key={u} value={u}>{u}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Storage Location</Label>
            <Input value={form.location} onChange={e => set("location", e.target.value)} placeholder="Bin, shelf…" />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Notes</Label>
            <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(form)}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Renner Part Dialog ──────────────────────────────────────────────────────

function RennerPartDialog({
  open,
  entry,
  onSave,
  onClose,
}: {
  open: boolean;
  entry: RennerPart | null;
  onSave: (p: RennerPart) => void;
  onClose: () => void;
}) {
  const blank: RennerPart = {
    id: genId(), partNumber: "", partName: "",
    jackLength: "", jackWidth: "", repetitionLeverRatio: "",
    capstanHeight: "", knuckleRadius: "", jackSpringTension: "",
    wippen_length: "", quantity: "1", notes: "",
  };
  const [form, setForm] = useState<RennerPart>(entry ?? blank);
  const set = (field: keyof RennerPart, val: string) =>
    setForm(prev => ({ ...prev, [field]: val }));

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{entry ? "Edit Renner Part" : "Add Renner Part"}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div>
            <Label className="text-xs">Part Number</Label>
            <Input value={form.partNumber} onChange={e => set("partNumber", e.target.value)} placeholder="e.g. R-2230" />
          </div>
          <div>
            <Label className="text-xs">Part Name</Label>
            <Input value={form.partName} onChange={e => set("partName", e.target.value)} placeholder="e.g. Whippen Grand Type A" />
          </div>
          <div className="col-span-2">
            <Separator className="my-1" />
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Whippen Geometry Specs</p>
          </div>
          <div>
            <Label className="text-xs">Whippen Length (mm)</Label>
            <Input value={form.wippen_length} onChange={e => set("wippen_length", e.target.value)} placeholder="e.g. 85.0" />
          </div>
          <div>
            <Label className="text-xs">Jack Length (mm)</Label>
            <Input value={form.jackLength} onChange={e => set("jackLength", e.target.value)} placeholder="e.g. 32.0" />
          </div>
          <div>
            <Label className="text-xs">Jack Width (mm)</Label>
            <Input value={form.jackWidth} onChange={e => set("jackWidth", e.target.value)} placeholder="e.g. 5.0" />
          </div>
          <div>
            <Label className="text-xs">Knuckle Radius (mm)</Label>
            <Input value={form.knuckleRadius} onChange={e => set("knuckleRadius", e.target.value)} placeholder="e.g. 6.5" />
          </div>
          <div>
            <Label className="text-xs">Capstan Height (mm)</Label>
            <Input value={form.capstanHeight} onChange={e => set("capstanHeight", e.target.value)} placeholder="e.g. 18.0" />
          </div>
          <div>
            <Label className="text-xs">Rep. Lever Ratio</Label>
            <Input value={form.repetitionLeverRatio} onChange={e => set("repetitionLeverRatio", e.target.value)} placeholder="e.g. 1.25" />
          </div>
          <div>
            <Label className="text-xs">Jack Spring Tension</Label>
            <Input value={form.jackSpringTension} onChange={e => set("jackSpringTension", e.target.value)} placeholder="light / medium / heavy" />
          </div>
          <div>
            <Label className="text-xs">Quantity in Stock</Label>
            <Input value={form.quantity} onChange={e => set("quantity", e.target.value)} placeholder="1" />
          </div>
          <div className="col-span-2">
            <Label className="text-xs">Notes</Label>
            <Textarea value={form.notes} onChange={e => set("notes", e.target.value)} rows={2} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button onClick={() => onSave(form)}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function InventoryPage() {
  const { toast } = useToast();

  const { data: inv, isLoading } = useQuery<Inventory>({
    queryKey: ["/api/inventory"],
    select: (d) => d ?? emptyInventory,
  });

  const saveMutation = useMutation({
    mutationFn: (data: Inventory) => apiRequest("PUT", "/api/inventory", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/inventory"] });
      toast({ title: "Inventory saved" });
    },
    onError: () => toast({ title: "Save failed", variant: "destructive" }),
  });

  const inventory = inv ?? emptyInventory;

  // ── Hammer state ─────────────────────────────────────────────────────────
  const [hammerDialog, setHammerDialog] = useState<{ open: boolean; entry: HammerEntry | null }>({ open: false, entry: null });

  const saveHammer = useCallback((h: HammerEntry) => {
    const existing = inventory.hammers.findIndex(x => x.id === h.id);
    const updated = existing >= 0
      ? inventory.hammers.map(x => x.id === h.id ? h : x)
      : [...inventory.hammers, h];
    saveMutation.mutate({ ...inventory, hammers: updated });
    setHammerDialog({ open: false, entry: null });
  }, [inventory, saveMutation]);

  const deleteHammer = useCallback((id: string) => {
    saveMutation.mutate({ ...inventory, hammers: inventory.hammers.filter(h => h.id !== id) });
  }, [inventory, saveMutation]);

  // ── Other parts state ─────────────────────────────────────────────────────
  const [otherDialog, setOtherDialog] = useState<{ open: boolean; entry: OtherPart | null }>({ open: false, entry: null });

  const savePart = useCallback((p: OtherPart) => {
    const existing = inventory.otherParts.findIndex(x => x.id === p.id);
    const updated = existing >= 0
      ? inventory.otherParts.map(x => x.id === p.id ? p : x)
      : [...inventory.otherParts, p];
    saveMutation.mutate({ ...inventory, otherParts: updated });
    setOtherDialog({ open: false, entry: null });
  }, [inventory, saveMutation]);

  const deletePart = useCallback((id: string) => {
    saveMutation.mutate({ ...inventory, otherParts: inventory.otherParts.filter(p => p.id !== id) });
  }, [inventory, saveMutation]);

  // ── Renner parts state ────────────────────────────────────────────────────
  const [rennerDialog, setRennerDialog] = useState<{ open: boolean; entry: RennerPart | null }>({ open: false, entry: null });

  const saveRenner = useCallback((p: RennerPart) => {
    const existing = inventory.rennerParts.findIndex(x => x.id === p.id);
    const updated = existing >= 0
      ? inventory.rennerParts.map(x => x.id === p.id ? p : x)
      : [...inventory.rennerParts, p];
    saveMutation.mutate({ ...inventory, rennerParts: updated });
    setRennerDialog({ open: false, entry: null });
  }, [inventory, saveMutation]);

  const deleteRenner = useCallback((id: string) => {
    saveMutation.mutate({ ...inventory, rennerParts: inventory.rennerParts.filter(p => p.id !== id) });
  }, [inventory, saveMutation]);

  // ── Action Geometry Calculator state ──────────────────────────────────────
  const [geo, setGeo] = useState<GeoInputs>({
    blowDistance: "48",
    keyTravel: "10",
    capstanHeight: "18",
    jackLength: "32",
    knuckleRadius: "6.5",
    wippen_length: "85",
    balanceRailPos: "160",
    keyLength: "490",
    letOff: "2",
    drop: "1",
    afterTouch: "1",
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

  return (
    <div className="p-4 max-w-7xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Package className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold">Parts Inventory</h1>
          <p className="text-sm text-muted-foreground">Hammers, action parts, and Renner kit</p>
        </div>
      </div>

      <Tabs defaultValue="hammers">
        <TabsList className="mb-4">
          <TabsTrigger value="hammers">
            Hammers
            {inventory.hammers.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">{inventory.hammers.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="renner">
            Renner Parts Kit
            {inventory.rennerParts.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">{inventory.rennerParts.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="other">
            Other Parts
            {inventory.otherParts.length > 0 && (
              <Badge variant="secondary" className="ml-2 text-xs">{inventory.otherParts.length}</Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="calculator">
            <Calculator className="h-3.5 w-3.5 mr-1.5" />
            Action Geometry Calculator
          </TabsTrigger>
        </TabsList>

        {/* ── HAMMERS TAB ─────────────────────────────────────────────────── */}
        <TabsContent value="hammers">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold">Hammer Inventory</CardTitle>
              <Button size="sm" onClick={() => setHammerDialog({ open: true, entry: null })}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Hammer Set
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {inventory.hammers.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  <Package className="h-8 w-8 mx-auto mb-3 opacity-40" />
                  <p>No hammer sets yet. Add your first hammer set to get started.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Make / Model</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Bass / Treble</TableHead>
                        <TableHead>Bore (D / Offset)</TableHead>
                        <TableHead>Taper</TableHead>
                        <TableHead>Shoulder</TableHead>
                        <TableHead>Wt (g)</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Location</TableHead>
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
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{h.type}</Badge>
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {h.bassCount && h.trebleCount
                              ? `${h.bassCount} / ${h.trebleCount}`
                              : h.totalNotes || "—"}
                          </TableCell>
                          <TableCell className="tabular-nums text-xs">
                            {h.boreDepthMm ? `${h.boreDepthMm}mm` : "—"}
                            {h.boreOffsetMm ? ` / ${h.boreOffsetMm}mm` : ""}
                          </TableCell>
                          <TableCell className="text-xs">{h.taperRatio || "—"}</TableCell>
                          <TableCell className="text-xs">{h.shoulderSize || "—"}</TableCell>
                          <TableCell className="tabular-nums text-xs">{h.strikeWeight || "—"}</TableCell>
                          <TableCell className="tabular-nums">{h.quantity}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{h.location || "—"}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7"
                                onClick={() => setHammerDialog({ open: true, entry: h })}>
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                                onClick={() => deleteHammer(h.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Notes panel for any extra specs */}
          {inventory.hammers.some(h => h.notes || h.noteRange || h.compatibleBrands) && (
            <div className="mt-4 grid gap-3">
              {inventory.hammers.filter(h => h.notes || h.noteRange || h.compatibleBrands).map(h => (
                <Card key={h.id} className="p-3">
                  <p className="text-xs font-semibold">{h.make} {h.model}</p>
                  {h.noteRange && <p className="text-xs text-muted-foreground">Range: {h.noteRange}</p>}
                  {h.compatibleBrands && <p className="text-xs text-muted-foreground">Compatible: {h.compatibleBrands}</p>}
                  {h.notes && <p className="text-xs mt-1">{h.notes}</p>}
                </Card>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── RENNER PARTS KIT TAB ────────────────────────────────────────── */}
        <TabsContent value="renner">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-sm font-semibold">Renner Parts Kit</CardTitle>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Measure whippen geometry specs from your Renner parts kit and record them here.
                </p>
              </div>
              <Button size="sm" onClick={() => setRennerDialog({ open: true, entry: null })}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Renner Part
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {inventory.rennerParts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  <Wrench className="h-8 w-8 mx-auto mb-3 opacity-40" />
                  <p>No Renner parts recorded yet.</p>
                  <p className="text-xs mt-1">Add parts from your Renner kit with their geometry specs.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Part #</TableHead>
                        <TableHead>Part Name</TableHead>
                        <TableHead>Wippen L (mm)</TableHead>
                        <TableHead>Jack L (mm)</TableHead>
                        <TableHead>Jack W (mm)</TableHead>
                        <TableHead>Knuckle R (mm)</TableHead>
                        <TableHead>Capstan H (mm)</TableHead>
                        <TableHead>Rep. Ratio</TableHead>
                        <TableHead>Spring</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead className="w-16"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inventory.rennerParts.map(p => (
                        <TableRow key={p.id} className="text-sm">
                          <TableCell className="font-mono text-xs">{p.partNumber || "—"}</TableCell>
                          <TableCell className="font-medium">{p.partName}</TableCell>
                          <TableCell className="tabular-nums text-xs">{p.wippen_length || "—"}</TableCell>
                          <TableCell className="tabular-nums text-xs">{p.jackLength || "—"}</TableCell>
                          <TableCell className="tabular-nums text-xs">{p.jackWidth || "—"}</TableCell>
                          <TableCell className="tabular-nums text-xs">{p.knuckleRadius || "—"}</TableCell>
                          <TableCell className="tabular-nums text-xs">{p.capstanHeight || "—"}</TableCell>
                          <TableCell className="tabular-nums text-xs">{p.repetitionLeverRatio || "—"}</TableCell>
                          <TableCell className="text-xs">{p.jackSpringTension || "—"}</TableCell>
                          <TableCell className="tabular-nums">{p.quantity}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7"
                                onClick={() => setRennerDialog({ open: true, entry: p })}>
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                                onClick={() => deleteRenner(p.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
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

        {/* ── OTHER PARTS TAB ─────────────────────────────────────────────── */}
        <TabsContent value="other">
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold">Other Parts & Supplies</CardTitle>
              <Button size="sm" onClick={() => setOtherDialog({ open: true, entry: null })}>
                <Plus className="h-3.5 w-3.5 mr-1" /> Add Part
              </Button>
            </CardHeader>
            <CardContent className="p-0">
              {inventory.otherParts.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  <Package className="h-8 w-8 mx-auto mb-3 opacity-40" />
                  <p>No parts recorded yet.</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Part Name</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Part #</TableHead>
                        <TableHead>Qty</TableHead>
                        <TableHead>Unit</TableHead>
                        <TableHead>Location</TableHead>
                        <TableHead>Notes</TableHead>
                        <TableHead className="w-16"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {inventory.otherParts.map(p => (
                        <TableRow key={p.id} className="text-sm">
                          <TableCell className="font-medium">{p.name}</TableCell>
                          <TableCell>
                            <Badge variant="outline" className="text-xs">{p.category}</Badge>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{p.partNumber || "—"}</TableCell>
                          <TableCell className="tabular-nums">{p.quantity}</TableCell>
                          <TableCell className="text-xs">{p.unit}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">{p.location || "—"}</TableCell>
                          <TableCell className="text-xs text-muted-foreground max-w-[200px] truncate">{p.notes || "—"}</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-7 w-7"
                                onClick={() => setOtherDialog({ open: true, entry: p })}>
                                <Edit className="h-3 w-3" />
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive"
                                onClick={() => deletePart(p.id)}>
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
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

        {/* ── ACTION GEOMETRY CALCULATOR TAB ──────────────────────────────── */}
        <TabsContent value="calculator">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Inputs */}
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

            {/* Results */}
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

      {/* Dialogs */}
      {hammerDialog.open && (
        <HammerDialog
          open={hammerDialog.open}
          entry={hammerDialog.entry}
          onSave={saveHammer}
          onClose={() => setHammerDialog({ open: false, entry: null })}
        />
      )}
      {otherDialog.open && (
        <OtherPartDialog
          open={otherDialog.open}
          entry={otherDialog.entry}
          onSave={savePart}
          onClose={() => setOtherDialog({ open: false, entry: null })}
        />
      )}
      {rennerDialog.open && (
        <RennerPartDialog
          open={rennerDialog.open}
          entry={rennerDialog.entry}
          onSave={saveRenner}
          onClose={() => setRennerDialog({ open: false, entry: null })}
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
