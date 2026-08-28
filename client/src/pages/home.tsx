import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ArrowRight,
  BarChart3,
  ClipboardCheck,
  Clock,
  FileCheck2,
  FlaskConical,
  Inbox,
  Sparkles,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import {
  ORDER_STATUS_LABELS,
  type DashboardStatsData,
  type OrderListResponse,
  type OrderWithDetails,
} from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Avatar,
  EmptyState,
  Money,
  PaymentBadge,
  SectionCard,
  StatCard,
  StatusBadge,
} from "@/components/ui-kit";
import { ExportButtons } from "@/components/export-buttons";
import type { ExportColumn, ExportSection } from "@/lib/export-types";
import { OrderDialog } from "@/components/order-dialog";
import { PatientDialog } from "@/components/patient-dialog";
import { OrderDetailDialog } from "@/components/order-detail-dialog";
import { ResultsDialog } from "@/components/results-dialog";
import { PrintDialog } from "@/components/print-dialog";
import { useAuth } from "@/hooks/use-auth";
import { formatDate, formatPhone, formatTime, formatWeekdayDate, money, timeAgo } from "@/lib/format";

/** The recent-orders feed, as it is shown — see lib/export.ts. */
const EXPORT_COLUMNS: ExportColumn<OrderWithDetails>[] = [
  { header: "№", value: (o) => o.orderNumber, type: "number", width: 8 },
  { header: "Bemor", value: (o) => o.patient?.fullName ?? "", width: 26 },
  { header: "Telefon", value: (o) => formatPhone(o.patient?.phone, true), width: 18 },
  { header: "Vaqt", value: (o) => `${formatDate(o.createdAt)} ${formatTime(o.createdAt)}`, width: 18 },
  { header: "Tahlillar", value: (o) => o.items.length, type: "number", width: 10 },
  { header: "Holat", value: (o) => ORDER_STATUS_LABELS[o.status], width: 13 },
  { header: "Jami", value: (o) => o.totalAmount, type: "money", width: 14, total: true },
  { header: "To'langan", value: (o) => o.paidAmount, type: "money", width: 14, total: true },
];

