import { useState, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { X, Plus, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { ServiceCatalogItem, ServiceGroup } from "@shared/schema";

interface ServicePickerProps {
  value: string[];
  onChange: (names: string[], isTuning: boolean, totalCost: number) => void;
}

function parseCost(s: string | null | undefined): number {
  if (!s) return 0;
  return parseFloat(s.replace(/[^0-9.]/g, "")) || 0;
}

function computeFromNames(names: string[], catalog: ServiceCatalogItem[]) {
  const isTuning = names.some((n) => !!catalog.find((s) => s.name === n)?.isTuning);
  const totalCost = names.reduce((sum, n) => {
    const s = catalog.find((c) => c.name === n);
    return sum + parseCost(s?.defaultCost);
  }, 0);
  return { isTuning, totalCost };
}

export function ServicePicker({ value, onChange }: ServicePickerProps) {
  const [open, setOpen] = useState(false);

  const { data: catalog } = useQuery<ServiceCatalogItem[]>({
    queryKey: ["/api/service-catalog"],
  });

  const { data: groups } = useQuery<ServiceGroup[]>({
    queryKey: ["/api/service-groups"],
  });

  useEffect(() => {
    if (!catalog || value.length > 0) return;
    const defaultSvc = catalog.find((s) => s.isDefault && s.isActive !== false);
    if (defaultSvc) {
      const { isTuning, totalCost } = computeFromNames([defaultSvc.name], catalog);
      onChange([defaultSvc.name], isTuning, totalCost);
    }
  }, [catalog]); // eslint-disable-line react-hooks/exhaustive-deps

  function remove(name: string) {
    if (!catalog) return;
    const newNames = value.filter((n) => n !== name);
    const { isTuning, totalCost } = computeFromNames(newNames, catalog);
    onChange(newNames, isTuning, totalCost);
  }

  function add(svc: ServiceCatalogItem) {
    if (!catalog || value.includes(svc.name)) return;
    const newNames = [...value, svc.name];
    const { isTuning, totalCost } = computeFromNames(newNames, catalog);
    onChange(newNames, isTuning, totalCost);
    setOpen(false);
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

  if (!catalog || !groups) {
    return <div className="text-xs text-muted-foreground py-1">Loading services…</div>;
  }

  return (
    <div className="space-y-1.5">
      {value.length > 0 && (
        <div className="space-y-1">
          {value.map((name) => {
            const svc = catalog.find((s) => s.name === name);
            return (
              <div
                key={name}
                className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-md bg-muted/50 border"
                data-testid={`selected-service-${name}`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span className="text-sm font-medium truncate">{name}</span>
                  {svc?.defaultCost && (
                    <span className="text-xs text-muted-foreground shrink-0">
                      {svc.defaultCost}
                    </span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => remove(name)}
                  className="p-0.5 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors ml-1 shrink-0"
                  data-testid={`button-remove-service-${name}`}
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {sections.length === 0 && value.length === 0 && (
        <p className="text-sm text-muted-foreground">
          No services configured. Add services in Settings.
        </p>
      )}

      {sections.length > 0 && (
        <Popover open={open} onOpenChange={setOpen}>
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
            className="w-64 p-2 max-h-64 overflow-y-auto"
            align="start"
          >
            {sections.map(({ label, items }) => (
              <div key={label} className="mb-1.5 last:mb-0">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1">
                  {label}
                </p>
                {items.map((svc) => {
                  const isSelected = value.includes(svc.name);
                  return (
                    <button
                      key={svc.id}
                      type="button"
                      onClick={() => (isSelected ? remove(svc.name) : add(svc))}
                      className="flex items-center w-full gap-2 px-2 py-1.5 rounded text-sm hover:bg-accent transition-colors"
                      data-testid={`service-option-${svc.id}`}
                    >
                      <span className="h-3.5 w-3.5 shrink-0 flex items-center justify-center">
                        {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                      </span>
                      <span className="flex-1 text-left">{svc.name}</span>
                      {svc.defaultCost && (
                        <span className="text-xs text-muted-foreground shrink-0">
                          {svc.defaultCost}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            ))}
          </PopoverContent>
        </Popover>
      )}
    </div>
  );
}
