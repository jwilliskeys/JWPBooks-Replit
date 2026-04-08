import { useState } from "react";
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
import { Plus, Pencil, Trash2, Search, Settings, ClipboardList, EyeOff, Eye } from "lucide-react";
import type { ServiceCatalogItem, InsertServiceCatalogItem } from "@shared/schema";

function formatDuration(minutes: number | null | undefined): string {
  if (!minutes) return "";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} minute${m !== 1 ? "s" : ""}`;
  if (m === 0) return `${h} hour${h !== 1 ? "s" : ""}`;
  return `${h} hour${h !== 1 ? "s" : ""}, ${m} minute${m !== 1 ? "s" : ""}`;
}

function formatPrice(item: ServiceCatalogItem): string {
  if (item.serviceType === "hourly") {
    const rate = parseFloat(item.hourlyRate ?? "0");
    const hrs = (item.durationMinutes ?? 60) / 60;
    return `${hrs % 1 === 0 ? hrs : hrs.toFixed(1)} ${hrs === 1 ? "hour" : "hours"} at $${parseFloat(item.hourlyRate ?? "0").toFixed(2)}/hr`;
  }
  const price = parseFloat(item.unitPrice ?? "0");
  const durationStr = item.durationMinutes ? ` — ${formatDuration(item.durationMinutes)}` : "";
  return `1 unit at $${price.toFixed(2)} each${durationStr}`;
}

const defaultForm: Partial<InsertServiceCatalogItem> = {
  name: "",
  description: "",
  serviceType: "fixed",
  unitPrice: "",
  hourlyRate: "",
  durationMinutes: 60,
  isTuning: false,
  isDefault: false,
  isTaxable: false,
  isActive: true,
  sortOrder: 0,
};

function ServiceCatalogDialog({
  open,
  onOpenChange,
  item,
  onSave,
  isSaving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: ServiceCatalogItem | null;
  onSave: (data: Partial<InsertServiceCatalogItem>) => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<Partial<InsertServiceCatalogItem>>(
    item ? { ...item } : { ...defaultForm }
  );

  function reset(base: Partial<InsertServiceCatalogItem>) {
    setForm(base);
  }

  function handleOpen(v: boolean) {
    if (v) reset(item ? { ...item } : { ...defaultForm });
    onOpenChange(v);
  }

  const durationH = Math.floor((form.durationMinutes ?? 60) / 60);
  const durationM = (form.durationMinutes ?? 60) % 60;

  function setDuration(h: number, m: number) {
    const total = Math.max(0, h * 60 + m);
    setForm(f => ({ ...f, durationMinutes: total }));
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" data-testid="dialog-service-catalog">
        <DialogHeader>
          <DialogTitle>{item ? item.name : "Add Service"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="svc-name">Name</Label>
            <Input
              id="svc-name"
              value={form.name ?? ""}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Service name"
              data-testid="input-service-name"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="svc-desc">Description</Label>
            <Textarea
              id="svc-desc"
              value={form.description ?? ""}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Describe what this service includes..."
              rows={3}
              data-testid="input-service-description"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Type</Label>
              <Select
                value={form.serviceType ?? "fixed"}
                onValueChange={v => setForm(f => ({ ...f, serviceType: v }))}
              >
                <SelectTrigger data-testid="select-service-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fixed">Fixed Price</SelectItem>
                  <SelectItem value="hourly">Hourly Labor</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>
                {form.serviceType === "hourly" ? "Hourly rate" : "Unit price"}
              </Label>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground text-sm font-medium">$</span>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.serviceType === "hourly" ? (form.hourlyRate ?? "") : (form.unitPrice ?? "")}
                  onChange={e => {
                    const val = e.target.value;
                    if (form.serviceType === "hourly") {
                      setForm(f => ({ ...f, hourlyRate: val }));
                    } else {
                      setForm(f => ({ ...f, unitPrice: val }));
                    }
                  }}
                  placeholder="0.00"
                  data-testid="input-service-price"
                />
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>Duration</Label>
            <div className="flex items-center gap-2">
              <div className="flex flex-col gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={() => setDuration(durationH + 1, durationM)}
                  data-testid="button-duration-plus-hour"
                >
                  +1h
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={() => setDuration(Math.max(0, durationH - 1), durationM)}
                  data-testid="button-duration-minus-hour"
                >
                  -1h
                </Button>
              </div>
              <div className="flex-1 text-center font-semibold text-lg">
                {durationH > 0 && `${durationH}h`}
                {durationM > 0 && ` ${durationM}m`}
                {durationH === 0 && durationM === 0 && "0m"}
              </div>
              <div className="flex flex-col gap-1">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={() => setDuration(durationH, durationM + 5)}
                  data-testid="button-duration-plus-5m"
                >
                  +5m
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-6 text-xs px-2"
                  onClick={() => setDuration(durationH, Math.max(0, durationM - 5))}
                  data-testid="button-duration-minus-5m"
                >
                  -5m
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-1">
            <label className="flex items-center gap-3 cursor-pointer">
              <Checkbox
                checked={form.isDefault ?? false}
                onCheckedChange={v => setForm(f => ({ ...f, isDefault: !!v }))}
                data-testid="checkbox-is-default"
              />
              <span className="text-sm">Select this service by default</span>
              {form.isDefault && (
                <Badge variant="outline" className="text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-600 text-[10px]">DEFAULT</Badge>
              )}
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <Checkbox
                checked={form.isTuning ?? false}
                onCheckedChange={v => setForm(f => ({ ...f, isTuning: !!v }))}
                data-testid="checkbox-is-tuning"
              />
              <span className="text-sm">This item is a tuning</span>
              {form.isTuning && (
                <Badge className="bg-teal-600 text-white hover:bg-teal-600 text-[10px]">TUNING</Badge>
              )}
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <Checkbox
                checked={form.isTaxable ?? false}
                onCheckedChange={v => setForm(f => ({ ...f, isTaxable: !!v }))}
                data-testid="checkbox-is-taxable"
              />
              <span className="text-sm">This item is taxable</span>
            </label>

            <label className="flex items-center gap-3 cursor-pointer">
              <Checkbox
                checked={form.isActive !== false}
                onCheckedChange={v => setForm(f => ({ ...f, isActive: !!v }))}
                data-testid="checkbox-is-active"
              />
              <span className="text-sm">Active (visible in service picker)</span>
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} data-testid="button-service-cancel">
            Cancel
          </Button>
          <Button
            onClick={() => onSave(form)}
            disabled={isSaving || !form.name?.trim()}
            data-testid="button-service-save"
          >
            {isSaving ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function SettingsPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [showInactive, setShowInactive] = useState(false);
  const [editItem, setEditItem] = useState<ServiceCatalogItem | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);

  const { data: catalog, isLoading } = useQuery<ServiceCatalogItem[]>({
    queryKey: ["/api/service-catalog"],
  });

  const createMutation = useMutation({
    mutationFn: (data: Partial<InsertServiceCatalogItem>) =>
      apiRequest("POST", "/api/service-catalog", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-catalog"] });
      setDialogOpen(false);
      toast({ title: "Service added" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<InsertServiceCatalogItem> }) =>
      apiRequest("PATCH", `/api/service-catalog/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-catalog"] });
      setDialogOpen(false);
      toast({ title: "Service updated" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/service-catalog/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-catalog"] });
      setDeleteId(null);
      toast({ title: "Service deleted" });
    },
    onError: (e: any) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function handleSave(data: Partial<InsertServiceCatalogItem>) {
    if (editItem) {
      updateMutation.mutate({ id: editItem.id, data });
    } else {
      createMutation.mutate(data);
    }
  }

  const filtered = (catalog ?? []).filter(item => {
    const matchesSearch = !search || item.name.toLowerCase().includes(search.toLowerCase());
    const matchesActive = showInactive || item.isActive !== false;
    return matchesSearch && matchesActive;
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="p-4 sm:p-6 space-y-4 sm:space-y-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2">
            <Settings className="h-6 w-6" /> Settings
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Configure your service catalog and preferences
          </p>
        </div>
      </div>

      <Card>
        <CardHeader className="pb-4">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <ClipboardList className="h-4 w-4" /> Master Service List
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative flex-1 min-w-48">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
              <Input
                className="pl-8 h-9 text-sm"
                placeholder="Search services…"
                value={search}
                onChange={e => setSearch(e.target.value)}
                data-testid="input-search-services"
              />
            </div>
            <Button
              variant="outline"
              size="sm"
              className="h-9 gap-1.5 text-xs"
              onClick={() => setShowInactive(v => !v)}
              data-testid="button-toggle-inactive"
            >
              {showInactive ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
              {showInactive ? "Hide Inactive" : "Show Inactive"}
            </Button>
            <Button
              size="sm"
              className="h-9 gap-1.5 text-xs"
              onClick={() => { setEditItem(null); setDialogOpen(true); }}
              data-testid="button-add-service"
            >
              <Plus className="h-3.5 w-3.5" /> Add Service
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-md" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">
              {search ? "No services match your search." : "No services yet. Add your first service."}
            </p>
          ) : (
            <div className="divide-y rounded-md border">
              {filtered.map(item => (
                <div
                  key={item.id}
                  className={`flex items-center gap-3 px-4 py-3 ${item.isActive === false ? "opacity-50" : ""}`}
                  data-testid={`service-row-${item.id}`}
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-teal-600/10 text-teal-700 dark:text-teal-400">
                    <ClipboardList className="h-4 w-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span className="font-medium text-sm" data-testid={`service-name-${item.id}`}>{item.name}</span>
                      {item.isDefault && (
                        <Badge variant="outline" className="text-amber-600 border-amber-300 dark:text-amber-400 dark:border-amber-600 text-[10px] px-1.5 py-0">
                          DEFAULT
                        </Badge>
                      )}
                      {item.isTuning && (
                        <Badge className="bg-teal-600 text-white hover:bg-teal-600 text-[10px] px-1.5 py-0">
                          TUNING
                        </Badge>
                      )}
                      {item.isActive === false && (
                        <Badge variant="outline" className="text-muted-foreground text-[10px] px-1.5 py-0">
                          INACTIVE
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5" data-testid={`service-price-${item.id}`}>
                      {formatPrice(item)}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7"
                      onClick={() => { setEditItem(item); setDialogOpen(true); }}
                      data-testid={`button-edit-service-${item.id}`}
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                      onClick={() => setDeleteId(item.id)}
                      data-testid={`button-delete-service-${item.id}`}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <ServiceCatalogDialog
        open={dialogOpen}
        onOpenChange={v => { setDialogOpen(v); if (!v) setEditItem(null); }}
        item={editItem}
        onSave={handleSave}
        isSaving={isSaving}
      />

      <AlertDialog open={deleteId !== null} onOpenChange={v => !v && setDeleteId(null)}>
        <AlertDialogContent data-testid="dialog-delete-service">
          <AlertDialogHeader>
            <AlertDialogTitle>Delete service?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove the service from your catalog. It won't affect existing service records.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel data-testid="button-delete-cancel">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId !== null && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              data-testid="button-delete-confirm"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
