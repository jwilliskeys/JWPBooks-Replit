/**
 * How a client is named everywhere in the app.
 *
 * A client record is an *account*, not a person. Churches, schools, and venues
 * are booked under the organization's name, with a person as the point of
 * contact — Wellesley Hills Congregational (contact: Will Cooper). That same
 * person may also be a client in his own right for his home piano, which is a
 * separate record with no company name.
 *
 * The rule: show the organization if one is entered, otherwise the person.
 * The customer detail page has always worked this way; these helpers exist so
 * every list, invoice, calendar pill, and search box agrees with it.
 */

export interface NameableClient {
  firstName?: string | null;
  lastName?: string | null;
  companyName?: string | null;
}

/** Person name only — the human, never the organization. */
export function personName(c: NameableClient | null | undefined): string {
  if (!c) return "";
  return `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim();
}

/** The client's display name: organization if set, otherwise the person. */
export function clientName(c: NameableClient | null | undefined, fallback = "Unknown client"): string {
  if (!c) return fallback;
  const company = c.companyName?.trim();
  if (company) return company;
  return personName(c) || fallback;
}

/**
 * Contact name to show beneath an organization's name — empty for residential
 * clients, where the display name already IS the person.
 */
export function clientContactLine(c: NameableClient | null | undefined): string {
  if (!c?.companyName?.trim()) return "";
  return personName(c);
}

/** Display name plus the contact, e.g. "Wellesley Hills Congregational (Will Cooper)". */
export function clientNameWithContact(c: NameableClient | null | undefined, fallback = "Unknown client"): string {
  const name = clientName(c, fallback);
  const contact = clientContactLine(c);
  return contact ? `${name} (${contact})` : name;
}

/** Up to two initials for an avatar, taken from whatever name is displayed. */
export function clientInitials(c: NameableClient | null | undefined): string {
  const words = clientName(c, "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  const letters = words.length === 1
    ? words[0].slice(0, 2)
    : words[0][0] + words[words.length - 1][0];
  return letters.toUpperCase();
}

/**
 * Everything worth matching a search box against — organization AND person, so
 * typing "Will Cooper" still finds the church he's the contact for.
 */
export function clientSearchText(c: NameableClient | null | undefined): string {
  if (!c) return "";
  return [c.companyName, c.firstName, c.lastName].filter(Boolean).join(" ").toLowerCase();
}
