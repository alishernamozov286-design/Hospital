import { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { Database, Loader2, Plus, Trash2, Wallet } from "lucide-react";
import {
  EXPENSE_CATEGORIES,
  insertExpenseSchema,
  localDayString,
  type Expense,
  type ExpenseCategory,
} from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  EmptyState,
  Money,
  PageHeader,
  Pagination,
  StatCard,
  TableSkeleton,
} from "@/components/ui-kit";
import { MoneyInput } from "@/components/inputs";
import { ExportButtons } from "@/components/export-buttons";
import type { ExportColumn } from "@/lib/export-types";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { apiRequest, invalidateApi } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { formatDate, money } from "@/lib/format";

const PAGE_SIZE = 25;

/** Shared by the Excel and PDF writers — see lib/export.ts. */
const EXPORT_COLUMNS: ExportColumn<Expense>[] = [
  { header: "Sana", value: (e) => formatDate(e.spentOn), width: 13 },
  { header: "Kategoriya", value: (e) => e.category, width: 20 },
  { header: "Izoh", value: (e) => e.note ?? "", width: 40 },
  { header: "Kim kiritdi", value: (e) => e.createdByName ?? "", width: 22 },
  { header: "Summa", value: (e) => e.amount, type: "money", width: 16, total: true },
];

/** The month so far — the range an owner checks most, so it is the default. */
function monthToDate(): { from: string; to: string } {
  const now = new Date();
  return {
    from: localDayString(new Date(now.getFullYear(), now.getMonth(), 1)),
    to: localDayString(now),
  };
}

type ExpenseResponse = { items: Expense[]; total: number; total_amount: number };

