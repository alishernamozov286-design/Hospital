import { lazy, Suspense, useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  Database,
  FlaskConical,
  History,
  Loader2,
  MoreVertical,
  Pencil,
  Trash2,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import type { OrderWithDetails, Patient } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Avatar,
  EmptyState,
  Money,
  PageHeader,
  Pagination,
  PatientNumber,
  PhoneText,
  StatusBadge,
  TableSkeleton,
  TelegramBadge,
} from "@/components/ui-kit";
import { SearchInput } from "@/components/inputs";
import { ExportButtons } from "@/components/export-buttons";
import type { ExportColumn } from "@/lib/export-types";
import { PatientDialog } from "@/components/patient-dialog";
import { OrderDialog } from "@/components/order-dialog";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { apiRequest, invalidateApi } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { useDebounced } from "@/hooks/use-debounced";
import { ageGender, formatDate, formatPhone, genderLabel, money, timeAgo } from "@/lib/format";

/**
 * Lazy, and deliberately so: the trend chart pulls in the whole charting
 * library. Loading it with the patients list would put ~400 KB of Recharts in
 * front of every registrator on every page load, for a tab most of them open
 * rarely — the same reason /reports is code-split in App.tsx.
 */
const ResultTrend = lazy(() =>
  import("@/components/result-trend").then((m) => ({ default: m.ResultTrend })),
);

const PAGE_SIZE = 25;

/** Shared by the Excel and PDF writers — see lib/export.ts. */
const EXPORT_COLUMNS: ExportColumn<Patient>[] = [
  { header: "№", value: (p) => p.patientNumber, type: "number", width: 8 },
  { header: "F.I.Sh", value: (p) => p.fullName, width: 30 },
  // Kept as text: a phone number is an identifier, not a quantity, and Excel
  // would otherwise drop the leading +998 and render it in scientific notation.
  { header: "Telefon", value: (p) => formatPhone(p.phone, true), width: 20 },
  { header: "Yosh", value: (p) => p.age ?? "", type: "number", width: 8 },
  { header: "Jinsi", value: (p) => (p.gender ? genderLabel(p.gender) : ""), width: 10 },
  { header: "Manzil", value: (p) => p.address ?? "", width: 30 },
  { header: "Telegram", value: (p) => (p.telegramChatId ? "Ulangan" : "Yo'q"), width: 12 },
  { header: "Qo'shilgan", value: (p) => formatDate(p.createdAt), width: 14 },
];

