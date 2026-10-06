/**
 * Booking requests store service selections in the existing text column.
 * JSON arrays keep new multi-select requests unambiguous while parsing legacy
 * requests (which stored one plain service name) without a database migration.
 */
export function serializeBookingServices(services: readonly string[]): string {
  const cleaned = services.map((name) => name.trim()).filter(Boolean);
  return JSON.stringify([...new Set(cleaned)]);
}

export function parseBookingServices(value: string | null | undefined): string[] {
  if (!value?.trim()) return [];

  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return [...new Set(parsed.map((item) => item.trim()).filter(Boolean))];
    }
  } catch {
    // Existing booking requests store one plain service name.
  }

  return [value.trim()];
}

export function formatBookingServices(value: string | null | undefined): string {
  return parseBookingServices(value).join(", ");
}
