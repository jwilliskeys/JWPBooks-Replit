import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, CalendarClock, ChevronRight } from "lucide-react";
import { Link } from "wouter";
import type { Customer, Piano } from "@shared/schema";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

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

  if (isLoading) return null;
  return (
    <Card data-testid="tuning-reminder-feed">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-semibold">
          <CalendarClock className="h-4 w-4 text-primary" /> Tuning reminders
        </CardTitle>
        <Badge variant={reminders.some((item) => item.daysUntilDue < 0) ? "destructive" : "secondary"}>
          {reminders.length}
        </Badge>
      </CardHeader>
      <CardContent className="space-y-2">
        {reminders.length === 0 ? (
          <p className="py-2 text-sm text-muted-foreground">No pianos are due for a reminder in the next month.</p>
        ) : reminders.map(({ piano, dueDate, daysUntilDue, customer, pianoName }) => (
          <Link key={piano.id} href={`/pianos/${piano.id}`} className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-muted/40"
            data-testid={`tuning-reminder-${piano.id}`}>
            <AlertTriangle className={`h-4 w-4 shrink-0 ${daysUntilDue < 0 ? "text-destructive" : "text-amber-600"}`} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{pianoName}</span>
              <span className="block truncate text-xs text-muted-foreground">{customer ? `${customer.firstName} ${customer.lastName}` : "Customer"} · Due {dueDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
            </span>
            <Badge variant={daysUntilDue < 0 ? "destructive" : "outline"} className="shrink-0 text-[10px]">
              {daysUntilDue < 0 ? `${Math.abs(daysUntilDue)}d overdue` : daysUntilDue === 0 ? "Due today" : `${daysUntilDue}d`}
            </Badge>
            <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
          </Link>
        ))}
      </CardContent>
    </Card>
  );
}
