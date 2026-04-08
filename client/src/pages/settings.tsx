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
import {
  Plus, Pencil, Trash2, Search, Settings, ClipboardList, Music,
  ChevronUp, ChevronDown, FolderPlus,
} from "lucide-react";
import type { ServiceCatalogItem, ServiceGroup } from "@shared/schema";

interface CatalogForm {
  name: string;
  category: string;
  defaultCost: string;
  defaultDuration: string;
  isTuning: boolean;
  description: string;
  sortOrder: number;
}

const emptyCatalogForm = (category = "", sortOrder = 0): CatalogForm => ({
  name: "",
  category,
  defaultCost: "",
  defaultDuration: "",
  isTuning: false,
  description: "",
  sortOrder,
});

function ServiceDialog({
  open,
  onOpenChange,
  item,
  groupName,
  onSave,
  isSaving,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  item: ServiceCatalogItem | null;
  groupName: string;
  onSave: (data: CatalogForm) => void;
  isSaving: boolean;
}) {
  const [form, setForm] = useState<CatalogForm>(
    item
      ? {
          name: item.name,
          category: item.category || groupName,
          defaultCost: item.defaultCost || "",
          defaultDuration: item.defaultDuration || "",
          isTuning: item.isTuning ?? false,
          description: item.description || "",
          sortOrder: item.sortOrder ?? 0,
        }
      : emptyCatalogForm(groupName)
  );

  function handleOpen(v: boolean) {
    if (v) {
      setForm(
        item
          ? {
              name: item.name,
              category: item.category || groupName,
              defaultCost: item.defaultCost || "",
              defaultDuration: item.defaultDuration || "",
              isTuning: item.isTuning ?? false,
              description: item.description || "",
              sortOrder: item.sortOrder ?? 0,
            }
          : emptyCatalogForm(groupName)
      );
    }
    onOpenChange(v);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto" data-testid="dialog-service-catalog">
        <DialogHeader>
          <DialogTitle>{item ? "Edit Service" : "Add Service"}</DialogTitle>
          {groupName && (
            <p className="text-xs text-muted-foreground">Group: <span className="font-medium">{groupName}</span></p>
          )}
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
              placeholder="Describe what this service includes…"
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
            placeholder="e.g. Field Service"
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

export default function SettingsPage() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [editItem, setEditItem] = useState<ServiceCatalogItem | null>(null);
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [activeGroupName, setActiveGroupName] = useState("");
  const [editGroup, setEditGroup] = useState<ServiceGroup | null>(null);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [deleteItemId, setDeleteItemId] = useState<number | null>(null);
  const [deleteGroupId, setDeleteGroupId] = useState<number | null>(null);

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
      setGroupDialogOpen(false);
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

  const createItemMutation = useMutation({
    mutationFn: (data: CatalogForm) => apiRequest("POST", "/api/service-catalog", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-catalog"] });
      setServiceDialogOpen(false);
      toast({ title: "Service added" });
    },
    onError: (e: Error) => toast({ title: "Error", description: e.message, variant: "destructive" }),
  });

  const updateItemMutation = useMutation({
    mutationFn: ({ id, data }: { id: number; data: Partial<CatalogForm> }) =>
      apiRequest("PATCH", `/api/service-catalog/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/service-catalog"] });
      setServiceDialogOpen(false);
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

  function handleSaveService(data: CatalogForm) {
    if (editItem) {
      updateItemMutation.mutate({ id: editItem.id, data });
    } else {
      createItemMutation.mutate(data);
    }
  }

  function handleSaveGroup(name: string) {
    if (editGroup) {
      updateGroupMutation.mutate({ id: editGroup.id, data: { name } });
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

  function moveItem(item: ServiceCatalogItem, groupItems: ServiceCatalogItem[], direction: "up" | "down") {
    const sorted = [...groupItems].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    const idx = sorted.findIndex(i => i.id === item.id);
    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= sorted.length) return;
    const other = sorted[swapIdx];
    updateItemMutation.mutate({ id: item.id, data: { sortOrder: other.sortOrder ?? 0 } });
    updateItemMutation.mutate({ id: other.id, data: { sortOrder: item.sortOrder ?? 0 } });
  }

  function openAddItem(groupName: string, groupItems: ServiceCatalogItem[]) {
    setEditItem(null);
    setActiveGroupName(groupName);
    const nextOrder = groupItems.length > 0 ? Math.max(...groupItems.map(i => i.sortOrder ?? 0)) + 1 : 0;
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

  const isSavingItem = createItemMutation.isPending || updateItemMutation.isPending;
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
                    {search && groupItems.length === 0 ? null : (
                      <div className="divide-y">
                        {groupItems.map((item, itemIdx) => {
                          const isFirstItem = itemIdx === 0;
                          const isLastItem = itemIdx === groupItems.length - 1;
                          return (
                            <div
                              key={item.id}
                              className="flex items-center gap-2 px-3 py-2"
                              data-testid={`service-row-${item.id}`}
                            >
                              <div className="flex flex-col -space-y-1">
                                <button
                                  className="p-0.5 rounded hover:bg-accent disabled:opacity-30"
                                  disabled={isFirstItem || updateItemMutation.isPending}
                                  onClick={() => moveItem(item, groupItems, "up")}
                                  data-testid={`button-item-up-${item.id}`}
                                >
                                  <ChevronUp className="h-3 w-3" />
                                </button>
                                <button
                                  className="p-0.5 rounded hover:bg-accent disabled:opacity-30"
                                  disabled={isLastItem || updateItemMutation.isPending}
                                  onClick={() => moveItem(item, groupItems, "down")}
                                  data-testid={`button-item-down-${item.id}`}
                                >
                                  <ChevronDown className="h-3 w-3" />
                                </button>
                              </div>
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
                          );
                        })}
                      </div>
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
        open={serviceDialogOpen}
        onOpenChange={v => { setServiceDialogOpen(v); if (!v) setEditItem(null); }}
        item={editItem}
        groupName={activeGroupName}
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