export default function Patients() {
  const { toast } = useToast();
  const { can } = useAuth();

  const [search, setSearch] = useState("");
  const [page, setPage] = useState(0);
  const [dialogPatient, setDialogPatient] = useState<Patient | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [orderFor, setOrderFor] = useState<Patient | null>(null);
  const [historyFor, setHistoryFor] = useState<Patient | null>(null);
  const [deleting, setDeleting] = useState<Patient | null>(null);

  const debouncedSearch = useDebounced(search.trim(), 300);

  // Page 3 of the old result set is meaningless once the query changes.
  useEffect(() => setPage(0), [debouncedSearch]);

  const { data, isLoading, isFetching } = useQuery<{ items: Patient[]; total: number }>({
    queryKey: [
      `/api/patients?search=${encodeURIComponent(debouncedSearch)}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`,
    ],
    placeholderData: keepPreviousData,
  });

  const patients = data?.items ?? [];
  const total = data?.total ?? 0;

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/patients/${id}`);
    },
    onSuccess: () => {
      invalidateApi("/api/patients", "/api/stats");
      toast({ title: "Bemor o'chirildi" });
      setDeleting(null);
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "O'chirilmadi", description: err.message });
    },
  });

  const openCreate = () => {
    setDialogPatient(null);
    setDialogOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Bemorlar bazasi"
        title="Bemorlar"
        description="Qidiruv raqam, ism, telefon va manzil bo'yicha — server tomonda bajariladi"
        actions={
          <div className="flex items-center gap-2">
            {can("admin") && (
              <ExportButtons
                testIdPrefix="export-patients"
                disabled={isLoading}
                build={() => ({
                  filename: "bemorlar",
                  title: "Bemorlar ro'yxati",
                  subtitle: debouncedSearch
                    ? `Qidiruv: "${debouncedSearch}" · ${patients.length} ta yozuv (${page + 1}-sahifa)`
                    : `${patients.length} ta yozuv (${page + 1}-sahifa, jami ${total} ta)`,
                  columns: EXPORT_COLUMNS,
                  rows: patients,
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
                      href={`/api/export/patients.csv?search=${encodeURIComponent(debouncedSearch)}`}
                      data-testid="link-export-patients"
                    >
                      <Database className="h-4 w-4" />
                    </a>
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Butun baza (CSV)</TooltipContent>
              </Tooltip>
            )}
            {can("registrator") && (
              <Button onClick={openCreate} data-testid="button-add-patient" className="shadow-brand">
                <UserPlus className="mr-2 h-4 w-4" />
                Yangi bemor
              </Button>
            )}
          </div>
        }
      />

      <div className="card-premium flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Raqam (#12), ism, telefon yoki manzil bo'yicha qidiring..."
          className="sm:w-96"
          data-testid="input-search-patients"
        />
        <div className="flex items-center gap-2 px-1 text-sm text-muted-foreground">
          {isFetching ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Users className="h-4 w-4" />
          )}
          <span className="tabular">{total}</span>
          <span>{debouncedSearch ? "ta natija" : "ta bemor"}</span>
        </div>
      </div>

      <div className="card-premium overflow-hidden">
        {isLoading ? (
          <TableSkeleton />
        ) : patients.length === 0 ? (
          <EmptyState
            icon={Users}
            title={debouncedSearch ? "Bemor topilmadi" : "Hali bemor yo'q"}
            description={
              debouncedSearch
                ? "Boshqa so'z bilan qidirib ko'ring yoki qidiruvni tozalang."
                : "Birinchi bemorni ro'yxatdan o'tkazing — keyin unga tahlil buyurtma qilasiz."
            }
            action={
              !debouncedSearch && can("registrator") ? (
                <Button onClick={openCreate}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Bemor qo'shish
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
                  <TableHead className="hidden sm:table-cell">Telefon</TableHead>
                  <TableHead className="hidden md:table-cell">Telegram</TableHead>
                  <TableHead className="hidden lg:table-cell">Yosh / Jinsi</TableHead>
                  <TableHead className="hidden xl:table-cell">Manzil</TableHead>
                  <TableHead className="hidden md:table-cell">Qo'shilgan</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {patients.map((p) => (
                  <TableRow key={p.id} data-testid={`row-patient-${p.id}`}>
                    <TableCell>
                      <PatientNumber value={p.patientNumber} />
                    </TableCell>
                    <TableCell>
                      <button
                        type="button"
                        onClick={() => setHistoryFor(p)}
                        className="flex items-center gap-3 text-left"
                      >
                        <Avatar name={p.fullName} size="sm" />
                        <div className="min-w-0">
                          <p className="truncate font-medium">{p.fullName}</p>
                          <p className="text-xs text-muted-foreground sm:hidden">
                            <PhoneText value={p.phone} asLink={false} />
                          </p>
                        </div>
                      </button>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <PhoneText value={p.phone} className="text-[13px]" />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <TelegramBadge chatId={p.telegramChatId} />
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground lg:table-cell">
                      {ageGender(p.age, p.gender)}
                    </TableCell>
                    <TableCell className="hidden max-w-[240px] truncate text-muted-foreground xl:table-cell">
                      {p.address || "—"}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <span className="tabular text-muted-foreground">{formatDate(p.createdAt)}</span>
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" data-testid={`menu-patient-${p.id}`}>
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-52">
                          <DropdownMenuItem onClick={() => setHistoryFor(p)}>
                            <History className="mr-2 h-4 w-4" />
                            Tahlillar tarixi
                          </DropdownMenuItem>
                          {can("registrator") && (
                            <>
                              <DropdownMenuItem onClick={() => setOrderFor(p)}>
                                <FlaskConical className="mr-2 h-4 w-4" />
                                Tahlil buyurtma qilish
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setDialogPatient(p);
                                  setDialogOpen(true);
                                }}
                              >
                                <Pencil className="mr-2 h-4 w-4" />
                                Tahrirlash
                              </DropdownMenuItem>
                            </>
                          )}
                          {can("admin") && (
                            <DropdownMenuItem
                              className="text-destructive focus:text-destructive"
                              onClick={() => setDeleting(p)}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              O'chirish
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
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

      <PatientDialog open={dialogOpen} onOpenChange={setDialogOpen} patient={dialogPatient} />
      <OrderDialog
        open={Boolean(orderFor)}
        onOpenChange={(o) => !o && setOrderFor(null)}
        presetPatient={orderFor}
      />
      <PatientHistoryDialog patient={historyFor} onClose={() => setHistoryFor(null)} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Bemorni o'chirish"
        description={
          <>
            <strong>{deleting?.fullName}</strong> bazadan butunlay o'chiriladi. Buyurtmalari bo'lsa,
            avval ularni o'chirish kerak.
          </>
        }
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}

/** A patient's visit history — every order they have ever placed. */
function PatientHistoryDialog({ patient, onClose }: { patient: Patient | null; onClose: () => void }) {
  const [tab, setTab] = useState<"visits" | "trend">("visits");

  const { data, isLoading } = useQuery<{ items: OrderWithDetails[]; total: number }>({
    queryKey: [`/api/patients/${patient?.id}/orders`],
    enabled: Boolean(patient),
  });

  // A fresh patient starts on the visit list, whichever tab was left open.
  useEffect(() => {
    if (patient) setTab("visits");
  }, [patient]);

  const orders = data?.items ?? [];
  const totalSpent = orders.reduce((sum, o) => sum + o.totalAmount, 0);

  return (
    <Dialog open={Boolean(patient)} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col gap-0 p-0">
        <DialogHeader className="p-6 pb-4">
          <div className="flex items-center gap-3.5">
            <Avatar name={patient?.fullName ?? "?"} size="lg" />
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2">
                <PatientNumber value={patient?.patientNumber} size="sm" />
                <span className="truncate">{patient?.fullName}</span>
              </DialogTitle>
              <DialogDescription className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
                <PhoneText value={patient?.phone} asLink={false} />
                {patient?.age || patient?.gender ? (
                  <>
                    <span className="text-muted-foreground/50">·</span>
                    <span>{ageGender(patient?.age, patient?.gender)}</span>
                  </>
                ) : null}
              </DialogDescription>
            </div>
          </div>

          {orders.length > 0 && (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Tashriflar</p>
                <p className="mt-0.5 text-lg font-bold tabular">{orders.length} ta</p>
              </div>
              <div className="rounded-xl border bg-muted/40 p-3">
                <p className="text-xs text-muted-foreground">Jami to'lov</p>
                <p className="mt-0.5 text-lg font-bold tabular">{money(totalSpent, false)}</p>
              </div>
            </div>
          )}
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "visits" | "trend")} className="min-h-0 flex-1 flex flex-col">
          <div className="border-t px-6 pt-3">
            <TabsList>
              <TabsTrigger value="visits" data-testid="tab-history-visits">
                <History className="mr-1.5 h-3.5 w-3.5" />
                Tashriflar
              </TabsTrigger>
              <TabsTrigger value="trend" data-testid="tab-history-trend">
                <TrendingUp className="mr-1.5 h-3.5 w-3.5" />
                Dinamika
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="trend" className="mt-0 min-h-0 flex-1">
            <ScrollArea className="h-full">
              {isLoading ? (
                <TableSkeleton rows={3} />
              ) : (
                <Suspense fallback={<TableSkeleton rows={3} />}>
                  <ResultTrend orders={orders} gender={patient?.gender} />
                </Suspense>
              )}
            </ScrollArea>
          </TabsContent>

          <TabsContent value="visits" className="mt-0 min-h-0 flex-1">
        <ScrollArea className="h-full">
          {isLoading ? (
            <TableSkeleton rows={3} />
          ) : orders.length === 0 ? (
            <EmptyState
              icon={FlaskConical}
              title="Tahlil tarixi bo'sh"
              description="Bu bemor hali biror tahlil topshirmagan."
            />
          ) : (
            <div className="divide-y">
              {orders.map((order) => (
                <div key={order.id} className="space-y-2.5 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium">
                        Buyurtma <span className="tabular">#{order.orderNumber}</span>
                      </p>
                      <p className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                        <CalendarClock className="h-3 w-3" />
                        <span className="tabular">{formatDate(order.createdAt)}</span>
                        <span className="text-muted-foreground/50">·</span>
                        {timeAgo(order.createdAt)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusBadge status={order.status} />
                      <Money value={order.totalAmount} className="font-semibold" />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {order.items.map((item) => (
                      <Badge key={item.id} variant="secondary" className="font-normal">
                        {item.testName}
                        {item.result && <span className="ml-1.5 font-semibold tabular">{item.result}</span>}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
