/**
 * /book — Public self-scheduler (Gazelle-inspired 5-step flow)
 *
 * Step 1  Your Location   — address autocomplete + map verification
 * Step 2  Piano & Service — piano type, optional details, service selection
 * Step 3  Select a Date   — calendar showing available/recommended dates
 * Step 4  Select a Time   — available slots for the chosen date
 * Step 5  Contact Info    — name, phone, email, notes → submit
 *
 * ?embed=true strips the outer chrome for iframe use.
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PhoneInput } from "@/components/phone-input";
import {
  CheckCircle2, Piano, MapPin, AlertTriangle, ChevronLeft, ChevronRight,
  Clock, CalendarDays, Star,
} from "lucide-react";

// ── Types ────────────────────────────────────────────────────────────────────

type Step = 1 | 2 | 3 | 4 | 5;
type PianoType = "Grand" | "Upright" | "Unknown";

interface PublicSettings {
  showServiceCost: boolean;
  showServiceDuration: boolean;
  serviceAreaEnabled: boolean;
  serviceAreaLat: string | null;
  serviceAreaLng: string | null;
  serviceAreaRadiusMiles: string | null;
  welcomeMessage: string | null;
  reservationCompleteMessage: string | null;
  outsideServiceAreaMessage: string | null;
  privacyPolicyUrl: string | null;
  termsOfServiceUrl: string | null;
}

interface AvailableDate {
  date: string;         // YYYY-MM-DD
  dayLabel: string;     // "Saturday, Jun 7"
  isRecommended: boolean;
  isTripDate: boolean;
  slots: string[];      // ["9:00 AM", "10:30 AM", …]
}

interface SlotsResponse {
  availableDates: AvailableDate[];
  isUtah: boolean;
  tripName?: string;
  message?: string;
}

interface BookingPayload {
  // Location
  streetAddress: string;
  addressLat: string;
  addressLng: string;
  cityNeighborhood: string;
  // Piano
  pianoType: string;
  pianoMake: string;
  pianoModel: string;
  pianoRoom: string;
  pianoYear: string;
  // Service
  serviceRequested: string;
  lastTuned: string;
  // Schedule
  preferredDate: string;
  preferredTime: string;
  preferredTimes: string; // human-readable summary stored in DB
  // Contact
  firstName: string;
  lastName: string;
  phone: string;
  email: string;
  notes: string;
}

// ── Haversine ────────────────────────────────────────────────────────────────

function haversineMiles(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 3958.8;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
    Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Address autocomplete is handled server-side via /api/places/autocomplete and
// /api/places/details (see StepLocation) — no in-browser Google widget or
// browser-exposed Maps key is needed.

// ── Step nav (sidebar on desktop, pills on mobile) ────────────────────────────

const STEP_INFO: Record<Step, { label: string; sub?: string }> = {
  1: { label: "Your Location" },
  2: { label: "Piano & Service" },
  3: { label: "Select a Date" },
  4: { label: "Select a Time" },
  5: { label: "Contact Details" },
};

function StepNav({
  current,
  stepSubs,
  onBack,
}: {
  current: Step;
  stepSubs: Partial<Record<Step, string>>;
  onBack: () => void;
}) {
  return (
    <>
      {/* ── Desktop sidebar ─────────────────────────────────────────── */}
      <aside className="hidden sm:flex flex-col w-56 shrink-0 bg-slate-100 rounded-xl p-4 gap-1 self-start sticky top-4">
        {([1, 2, 3, 4, 5] as Step[]).map((step) => {
          const done = step < current;
          const active = step === current;
          return (
            <div
              key={step}
              className={`flex items-start gap-3 px-3 py-2.5 rounded-lg transition-colors ${
                active ? "bg-white shadow-sm" : done ? "" : "opacity-40"
              }`}
            >
              <div
                className={`mt-0.5 flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold shrink-0 ${
                  done
                    ? "bg-slate-800 text-white"
                    : active
                    ? "bg-slate-900 text-white"
                    : "bg-slate-300 text-slate-600"
                }`}
              >
                {done ? "✓" : step}
              </div>
              <div>
                <p className={`text-sm font-semibold leading-tight ${active ? "text-slate-900" : "text-slate-600"}`}>
                  {STEP_INFO[step].label}
                </p>
                {stepSubs[step] && (
                  <p className="text-xs text-slate-500 mt-0.5 leading-snug">{stepSubs[step]}</p>
                )}
              </div>
            </div>
          );
        })}
      </aside>

      {/* ── Mobile header ───────────────────────────────────────────── */}
      <div className="sm:hidden flex items-center gap-3 mb-4">
        {current > 1 && (
          <button type="button" onClick={onBack} className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <div className="flex-1">
          <div className="flex gap-1 mb-1">
            {([1, 2, 3, 4, 5] as Step[]).map(s => (
              <div
                key={s}
                className={`h-1 flex-1 rounded-full transition-colors ${s <= current ? "bg-slate-800" : "bg-slate-200"}`}
              />
            ))}
          </div>
          <p className="text-sm font-semibold text-slate-800">
            Step {current} — {STEP_INFO[current].label}
          </p>
        </div>
      </div>
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function BookPage() {
  const isEmbed = new URLSearchParams(window.location.search).has("embed");

  const { data: settings } = useQuery<PublicSettings>({
    queryKey: ["/api/scheduler-settings/public"],
    queryFn: () => fetch("/api/scheduler-settings/public").then(r => r.json()),
  });

  const { data: servicesData } = useQuery<{ services: string[] }>({
    queryKey: ["/api/booking/services"],
    queryFn: () => fetch("/api/booking/services").then(r => r.json()),
  });
  const serviceOptions = servicesData?.services ?? ["Tuning", "Regulation", "Voicing", "Repair"];

  const [step, setStep] = useState<Step>(1);
  const [outOfArea, setOutOfArea] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [form, setForm] = useState<BookingPayload>({
    streetAddress: "", addressLat: "", addressLng: "", cityNeighborhood: "",
    pianoType: "", pianoMake: "", pianoModel: "", pianoRoom: "", pianoYear: "",
    serviceRequested: "", lastTuned: "",
    preferredDate: "", preferredTime: "", preferredTimes: "",
    firstName: "", lastName: "", phone: "", email: "", notes: "",
  });

  const [errors, setErrors] = useState<Partial<Record<keyof BookingPayload, string>>>({});
  const [selectedMonth, setSelectedMonth] = useState(() => {
    const d = new Date(); return { year: d.getFullYear(), month: d.getMonth() };
  });

  function setF<K extends keyof BookingPayload>(k: K, v: BookingPayload[K]) {
    setForm(f => ({ ...f, [k]: v }));
    setErrors(e => ({ ...e, [k]: undefined }));
  }

  // ── Available slots query (only fires once lat/lng are known) ────────────
  const slotsEnabled = !!(form.addressLat && form.addressLng);
  const { data: slotsData } = useQuery<SlotsResponse>({
    queryKey: ["/api/booking/available-slots", form.addressLat, form.addressLng],
    queryFn: () =>
      fetch(`/api/booking/available-slots?lat=${form.addressLat}&lng=${form.addressLng}`)
        .then(r => r.json()),
    enabled: slotsEnabled,
  });

  // Auto-advance to correct month when dates load
  useEffect(() => {
    if (slotsData?.availableDates?.length) {
      const first = slotsData.availableDates[0].date;
      const d = new Date(first + "T00:00:00");
      setSelectedMonth({ year: d.getFullYear(), month: d.getMonth() });
    }
  }, [slotsData]);

  // ── Address selection ────────────────────────────────────────────────────
  const handleAddressSelect = useCallback((address: string, lat: string, lng: string) => {
    setF("streetAddress", address);
    setF("addressLat", lat);
    setF("addressLng", lng);
    setErrors(e => ({ ...e, streetAddress: undefined }));

    if (settings?.serviceAreaEnabled && settings.serviceAreaLat && settings.serviceAreaLng && lat && lng) {
      const dist = haversineMiles(
        parseFloat(settings.serviceAreaLat), parseFloat(settings.serviceAreaLng),
        parseFloat(lat), parseFloat(lng),
      );
      setOutOfArea(dist > parseFloat(settings.serviceAreaRadiusMiles ?? "40"));
    }
  }, [settings]);

  // ── Step 1 location state ──────────────────────────────────────────────────
  // These live at the top level of BookPage (not inside StepLocation) on purpose.
  // The step "components" are rendered inline as function calls, so their hooks
  // must be declared here to keep hook order stable across renders. Previously
  // these lived inside StepLocation, which was mounted as <StepLocation /> and
  // got torn down/rebuilt on every keystroke — stealing focus from the inputs.
  const inputRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState<"address" | "map">("address");
  const [localAddress, setLocalAddress] = useState(form.streetAddress);
  const [coordLat, setCoordLat] = useState(form.addressLat);
  const [coordLng, setCoordLng] = useState(form.addressLng);

  // ── Address autocomplete via our own backend (uses the server-side Google
  //     key — no browser key, no fragile widget, full control over the dropdown)
  type AddrPrediction = { description: string; place_id: string };
  const [predictions, setPredictions] = useState<AddrPrediction[]>([]);
  const [showPredictions, setShowPredictions] = useState(false);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const suppressSearchRef = useRef(false);

  // Debounced prediction fetch as the user types.
  useEffect(() => {
    if (suppressSearchRef.current) { suppressSearchRef.current = false; return; }
    const q = localAddress.trim();
    if (q.length < 3) { setPredictions([]); setShowPredictions(false); return; }
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/places/autocomplete?input=${encodeURIComponent(q)}`);
        const d = await r.json();
        setPredictions(Array.isArray(d.predictions) ? d.predictions : []);
        setShowPredictions(true);
      } catch {
        setPredictions([]);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [localAddress]);

  // User clicked a suggestion → fetch full details (formatted address + lat/lng).
  const pickPrediction = useCallback(async (p: AddrPrediction) => {
    suppressSearchRef.current = true;
    setLocalAddress(p.description);
    setShowPredictions(false);
    setPredictions([]);
    setLoadingDetails(true);
    try {
      const r = await fetch(`/api/places/details?place_id=${encodeURIComponent(p.place_id)}`);
      const d = await r.json();
      const addr = d.formattedAddress || p.description;
      suppressSearchRef.current = true;
      setLocalAddress(addr);
      handleAddressSelect(addr, d.lat ?? "", d.lng ?? "");
    } catch {
      handleAddressSelect(p.description, "", "");
    } finally {
      setLoadingDetails(false);
    }
  }, [handleAddressSelect]);

  // ── Submit ───────────────────────────────────────────────────────────────
  const mutation = useMutation({
    mutationFn: async (data: BookingPayload) => {
      const res = await fetch("/api/booking-requests", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firstName: data.firstName,
          lastName: data.lastName,
          email: data.email,
          phone: data.phone,
          streetAddress: data.streetAddress,
          addressLat: data.addressLat,
          addressLng: data.addressLng,
          cityNeighborhood: data.cityNeighborhood,
          pianoType: data.pianoType || undefined,
          serviceRequested: data.serviceRequested,
          lastTuned: data.lastTuned || undefined,
          preferredTimes: [
            data.preferredDate && data.preferredTime
              ? `Preferred: ${data.preferredDate} at ${data.preferredTime}`
              : "",
            data.pianoMake ? `Piano: ${data.pianoMake}${data.pianoModel ? " " + data.pianoModel : ""}` : "",
            data.pianoRoom ? `Room: ${data.pianoRoom}` : "",
            data.pianoYear ? `Year: ${data.pianoYear}` : "",
            data.notes ? `Notes: ${data.notes}` : "",
          ].filter(Boolean).join(" | ") || undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.message || "Something went wrong. Please try again.");
      }
    },
    onSuccess: () => setSubmitted(true),
  });

  // ── Validation ───────────────────────────────────────────────────────────
  function validate(s: Step): boolean {
    const errs: Partial<Record<keyof BookingPayload, string>> = {};
    if (s === 1 && !form.streetAddress.trim() && !form.cityNeighborhood.trim()) {
      errs.streetAddress = "Please enter an address or neighborhood";
    }
    if (s === 2 && !form.serviceRequested) {
      errs.serviceRequested = "Please select a service";
    }
    if (s === 3 && !form.preferredDate) {
      errs.preferredDate = "Please select a date";
    }
    if (s === 4 && !form.preferredTime) {
      errs.preferredTime = "Please select a time";
    }
    if (s === 5) {
      if (!form.firstName.trim()) errs.firstName = "First name is required";
      if (!form.lastName.trim()) errs.lastName = "Last name is required";
      if (!form.email.trim()) errs.email = "Email is required";
      else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) errs.email = "Enter a valid email";
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  }

  function goNext() {
    if (!validate(step)) return;
    if (step < 5) setStep((step + 1) as Step);
    else mutation.mutate(form);
  }
  function goBack() {
    if (step > 1) setStep((step - 1) as Step);
  }

  // ── Step sub-labels for sidebar ──────────────────────────────────────────
  const stepSubs: Partial<Record<Step, string>> = {
    1: form.streetAddress ? form.streetAddress.split(",").slice(0, 2).join(",") : undefined,
    2: form.pianoType && form.serviceRequested
      ? `${form.pianoType} · ${form.serviceRequested}`
      : form.serviceRequested || undefined,
    3: form.preferredDate || undefined,
    4: form.preferredTime || undefined,
  };

  // ── Calendar helpers ─────────────────────────────────────────────────────
  const availableByDate: Record<string, AvailableDate> = {};
  (slotsData?.availableDates ?? []).forEach(d => { availableByDate[d.date] = d; });

  function calendarDays(year: number, month: number): (string | null)[] {
    const first = new Date(year, month, 1).getDay(); // 0=Sun
    const days: (string | null)[] = Array(first).fill(null);
    const total = new Date(year, month + 1, 0).getDate();
    for (let i = 1; i <= total; i++) {
      days.push(`${year}-${String(month + 1).padStart(2, "0")}-${String(i).padStart(2, "0")}`);
    }
    return days;
  }

  const monthLabel = new Date(selectedMonth.year, selectedMonth.month, 1)
    .toLocaleDateString("en-US", { month: "long", year: "numeric" });

  function canGoNextMonth() {
    const cur = new Date(selectedMonth.year, selectedMonth.month + 1, 1);
    const limit = new Date(); limit.setMonth(limit.getMonth() + 12);
    return cur <= limit;
  }

  // ── Confirmation ─────────────────────────────────────────────────────────
  if (submitted) {
    const msg = settings?.reservationCompleteMessage ||
      "John will review your request and reach out shortly to confirm your appointment time.";
    if (settings && (settings as any).completionRedirectUrl) {
      window.location.href = (settings as any).completionRedirectUrl;
      return null;
    }
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md text-center space-y-5">
          <div className="flex justify-center">
            <div className="bg-green-100 rounded-full p-5">
              <CheckCircle2 className="h-10 w-10 text-green-600" />
            </div>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Request Received!</h1>
          <p className="text-slate-600 leading-relaxed">
            Thanks, <strong>{form.firstName}</strong>! {msg}
          </p>
          {form.preferredDate && form.preferredTime && (
            <div className="bg-white rounded-xl border border-slate-200 p-4 text-sm text-left space-y-1">
              <p className="font-semibold text-slate-700 mb-1">Your requested appointment</p>
              <p className="text-slate-600">📅 {form.preferredDate}</p>
              <p className="text-slate-600">🕐 {form.preferredTime}</p>
              <p className="text-slate-600">📍 {form.streetAddress || form.cityNeighborhood}</p>
              <p className="text-slate-600">🎹 {form.serviceRequested}</p>
            </div>
          )}
          <div className="bg-white rounded-xl border border-slate-200 p-4 text-left text-sm text-slate-500 space-y-1">
            <p className="font-medium text-slate-700 mb-1">What happens next?</p>
            <p>• John reviews your request, usually within 1 business day.</p>
            <p>• He'll contact you by email or phone to confirm the time.</p>
            <p>• You'll get final confirmation once it's on his calendar.</p>
          </div>
          <p className="text-xs text-slate-400">
            Questions? Email{" "}
            <a href="mailto:j.willis.keys@gmail.com" className="underline">j.willis.keys@gmail.com</a>
          </p>
        </div>
      </div>
    );
  }

  // ══════════════════════════════════════════════════════════════════════════
  // STEP CONTENT
  // ══════════════════════════════════════════════════════════════════════════

  // ── Step 1: Location ─────────────────────────────────────────────────────
  function StepLocation() {
    // Hooks for this step are declared at the top level of BookPage (see above),
    // because this is rendered inline via StepLocation() rather than as a mounted
    // component. Keep this function hook-free.
    const verified = !!(form.addressLat && form.addressLng);
    const mapSrc = verified
      ? `https://www.openstreetmap.org/export/embed.html?bbox=${parseFloat(form.addressLng) - 0.008},${parseFloat(form.addressLat) - 0.005},${parseFloat(form.addressLng) + 0.008},${parseFloat(form.addressLat) + 0.005}&layer=mapnik&marker=${form.addressLat},${form.addressLng}`
      : null;

    return (
      <div className="space-y-5">
        <h2 className="text-xl font-bold text-slate-900">Find your location</h2>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-200">
          {(["address", "map"] as const).map(t => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                tab === t
                  ? "border-slate-900 text-slate-900"
                  : "border-transparent text-slate-500 hover:text-slate-700"
              }`}
            >
              {t === "address" ? "By Street Address" : "On a Map"}
            </button>
          ))}
        </div>

        {tab === "address" ? (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">
              Please enter your street address below or select a different location type above.
            </p>
            <div className="relative">
              <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 pointer-events-none z-10" />
              <input
                ref={inputRef}
                type="text"
                autoComplete="off"
                placeholder="Start typing your address…"
                value={localAddress}
                onChange={e => {
                  const v = e.target.value;
                  setLocalAddress(v);
                  setF("streetAddress", v);
                  // Editing the text invalidates any previously-picked coordinates;
                  // the visitor must choose a suggestion again to set lat/lng.
                  if (form.addressLat || form.addressLng) {
                    setF("addressLat", "");
                    setF("addressLng", "");
                  }
                }}
                onFocus={() => { if (predictions.length) setShowPredictions(true); }}
                onBlur={() => { setTimeout(() => setShowPredictions(false), 150); }}
                className={`w-full h-12 pl-9 pr-4 border rounded-lg text-base bg-white focus:outline-none focus:ring-2 focus:ring-slate-400 ${
                  errors.streetAddress ? "border-red-400" : "border-slate-300"
                }`}
              />
              {showPredictions && predictions.length > 0 && (
                <ul className="absolute z-20 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden max-h-72 overflow-y-auto">
                  {predictions.map(p => (
                    <li key={p.place_id}>
                      <button
                        type="button"
                        // onMouseDown fires before the input's onBlur, so the click registers
                        onMouseDown={e => { e.preventDefault(); pickPrediction(p); }}
                        className="w-full text-left px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-100 flex items-start gap-2"
                      >
                        <MapPin className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                        <span>{p.description}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {loadingDetails && (
                <p className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400">Loading…</p>
              )}
            </div>
            {errors.streetAddress && <p className="text-xs text-red-500">{errors.streetAddress}</p>}
            <p className="text-xs text-slate-400 flex items-center gap-1">
              <MapPin className="h-3 w-3" /> Having trouble? Email{" "}
              <a href="mailto:j.willis.keys@gmail.com" className="underline">j.willis.keys@gmail.com</a>
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-slate-500">Enter coordinates directly, or{" "}
              <a
                href="https://maps.google.com"
                target="_blank"
                rel="noopener noreferrer"
                className="underline text-slate-700"
              >
                open Google Maps
              </a>
              , right-click your location, and copy the coordinates.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-slate-600 mb-1 block">Latitude</Label>
                <Input
                  placeholder="e.g. 42.3601"
                  value={coordLat}
                  onChange={e => setCoordLat(e.target.value)}
                  className="h-11"
                />
              </div>
              <div>
                <Label className="text-xs text-slate-600 mb-1 block">Longitude</Label>
                <Input
                  placeholder="e.g. -71.0589"
                  value={coordLng}
                  onChange={e => setCoordLng(e.target.value)}
                  className="h-11"
                />
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                if (coordLat && coordLng) {
                  handleAddressSelect(`${coordLat}, ${coordLng}`, coordLat, coordLng);
                  setF("addressLat", coordLat);
                  setF("addressLng", coordLng);
                }
              }}
            >
              Confirm Coordinates
            </Button>
          </div>
        )}

        {/* Out-of-area warning */}
        {outOfArea && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 flex gap-3">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-amber-800">
              {settings?.outsideServiceAreaMessage ||
                "Your address appears to be outside our normal service area. Please contact us directly to discuss options."}
            </p>
          </div>
        )}

        {/* Utah routing notice */}
        {slotsData?.isUtah && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 flex gap-3">
            <CalendarDays className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />
            <div className="text-sm text-blue-800">
              <p className="font-semibold">Utah / Salt Lake City detected</p>
              <p className="mt-0.5">
                {slotsData.message ||
                  `John visits Salt Lake City periodically. Your available dates will reflect his upcoming Utah trip${slotsData.tripName ? ` (${slotsData.tripName})` : ""}.`}
              </p>
            </div>
          </div>
        )}

        {/* Address verification card */}
        {verified && !slotsData?.message && (
          <div className="rounded-xl border border-slate-200 overflow-hidden">
            <div className="p-4 bg-white flex items-start gap-3">
              <div className="w-9 h-9 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
                <CheckCircle2 className="h-5 w-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-semibold text-slate-800 mb-0.5">Verify Your Street Address</p>
                <p className="text-sm text-slate-700">{form.streetAddress}</p>
                <p className="text-xs text-slate-400 mt-1">
                  GPS coordinates: {parseFloat(form.addressLat).toFixed(6)}, {parseFloat(form.addressLng).toFixed(6)}
                </p>
              </div>
            </div>
            {mapSrc && (
              <iframe
                src={mapSrc}
                title="Location map"
                className="w-full h-44 border-t border-slate-100"
                style={{ pointerEvents: "none" }}
              />
            )}
          </div>
        )}

        {/* Optional neighborhood fallback */}
        {!verified && (
          <div className="space-y-1.5 pt-1 border-t border-slate-100">
            <Label className="text-sm text-slate-600">
              Or just enter your city / neighborhood <span className="text-slate-400 font-normal">(optional)</span>
            </Label>
            <Input
              placeholder="e.g. Somerville, Cambridge, Brookline"
              value={form.cityNeighborhood}
              onChange={e => setF("cityNeighborhood", e.target.value)}
              className="h-11"
            />
          </div>
        )}
      </div>
    );
  }

  // ── Step 2: Piano & Service ───────────────────────────────────────────────
  function StepPianoService() {
    const PIANO_TYPES: PianoType[] = ["Grand", "Upright", "Unknown"];
    const LAST_TUNED = [
      "Within the last 6 months", "6–12 months ago", "1–2 years ago",
      "2–5 years ago", "More than 5 years ago", "Never / Unknown",
    ];

    return (
      <div className="space-y-6">
        {/* Piano type */}
        <div>
          <h2 className="text-xl font-bold text-slate-900 mb-1">About Your Piano</h2>
          <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Piano type <span className="font-normal normal-case text-slate-400">— optional</span></p>
          <div className="grid grid-cols-3 gap-3">
            {PIANO_TYPES.map(type => {
              const selected = form.pianoType === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setF("pianoType", selected ? "" : type)}
                  className={`relative flex flex-col items-center justify-center gap-2 py-4 px-2 rounded-xl border-2 transition-all ${
                    selected
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                  }`}
                >
                  {selected && (
                    <div className="absolute top-2 right-2 w-5 h-5 bg-white rounded-full flex items-center justify-center">
                      <CheckCircle2 className="h-4 w-4 text-slate-900" />
                    </div>
                  )}
                  <Piano className={`h-8 w-8 ${selected ? "text-white" : "text-slate-400"}`} />
                  <span className="text-sm font-medium">{type}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Optional piano details */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label className="text-xs text-slate-500 mb-1 block">Make <span className="text-slate-400">optional</span></Label>
            <Input placeholder="e.g. Steinway" value={form.pianoMake} onChange={e => setF("pianoMake", e.target.value)} className="h-10 text-sm" />
          </div>
          <div>
            <Label className="text-xs text-slate-500 mb-1 block">Model <span className="text-slate-400">optional</span></Label>
            <Input placeholder="e.g. Model M" value={form.pianoModel} onChange={e => setF("pianoModel", e.target.value)} className="h-10 text-sm" />
          </div>
          <div>
            <Label className="text-xs text-slate-500 mb-1 block">Room / Location <span className="text-slate-400">optional</span></Label>
            <Input placeholder="e.g. Living Room" value={form.pianoRoom} onChange={e => setF("pianoRoom", e.target.value)} className="h-10 text-sm" />
          </div>
          <div>
            <Label className="text-xs text-slate-500 mb-1 block">Year <span className="text-slate-400">optional</span></Label>
            <Input placeholder="e.g. 1985" value={form.pianoYear} onChange={e => setF("pianoYear", e.target.value)} className="h-10 text-sm" />
          </div>
        </div>

        {/* Service selection */}
        <div className="border-t border-slate-100 pt-5">
          <h3 className="text-base font-bold text-slate-900 mb-3">Choose Service</h3>
          <div className="grid grid-cols-2 gap-2">
            {serviceOptions.map(svc => {
              const selected = form.serviceRequested === svc;
              return (
                <button
                  key={svc}
                  type="button"
                  onClick={() => setF("serviceRequested", selected ? "" : svc)}
                  className={`flex items-center justify-between gap-2 px-4 py-3 rounded-xl border-2 text-sm font-semibold transition-all text-left ${
                    selected
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                  }`}
                >
                  <span>{svc}</span>
                  {selected && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                </button>
              );
            })}
          </div>
          {errors.serviceRequested && <p className="text-xs text-red-500 mt-2">{errors.serviceRequested}</p>}
        </div>

        {/* Last tuned */}
        <div>
          <Label className="text-sm font-medium text-slate-700 mb-1.5 block">When was it last tuned? <span className="font-normal text-slate-400">optional</span></Label>
          <div className="relative">
            <select
              value={form.lastTuned}
              onChange={e => setF("lastTuned", e.target.value)}
              className="w-full h-11 pl-3 pr-8 border border-slate-300 rounded-lg bg-white text-sm text-slate-700 appearance-none focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              <option value="">Select one…</option>
              {LAST_TUNED.map(o => <option key={o} value={o}>{o}</option>)}
            </select>
            <ChevronRight className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400 rotate-90" />
          </div>
        </div>
      </div>
    );
  }

  // ── Step 3: Select a Date ─────────────────────────────────────────────────
  function StepDate() {
    const days = calendarDays(selectedMonth.year, selectedMonth.month);
    const today = new Date().toISOString().split("T")[0];

    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-900">Select a Date</h2>

        {slotsData?.isUtah && (
          <div className="rounded-lg bg-blue-50 border border-blue-200 px-3 py-2 text-xs text-blue-700 font-medium">
            Showing dates for John's Utah visit
            {slotsData.tripName ? ` (${slotsData.tripName})` : ""}.
          </div>
        )}

        {!slotsEnabled && (
          <div className="text-sm text-slate-500 bg-slate-50 rounded-lg p-4 text-center">
            Enter your address in Step 1 to see available dates.
          </div>
        )}

        {slotsData?.message && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
            {slotsData.message}
          </div>
        )}

        {slotsEnabled && !slotsData?.message && (
          <>
            {/* Legend */}
            <div className="flex gap-4 text-xs text-slate-500 flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="w-4 h-4 rounded-full bg-slate-900 inline-block" /> Available
              </span>
              <span className="flex items-center gap-1.5">
                <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-400" /> Recommended — efficient routing
              </span>
            </div>

            {/* Month nav */}
            <div className="flex items-center justify-between">
              <button
                type="button"
                onClick={() => setSelectedMonth(m => {
                  const d = new Date(m.year, m.month - 1, 1);
                  return { year: d.getFullYear(), month: d.getMonth() };
                })}
                className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <ChevronLeft className="h-5 w-5 text-slate-500" />
              </button>
              <p className="font-semibold text-slate-800">{monthLabel}</p>
              <button
                type="button"
                onClick={() => canGoNextMonth() && setSelectedMonth(m => {
                  const d = new Date(m.year, m.month + 1, 1);
                  return { year: d.getFullYear(), month: d.getMonth() };
                })}
                className={`p-1.5 rounded-lg transition-colors ${canGoNextMonth() ? "hover:bg-slate-100" : "opacity-30"}`}
              >
                <ChevronRight className="h-5 w-5 text-slate-500" />
              </button>
            </div>

            {/* Day-of-week headers */}
            <div className="grid grid-cols-7 gap-1 text-center mb-1">
              {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map(d => (
                <div key={d} className="text-xs font-semibold text-slate-400">{d}</div>
              ))}
            </div>

            {/* Calendar grid */}
            <div className="grid grid-cols-7 gap-1">
              {days.map((dateStr, i) => {
                if (!dateStr) return <div key={`blank-${i}`} />;
                const avail = availableByDate[dateStr];
                const isPast = dateStr < today;
                const isSelected = form.preferredDate === dateStr;
                const dayNum = parseInt(dateStr.split("-")[2], 10);

                if (isPast || !avail) {
                  return (
                    <div
                      key={dateStr}
                      className="aspect-square flex items-center justify-center rounded-lg text-sm text-slate-300 select-none"
                    >
                      {dayNum}
                    </div>
                  );
                }

                return (
                  <button
                    key={dateStr}
                    type="button"
                    onClick={() => { setF("preferredDate", dateStr); setF("preferredTime", ""); }}
                    className={`relative aspect-square flex items-center justify-center rounded-lg text-sm font-semibold transition-all ${
                      isSelected
                        ? "bg-slate-900 text-white"
                        : "bg-slate-100 text-slate-800 hover:bg-slate-200"
                    }`}
                  >
                    {dayNum}
                    {avail.isRecommended && !isSelected && (
                      <Star className="absolute top-0.5 right-0.5 h-2.5 w-2.5 text-amber-400 fill-amber-400" />
                    )}
                    {avail.isTripDate && !isSelected && (
                      <span className="absolute bottom-0.5 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full bg-blue-500" />
                    )}
                  </button>
                );
              })}
            </div>

            {form.preferredDate && (
              <p className="text-sm text-center text-slate-600">
                Selected: <strong>{availableByDate[form.preferredDate]?.dayLabel ?? form.preferredDate}</strong>
              </p>
            )}
            {errors.preferredDate && <p className="text-xs text-red-500 text-center">{errors.preferredDate}</p>}
          </>
        )}
      </div>
    );
  }

  // ── Step 4: Select a Time ─────────────────────────────────────────────────
  function StepTime() {
    const selected = availableByDate[form.preferredDate];
    const slots = selected?.slots ?? [];

    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-900">Select a Time</h2>
        {form.preferredDate && (
          <p className="text-sm text-slate-600">
            Available times for <strong>{selected?.dayLabel ?? form.preferredDate}</strong>
          </p>
        )}

        {slots.length === 0 ? (
          <div className="text-sm text-slate-500 bg-slate-50 rounded-lg p-6 text-center">
            No times available for this date. Go back and pick a different date.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {slots.map(slot => {
              const isSelected = form.preferredTime === slot;
              const isRec = selected?.isRecommended;
              return (
                <button
                  key={slot}
                  type="button"
                  onClick={() => setF("preferredTime", slot)}
                  className={`flex items-center justify-between gap-2 px-4 py-3 rounded-xl border-2 text-sm font-semibold transition-all ${
                    isSelected
                      ? "border-slate-900 bg-slate-900 text-white"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-400"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <Clock className="h-3.5 w-3.5 opacity-60" /> {slot}
                  </span>
                  {isRec && !isSelected && (
                    <span className="text-xs bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded-full font-medium">
                      ★ Suggested
                    </span>
                  )}
                  {isSelected && <CheckCircle2 className="h-4 w-4 shrink-0" />}
                </button>
              );
            })}
          </div>
        )}

        {errors.preferredTime && <p className="text-xs text-red-500">{errors.preferredTime}</p>}

        <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-xs text-slate-500 space-y-1">
          <p className="font-medium text-slate-600">How it works</p>
          <p>• Suggested times cluster with nearby existing appointments for efficient routing.</p>
          <p>• No slot is auto-confirmed — John will reach out to confirm within 1 business day.</p>
        </div>
      </div>
    );
  }

  // ── Step 5: Contact Info ──────────────────────────────────────────────────
  function StepContact() {
    return (
      <div className="space-y-4">
        <h2 className="text-xl font-bold text-slate-900">Primary Contact Information</h2>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <Label htmlFor="firstName" className="text-sm text-slate-600 mb-1.5 block">
              First name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="firstName"
              autoComplete="given-name"
              value={form.firstName}
              onChange={e => setF("firstName", e.target.value)}
              className={`h-11 text-base ${errors.firstName ? "border-red-400" : ""}`}
            />
            {errors.firstName && <p className="text-xs text-red-500 mt-1">{errors.firstName}</p>}
          </div>
          <div>
            <Label htmlFor="lastName" className="text-sm text-slate-600 mb-1.5 block">
              Last name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="lastName"
              autoComplete="family-name"
              value={form.lastName}
              onChange={e => setF("lastName", e.target.value)}
              className={`h-11 text-base ${errors.lastName ? "border-red-400" : ""}`}
            />
            {errors.lastName && <p className="text-xs text-red-500 mt-1">{errors.lastName}</p>}
          </div>
        </div>

        <div>
          <Label htmlFor="phone" className="text-sm text-slate-600 mb-1.5 block">Phone number</Label>
          <PhoneInput
            id="phone"
            value={form.phone}
            onChange={v => setF("phone", v)}
            className="h-11 text-base font-mono"
          />
        </div>

        <div>
          <Label htmlFor="email" className="text-sm text-slate-600 mb-1.5 block">
            Email address <span className="text-red-500">*</span>
          </Label>
          <Input
            id="email"
            type="email"
            inputMode="email"
            autoComplete="email"
            value={form.email}
            onChange={e => setF("email", e.target.value)}
            className={`h-11 text-base ${errors.email ? "border-red-400" : ""}`}
          />
          {errors.email && <p className="text-xs text-red-500 mt-1">{errors.email}</p>}
        </div>

        <div>
          <Label htmlFor="notes" className="text-sm text-slate-600 mb-1.5 block">
            Notes or special requests <span className="text-slate-400 font-normal">optional</span>
          </Label>
          <Textarea
            id="notes"
            rows={3}
            placeholder="Any specific concerns about the piano, access instructions, etc."
            value={form.notes}
            onChange={e => setF("notes", e.target.value)}
            className="resize-none text-base"
          />
        </div>

        {/* Legal */}
        {(settings?.privacyPolicyUrl || settings?.termsOfServiceUrl) && (
          <p className="text-xs text-slate-400">
            By submitting you agree to our{" "}
            {settings.termsOfServiceUrl && (
              <a href={settings.termsOfServiceUrl} target="_blank" rel="noopener noreferrer" className="underline">Terms of Service</a>
            )}
            {settings.termsOfServiceUrl && settings.privacyPolicyUrl && " and "}
            {settings.privacyPolicyUrl && (
              <a href={settings.privacyPolicyUrl} target="_blank" rel="noopener noreferrer" className="underline">Privacy Policy</a>
            )}.
          </p>
        )}
      </div>
    );
  }

  // ── Layout ────────────────────────────────────────────────────────────────

  const welcomeMsg = settings?.welcomeMessage;

  return (
    <div className={`min-h-screen bg-slate-100 ${isEmbed ? "bg-white" : ""}`}>
      <div className="max-w-3xl mx-auto px-4 py-6 sm:py-10">

        {/* Header (hidden in embed) */}
        {!isEmbed && (
          <div className="text-center mb-7 space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-slate-900 rounded-2xl mb-2">
              <Piano className="h-6 w-6 text-white" />
            </div>
            <h1 className="text-2xl font-bold text-slate-900">Book an Appointment</h1>
            <p className="text-slate-500 text-sm max-w-sm mx-auto leading-relaxed">
              {welcomeMsg || "Fill out the form below and John Willis will contact you to confirm your appointment."}
            </p>
          </div>
        )}

        <div className="flex gap-5 items-start">
          {/* Sidebar nav */}
          <StepNav current={step} stepSubs={stepSubs} onBack={goBack} />

          {/* Content card */}
          <div className="flex-1 min-w-0">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 sm:p-6">
              {step === 1 && StepLocation()}
              {step === 2 && StepPianoService()}
              {step === 3 && StepDate()}
              {step === 4 && StepTime()}
              {step === 5 && StepContact()}
            </div>

            {/* Error from server */}
            {mutation.isError && (
              <p className="mt-3 text-sm text-red-600 text-center">
                {(mutation.error as Error).message}
              </p>
            )}

            {/* Action buttons */}
            <div className="flex items-center justify-between mt-4 gap-3">
              {step > 1 ? (
                <button
                  type="button"
                  onClick={goBack}
                  className="hidden sm:flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800 transition-colors px-3 py-2 rounded-lg hover:bg-slate-100"
                >
                  <ChevronLeft className="h-4 w-4" /> Back
                </button>
              ) : <div />}

              <Button
                size="lg"
                onClick={goNext}
                disabled={mutation.isPending}
                className="flex-1 sm:flex-none sm:min-w-40 h-12 text-base font-semibold rounded-xl"
              >
                {mutation.isPending
                  ? "Sending…"
                  : step === 5
                  ? "Reserve My Appointment"
                  : <span className="flex items-center gap-2">Next <ChevronRight className="h-4 w-4" /></span>
                }
              </Button>
            </div>

            <p className="text-center text-xs text-slate-400 mt-3">
              Your info is only shared with John Willis, your piano technician.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
