import { useState, useEffect } from "react";
import { Pencil } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { parseDurationToMinutes } from "@/lib/scheduling";
import type { ServiceCatalogItem } from "@shared/schema";

// ─── constants ───────────────────────────────────────────────────────────────

const MA_SALES_TAX = 0.0625;

// ─── types ───────────────────────────────────────────────────────────────────

export type ServiceType = "fixed" | "hourly" | "part";

export interface ServiceOverride {
  type: ServiceType;
  quantity: number;
  unitPrice: string;
  durationMinutes: number;
  includeTax: boolean;
  isTuning: boolean;
  customName?: string;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function parseCost(s: string | null | undefined): number {
  if (!s) return 0;
  return parseFloat(s.replace(/[^0-9.]/g, "")) || 0;
}

export function computeServiceCost(
  override: ServiceOverride,
  defaultCost?: string | null,
): number {
  const qty = Math.max(override.quantity || 1, 1);
  const price = parseCost(override.unitPrice) || parseCost(defaultCost) || 0;

  if (override.type === "hourly") {
    const hours = (override.durationMinutes || 0) / 60;
    return price * hours;
  }
  if (override.type === "part") {
    const subtotal = qty * price;
    return override.includeTax ? subtotal * (1 + MA_SALES_TAX) : subtotal;
  }
  return qty * price;
}

export function computeServiceDurationMinutes(
  override: ServiceOverride,
  defaultDuration?: string | null,
): number {
  if (override.type === "part") return 0;
  return override.durationMinutes || parseDurationToMinutes(defaultDuration ?? "") || 0;
}

export function defaultOverride(svc?: ServiceCatalogItem | null): ServiceOverride {
  return {
    type: "fixed",
    quantity: 1,
    unitPrice: svc?.defaultCost ? `${parseCost(svc.defaultCost).toFixed(0)}` : "",
    durationMinutes: svc?.defaultDuration ? parseDurationToMinutes(svc.defaultDuration) : 90,
    includeTax: false,
    isTuning: svc?.isTuning ?? false,
  };
}

export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

// ─── DurationPickerDialog ─────────────────────────────────────────────────────

interface DurationPickerDialogProps {
  open: boolean;
  value: number;
  onSave: (minutes: number) => void;
  onCancel: () => void;
}

function DurationPickerDialog({ open, value, onSave, onCancel }: DurationPickerDialogProps) {
  const [activeUnit, setActiveUnit] = useState<"hours" | "minutes">("hours");
  const [hours, setHours] = useState(Math.floor(value / 60));
  const [mins, setMins] = useState(Math.round((value % 60) / 5) * 5);

  useEffect(() => {
    if (open) {
      setHours(Math.floor(value / 60));
      setMins(Math.round((value % 60) / 5) * 5);
      setActiveUnit("hours");
    }
  }, [open, value]);

  function step(delta: number) {
    if (activeUnit === "hours") {
      setHours(h => Math.max(0, Math.min(23, h + delta)));
    } else {
      setMins(m => Math.max(0, Math.min(55, m + delta * 5)));
    }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (!o) onCancel(); }}>
      <DialogContent className="max-w-[300px] p-0 overflow-hidden">
        <div className="px-6 pt-8 pb-6 flex flex-col items-center gap-6">
          <div className="flex items-end gap-4">
            <button
              type="button"
              onClick={() => setActiveUnit("hours")}
              className="flex flex-col items-center gap-1.5 group"
            >
              <span className="text-5xl font-bold tabular-nums leading-none">{hours}h</span>
              <span className={`h-[2px] w-full rounded-full transition-colors ${activeUnit === "hours" ? "bg-primary" : "bg-transparent"}`} />
            </button>
            <button
              type="button"
              onClick={() => setActiveUnit("minutes")}
              className="flex flex-col items-center gap-1.5 group"
            >
              <span className="text-5xl font-bold tabular-nums leading-none">{String(mins).padStart(2, "0")}m</span>
              <span className={`h-[2px] w-full rounded-full transition-colors ${activeUnit === "minutes" ? "bg-primary" : "bg-transparent"}`} />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 w-full">
            <button
              type="button"
              onClick={() => step(-1)}
              className="h-14 rounded-xl bg-primary text-primary-foreground text-3xl font-bold hover:bg-primary/90 active:scale-95 transition-all flex items-center justify-center select-none"
            >
              −
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              className="h-14 rounded-xl bg-primary text-primary-foreground text-3xl font-bold hover:bg-primary/90 active:scale-95 transition-all flex items-center justify-center select-none"
            >
              +
            </button>
          </div>

