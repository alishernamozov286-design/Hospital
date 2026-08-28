import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import {
  ClipboardCheck,
  Database,
  FlaskConical,
  MoreVertical,
  Pencil,
  Printer,
  Receipt,
  Trash2,
} from "lucide-react";
import {
  ORDER_STATUSES,
  ORDER_STATUS_LABELS,
  type OrderListResponse,
  type OrderStatus,
  type OrderWithDetails,
} from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  Avatar,
  EmptyState,
  MeterBar,
  Money,
  PageHeader,
  Pagination,
  PaymentBadge,
  PhoneText,
  SampleBadge,
  StatusBadge,
  TableSkeleton,
} from "@/components/ui-kit";
import { SearchInput } from "@/components/inputs";
import { SampleScan } from "@/components/sample-scan";
import { ExportButtons } from "@/components/export-buttons";
import type { ExportColumn } from "@/lib/export-types";
import { OrderDialog } from "@/components/order-dialog";
import { OrderDetailDialog } from "@/components/order-detail-dialog";
import { ResultsDialog } from "@/components/results-dialog";
import { PrintDialog } from "@/components/print-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { apiRequest, invalidateApi } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useDebounced } from "@/hooks/use-debounced";
import { formatDate, formatPhone, formatTime, money } from "@/lib/format";

type Filter = OrderStatus | "all";

const PAGE_SIZE = 25;

/** Shared by the Excel and PDF writers — see lib/export.ts. */
const EXPORT_COLUMNS: ExportColumn<OrderWithDetails>[] = [
  { header: "№", value: (o) => o.orderNumber, type: "number", width: 8 },
  { header: "Sana", value: (o) => formatDate(o.createdAt), width: 12 },
  { header: "Bemor", value: (o) => o.patient?.fullName ?? "", width: 26 },
  { header: "Telefon", value: (o) => formatPhone(o.patient?.phone, true), width: 18 },
  { header: "Tahlillar", value: (o) => o.items.map((i) => i.testName).join(", "), width: 40 },
  { header: "Soni", value: (o) => o.items.length, type: "number", width: 7 },
  { header: "Holat", value: (o) => ORDER_STATUS_LABELS[o.status], width: 13 },
  { header: "Jami", value: (o) => o.totalAmount, type: "money", width: 14, total: true },
  { header: "To'langan", value: (o) => o.paidAmount, type: "money", width: 14, total: true },
  {
    header: "Qarz",
    value: (o) => Math.max(0, o.totalAmount - o.paidAmount),
    type: "money",
    width: 14,
    total: true,
  },
];

const EMPTY_SUMMARY: OrderListResponse["summary"] = {
  counts: { all: 0, pending: 0, in_progress: 0, completed: 0, cancelled: 0 },
  results: { waiting: 0, ready: 0 },
  totals: { sum: 0, paid: 0, debt: 0 },
};

