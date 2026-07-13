import { useState, useMemo } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import {
  Phone, Mail, MailPlus, Plus, Trash2, Pencil, Church, Music, Mic, Building2,
  GraduationCap, MapPin, PhoneCall, Globe, Star, Search, Compass, CheckCircle2,
  CalendarClock, Armchair, List as ListIcon, Map as MapIcon, Lightbulb,
  ChevronDown, ChevronRight, Sparkles, Loader2,
} from "lucide-react";
import { OutreachMap } from "@/components/outreach-map";
import type { OutreachLead, InsertOutreachLead } from "@shared/schema";

// ── Lead types ──────────────────────────────────────────────────────────────
const LEAD_TYPES = [
  { value: "church", label: "Church", icon: Church },
  { value: "teaching_studio", label: "Teaching studio", icon: Music },
  { value: "recording_studio", label: "Recording studio", icon: Mic },
  { value: "hotel_venue", label: "Hotel / venue", icon: Building2 },
  { value: "school", label: "School", icon: GraduationCap },
  { value: "senior_living", label: "Senior living", icon: Armchair },
  { value: "other", label: "Other", icon: MapPin },
] as const;

function typeInfo(t: string | null | undefined) {
  return LEAD_TYPES.find((x) => x.value === t) ?? LEAD_TYPES[LEAD_TYPES.length - 1];
}

// ── Status presets + colors ──────────────────────────────────────────────────
const STATUS_PRESETS = [
  "Not contacted",
  "Left voicemail",
  "Talked - interested",
  "Talked - not interested",
  "Talked and left phone/email",
  "Emailed - no reply",
  "Emailed - in conversation",
  "Phone not in service",
  "Callback scheduled",
  "Client",
];

// Maps a (possibly free-text) status to a badge color bucket.
function statusColor(status: string | null | undefined): string {
  const s = (status || "").toLowerCase();
  if (s.includes("client")) return "bg-emerald-600 text-white";
  if (s.includes("interested") && !s.includes("not")) return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300";
  if (s.includes("conversation")) return "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300";
  if (s.includes("callback")) return "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300";
  if (s.includes("voicemail") || s.includes("left phone")) return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
  if (s.includes("emailed")) return "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300";
  if (s.includes("not interested")) return "bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-300";
  if (s.includes("not in service") || s.includes("disconnect")) return "bg-muted text-muted-foreground line-through";
  return "bg-muted text-muted-foreground"; // Not contacted / unknown
}

const CONTACT_METHODS = [
  { value: "phone", label: "Phone" },
  { value: "email", label: "Email" },
  { value: "both", label: "Phone + email" },
  { value: "in_person", label: "In person" },
];

// ── City distances from home base (14 Murdock St, Somerville — approx. miles) ─
// Drives BOTH the proximity ordering of the lead list (Somerville first, then
// branching outward) and the compact "branch out" suggestions at the bottom.
const HOME_CITY = "Somerville";
const CITY_MILES: Record<string, number> = {
  somerville: 0,
  medford: 1.5, // closest neighbor to 14 Murdock St
  cambridge: 2,
  arlington: 2.5,
  malden: 3,
  everett: 3.5,
  charlestown: 3.5,
  belmont: 3.5,
  boston: 4,
  winchester: 4.5,
  chelsea: 4.5,
  allston: 4.5,
  watertown: 4.5,
  melrose: 4.5,
  brighton: 5,
  brookline: 5.5,
  revere: 5.5,
  stoneham: 5.5,
  lexington: 6.5,
  woburn: 6.5,
  saugus: 6.5,
  newton: 7,
  waltham: 7,
};

// Distance for sorting: known cities get their mileage, unknown cities sort last.
function cityMiles(city: string): number | null {
  const m = CITY_MILES[normalizeCity(city)];
  return m === undefined ? null : m;
}

const NEARBY_CITIES: { city: string; miles: number }[] = Object.entries(CITY_MILES)
  .filter(([c]) => c !== "somerville")
  .map(([c, miles]) => ({ city: c.charAt(0).toUpperCase() + c.slice(1), miles }));

// Normalizes city names so e.g. "Back Bay Area" counts as Boston coverage.
function normalizeCity(c: string | null | undefined): string {
  const s = (c || "").trim().toLowerCase();
  if (s.includes("back bay") || s.includes("boston")) return "boston";
  return s;
}

