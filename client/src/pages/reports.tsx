import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart3,
  FlaskConical,
  PiggyBank,
  PieChart as PieIcon,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import type { RevenueReportData } from "@shared/schema";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState, MeterBar, PageHeader, SectionCard, StatCard } from "@/components/ui-kit";
import { ExportButtons } from "@/components/export-buttons";
import type { ExportDoc, ExportSection } from "@/lib/export-types";
import { dayKey, daysAgo, formatDate, money, moneyShort } from "@/lib/format";

const RANGES = [
  { key: "7", label: "7 kun" },
  { key: "30", label: "30 kun" },
  { key: "90", label: "3 oy" },
  { key: "365", label: "1 yil" },
] as const;

const PIE_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
];

const AXIS_TICK = { fontSize: 12, fill: "hsl(var(--muted-foreground))" } as const;

/** Recharts' default tooltip ignores our tokens; this one matches the popovers. */
function ChartTooltip({
  active,
  payload,
  label,
  asMoney,
}: {
  active?: boolean;
  payload?: { name?: string; value?: number; color?: string; dataKey?: string }[];
  label?: string;
  asMoney?: boolean;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border bg-popover/95 px-3 py-2 text-xs shadow-lg backdrop-blur">
      {label && <p className="mb-1.5 font-semibold">{label}</p>}
      <div className="space-y-1">
        {payload.map((entry, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: entry.color }} />
            <span className="text-muted-foreground">{entry.name}</span>
            <span className="ml-auto font-semibold tabular">
              {asMoney ? money(entry.value ?? 0) : entry.value}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function Reports() {
  const [range, setRange] = useState<(typeof RANGES)[number]["key"]>("30");

  const from = daysAgo(Number(range) - 1);
  const to = dayKey(new Date());

  const { data, isLoading } = useQuery<RevenueReportData>({
    queryKey: [`/api/reports/revenue?from=${from}&to=${to}`],
  });

  const chartData = useMemo(
    () => (data?.points ?? []).map((p) => ({ ...p, label: formatDate(p.date).slice(0, 5) })),
    [data],
  );

  const avgCheck = data && data.totalPatients > 0 ? data.totalRevenue / data.totalPatients : 0;

  /**
   * Everything the screen shows, in the order it shows it — an export that
   * omits the profit line would send the accountant back for a screenshot.
   */
  const buildExport = (): ExportDoc<RevenueReportData["points"][number]> | null => {
    if (!data || data.points.length === 0) return null;

    const sections: ExportSection[] = [
      {
        title: "Moliya",
        columns: [
          { header: "Ko'rsatkich", width: 26 },
          { header: "Summa", type: "money", width: 18 },
        ],
        rows: [
          ["Umumiy tushum", data.totalRevenue],
          ["To'langan", data.totalPaid],
          ["Qarzdorlik", Math.max(0, data.totalRevenue - data.totalPaid)],
          ["Xarajat", data.totalExpenses],
          ["Sof foyda", data.netProfit],
          ["O'rtacha chek", avgCheck],
        ],
      },
    ];

    if (data.byCategory.length) {
      sections.push({
        title: "Kategoriyalar bo'yicha tushum",
        columns: [
          { header: "Kategoriya", width: 26 },
          { header: "Tushum", type: "money", width: 18 },
        ],
        rows: data.byCategory.map((c) => [c.category, c.revenue]),
      });
    }
    if (data.expensesByCategory.length) {
      sections.push({
        title: "Xarajatlar kategoriya bo'yicha",
        columns: [
          { header: "Kategoriya", width: 26 },
          { header: "Summa", type: "money", width: 18 },
        ],
        rows: data.expensesByCategory.map((e) => [e.category, e.amount]),
      });
    }
    if (data.byReferrer.length) {
      sections.push({
        title: "Yo'naltirgan shifokorlar",
        columns: [
          { header: "Shifokor", width: 26 },
          { header: "Bemorlar", type: "number", width: 12 },
          { header: "Tushum", type: "money", width: 18 },
        ],
        rows: data.byReferrer.map((r) => [r.referrer, r.patients, r.revenue]),
      });
    }
    if (data.topTests.length) {
      sections.push({
        title: "Eng ko'p buyurtma qilingan tahlillar",
        columns: [
          { header: "Tahlil", width: 30 },
          { header: "Soni", type: "number", width: 10 },
          { header: "Tushum", type: "money", width: 18 },
        ],
        rows: data.topTests.map((t) => [t.name, t.count, t.revenue]),
      });
    }

    return {
      filename: "hisobot",
      title: "Moliyaviy hisobot",
      subtitle: `${formatDate(from)} — ${formatDate(to)} · ${data.points.length} kun`,
      sheetName: "Hisobot",
      orientation: "portrait",
      columns: [
        { header: "Sana", value: (p) => formatDate(p.date), width: 14 },
        { header: "Bemorlar", value: (p) => p.patients, type: "number", width: 12, total: true },
        { header: "Tahlillar", value: (p) => p.tests, type: "number", width: 12, total: true },
        { header: "Tushum", value: (p) => p.revenue, type: "money", width: 18, total: true },
      ],
      rows: data.points,
      sections,
    };
  };

  const topCategories = data?.byCategory.slice(0, 5) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Analitika"
        title="Hisobotlar"
        description={`${formatDate(from)} — ${formatDate(to)} oralig'idagi ko'rsatkichlar`}
        actions={
          <>
            <Tabs value={range} onValueChange={(v) => setRange(v as typeof range)}>
              <TabsList>
                {RANGES.map((r) => (
                  <TabsTrigger key={r.key} value={r.key} data-testid={`tab-range-${r.key}`}>
                    {r.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <ExportButtons testIdPrefix="export-report" disabled={isLoading} build={buildExport} />
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          index={0}
          label="Umumiy tushum"
          value={money(data?.totalRevenue ?? 0, false)}
          suffix="so'm"
          hint={`To'langan: ${money(data?.totalPaid ?? 0)}`}
          icon={Wallet}
          tone="violet"
          isLoading={isLoading}
        />
        <StatCard
          index={1}
          label="Bemorlar"
          value={data?.totalPatients ?? 0}
          hint="Noyob bemorlar soni"
          icon={Users}
          isLoading={isLoading}
        />
        <StatCard
          index={2}
          label="Tahlillar"
          value={data?.totalTests ?? 0}
          hint="Bajarilgan tahlillar"
          icon={FlaskConical}
          tone="emerald"
          isLoading={isLoading}
        />
        <StatCard
          index={3}
          label="Sof foyda"
          value={money(data?.netProfit ?? 0, false)}
          suffix="so'm"
          hint={`Xarajat: ${money(data?.totalExpenses ?? 0)} · O'rtacha chek: ${money(avgCheck)}`}
          icon={PiggyBank}
          tone={(data?.netProfit ?? 0) < 0 ? "rose" : "emerald"}
          isLoading={isLoading}
        />
      </div>

      {isLoading ? (
        <Skeleton className="h-80 w-full skeleton-shimmer rounded-2xl" />
      ) : chartData.length === 0 ? (
        <div className="card-premium">
          <EmptyState
            icon={BarChart3}
            title="Bu davrda ma'lumot yo'q"
            description="Boshqa vaqt oralig'ini tanlang yoki birinchi buyurtmani yarating."
          />
        </div>
      ) : (
        <>
          <SectionCard
            icon={TrendingUp}
            title="Kunlik tushum"
            description={`${chartData.length} kunlik dinamika`}
          >
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={chartData} margin={{ left: 4, right: 8, top: 8 }}>
                <defs>
                  <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.4} />
                    <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} tickMargin={8} />
                <YAxis
                  tickFormatter={moneyShort}
                  tick={AXIS_TICK}
                  tickLine={false}
                  axisLine={false}
                  width={80}
                />
                <Tooltip
                  cursor={{ stroke: "hsl(var(--primary) / 0.35)", strokeWidth: 1.5 }}
                  content={<ChartTooltip asMoney />}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  name="Tushum"
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={2.5}
                  fill="url(#revenueFill)"
                  activeDot={{ r: 4, strokeWidth: 2, stroke: "hsl(var(--background))" }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </SectionCard>

          <div className="grid gap-5 lg:grid-cols-2">
            <SectionCard icon={BarChart3} title="Kunlik bemorlar va tahlillar">
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={chartData} margin={{ left: -12, right: 8, top: 8 }}>
                  <CartesianGrid strokeDasharray="4 4" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="label" tick={AXIS_TICK} tickLine={false} axisLine={false} tickMargin={8} />
                  <YAxis tick={AXIS_TICK} tickLine={false} axisLine={false} />
                  <Tooltip cursor={{ fill: "hsl(var(--muted) / 0.6)" }} content={<ChartTooltip />} />
                  <Legend
                    verticalAlign="top"
                    align="right"
                    height={30}
                    iconType="circle"
                    iconSize={8}
                    wrapperStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="patients" name="Bemorlar" fill="hsl(var(--chart-2))" radius={[5, 5, 0, 0]} />
                  <Bar dataKey="tests" name="Tahlillar" fill="hsl(var(--chart-4))" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </SectionCard>

            <SectionCard icon={PieIcon} title="Kategoriyalar bo'yicha tushum">
              {topCategories.length === 0 ? (
                <p className="py-16 text-center text-sm text-muted-foreground">Ma'lumot yo'q</p>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={220}>
                    <PieChart>
                      <Pie
                        data={topCategories}
                        dataKey="revenue"
                        nameKey="category"
                        innerRadius={58}
                        outerRadius={92}
                        paddingAngle={3}
                        stroke="hsl(var(--card))"
                        strokeWidth={2}
                      >
                        {topCategories.map((_, i) => (
                          <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<ChartTooltip asMoney />} />
                    </PieChart>
                  </ResponsiveContainer>

                  <div className="mt-4 space-y-2">
                    {topCategories.map((c, i) => (
                      <div key={c.category} className="flex items-center gap-2.5 text-sm">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                        />
                        <span className="flex-1 truncate text-muted-foreground">{c.category}</span>
                        <span className="tabular font-medium">{money(c.revenue)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </SectionCard>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            <SectionCard icon={Wallet} title="Xarajatlar kategoriya bo'yicha">
              {(data?.expensesByCategory.length ?? 0) === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Bu davrda xarajat kiritilmagan
                </p>
              ) : (
                <div className="space-y-4">
                  {data!.expensesByCategory.map((e) => (
                    <MeterBar
                      key={e.category}
                      value={e.amount}
                      max={data!.expensesByCategory[0].amount || 1}
                      barClassName="bg-rose-500"
                      label={
                        <>
                          <span className="truncate text-foreground">{e.category}</span>
                          <span className="shrink-0 tabular">{money(e.amount)}</span>
                        </>
                      }
                    />
                  ))}
                </div>
              )}
            </SectionCard>

            <SectionCard
              icon={UserCheck}
              title="Yo'naltirgan shifokorlar"
              description="Kim ko'proq bemor yubordi"
            >
              {(data?.byReferrer.length ?? 0) === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Ma'lumot yo'q</p>
              ) : (
                <div className="space-y-4">
                  {data!.byReferrer.map((r) => (
                    <MeterBar
                      key={r.referrer}
                      value={r.revenue}
                      max={data!.byReferrer[0].revenue || 1}
                      label={
                        <>
                          <span className="truncate text-foreground">{r.referrer}</span>
                          <span className="shrink-0 tabular">
                            {r.patients} ta · {money(r.revenue)}
                          </span>
                        </>
                      }
                    />
                  ))}
                </div>
              )}
            </SectionCard>
          </div>

          <SectionCard icon={FlaskConical} title="Eng ko'p buyurtma qilingan tahlillar">
            {(data?.topTests.length ?? 0) === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">Ma'lumot yo'q</p>
            ) : (
              <div className="space-y-4">
                {data!.topTests.map((t, i) => {
                  const max = data!.topTests[0].count || 1;
                  return (
                    <div key={t.name} className="flex items-center gap-3">
                      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-muted text-xs font-semibold tabular text-muted-foreground">
                        {i + 1}
                      </span>
                      <MeterBar
                        className="min-w-0 flex-1"
                        value={t.count}
                        max={max}
                        label={
                          <>
                            <span className="truncate text-foreground">{t.name}</span>
                            <span className="shrink-0 tabular">
                              {t.count} ta · {money(t.revenue)}
                            </span>
                          </>
                        }
                      />
                    </div>
                  );
                })}
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
