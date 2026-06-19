import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import {
  User,
  Phone,
  Mail,
  MapPin,
  Plus,
  Pencil,
  Trash2,
  ChevronRight,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Separator } from "@/components/ui/separator";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { AddressSearch } from "@/components/address-search";
import type { PlaceAddressResult } from "@/components/address-search";
import { PhoneInput } from "@/components/phone-input";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { formatPhone, cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import type { CustomerContact } from "@shared/schema";

// ─── Patch shape sent to the API ─────────────────────────────────────────────

export type ContactPatch = {
  firstName: string;
  lastName: string;
  role: string | null;
  isPrimary: boolean;
  isBilling: boolean;
  doNotCall: boolean;
  phone: string | null;
  email: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  notes: string | null;
};

const EMPTY_PATCH: ContactPatch = {
  firstName: "",
  lastName: "",
  role: null,
  isPrimary: false,
  isBilling: false,
  doNotCall: false,
  phone: null,
  email: null,
  address: null,
  city: null,
  state: null,
  zipCode: null,
  notes: null,
};

function contactToPatch(c: CustomerContact): ContactPatch {
  return {
    firstName: c.firstName ?? "",
    lastName: c.lastName ?? "",
    role: c.role ?? null,
    isPrimary: !!c.isPrimary,
    isBilling: !!c.isBilling,
    doNotCall: !!c.doNotCall,
    phone: c.phone ?? null,
    email: c.email ?? null,
    address: c.address ?? null,
    city: c.city ?? null,
    state: c.state ?? null,
    zipCode: c.zipCode ?? null,
    notes: c.notes ?? null,
  };
}

function formatLocation(c: CustomerContact) {
  return [c.city, c.state, c.zipCode].filter(Boolean).join(", ");
}

// ─── Main component ──────────────────────────────────────────────────────────

export function ContactManager({
  customerId,
  contacts,
}: {
  customerId: number;
  contacts: CustomerContact[];
}) {
  const { toast } = useToast();
  const [addOpen, setAddOpen] = useState(false);
  const [editTarget, setEditTarget] = useState<CustomerContact | null>(null);

  // Sort defensively in case server didn't.
  const sorted = [...contacts].sort((a, b) => {
    if (!!a.isPrimary !== !!b.isPrimary) return a.isPrimary ? -1 : 1;
    if (!!a.isBilling !== !!b.isBilling) return a.isBilling ? -1 : 1;
    return a.id - b.id;
  });

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["/api/customers", customerId, "contacts"],
    });

  const addMutation = useMutation({
    mutationFn: async (patch: ContactPatch) => {
      const res = await apiRequest(
        "POST",
        `/api/customers/${customerId}/contacts`,
        patch,
      );
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Contact added" });
      setAddOpen(false);
    },
    onError: (e: any) => {
      toast({ title: "Couldn't add contact", description: e?.message, variant: "destructive" });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, patch }: { id: number; patch: ContactPatch }) => {
      const res = await apiRequest("PATCH", `/api/customer-contacts/${id}`, patch);
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Contact updated" });
      setEditTarget(null);
    },
    onError: (e: any) => {
      toast({ title: "Couldn't update", description: e?.message, variant: "destructive" });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      await apiRequest("DELETE", `/api/customer-contacts/${id}`);
    },
    onSuccess: () => {
      invalidate();
      toast({ title: "Contact removed" });
      setEditTarget(null);
    },
    onError: (e: any) => {
      toast({ title: "Couldn't delete", description: e?.message, variant: "destructive" });
    },
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <CardTitle className="text-sm font-semibold">Contacts</CardTitle>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 text-teal-700 border-teal-200 hover:border-teal-400 hover:bg-teal-50 dark:text-teal-400 dark:border-teal-800 dark:hover:bg-teal-950/40"
          onClick={() => setAddOpen(true)}
          data-testid="button-new-contact"
        >
          <Plus className="h-3.5 w-3.5" />
          New Contact
        </Button>
      </CardHeader>
      <CardContent className="space-y-2">
        {sorted.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">No contacts yet.</p>
        ) : (
          sorted.map((contact) => (
            <ContactCard
              key={contact.id}
              contact={contact}
              onEdit={() => setEditTarget(contact)}
            />
          ))
        )}
      </CardContent>

      {/* Add dialog */}
      <ContactDialog
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title="Add contact"
        initial={{ ...EMPTY_PATCH, isPrimary: contacts.length === 0, isBilling: contacts.length === 0 }}
        saving={addMutation.isPending}
        onSave={(patch) => addMutation.mutate(patch)}
      />

      {/* Edit dialog */}
      {editTarget && (
        <ContactDialog
          open={!!editTarget}
          onClose={() => setEditTarget(null)}
          title="Edit contact"
          initial={contactToPatch(editTarget)}
          saving={updateMutation.isPending || deleteMutation.isPending}
          onSave={(patch) => updateMutation.mutate({ id: editTarget.id, patch })}
          onDelete={() => {
            if (
              !confirm(
                `Delete ${editTarget.firstName}${editTarget.lastName ? " " + editTarget.lastName : ""}?`,
              )
            )
              return;
            deleteMutation.mutate(editTarget.id);
          }}
        />
      )}
    </Card>
  );
}

