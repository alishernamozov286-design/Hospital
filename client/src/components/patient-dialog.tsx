import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Loader2, Send, UserPlus } from "lucide-react";
import { insertPatientSchema, type Patient, type TelegramPhoneStatus } from "@shared/schema";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PhoneInput } from "@/components/inputs";
import { PatientNumber } from "@/components/ui-kit";
import { apiRequest, invalidateApi } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useDebounced } from "@/hooks/use-debounced";
import { formatPhone, isCompletePhone, phoneE164 } from "@/lib/format";
import { z } from "zod";

const formSchema = insertPatientSchema.extend({
  // The Select emits "" for "not chosen"; normalise it away before validation.
  gender: z.union([z.enum(["erkak", "ayol"]), z.literal("")]).nullish(),
  age: z.union([z.coerce.number().int().min(0).max(130), z.literal("")]).nullish(),
  // The mask guarantees the shape; this catches a half-typed number.
  phone: z
    .string()
    .refine(isCompletePhone, "Telefon raqamini to'liq kiriting: +998 XX XXX XX XX"),
});

type FormValues = z.input<typeof formSchema>;

export function PatientDialog({
  open,
  onOpenChange,
  patient,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present = edit mode, absent = create mode. */
  patient?: Patient | null;
  onSaved?: (patient: Patient) => void;
}) {
  const { toast } = useToast();
  const isEdit = Boolean(patient);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { fullName: "", phone: "", address: "", age: "", gender: "" },
  });

  useEffect(() => {
    if (!open) return;
    form.reset({
      fullName: patient?.fullName ?? "",
      // Older rows may hold an unformatted number; normalise on open.
      phone: patient?.phone ? formatPhone(patient.phone, true) : "",
      address: patient?.address ?? "",
      age: patient?.age ?? "",
      gender: (patient?.gender as "erkak" | "ayol" | null) ?? "",
    });
  }, [open, patient, form]);

  // Live answer to "has this person already opened the bot?". The registrator
  // sees it while typing the number, before the patient is even saved.
  const typedPhone = useDebounced(form.watch("phone") ?? "", 400);
  const phoneReady = open && isCompletePhone(typedPhone);
  const { data: telegram, isFetching: telegramLoading } = useQuery<TelegramPhoneStatus>({
    queryKey: [`/api/telegram/phone?phone=${encodeURIComponent(phoneE164(typedPhone))}`],
    enabled: phoneReady,
  });
  const { data: botInfo } = useQuery<{ enabled: boolean; username: string | null }>({
    queryKey: ["/api/telegram/status"],
    enabled: open,
  });

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      const payload = {
        fullName: values.fullName,
        phone: values.phone,
        address: values.address || null,
        age: values.age === "" || values.age == null ? null : Number(values.age),
        gender: values.gender || null,
      };
      const res = isEdit
        ? await apiRequest("PATCH", `/api/patients/${patient!.id}`, payload)
        : await apiRequest("POST", "/api/patients", payload);
      return (await res.json()) as Patient;
    },
    onSuccess: (saved) => {
      invalidateApi("/api/patients", "/api/stats");
      const justLinked = Boolean(saved.telegramChatId) && !patient?.telegramChatId;
      // The number is the useful half of the message on create — it is what the
      // registrator reads back to the patient — so it leads the title there.
      toast({
        title: isEdit
          ? "Bemor ma'lumotlari yangilandi"
          : `Bemor ro'yxatdan o'tkazildi — №${saved.patientNumber}`,
        description: justLinked ? `${saved.fullName} · Telegram ulandi ✅` : saved.fullName,
      });
      onOpenChange(false);
      onSaved?.(saved);
    },
    onError: (err: Error) => {
      toast({ variant: "destructive", title: "Saqlanmadi", description: err.message });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="icon-tile h-10 w-10 bg-primary/10 text-primary">
              <UserPlus className="h-5 w-5" />
            </div>
            <div>
              <DialogTitle className="flex items-center gap-2">
                {isEdit ? "Bemor ma'lumotlari" : "Yangi bemor"}
                {isEdit && <PatientNumber value={patient?.patientNumber} size="sm" />}
              </DialogTitle>
              <DialogDescription className="mt-0.5">
                F.I.Sh va telefon majburiy, qolgani ixtiyoriy.
                {!isEdit && " Navbat raqami saqlagandan keyin avtomatik beriladi."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <Form {...form}>
          <form
            onSubmit={form.handleSubmit((values) => mutation.mutate(values))}
            className="space-y-4"
            id="patient-form"
          >
            <FormField
              control={form.control}
              name="fullName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>F.I.Sh</FormLabel>
                  <FormControl>
                    <Input placeholder="Aliyev Vali Akramovich" data-testid="input-fullname" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <FormField
                control={form.control}
                name="phone"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Telefon</FormLabel>
                    <FormControl>
                      <PhoneInput
                        value={field.value}
                        onChange={field.onChange}
                        onBlur={field.onBlur}
                        data-testid="input-phone"
                      />
                    </FormControl>
                    <FormMessage />
                    {botInfo?.enabled && phoneReady && !telegramLoading && (
                      <p
                        className={
                          telegram?.connected
                            ? "flex items-start gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400"
                            : "flex items-start gap-1.5 text-xs text-muted-foreground"
                        }
                        data-testid="text-telegram-hint"
                      >
                        <Send className="mt-0.5 h-3 w-3 shrink-0" />
                        <span>
                          {telegram?.source === "pending"
                            ? `Botga /start bergan${telegram.telegramName ? ` (${telegram.telegramName})` : ""} — saqlagach avtomatik ulanadi`
                            : telegram?.connected
                              ? "Botga ulangan — natijalar Telegramga yuboriladi"
                              : `Botga /start bermagan${botInfo.username ? ` — @${botInfo.username}` : ""}`}
                        </span>
                      </p>
                    )}
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="age"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Yosh</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={130}
                        placeholder="35"
                        data-testid="input-age"
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="gender"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Jinsi</FormLabel>
                  <Select onValueChange={field.onChange} value={(field.value as string) || undefined}>
                    <FormControl>
                      <SelectTrigger data-testid="select-gender">
                        <SelectValue placeholder="Tanlang" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="erkak">Erkak</SelectItem>
                      <SelectItem value="ayol">Ayol</SelectItem>
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Manzil</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Toshkent sh., Chilonzor t."
                      data-testid="input-address"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </form>
        </Form>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Bekor qilish
          </Button>
          <Button type="submit" form="patient-form" disabled={mutation.isPending} data-testid="button-save-patient">
            {mutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {isEdit ? "Saqlash" : "Ro'yxatdan o'tkazish"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
