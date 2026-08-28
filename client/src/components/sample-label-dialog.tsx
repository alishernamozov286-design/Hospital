import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import type { LabSettings, OrderWithDetails } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { QrCode } from "@/components/qr-code";
import { ageGender, formatDate } from "@/lib/format";

/**
 * The sticker that goes on the tube.
 *
 * Printed separately from the result blank because it is a different physical
 * object on different stock — a 58×30mm thermal label, not A4 — and because it
 * is produced at a different moment: the label is needed at the draw, the
 * blank only once results exist.
 *
 * What is on it is deliberately minimal. A label has room for about four
 * things before they stop being readable at arm's length in a rack, and the
 * four that matter are the code a scanner reads, the same code in digits for
 * when the scan fails, who the tube belongs to, and the date.
 */
export function SampleLabelDialog({
  open,
  onOpenChange,
  order,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: OrderWithDetails | null;
}) {
  const { data: settings } = useQuery<LabSettings>({ queryKey: ["/api/settings"], enabled: open });

  /**
   * @page cannot be scoped with a selector, so the label's page size is put
   * behind a body class that only exists while this dialog is open. Without
   * it, printing a result blank would inherit the 58×30mm page.
   */
  useEffect(() => {
    if (!open) return;
    document.body.classList.add("printing-label");
    return () => document.body.classList.remove("printing-label");
  }, [open]);

  if (!order) return null;

  const sample = order.sample;
  const patient = order.patient;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader className="no-print">
          <DialogTitle>Namuna yorlig'i</DialogTitle>
        </DialogHeader>

        {!sample ? (
          <p className="no-print py-4 text-sm text-muted-foreground">
            Bu buyurtmada namuna yo'q — u namuna hisobi qo'shilishidan oldin yaratilgan.
          </p>
        ) : (
          <>
            <div className="no-print flex justify-center py-2">
              {/* Rendered at label scale so what is on screen is what comes out
                  of the printer, rather than a preview that looks fine and a
                  sticker that does not fit. */}
              <div
                className="label-surface flex gap-3 rounded border bg-white p-3 text-black"
                style={{ width: "58mm", minHeight: "30mm" }}
              >
                <div className="qr-print shrink-0 bg-white">
                  <QrCode value={sample.barcode} size={72} level="M" />
                </div>

                <div className="flex min-w-0 flex-col justify-between py-0.5">
                  <div className="min-w-0">
                    <p className="truncate text-[11px] font-bold leading-tight">
                      {patient?.fullName ?? "—"}
                    </p>
                    <p className="text-[9px] leading-tight text-black/70">
                      {ageGender(patient?.age, patient?.gender)}
                    </p>
                  </div>

                  <div className="min-w-0">
                    <p className="font-mono text-[13px] font-bold leading-none tracking-tight">
                      {sample.barcode}
                    </p>
                    <p className="mt-0.5 text-[9px] leading-tight text-black/70">
                      {formatDate(order.createdAt)}
                      {settings?.labName ? ` · ${settings.labName}` : ""}
                    </p>
                  </div>
                </div>
              </div>
            </div>

            <DialogFooter className="no-print">
              <Button variant="outline" onClick={() => onOpenChange(false)}>
                Yopish
              </Button>
              <Button onClick={() => window.print()} data-testid="button-print-label">
                <Printer className="mr-2 h-4 w-4" />
                Chop etish
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