          <div className="grid grid-cols-2 gap-3 w-full">
            <Button variant="outline" onClick={onCancel} className="w-full">
              Cancel
            </Button>
            <Button onClick={() => onSave(hours * 60 + mins)} className="w-full">
              OK
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── EditServiceDialog ────────────────────────────────────────────────────────

interface EditServiceDialogProps {
  open: boolean;
  name: string;
  override: ServiceOverride;
  catalogItem?: ServiceCatalogItem | null;
  onSave: (override: ServiceOverride) => void;
  onCancel: () => void;
}

export function EditServiceDialog({
  open,
  name,
  override,
  catalogItem,
  onSave,
  onCancel,
}: EditServiceDialogProps) {
  const [local, setLocal] = useState<ServiceOverride>(override);
  const [showDurationPicker, setShowDurationPicker] = useState(false);

  useEffect(() => {
    if (open) {
      setLocal(override);
      setShowDurationPicker(false);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  function patch(p: Partial<ServiceOverride>) {
    setLocal(l => ({ ...l, ...p }));
  }

  const computedCost = computeServiceCost(local, catalogItem?.defaultCost);
  const durationLabel = formatDuration(local.durationMinutes);

  const showQuantity = local.type !== "hourly";
  const showDuration = local.type !== "part";
  const showTax = local.type === "part";
  const showTuning = local.type !== "part";

  const priceLabel =
    local.type === "hourly" ? "Hourly Rate" :
    local.type === "part" ? "Unit Price" :
    "Each Amount";

  const typeLabels: Record<ServiceType, string> = {
    fixed: "Fixed Rate",
    hourly: "Hourly",
    part: "Part",
  };

  return (
    <>
      <Dialog open={open && !showDurationPicker} onOpenChange={o => { if (!o) onCancel(); }}>
        <DialogContent className="max-w-sm p-0 gap-0 overflow-hidden">
          <DialogHeader className="flex-row items-center justify-between px-4 py-3 border-b space-y-0">
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              className="text-muted-foreground h-8 px-2"
            >
              Cancel
            </Button>
            <DialogTitle className="text-base font-semibold">Edit Service</DialogTitle>
            <Button size="sm" onClick={() => onSave(local)} className="h-8 px-3">
              OK
            </Button>
          </DialogHeader>

          <div className="divide-y max-h-[70vh] overflow-y-auto">
            {/* Name */}
            <div className="px-4 py-3">
              <p className="text-xs text-muted-foreground mb-1.5">Name</p>
              <Input
                value={local.customName ?? name}
                onChange={e => patch({ customName: e.target.value })}
                className="h-9 text-sm font-medium"
                placeholder={name}
                data-testid="input-service-name"
              />
            </div>

            {/* Type selector */}
            <div className="px-4 py-3">
              <p className="text-xs text-muted-foreground mb-2">Type of expense</p>
              <div className="grid grid-cols-3 gap-1 p-1 bg-muted rounded-lg">
                {(["fixed", "hourly", "part"] as ServiceType[]).map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => patch({ type: t })}
                    className={`py-1.5 px-1 rounded-md text-xs font-medium transition-all ${
                      local.type === t
                        ? "bg-background shadow-sm text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {typeLabels[t]}
                  </button>
                ))}
              </div>
            </div>

            {/* Quantity */}
            {showQuantity && (
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm">Quantity</span>
                <Input
                  type="number"
                  min="1"
                  value={String(local.quantity)}
                  onChange={e => patch({ quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                  className="h-8 w-20 text-right text-sm"
                />
              </div>
            )}

            {/* Unit price */}
            <div className="flex items-center justify-between px-4 py-3">
              <span className="text-sm">{priceLabel}</span>
              <div className="flex items-center gap-1.5">
                <span className="text-sm text-muted-foreground">$</span>
                <Input
                  value={local.unitPrice.replace(/^\$/, "")}
                  onChange={e => patch({ unitPrice: e.target.value })}
                  placeholder={
                    local.type === "hourly"
                      ? "0"
                      : (parseCost(catalogItem?.defaultCost) || 0).toFixed(0)
                  }
                  className="h-8 w-28 text-right text-sm"
                  inputMode="decimal"
                />
              </div>
            </div>

            {/* Duration */}
            {showDuration && (
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm">Duration</span>
                <button
                  type="button"
                  onClick={() => setShowDurationPicker(true)}
                  className="flex items-center gap-2 text-sm font-semibold text-primary hover:text-primary/80 transition-colors"
                  data-testid="button-edit-duration"
                >
                  {durationLabel}
                  <Pencil className="h-3.5 w-3.5" />
                </button>
              </div>
            )}

            {/* MA Sales Tax */}
            {showTax && (
              <div className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm">MA Sales Tax</p>
                  <p className="text-xs text-muted-foreground">6.25%</p>
                </div>
                <Switch
                  checked={local.includeTax}
                  onCheckedChange={v => patch({ includeTax: v })}
                  data-testid="switch-include-tax"
                />
              </div>
            )}

            {/* Is tuning */}
            {showTuning && (
              <div className="flex items-center justify-between px-4 py-3">
                <span className="text-sm">This item is a tuning</span>
                <Switch
                  checked={local.isTuning}
                  onCheckedChange={v => patch({ isTuning: v })}
                  data-testid="switch-is-tuning"
                />
              </div>
            )}

            {/* Computed total */}
            <div className="flex items-center justify-between px-4 py-3 bg-muted/30">
              <span className="text-sm font-semibold">Total</span>
              <span className="text-sm font-bold">
                {computedCost > 0 ? `$${computedCost.toFixed(2)}` : "—"}
                {showTax && local.includeTax && computedCost > 0 && (
                  <span className="text-xs text-muted-foreground ml-1">(incl. tax)</span>
                )}
              </span>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <DurationPickerDialog
        open={showDurationPicker}
        value={local.durationMinutes}
        onSave={mins => {
          patch({ durationMinutes: mins });
          setShowDurationPicker(false);
        }}
        onCancel={() => setShowDurationPicker(false)}
      />
    </>
  );
}