export default function Orders() {
  const { toast } = useToast();
  const { can } = useAuth();

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [page, setPage] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);
  const [detail, setDetail] = useState<OrderWithDetails | null>(null);
  const [results, setResults] = useState<OrderWithDetails | null>(null);
  const [printing, setPrinting] = useState<OrderWithDetails | null>(null);
  const [deleting, setDeleting] = useState<OrderWithDetails | null>(null);
  const [editing, setEditing] = useState<OrderWithDetails | null>(null);

  const debouncedSearch = useDebounced(search.trim(), 300);
  useEffect(() => setPage(0), [debouncedSearch, filter]);

  const params = new URLSearchParams({
    search: debouncedSearch,
    limit: String(PAGE_SIZE),
    offset: String(page * PAGE_SIZE),
  });
  if (filter !== "all") params.set("status", filter);

  const { data, isLoading, isFetching } = useQuery<OrderListResponse>({
    queryKey: [`/api/orders?${params.toString()}`],
    placeholderData: keepPreviousData,
  });

  const orders = data?.items ?? [];
  const total = data?.total ?? 0;
  // Counts and money come from the server: they describe the whole filter,
  // not just the 25 rows currently on screen.
  const { counts, totals } = data?.summary ?? EMPTY_SUMMARY;

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/orders/${id}`);
    },
    onSuccess: () => {
      invalidateApi("/api/orders", "/api/stats");
      toast({ title: "Buyurtma o'chirildi" });
      setDeleting(null);
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "O'chirilmadi", description: err.message });
    },
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Qabul jurnali"
        title="Buyurtmalar"
        description="Barcha tahlil buyurtmalari, bajarilish holati va to'lovlari"
        actions={
          <div className="flex items-center gap-2">
            {can("admin") && (
              <ExportButtons
                testIdPrefix="export-orders"
                disabled={isLoading}
                build={() => ({
                  filename: "buyurtmalar",
                  title: "Buyurtmalar",
                  subtitle: [
                    filter === "all" ? "Barcha holatlar" : ORDER_STATUS_LABELS[filter],
                    debouncedSearch ? `qidiruv: "${debouncedSearch}"` : null,
                    `${orders.length} ta yozuv (${page + 1}-sahifa, jami ${total} ta)`,
                  ]
                    .filter(Boolean)
                    .join(" · "),
                  columns: EXPORT_COLUMNS,
                  rows: orders,
                })}
              />
            )}
            {/* Server-side, so the file holds every match rather than the
                25 rows on screen — the form an accountant actually wants. */}
            {can("admin") && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" asChild aria-label="Butun bazani CSV yuklab olish">
                    <a
                      href={`/api/export/orders.csv?search=${encodeURIComponent(debouncedSearch)}`}
                      data-testid="link-export-orders"
                    >
                      <Database className="h-4 w-4" />
                    </a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Butun baza (CSV)</TooltipContent>
              </Tooltip>
            )}
            {can("registrator") && (
              <Button onClick={() => setCreateOpen(true)} data-testid="button-new-order" className="shadow-brand">
                <FlaskConical className="mr-2 h-4 w-4" />
                Yangi buyurtma
              </Button>
            )}
          </div>
        }
      />

      {/* ------------------------------------------------------ money strip */}
      <div className="grid gap-4 sm:grid-cols-3">
        <TotalTile label="Jami summa" value={totals.sum} tone="text-foreground" />
        <TotalTile label="To'langan" value={totals.paid} tone="text-emerald-600 dark:text-emerald-400" />
        <TotalTile label="Qarzdorlik" value={totals.debt} tone="text-rose-600 dark:text-rose-400" />
      </div>

      {/* --------------------------------------------------------- toolbar */}
      <div className="card-premium flex flex-col gap-3 p-3 lg:flex-row lg:items-center lg:justify-between">
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList className="h-auto flex-wrap">
            <TabsTrigger value="all" data-testid="tab-all">
              Barchasi
              <Badge variant="secondary" className="ml-2 tabular">{counts.all}</Badge>
            </TabsTrigger>
            {ORDER_STATUSES.map((status) => (
              <TabsTrigger key={status} value={status} data-testid={`tab-${status}`}>
                {ORDER_STATUS_LABELS[status]}
                <Badge variant="secondary" className="ml-2 tabular">{counts[status]}</Badge>
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>

        <div className="flex flex-col gap-3 sm:flex-row lg:items-center">
          {/* Opens the order the tube belongs to, which is where its status
              buttons live — so a scan goes straight to the action. */}
          {can("registrator", "laborant") && (
            <SampleScan onFound={setDetail} className="sm:w-52" />
          )}
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Bemor, telefon, № yoki tahlil..."
            className="lg:w-80"
            data-testid="input-search-orders"
          />
        </div>
      </div>

      {/* ----------------------------------------------------------- table */}
      <div className="card-premium overflow-hidden">
        {isLoading ? (
          <TableSkeleton />
        ) : orders.length === 0 ? (
          <EmptyState
            icon={Receipt}
            title={counts.all === 0 ? "Hali buyurtma yo'q" : "Filtrga mos buyurtma topilmadi"}
            description={
              counts.all === 0
                ? "Bemorni tanlab, unga kerakli tahlillarni buyurtma qiling."
                : "Filtrni yoki qidiruv so'zini o'zgartiring."
            }
            action={
              counts.all === 0 && can("registrator") ? (
                <Button onClick={() => setCreateOpen(true)}>
                  <FlaskConical className="mr-2 h-4 w-4" />
                  Birinchi buyurtma
                </Button>
              ) : undefined
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table className="table-premium">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-20">№</TableHead>
                  <TableHead>Bemor</TableHead>
                  <TableHead className="hidden w-40 lg:table-cell">Bajarildi</TableHead>
                  <TableHead className="hidden md:table-cell">Sana</TableHead>
                  <TableHead>Holat</TableHead>
                  <TableHead className="hidden sm:table-cell">To'lov</TableHead>
                  <TableHead className="text-right">Summa</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {orders.map((order) => {
                  const done = order.items.filter((i) => i.result).length;
                  return (
                    <TableRow
                      key={order.id}
                      className="cursor-pointer"
                      onClick={() => setDetail(order)}
                      data-testid={`row-order-${order.orderNumber}`}
                    >
                      <TableCell>
                        <span className="rounded-md bg-muted px-2 py-1 text-xs font-semibold tabular text-muted-foreground">
                          #{order.orderNumber}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2.5">
                          <Avatar name={order.patient?.fullName ?? "??"} size="sm" />
                          <div className="min-w-0">
                            <p className="truncate font-medium">{order.patient?.fullName ?? "—"}</p>
                            <PhoneText
                              value={order.patient?.phone}
                              asLink={false}
                              className="text-xs text-muted-foreground"
                            />
                          </div>
                        </div>
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <MeterBar
                          value={done}
                          max={order.items.length}
                          label={
                            <>
                              <span>{done === order.items.length ? "Tayyor" : "Jarayonda"}</span>
                              <span className="tabular">
                                {done}/{order.items.length}
                              </span>
                            </>
                          }
                        />
                      </TableCell>
                      <TableCell className="hidden whitespace-nowrap md:table-cell">
                        <span className="tabular">{formatDate(order.createdAt)}</span>
                        <span className="ml-1.5 text-xs tabular text-muted-foreground">
                          {formatTime(order.createdAt)}
                        </span>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col items-start gap-1">
                          <StatusBadge status={order.status} />
                          {/* Only the states that need someone to act are shown
                              here: an accepted tube is the normal case and a
                              badge on every row would be noise. */}
                          {order.sample && order.sample.status !== "qabul_qilindi" && (
                            <SampleBadge status={order.sample.status} className="text-[10px]" />
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <PaymentBadge total={order.totalAmount} paid={order.paidAmount} />
                      </TableCell>
                      <TableCell className="text-right">
                        <Money value={order.totalAmount} className="font-semibold" />
                      </TableCell>
                      <TableCell onClick={(e) => e.stopPropagation()}>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" data-testid={`menu-order-${order.orderNumber}`}>
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-52">
                            <DropdownMenuItem onClick={() => setDetail(order)}>
                              <Receipt className="mr-2 h-4 w-4" />
                              Batafsil
                            </DropdownMenuItem>
                            {can("laborant") && order.status !== "cancelled" && (
                              <DropdownMenuItem onClick={() => setResults(order)}>
                                <ClipboardCheck className="mr-2 h-4 w-4" />
                                Natija kiritish
                              </DropdownMenuItem>
                            )}
                            {can("registrator") && order.status !== "cancelled" && (
                              <DropdownMenuItem onClick={() => setEditing(order)}>
                                <Pencil className="mr-2 h-4 w-4" />
                                Tahlillarni tahrirlash
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuItem onClick={() => setPrinting(order)}>
                              <Printer className="mr-2 h-4 w-4" />
                              Blankani chop etish
                            </DropdownMenuItem>
                            {can("admin") && (
                              <DropdownMenuItem
                                className="text-destructive focus:text-destructive"
                                onClick={() => setDeleting(order)}
                              >
                                <Trash2 className="mr-2 h-4 w-4" />
                                O'chirish
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}

        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={total}
          onPageChange={setPage}
          isFetching={isFetching}
        />
      </div>

      <OrderDialog open={createOpen} onOpenChange={setCreateOpen} />
      <OrderDialog
        open={Boolean(editing)}
        onOpenChange={(o) => !o && setEditing(null)}
        order={editing}
      />
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
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Buyurtmani o'chirish"
        description={
          <>
            Buyurtma <strong>#{deleting?.orderNumber}</strong> va uning barcha natijalari butunlay
            o'chiriladi. Bu amalni qaytarib bo'lmaydi.
          </>
        }
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}

function TotalTile({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className="card-premium p-4">
      <p className="text-[13px] text-muted-foreground">{label}</p>
      <p className={`mt-1.5 text-2xl font-bold tracking-tight tabular ${tone}`}>
        {money(value, false)}
        <span className="ml-1.5 text-sm font-semibold text-muted-foreground">so'm</span>
      </p>
    </div>
  );
}
