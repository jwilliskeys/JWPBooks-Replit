import { useEffect, useMemo, useState, useDeferredValue } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  Command,
  CommandInput,
  CommandList,
  CommandEmpty,
  CommandGroup,
  CommandItem,
} from "@/components/ui/command";
import { Users, Music, FileText } from "lucide-react";
import { formatPhone } from "@/lib/utils";
import type { Customer, Piano, Invoice } from "@shared/schema";
import { clientName, clientSearchText } from "@shared/client-name";

// ── Matching helpers ─────────────────────────────────────────────────────────

/** Normalize a string for matching: lowercase, strip diacritics-ish. */
function norm(s: string | null | undefined): string {
  return (s ?? "").toLowerCase();
}

/** Keep only digits — used so "617 555" matches "(617) 555-1234". */
function digits(s: string | null | undefined): string {
  return (s ?? "").replace(/\D/g, "");
}

/**
 * Every space-separated token of the query must appear somewhere in the
 * haystack. "jane stein" matches a Jane who owns a Steinway-labelled record.
 */
function tokensMatch(queryTokens: string[], haystack: string): boolean {
  return queryTokens.every((t) => haystack.includes(t));
}

const MAX_PER_GROUP = 7;

interface SearchHit {
  id: string;
  title: string;
  subtitle: string;
  href: string;
}

// ── Component ────────────────────────────────────────────────────────────────