export default function Expenses() {
  const { toast } = useToast();
  const { can } = useAuth();

  const [range, setRange] = useState(monthToDate);
  const [page, setPage] = useState(0);
  const [addOpen, setAddOpen] = useState(false);
  const [deleting, setDeleting] = useState<Expense | null>(null);

  const query = `from=${range.from}&to=${range.to}&limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`;
  const { data, isLoading, isFetching } = useQuery<ExpenseResponse>({
    queryKey: [`/api/expenses?${query}`],
    placeholderData: keepPreviousData,
  });

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalAmount = data?.total_amount ?? 0;

  const byCategory = useMemo(() => {
    const agg = new Map<string, number>();
    for (const e of items) agg.set(e.category, (agg.get(e.category) ?? 0) + e.amount);
    return Array.from(agg.entries()).sort((a, b) => b[1] - a[1]);
  }, [items]);

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/expenses/${id}`);
    },
    onSuccess: () => {
      invalidateApi("/api/expenses", "/api/reports");
      toast({ title: "Xarajat o'chirildi" });
      setDeleting(null);
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "O'chirilmadi", description: err.message });
    },
  });

  if (!can("admin")) {
    return (
      <div className="space-y-6">
        <PageHeader title="Xarajatlar" description="Laboratoriya xarajatlari" />
        <EmptyState
          icon={Wallet}
          title="Ruxsat yo'q"
          description="Bu bo'lim faqat administrator uchun."
        />
      </div>
    );
  }

  const setFrom = (from: string) => {
    setRange((r) => ({ ...r, from }));
    setPage(0);
  };
  const setTo = (to: string) => {
    setRange((r) => ({ ...r, to }));
    setPage(0);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Moliya"
        title="Xarajatlar"
        description="Reaktiv, ish haqi, ijara — sof foyda shu yerdan hisoblanadi"
        actions={
          <div className="flex items-center gap-2">
            <ExportButtons
              testIdPrefix="export-expenses"
              disabled={isLoading}
              build={() => ({
                filename: "xarajatlar",
                title: "Xarajatlar",
                subtitle: `${formatDate(range.from)} — ${formatDate(range.to)} · ${items.length} ta yozuv (${page + 1}-sahifa, jami ${total} ta)`,
                columns: EXPORT_COLUMNS,
                rows: items,
              })}
            />
            {/* Server-side, so the file covers the whole date range rather
                than the 25 rows on screen. */}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="outline" size="icon" asChild aria-label="Butun davrni CSV yuklab olish">
                  <a
                    href={`/api/export/expenses.csv?from=${range.from}&to=${range.to}`}
                    data-testid="link-export-expenses"
                  >
                    <Database className="h-4 w-4" />
                  </a>
                </Button>
              </TooltipTrigger>
              <TooltipContent>Butun davr (CSV)</TooltipContent>
            </Tooltip>
            <Button onClick={() => setAddOpen(true)} className="shadow-brand" data-testid="button-add-expense">
              <Plus className="mr-2 h-4 w-4" />
              Xarajat qo'shish
            </Button>
          </div>
        }
      />

      <div className="card-premium flex flex-col gap-3 p-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <Label htmlFor="from" className="text-xs text-muted-foreground">
            Dan
          </Label>
          <Input
            id="from"
            type="date"
            value={range.from}
            onChange={(e) => setFrom(e.target.value)}
            className="w-40"
            data-testid="input-expense-from"
          />
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="to" className="text-xs text-muted-foreground">
            Gacha
          </Label>
          <Input
            id="to"
            type="date"
            value={range.to}
            onChange={(e) => setTo(e.target.value)}
            className="w-40"
            data-testid="input-expense-to"
          />
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          {isFetching && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
          <span className="text-sm text-muted-foreground">{total} ta yozuv</span>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <StatCard
          icon={Wallet}
          label="Tanlangan davr xarajati"
          value={money(totalAmount, false)}
          tone="rose"
        />
        <div className="card-premium p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Kategoriyalar (shu sahifada)
          </p>
          {byCategory.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Ma'lumot yo'q</p>
          ) : (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {byCategory.map(([cat, amount]) => (
                <Badge key={cat} variant="secondary" className="font-normal">
                  {cat} · <span className="ml-1 font-semibold tabular">{money(amount, false)}</span>
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="card-premium overflow-hidden">
        {isLoading ? (
          <TableSkeleton />
        ) : items.length === 0 ? (
          <EmptyState
            icon={Wallet}
            title="Bu davrda xarajat yo'q"
            description="Xarajat qo'shsangiz, hisobotdagi sof foyda shunga qarab hisoblanadi."
            action={
              <Button onClick={() => setAddOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Xarajat qo'shish
              </Button>
            }
          />
        ) : (
          <div className="overflow-x-auto">
            <Table className="table-premium">
              <TableHeader>
                <TableRow>
                  <TableHead className="w-32">Sana</TableHead>
                  <TableHead>Kategoriya</TableHead>
                  <TableHead className="hidden md:table-cell">Izoh</TableHead>
                  <TableHead className="hidden sm:table-cell">Kim kiritdi</TableHead>
                  <TableHead className="text-right">Summa</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((e) => (
                  <TableRow key={e.id} data-testid={`row-expense-${e.id}`}>
                    <TableCell className="tabular text-muted-foreground">{formatDate(e.spentOn)}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-normal">
                        {e.category}
                      </Badge>
                    </TableCell>
                    <TableCell className="hidden max-w-[280px] truncate text-muted-foreground md:table-cell">
                      {e.note || "—"}
                    </TableCell>
                    <TableCell className="hidden text-muted-foreground sm:table-cell">
                      {e.createdByName || "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <Money value={e.amount} className="font-semibold" />
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setDeleting(e)}
                        data-testid={`button-delete-expense-${e.id}`}
                      >
                        <Trash2 className="h-4 w-4 text-muted-foreground" />
                      </Button>
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

      <ExpenseDialog open={addOpen} onOpenChange={setAddOpen} />
      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Xarajatni o'chirish"
        description={
          <>
            <strong>{deleting?.category}</strong> — {money(deleting?.amount ?? 0)} o'chiriladi.
          </>
        }
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}

function ExpenseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { toast } = useToast();
  const [category, setCategory] = useState<ExpenseCategory>("Reaktivlar");
  const [amount, setAmount] = useState(0);
  const [note, setNote] = useState("");
  const [spentOn, setSpentOn] = useState(() => localDayString(new Date()));
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      // Validated with the same schema the server uses, so the two can never
      // disagree about what a valid expense is.
      const parsed = insertExpenseSchema.safeParse({ category, amount, note: note || null, spentOn });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Ma'lumot noto'g'ri");
      const res = await apiRequest("POST", "/api/expenses", parsed.data);
      return (await res.json()) as Expense;
    },
    onSuccess: (row) => {
      invalidateApi("/api/expenses", "/api/reports");
      toast({ title: "Xarajat qo'shildi", description: `${row.category} · ${money(row.amount)}` });
      setAmount(0);
      setNote("");
      setError(null);
      onOpenChange(false);
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="icon-tile h-10 w-10 bg-rose-500/10 text-rose-600 dark:text-rose-400">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>Yangi xarajat</DialogTitle>
              <DialogDescription className="mt-0.5">
                Sana, kategoriya va summa — hisobotda sof foydadan ayiriladi.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="spentOn">Sana</Label>
              <Input
                id="spentOn"
                type="date"
                value={spentOn}
                onChange={(e) => setSpentOn(e.target.value)}
                data-testid="input-expense-date"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Kategoriya</Label>
              <Select value={category} onValueChange={(v) => setCategory(v as ExpenseCategory)}>
                <SelectTrigger data-testid="select-expense-category">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {EXPENSE_CATEGORIES.map((c) => (
                    <SelectItem key={c} value={c}>
                      {c}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="amount">Summa</Label>
            <MoneyInput id="amount" value={amount} onChange={setAmount} data-testid="input-expense-amount" />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="note">Izoh</Label>
            <Input
              id="note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Masalan: gemoglobin reaktivi, 2 quti"
              data-testid="input-expense-note"
            />
          </div>

          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Bekor qilish
          </Button>
          <Button
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending || amount <= 0}
            data-testid="button-save-expense"
          >
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
