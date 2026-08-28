import { useEffect, useRef, useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { ArrowDown, ArrowUp, Check, ClipboardCheck, Loader2, Save, Sparkles } from "lucide-react";
import type { OrderWithDetails, ResultFlag } from "@shared/schema";
import { RESULT_FLAGS } from "@shared/schema";
import { computeFlag } from "@shared/reference-range";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { apiRequest, invalidateApi } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { FLAG_LABELS, FLAG_STYLES } from "@/lib/format";
import { MeterBar } from "@/components/ui-kit";
import { SampleResultWarning } from "@/components/sample-panel";
import { cn } from "@/lib/utils";

type Draft = {
  id: string;
  result: string;
  flag: ResultFlag | null;
  notes: string;
  /**
   * True once the laborant has pressed a flag button themselves.
   *
   * This is what stops the live suggestion from fighting the human: auto-detect
   * fills a blank, but the moment someone makes a choice it stops touching that
   * line. Mirrors resolveFlag() on the server, which applies the same rule when
   * the values are saved.
   */
  flagTouched: boolean;
};

const FLAG_ICONS: Record<ResultFlag, React.ComponentType<{ className?: string }>> = {
  low: ArrowDown,
  normal: Check,
  high: ArrowUp,
};

export function ResultsDialog({
  open,
  onOpenChange,
  order,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: OrderWithDetails | null;
}) {
  const { toast } = useToast();
  const [drafts, setDrafts] = useState<Draft[]>([]);

  /** Result fields in row order, so Enter can walk down the list. */
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);

  const focusInput = (index: number) => {
    const next = inputsRef.current[index];
    if (!next) return;
    next.focus();
    next.select();
  };

  useEffect(() => {
    if (!open || !order) return;
    setDrafts(
      order.items.map((item) => ({
        id: item.id,
        result: item.result ?? "",
        flag: item.flag ?? null,
        notes: item.notes ?? "",
        // A flag already on the line was decided by a human (or by a previous
        // save), so the suggestion must not overwrite it.
        flagTouched: item.flag != null,
      })),
    );

    // Land on the first line still waiting for a value, so reopening a
    // half-entered order resumes where the laborant left off.
    const firstEmpty = order.items.findIndex((i) => !i.result);
    const target = firstEmpty === -1 ? 0 : firstEmpty;
    // After paint: the inputs do not exist on the tick the dialog opens.
    const id = window.setTimeout(() => {
      inputsRef.current[target]?.focus();
    }, 60);
    return () => window.clearTimeout(id);
  }, [open, order]);

  const update = (id: string, patch: Partial<Draft>) =>
    setDrafts((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  /**
   * Types a value and lets the reference range pick the flag.
   *
   * The same computeFlag() the server uses, so the badge shown while typing is
   * exactly the one that gets stored — a preview that could disagree with the
   * saved value would be worse than no preview.
   */
  const typeResult = (item: { id: string; referenceRange: string | null }, value: string) => {
    setDrafts((prev) =>
      prev.map((d) => {
        if (d.id !== item.id) return d;
        if (d.flagTouched) return { ...d, result: value };
        const auto = computeFlag(value, item.referenceRange, { gender: order?.patient?.gender });
        return { ...d, result: value, flag: auto };
      }),
    );
  };

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await apiRequest("POST", `/api/orders/${order!.id}/results`, {
        results: drafts.map((d) => ({
          id: d.id,
          result: d.result || null,
          flag: d.flag,
          notes: d.notes || null,
        })),
      });
      // The save response carries the Telegram delivery outcome alongside the
      // order, so the laborant learns in one toast whether the patient got it.
      return (await res.json()) as OrderWithDetails & {
        telegram?: { sent: boolean; reason?: string };
      };
    },
    onSuccess: (updated) => {
      invalidateApi("/api/orders", "/api/stats");
      const filled = updated.items.filter((i) => i.result).length;
      const complete = filled === updated.items.length;
      const telegram = updated.telegram?.sent
        ? " · Telegramga yuborildi"
        : complete && updated.telegram?.reason === "Bemor Telegram botga ulanmagan"
          ? " · Bemor Telegramga ulanmagan"
          : "";
      toast({
        title: "Natijalar saqlandi",
        description:
          (complete
            ? "Barcha tahlillar tayyor — buyurtma yakunlandi"
            : `${filled}/${updated.items.length} ta tahlil kiritildi`) + telegram,
      });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Saqlanmadi", description: err.message });
    },
  });

  if (!order) return null;

  const filledCount = drafts.filter((d) => d.result.trim()).length;
  const abnormalCount = drafts.filter((d) => d.flag === "low" || d.flag === "high").length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="max-w-3xl h-[86vh] flex flex-col gap-0 p-0"
        // Ctrl+Enter saves from anywhere in the form — the laborant's hands
        // never have to leave the number pad.
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && !mutation.isPending) {
            e.preventDefault();
            mutation.mutate();
          }
        }}
      >
        <DialogHeader className="p-6 pb-4">
          <div className="flex items-center gap-3">
            <div className="icon-tile h-10 w-10 bg-primary/10 text-primary">
              <ClipboardCheck className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <DialogTitle>Natijalarni kiritish</DialogTitle>
              <DialogDescription className="mt-0.5">
                Buyurtma <span className="tabular">#{order.orderNumber}</span> ·{" "}
                {order.patient?.fullName ?? "Noma'lum bemor"}
              </DialogDescription>
            </div>
            <MeterBar
              className="hidden w-36 shrink-0 sm:block"
              value={filledCount}
              max={drafts.length}
              label={
                <>
                  <span>To'ldirildi</span>
                  <span className="tabular">
                    {filledCount}/{drafts.length}
                  </span>
                </>
              }
            />
          </div>
        </DialogHeader>

        <Separator />

        <ScrollArea className="flex-1 min-h-0">
          <div className="p-6 space-y-4">
            <SampleResultWarning order={order} />

            {order.items.map((item, index) => {
              const draft = drafts.find((d) => d.id === item.id);
              if (!draft) return null;

              // Out of range is the thing a tired laborant must not miss, so it
              // colours the whole card, not just a badge in the corner.
              const abnormal = draft.flag === "low" || draft.flag === "high";
              const suggested = !draft.flagTouched && draft.flag !== null;

              return (
                <div
                  key={item.id}
                  data-testid={`result-row-${item.id}`}
                  className={cn(
                    "space-y-3 rounded-xl border bg-card p-4 shadow-xs transition-colors focus-within:border-primary/40",
                    draft.flag === "high" && "border-rose-500/40 bg-rose-500/[0.04]",
                    draft.flag === "low" && "border-sky-500/40 bg-sky-500/[0.04]",
                  )}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-medium">{item.testName}</p>
                      {item.referenceRange && (
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Me'yor: {item.referenceRange}
                          {item.unit ? ` ${item.unit}` : ""}
                        </p>
                      )}
                    </div>
                    {abnormal && (
                      <Badge
                        variant="outline"
                        className={cn("shrink-0 gap-1 font-semibold", FLAG_STYLES[draft.flag!])}
                      >
                        {draft.flag === "high" ? (
                          <ArrowUp className="h-3 w-3" />
                        ) : (
                          <ArrowDown className="h-3 w-3" />
                        )}
                        {FLAG_LABELS[draft.flag!]}
                      </Badge>
                    )}
                  </div>

                  <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                    <div>
                      <Label className="text-xs mb-1.5 block">
                        Natija {item.unit ? `(${item.unit})` : ""}
                      </Label>
                      <Input
                        ref={(el) => {
                          inputsRef.current[index] = el;
                        }}
                        value={draft.result}
                        onChange={(e) => typeResult(item, e.target.value)}
                        onKeyDown={(e) => {
                          // Enter walks down the list, which is how results
                          // arrive off an analyser printout: one after another.
                          if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) {
                            e.preventDefault();
                            focusInput(index + 1);
                          }
                        }}
                        placeholder="Qiymatni kiriting"
                        data-testid={`input-result-${item.id}`}
                        className={cn(
                          "tabular",
                          draft.flag === "high" && "border-rose-500/50 text-rose-700 dark:text-rose-300",
                          draft.flag === "low" && "border-sky-500/50 text-sky-700 dark:text-sky-300",
                        )}
                      />
                    </div>

                    <div>
                      <Label className="mb-1.5 flex h-4 items-center gap-1 text-xs">
                        Baho
                        {suggested && (
                          <span className="flex items-center gap-0.5 text-[10px] font-normal text-primary">
                            <Sparkles className="h-2.5 w-2.5" />
                            avtomatik
                          </span>
                        )}
                      </Label>
                      <div className="flex gap-1.5">
                        {RESULT_FLAGS.map((flag) => {
                          const Icon = FLAG_ICONS[flag];
                          const active = draft.flag === flag;
                          return (
                            <button
                              key={flag}
                              type="button"
                              onClick={() =>
                                // Pressing a flag — including pressing the
                                // active one to clear it — hands this line to
                                // the human for good.
                                update(item.id, {
                                  flag: active ? null : flag,
                                  flagTouched: true,
                                })
                              }
                              data-testid={`flag-${flag}-${item.id}`}
                              className={cn(
                                "flex h-10 items-center gap-1 rounded-lg border px-2.5 text-sm font-medium transition-all",
                                active
                                  ? cn(FLAG_STYLES[flag], "shadow-xs")
                                  : "text-muted-foreground hover:bg-muted",
                                // A suggestion is drawn dashed so it never
                                // looks like somebody already checked it.
                                active && suggested && "border-dashed",
                              )}
                            >
                              <Icon className="h-3.5 w-3.5" />
                              {FLAG_LABELS[flag]}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <Input
                    value={draft.notes}
                    onChange={(e) => update(item.id, { notes: e.target.value })}
                    placeholder="Izoh (ixtiyoriy)"
                    className="text-sm"
                  />
                </div>
              );
            })}
          </div>
        </ScrollArea>

        <DialogFooter className="flex-col gap-3 border-t p-4 sm:flex-row sm:items-center">
          <div className="mr-auto flex items-center gap-3 text-xs text-muted-foreground">
            {abnormalCount > 0 && (
              <span className="flex items-center gap-1 font-medium text-rose-600 dark:text-rose-400">
                <ArrowUp className="h-3.5 w-3.5" />
                {abnormalCount} ta me'yordan tashqarida
              </span>
            )}
            <span className="hidden sm:inline">
              <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">Enter</kbd>{" "}
              keyingisi ·{" "}
              <kbd className="rounded border bg-muted px-1 py-0.5 font-mono text-[10px]">Ctrl+Enter</kbd>{" "}
              saqlash
            </span>
          </div>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Yopish
          </Button>
          <Button onClick={() => mutation.mutate()} disabled={mutation.isPending} data-testid="button-save-results">
            {mutation.isPending ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Save className="h-4 w-4 mr-2" />
            )}
            Saqlash
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
