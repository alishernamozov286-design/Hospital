import { useState } from "react";
import { FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import type { ExportDoc } from "@/lib/export-types";
import { cn } from "@/lib/utils";

/**
 * The pair of icon buttons that sits in every page header: green for Excel,
 * red for PDF. No labels — the icons are the standard ones for the two file
 * types and each carries a tooltip, which keeps a header with a search box, a
 * filter and a primary action from turning into a wall of text.
 *
 * `build` is a callback rather than a ready-made document because assembling
 * the rows is wasted work until someone actually clicks: on a busy day the
 * orders table holds a few thousand rows.
 */
export function ExportButtons<T>({
  build,
  disabled,
  className,
  testIdPrefix,
}: {
  build: () => ExportDoc<T> | null;
  disabled?: boolean;
  className?: string;
  testIdPrefix?: string;
}) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<"excel" | "pdf" | null>(null);

  const run = async (kind: "excel" | "pdf") => {
    if (busy) return;
    const doc = build();
    // A document with no main rows is still worth writing when it carries
    // sections — the dashboard's daily summary on a day with no orders yet.
    const hasSections = (doc?.sections ?? []).some((s) => s.rows.length > 0);
    if (!doc || (doc.rows.length === 0 && !hasSections)) {
      toast({
        variant: "destructive",
        title: "Yuklab olinmadi",
        description: "Eksport qilish uchun ma'lumot yo'q.",
      });
      return;
    }

    setBusy(kind);
    try {
      // Loaded on demand: the two writers plus the embedded font are over a
      // megabyte, and most sessions never export anything.
      const { exportExcel, exportPdf } = await import("@/lib/export");
      if (kind === "excel") await exportExcel(doc);
      else await exportPdf(doc);

      toast({
        title: kind === "excel" ? "Excel fayli yuklandi" : "PDF fayli yuklandi",
        description: doc.rows.length > 0 ? `${doc.rows.length} ta yozuv` : doc.title,
      });
    } catch (err) {
      toast({
        variant: "destructive",
        title: "Yuklab olinmadi",
        description: err instanceof Error ? err.message : "Noma'lum xatolik",
      });
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <ExportIconButton
        label="Excel (.xlsx) yuklab olish"
        icon={FileSpreadsheet}
        loading={busy === "excel"}
        disabled={disabled || busy !== null}
        onClick={() => run("excel")}
        tone="emerald"
        testId={testIdPrefix ? `${testIdPrefix}-excel` : undefined}
      />
      <ExportIconButton
        label="PDF yuklab olish"
        icon={FileText}
        loading={busy === "pdf"}
        disabled={disabled || busy !== null}
        onClick={() => run("pdf")}
        tone="rose"
        testId={testIdPrefix ? `${testIdPrefix}-pdf` : undefined}
      />
    </div>
  );
}

const TONES = {
  emerald:
    "text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 hover:border-emerald-500/30 dark:text-emerald-400 dark:hover:text-emerald-300",
  rose: "text-rose-600 hover:text-rose-700 hover:bg-rose-500/10 hover:border-rose-500/30 dark:text-rose-400 dark:hover:text-rose-300",
} as const;

function ExportIconButton({
  label,
  icon: Icon,
  loading,
  disabled,
  onClick,
  tone,
  testId,
}: {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  loading: boolean;
  disabled?: boolean;
  onClick: () => void;
  tone: keyof typeof TONES;
  testId?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          onClick={onClick}
          disabled={disabled}
          // The tooltip is the only label, so the icon needs its own a11y name.
          aria-label={label}
          data-testid={testId}
          className={cn("transition-colors", TONES[tone])}
        >
          {loading ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Icon className="h-4 w-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
