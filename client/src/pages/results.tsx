import { useEffect, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { CheckCircle2, ClipboardCheck, ClipboardList, Clock, Printer } from "lucide-react";
import type { OrderListResponse, OrderWithDetails } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Avatar,
  EmptyState,
  PageHeader,
  Pagination,
  ProgressRing,
  SampleBadge,
  StatusBadge,
  TableSkeleton,
} from "@/components/ui-kit";
import { SearchInput } from "@/components/inputs";
import { ExportButtons } from "@/components/export-buttons";
import type { ExportColumn } from "@/lib/export-types";
import { ResultsDialog } from "@/components/results-dialog";
import { PrintDialog } from "@/components/print-dialog";
import { OrderDetailDialog } from "@/components/order-detail-dialog";
import { useAuth } from "@/hooks/use-auth";
import { useDebounced } from "@/hooks/use-debounced";
import { FLAG_LABELS, formatDate, formatTime, timeAgo } from "@/lib/format";
import { cn } from "@/lib/utils";

type Queue = "waiting" | "ready";

const PAGE_SIZE = 24;

/**
 * One row per test rather than per order. The screen groups tests into order
 * cards, but a results export is read test-by-test — a doctor scanning for
 * out-of-range values needs each analyte on its own line.
 */
type ResultRow = {
  orderNumber: number;
  barcode: string;
  patientName: string;
  createdAt: string | Date;
  testName: string;
  result: string;
  unit: string;
  referenceRange: string;
  flag: string;
  enteredBy: string;
};

function toResultRows(orders: OrderWithDetails[]): ResultRow[] {
  return orders.flatMap((order) =>
    order.items.map((item) => ({
      orderNumber: order.orderNumber,
      barcode: order.sample?.barcode ?? "",
      patientName: order.patient?.fullName ?? "",
      createdAt: order.createdAt,
      testName: item.testName,
      result: item.result ?? "",
      unit: item.unit ?? "",
      referenceRange: item.referenceRange ?? "",
      flag: item.flag ? FLAG_LABELS[item.flag] : "",
      enteredBy: item.enteredBy ?? "",
    })),
  );
}

const EXPORT_COLUMNS: ExportColumn<ResultRow>[] = [
  { header: "Buyurtma №", value: (r) => r.orderNumber, type: "number", width: 12 },
  { header: "Barcode", value: (r) => r.barcode, width: 14 },
  { header: "Bemor", value: (r) => r.patientName, width: 26 },
  { header: "Sana", value: (r) => formatDate(r.createdAt), width: 12 },
  { header: "Tahlil", value: (r) => r.testName, width: 30 },
  { header: "Natija", value: (r) => r.result, width: 14 },
  { header: "Birlik", value: (r) => r.unit, width: 12 },
  { header: "Me'yor", value: (r) => r.referenceRange, width: 18 },
  { header: "Holat", value: (r) => r.flag, width: 12 },
  { header: "Laborant", value: (r) => r.enteredBy, width: 22 },
];

/**
 * The laborant's workbench: orders needing results on one tab, finished ones
 * ready to print on the other.
 */
