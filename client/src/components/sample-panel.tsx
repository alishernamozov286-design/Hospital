import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { AlertTriangle, Ban, Check, Printer, TestTube, Undo2 } from "lucide-react";
import {
  SAMPLE_REJECT_REASONS,
  SAMPLE_STATUS_LABELS,
  type OrderWithDetails,
  type SampleRejectReason,
  type SampleStatus,
} from "@shared/schema";
import { nextStatuses, resultsWarning } from "@shared/sample";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { SampleBadge } from "@/components/ui-kit";
import { SampleLabelDialog } from "@/components/sample-label-dialog";
import { apiRequest, invalidateApi } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";

/** The icon and wording each forward step gets on its button. */
const ACTIONS: Record<SampleStatus, { label: string; icon: typeof Check }> = {
  kutilmoqda: { label: "Bekor qilish", icon: Undo2 },
  olindi: { label: "Namuna olindi", icon: TestTube },
  qabul_qilindi: { label: "Qabul qilish", icon: Check },
  rad_etildi: { label: "Rad etish", icon: Ban },
};

/**
 * The tube's chain of custody, as shown on the order card.
 *
 * Renders nothing for an order that has no sample — those predate the feature,
 * and an empty panel on every historical order would read as something broken
 * rather than something absent.
 */
export function SamplePanel({ order }: { order: OrderWithDetails }) {
  const { toast } = useToast();
  const { can } = useAuth();
  const [rejecting, setRejecting] = useState(false);
  const [labelling, setLabelling] = useState(false);

  const sample = order.sample;

  const mutation = useMutation({
    mutationFn: async (payload: { status: SampleStatus; rejectReason?: string; rejectNote?: string }) => {
      const res = await apiRequest("PATCH", `/api/orders/${order.id}/sample`, payload);
      return (await res.json()) as OrderWithDetails;
    },
    onSuccess: (_data, vars) => {
      invalidateApi("/api/orders", "/api/stats");
      setRejecting(false);
      toast({ title: `Namuna: ${SAMPLE_STATUS_LABELS[vars.status].toLowerCase()}` });
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Saqlanmadi", description: err.message });
    },
  });

  if (!sample) return null;

  const editable = can("registrator", "laborant");
  // Rejection gets its own dialog, so it is filtered out of the inline row.
  const steps = nextStatuses(sample.status).filter((s) => s !== "rad_etildi");
  const canReject = editable && nextStatuses(sample.status).includes("rad_etildi");

  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-muted-foreground">Namuna</h4>

      <div className="rounded-xl border p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className="rounded-lg bg-muted px-2 py-1 font-mono text-sm font-semibold tabular"
            data-testid="text-sample-barcode"
          >
            {sample.barcode}
          </span>
          <SampleBadge status={sample.status} />
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto h-7 px-2 text-xs"
            onClick={() => setLabelling(true)}
            data-testid="button-sample-label"
          >
            <Printer className="mr-1.5 h-3.5 w-3.5" />
            Yorliq
          </Button>
        </div>

        {/* The audit trail in plain words. Each line appears only once its step
            has happened, so the panel reads as a history rather than a form. */}
        <dl className="mt-2.5 space-y-1 text-xs text-muted-foreground">
          {sample.collectedAt && (
            <div className="flex flex-wrap gap-x-1.5">
              <dt>Olindi:</dt>
              <dd className="tabular text-foreground/80">{formatDateTime(sample.collectedAt)}</dd>
              {sample.collectedByName && <dd>· {sample.collectedByName}</dd>}
            </div>
          )}
          {sample.receivedAt && (
            <div className="flex flex-wrap gap-x-1.5">
              <dt>Qabul qilindi:</dt>
              <dd className="tabular text-foreground/80">{formatDateTime(sample.receivedAt)}</dd>
              {sample.receivedByName && <dd>· {sample.receivedByName}</dd>}
            </div>
          )}
          {sample.rejectedAt && (
            <div className="flex flex-wrap gap-x-1.5 text-rose-600 dark:text-rose-400">
              <dt>Rad etildi:</dt>
              <dd className="tabular">{formatDateTime(sample.rejectedAt)}</dd>
              {sample.rejectedByName && <dd>· {sample.rejectedByName}</dd>}
              <dd className="basis-full font-medium">
                {sample.rejectReason}
                {sample.rejectNote ? ` — ${sample.rejectNote}` : ""}
              </dd>
            </div>
          )}
        </dl>

        {editable && (steps.length > 0 || canReject) && (
          <div className="mt-3 flex flex-wrap gap-2 border-t pt-3">
            {steps.map((next) => {
              const action = ACTIONS[next];
              // Moving backwards is a correction, not the happy path, so it is
              // offered quietly rather than as the primary button.
              const isUndo = next === "kutilmoqda" || (sample.status === "qabul_qilindi" && next === "olindi");
              return (
                <Button
                  key={next}
                  size="sm"
                  variant={isUndo ? "ghost" : "default"}
                  disabled={mutation.isPending}
                  onClick={() => mutation.mutate({ status: next })}
                  data-testid={`button-sample-${next}`}
                >
                  <action.icon className="mr-1.5 h-3.5 w-3.5" />
                  {isUndo ? "Orqaga" : action.label}
                </Button>
              );
            })}

            {canReject && (
              <Button
                size="sm"
                variant="ghost"
                className="text-rose-600 hover:text-rose-700 dark:text-rose-400"
                disabled={mutation.isPending}
                onClick={() => setRejecting(true)}
                data-testid="button-sample-reject"
              >
                <Ban className="mr-1.5 h-3.5 w-3.5" />
                Rad etish
              </Button>
            )}
          </div>
        )}
      </div>

      <RejectDialog
        open={rejecting}
        onOpenChange={setRejecting}
        barcode={sample.barcode}
        pending={mutation.isPending}
        onConfirm={(reason, note) =>
          mutation.mutate({ status: "rad_etildi", rejectReason: reason, rejectNote: note || undefined })
        }
      />

      <SampleLabelDialog open={labelling} onOpenChange={setLabelling} order={order} />
    </div>
  );
}

