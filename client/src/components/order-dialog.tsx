import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { Check, FlaskConical, Loader2, Lock, Search, ShoppingCart, UserPlus, X } from "lucide-react";
import type { OrderWithDetails, Patient, Test } from "@shared/schema";
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
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Textarea } from "@/components/ui/textarea";
import { apiRequest, invalidateApi } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useDebounced } from "@/hooks/use-debounced";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";
import { Avatar, EmptyState, PatientNumber, PhoneText } from "@/components/ui-kit";
import { MoneyInput, SearchInput } from "@/components/inputs";
import { PatientDialog } from "@/components/patient-dialog";

export function OrderDialog({
  open,
  onOpenChange,
  presetPatient,
  order,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When opened from a patient row, skip straight to test selection. */
  presetPatient?: Patient | null;
  /** Present = edit an existing order's test list, absent = create a new one. */
  order?: OrderWithDetails | null;
}) {
  const { toast } = useToast();
  const isEdit = Boolean(order);
  const [patientSearch, setPatientSearch] = useState("");
  const [testSearch, setTestSearch] = useState("");
  const [selectedPatient, setSelectedPatient] = useState<Patient | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [discount, setDiscount] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [notes, setNotes] = useState("");
  const [referrer, setReferrer] = useState("");
  const [newPatientOpen, setNewPatientOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (order) {
      setSelectedPatient(order.patient);
      setSelectedIds(order.items.map((i) => i.testId));
      setDiscount(order.discount);
      // Payment is its own ledger once the order exists; editing it here would
      // be a second, silent way to move money.
      setPaidAmount(order.paidAmount);
      setNotes(order.notes ?? "");
      setReferrer(order.referrer ?? "");
    } else {
      setSelectedPatient(presetPatient ?? null);
      setSelectedIds([]);
      setDiscount(0);
      setPaidAmount(0);
      setNotes("");
      setReferrer("");
    }
    setPatientSearch("");
    setTestSearch("");
  }, [open, presetPatient, order]);

  /**
   * Lines that already hold a result. The server refuses to drop these, so the
   * checkbox is locked here too — a control that silently does nothing is worse
   * than one that explains why it is disabled.
   */
  const lockedTestIds = useMemo(
    () => new Set((order?.items ?? []).filter((i) => i.result).map((i) => i.testId)),
    [order],
  );

  // The picker asks the server for the eight best matches rather than pulling
  // the whole patient table into the dialog.
  const debouncedPatientSearch = useDebounced(patientSearch.trim(), 250);
  const { data: patientsData, isFetching: patientsFetching } = useQuery<{
    items: Patient[];
    total: number;
  }>({
    queryKey: [`/api/patients?search=${encodeURIComponent(debouncedPatientSearch)}&limit=8`],
    enabled: open && !selectedPatient,
    placeholderData: keepPreviousData,
  });

  const { data: tests = [] } = useQuery<Test[]>({ queryKey: ["/api/tests"], enabled: open });

  const filteredPatients = patientsData?.items ?? [];

  const groupedTests = useMemo(() => {
    const q = testSearch.trim().toLowerCase();
    const filtered = q ? tests.filter((t) => t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q)) : tests;
    const groups = new Map<string, Test[]>();
    for (const t of filtered) {
      const list = groups.get(t.category) ?? [];
      list.push(t);
      groups.set(t.category, list);
    }
    return Array.from(groups.entries());
  }, [tests, testSearch]);

  const selectedTests = useMemo(
    () => selectedIds.map((id) => tests.find((t) => t.id === id)).filter((t): t is Test => Boolean(t)),
    [selectedIds, tests],
  );

  const subtotal = selectedTests.reduce((sum, t) => sum + t.price, 0);
  const discountValue = Math.min(discount, subtotal);
  const total = subtotal - discountValue;
  const debt = Math.max(0, total - paidAmount);

  const toggleTest = (id: string) => {
    if (lockedTestIds.has(id)) return;
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const mutation = useMutation({
    mutationFn: async () => {
      if (order) {
        const res = await apiRequest("PATCH", `/api/orders/${order.id}`, {
          testIds: selectedIds,
          discount: discountValue,
          notes: notes || null,
          referrer: referrer.trim() || null,
        });
        return (await res.json()) as OrderWithDetails;
      }
      const res = await apiRequest("POST", "/api/orders", {
        patientId: selectedPatient!.id,
        testIds: selectedIds,
        discount: discountValue,
        paidAmount,
        notes: notes || null,
        referrer: referrer.trim() || null,
      });
      return (await res.json()) as OrderWithDetails;
    },
    onSuccess: (saved) => {
      invalidateApi("/api/orders", "/api/stats");
      toast({
        title: isEdit ? `Buyurtma #${saved.orderNumber} yangilandi` : `Buyurtma #${saved.orderNumber} yaratildi`,
        description: `${saved.items.length} ta tahlil · ${money(saved.totalAmount)}`,
      });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({
        variant: "destructive",
        title: isEdit ? "Saqlanmadi" : "Buyurtma yaratilmadi",
        description: err.message,
      });
    },
  });

  const canSubmit = Boolean(selectedPatient) && selectedIds.length > 0 && !mutation.isPending;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-5xl h-[88vh] flex flex-col gap-0 p-0">
          <DialogHeader className="p-6 pb-4">
            <div className="flex items-center gap-3">
              <div className="icon-tile h-10 w-10 bg-primary/10 text-primary">
                <FlaskConical className="h-5 w-5" />
              </div>
              <div>
                <DialogTitle>
                  {isEdit ? `Buyurtma #${order!.orderNumber} — tahrirlash` : "Yangi buyurtma"}
                </DialogTitle>
                <DialogDescription className="mt-0.5">
                  {isEdit
                    ? "Tahlil qo'shing yoki olib tashlang — summa qayta hisoblanadi. Natijasi kiritilgan tahlilni o'chirib bo'lmaydi."
                    : "Bemorni tanlang, so'ng tahlillarni belgilang — summa avtomatik hisoblanadi."}
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <Separator />

          <div className="flex-1 min-h-0 grid lg:grid-cols-[1fr_360px]">
            {/* left: patient + test picker */}
            <div className="flex flex-col min-h-0 border-r">
              <div className="p-5 space-y-4">
                <div>
                  <Label className="mb-2 block">1. Bemor</Label>
                  {selectedPatient ? (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/[0.04] p-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar name={selectedPatient.fullName} />
                        <div className="min-w-0">
                          <p className="flex items-center gap-2 font-medium">
                            <PatientNumber value={selectedPatient.patientNumber} size="sm" />
                            <span className="truncate">{selectedPatient.fullName}</span>
                          </p>
                          <PhoneText
                            value={selectedPatient.phone}
                            asLink={false}
                            className="text-sm text-muted-foreground"
                          />
                        </div>
                      </div>
                      {/* The order already belongs to this patient; moving it to
                          another one is not an edit, it is a different order. */}
                      {!isEdit && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setSelectedPatient(null)}
                          data-testid="button-clear-patient"
                        >
                          <X className="h-4 w-4 mr-1" />
                          O'zgartirish
                        </Button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <div className="flex gap-2">
                        <SearchInput
                          value={patientSearch}
                          onChange={setPatientSearch}
                          placeholder="Raqam, ism yoki telefon bo'yicha qidiring..."
                          className="flex-1"
                          data-testid="input-patient-search"
                        />
                        <Button variant="outline" onClick={() => setNewPatientOpen(true)} data-testid="button-new-patient-inline">
                          <UserPlus className="mr-2 h-4 w-4" />
                          Yangi
                        </Button>
                      </div>

                      <div className="max-h-56 divide-y overflow-auto rounded-xl border">
                        {filteredPatients.length === 0 ? (
                          <p className="p-4 text-center text-sm text-muted-foreground">
                            {patientsFetching
                              ? "Qidirilmoqda..."
                              : 'Bemor topilmadi. "Yangi" tugmasi orqali qo\'shing.'}
                          </p>
                        ) : (
                          filteredPatients.map((p) => (
                            <button
                              key={p.id}
                              type="button"
                              onClick={() => setSelectedPatient(p)}
                              className="flex w-full items-center gap-3 p-3 text-left transition-colors hover:bg-muted/60"
                              data-testid={`option-patient-${p.id}`}
                            >
                              <Avatar name={p.fullName} size="sm" />
                              <div className="min-w-0">
                                <p className="flex items-center gap-2 font-medium">
                                  <PatientNumber value={p.patientNumber} size="sm" />
                                  <span className="truncate">{p.fullName}</span>
                                </p>
                                <PhoneText
                                  value={p.phone}
                                  asLink={false}
                                  className="text-xs text-muted-foreground"
                                />
                              </div>
                            </button>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <Label className="mb-2 block">2. Tahlillar</Label>
                  <SearchInput
                    value={testSearch}
                    onChange={setTestSearch}
                    placeholder="Tahlil nomi yoki kategoriya..."
                    data-testid="input-test-search"
                  />
                </div>
              </div>

              <ScrollArea className="flex-1 min-h-0 px-5 pb-5">
                {groupedTests.length === 0 ? (
                  <EmptyState icon={Search} title="Hech narsa topilmadi" description="Boshqa so'z bilan qidirib ko'ring." />
                ) : (
                  <div className="space-y-5">
                    {groupedTests.map(([category, items]) => (
                      <div key={category}>
                        <h4 className="text-sm font-semibold text-muted-foreground mb-2 sticky top-0 bg-background/95 backdrop-blur py-1">
                          {category}
                        </h4>
                        <div className="space-y-1.5">
                          {items.map((t) => {
                            const checked = selectedIds.includes(t.id);
                            const locked = lockedTestIds.has(t.id);
                            return (
                              <button
                                key={t.id}
                                type="button"
                                onClick={() => toggleTest(t.id)}
                                disabled={locked}
                                title={locked ? "Natijasi kiritilgan — o'chirib bo'lmaydi" : undefined}
                                data-testid={`test-option-${t.id}`}
                                className={cn(
                                  "flex w-full items-center gap-3 rounded-xl border p-3 text-left transition-all hover:border-primary/30 hover:bg-muted/50",
                                  checked && "border-primary/50 bg-primary/[0.06] shadow-xs",
                                  locked && "cursor-not-allowed opacity-70 hover:border-border hover:bg-transparent",
                                )}
                              >
                                <Checkbox checked={checked} className="pointer-events-none" tabIndex={-1} />
                                <div className="flex-1 min-w-0">
                                  <p className="flex items-center gap-1.5 text-sm font-medium">
                                    <span className="truncate">{t.name}</span>
                                    {locked && <Lock className="h-3 w-3 shrink-0 text-muted-foreground" />}
                                  </p>
                                  {t.referenceRange && (
                                    <p className="text-xs text-muted-foreground truncate">
                                      Me'yor: {t.referenceRange}
                                      {t.unit ? ` ${t.unit}` : ""}
                                    </p>
                                  )}
                                </div>
                                <Badge variant="secondary" className="tabular shrink-0">
                                  {money(t.price)}
                                </Badge>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </ScrollArea>
            </div>

            {/* right: cart */}
            <div className="flex flex-col min-h-0 bg-muted/25">
              <div className="p-5 pb-3 flex items-center gap-2">
                <ShoppingCart className="h-4 w-4 text-primary" />
                <h3 className="font-semibold">Tanlangan</h3>
                <Badge variant="secondary" className="ml-auto">{selectedIds.length}</Badge>
              </div>

              <ScrollArea className="flex-1 min-h-0 px-5">
                {selectedTests.length === 0 ? (
                  <p className="text-sm text-muted-foreground text-center py-10">
                    Hali tahlil tanlanmagan
                  </p>
                ) : (
                  <div className="space-y-1.5 pb-3">
                    {selectedTests.map((t) => {
                      const locked = lockedTestIds.has(t.id);
                      return (
                        <div key={t.id} className="flex items-center gap-2 rounded-md bg-background border p-2.5">
                          <p className="text-sm flex-1 min-w-0 truncate">{t.name}</p>
                          <span className="text-sm tabular text-muted-foreground whitespace-nowrap">
                            {money(t.price, false)}
                          </span>
                          {locked ? (
                            <Lock
                              className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
                              aria-label="Natijasi kiritilgan"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => toggleTest(t.id)}
                              className="text-muted-foreground hover:text-destructive shrink-0"
                              aria-label="Olib tashlash"
                            >
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}
              </ScrollArea>

              <div className="space-y-3 border-t bg-background p-5 pt-4">
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="discount" className="text-xs">Chegirma</Label>
                    <MoneyInput
                      id="discount"
                      value={discount}
                      onChange={setDiscount}
                      data-testid="input-discount"
                    />
                  </div>
                  {/* Once the order exists, money moves only through the payment
                      ledger — a second editable field here would be a silent way
                      to change the till without leaving a record. */}
                  {isEdit ? (
                    <div className="space-y-1.5">
                      <Label className="text-xs">To'langan</Label>
                      <div className="flex h-9 items-center rounded-md border bg-muted/40 px-3 text-sm tabular">
                        {money(paidAmount, false)}
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="paid" className="text-xs">To'landi</Label>
                        <button
                          type="button"
                          onClick={() => setPaidAmount(total)}
                          className="text-[11px] font-medium text-primary hover:underline"
                        >
                          To'liq
                        </button>
                      </div>
                      <MoneyInput
                        id="paid"
                        value={paidAmount}
                        onChange={setPaidAmount}
                        data-testid="input-paid"
                      />
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="referrer" className="text-xs">Yo'naltirgan shifokor / klinika</Label>
                  <Input
                    id="referrer"
                    value={referrer}
                    onChange={(e) => setReferrer(e.target.value)}
                    placeholder="Masalan: Dr. Karimov"
                    data-testid="input-referrer"
                  />
                </div>

                <Textarea
                  placeholder="Izoh (ixtiyoriy)"
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="resize-none"
                />

                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between text-muted-foreground">
                    <span>Tahlillar summasi</span>
                    <span className="tabular">{money(subtotal)}</span>
                  </div>
                  {discountValue > 0 && (
                    <div className="flex justify-between text-muted-foreground">
                      <span>Chegirma</span>
                      <span className="tabular">−{money(discountValue)}</span>
                    </div>
                  )}
                  {debt > 0 && paidAmount > 0 && (
                    <div className="flex justify-between text-rose-600 dark:text-rose-400">
                      <span>Qarzdorlik</span>
                      <span className="tabular">{money(debt)}</span>
                    </div>
                  )}
                  <Separator className="my-2" />
                  <div className="flex items-baseline justify-between">
                    <span className="font-semibold">To'lovga</span>
                    <span className="text-2xl font-bold tabular text-primary" data-testid="text-order-total">
                      {money(total)}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="p-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Bekor qilish
            </Button>
            <Button onClick={() => mutation.mutate()} disabled={!canSubmit} data-testid="button-create-order">
              {mutation.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Check className="h-4 w-4 mr-2" />
              )}
              {isEdit ? "Saqlash" : "Buyurtmani yaratish"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <PatientDialog
        open={newPatientOpen}
        onOpenChange={setNewPatientOpen}
        onSaved={(p) => setSelectedPatient(p)}
      />
    </>
  );
}
