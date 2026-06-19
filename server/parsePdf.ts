/**
 * parsePdf.ts — Delta flight receipt PDF parser
 *
 * Uses only Node.js built-in `zlib` (no npm packages needed).
 * Handles Apache FOP 2.x PDFs with FlateDecode content streams and
 * custom ToUnicode CMap glyph encoding.
 *
 * Extraction strategy:
 *  1. Decompress all FlateDecode streams with zlib.
 *  2. Build glyph→Unicode CMaps from `beginbfchar` blocks.
 *  3. Decode every BT…ET text block, using all CMaps (first printable char wins).
 *  4. Extract fields with targeted regexes.
 *  5. Compute total by summing itemized charges (more reliable than the
 *     often-garbled "Total Price" line due to multi-font rendering).
 */

import zlib from "zlib";

export interface ParsedFlightReceipt {
  flightNumber: string;   // e.g. "DL 5692"
  from: string;           // IATA code, e.g. "BOS"
  to: string;             // IATA code, e.g. "DCA"
  date: string;           // e.g. "Jul 20, 2026"
  total: string;          // e.g. "$178.40"
  confirmation: string;   // e.g. "F83M5U"
  rawText?: string;       // full decoded text for debugging
}

// ──────────────────────────────────────────────────────────────────────────────
// 1. Decompress FlateDecode streams
// ──────────────────────────────────────────────────────────────────────────────
function decompressStreams(pdfBinary: string): string[] {
  const results: string[] = [];
  const streamRe = /stream\r?\n([\s\S]*?)\r?\nendstream/g;
  let m: RegExpExecArray | null;

  while ((m = streamRe.exec(pdfBinary)) !== null) {
    const raw = Buffer.from(m[1], "binary");
    for (const fn of [zlib.inflateSync, (b: Buffer) => zlib.inflateRawSync(b)]) {
      try {
        const dec = (fn as (b: Buffer) => Buffer)(raw);
        results.push(dec.toString("latin1"));
        break;
      } catch {
        // try next decompressor
      }
    }
  }
  return results;
}

// ──────────────────────────────────────────────────────────────────────────────
// 2. Build CMap tables from streams containing beginbfchar blocks
// ──────────────────────────────────────────────────────────────────────────────
function buildCMaps(streams: string[]): Map<string, string>[] {
  const cmaps: Map<string, string>[] = [];
  const bfRe = /beginbfchar\s*([\s\S]*?)\s*endbfchar/g;
  const entryRe = /<([0-9A-Fa-f]+)>\s*<([0-9A-Fa-f]+)>/g;

  for (const stream of streams) {
    let bm: RegExpExecArray | null;
    bfRe.lastIndex = 0;
    while ((bm = bfRe.exec(stream)) !== null) {
      const cmap = new Map<string, string>();
      let em: RegExpExecArray | null;
      entryRe.lastIndex = 0;
      while ((em = entryRe.exec(bm[1])) !== null) {
        const glyph = em[1].toUpperCase().padStart(4, "0");
        const cp = parseInt(em[2], 16);
        if (!isNaN(cp)) {
          try { cmap.set(glyph, String.fromCodePoint(cp)); } catch { /* skip */ }
        }
      }
      if (cmap.size > 0) cmaps.push(cmap);
    }
  }
  return cmaps;
}

// ──────────────────────────────────────────────────────────────────────────────
// 3. Decode a single hex glyph sequence using all CMaps
//    First CMap that gives a printable ASCII char wins.
// ──────────────────────────────────────────────────────────────────────────────
function decodeHex(hexStr: string, cmaps: Map<string, string>[]): string {
  hexStr = hexStr.replace(/\s/g, "");
  let result = "";
  for (let i = 0; i < hexStr.length; i += 4) {
    const glyph = hexStr.slice(i, i + 4).toUpperCase().padStart(4, "0");
    let ch = "?";
    for (const cmap of cmaps) {
      const c = cmap.get(glyph);
      if (c && c.charCodeAt(0) >= 32 && c.charCodeAt(0) < 127) {
        ch = c;
        break;
      }
    }
    result += ch;
  }
  return result;
}

