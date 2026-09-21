/**
 * InspectionPdfDocument — rendered off-screen and captured by html2pdf.js.
 * All styles must be inline; no Tailwind classes — html2canvas won't see them.
 */

import type { Inspection, Customer, Piano } from "@shared/schema";
import { clientName, clientSearchText } from "@shared/client-name";

// ── Business constants (mirror invoice-detail.tsx) ───────────────────────────
const CO_NAME    = "John Willis Piano";
const CO_LINE2   = "Registered Piano Technician";
const CO_ADDR    = "14 Murdock St. APT #3-4 · Somerville, MA 02145";
const CO_PHONE   = "(435) 275-5959";
const CO_EMAIL   = "j.willis.keys@gmail.com";

// ── Local types (duplicated from inspections.tsx to keep component self-contained)
interface ChecklistItem {
  item: string;
  status: "ok" | "needs_attention" | "critical" | "na";
  notes: string;
}
interface RecommendedService {
  service: string;
  estimatedCost: string;
}

function parseChecklist(raw: string | null | undefined): ChecklistItem[] {
  if (!raw) return [];
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; }
  catch { return []; }
}
function parseRecommended(raw: string | null | undefined): RecommendedService[] {
  if (!raw) return [];
  try { const p = JSON.parse(raw); return Array.isArray(p) ? p : []; }
  catch { return []; }
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = {
  ok:               "✓  OK",
  needs_attention:  "⚠  Needs Attention",
  critical:         "✗  Critical",
  na:               "—  N/A",
};
const STATUS_COLOR: Record<string, string> = {
  ok:               "#16a34a",
  needs_attention:  "#b45309",
  critical:         "#dc2626",
  na:               "#9ca3af",
};
// ── Divider ──────────────────────────────────────────────────────────────────
const HR = <div style={{ height: 1, background: "#d1d5db", margin: "18px 0" }} />;
const SECTION_TITLE = (text: string) => (
  <div style={{
    fontSize: 11, fontWeight: "bold", textTransform: "uppercase" as const,
    letterSpacing: "0.8px", color: "#374151",
    borderBottom: "1.5px solid #374151", paddingBottom: 5, marginBottom: 12,
  }}>
    {text}
  </div>
);

// ── Main component ───────────────────────────────────────────────────────────
export interface InspectionPdfDocumentProps {
  inspection: Inspection;
  customer: Customer | undefined;
  piano: Piano | undefined;
}

export function InspectionPdfDocument({ inspection, customer, piano }: InspectionPdfDocumentProps) {
  const checklist   = parseChecklist(inspection.checklistItems);
  const recommended = parseRecommended(inspection.recommendedServices).filter(r => r.service.trim());
  const isEstimate  = inspection.type === "estimate";

  const pianoLabel = [
    piano?.year,
    piano?.make,
    piano?.model,
    piano?.pianoType,
  ].filter(Boolean).join(" ");

  return (
    <div style={{
      fontFamily: "Georgia, 'Times New Roman', serif",
      color: "#111827",
      background: "#ffffff",
      width: "100%",
      fontSize: 11,
      lineHeight: 1.55,
    }}>

      {/* ── Header: company name left | contact details right ───────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 14 }}>

        {/* Left: company name + tagline */}
        <div>
          <div style={{ fontSize: 20, fontWeight: "bold", letterSpacing: "-0.3px", color: "#111827" }}>
            {CO_NAME}
          </div>
          <div style={{ fontSize: 10, color: "#6b7280", marginTop: 3 }}>{CO_LINE2}</div>
        </div>

        {/* Right: phone + email */}
        <div style={{ textAlign: "right" }}>
          <div style={{ fontSize: 10, color: "#6b7280" }}>{CO_PHONE}</div>
          <div style={{ fontSize: 10, color: "#6b7280" }}>{CO_EMAIL}</div>
        </div>
      </div>

      {/* Thick rule */}
      <div style={{ height: 2, background: "#111827", marginBottom: 10 }} />

      {/* Document type + date row */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 18 }}>
        <div style={{ fontSize: 20, fontWeight: "bold", letterSpacing: "-0.4px", color: "#111827" }}>
          {isEstimate ? "Estimate" : "Inspection Report"}
        </div>
        <div style={{ textAlign: "right", fontSize: 10, color: "#6b7280" }}>
          <div>
            <span style={{ color: "#9ca3af" }}>Date: </span>
            <strong style={{ color: "#374151" }}>{inspection.inspectionDate}</strong>
          </div>
        </div>
      </div>

      {/* ── Info blocks: Prepared For / Piano / Condition ─────────────────── */}
      <div style={{ display: "flex", gap: 20, marginBottom: 6 }}>

        {/* Prepared For */}
        {customer && (
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, fontWeight: "bold", textTransform: "uppercase" as const, letterSpacing: "0.9px", color: "#9ca3af", marginBottom: 6 }}>
              Prepared For
            </div>
            <div style={{ fontSize: 12, fontWeight: "bold" }}>{clientName(customer)}</div>
            {customer.phone && (
              <div style={{ fontSize: 10, color: "#4b5563", marginTop: 2 }}>{customer.phone}</div>
            )}
            {customer.email && (
              <div style={{ fontSize: 10, color: "#4b5563" }}>{customer.email}</div>
            )}
            {(customer.city || customer.state) && (
              <div style={{ fontSize: 10, color: "#4b5563" }}>
                {[customer.city, customer.state].filter(Boolean).join(", ")}
              </div>
            )}
          </div>
        )}

        {/* Piano */}
        {piano && (
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 9, fontWeight: "bold", textTransform: "uppercase" as const, letterSpacing: "0.9px", color: "#9ca3af", marginBottom: 6 }}>
              Piano
            </div>
            {pianoLabel && (
              <div style={{ fontSize: 12, fontWeight: "bold" }}>{pianoLabel}</div>
            )}
            {piano.serialNumber && (
              <div style={{ fontSize: 10, color: "#4b5563", marginTop: 2 }}>Serial: {piano.serialNumber}</div>
            )}
            {piano.location && (
              <div style={{ fontSize: 10, color: "#4b5563" }}>Location: {piano.location}</div>
            )}
          </div>
        )}

      </div>

      {HR}

      {/* ── Checklist ─────────────────────────────────────────────────────── */}
      {checklist.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          {SECTION_TITLE(isEstimate ? "Estimate" : "Inspection")}

          {checklist.map((item, i) => {
            const color = STATUS_COLOR[item.status] ?? "#9ca3af";
            const label = STATUS_LABEL[item.status] ?? item.status;
            const isNA  = item.status === "na";
            return (
              <div key={i} style={{
                paddingBottom: 8, marginBottom: 8,
                borderBottom: "1px solid #f3f4f6",
                opacity: isNA ? 0.55 : 1,
              }}>
                {/* Row: item name (left) | status (right) */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontSize: 11, fontWeight: "600", color: "#111827", flex: 1 }}>
                    {item.item.split(/\s[—–-]\s/)[0]}
                  </span>
                  <span style={{ fontSize: 10, fontWeight: "bold", color, whiteSpace: "nowrap" as const, flexShrink: 0 }}>
                    {label}
                  </span>
                </div>
                {/* Notes */}
                {item.notes && (
                  <div style={{ fontSize: 10, color: "#6b7280", marginTop: 3, paddingLeft: 8, fontStyle: "italic" as const }}>
                    {item.notes}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Findings ──────────────────────────────────────────────────────── */}
      {inspection.findings && (
        <div style={{ marginBottom: 20 }}>
          {SECTION_TITLE("Findings & Technician Notes")}
          <div style={{ fontSize: 11, color: "#374151", lineHeight: 1.7, whiteSpace: "pre-wrap" as const }}>
            {inspection.findings}
          </div>
        </div>
      )}

      {/* ── Recommended Services ──────────────────────────────────────────── */}
      {recommended.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          {SECTION_TITLE("Recommended Services")}
          {recommended.map((r, i) => (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: 8, marginBottom: 7 }}>
              <span style={{ color: "#9ca3af", fontSize: 13, lineHeight: 1, marginTop: 1, flexShrink: 0 }}>•</span>
              <span style={{ fontSize: 11, color: "#374151", lineHeight: 1.55 }}>{r.service}</span>
            </div>
          ))}
        </div>
      )}

      {/* ── Summary / Notes for Client ────────────────────────────────────── */}
      {inspection.summary && (
        <div style={{ marginBottom: 20 }}>
          {SECTION_TITLE("Notes for Client")}
          <div style={{ fontSize: 11, color: "#374151", lineHeight: 1.7, whiteSpace: "pre-wrap" as const }}>
            {inspection.summary}
          </div>
        </div>
      )}

      {/* ── Photos ───────────────────────────────────────────────────────── */}
      {inspection.photos && inspection.photos.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          {SECTION_TITLE("Photos")}
          <div style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: 10,
          }}>
            {inspection.photos.map((url, i) => (
              <img
                key={i}
                src={url}
                alt={`Photo ${i + 1}`}
                crossOrigin="anonymous"
                style={{
                  width: "100%",
                  aspectRatio: "4/3",
                  objectFit: "cover",
                  borderRadius: 4,
                  border: "1px solid #e5e7eb",
                  display: "block",
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Footer ────────────────────────────────────────────────────────── */}
      <div style={{
        marginTop: 28,
        paddingTop: 12,
        borderTop: "1px solid #d1d5db",
        fontSize: 9.5,
        color: "#9ca3af",
        textAlign: "center" as const,
        lineHeight: 1.8,
      }}>
        <div>
          <strong style={{ color: "#6b7280" }}>{CO_NAME}</strong>
          {" · "}
          <strong style={{ color: "#6b7280" }}>{CO_PHONE}</strong>
          {" · "}
          <strong style={{ color: "#6b7280" }}>{CO_EMAIL}</strong>
        </div>
        <div>To schedule these services, reply to this report or contact us at the information above.</div>
      </div>

    </div>
  );
}
