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
import { Plus, Pencil, Trash2, Search, Settings, ClipboardList, EyeOff, Eye, Music } from "lucide-react";
import type { ServiceCatalogItem } from "@shared/schema";

interface CatalogForm {
  name: string;
  category: string;
  defaultCost: string;
  defaultDuration: string;
  isTuning: boolean;
  description: string;
  isActive: boolean;
  sortOrder: number;
}

const emptyForm = (): CatalogForm => ({
  name: "",
  category: "",
  defaultCost: "",
  defaultDuration: "",
  isTuning: false,
  description: "",
  isActive: true,
  sortOrder: 0,
});

function CatalogDialog({
  open,
  onOpenChange,
  item,
  onSave,
  isSaving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: ServiceCatalogItem | null;
  onSave: (data: CatalogForm) => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<CatalogForm>(
    item
      ? {
          name: item.name,
          category: item.category || "",
          defaultCost: item.defaultCost || "",
          defaultDuration: item.defaultDuration || "",
          isTuning: item.isTuning ?? false,
          description: item.description || "",
          isActive: item.isActive ?? true,
          sortOrder: item.sortOrder ?? 0,
        }
      : emptyForm()
  );

  function handleOpen(v: boolean) {
    if (v) {
      setForm(
        item
          ? {
              name: item.name,
              category: item.category || "",
              defaultCost: item.defaultCost || "",
              defaultDuration: item.defaultDuration || "",
              isTuning: item.isTuning ?? false,
              description: item.description || "",
              isActive: item.isActive ?? true,
              sortOrder: item.sortOrder ?? 0,
            }
          : emptyForm()
      );
    }
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" data-testid="dialog-service-catalog">
        <DialogHeader>
          <DialogTitle>{item ? "Edit Service" : "Add Service"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="svc-name">Name</Label>
            <Input
              id="svc-name"
              value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Service name"
              data-testid="input-service-name"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="svc-category">Category</Label>
            <Input
              id="svc-category"
              value={form.category}
              onChange={e => setForm(f => ({ ...f, category: e.target.value }))}
              placeholder="e.g. Tuning, Repair, Cleaning"
              data-testid="input-service-category"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="svc-cost">Default Cost</Label>
              <Input
                id="svc-cost"
                value={form.defaultCost}
                onChange={e => setForm(f => ({ ...f, defaultCost: e.target.value }))}
                placeholder="e.g. $120.00"
                data-testid="input-service-cost"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="svc-duration">Default Duration</Label>
              <Input
                id="svc-duration"
                value={form.defaultDuration}
                onChange={e => setForm(f => ({ ...f, defaultDuration: e.target.value }))}
                placeholder="e.g. 1.5 hours"
                data-testid="input-service-duration"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="svc-desc">Description</Label>
            <Textarea
              id="svc-desc"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              placeholder="Describe what this service includes..."
              rows={3}
              data-testid="input-service-description"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="svc-sort">Sort Order</Label>
            <Input
              id="svc-sort"
              type="number"
              value={form.sortOrder}
              onChange={e => setForm(f => ({ ...f, sortOrder: parseInt(e.target.value) || 0 }))}
              data-testid="input-service-sort"
            />
          </div>

          <div className="space-y-2 pt-1">
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

            <label className="flex items-center gap-3 cursor-pointer">
              <Checkbox
                checked={form.isActive}
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
    mutationFn: (data: CatalogForm) => apiRequest("POST", "/api/service-catalog", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-catalog"] });
      setDialogOpen(false);
      toast({ title: "Service added" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: CatalogForm }) =>
      apiRequest("PATCH", `/api/service-catalog/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-catalog"] });
      setDialogOpen(false);
      toast({ title: "Service updated" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: number) => apiRequest("DELETE", `/api/service-catalog/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-catalog"] });
      setDeleteId(null);
      toast({ title: "Service deleted" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  function handleSave(data: CatalogForm) {
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
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight flex items-center gap-2" data-testid="text-settings-title">
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
            <ClipboardList className="h-4 w-4" /> Service Catalog
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            Services available in the appointment completion workflow
          </p>
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
                      {item.isTuning && (
                        <Badge className="bg-teal-600 text-white hover:bg-teal-600 text-[10px] px-1.5 py-0 gap-0.5">
                          <Music className="h-2.5 w-2.5" /> TUNING
                        </Badge>
                      )}
                      {item.isActive === false && (
                        <Badge variant="outline" className="text-muted-foreground text-[10px] px-1.5 py-0">
                          INACTIVE
                        </Badge>
                      )}
                      {item.category && (
                        <span className="text-xs text-muted-foreground">{item.category}</span>
                      )}
                    </div>
                    <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                      {item.defaultCost && <span data-testid={`service-cost-${item.id}`}>{item.defaultCost}</span>}
                      {item.defaultDuration && <span data-testid={`service-duration-${item.id}`}>{item.defaultDuration}</span>}
                    </div>
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

      <CatalogDialog
        open={dialogOpen}
        onOpenChange={v => { setDialogOpen(v); if (!v) setEditItem(null); }}
        item={editItem}
        onSave={handleSave}
        isSaving={isSaving}
      />

      <AlertDialog open={deleteId !== null} onOpenChange={v => { if (!v) setDeleteId(null); }}>
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
              onClick={() => deleteId !== null && deleteMutation.mutate(deleteId)}
              disabled={deleteMutation.isPending}
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
