import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Check, Trash2, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ServiceCatalogItem, ServiceGroup } from "@shared/schema";
import {
  EXPENSE_TYPES,
  type ExpenseType,
  type ServiceLine,
  lineFromCatalog,
  lineTotal,
  newLineId,
  formatMoney,
  formatLineSubline,
  formatLineDuration,
} from "@/lib/service-lines";

// ─── Edit Service dialog (Gazelle-style) ─────────────────────────────────────

interface EditServiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  line: ServiceLine | null;
  onSave: (line: ServiceLine) => void;
}

export function EditServiceDialog({ open, onOpenChange, line, onSave }: EditServiceDialogProps) {
  const [name, setName] = useState("");
  const [expenseType, setExpenseType] = useState<ExpenseType>("Fixed Rate Labor");
  const [quantity, setQuantity] = useState("1");
  const [eachAmount, setEachAmount] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(90);
  const [isTuning, setIsTuning] = useState(false);
  const [isTaxable, setIsTaxable] = useState(false);

  useEffect(() => {
    if (open && line) {
      setName(line.name);
      setExpenseType(line.expenseType);
      setQuantity(String(line.quantity));
      setEachAmount(line.eachAmount ? line.eachAmount.toFixed(2) : "");
      setDurationMinutes(line.durationMinutes || 0);
      setIsTuning(line.isTuning);
      setIsTaxable(line.isTaxable);
    }
  }, [open, line]);

  const isHourly = expenseType === "Hourly Labor";

  function handleOk() {
    if (!line) return;
    onSave({
      ...line,
      name: name.trim() || "Service",
      expenseType,
      quantity: parseFloat(quantity) || 1,
      eachAmount: parseFloat(eachAmount.replace(/[^0-9.]/g, "")) || 0,
      durationMinutes,
      isTuning,
      isTaxable,
    });
    onOpenChange(false);
  }

  const stepBtn = "h-5 px-1.5 text-[10px] font-semibold rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors leading-none";
  const durH = Math.floor(durationMinutes / 60);
  const durM = durationMinutes % 60;
  const durLabel = durH > 0 ? (durM > 0 ? `${durH}h ${durM}m` : `${durH}h`) : `${durM}m`;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-5 pt-4 pb-3 border-b">
          <DialogTitle className="text-lg font-bold">Edit Service</DialogTitle>
        </DialogHeader>

        <div className="p-5 grid grid-cols-2 gap-x-5 gap-y-4">
          {/* Name (spans left col) */}
          <div className="space-y-1.5">
            <Label className="text-sm">Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-sm font-medium"
              data-testid="input-edit-service-name"
            />
          </div>

          {/* Type of expense */}
          <div className="space-y-1.5">
            <Label className="text-sm">Type of expense</Label>
            <Select value={expenseType} onValueChange={(v) => setExpenseType(v as ExpenseType)}>
              <SelectTrigger className="text-sm" data-testid="select-expense-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {EXPENSE_TYPES.map((t) => (
                  <SelectItem key={t} value={t} className="py-2.5 sm:py-1.5">{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Quantity + Each amount */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-sm">{isHourly ? "Hours" : "Quantity"}</Label>
              <Input
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                inputMode="decimal"
                className="text-sm tabular-nums"
                data-testid="input-edit-service-quantity"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-sm">{isHourly ? "Hourly rate" : "Each amount"}</Label>
              <div className="flex items-center rounded-md border bg-background focus-within:ring-1 focus-within:ring-ring">
                <span className="pl-3 text-sm text-muted-foreground">$</span>
                <Input
                  value={eachAmount}
                  onChange={(e) => setEachAmount(e.target.value)}
                  inputMode="decimal"
                  className="text-sm tabular-nums text-right border-0 focus-visible:ring-0"
                  placeholder="0.00"
                  data-testid="input-edit-service-amount"
                />
              </div>
            </div>
          </div>

          {/* Checkboxes */}
          <div className="space-y-2.5 pt-1">
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <Checkbox
                checked={isTuning}
                onCheckedChange={(v) => setIsTuning(!!v)}
                data-testid="checkbox-edit-service-tuning"
              />
              This item is a tuning
            </label>
            <label className="flex items-center gap-2 text-sm cursor-pointer select-none">
              <Checkbox
                checked={isTaxable}
                onCheckedChange={(v) => setIsTaxable(!!v)}
                data-testid="checkbox-edit-service-taxable"
              />
              This item is taxable
            </label>
          </div>

          {/* Duration stepper */}
          <div className="space-y-1.5 col-span-2 sm:col-span-1">
            <Label className="text-sm">Duration</Label>
            <div className="flex items-center gap-1">
              <div className="flex flex-col gap-0.5">
                <button type="button" className={stepBtn} onClick={() => setDurationMinutes((d) => Math.min(d + 60, 12 * 60))}>+1h</button>
                <button type="button" className={stepBtn} onClick={() => setDurationMinutes((d) => Math.max(d - 60, 0))}>-1h</button>
              </div>
              <span
                className="flex-1 text-sm font-semibold px-3 py-2 rounded border bg-background text-left tabular-nums"
                data-testid="text-edit-service-duration"
              >
                {durLabel}
              </span>
              <div className="flex flex-col gap-0.5">
                <button type="button" className={stepBtn} onClick={() => setDurationMinutes((d) => Math.min(d + 5, 12 * 60))}>+5m</button>
                <button type="button" className={stepBtn} onClick={() => setDurationMinutes((d) => Math.max(d - 5, 0))}>-5m</button>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">Adds to the appointment's total length.</p>
          </div>

          {/* Line total */}
          <div className="col-span-2 flex items-center justify-end text-sm text-muted-foreground">
            Line total:&nbsp;
            <span className="font-semibold text-foreground tabular-nums">
              {formatMoney((parseFloat(quantity) || 0) * (parseFloat(eachAmount.replace(/[^0-9.]/g, "")) || 0))}
            </span>
          </div>
        </div>

        <div className="border-t bg-muted/30 px-5 py-3 flex items-center justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button size="sm" onClick={handleOk} data-testid="button-edit-service-ok">OK</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Service line list + Add Service picker ──────────────────────────────────

interface ServiceLineEditorProps {
  lines: ServiceLine[];
  onChange: (lines: ServiceLine[]) => void;
  /** Auto-add the catalog's default service (usually Tuning) when empty */
  autoAddDefault?: boolean;
}

export function ServiceLineEditor({ lines, onChange, autoAddDefault = false }: ServiceLineEditorProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [editingLine, setEditingLine] = useState<ServiceLine | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const { data: catalog } = useQuery<ServiceCatalogItem[]>({ queryKey: ["/api/service-catalog"] });
  const { data: groups } = useQuery<ServiceGroup[]>({ queryKey: ["/api/service-groups"] });

  // Auto-add default service (tuning) when a fresh piano section mounts
  useEffect(() => {
    if (!autoAddDefault || !catalog || lines.length > 0) return;
    const defaultSvc = catalog.find((s) => s.isDefault && s.isActive !== false);
    if (defaultSvc) onChange([lineFromCatalog(defaultSvc)]);
  }, [catalog]); // eslint-disable-line react-hooks/exhaustive-deps

  function addFromCatalog(svc: ServiceCatalogItem) {
    onChange([...lines, lineFromCatalog(svc)]);
    setPickerOpen(false);
  }

  function addCustom() {
    const blank: ServiceLine = {
      lineId: newLineId(),
      name: "",
      expenseType: "Fixed Rate Labor",
      quantity: 1,
      eachAmount: 0,
      durationMinutes: 30,
      isTuning: false,
      isTaxable: false,
    };
    setPickerOpen(false);
    setEditingLine(blank);
    setEditOpen(true);
  }

  function removeLine(lineId: string) {
    onChange(lines.filter((l) => l.lineId !== lineId));
  }

  function saveLine(saved: ServiceLine) {
    const exists = lines.some((l) => l.lineId === saved.lineId);
    onChange(exists ? lines.map((l) => (l.lineId === saved.lineId ? saved : l)) : [...lines, saved]);
  }

  const active = catalog?.filter((s) => s.isActive !== false) ?? [];
  const sections: { label: string; items: ServiceCatalogItem[] }[] = [];
  if (groups) {
    groups
      .slice()
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .forEach((g) => {
        const items = active
          .filter((s) => s.category === g.name)
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
        if (items.length > 0) sections.push({ label: g.name, items });
      });
    const ungrouped = active
      .filter((s) => !s.category || !groups.find((g) => g.name === s.category))
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    if (ungrouped.length > 0) sections.push({ label: "Other", items: ungrouped });
  }

  if (!catalog) {
    return <div className="text-xs text-muted-foreground py-1">Loading services…</div>;
  }

  return (
    <div className="space-y-1.5">
      {lines.map((line) => (
        <div
          key={line.lineId}
          className="flex items-start justify-between gap-2 px-3 py-2 rounded-md bg-muted/50 border"
          data-testid={`service-line-${line.lineId}`}
        >
          <div className="min-w-0">
            <p className="text-sm font-medium leading-tight truncate">{line.name}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{formatLineSubline(line)}</p>
            {line.durationMinutes > 0 && (
              <p className="text-xs text-muted-foreground">{formatLineDuration(line.durationMinutes)}</p>
            )}
          </div>
          <div className="shrink-0 flex flex-col items-end gap-1">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold tabular-nums">{formatMoney(lineTotal(line))}</span>
              <button
                type="button"
                onClick={() => removeLine(line.lineId)}
                className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                title="Remove service"
                data-testid={`button-remove-line-${line.lineId}`}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => { setEditingLine(line); setEditOpen(true); }}
                className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                title="Edit service"
                data-testid={`button-edit-line-${line.lineId}`}
              >
                <Pencil className="h-3.5 w-3.5" />
              </button>
            </div>
            {line.isTuning && (
              <span className="text-[9px] font-bold tracking-wider px-1.5 py-0.5 rounded bg-amber-500/90 text-white uppercase">
                Tuning
              </span>
            )}
          </div>
        </div>
      ))}

      {sections.length === 0 && lines.length === 0 && (
        <p className="text-sm text-muted-foreground">No services configured. Add services in Settings.</p>
      )}

      <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 w-full gap-1.5 text-xs"
            data-testid="button-add-service"
          >
            <Plus className="h-3 w-3" />
            Add Service
          </Button>
        </PopoverTrigger>
        <PopoverContent
          portalled={false}
          className="w-64 p-2 overflow-y-auto overscroll-contain"
          style={{
            maxHeight: "min(16rem, var(--radix-popover-content-available-height))",
            WebkitOverflowScrolling: "touch",
          }}
          align="start"
          collisionPadding={12}
        >
          {sections.map(({ label, items }) => (
            <div key={label} className="mb-1.5 last:mb-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1">
                {label}
              </p>
              {items.map((svc) => {
                const isSelected = lines.some((l) => l.name === svc.name);
                return (
                  <button
                    key={svc.id}
                    type="button"
                    onClick={() => addFromCatalog(svc)}
                    className="flex items-center w-full gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent transition-colors"
                    data-testid={`service-option-${svc.id}`}
                  >
                    <span className="h-3.5 w-3.5 shrink-0 flex items-center justify-center">
                      {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                    </span>
                    <span className="flex-1 text-left">{svc.name}</span>
                    {svc.defaultCost && (
                      <span className="text-xs text-muted-foreground shrink-0">{svc.defaultCost}</span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
          <div className="border-t mt-1.5 pt-1.5">
            <button
              type="button"
              onClick={addCustom}
              className="flex items-center w-full gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent transition-colors text-muted-foreground"
              data-testid="button-add-custom-service"
            >
              <Plus className="h-3.5 w-3.5 shrink-0" />
              Custom service…
            </button>
          </div>
        </PopoverContent>
      </Popover>

      <EditServiceDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        line={editingLine}
        onSave={saveLine}
      />
    </div>
  );
}
