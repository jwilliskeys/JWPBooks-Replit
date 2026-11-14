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
          <g className="text-stone-800 dark:text-stone-200" fill="currentColor" stroke="currentColor" strokeLinejoin="round">
            {/* Open lid and its prop */}
            <path d="M58 34 79 8l38-1-8 9c-2 3-1 5 3 6l25 4c6 1 7 4 4 8-8 10-23 16-42 17l-21-1-4-25-3 1 3 25-25 1-13-4z" />
            <path d="m75 28 4 25-3 2-5-27z" />
            {/* Keyboard end and curved grand body */}
            <path d="m14 61 10-1 5-13 22-1 9-8 11 2-3 8c-2 5 1 8 8 9l29-2c15-1 27-4 36-8 4-2 7-1 7 3v14c0 4-2 6-6 7l-18 4c-7 2-11 7-18 11-7 4-12 6-20 6l-1 5-19 2-12-7-13-2-1 27h-4l-1-29-21-9-1-10c0-3 1-5 4-6z" />
            {/* Keyboard white keys and dark keys */}
            <path d="m19 62 43 15-2 5-42-15z" fill="#f5f5f4" stroke="none" />
            <path d="m22 59 39 14-1 3-39-13z" />
            {/* Three tapered legs */}
            <path d="m42 85 4 1 1 27-4 1zM76 91l5-1-3 31-4 1zM128 75l4-1-2 28-4 1z" />
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
