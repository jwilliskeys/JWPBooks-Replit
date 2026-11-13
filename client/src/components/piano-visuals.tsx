import { Music, Piano as PianoIcon } from "lucide-react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { Piano, ServiceRecord } from "@shared/schema";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { deserializePianoscope } from "@/lib/pianoscope";

export function DefaultPianoImage({ piano, className = "" }: { piano: Piano; className?: string }) {
  const type = (piano.pianoType ?? "").toLowerCase();
  const kind = type.includes("grand") ? "grand" : type.includes("upright") || type.includes("spinet") ? "upright" : null;
  if (!kind) {
    return <div className={`flex items-center justify-center rounded-xl border bg-primary/5 ${className}`} aria-label="No piano image">
      <Music className="h-12 w-12 text-primary/35" />
    </div>;
  }
  return (
    <div className={`flex items-center justify-center overflow-hidden rounded-xl border bg-gradient-to-br from-stone-50 to-stone-200 dark:from-stone-900 dark:to-stone-800 ${className}`}>
      <svg viewBox="0 0 160 120" role="img" aria-label={`Default ${kind} piano image`} className="h-full w-full p-3">
        {kind === "upright" ? (
          <g fill="none" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" className="text-stone-800 dark:text-stone-200">
            <path d="M34 20h88v68H34z" fill="currentColor" opacity=".12" />
            <path d="M34 20h88v68H34zM40 29h76v42H40zM44 76h68M46 88l-5 20m68-20 5 20M52 88v18m56-18v18" />
            <path d="M48 34v31m10-31v31m10-31v31m10-31v31m10-31v31m10-31v31m10-31v31" strokeWidth="2" />
            <path d="M47 35h6v18h-6zm10 0h6v18h-6zm20 0h6v18h-6zm10 0h6v18h-6zm20 0h6v18h-6z" fill="currentColor" />
          </g>
        ) : (
          <g fill="none" stroke="currentColor" strokeWidth="4" strokeLinejoin="round" className="text-stone-800 dark:text-stone-200">
            <path d="M24 67h112l-13 17H38z" fill="currentColor" opacity=".12" />
            <path d="M24 67h112l-13 17H38zM44 85v23m72-23v23m-78 0h83M34 67l12-33h83l7 33" />
            <path d="M47 38h75v26H40" />
            <path d="M45 44h77" strokeWidth="2" />
            <path d="M50 45v17m10-17v17m10-17v17m20-17v17m10-17v17m10-17v17" strokeWidth="2" />
            <path d="M48 45h6v10h-6zm10 0h6v10h-6zm20 0h6v10h-6zm10 0h6v10h-6zm20 0h6v10h-6z" fill="currentColor" />
          </g>
        )}
      </svg>
    </div>
  );
}

function displayDate(date: string) {
  const parsed = parseDateLocal(date);
  return parsed ? parsed.toLocaleDateString("en-US", { month: "short", year: "numeric" }) : date;
}

function parseDateLocal(value: string): Date | null {
  if (/^\d{4}-\d{2}-\d{2}/.test(value)) {
    const [y, m, d] = value.slice(0, 10).split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  const parts = value.split("/");
  if (parts.length !== 3) return null;
  let year = Number(parts[2]);
  if (year < 100) year += 2000;
  return new Date(year, Number(parts[0]) - 1, Number(parts[1]));
}

export function PianoPitchHistory({ records }: { records: ServiceRecord[] }) {
  const data = records.flatMap((record) => {
    const summary = deserializePianoscope(record.pianoscope);
    const date = parseDateLocal(record.serviceDate);
    if (!summary || !date || !Number.isFinite(summary.stats?.pitchCents)) return [];
    return [{
      timestamp: date.getTime(),
      date: record.serviceDate,
      cents: summary.stats.pitchCents,
      humidity: record.humidity,
      temperature: record.temperature,
    }];
  }).sort((a, b) => a.timestamp - b.timestamp);

  return (
    <Card data-testid="piano-pitch-history">
      <CardHeader className="px-4 pb-1 pt-4">
        <CardTitle className="text-sm font-semibold">Pitch over time</CardTitle>
        <p className="text-xs text-muted-foreground">Pianoscope arrival pitch relative to the file’s concert pitch</p>
      </CardHeader>
      <CardContent className="px-2 pb-3">
        {data.length === 0 ? (
          <p className="px-2 py-6 text-center text-xs text-muted-foreground">Import Pianoscope files to build this piano’s pitch history.</p>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={205}>
              <LineChart data={data} margin={{ top: 10, right: 14, bottom: 4, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis
                  dataKey="timestamp"
                  type="number"
                  scale="time"
                  domain={["dataMin", "dataMax"]}
                  tickFormatter={(value) => displayDate(new Date(value).toLocaleDateString("en-US"))}
                  tick={{ fontSize: 10 }}
                  minTickGap={18}
                />
                <YAxis
                  type="number"
                  domain={["auto", "auto"]}
                  tick={{ fontSize: 10 }}
                  width={42}
                  tickFormatter={(value) => `${value}¢`}
                  label={{ value: "Cents", angle: -90, position: "insideLeft", fontSize: 10 }}
                />
                <ReferenceLine y={0} stroke="currentColor" strokeDasharray="4 4" />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const point = payload[0].payload as typeof data[number];
                    return (
                      <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
                        <p className="font-semibold">{point.date}</p>
                        <p>Pitch: {point.cents > 0 ? "+" : ""}{point.cents.toFixed(1)}¢</p>
                        <p>Humidity: {point.humidity ? `${point.humidity}% RH` : "Not recorded"}</p>
                        <p>Temperature: {point.temperature ? `${point.temperature}°F` : "Not recorded"}</p>
                      </div>
                    );
                  }}
                />
                <Line type="monotone" dataKey="cents" stroke="#287C6F" strokeWidth={2.5} dot={{ r: 4 }} activeDot={{ r: 6 }} />
              </LineChart>
            </ResponsiveContainer>
            <p className="px-2 text-[10px] text-muted-foreground">Above zero is sharp; below zero is flat. Climate appears when it was recorded for that service.</p>
          </>
        )}
      </CardContent>
    </Card>
  );
}

export function PianoClimateSummary({ records }: { records: ServiceRecord[] }) {
  const latest = [...records]
    .filter((record) => record.humidity || record.temperature)
    .sort((a, b) => (parseDateLocal(b.serviceDate)?.getTime() ?? 0) - (parseDateLocal(a.serviceDate)?.getTime() ?? 0))[0];
  return (
    <Card className="border-sky-200/70 bg-sky-50/50 dark:border-sky-900/60 dark:bg-sky-950/20" data-testid="piano-climate-summary">
      <CardContent className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <PianoIcon className="h-4 w-4 text-sky-700 dark:text-sky-300" />
          <div>
            <p className="text-xs font-semibold">Latest climate reading</p>
            <p className="text-[10px] text-muted-foreground">{latest ? `Recorded ${latest.serviceDate}` : "No climate readings yet"}</p>
          </div>
        </div>
        <div className="text-right text-sm font-semibold tabular-nums">
          {latest ? (
            <span>{latest.humidity ? `${latest.humidity}% RH` : "—"} <span className="mx-1 text-muted-foreground">·</span> {latest.temperature ? `${latest.temperature}°F` : "—"}</span>
          ) : <span className="text-muted-foreground">—</span>}
        </div>
      </CardContent>
    </Card>
  );
}
