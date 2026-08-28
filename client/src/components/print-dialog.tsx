import { useQuery } from "@tanstack/react-query";
import { Printer } from "lucide-react";
import type { LabSettings, OrderWithDetails } from "@shared/schema";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ScrollArea } from "@/components/ui/scroll-area";
import { FLAG_LABELS, ageGender, formatDateTime, formatLongDate, formatPhone, money } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * The patient-facing blank. Everything outside `.print-surface` is marked
 * `no-print`, so window.print() emits only this document (see index.css).
 */
export function PrintDialog({
  open,
  onOpenChange,
  order,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  order: OrderWithDetails | null;
}) {
  const { data: settings } = useQuery<LabSettings>({ queryKey: ["/api/settings"], enabled: open });

  if (!order) return null;

  const lab = settings ?? { labName: "MedLab", tagline: "Tibbiy Laboratoriya", address: null, phone: null, director: null, licenseNumber: null, id: "default" };
  const completed = order.items.filter((i) => i.result);
  /** Distinct people who signed off the values on this blank. */
  const analysts = Array.from(new Set(completed.map((i) => i.enteredBy).filter(Boolean))) as string[];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[90vh] flex flex-col gap-0 p-0">
        <DialogHeader className="no-print p-5 pb-4">
          <div className="flex items-center gap-3">
            <div className="icon-tile h-10 w-10 bg-primary/10 text-primary">
              <Printer className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle>
                Natija blankasi — <span className="tabular">#{order.orderNumber}</span>
              </DialogTitle>
              <p className="mt-0.5 text-sm text-muted-foreground">
                {order.patient?.fullName ?? "Noma'lum bemor"} · {completed.length}/{order.items.length} ta
                natija tayyor
              </p>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 min-h-0 border-y bg-muted/30">
          <div className="p-6">
            <div className="print-surface mx-auto max-w-[210mm] bg-white text-black p-10 shadow-sm rounded">
              {/* letterhead */}
              <div className="flex items-start justify-between border-b-2 border-black/80 pb-4">
                <div>
                  <h1 className="text-3xl font-bold tracking-tight">{lab.labName}</h1>
                  <p className="text-sm text-black/60 mt-0.5">{lab.tagline}</p>
                </div>
                <div className="text-right text-xs text-black/70 space-y-0.5">
                  {lab.address && <p>{lab.address}</p>}
                  {lab.phone && <p className="tabular">Tel: {formatPhone(lab.phone)}</p>}
                  {lab.licenseNumber && <p>Litsenziya: {lab.licenseNumber}</p>}
                </div>
              </div>

              <div className="flex items-baseline justify-between mt-5">
                <h2 className="text-xl font-bold">TAHLIL NATIJALARI</h2>
                <p className="text-sm">
                  Buyurtma № <span className="font-bold tabular">{order.orderNumber}</span>
                </p>
              </div>

              {/* patient block */}
              <div className="grid grid-cols-2 gap-x-8 gap-y-2 mt-4 text-sm border border-black/20 rounded p-4">
                <Field label="Bemor" value={order.patient?.fullName ?? "—"} />
                <Field
                  label="Bemor №"
                  value={order.patient ? `#${order.patient.patientNumber}` : "—"}
                />
                <Field label="Telefon" value={formatPhone(order.patient?.phone)} />
                <Field label="Yosh / Jinsi" value={ageGender(order.patient?.age, order.patient?.gender)} />
                <Field label="Qabul sanasi" value={formatLongDate(order.createdAt)} />
                {order.completedAt && <Field label="Natija sanasi" value={formatDateTime(order.completedAt)} />}
                {order.patient?.address && <Field label="Manzil" value={order.patient.address} />}
              </div>

              {/* results table */}
              <table className="w-full mt-6 text-sm border-collapse">
                <thead>
                  <tr className="border-y-2 border-black/70 text-left">
                    <th className="py-2 pr-3 font-semibold w-8">№</th>
                    <th className="py-2 pr-3 font-semibold">Tahlil nomi</th>
                    <th className="py-2 pr-3 font-semibold">Natija</th>
                    <th className="py-2 pr-3 font-semibold">Birlik</th>
                    <th className="py-2 font-semibold">Me'yoriy oraliq</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item, i) => (
                    <tr key={item.id} className="border-b border-black/15 print-avoid-break align-top">
                      <td className="py-2 pr-3 tabular text-black/60">{i + 1}</td>
                      <td className="py-2 pr-3">
                        {item.testName}
                        {item.notes && <p className="text-xs text-black/55 mt-0.5 italic">{item.notes}</p>}
                      </td>
                      <td className="py-2 pr-3">
                        <span
                          className={cn(
                            "font-semibold tabular",
                            item.flag === "high" && "text-red-700",
                            item.flag === "low" && "text-blue-700",
                          )}
                        >
                          {item.result ?? "—"}
                        </span>
                        {item.flag && (
                          <span className="ml-1.5 text-xs text-black/60">
                            ({FLAG_LABELS[item.flag]}
                            {item.flag === "high" ? " ↑" : item.flag === "low" ? " ↓" : ""})
                          </span>
                        )}
                      </td>
                      <td className="py-2 pr-3 text-black/70">{item.unit ?? "—"}</td>
                      <td className="py-2 text-black/70">{item.referenceRange ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {completed.length < order.items.length && (
                <p className="mt-4 text-xs text-black/60 italic">
                  Diqqat: {order.items.length - completed.length} ta tahlil natijasi hali tayyor emas.
                </p>
              )}

              {/* payment summary */}
              <div className="mt-6 flex justify-end">
                <table className="text-sm">
                  <tbody>
                    <tr>
                      <td className="pr-6 py-1 text-black/60">Jami summa:</td>
                      <td className="py-1 text-right tabular font-semibold">{money(order.totalAmount)}</td>
                    </tr>
                    {order.discount > 0 && (
                      <tr>
                        <td className="pr-6 py-1 text-black/60">Chegirma:</td>
                        <td className="py-1 text-right tabular">−{money(order.discount)}</td>
                      </tr>
                    )}
                    <tr className="border-t border-black/25">
                      <td className="pr-6 py-1 text-black/60">To'langan:</td>
                      <td className="py-1 text-right tabular">{money(order.paidAmount)}</td>
                    </tr>
                    {order.totalAmount > order.paidAmount && (
                      <tr>
                        <td className="pr-6 py-1 font-semibold">Qarzdorlik:</td>
                        <td className="py-1 text-right tabular font-bold">
                          {money(order.totalAmount - order.paidAmount)}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* signatures */}
              <div className="mt-12 flex items-end justify-between gap-6 text-sm print-avoid-break">
                <div>
                  {/* Named from the results themselves when they all came from
                      one person, which is the normal case; a mixed batch falls
                      back to a blank line for a hand signature. */}
                  <p className="text-black/60">
                    {analysts.length === 1 ? `Laborant: ${analysts[0]}` : "Laborant:"}
                  </p>
                  <div className="mt-10 w-52 border-t border-black/50" />
                </div>

                <div>
                  <p className="text-black/60">{lab.director ? `Rahbar: ${lab.director}` : "Rahbar imzosi:"}</p>
                  <div className="mt-10 w-52 border-t border-black/50" />
                </div>
              </div>

              <p className="mt-8 pt-3 border-t border-black/15 text-[11px] text-black/45 text-center">
                Natijalar faqat topshirilgan namuna uchun amal qiladi va shifokor xulosasi o'rnini bosmaydi.
              </p>
            </div>
          </div>
        </ScrollArea>

        <DialogFooter className="no-print flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Yopish
          </Button>
          <Button onClick={() => window.print()} data-testid="button-print">
            <Printer className="h-4 w-4 mr-2" />
            Chop etish
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-black/55">{label}: </span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
