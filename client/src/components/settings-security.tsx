/**
 * The two security panels on the settings screen: the audit trail, and the
 * self-service password change.
 *
 * They live outside settings.tsx because that file is already long, and these
 * two share nothing with the lab/tests/users panels beyond the page they sit on.
 */
import { useState } from "react";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import {
  Download,
  History,
  KeyRound,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import { changePasswordSchema, type AuditEntry } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { EmptyState, Pagination, SectionCard, TableSkeleton } from "@/components/ui-kit";
import { ExportButtons } from "@/components/export-buttons";
import type { ExportColumn } from "@/lib/export-types";
import { apiRequest } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { formatDateTime } from "@/lib/format";

const PAGE_SIZE = 25;

/** Colour by consequence, not by verb: deletions and refunds read as red. */
const ACTION_STYLES: Record<string, string> = {
  create: "bg-emerald-500/10 text-emerald-700 border-emerald-500/25 dark:text-emerald-300",
  update: "bg-sky-500/10 text-sky-700 border-sky-500/25 dark:text-sky-300",
  delete: "bg-rose-500/10 text-rose-700 border-rose-500/25 dark:text-rose-300",
  refund: "bg-rose-500/10 text-rose-700 border-rose-500/25 dark:text-rose-300",
  payment: "bg-violet-500/10 text-violet-700 border-violet-500/25 dark:text-violet-300",
  results: "bg-amber-500/10 text-amber-700 border-amber-500/25 dark:text-amber-300",
  login: "text-muted-foreground",
  export: "text-muted-foreground",
};

const ACTION_LABELS: Record<string, string> = {
  create: "qo'shildi",
  update: "o'zgardi",
  delete: "o'chirildi",
  payment: "to'lov",
  refund: "qaytarish",
  results: "natija",
  login: "kirish",
  export: "eksport",
};

const ENTITIES = [
  { value: "all", label: "Hammasi" },
  { value: "order", label: "Buyurtmalar" },
  { value: "patient", label: "Bemorlar" },
  { value: "test", label: "Tahlillar" },
  { value: "user", label: "Xodimlar" },
  { value: "expense", label: "Xarajatlar" },
  { value: "auth", label: "Kirishlar" },
];

/** The audit trail as a document — see lib/export.ts. */
const AUDIT_EXPORT_COLUMNS: ExportColumn<AuditEntry>[] = [
  { header: "Vaqt", value: (e) => formatDateTime(e.createdAt), width: 20 },
  { header: "Amal", value: (e) => ACTION_LABELS[e.action] ?? e.action, width: 14 },
  { header: "Tafsilot", value: (e) => e.summary, width: 52 },
  { header: "Kim", value: (e) => e.userName, width: 24 },
];

export function AuditPanel() {
  const [entity, setEntity] = useState("all");
  const [page, setPage] = useState(0);

  const filter = entity === "all" ? "" : `entity=${entity}&`;
  const { data, isLoading, isFetching } = useQuery<{ items: AuditEntry[]; total: number }>({
    queryKey: [`/api/audit?${filter}limit=${PAGE_SIZE}&offset=${page * PAGE_SIZE}`],
    placeholderData: keepPreviousData,
  });

  const items = data?.items ?? [];

  return (
    <SectionCard
      icon={History}
      title="Amallar jurnali"
      description="Kim nima o'zgartirdi — narx, to'lov, o'chirish"
      action={
        <div className="flex items-center gap-2">
          <Select
            value={entity}
            onValueChange={(v) => {
              setEntity(v);
              setPage(0);
            }}
          >
            <SelectTrigger className="w-44" data-testid="select-audit-entity">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {ENTITIES.map((e) => (
                <SelectItem key={e.value} value={e.value}>
                  {e.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <ExportButtons
            testIdPrefix="export-audit"
            disabled={isLoading}
            build={() => ({
              filename: "amallar-jurnali",
              title: "Amallar jurnali",
              subtitle: `${ENTITIES.find((e) => e.value === entity)?.label ?? "Hammasi"} · ${items.length} ta yozuv (${page + 1}-sahifa, jami ${data?.total ?? 0} ta)`,
              sheetName: "Jurnal",
              orientation: "landscape",
              columns: AUDIT_EXPORT_COLUMNS,
              rows: items,
            })}
          />
        </div>
      }
    >
      {isLoading ? (
        <TableSkeleton rows={5} />
      ) : items.length === 0 ? (
        <EmptyState
          icon={History}
          title="Yozuv yo'q"
          description="Bu bo'lim bo'yicha hali amal bajarilmagan."
        />
      ) : (
        <div className="overflow-x-auto">
          <Table className="table-premium">
            <TableHeader>
              <TableRow>
                <TableHead className="w-44">Vaqt</TableHead>
                <TableHead className="w-32">Amal</TableHead>
                <TableHead>Tafsilot</TableHead>
                <TableHead className="hidden w-44 sm:table-cell">Kim</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((e) => (
                <TableRow key={e.id} data-testid={`row-audit-${e.id}`}>
                  <TableCell className="tabular text-xs text-muted-foreground">
                    {formatDateTime(e.createdAt)}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={`font-medium ${ACTION_STYLES[e.action] ?? "text-muted-foreground"}`}
                    >
                      {ACTION_LABELS[e.action] ?? e.action}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm">{e.summary}</TableCell>
                  <TableCell className="hidden text-sm text-muted-foreground sm:table-cell">
                    {e.userName}
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
        total={data?.total ?? 0}
        onPageChange={setPage}
        isFetching={isFetching}
      />
    </SectionCard>
  );
}

/** Available to every signed-in user, unlike the admin's staff editor. */
export function PasswordPanel() {
  const { toast } = useToast();
  const [currentPassword, setCurrent] = useState("");
  const [newPassword, setNew] = useState("");
  const [confirmPassword, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async () => {
      // Same schema the server enforces, so the two can never disagree.
      const parsed = changePasswordSchema.safeParse({ currentPassword, newPassword, confirmPassword });
      if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Ma'lumot noto'g'ri");
      await apiRequest("POST", "/api/user/password", parsed.data);
    },
    onSuccess: () => {
      toast({ title: "Parol o'zgartirildi" });
      setCurrent("");
      setNew("");
      setConfirm("");
      setError(null);
    },
    onError: (err: Error) => setError(err.message),
  });

  return (
    <SectionCard
      icon={KeyRound}
      title="Parolni o'zgartirish"
      description="Faqat o'z hisobingiz uchun — joriy parolni bilish shart"
    >
      <div className="max-w-md space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="currentPassword">Joriy parol</Label>
          <Input
            id="currentPassword"
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrent(e.target.value)}
            data-testid="input-current-password"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="newPassword">Yangi parol</Label>
          <Input
            id="newPassword"
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNew(e.target.value)}
            data-testid="input-new-password"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="confirmPassword">Yangi parolni takrorlang</Label>
          <Input
            id="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirm(e.target.value)}
            data-testid="input-confirm-password"
          />
        </div>

        {error && <p className="text-sm text-destructive">{error}</p>}

        <Button
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending || !currentPassword || !newPassword}
          data-testid="button-change-password"
        >
          {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Parolni saqlash
        </Button>
      </div>
    </SectionCard>
  );
}

/** Download-only. Restoring runs from the CLI — see scripts/restore-backup.mjs. */
export function BackupPanel() {
  const { can } = useAuth();
  if (!can("admin")) return null;

  return (
    <SectionCard
      icon={ShieldCheck}
      title="Zaxira nusxa"
      description="Bemorlar, buyurtmalar, natijalar va xarajatlar — bitta JSON faylda"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="outline" asChild data-testid="link-backup">
          <a href="/api/backup">
            <Download className="mr-2 h-4 w-4" />
            Zaxirani yuklab olish
          </a>
        </Button>
        <p className="text-xs text-muted-foreground">
          Tiklash brauzerdan emas, terminaldan bajariladi:{" "}
          <code className="rounded bg-muted px-1.5 py-0.5">npm run db:restore -- fayl.json --yes</code>
          {" — "}butun bazani almashtiradigan tugma tasodifiy bosishga juda yaqin turadi.
        </p>
      </div>
    </SectionCard>
  );
}
