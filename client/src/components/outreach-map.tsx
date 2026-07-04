/**
 * outreach-map.tsx — Leaflet map of outreach leads (loaded from CDN, no npm dep).
 *
 * Pins are colored by status bucket (same buckets as the list badges).
 * Leads without lat/lng don't appear until geocoded via the "Locate pins" button,
 * which calls POST /api/outreach-leads/geocode-missing (server-side Google key).
 */
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { MapPin, Loader2 } from "lucide-react";
import type { OutreachLead } from "@shared/schema";

const LEAFLET_JS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
const LEAFLET_CSS = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";

// Home base: Somerville, MA
const HOME: [number, number] = [42.3876, -71.0995];

function statusHex(status: string | null | undefined): string {
  const s = (status || "").toLowerCase();
  if (s.includes("client")) return "#059669"; // emerald-600
  if ((s.includes("interested") && !s.includes("not")) || s.includes("conversation")) return "#22c55e"; // green-500
  if (s.includes("callback")) return "#3b82f6"; // blue-500
  if (s.includes("voicemail") || s.includes("left phone") || s.includes("emailed")) return "#f59e0b"; // amber-500
  if (s.includes("not interested")) return "#f43f5e"; // rose-500
  if (s.includes("not in service") || s.includes("disconnect")) return "#9ca3af"; // gray-400
  return "#6b7280"; // gray-500 — not contacted
}

let leafletLoading: Promise<void> | null = null;
function loadLeaflet(): Promise<void> {
  if ((window as any).L) return Promise.resolve();
  if (leafletLoading) return leafletLoading;
  leafletLoading = new Promise((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = LEAFLET_CSS;
    document.head.appendChild(css);
    const script = document.createElement("script");
    script.src = LEAFLET_JS;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Failed to load map library"));
    document.head.appendChild(script);
  });
  return leafletLoading;
}

export function OutreachMap({
  leads,
  onGeocodeMissing,
  isGeocoding,
}: {
  leads: OutreachLead[];
  onGeocodeMissing: () => void;
  isGeocoding: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<any>(null);
  const markersRef = useRef<any>(null);
  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const missing = leads.filter((l) => !l.lat || !l.lng).length;

  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then(() => !cancelled && setReady(true))
      .catch(() => !cancelled && setLoadError(true));
    return () => {
      cancelled = true;
    };
  }, []);

  // Init map once
  useEffect(() => {
    if (!ready || !containerRef.current || mapRef.current) return;
    const L = (window as any).L;
    const map = L.map(containerRef.current).setView(HOME, 12);
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);
    // Home marker
    L.circleMarker(HOME, {
      radius: 7,
      color: "#7c3aed",
      fillColor: "#7c3aed",
      fillOpacity: 0.9,
    })
      .addTo(map)
      .bindPopup("<b>Home base</b><br/>Somerville, MA");
    markersRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
  }, [ready]);

  // Redraw pins whenever the filtered leads change
  useEffect(() => {
    if (!ready || !mapRef.current || !markersRef.current) return;
    const L = (window as any).L;
    markersRef.current.clearLayers();
    for (const l of leads) {
      const lat = parseFloat(l.lat || "");
      const lng = parseFloat(l.lng || "");
      if (isNaN(lat) || isNaN(lng)) continue;
      const color = statusHex(l.status);
      const phone = l.phone ? `<br/><a href="tel:${l.phone.replace(/[^\d+]/g, "")}">${l.phone}</a>` : "";
      const email = l.email ? `<br/><a href="mailto:${l.email}">${l.email}</a>` : "";
      const site = l.website ? `<br/><a href="${l.website}" target="_blank" rel="noreferrer">Website</a>` : "";
      L.circleMarker([lat, lng], {
        radius: 8,
        color,
        weight: 2,
        fillColor: color,
        fillOpacity: 0.75,
      })
        .bindPopup(
          `<b>${l.name}</b><br/><span style="color:#666">${l.city ?? ""} · ${l.status ?? "Not contacted"}</span>${phone}${email}${site}`,
        )
        .addTo(markersRef.current);
    }
  }, [ready, leads]);

  if (loadError) {
    return (
      <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
        Couldn't load the map library. Check your internet connection and reload.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
          <LegendDot color="#6b7280" label="Not contacted" />
          <LegendDot color="#f59e0b" label="In progress" />
          <LegendDot color="#22c55e" label="Warm" />
          <LegendDot color="#3b82f6" label="Callback" />
          <LegendDot color="#059669" label="Client" />
          <LegendDot color="#f43f5e" label="Not interested" />
          <LegendDot color="#7c3aed" label="Home" />
        </div>
        {missing > 0 && (
          <Button
            variant="outline"
            size="sm"
            onClick={onGeocodeMissing}
            disabled={isGeocoding}
            data-testid="button-geocode-missing"
          >
            {isGeocoding ? (
              <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
            ) : (
              <MapPin className="h-3.5 w-3.5 mr-1" />
            )}
            {isGeocoding ? "Locating…" : `Locate ${missing} unpinned lead${missing === 1 ? "" : "s"}`}
          </Button>
        )}
      </div>
      <div
        ref={containerRef}
        className="h-[520px] w-full rounded-lg border z-0"
        data-testid="outreach-map"
      />
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1">
      <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}
