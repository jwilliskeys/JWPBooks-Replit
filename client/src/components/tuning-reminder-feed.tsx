import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "wouter";
import type { Customer, Piano } from "@shared/schema";

function parseLocalDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [year, month, day] = value.slice(0, 10).split("-").map(Number);
    return new Date(year, month - 1, day);
  }
  const parts = value.split("/");
  if (parts.length !== 3) return null;
  let year = Number(parts[2]);
  if (year < 100) year += 2000;
  const result = new Date(year, Number(parts[0]) - 1, Number(parts[1]));
  return Number.isNaN(result.getTime()) ? null : result;
}

function shiftMonthClamped(date: Date, amount: number) {
  const target = new Date(date.getFullYear(), date.getMonth() + amount, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(date.getDate(), lastDay));
  return target;
}

function getDue(piano: Piano): Date | null {
  const lastTuned = parseLocalDate(piano.lastTuned);
  const months = parseInt(piano.tuningInterval ?? "", 10);
  if (!lastTuned || !Number.isFinite(months) || months <= 0) return null;
  return shiftMonthClamped(lastTuned, months);
}

function daysBetween(a: Date, b: Date) {
  const utcA = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const utcB = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((utcB - utcA) / 86400000);
}

export function TuningReminderFeed() {
  const today = useMemo(() => {
    const date = new Date();
    return new Date(date.getFullYear(), date.getMonth(), date.getDate());
  }, []);
  const { data: pianos = [], isLoading } = useQuery<Piano[]>({ queryKey: ["/api/pianos"] });
  const { data: customers = [] } = useQuery<Customer[]>({ queryKey: ["/api/customers"] });

  const reminders = useMemo(() => {
    const customerMap = new Map(customers.map((customer) => [customer.id, customer]));
    return pianos.flatMap((piano) => {
      if (piano.isActive === false) return [];
      const dueDate = getDue(piano);
      if (!dueDate) return [];
      const reminderDate = shiftMonthClamped(dueDate, -1);
      const daysUntilDue = daysBetween(today, dueDate);
      if (today < reminderDate || daysUntilDue > 30) return [];
      const pianoName = [piano.make, piano.model].filter(Boolean).join(" ") || `${piano.pianoType || "Piano"} #${piano.id}`;
      return [{ piano, dueDate, daysUntilDue, customer: customerMap.get(piano.customerId), pianoName }];
    }).sort((a, b) => a.daysUntilDue - b.daysUntilDue);
  }, [pianos, customers, today]);

  if (isLoading || reminders.length === 0) return null;
  return (
    <section className="border-t pt-3" data-testid="tuning-reminder-feed" aria-labelledby="tuning-reminder-heading">
      <h2 id="tuning-reminder-heading" className="mb-1 text-xs font-medium text-muted-foreground">
        Tuning reminders
      </h2>
      <ul className="divide-y divide-border/50">
        {reminders.map(({ piano, dueDate, daysUntilDue, customer, pianoName }) => (
          <li key={piano.id}>
            <Link
              href={`/pianos/${piano.id}`}
              className="flex items-center gap-3 py-2 transition-colors hover:text-foreground"
              data-testid={`tuning-reminder-${piano.id}`}
            >
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{pianoName}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {customer ? `${customer.firstName} ${customer.lastName}` : "Customer"}
                </span>
              </span>
              <span className="shrink-0 text-xs text-muted-foreground">
                {daysUntilDue < 0 ? "Overdue · " : ""}
                {dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric" })}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