export default function Results() {
  const { can } = useAuth();
  const [queue, setQueue] = useState<Queue>("waiting");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [editing, setEditing] = useState<OrderWithDetails | null>(null);
  const [printing, setPrinting] = useState<OrderWithDetails | null>(null);
  const [detail, setDetail] = useState<OrderWithDetails | null>(null);

  const debouncedSearch = useDebounced(search.trim(), 300);
  useEffect(() => setPage(0), [debouncedSearch, queue]);

  // The waiting/ready split is a server-side filter, so a busy day's backlog
  // never has to be shipped to the browser in full.
  const params = new URLSearchParams({
    search: debouncedSearch,
    queue,
    limit: String(PAGE_SIZE),
    offset: String(page * PAGE_SIZE),
  });

  const { data, isLoading, isFetching } = useQuery<OrderListResponse>({
    queryKey: [`/api/orders?${params.toString()}`],
    placeholderData: keepPreviousData,
  });

  const list = data?.items ?? [];
  const total = data?.total ?? 0;
  const queueCounts = data?.summary.results ?? { waiting: 0, ready: 0 };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Laboratoriya"
        title="Natijalar"
        description={
          queueCounts.waiting > 0
            ? `${queueCounts.waiting} ta buyurtma natijasi kutilmoqda`
            : "Barcha tahlil natijalari kiritilgan"
        }
        actions={
          <ExportButtons
            testIdPrefix="export-results"
            disabled={isLoading}
            build={() => ({
              filename: queue === "waiting" ? "natijalar-kutilmoqda" : "natijalar-tayyor",
              title: queue === "waiting" ? "Kutilayotgan natijalar" : "Tayyor natijalar",
              subtitle: [
                debouncedSearch ? `Qidiruv: "${debouncedSearch}"` : null,
                `${list.length} ta buyurtma (${page + 1}-sahifa, jami ${total} ta)`,
              ]
                .filter(Boolean)
                .join(" · "),
              columns: EXPORT_COLUMNS,
              rows: toResultRows(list),
            })}
          />
        }
      />

      <div className="card-premium flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={queue} onValueChange={(v) => setQueue(v as Queue)}>
          <TabsList>
            <TabsTrigger value="waiting" data-testid="tab-waiting">
              <Clock className="mr-1.5 h-3.5 w-3.5" />
              Kutilmoqda
              <Badge variant="secondary" className="ml-2 tabular">{queueCounts.waiting}</Badge>
            </TabsTrigger>
            <TabsTrigger value="ready" data-testid="tab-ready">
              <CheckCircle2 className="mr-1.5 h-3.5 w-3.5" />
              Tayyor
              <Badge variant="secondary" className="ml-2 tabular">{queueCounts.ready}</Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Bemor, telefon, № yoki tahlil..."
          className="lg:w-80"
          data-testid="input-search-results"
        />
      </div>

      {isLoading ? (
        <div className="card-premium">
          <TableSkeleton />
        </div>
      ) : list.length === 0 ? (
        <div className="card-premium">
          <EmptyState
            icon={queue === "waiting" ? CheckCircle2 : ClipboardList}
            title={queue === "waiting" ? "Navbatda hech narsa yo'q" : "Tayyor natija yo'q"}
            description={
              queue === "waiting"
                ? "Barcha tahlil natijalari kiritilgan. Yangi buyurtma kelganda shu yerda paydo bo'ladi."
                : "Natijalarni kiritganingizdan keyin blankalar shu yerda to'planadi."
            }
          />
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {list.map((order) => {
            const done = order.items.filter((i) => i.result).length;
            return (
              <article key={order.id} className="card-premium flex flex-col gap-4 p-5">
                <div className="flex items-start justify-between gap-3">
                  <button
                    type="button"
                    onClick={() => setDetail(order)}
                    className="flex min-w-0 items-center gap-3 text-left"
                  >
                    <Avatar name={order.patient?.fullName ?? "??"} />
                    <div className="min-w-0">
                      <p className="truncate font-medium">{order.patient?.fullName ?? "—"}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        <span className="tabular">#{order.orderNumber}</span> · {timeAgo(order.createdAt)}
                      </p>
                    </div>
                  </button>
                  <ProgressRing value={done} max={order.items.length} />
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {order.items.slice(0, 4).map((item) => (
                    <Badge
                      key={item.id}
                      variant="secondary"
                      className={cn(
                        "max-w-full truncate text-xs font-normal",
                        item.result && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
                      )}
                    >
                      {item.testName}
                    </Badge>
                  ))}
                  {order.items.length > 4 && (
                    <Badge variant="outline" className="text-xs">+{order.items.length - 4}</Badge>
                  )}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-xs text-muted-foreground">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <StatusBadge status={order.status} />
                    {/* The tube's state, on the card rather than one click in:
                        this is the queue where someone decides what to run
                        next, and a rejected tube must be visible before it is
                        picked up. */}
                    {order.sample && <SampleBadge status={order.sample.status} />}
                  </div>
                  <span className="tabular">
                    {formatDate(order.createdAt)} · {formatTime(order.createdAt)}
                  </span>
                </div>

                <div className="mt-auto flex gap-2">
                  {can("laborant") && (
                    <Button
                      variant={queue === "waiting" ? "default" : "outline"}
                      className="flex-1"
                      onClick={() => setEditing(order)}
                      data-testid={`button-enter-results-${order.orderNumber}`}
                    >
                      <ClipboardCheck className="mr-2 h-4 w-4" />
                      {queue === "waiting" ? "Kiritish" : "Tahrirlash"}
                    </Button>
                  )}
                  <Button
                    variant={queue === "ready" && can("laborant") ? "default" : "outline"}
                    className={can("laborant") ? "" : "flex-1"}
                    onClick={() => setPrinting(order)}
                    data-testid={`button-print-${order.orderNumber}`}
                  >
                    <Printer className="mr-2 h-4 w-4" />
                    Blanka
                  </Button>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {total > PAGE_SIZE && (
        <div className="card-premium overflow-hidden">
          <Pagination
            page={page}
            pageSize={PAGE_SIZE}
            total={total}
            onPageChange={setPage}
            isFetching={isFetching}
            className="border-t-0"
          />
        </div>
      )}

      <ResultsDialog open={Boolean(editing)} onOpenChange={(o) => !o && setEditing(null)} order={editing} />
      <PrintDialog open={Boolean(printing)} onOpenChange={(o) => !o && setPrinting(null)} order={printing} />
      <OrderDetailDialog
        open={Boolean(detail)}
        onOpenChange={(o) => !o && setDetail(null)}
        order={detail}
        onEnterResults={(o) => {
          setDetail(null);
          setEditing(o);
        }}
        onPrint={(o) => {
          setDetail(null);
          setPrinting(o);
        }}
      />
    </div>
  );
}
