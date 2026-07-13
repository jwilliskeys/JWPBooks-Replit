/**
 * research.ts — AI lead research for the Outreach page.
 *
 * Calls the Anthropic API (with its built-in web search tool) via plain fetch
 * (no npm dependency — same pattern as email.ts) to find piano-related leads
 * in a given city and return them as structured rows ready to insert.
 *
 * To activate, add to .env (and Replit Secrets when deploying):
 *
 *   ANTHROPIC_API_KEY=sk-ant-xxxxxxxx   (from https://console.anthropic.com)
 *
 * Optional:
 *   OUTREACH_RESEARCH_MODEL=claude-sonnet-5   (override the model)
 *
 * Each research run makes up to ~10 web searches and costs a few cents.
 * If the key is unset, the route returns 503 with instructions — nothing breaks.
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

const VALID_LEAD_TYPES = new Set([
  "church",
  "teaching_studio",
  "recording_studio",
  "hotel_venue",
  "school",
  "senior_living",
  "other",
]);

export interface ResearchedLead {
  name: string;
  leadType: string;
  phone: string | null;
  email: string | null;
  website: string | null;
  address: string | null;
  pianoCount: string | null;
  notes: string | null;
}

function buildPrompt(city: string): string {
  return `You are researching sales leads for John Willis Piano, an independent piano tuning & repair business run by Willis Krammer, a registered piano technician based in Somerville, MA (he is also Head Technician at Boston University).

Research the city/neighborhood of ${city}, Massachusetts (Boston metro area) and find organizations likely to OWN ACOUSTIC PIANOS that need professional tuning and maintenance:

- Churches with music programs (sanctuary/fellowship-hall pianos)
- Private schools and community music schools
- Independent piano teachers and teaching studios
- Recording studios with house pianos
- Hotels, restaurants, piano bars, jazz clubs, event/concert venues
- Senior living / assisted living communities (common-room pianos)

Use web search to find REAL organizations currently operating there. For each, dig up actual contact details (phone, email, website, street address) from their own site or listings. Prefer quality over quantity: only include leads where you found at least a phone number, email, or website. Skip national chains with no local piano presence, and skip anything you could not verify exists.

For the notes field, write 1-2 short sentences with the outreach angle: who to ask for (e.g. "ask for the music director"), any evidence of pianos (concert series, choir, jazz nights, "our Steinway"), and anything useful for a first call.

Return AT MOST 15 leads. Respond with ONLY a JSON array (no prose, no markdown fence), where each element is:
{
  "name": string,
  "leadType": "church" | "teaching_studio" | "recording_studio" | "hotel_venue" | "school" | "senior_living" | "other",
  "phone": string | null,
  "email": string | null,
  "website": string | null,
  "address": string | null,
  "pianoCount": string | null,
  "notes": string | null
}`;
}

/** Extracts the first JSON array found in a blob of model text. */
function extractJsonArray(text: string): unknown[] | null {
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start === -1 || end === -1 || end <= start) return null;
  try {
    const parsed = JSON.parse(text.slice(start, end + 1));
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function cleanStr(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s && s.toLowerCase() !== "null" && s.toLowerCase() !== "unknown" ? s : null;
}

export function researchConfigured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY;
}

/**
 * Runs the web research. Throws with a readable message on API errors.
 * Typically takes 30–90 seconds.
 */
export async function researchCityLeads(city: string): Promise<ResearchedLead[]> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("ANTHROPIC_API_KEY not configured");

  const model = process.env.OUTREACH_RESEARCH_MODEL || "claude-sonnet-5";

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      max_tokens: 8000,
      tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 10 }],
      messages: [{ role: "user", content: buildPrompt(city) }],
    }),
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[research] Anthropic API error ${res.status}: ${body.slice(0, 500)}`);
    if (res.status === 401) throw new Error("Anthropic API key was rejected — check ANTHROPIC_API_KEY.");
    if (res.status === 404) throw new Error(`Model "${model}" not found — set OUTREACH_RESEARCH_MODEL in .env to a valid model.`);
    if (res.status === 429) throw new Error("Anthropic API rate limit hit — wait a minute and try again.");
    throw new Error(`Research request failed (${res.status}).`);
  }

  const data = (await res.json()) as any;

  // Concatenate every text block (web-search responses interleave tool blocks).
  const text = (data?.content ?? [])
    .filter((b: any) => b?.type === "text" && typeof b.text === "string")
    .map((b: any) => b.text)
    .join("\n");

  const raw = extractJsonArray(text);
  if (!raw) {
    console.error(`[research] could not parse JSON from model output: ${text.slice(0, 500)}`);
    throw new Error("Research finished but the results couldn't be parsed — try again.");
  }

  const leads: ResearchedLead[] = [];
  for (const item of raw.slice(0, 20)) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const name = cleanStr(o.name);
    if (!name) continue;
    const phone = cleanStr(o.phone);
    const email = cleanStr(o.email);
    const website = cleanStr(o.website);
    if (!phone && !email && !website) continue; // must be contactable
    const lt = cleanStr(o.leadType)?.toLowerCase() ?? "other";
    leads.push({
      name,
      leadType: VALID_LEAD_TYPES.has(lt) ? lt : "other",
      phone,
      email,
      website,
      address: cleanStr(o.address),
      pianoCount: cleanStr(o.pianoCount),
      notes: cleanStr(o.notes),
    });
  }
  return leads;
}