const todayMDY = () => {
  const d = new Date();
  return `${d.getMonth() + 1}/${d.getDate()}/${String(d.getFullYear()).slice(2)}`;
};

const todayISO = () => new Date().toISOString().slice(0, 10);

// First-touch outreach email, tailored per venue type so it reads like it was
// written for them — not a blast. Short on purpose: easy to answer, easy to ignore
// without guilt, and it invites a reply rather than pushing a sale.
function buildOutreachEmail(lead: OutreachLead): { subject: string; body: string } {
  const orgName = lead.name || "your organization";
  const signature =
    `Best,\nWillis Krammer\nJohn Willis Piano\n\n` +
    `johnwillispiano.com\nj.willis.keys@gmail.com\n435-275-5959`;

  const intro = `My name is Willis Krammer — I'm a registered piano technician based in Somerville with 7 years of full-time experience, and I serve as the Head Technician at Boston University during the week.`;

  let subject = "Piano tuning & repair services";
  let middle = "";

  switch (lead.leadType) {
    case "church":
      subject = `A local piano technician for ${orgName}`;
      middle =
        `I'm writing to whoever oversees music at ${orgName}. Sanctuary and fellowship-hall pianos work hard on Sundays and often go years between tunings — if yours is due (or has a note or two acting up), I'd be glad to stop by, take a look, and give you an honest read on what it needs. No obligation either way.`;
      break;
    case "teaching_studio":
      subject = "Fellow piano person in Somerville — tuning for you & your students";
      middle =
        `I'm reaching out teacher-to-technician: I take care of studio instruments, and I'm also the person a lot of families ask their teacher to recommend when their home piano needs work. If it would be useful to have a local tech you can confidently point students to — or your own instruments are due — I'd love to connect.`;
      break;
    case "recording_studio":
      subject = `Session-ready piano prep for ${orgName}`;
      middle =
        `I do concert- and session-level tuning and voicing, including same-week touch-ups before tracking dates. If your house piano could use a regular tech — or you'd like someone on call for sessions — I'd be glad to come by, meet you, and look the instrument over.`;
      break;
    case "hotel_venue":
      subject = `Keeping the piano at ${orgName} performance-ready`;
      middle =
        `Lobby, bar, and event pianos take a beating and are usually the last thing on the maintenance list. I keep instruments like these on a simple seasonal schedule so they're always guest-ready, and I can also do pre-event touch-ups. Happy to stop in and give yours a quick, free assessment.`;
      break;
    case "school":
      subject = `Piano care for ${orgName}`;
      middle =
        `I maintain the pianos at Boston University during the week, so classroom and performance instruments are my daily work. If your music rooms have pianos due for tuning or repair — or you'd like a once-a-year maintenance plan that fits the school calendar — I'd be glad to help.`;
      break;
    case "senior_living":
      subject = `The piano in your common room — a friendly offer`;
      middle =
        `Common-room pianos do a lot of good — singalongs, visiting performers, residents who've played all their lives — and they're often long overdue for care. I'd be happy to stop by, check yours over for free, and let your activities team know exactly where it stands.`;
      break;
    default:
      middle =
        `I'm reaching out to whoever oversees piano care at ${orgName} to see if you have an instrument that's due for tuning or repairs. I'd be glad to take a look and give you an honest read on what it needs.`;
  }

  const availability = `Weekends and late afternoons are usually easiest for me to schedule, and I'm close by in Somerville.`;

  const body = `Hello,\n\n${intro}\n\n${middle}\n\n${availability}\n\nHappy to answer any questions.\n\n${signature}`;
  return { subject, body };
}

// Suggests the next human touch based on where things stand. The point:
// vary the channel (email → call → drop-in) instead of repeat-emailing,
// which is why outreach starts to feel like pestering.
function nextStepHint(lead: OutreachLead): string | null {
  const s = (lead.status || "").toLowerCase();
  if (s.includes("client") || s.includes("not interested") || s.includes("not in service")) return null;
  if (!lead.contactedDate) {
    if (lead.leadType === "church") return "First touch: call Tue–Thu mid-morning — church offices rarely answer email from strangers.";
    if (lead.leadType === "senior_living") return "First touch: call and ask for the Activities Director by title.";
    if (lead.leadType === "teaching_studio") return "First touch: short personal email, then say hi in person — teachers value the human connection.";
    return "First touch: a call beats an email for venues — ask who handles the piano.";
  }
  if (s.includes("emailed") && s.includes("no reply"))
    return "Don't re-email — switch channels: one phone call, or drop by in person. It reads as friendly, not pushy.";
  if (s.includes("voicemail"))
    return "Follow the voicemail with a short email so they can reply on their own time.";
  if (s.includes("conversation") || s.includes("interested"))
    return "Warm — offer a specific time window for a free assessment to make saying yes easy.";
  if (s.includes("callback")) return "Callback promised — set the follow-up date so it doesn't slip.";
  return null;
}