/**
 * Rejection is the one transition that destroys work — the patient has to be
 * stuck a second time — so it asks for a reason before it will proceed. The
 * reason list is closed so the rejection report can count causes.
 */
function RejectDialog({
  open,
  onOpenChange,
  barcode,
  pending,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  barcode: string;
  pending: boolean;
  onConfirm: (reason: SampleRejectReason, note: string) => void;
}) {
  const [reason, setReason] = useState<SampleRejectReason | "">("");
  const [note, setNote] = useState("");

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) {
          setReason("");
          setNote("");
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Ban className="h-4 w-4 text-rose-600" />
            Namunani rad etish
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-sm text-muted-foreground">
            <span className="font-mono font-semibold text-foreground">{barcode}</span> rad etiladi. Bemordan
            yangi namuna olish kerak bo'ladi.
          </p>

          <div className="space-y-2">
            <Label htmlFor="reject-reason">Sabab</Label>
            <Select value={reason} onValueChange={(v) => setReason(v as SampleRejectReason)}>
              <SelectTrigger id="reject-reason" data-testid="select-reject-reason">
                <SelectValue placeholder="Sababni tanlang" />
              </SelectTrigger>
              <SelectContent>
                {SAMPLE_REJECT_REASONS.map((r) => (
                  <SelectItem key={r} value={r}>
                    {r}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="reject-note">Izoh (ixtiyoriy)</Label>
            <Textarea
              id="reject-note"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              maxLength={300}
              rows={2}
              placeholder="Qo'shimcha ma'lumot..."
              data-testid="input-reject-note"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Bekor qilish
          </Button>
          <Button
            variant="destructive"
            disabled={!reason || pending}
            onClick={() => reason && onConfirm(reason, note.trim())}
            data-testid="button-confirm-reject"
          >
            Rad etish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The warning shown above the result fields when the tube is not accepted.
 *
 * Deliberately not a block: the laborant can still type. A lab mid-migration
 * has tubes on the bench that the system has never seen, and refusing those
 * would send people back to paper — which is worse than an unverified value.
 */
export function SampleResultWarning({ order }: { order: OrderWithDetails }) {
  const warning = resultsWarning(order.sample);
  if (!warning) return null;

  const severe = order.sample?.status === "rad_etildi";

  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-xl border p-3 text-sm",
        severe
          ? "border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300"
          : "border-amber-500/25 bg-amber-500/10 text-amber-700 dark:text-amber-300",
      )}
      data-testid="warning-sample"
    >
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
      <div>
        <p className="font-medium">{warning}</p>
        <p className="mt-0.5 text-xs opacity-80">
          Natijani baribir kiritishingiz mumkin, lekin namuna holatini tekshiring.
        </p>
      </div>
    </div>
  );
}
