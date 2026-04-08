import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check } from "lucide-react";
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

  function toggle(svc: ServiceCatalogItem) {
    if (!catalog) return;
    const isSelected = value.includes(svc.name);
    const newNames = isSelected
      ? value.filter((n) => n !== svc.name)
      : [...value, svc.name];
    const { isTuning, totalCost } = computeFromNames(newNames, catalog);
    onChange(newNames, isTuning, totalCost);
  }

  if (!catalog || !groups) {
    return <div className="text-xs text-muted-foreground py-1">Loading services…</div>;
  }

  const active = catalog.filter((s) => s.isActive !== false);

  const sections: { label: string; items: ServiceCatalogItem[] }[] = [];

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

  if (sections.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No services configured. Add services in Settings.
      </p>
    );
  }

  return (
    <div className="space-y-2.5">
      {sections.map(({ label, items }) => (
        <div key={label}>
          <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1.5">
            {label}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {items.map((svc) => {
              const isSelected = value.includes(svc.name);
              return (
                <button
                  key={svc.id}
                  type="button"
                  onClick={() => toggle(svc)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                    isSelected
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-background text-foreground border-border hover:bg-muted"
                  }`}
                  data-testid={`service-chip-${svc.id}`}
                >
                  {isSelected && <Check className="h-3 w-3 shrink-0" />}
                  <span>{svc.name}</span>
                  {svc.defaultCost && (
                    <span className={isSelected ? "opacity-70" : "text-muted-foreground"}>
                      {svc.defaultCost}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