// ──────────────────────────────────────────────────────────────────────────────
// 4. Decode all BT…ET text blocks in content streams
// ──────────────────────────────────────────────────────────────────────────────
function decodeTextBlocks(streams: string[], cmaps: Map<string, string>[]): string[] {
  const blocks: string[] = [];
  const btRe = /BT\s*([\s\S]*?)\s*ET/g;
  const hexOpRe = /<([0-9A-Fa-f\s]+)>\s*(?:Tj|TJ)|\[([^\]]*)\]\s*TJ/g;

  for (const stream of streams) {
    if (!stream.includes("BT") || stream.includes("beginbfchar")) continue;
    let btm: RegExpExecArray | null;
    btRe.lastIndex = 0;
    while ((btm = btRe.exec(stream)) !== null) {
      const block = btm[1];
      if (!/<[0-9A-Fa-f]+>/.test(block)) continue;

      const parts: string[] = [];
      let hm: RegExpExecArray | null;
      hexOpRe.lastIndex = 0;
      while ((hm = hexOpRe.exec(block)) !== null) {
        if (hm[1]) {
          parts.push(decodeHex(hm[1], cmaps));
        } else if (hm[2]) {
          // TJ array: <hex> -num <hex> ...
          const subRe = /<([0-9A-Fa-f\s]+)>/g;
          let sm: RegExpExecArray | null;
          while ((sm = subRe.exec(hm[2])) !== null) {
            parts.push(decodeHex(sm[1], cmaps));
          }
        }
      }

      const text = parts.join("").trim();
      if (text && /[a-zA-Z0-9]/.test(text)) blocks.push(text);
    }
  }
  return blocks;
}

// ──────────────────────────────────────────────────────────────────────────────
// 5. Field extraction helpers
// ──────────────────────────────────────────────────────────────────────────────

/** Normalize a raw price string: map common glyph substitutions and parse. */
function normalizePrice(raw: string): number | null {
  // The font renders '0' as 'W' and '1' as 'N' in some contexts.
  // We detect and replace any single non-digit, non-dot char that appears
  // between digits (or after $) as likely a substituted digit.
  // Simpler: just strip everything that isn't a digit or dot, then parse.
  const cleaned = raw
    .replace(/W/g, "0")
    .replace(/N/g, "1")
    .replace(/[^0-9.]/g, "");
  const val = parseFloat(cleaned);
  return isNaN(val) || val <= 0 ? null : val;
}

/** Find all dollar amounts in the decoded text and sum them. */
function computeTotalFromCharges(text: string): string {
  const matches = [...text.matchAll(/\$([A-Za-z0-9?.]+)/g)];
  let sum = 0;
  for (const [, raw] of matches) {
    const val = normalizePrice(raw);
    if (val !== null && val < 5000) sum += val; // ignore obviously wrong values
  }
  return sum > 0 ? `$${sum.toFixed(2)}` : "";
}

/** Parse a date like "2WJul2W26" → "Jul 20, 2026" */
function parseFlightDate(raw: string): string {
  const normalized = raw.replace(/W/g, "0").replace(/N/g, "1");
  const m = normalized.match(/(\d{1,2})([A-Za-z]{3})(\d{4})/);
  if (!m) return raw;
  return `${m[2]} ${parseInt(m[1], 10)}, ${m[3]}`;
}

// ──────────────────────────────────────────────────────────────────────────────
// Main exported function
// ──────────────────────────────────────────────────────────────────────────────
export function parseDeltaFlightPdf(pdfBuffer: Buffer): ParsedFlightReceipt {
  const pdfBinary = pdfBuffer.toString("binary");

  const streams = decompressStreams(pdfBinary);
  const cmaps = buildCMaps(streams);
  const textBlocks = decodeTextBlocks(streams, cmaps);
  const fullText = textBlocks.join("\n");

  // Airport codes: isolated 3-letter uppercase words on their own lines
  const airports = fullText.match(/^([A-Z]{3})$/gm) ?? [];
  const from = airports[0] ?? "";
  const to = airports[1] ?? "";

  // Flight # + date: "Mon 2WJul2W26 DL 5692"
  let flightNumber = "";
  let date = "";
  const flightDateMatch = fullText.match(
    /(Mon|Tue|Wed|Thu|Fri|Sat|Sun)\s+(\S+)\s+(DL\s*\d+)/i
  );
  if (flightDateMatch) {
    date = parseFlightDate(flightDateMatch[2]);
    flightNumber = flightDateMatch[3].replace(/\s+/, " ");
  }

  // Confirmation number
  const confMatch = fullText.match(/[Cc]on\w*\s*[Nn]umber:?\s*([A-Z0-9]{5,8})/);
  const confirmation = confMatch?.[1] ?? "";

  // Total: sum itemized charges (bypasses the garbled total-price line)
  const total = computeTotalFromCharges(fullText);

  return { flightNumber, from, to, date, total, confirmation, rawText: fullText };
}