export default function Home() {
  const [, setLocation] = useLocation();
  const { user, can } = useAuth();

  const [orderOpen, setOrderOpen] = useState(false);
  const [patientOpen, setPatientOpen] = useState(false);
  const [detail, setDetail] = useState<OrderWithDetails | null>(null);
  const [results, setResults] = useState<OrderWithDetails | null>(null);
  const [printing, setPrinting] = useState<OrderWithDetails | null>(null);

  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStatsData>({
    queryKey: ["/api/stats"],
  });

  const { data: recent, isLoading: ordersLoading } = useQuery<OrderListResponse>({
    queryKey: ["/api/orders?limit=6"],
  });

  const orders = recent?.items ?? [];
  // Names are stored "Familiya Ism Otasining-ismi", so the given name is the
  // second word when there is one.
  const nameParts = (user?.fullName ?? "").trim().split(/\s+/);
  const firstName = nameParts[1] ?? nameParts[0] ?? "";
  const collected = (stats?.todayRevenue ?? 0);
  const debt = stats?.unpaidAmount ?? 0;

  /**
   * The day's snapshot: the headline numbers first, then the recent-orders
   * feed the dashboard shows underneath them.
   */
  const buildExport = () => {
    const summary: ExportSection = {
      title: "Bugungi ko'rsatkichlar",
      columns: [
        { header: "Ko'rsatkich", width: 28 },
        { header: "Qiymat", type: "number", width: 18 },
      ],
      rows: [
        ["Bugungi bemorlar", stats?.todayPatients ?? 0],
        ["Bazadagi jami bemorlar", stats?.totalPatients ?? 0],
        ["Kutilayotgan tahlillar", stats?.pendingTests ?? 0],
        ["Tayyor tahlillar", stats?.readyTests ?? 0],
      ],
    };
    const finance: ExportSection = {
      title: "Moliya",
      columns: [
        { header: "Ko'rsatkich", width: 28 },
        { header: "Summa", type: "money", width: 18 },
      ],
      rows: [
        ["Bugungi tushum", collected],
        ["Umumiy qarzdorlik", debt],
      ],
    };

    return {
      filename: "kunlik-hisobot",
      title: "Kunlik hisobot",
      subtitle: formatWeekdayDate(),
      sheetName: "Kunlik hisobot",
      columns: EXPORT_COLUMNS,
      rows: orders,
      sections: [summary, finance],
    };
  };

  return (
    <div className="space-y-6">
      {/* ------------------------------------------------------------ hero */}
      <section className="card-premium hero-band overflow-hidden p-6 sm:p-8">
        <div className="relative z-10 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              {formatWeekdayDate()}
            </p>
            <h1 className="mt-2 text-[28px] font-bold leading-tight tracking-tight text-foreground sm:text-[34px]">
              Salom, {firstName}
            </h1>
            <p className="mt-2 max-w-xl text-[15px] text-foreground/85">
              Bugun laboratoriyada {stats?.todayPatients ?? 0} ta bemor qabul qilindi va{" "}
              {money(collected)} tushum yig'ildi.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            {/* On the hero band the outline buttons need light-on-dark styling. */}
            <ExportButtons
              testIdPrefix="export-dashboard"
              disabled={statsLoading || ordersLoading}
              build={buildExport}
            />
            {can("registrator") && (
              <>
                <Button
                  variant="secondary"
                  onClick={() => setPatientOpen(true)}
                  data-testid="button-new-patient"
                >
                  <UserPlus className="mr-2 h-4 w-4" />
                  Yangi bemor
                </Button>
                <Button
                  onClick={() => setOrderOpen(true)}
                  data-testid="button-new-order"
                >
                  <FlaskConical className="mr-2 h-4 w-4" />
                  Yangi buyurtma
                </Button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* ----------------------------------------------------------- stats */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          index={0}
          label="Bugungi bemorlar"
          value={stats?.todayPatients ?? 0}
          hint={`Bazada jami ${stats?.totalPatients ?? 0} ta bemor`}
          icon={Users}
          isLoading={statsLoading}
          onClick={() => setLocation("/patients")}
        />
        <StatCard
          index={1}
          label="Kutilayotgan tahlillar"
          value={stats?.pendingTests ?? 0}
          hint="Natijasi kiritilmagan"
          icon={Clock}
          tone="amber"
          isLoading={statsLoading}
          onClick={() => setLocation("/results")}
        />
        <StatCard
          index={2}
          label="Tayyor tahlillar"
          value={stats?.readyTests ?? 0}
          hint="Blanka chop etishga tayyor"
          icon={FileCheck2}
          tone="emerald"
          isLoading={statsLoading}
          onClick={() => setLocation("/results")}
        />
        <StatCard
          index={3}
          label="Bugungi tushum"
          value={money(collected, false)}
          suffix="so'm"
          hint={
            debt > 0 ? (
              <span className="text-rose-600 dark:text-rose-400">
                Qarzdorlik: {money(debt)}
              </span>
            ) : (
              "Qarzdorlik yo'q"
            )
          }
          icon={Wallet}
          tone="violet"
          isLoading={statsLoading}
        />
      </div>

      {/* ------------------------------------------------- recent + actions */}
      <div className="grid gap-5 xl:grid-cols-3">
        <SectionCard
          className="xl:col-span-2"
          icon={TrendingUp}
          title="So'nggi buyurtmalar"
          description="Oxirgi qabul qilingan tahlillar"
          flush
          action={
            <Button variant="ghost" size="sm" onClick={() => setLocation("/orders")} data-testid="link-all-orders">
              Barchasi
              <ArrowRight className="ml-1.5 h-4 w-4" />
            </Button>
          }
        >
          {ordersLoading ? (
            <div className="space-y-2 p-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full skeleton-shimmer" />
              ))}
            </div>
          ) : orders.length === 0 ? (
            <EmptyState
              icon={Inbox}
              title="Hali buyurtma yo'q"
              description="Birinchi bemorni ro'yxatdan o'tkazing va unga tahlil buyurtma qiling."
              action={
                can("registrator") ? (
                  <Button onClick={() => setOrderOpen(true)}>
                    <FlaskConical className="mr-2 h-4 w-4" />
                    Birinchi buyurtma
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <div className="divide-y">
              {orders.map((order) => (
                <button
                  key={order.id}
                  type="button"
                  onClick={() => setDetail(order)}
                  className="flex w-full items-center gap-4 p-4 text-left transition-colors hover:bg-muted/50"
                  data-testid={`row-order-${order.orderNumber}`}
                >
                  <Avatar name={order.patient?.fullName ?? "??"} />

                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {order.patient?.fullName ?? "Noma'lum bemor"}
                    </p>
                    <p className="mt-0.5 text-[13px] text-muted-foreground">
                      <span className="tabular">#{order.orderNumber}</span> · {order.items.length} ta
                      tahlil · {timeAgo(order.createdAt)}
                    </p>
                  </div>

                  <div className="hidden shrink-0 items-center gap-2 sm:flex">
                    <PaymentBadge total={order.totalAmount} paid={order.paidAmount} />
                    <StatusBadge status={order.status} />
                  </div>

                  <Money
                    value={order.totalAmount}
                    className="hidden shrink-0 font-semibold md:block"
                  />
                </button>
              ))}
            </div>
          )}
        </SectionCard>

        <div className="space-y-5">
          <SectionCard icon={Sparkles} title="Tezkor amallar" bodyClassName="space-y-2">
            {can("registrator") && (
              <>
                <QuickAction
                  icon={UserPlus}
                  label="Bemorni ro'yxatga olish"
                  hint="F.I.Sh va telefon yetarli"
                  onClick={() => setPatientOpen(true)}
                />
                <QuickAction
                  icon={FlaskConical}
                  label="Tahlil buyurtma qilish"
                  hint="Summa avtomatik hisoblanadi"
                  onClick={() => setOrderOpen(true)}
                />
              </>
            )}
            {can("laborant") && (
              <QuickAction
                icon={ClipboardCheck}
                label="Natija kiritish"
                hint={`${stats?.pendingTests ?? 0} ta tahlil navbatda`}
                onClick={() => setLocation("/results")}
              />
            )}
            {can("admin") && (
              <QuickAction
                icon={BarChart3}
                label="Hisobotni ko'rish"
                hint="Tushum va statistika"
                onClick={() => setLocation("/reports")}
              />
            )}
          </SectionCard>

          <SectionCard icon={Wallet} title="Moliya holati" bodyClassName="space-y-3.5">
            <SummaryRow label="Bugungi tushum" value={<Money value={collected} className="font-semibold" />} />
            <div className="rule-soft" />
            <SummaryRow
              label="Umumiy qarzdorlik"
              value={
                <Money
                  value={debt}
                  className={debt > 0 ? "font-semibold text-rose-600 dark:text-rose-400" : "font-semibold"}
                />
              }
            />
            <div className="rule-soft" />
            <SummaryRow
              label="Navbatdagi tahlillar"
              value={<span className="font-semibold tabular">{stats?.pendingTests ?? 0} ta</span>}
            />
          </SectionCard>
        </div>
      </div>

      <OrderDialog open={orderOpen} onOpenChange={setOrderOpen} />
      <PatientDialog open={patientOpen} onOpenChange={setPatientOpen} />
      <OrderDetailDialog
        open={Boolean(detail)}
        onOpenChange={(o) => !o && setDetail(null)}
        order={detail}
        onEnterResults={(o) => {
          setDetail(null);
          setResults(o);
        }}
        onPrint={(o) => {
          setDetail(null);
          setPrinting(o);
        }}
      />
      <ResultsDialog open={Boolean(results)} onOpenChange={(o) => !o && setResults(null)} order={results} />
      <PrintDialog open={Boolean(printing)} onOpenChange={(o) => !o && setPrinting(null)} order={printing} />
    </div>
  );
}

function QuickAction({
  icon: Icon,
  label,
  hint,
  onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-center gap-3 rounded-xl border bg-card p-3 text-left transition-all hover:border-primary/35 hover:bg-primary/[0.04]"
    >
      <div className="icon-tile h-9 w-9 bg-primary/10 text-primary">
        <Icon className="h-[18px] w-[18px]" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{label}</p>
        <p className="truncate text-xs text-muted-foreground">{hint}</p>
      </div>
      <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-primary" />
    </button>
  );
}

function SummaryRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {value}
    </div>
  );
}
