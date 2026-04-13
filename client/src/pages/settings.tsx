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
  ChevronUp, ChevronDown, FolderPlus, Minus, GripVertical, CreditCard,
} from "lucide-react";
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
import type { ServiceCatalogItem, ServiceGroup, UserSettings } from "@shared/schema";

function parseDurationHours(s: string): number {
  if (!s) return 1.0;
  const numMatch = s.match(/(\d+(?:\.\d+)?)/);
  if (!numMatch) return 1.0;
  const val = parseFloat(numMatch[1]);
  const isMin = /min/i.test(s);
  const hours = isMin ? val / 60 : val;
  return Math.max(0.5, Math.round(hours * 2) / 2);
}

function formatDurationHours(h: number): string {
  return `${h.toFixed(1)} hr`;
}

interface CatalogForm {
  name: string;
  category: string;
  defaultCost: string;
  defaultDuration: string;
  durationHours: number;
  isTuning: boolean;
  isDefault: boolean;
  description: string;
  sortOrder: number;
}

const emptyCatalogForm = (category = "", sortOrder = 0): CatalogForm => ({
  name: "",
  category,
  defaultCost: "",
  defaultDuration: "1.0 hr",
  durationHours: 1.0,
  isTuning: false,
  isDefault: false,
  description: "",
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
      return {
        name: item.name,
        category: item.category || groupName || "__uncategorized__",
        defaultCost: item.defaultCost || "",
        defaultDuration: formatDurationHours(hours),
        durationHours: hours,
        isTuning: item.isTuning ?? false,
        isDefault: item.isDefault ?? false,
        description: item.description || "",
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

  function adjustDuration(delta: number) {
    setForm(f => {
      const next = Math.max(0.5, Math.round((f.durationHours + delta) * 2) / 2);
      return { ...f, durationHours: next, defaultDuration: formatDurationHours(next) };
    });
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
              data-testid="input-service-name"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="svc-group">Group</Label>
            <Select
              value={form.category}
              onValueChange={v => setForm(f => ({ ...f, category: v }))}
            >
              <SelectTrigger id="svc-group" data-testid="select-service-group">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {groups.map(g => (
                  <SelectItem key={g.id} value={g.name}>{g.name}</SelectItem>
                ))}
                <SelectItem value="__uncategorized__">Uncategorized</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="svc-cost">Default Cost</Label>
              <Input
                id="svc-cost"
                value={form.defaultCost}
                onChange={e => setForm(f => ({ ...f, defaultCost: e.target.value }))}
                data-testid="input-service-cost"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Default Duration</Label>
              <div className="flex items-center gap-1" data-testid="input-service-duration">
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => adjustDuration(-0.5)}
                  disabled={form.durationHours <= 0.5}
                  data-testid="button-duration-minus"
                >
                  <Minus className="h-3.5 w-3.5" />
                </Button>
                <div className="flex-1 h-9 flex items-center justify-center border rounded-md text-sm font-medium bg-background">
                  {formatDurationHours(form.durationHours)}
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  className="h-9 w-9 shrink-0"
                  onClick={() => adjustDuration(0.5)}
                  data-testid="button-duration-plus"
                >
                  <Plus className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="svc-desc">Description</Label>
            <Textarea
              id="svc-desc"
              value={form.description}
              onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
              rows={3}
              data-testid="input-service-description"
            />
          </div>

          <label className="flex items-center gap-3 cursor-pointer pt-1">
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
              checked={form.isDefault}
              onCheckedChange={v => setForm(f => ({ ...f, isDefault: !!v }))}
              data-testid="checkbox-is-default"
            />
            <span className="text-sm">Mark as default service</span>
            {form.isDefault && (
              <Badge className="bg-primary text-primary-foreground hover:bg-primary text-[10px]">DEFAULT</Badge>
            )}
          </label>
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

  type CatalogPayload = Omit<CatalogForm, "isDefault" | "durationHours">;

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
    const { isDefault, durationHours: _dh, ...rest } = data;
    if (rest.category === "__uncategorized__") rest.category = "";
    if (editItem) {
      updateItemMutation.mutate({ id: editItem.id, data: rest }, {
        onSuccess: () => {
          setServiceDialogOpen(false);
          setEditItem(null);
          if (isDefault) setDefaultMutation.mutate(editItem.id);
        },
      });
    } else {
      createItemMutation.mutate(rest, {
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
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <CreditCard className="h-4 w-4" /> Payment Methods
          </CardTitle>
          <p className="text-sm text-muted-foreground">
            These appear on printed invoices so customers know how to pay you
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pay-zelle" className="text-sm">Zelle (phone or email)</Label>
              <Input
                id="pay-zelle"
                placeholder="e.g. 555-555-5555"
                value={payForm.zelleHandle}
                onChange={e => setPayForm(f => ({ ...f, zelleHandle: e.target.value }))}
                data-testid="input-zelle-handle"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-venmo" className="text-sm">Venmo handle</Label>
              <Input
                id="pay-venmo"
                placeholder="e.g. @JohnWillis"
                value={payForm.venmoHandle}
                onChange={e => setPayForm(f => ({ ...f, venmoHandle: e.target.value }))}
                data-testid="input-venmo-handle"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-cashapp" className="text-sm">Cash App $cashtag</Label>
              <Input
                id="pay-cashapp"
                placeholder="e.g. $JohnWillis"
                value={payForm.cashAppHandle}
                onChange={e => setPayForm(f => ({ ...f, cashAppHandle: e.target.value }))}
                data-testid="input-cashapp-handle"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pay-paypal" className="text-sm">PayPal.me link</Label>
              <Input
                id="pay-paypal"
                placeholder="e.g. paypal.me/johnwillis"
                value={payForm.paypalMe}
                onChange={e => setPayForm(f => ({ ...f, paypalMe: e.target.value }))}
                data-testid="input-paypal-me"
              />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="pay-stripe" className="text-sm">Stripe payment link (credit/debit card)</Label>
              <Input
                id="pay-stripe"
                placeholder="e.g. https://buy.stripe.com/…"
                value={payForm.stripePaymentLink}
                onChange={e => setPayForm(f => ({ ...f, stripePaymentLink: e.target.value }))}
                data-testid="input-stripe-link"
              />
              <p className="text-xs text-muted-foreground">
                Create a payment link in your Stripe dashboard (Dashboard → Payment Links → + New) and paste the URL here.
              </p>
            </div>
          </div>
          <div className="flex justify-end">
            <Button
              size="sm"
              onClick={() => savePaymentMutation.mutate(payForm)}
              disabled={savePaymentMutation.isPending}
              data-testid="button-save-payment-methods"
            >
              {savePaymentMutation.isPending ? "Saving…" : "Save Payment Methods"}
            </Button>
          </div>
        </CardContent>
      </Card>

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
              size="sm"
              variant="outline"
              className="h-9 gap-1.5 text-xs"
              onClick={() => { setEditGroup(null); setGroupDialogOpen(true); }}
              data-testid="button-add-group"
            >
              <FolderPlus className="h-3.5 w-3.5" /> Add Service Group
            </Button>
          </div>

          {isLoading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-24 w-full rounded-md" />
              ))}
            </div>
          ) : (
            <div className="space-y-3">
              {sortedGroups.map((group, groupIdx) => {
                const groupItems = getGroupItems(group.name);
                const allGroupItems = catalog.filter(i => i.category === group.name);
                const isFirst = groupIdx === 0;
                const isLast = groupIdx === sortedGroups.length - 1;

                return (
                  <div
                    key={group.id}
                    className="rounded-md border overflow-hidden"
                    data-testid={`group-${group.id}`}
                  >
                    <div className="flex items-center gap-2 px-3 py-2 bg-muted/40 border-b">
                      <div className="flex flex-col -space-y-1">
                        <button
                          className="p-0.5 rounded hover:bg-accent disabled:opacity-30"
                          disabled={isFirst || updateGroupMutation.isPending}
                          onClick={() => moveGroup(group, "up")}
                          data-testid={`button-group-up-${group.id}`}
                        >
                          <ChevronUp className="h-3 w-3" />
                        </button>
                        <button
                          className="p-0.5 rounded hover:bg-accent disabled:opacity-30"
                          disabled={isLast || updateGroupMutation.isPending}
                          onClick={() => moveGroup(group, "down")}
                          data-testid={`button-group-down-${group.id}`}
                        >
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </div>
                      <span className="font-semibold text-sm flex-1" data-testid={`group-name-${group.id}`}>
                        {group.name}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {allGroupItems.length} {allGroupItems.length === 1 ? "item" : "items"}
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => { setEditGroup(group); setGroupDialogOpen(true); }}
                        data-testid={`button-rename-group-${group.id}`}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
                        onClick={() => setDeleteGroupId(group.id)}
                        data-testid={`button-delete-group-${group.id}`}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </div>

                    {groupItems.length === 0 && !search && (
                      <p className="text-xs text-muted-foreground text-center py-3">
                        No services yet
                      </p>
                    )}
                    {search && groupItems.length === 0 ? null : groupItems.length > 0 && (
                      <DndContext
                        sensors={sensors}
                        collisionDetection={closestCenter}
                        onDragEnd={(e) => handleItemDragEnd(e, groupItems)}
                      >
                        <SortableContext
                          items={groupItems.map(i => i.id)}
                          strategy={verticalListSortingStrategy}
                        >
                          <div className="divide-y">
                            {groupItems.map((item) => (
                              <SortableItemRow
                                key={item.id}
                                item={item}
                                onEdit={openEditItem}
                                onDelete={setDeleteItemId}
                                dragDisabled={!!search}
                              />
                            ))}
                          </div>
                        </SortableContext>
                      </DndContext>
                    )}

                    <div className="px-3 py-2 border-t bg-muted/20">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground w-full justify-start"
                        onClick={() => openAddItem(group.name, allGroupItems)}
                        data-testid={`button-add-item-${group.id}`}
                      >
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
                            {item.isTuning && (
                              <Badge className="bg-teal-600 text-white hover:bg-teal-600 text-[10px] px-1.5 py-0 gap-0.5">
                                <Music className="h-2.5 w-2.5" /> TUNING
                              </Badge>
                            )}
                          </div>
                          <div className="flex gap-3 text-xs text-muted-foreground mt-0.5">
                            {item.defaultCost && <span>{item.defaultCost}</span>}
                            {item.defaultDuration && <span>{item.defaultDuration}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7"
                            onClick={() => openEditItem(item)}
                            data-testid={`button-edit-service-${item.id}`}
                          >
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-destructive hover:text-destructive hover:bg-destructive/10"
                            onClick={() => setDeleteItemId(item.id)}
                            data-testid={`button-delete-service-${item.id}`}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {groups.length === 0 && catalog.length === 0 && !isLoading && (
                <p className="text-sm text-muted-foreground text-center py-8">
                  No service groups yet. Click "Add Service Group" to get started.
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

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
