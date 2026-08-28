import { useMemo, useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ArrowDown, ArrowRight, ArrowUp, TrendingUp } from "lucide-react";
import type { OrderWithDetails, ResultFlag } from "@shared/schema";
import { parseResultValue } from "@shared/reference-range";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FLAG_LABELS, FLAG_STYLES, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * How one measurement has moved across a patient's visits.
 *
 * This is the question a repeat patient's file is actually opened for — a list
 * of visits answers "what was done", but only a series answers "is the
 * haemoglobin recovering". The data has always been there; it was just never
 * lined up by test name before.
 */

type Point = {
  date: string;
  value: number;
  flag: ResultFlag | null;
  orderNumber: number;
  unit: string | null;
};

type Series = {
  testName: string;
  unit: string | null;
  referenceRange: string | null;
  points: Point[];
};

/**
 * Groups every numeric result by test name.
 *
 * Non-numeric results ("manfiy", "3-5 ta k/s") are dropped rather than
 * coerced: the same parser the flagging logic uses decides what counts as a
 * measurement, so a value can never be plotted that the rest of the app would
 * refuse to compare.
 */
export function buildSeries(orders: OrderWithDetails[]): Series[] {
  const byTest = new Map<string, Series>();

  for (const order of orders) {
    for (const item of order.items) {
      const value = parseResultValue(item.result);
      if (value === null) continue;

      let series = byTest.get(item.testName);
      if (!series) {
        series = {
          testName: item.testName,
          unit: item.unit,
          referenceRange: item.referenceRange,
          points: [],
        };
        byTest.set(item.testName, series);
      }
      series.points.push({
        date: String(order.createdAt),
        value,
        flag: item.flag,
        orderNumber: order.orderNumber,
        unit: item.unit,
      });
    }
  }

  return (
    Array.from(byTest.values())
      // A single point is not a trend; there is nothing to see and offering it
      // in the picker just buries the tests that do have history.
      .filter((s) => s.points.length >= 2)
      .map((s) => ({
        ...s,
        // Orders arrive newest-first; a chart reads oldest-to-newest.
        points: [...s.points].sort(
          (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
        ),
      }))
      .sort((a, b) => b.points.length - a.points.length || a.testName.localeCompare(b.testName))
  );
}

/** Parses "3.9-6.1" / "< 41" / "Erkak: 130-170, Ayol: 120-150" into a band to shade. */
function referenceBand(range: string | null, gender: string | null | undefined) {
  if (!range) return null;

  const clauses = range.split(/[,;]/).map((c) => c.trim());
  const sexed = clauses.filter((c) => /erkak|ayol|мужч|женщ/i.test(c));

  let clause = range;
  if (sexed.length > 0) {
    const g = (gender ?? "").toLowerCase();
    const wantMale = /erkak|мужч/i.test(g);
    const wantFemale = /ayol|женщ/i.test(g);
    // Unknown sex: shading one side's band would be a quiet lie about which
    // range this patient is being measured against.
    if (!wantMale && !wantFemale) return null;
    const match = sexed.find((c) => (wantMale ? /erkak|мужч/i : /ayol|женщ/i).test(c));
    if (!match) return null;
    clause = match.replace(/^[^:]*:/, "");
  }

  const num = String.raw`-?\d+(?:[.,]\d+)?`;
  const toNum = (s: string) => Number(s.replace(",", "."));

  const between = clause.match(new RegExp(`(${num})\\s*[-–—]\\s*(${num})`));
  if (between) {
    const min = toNum(between[1]);
    const max = toNum(between[2]);
    return min <= max ? { min, max } : null;
  }
  const upper = clause.match(new RegExp(`[<≤]\\s*(${num})`));
  if (upper) return { min: null, max: toNum(upper[1]) };
  const lower = clause.match(new RegExp(`[>≥]\\s*(${num})`));
  if (lower) return { min: toNum(lower[1]), max: null };
  return null;
}

export function ResultTrend({
  orders,
  gender,
}: {
  orders: OrderWithDetails[];
  gender: string | null | undefined;
}) {
  const series = useMemo(() => buildSeries(orders), [orders]);
  const [selected, setSelected] = useState<string | null>(null);

  const active = series.find((s) => s.testName === selected) ?? series[0];

  if (series.length === 0) {
    return (
      <div className="px-6 py-10 text-center">
        <TrendingUp className="mx-auto h-8 w-8 text-muted-foreground/40" />
        <p className="mt-3 text-sm font-medium">Dinamika uchun ma'lumot yetarli emas</p>
        <p className="mx-auto mt-1 max-w-sm text-xs text-muted-foreground">
          Bitta tahlil kamida ikki marta topshirilgach, uning o'zgarishi shu yerda grafik bo'lib
          ko'rinadi.
        </p>
      </div>
    );
  }

  const band = referenceBand(active.referenceRange, gender);
  const points = active.points.map((p) => ({ ...p, label: formatDate(p.date) }));

  const first = active.points[0];
  const last = active.points[active.points.length - 1];
  const delta = last.value - first.value;
  const deltaPct = first.value !== 0 ? (delta / Math.abs(first.value)) * 100 : 0;

  // The y-axis has to cover the reference band as well as the readings, or a
  // result sitting outside the band would look like it is inside it.
  const values = active.points.map((p) => p.value);
  const lo = Math.min(...values, band?.min ?? Infinity);
  const hi = Math.max(...values, band?.max ?? -Infinity);
  const pad = (hi - lo || Math.abs(hi) || 1) * 0.15;

  return (
    <div className="space-y-4 p-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Select value={active.testName} onValueChange={setSelected}>
          <SelectTrigger className="sm:w-72" data-testid="select-trend-test">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {series.map((s) => (
              <SelectItem key={s.testName} value={s.testName}>
                {s.testName} ({s.points.length})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <TrendBadge delta={delta} deltaPct={deltaPct} />
          {last.flag && (
            <Badge variant="outline" className={cn("font-medium", FLAG_STYLES[last.flag])}>
              {FLAG_LABELS[last.flag]}
            </Badge>
          )}
        </div>
      </div>

      <div className="rounded-xl border bg-card p-3">
        <ResponsiveContainer width="100%" height={230}>
          <LineChart data={points} margin={{ left: -8, right: 12, top: 12, bottom: 4 }}>
            <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--border))" vertical={false} />

            {/* The healthy band, shaded — the eye reads "inside or outside"
                far faster than it reads a number against an axis. */}
            {band && (
              <ReferenceArea
                y1={band.min ?? lo - pad}
                y2={band.max ?? hi + pad}
                fill="hsl(var(--chart-2))"
                fillOpacity={0.1}
                stroke="hsl(var(--chart-2))"
                strokeOpacity={0.25}
                strokeDasharray="3 3"
              />
            )}

            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              tickMargin={8}
            />
            <YAxis
              domain={[lo - pad, hi + pad]}
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              width={52}
            />
            <Tooltip content={<TrendTooltip unit={active.unit} />} />
            <Line
              type="monotone"
              dataKey="value"
              stroke="hsl(var(--chart-1))"
              strokeWidth={2.5}
              dot={<FlagDot />}
              activeDot={{ r: 5, strokeWidth: 2, stroke: "hsl(var(--background))" }}
            />
          </LineChart>
        </ResponsiveContainer>

        <div className="mt-2 flex flex-wrap items-center justify-between gap-2 border-t pt-2.5 text-xs text-muted-foreground">
          <span>
            {active.referenceRange ? (
              <>
                Me'yor: <span className="font-medium text-foreground">{active.referenceRange}</span>
                {active.unit ? ` ${active.unit}` : ""}
              </>
            ) : (
              "Me'yoriy oraliq ko'rsatilmagan"
            )}
          </span>
          <span className="tabular">
            {formatDate(first.date)} — {formatDate(last.date)} · {active.points.length} ta o'lchov
          </span>
        </div>
      </div>
    </div>
  );
}

/** Coloured by the stored flag, so an out-of-range reading stands out on the line. */
function FlagDot(props: { cx?: number; cy?: number; payload?: Point }) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return null;
  const flag = payload?.flag;
  const fill =
    flag === "high" ? "hsl(var(--destructive))" : flag === "low" ? "#0284c7" : "hsl(var(--chart-1))";
  return <circle cx={cx} cy={cy} r={flag && flag !== "normal" ? 5 : 3.5} fill={fill} stroke="hsl(var(--background))" strokeWidth={2} />;
}

function TrendTooltip({
  active,
  payload,
  unit,
}: {
  active?: boolean;
  payload?: { payload: Point & { label: string } }[];
  unit: string | null;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-xl border bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      <p className="font-semibold tabular">
        {p.value}
        {unit ? ` ${unit}` : ""}
      </p>
      <p className="mt-0.5 text-muted-foreground tabular">
        {p.label} · #{p.orderNumber}
      </p>
      {p.flag && (
        <p
          className={cn(
            "mt-1 font-medium",
            p.flag === "high" && "text-rose-600 dark:text-rose-400",
            p.flag === "low" && "text-sky-600 dark:text-sky-400",
            p.flag === "normal" && "text-emerald-600 dark:text-emerald-400",
          )}
        >
          {FLAG_LABELS[p.flag]}
        </p>
      )}
    </div>
  );
}

/**
 * The change from first to last reading.
 *
 * Deliberately neutral in colour: for haemoglobin a rise is good, for glucose
 * it is not, and this component has no way to know which. It reports the
 * direction and leaves the judgement to the doctor.
 */
function TrendBadge({ delta, deltaPct }: { delta: number; deltaPct: number }) {
  const flat = Math.abs(deltaPct) < 1;
  const Icon = flat ? ArrowRight : delta > 0 ? ArrowUp : ArrowDown;
  const sign = delta > 0 ? "+" : "";
  const rounded = Math.abs(delta) < 1 ? delta.toFixed(2) : delta.toFixed(1);

  return (
    <Badge variant="secondary" className="gap-1 font-medium tabular">
      <Icon className="h-3 w-3" />
      {flat ? "O'zgarishsiz" : `${sign}${rounded}`}
    </Badge>
  );
}