export function CommandPalette({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [, navigate] = useLocation();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);

  // Reset the query each time the palette opens so old searches don't linger.
  useEffect(() => {
    if (open) setQuery("");
  }, [open]);

  // These three lists are usually already in the TanStack Query cache from the
  // list pages / sidebar, so opening the palette is instant. `enabled: open`
  // means we never fetch until the palette is first used.
  const { data: customers } = useQuery<Customer[]>({
    queryKey: ["/api/customers"],
    enabled: open,
  });
  const { data: pianos } = useQuery<Piano[]>({
    queryKey: ["/api/pianos"],
    enabled: open,
  });
  const { data: invoices } = useQuery<Invoice[]>({
    queryKey: ["/api/invoices"],
    enabled: open,
  });

  const customerMap = useMemo(
    () => new Map((customers ?? []).map((c) => [c.id, c])),
    [customers]
  );

  // Pre-build one searchable haystack string per record, once per data load.
  const customerIndex = useMemo(
    () =>
      (customers ?? []).map((c) => ({
        record: c,
        haystack: [
          norm(clientSearchText(c)),
          norm(c.companyName),
          norm(c.email),
          digits(c.phone),
          norm(c.address),
          norm(c.city),
          norm(c.state),
          norm(c.zipCode),
        ].join(" "),
      })),
    [customers]
  );

  const pianoIndex = useMemo(
    () =>
      (pianos ?? []).map((p) => {
        const owner = customerMap.get(p.customerId);
        return {
          record: p,
          ownerName: owner ? clientName(owner) : "",
          haystack: [
            norm(p.make),
            norm(p.model),
            norm(p.pianoType),
            norm(p.serialNumber),
            norm(p.year),
            norm(p.location),
            owner ? norm(clientSearchText(owner)) : "",
          ].join(" "),
        };
      }),
    [pianos, customerMap]
  );

  const invoiceIndex = useMemo(
    () =>
      (invoices ?? []).map((inv) => {
        const cust = customerMap.get(inv.customerId);
        const custName =
          inv.customerName || (cust ? clientName(cust) : "");
        return {
          record: inv,
          custName,
          haystack: [norm(inv.invoiceNumber), norm(custName)].join(" "),
        };
      }),
    [invoices, customerMap]
  );

  const q = deferredQuery.trim().toLowerCase();
  const qTokens = useMemo(() => (q ? q.split(/\s+/) : []), [q]);
  const qDigits = digits(deferredQuery);

  const { customerHits, pianoHits, invoiceHits } = useMemo(() => {
    if (!q) {
      return {
        customerHits: [] as SearchHit[],
        pianoHits: [] as SearchHit[],
        invoiceHits: [] as SearchHit[],
      };
    }

    const customerHits: SearchHit[] = [];
    for (const { record: c, haystack } of customerIndex) {
      const phoneHit = qDigits.length >= 3 && digits(c.phone).includes(qDigits);
      if (tokensMatch(qTokens, haystack) || phoneHit) {
        const sub = [
          c.companyName,
          c.phone ? formatPhone(c.phone) : null,
          [c.city, c.state].filter(Boolean).join(", "),
        ]
          .filter(Boolean)
          .join(" · ");
        customerHits.push({
          id: `customer-${c.id}`,
          title: clientName(c, "(Unnamed client)"),
          subtitle: sub,
          href: `/customers/${c.id}`,
        });
        if (customerHits.length >= MAX_PER_GROUP) break;
      }
    }

    const pianoHits: SearchHit[] = [];
    for (const { record: p, ownerName, haystack } of pianoIndex) {
      if (tokensMatch(qTokens, haystack)) {
        const title =
          [p.year, p.make, p.model, p.pianoType].filter(Boolean).join(" ") ||
          "Unnamed Piano";
        const sub = [
          ownerName,
          p.serialNumber ? `Serial ${p.serialNumber}` : null,
        ]
          .filter(Boolean)
          .join(" · ");
        pianoHits.push({
          id: `piano-${p.id}`,
          title,
          subtitle: sub,
          href: `/pianos/${p.id}`,
        });
        if (pianoHits.length >= MAX_PER_GROUP) break;
      }
    }

    const invoiceHits: SearchHit[] = [];
    for (const { record: inv, custName, haystack } of invoiceIndex) {
      if (tokensMatch(qTokens, haystack)) {
        const sub = [
          custName,
          inv.invoiceDate,
          inv.total && inv.total !== "$0.00" ? inv.total : null,
          inv.status ? inv.status : null,
        ]
          .filter(Boolean)
          .join(" · ");
        invoiceHits.push({
          id: `invoice-${inv.id}`,
          title: `Invoice #${inv.invoiceNumber}`,
          subtitle: sub,
          href: `/invoices/${inv.id}`,
        });
        if (invoiceHits.length >= MAX_PER_GROUP) break;
      }
    }

    return { customerHits, pianoHits, invoiceHits };
  }, [q, qTokens, qDigits, customerIndex, pianoIndex, invoiceIndex]);

  const hasHits =
    customerHits.length > 0 || pianoHits.length > 0 || invoiceHits.length > 0;

  function go(href: string) {
    onOpenChange(false);
    navigate(href);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="overflow-hidden p-0 shadow-lg top-[10%] translate-y-0 max-w-lg"
        data-testid="command-palette"
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">
          Search clients, pianos, and invoices
        </DialogDescription>
        <Command
          shouldFilter={false}
          className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2 [&_[cmdk-input]]:h-12"
        >
          <CommandInput
            placeholder="Search clients, pianos, invoices…"
            value={query}
            onValueChange={setQuery}
            data-testid="input-command-palette"
          />
          <CommandList className="max-h-[min(420px,60vh)]">
            {!q ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                Type a name, company, phone, address, serial number, or
                invoice number.
              </p>
            ) : !hasHits ? (
              <CommandEmpty>No matches found.</CommandEmpty>
            ) : (
              <>
                {customerHits.length > 0 && (
                  <CommandGroup heading="Clients">
                    {customerHits.map((hit) => (
                      <CommandItem
                        key={hit.id}
                        value={hit.id}
                        onSelect={() => go(hit.href)}
                        className="cursor-pointer"
                        data-testid={`palette-${hit.id}`}
                      >
                        <Users className="text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{hit.title}</p>
                          {hit.subtitle && (
                            <p className="truncate text-xs text-muted-foreground">
                              {hit.subtitle}
                            </p>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {pianoHits.length > 0 && (
                  <CommandGroup heading="Pianos">
                    {pianoHits.map((hit) => (
                      <CommandItem
                        key={hit.id}
                        value={hit.id}
                        onSelect={() => go(hit.href)}
                        className="cursor-pointer"
                        data-testid={`palette-${hit.id}`}
                      >
                        <Music className="text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{hit.title}</p>
                          {hit.subtitle && (
                            <p className="truncate text-xs text-muted-foreground">
                              {hit.subtitle}
                            </p>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
                {invoiceHits.length > 0 && (
                  <CommandGroup heading="Invoices">
                    {invoiceHits.map((hit) => (
                      <CommandItem
                        key={hit.id}
                        value={hit.id}
                        onSelect={() => go(hit.href)}
                        className="cursor-pointer"
                        data-testid={`palette-${hit.id}`}
                      >
                        <FileText className="text-muted-foreground" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{hit.title}</p>
                          {hit.subtitle && (
                            <p className="truncate text-xs text-muted-foreground">
                              {hit.subtitle}
                            </p>
                          )}
                        </div>
                      </CommandItem>
                    ))}
                  </CommandGroup>
                )}
              </>
            )}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  );
}