// Sort weight within a city group — most actionable first, dead/won last.
// 0 follow-up due · 1 warm · 2 never contacted · 3 waiting on reply · 4 client · 5 dead
function leadPriority(l: OutreachLead): number {
  const s = (l.status || "").toLowerCase();
  if (s.includes("not interested") || s.includes("not in service") || s.includes("disconnect")) return 5;
  if (s.includes("client")) return 4;
  if (l.followUpDate && l.followUpDate <= todayISO()) return 0;
  if ((s.includes("interested") && !s.includes("not")) || s.includes("conversation") || s.includes("callback")) return 1;
  if (!l.contactedDate) return 2;
  return 3;
}

const EMPTY_FORM: Partial<InsertOutreachLead> = {
  leadType: "church",
  name: "",
  city: "",
  phone: "",
  email: "",
  website: "",
  address: "",
  status: "Not contacted",
  contactedDate: "",
  followUpDate: "",
  contactMethod: null,
  pianoCount: "",
  currentTechnician: "",
  notes: "",
};

export default function OutreachPage() {
  const { toast } = useToast();
  const { data: leads, isLoading } = useQuery<OutreachLead[]>({
    queryKey: ["/api/outreach-leads"],
  });

  const [search, setSearch] = useState("");
  const [cityFilter, setCityFilter] = useState("all");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [view, setView] = useState<"list" | "map">("list");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<Partial<InsertOutreachLead>>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  // City the AI-research dialog is aimed at (null = dialog closed)
  const [researchCity, setResearchCity] = useState<string | null>(null);
  // Collapsed city groups — persisted so the layout sticks between visits
  const [collapsed, setCollapsed] = useState<Set<string>>(() => {
    try {
      return new Set<string>(JSON.parse(localStorage.getItem("outreach-collapsed-cities") || "[]"));
    } catch {
      return new Set<string>();
    }
  });

  function saveCollapsed(next: Set<string>) {
    setCollapsed(next);
    try {
      localStorage.setItem("outreach-collapsed-cities", JSON.stringify(Array.from(next)));
    } catch {}
  }

  function toggleCity(city: string) {
    const next = new Set(collapsed);
    if (next.has(city)) next.delete(city);
    else next.add(city);
    saveCollapsed(next);
  }

  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: ["/api/outreach-leads"] });

  const createMutation = useMutation({
    mutationFn: async (data: Partial<InsertOutreachLead>) =>
      (await apiRequest("POST", "/api/outreach-leads", data)).json(),
    onSuccess: () => {
      invalidate();
      toast({ title: "Lead added" });
      setDialogOpen(false);
    },
    onError: (e: any) => toast({ title: "Couldn't add lead", description: e.message, variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: Partial<InsertOutreachLead> }) =>
      (await apiRequest("PATCH", `/api/outreach-leads/${id}`, data)).json(),
    onSuccess: () => invalidate(),
    onError: (e: any) => toast({ title: "Update failed", description: e.message, variant: "destructive" }),
  });

  const geocodeMutation = useMutation({
    mutationFn: async () =>
      (await apiRequest("POST", "/api/outreach-leads/geocode-missing")).json(),
    onSuccess: (r: { geocoded: number; failed: number }) => {
      invalidate();
      toast({
        title: `Located ${r.geocoded} lead${r.geocoded === 1 ? "" : "s"} on the map`,
        description: r.failed ? `${r.failed} couldn't be found — add a street address and retry.` : undefined,
      });
    },
    onError: (e: any) => toast({ title: "Geocoding failed", description: e.message, variant: "destructive" }),
  });

  // AI research: server web-searches the city and inserts leads it finds.
  // Slow by nature (~1-2 min) — the dialog shows progress while it runs.
  const researchMutation = useMutation({
    mutationFn: async (city: string) =>
      (await apiRequest("POST", "/api/outreach-leads/research", { city })).json(),
    onSuccess: (r: { added: number; skipped: number }, city) => {
      invalidate();
      setResearchCity(null);
      // Make sure the freshly researched city is expanded so the results show.
      const next = new Set(collapsed);
      next.delete(city);
      saveCollapsed(next);
      toast({
        title: `Found ${r.added} new lead${r.added === 1 ? "" : "s"} in ${city}`,
        description:
          (r.skipped ? `${r.skipped} already on your list. ` : "") +
          (r.added ? "Spot-check phone numbers before dialing — AI research isn't perfect." : "Try again later or add leads manually."),
      });
    },
    onError: (e: any) =>
      toast({ title: "Research failed", description: e.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => apiRequest("DELETE", `/api/outreach-leads/${id}`),
    onSuccess: () => {
      invalidate();
      toast({ title: "Lead removed" });
      setDeleteId(null);
    },
    onError: (e: any) => toast({ title: "Delete failed", description: e.message, variant: "destructive" }),
  });

  // ── Derived data ───────────────────────────────────────────────────────────
  const cities = useMemo(() => {
    const set = new Set<string>();
    (leads || []).forEach((l) => l.city && set.add(l.city));
    // Nearest-first, unknown cities alphabetical at the end.
    return Array.from(set).sort((a, b) => {
      const ma = cityMiles(a), mb = cityMiles(b);
      if (ma !== null && mb !== null && ma !== mb) return ma - mb;
      if (ma !== null && mb === null) return -1;
      if (ma === null && mb !== null) return 1;
      return a.localeCompare(b);
    });
  }, [leads]);

  const filtered = useMemo(() => {
    let rows = leads || [];
    if (cityFilter !== "all") rows = rows.filter((l) => l.city === cityFilter);
    if (typeFilter !== "all") rows = rows.filter((l) => l.leadType === typeFilter);
    if (statusFilter !== "all") {
      if (statusFilter === "uncontacted") {
        rows = rows.filter((l) => !l.contactedDate);
      } else if (statusFilter === "contacted") {
        rows = rows.filter((l) => !!l.contactedDate);
      } else {
        rows = rows.filter((l) => (l.status || "") === statusFilter);
      }
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      rows = rows.filter(
        (l) =>
          l.name.toLowerCase().includes(q) ||
          (l.city || "").toLowerCase().includes(q) ||
          (l.email || "").toLowerCase().includes(q) ||
          (l.phone || "").toLowerCase().includes(q) ||
          (l.notes || "").toLowerCase().includes(q),
      );
    }
    return rows;
  }, [leads, cityFilter, typeFilter, statusFilter, search]);

  // Group filtered rows by city — nearest to home first (Somerville, then
  // Medford, Cambridge, …), so calls start close and branch outward. Within a
  // city, the most actionable leads float to the top.
  const grouped = useMemo(() => {
    const map = new Map<string, OutreachLead[]>();
    filtered.forEach((l) => {
      const key = l.city || "Uncategorized";
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(l);
    });
    const entries = Array.from(map.entries());
    entries.forEach(([, rows]) =>
      rows.sort((a, b) => leadPriority(a) - leadPriority(b) || a.name.localeCompare(b.name)),
    );
    return entries.sort((a, b) => {
      const ma = a[0] === "Uncategorized" ? null : cityMiles(a[0]);
      const mb = b[0] === "Uncategorized" ? null : cityMiles(b[0]);
      if (ma !== null && mb !== null && ma !== mb) return ma - mb;
      if (ma !== null && mb === null) return -1;
      if (ma === null && mb !== null) return 1;
      return a[0].localeCompare(b[0]);
    });
  }, [filtered]);

  const stats = useMemo(() => {
    const all = leads || [];
    return {
      total: all.length,
      contacted: all.filter((l) => !!l.contactedDate).length,
      interested: all.filter((l) => {
        const s = (l.status || "").toLowerCase();
        return (s.includes("interested") && !s.includes("not")) || s.includes("conversation") || s.includes("callback");
      }).length,
      clients: all.filter((l) => (l.status || "").toLowerCase().includes("client")).length,
      followUpsDue: all.filter((l) => l.followUpDate && l.followUpDate <= todayISO()).length,
    };
  }, [leads]);

  const suggestions = useMemo(() => {
    const covered = new Set((leads || []).map((l) => normalizeCity(l.city)));
    return NEARBY_CITIES.filter((c) => !covered.has(normalizeCity(c.city)))
      .sort((a, b) => a.miles - b.miles)
      .slice(0, 8);
  }, [leads]);

  // ── Handlers ─────────────────────────────────────────────────────────────
  function openAdd(prefillCity?: string) {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, city: prefillCity ?? "" });
    setDialogOpen(true);
  }

  function openEdit(l: OutreachLead) {
    setEditingId(l.id);
    setForm({
      leadType: l.leadType,
      name: l.name,
      city: l.city ?? "",
      phone: l.phone ?? "",
      email: l.email ?? "",
      website: l.website ?? "",
      address: l.address ?? "",
      status: l.status ?? "Not contacted",
      contactedDate: l.contactedDate ?? "",
      followUpDate: l.followUpDate ?? "",
      contactMethod: l.contactMethod ?? null,
      pianoCount: l.pianoCount ?? "",
      currentTechnician: l.currentTechnician ?? "",
      notes: l.notes ?? "",
    });
    setDialogOpen(true);
  }

  function submitForm() {
    if (!form.name?.trim()) {
      toast({ title: "Name is required", variant: "destructive" });
      return;
    }
    const payload = { ...form, source: editingId ? undefined : "manual" };
    if (editingId) updateMutation.mutate({ id: editingId, data: form });
    else createMutation.mutate(payload);
  }

  // Quick "log a contact" — stamps today's date + method and bumps status if still fresh.
  function logContact(l: OutreachLead, method: "phone" | "email") {
    const data: Partial<InsertOutreachLead> = {
      contactedDate: todayMDY(),
      contactMethod: l.contactMethod && l.contactMethod !== method ? "both" : method,
    };
    if (!l.status || l.status === "Not contacted") {
      data.status = method === "phone" ? "Left voicemail" : "Emailed - no reply";
    }
    updateMutation.mutate({ id: l.id, data });
    toast({ title: method === "phone" ? "Call logged" : "Email logged", description: l.name });
  }

  // Opens a pre-filled first-touch outreach email in the user's mail client.
  // Doesn't send anything or change status — that's still "Log an email".
  function draftEmail(l: OutreachLead) {
    if (!l.email) {
      toast({ title: "No email on file", description: `Add an email for ${l.name} first.`, variant: "destructive" });
      return;
    }
    const { subject, body } = buildOutreachEmail(l);
    window.location.href = `mailto:${l.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  return (
    <div className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight" data-testid="text-outreach-title">
            Outreach
          </h1>
          <p className="text-muted-foreground text-sm">
            Call-center for finding new clients — churches, studios, schools & venues.
          </p>
        </div>
        <Button onClick={() => openAdd()} data-testid="button-add-lead">
          <Plus className="h-4 w-4 mr-1" /> Add lead
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard label="Total leads" value={stats.total} icon={MapPin} />
        <StatCard label="Contacted" value={stats.contacted} icon={PhoneCall} />
        <StatCard label="Warm / interested" value={stats.interested} icon={Star} />
        <StatCard label="Clients won" value={stats.clients} icon={CheckCircle2} />
        <StatCard label="Follow-ups due" value={stats.followUpsDue} icon={CalendarClock} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, city, phone, email…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8"
            data-testid="input-outreach-search"
          />
        </div>
        <Select value={cityFilter} onValueChange={setCityFilter}>
          <SelectTrigger className="w-[150px]" data-testid="select-city-filter">
            <SelectValue placeholder="City" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All cities</SelectItem>
            {cities.map((c) => (
              <SelectItem key={c} value={c}>{c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-[150px]" data-testid="select-type-filter">
            <SelectValue placeholder="Type" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {LEAD_TYPES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-[170px]" data-testid="select-status-filter">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="uncontacted">Not yet contacted</SelectItem>
            <SelectItem value="contacted">Contacted</SelectItem>
            {STATUS_PRESETS.map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex rounded-md border overflow-hidden">
          <Button
            variant={view === "list" ? "secondary" : "ghost"}
            size="sm"
            className="rounded-none"
            onClick={() => setView("list")}
            data-testid="button-view-list"
          >
            <ListIcon className="h-4 w-4 mr-1" /> List
          </Button>
          <Button
            variant={view === "map" ? "secondary" : "ghost"}
            size="sm"
            className="rounded-none"
            onClick={() => setView("map")}
            data-testid="button-view-map"
          >
            <MapIcon className="h-4 w-4 mr-1" /> Map
          </Button>
        </div>
      </div>

      {/* Map view — shows the same filtered set as the list */}
      {view === "map" && !isLoading && (
        <OutreachMap
          leads={filtered}
          onGeocodeMissing={() => geocodeMutation.mutate()}
          isGeocoding={geocodeMutation.isPending}
        />
      )}

      {/* List */}
      {view === "map" ? null : isLoading ? (
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center text-muted-foreground">
            No leads match your filters.{" "}
            <button className="text-primary underline" onClick={() => openAdd()}>Add one</button>.
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {/* Expand / collapse all */}
          <div className="flex items-center justify-end gap-1 text-xs text-muted-foreground -mb-1">
            <button
              className="hover:text-foreground underline-offset-2 hover:underline"
              onClick={() => saveCollapsed(new Set())}
              data-testid="button-expand-all"
            >
              Expand all
            </button>
            <span>·</span>
            <button
              className="hover:text-foreground underline-offset-2 hover:underline"
              onClick={() => saveCollapsed(new Set(grouped.map(([c]) => c)))}
              data-testid="button-collapse-all"
            >
              Collapse all
            </button>
          </div>
          {grouped.map(([city, rows]) => {
            const isCollapsed = collapsed.has(city);
            return (
              <div key={city}>
                <button
                  className="flex w-full items-center gap-2 mb-2 group text-left"
                  onClick={() => toggleCity(city)}
                  data-testid={`button-city-toggle-${city.toLowerCase().replace(/\s+/g, "-")}`}
                >
                  {isCollapsed ? (
                    <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-muted-foreground shrink-0" />
                  )}
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground group-hover:text-foreground">
                    {city}
                  </h2>
                  <Badge variant="secondary" className="text-xs">{rows.length}</Badge>
                  {normalizeCity(city) !== normalizeCity(HOME_CITY) && cityMiles(city) !== null && (
                    <span className="text-xs text-muted-foreground">~{cityMiles(city)} mi</span>
                  )}
                </button>
                {!isCollapsed && (
                  <div className="space-y-2">
                    {rows.map((l) => (
                      <LeadRow
                        key={l.id}
                        lead={l}
                        onStatusChange={(status) => updateMutation.mutate({ id: l.id, data: { status } })}
                        onLogCall={() => logContact(l, "phone")}
                        onLogEmail={() => logContact(l, "email")}
                        onDraftEmail={() => draftEmail(l)}
                        onEdit={() => openEdit(l)}
                        onDelete={() => setDeleteId(l.id)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Branch out — compact suggestion strip, deliberately out of the way */}
      {view === "list" && !isLoading && suggestions.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Compass className="h-3.5 w-3.5" /> Branch out next:
          </span>
          {suggestions.slice(0, 5).map((s) => (
            <Button
              key={s.city}
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-muted-foreground"
              onClick={() => setResearchCity(s.city)}
              title={`AI-research piano leads in ${s.city} (~${s.miles} mi)`}
              data-testid={`button-suggest-${s.city.toLowerCase()}`}
            >
              <Sparkles className="h-3 w-3 mr-1" />
              {s.city} <span className="ml-1 text-xs opacity-70">~{s.miles} mi</span>
            </Button>
          ))}
        </div>
      )}

      {/* AI research dialog */}
      <Dialog
        open={researchCity !== null}
        onOpenChange={(o) => {
          if (!o && !researchMutation.isPending) setResearchCity(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" /> Research {researchCity}
            </DialogTitle>
            <DialogDescription>
              Claude will search the web for churches, schools, teaching & recording studios,
              venues, and senior living communities in {researchCity} that likely own pianos —
              and add them here with the phone numbers, emails, and websites it finds.
            </DialogDescription>
          </DialogHeader>
          {researchMutation.isPending ? (
            <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin shrink-0" />
              <div>
                Researching {researchCity}… this usually takes a minute or two.
                <br />You can keep working — results will appear in the list when done.
              </div>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Takes 1–2 minutes and adds up to ~15 leads. Duplicates of anything already on
              your list are skipped. Spot-check contact info before dialing.
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={researchMutation.isPending}
              onClick={() => {
                const c = researchCity;
                setResearchCity(null);
                openAdd(c ?? "");
              }}
              data-testid="button-research-manual"
            >
              Add one manually
            </Button>
            <Button
              disabled={researchMutation.isPending}
              onClick={() => researchCity && researchMutation.mutate(researchCity)}
              data-testid="button-research-start"
            >
              {researchMutation.isPending ? (
                <><Loader2 className="h-4 w-4 mr-1 animate-spin" /> Researching…</>
              ) : (
                <><Sparkles className="h-4 w-4 mr-1" /> Start research</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Add / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit lead" : "Add lead"}</DialogTitle>
            <DialogDescription>
              A church, teaching/recording studio, school, hotel or venue worth reaching out to.
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Name</Label>
              <Input
                value={form.name ?? ""}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="e.g. First Parish Unitarian"
                data-testid="input-lead-name"
              />
            </div>
            <div>
              <Label>Type</Label>
              <Select value={form.leadType ?? "church"} onValueChange={(v) => setForm({ ...form, leadType: v })}>
                <SelectTrigger data-testid="select-lead-type"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {LEAD_TYPES.map((t) => <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>City</Label>
              <Input
                value={form.city ?? ""}
                onChange={(e) => setForm({ ...form, city: e.target.value })}
                placeholder="e.g. Arlington"
                data-testid="input-lead-city"
              />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={form.phone ?? ""} onChange={(e) => setForm({ ...form, phone: e.target.value })} data-testid="input-lead-phone" />
            </div>
            <div>
              <Label>Email</Label>
              <Input value={form.email ?? ""} onChange={(e) => setForm({ ...form, email: e.target.value })} data-testid="input-lead-email" />
            </div>
            <div className="col-span-2">
              <Label>Website</Label>
              <Input value={form.website ?? ""} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://" />
            </div>
            <div className="col-span-2">
              <Label>Address</Label>
              <Input value={form.address ?? ""} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status ?? "Not contacted"} onValueChange={(v) => setForm({ ...form, status: v })}>
                <SelectTrigger data-testid="select-lead-status"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_PRESETS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Contact method</Label>
              <Select
                value={form.contactMethod ?? "none"}
                onValueChange={(v) => setForm({ ...form, contactMethod: v === "none" ? null : v })}
              >
                <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">—</SelectItem>
                  {CONTACT_METHODS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Last contacted</Label>
              <Input
                value={form.contactedDate ?? ""}
                onChange={(e) => setForm({ ...form, contactedDate: e.target.value })}
                placeholder="M/D/YY"
              />
            </div>
            <div>
              <Label>Follow up on</Label>
              <Input
                type="date"
                value={form.followUpDate ?? ""}
                onChange={(e) => setForm({ ...form, followUpDate: e.target.value })}
                data-testid="input-lead-followup"
              />
            </div>
            <div>
              <Label>Piano count</Label>
              <Input value={form.pianoCount ?? ""} onChange={(e) => setForm({ ...form, pianoCount: e.target.value })} placeholder="e.g. 2" />
            </div>
            <div className="col-span-2">
              <Label>Current technician</Label>
              <Input
                value={form.currentTechnician ?? ""}
                onChange={(e) => setForm({ ...form, currentTechnician: e.target.value })}
                placeholder="Who tunes it now? (blank = unknown)"
              />
            </div>
            <div className="col-span-2">
              <Label>Notes</Label>
              <Textarea
                value={form.notes ?? ""}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
                placeholder="Anything useful for the next call…"
                data-testid="textarea-lead-notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button
              onClick={submitForm}
              disabled={createMutation.isPending || updateMutation.isPending}
              data-testid="button-save-lead"
            >
              {editingId ? "Save changes" : "Add lead"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={deleteId !== null} onOpenChange={(o) => !o && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this lead?</AlertDialogTitle>
            <AlertDialogDescription>This can't be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteId !== null && deleteMutation.mutate(deleteId)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────
function StatCard({ label, value, icon: Icon }: { label: string; value: number; icon: any }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="h-9 w-9 rounded-md bg-primary/10 flex items-center justify-center shrink-0">
          <Icon className="h-4 w-4 text-primary" />
        </div>
        <div className="min-w-0">
          <div className="text-xl font-semibold tabular-nums leading-none">{value}</div>
          <div className="text-xs text-muted-foreground truncate">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

function LeadRow({
  lead, onStatusChange, onLogCall, onLogEmail, onDraftEmail, onEdit, onDelete,
}: {
  lead: OutreachLead;
  onStatusChange: (status: string) => void;
  onLogCall: () => void;
  onLogEmail: () => void;
  onDraftEmail: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const TI = typeInfo(lead.leadType);
  const Icon = TI.icon;
  return (
    <Card data-testid={`outreach-lead-${lead.id}`}>
      <CardContent className="p-3 sm:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          {/* Identity */}
          <div className="flex items-start gap-3 flex-1 min-w-0">
            <div className="h-9 w-9 rounded-md bg-muted flex items-center justify-center shrink-0 mt-0.5">
              <Icon className="h-4 w-4 text-muted-foreground" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium truncate">{lead.name}</span>
                <Badge variant="outline" className="text-[10px] uppercase">{TI.label}</Badge>
                {lead.pianoCount && (
                  <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                    <Music className="h-3 w-3" />{lead.pianoCount}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground flex-wrap">
                {lead.phone && (
                  <a href={`tel:${lead.phone.replace(/[^\d+]/g, "")}`} className="inline-flex items-center gap-1 hover:text-foreground" data-testid={`link-call-${lead.id}`}>
                    <Phone className="h-3.5 w-3.5" />{lead.phone}
                  </a>
                )}
                {lead.email && (
                  <a href={`mailto:${lead.email}`} className="inline-flex items-center gap-1 hover:text-foreground truncate" data-testid={`link-email-${lead.id}`}>
                    <Mail className="h-3.5 w-3.5" />{lead.email}
                  </a>
                )}
                {lead.website && (
                  <a href={lead.website} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 hover:text-foreground">
                    <Globe className="h-3.5 w-3.5" />Site
                  </a>
                )}
              </div>
              {lead.notes && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{lead.notes}</p>}
              {lead.currentTechnician && lead.currentTechnician !== "-" && (
                <p className="text-xs text-muted-foreground mt-0.5">Current tech: {lead.currentTechnician}</p>
              )}
              {nextStepHint(lead) && (
                <p className="text-xs mt-1 inline-flex items-start gap-1 text-amber-700 dark:text-amber-400" data-testid={`hint-nextstep-${lead.id}`}>
                  <Lightbulb className="h-3.5 w-3.5 shrink-0 mt-[1px]" />
                  <span>{nextStepHint(lead)}</span>
                </p>
              )}
            </div>
          </div>

          {/* Status + contacted */}
          <div className="flex flex-col gap-1.5 sm:items-end shrink-0">
            <div className="flex items-center gap-2">
              <Badge className={`${statusColor(lead.status)} border-0`}>{lead.status || "Not contacted"}</Badge>
              {lead.contactedDate && (
                <span className="text-xs text-muted-foreground">{lead.contactedDate}</span>
              )}
            </div>
            {lead.followUpDate && (
              <Badge
                variant="outline"
                className={`text-[10px] gap-1 ${lead.followUpDate <= todayISO() ? "border-rose-400 text-rose-700 dark:text-rose-300" : "text-muted-foreground"}`}
                data-testid={`badge-followup-${lead.id}`}
              >
                <CalendarClock className="h-3 w-3" />
                {lead.followUpDate <= todayISO() ? "Follow up: due " : "Follow up: "}
                {lead.followUpDate}
              </Badge>
            )}
            <Select value={STATUS_PRESETS.includes(lead.status || "") ? (lead.status as string) : "__custom"} onValueChange={onStatusChange}>
              <SelectTrigger className="h-7 w-[180px] text-xs" data-testid={`select-status-${lead.id}`}>
                <SelectValue placeholder="Set status" />
              </SelectTrigger>
              <SelectContent>
                {!STATUS_PRESETS.includes(lead.status || "") && lead.status && (
                  <SelectItem value="__custom" disabled>{lead.status}</SelectItem>
                )}
                {STATUS_PRESETS.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-1 shrink-0">
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Log a call" onClick={onLogCall} data-testid={`button-logcall-${lead.id}`}>
              <PhoneCall className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Log an email" onClick={onLogEmail} data-testid={`button-logemail-${lead.id}`}>
              <Mail className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8"
              title={lead.email ? `Draft outreach email to ${lead.email}` : "Add an email to draft outreach"}
              onClick={onDraftEmail}
              data-testid={`button-draftemail-${lead.id}`}
            >
              <MailPlus className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" title="Edit" onClick={onEdit} data-testid={`button-edit-${lead.id}`}>
              <Pencil className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" title="Remove" onClick={onDelete} data-testid={`button-delete-${lead.id}`}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