// ─── Contact card ────────────────────────────────────────────────────────────

function ContactCard({
  contact,
  onEdit,
}: {
  contact: CustomerContact;
  onEdit: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const location = formatLocation(contact);
  const initials = `${contact.firstName?.[0] ?? ""}${contact.lastName?.[0] ?? ""}`.toUpperCase() || "?";

  return (
    <div className="rounded-lg border bg-card transition-shadow hover:shadow-sm" data-testid={`contact-card-${contact.id}`}>
      {/* Collapsed row — always visible */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 p-3 text-left"
      >
        {/* Teal circular avatar with initials */}
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-teal-600 text-white text-sm font-semibold">
          {initials}
        </div>

        {/* Name + tags */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="font-semibold leading-tight">
              {contact.firstName}
              {contact.lastName ? ` ${contact.lastName}` : ""}
            </span>
            {contact.isPrimary && <RoleTag variant="primary">Primary</RoleTag>}
            {contact.isBilling && <RoleTag variant="billing">Billing</RoleTag>}
            {contact.doNotCall && <RoleTag variant="warn">Do Not Call</RoleTag>}
            {contact.role && <RoleTag variant="custom">{contact.role}</RoleTag>}
          </div>
          {/* Preview line when collapsed */}
          {!expanded && (
            <div className="mt-0.5 flex flex-wrap gap-x-3 text-xs text-muted-foreground">
              {contact.phone && <span>{formatPhone(contact.phone)}</span>}
              {contact.email && <span className="truncate">{contact.email}</span>}
              {location && !contact.phone && !contact.email && <span>{location}</span>}
            </div>
          )}
        </div>

        {/* Chevron */}
        {expanded ? (
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        )}
      </button>

      {/* Expanded detail */}
      {expanded && (
        <>
          <Separator />
          <div className="space-y-2 p-3 pt-2.5">
            {(contact.address || location) && (
              <DetailRow icon={<MapPin className="h-3.5 w-3.5" />}>
                {contact.address && <span>{contact.address}</span>}
                {location && <span className="text-muted-foreground">{location}</span>}
              </DetailRow>
            )}
            {contact.phone && (
              <DetailRow icon={<Phone className="h-3.5 w-3.5" />}>
                <a
                  href={`tel:${contact.phone.replace(/\D/g, "")}`}
                  className="text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {formatPhone(contact.phone)}
                </a>
              </DetailRow>
            )}
            {contact.email && (
              <DetailRow icon={<Mail className="h-3.5 w-3.5" />}>
                <a
                  href={`mailto:${contact.email}`}
                  className="text-primary hover:underline"
                  onClick={(e) => e.stopPropagation()}
                >
                  {contact.email}
                </a>
              </DetailRow>
            )}
            {contact.notes && (
              <p className="text-xs text-muted-foreground italic">{contact.notes}</p>
            )}

            <div className="flex justify-end pt-1">
              <Button
                variant="outline"
                size="sm"
                className="h-7 gap-1 text-xs"
                onClick={onEdit}
                data-testid={`button-edit-contact-${contact.id}`}
              >
                <Pencil className="h-3 w-3" />
                Edit
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Role tag badge ──────────────────────────────────────────────────────────

function RoleTag({
  children,
  variant,
}: {
  children: React.ReactNode;
  variant: "primary" | "billing" | "warn" | "custom";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
        variant === "primary" &&
          "bg-teal-100 text-teal-800 dark:bg-teal-900/40 dark:text-teal-300",
        variant === "billing" &&
          "bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300",
        variant === "warn" && "bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400",
        variant === "custom" && "bg-muted text-muted-foreground",
      )}
    >
      {children}
    </span>
  );
}

function DetailRow({
  icon,
  children,
}: {
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="mt-0.5 shrink-0 text-muted-foreground">{icon}</span>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  );
}

// ─── Add / Edit dialog ───────────────────────────────────────────────────────

function ContactDialog({
  open,
  onClose,
  title,
  initial,
  saving,
  onSave,
  onDelete,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  initial: ContactPatch;
  saving: boolean;
  onSave: (patch: ContactPatch) => void;
  onDelete?: () => void;
}) {
  const { toast } = useToast();
  // useState init from `initial` — when the parent re-mounts on a different
  // target, the form resets. We don't memo this; the parent unmounts edit dialogs
  // when changing targets.
  const [form, setForm] = useState<ContactPatch>(initial);

  const set = <K extends keyof ContactPatch>(k: K, v: ContactPatch[K]) =>
    setForm((p) => ({ ...p, [k]: v }));

  const setStr = (k: keyof ContactPatch) => (v: string) =>
    set(k, (v.trim() === "" ? null : v) as ContactPatch[typeof k]);

  const setBool = (k: keyof ContactPatch) => (v: boolean) =>
    set(k, v as ContactPatch[typeof k]);

  const handleAddressPick = (result: PlaceAddressResult) => {
    setForm((p) => ({
      ...p,
      address: result.street || p.address,
      city: result.city || p.city,
      state: result.state || p.state,
      zipCode: result.zipCode || p.zipCode,
    }));
  };

  const handleSave = () => {
    if (!form.firstName.trim()) {
      toast({ title: "First name is required", variant: "destructive" });
      return;
    }
    onSave(form);
  };

  const addressDisplay = [form.address, form.city, form.state]
    .filter(Boolean)
    .join(", ");

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Name */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="First name">
              <Input
                value={form.firstName}
                onChange={(e) => set("firstName", e.target.value)}
                placeholder="Jane"
                className="text-base md:text-sm"
                data-testid="input-contact-first-name"
              />
            </Field>
            <Field label="Last name">
              <Input
                value={form.lastName}
                onChange={(e) => set("lastName", e.target.value)}
                placeholder="Smith"
                className="text-base md:text-sm"
                data-testid="input-contact-last-name"
              />
            </Field>
          </div>

          {/* Role */}
          <Field label="Role / title">
            <Input
              value={form.role ?? ""}
              onChange={(e) => setStr("role")(e.target.value)}
              placeholder="e.g. Business Manager, Department Chair…"
              className="text-base md:text-sm"
              data-testid="input-contact-role"
            />
          </Field>

          {/* Phone + Email */}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Phone">
              <PhoneInput
                className="font-mono text-base md:text-sm"
                value={form.phone ?? ""}
                onChange={(v) => setStr("phone")(v)}
                data-testid="input-contact-phone"
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                value={form.email ?? ""}
                onChange={(e) => setStr("email")(e.target.value)}
                placeholder="name@example.com"
                className="text-base md:text-sm"
                data-testid="input-contact-email"
              />
            </Field>
          </div>

          <Separator />

          {/* Address */}
          <div className="space-y-2.5">
            <Field label="Search address">
              <AddressSearch
                key={`addr-search-${initial.firstName}-${initial.lastName}`}
                initialValue={addressDisplay}
                onSelect={handleAddressPick}
                placeholder="e.g. 855 Commonwealth Ave…"
              />
            </Field>
            <div className="grid gap-3 sm:grid-cols-[2fr_auto_auto]">
              <Field label="Street">
                <Input
                  value={form.address ?? ""}
                  onChange={(e) => setStr("address")(e.target.value)}
                  className="text-base md:text-sm"
                />
              </Field>
              <Field label="State" className="w-20">
                <Input
                  value={form.state ?? ""}
                  onChange={(e) => setStr("state")(e.target.value.toUpperCase())}
                  maxLength={2}
                  className="uppercase text-base md:text-sm"
                  placeholder="MA"
                />
              </Field>
              <Field label="ZIP" className="w-24">
                <Input
                  value={form.zipCode ?? ""}
                  onChange={(e) => setStr("zipCode")(e.target.value)}
                  placeholder="02215"
                  className="text-base md:text-sm"
                />
              </Field>
            </div>
            <Field label="City">
              <Input
                value={form.city ?? ""}
                onChange={(e) => setStr("city")(e.target.value)}
                className="text-base md:text-sm"
              />
            </Field>
          </div>

          <Separator />

          {/* Flags */}
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Flags
            </p>
            <CheckFlag
              label="Primary contact"
              description="Main point of contact for this client"
              checked={form.isPrimary}
              onChange={setBool("isPrimary")}
              testId="check-is-primary"
            />
            <CheckFlag
              label="Billing contact"
              description="Receives invoices and payment requests"
              checked={form.isBilling}
              onChange={setBool("isBilling")}
              testId="check-is-billing"
            />
            <CheckFlag
              label="Do not call"
              description="Flag on this contact's card"
              checked={form.doNotCall}
              onChange={setBool("doNotCall")}
              testId="check-do-not-call"
            />
          </div>

          {/* Notes */}
          <Field label="Notes">
            <Textarea
              rows={2}
              value={form.notes ?? ""}
              onChange={(e) => setStr("notes")(e.target.value)}
              placeholder="Anything worth noting about this contact…"
              className="text-base md:text-sm"
            />
          </Field>
        </div>

        <DialogFooter className="flex items-center justify-between gap-2 sm:justify-between">
          <div>
            {onDelete && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={onDelete}
                disabled={saving}
                data-testid="button-delete-contact"
              >
                <Trash2 className="mr-1 h-3.5 w-3.5" />
                Delete contact
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={saving} data-testid="button-save-contact">
              {saving ? "Saving…" : "Save"}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Small helpers ───────────────────────────────────────────────────────────

function Field({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function CheckFlag({
  label,
  description,
  checked,
  onChange,
  testId,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  testId?: string;
}) {
  return (
    <label className="flex cursor-pointer items-start gap-3 rounded-md border p-2.5 hover:bg-muted/50">
      <input
        type="checkbox"
        className="mt-0.5 h-4 w-4 accent-teal-600"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        data-testid={testId}
      />
      <div>
        <div className="text-sm font-medium">{label}</div>
        <div className="text-xs text-muted-foreground">{description}</div>
      </div>
    </label>
  );
}
