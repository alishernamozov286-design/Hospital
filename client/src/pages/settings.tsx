import { useEffect, useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
  Building2,
  FlaskConical,
  Loader2,
  Lock,
  LockOpen,
  MoreVertical,
  Pencil,
  Plus,
  Send,
  ShieldCheck,
  Trash2,
  UserCog,
} from "lucide-react";
import { formatLockRemaining, lockRemainingMs } from "@shared/lockout";
import {
  ROLES,
  ROLE_LABELS,
  insertTestSchema,
  insertUserSchema,
  labSettingsSchema,
  type LabSettings,
  type LabSettingsInput,
  type PublicUser,
  type Role,
  type Test,
} from "@shared/schema";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Form, FormControl, FormDescription, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Avatar, EmptyState, PageHeader, RoleBadge, SectionCard, TableSkeleton } from "@/components/ui-kit";
import { MoneyInput, PhoneInput, SearchInput } from "@/components/inputs";
import { ExportButtons } from "@/components/export-buttons";
import type { ExportColumn } from "@/lib/export-types";
import { AuditPanel, BackupPanel, PasswordPanel } from "@/components/settings-security";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { apiRequest, invalidateApi } from "@/lib/queryClient";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { money } from "@/lib/format";
import { cn } from "@/lib/utils";

export default function Settings() {
  const { can } = useAuth();

  if (!can("admin")) {
    return (
      <div className="space-y-6">
        <PageHeader title="Sozlamalar" description="Tizim sozlamalari" />
        <div className="card-premium">
          <EmptyState
            icon={UserCog}
            title="Ruxsat yo'q"
            description="Sozlamalarni faqat administrator o'zgartira oladi."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Tizim"
        title="Sozlamalar"
        description="Laboratoriya ma'lumotlari, narxlar ro'yxati va xodimlar"
      />

      <Tabs defaultValue="lab">
        <TabsList>
          <TabsTrigger value="lab" data-testid="tab-lab">
            <Building2 className="mr-2 h-4 w-4" />
            Laboratoriya
          </TabsTrigger>
          <TabsTrigger value="tests" data-testid="tab-tests">
            <FlaskConical className="mr-2 h-4 w-4" />
            Tahlillar
          </TabsTrigger>
          <TabsTrigger value="users" data-testid="tab-users">
            <UserCog className="mr-2 h-4 w-4" />
            Xodimlar
          </TabsTrigger>
          <TabsTrigger value="security" data-testid="tab-security">
            <ShieldCheck className="mr-2 h-4 w-4" />
            Xavfsizlik
          </TabsTrigger>
        </TabsList>

        <TabsContent value="lab" className="mt-6 space-y-6">
          <LabSettingsPanel />
          <TelegramPanel />
        </TabsContent>
        <TabsContent value="tests" className="mt-6">
          <TestsPanel />
        </TabsContent>
        <TabsContent value="users" className="mt-6">
          <UsersPanel />
        </TabsContent>
        <TabsContent value="security" className="mt-6 space-y-6">
          <PasswordPanel />
          <BackupPanel />
          {can("admin") && <AuditPanel />}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ----------------------------------------------------------------- lab info

function LabSettingsPanel() {
  const { toast } = useToast();
  const { data } = useQuery<LabSettings>({ queryKey: ["/api/settings"] });

  const form = useForm<LabSettingsInput>({
    resolver: zodResolver(labSettingsSchema),
    defaultValues: { labName: "", tagline: "", address: "", phone: "", director: "", licenseNumber: "" },
  });

  useEffect(() => {
    if (!data) return;
    form.reset({
      labName: data.labName,
      tagline: data.tagline,
      address: data.address ?? "",
      phone: data.phone ?? "",
      director: data.director ?? "",
      licenseNumber: data.licenseNumber ?? "",
    });
  }, [data, form]);

  const mutation = useMutation({
    mutationFn: async (values: LabSettingsInput) => {
      const res = await apiRequest("PUT", "/api/settings", values);
      return (await res.json()) as LabSettings;
    },
    onSuccess: () => {
      invalidateApi("/api/settings");
      toast({ title: "Sozlamalar saqlandi", description: "Blankadagi shapka yangilandi" });
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "Saqlanmadi", description: err.message }),
  });

  return (
    <SectionCard
      icon={Building2}
      title="Laboratoriya ma'lumotlari"
      description="Natija blankasining shapkasida shu ma'lumotlar chiqadi"
      className="max-w-3xl"
      bodyClassName="p-6"
    >
      <Form {...form}>
        <form onSubmit={form.handleSubmit((v) => mutation.mutate(v))} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="labName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Laboratoriya nomi</FormLabel>
                  <FormControl>
                    <Input data-testid="input-lab-name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="tagline"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Qisqa tavsif</FormLabel>
                  <FormControl>
                    <Input placeholder="Tibbiy Laboratoriya" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="address"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Manzil</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} />
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
                      value={field.value ?? ""}
                      onChange={field.onChange}
                      onBlur={field.onBlur}
                      data-testid="input-lab-phone"
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="licenseNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Litsenziya raqami</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="director"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Rahbar F.I.Sh</FormLabel>
                <FormControl>
                  <Input {...field} value={field.value ?? ""} />
                </FormControl>
                <FormDescription>Blankadagi imzo joyida ko'rsatiladi</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <Button type="submit" disabled={mutation.isPending} data-testid="button-save-settings">
            {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Saqlash
          </Button>
        </form>
      </Form>
    </SectionCard>
  );
}

// -------------------------------------------------------------------- telegram

/**
 * Read-only status of the results bot. The token itself lives in the server
 * environment, so there is nothing to edit here — only to verify.
 */
function TelegramPanel() {
  const { data } = useQuery<{ enabled: boolean; username: string | null }>({
    queryKey: ["/api/telegram/status"],
  });

  const enabled = data?.enabled ?? false;
  const username = data?.username;

  return (
    <SectionCard
      icon={Send}
      title="Telegram bot"
      description="Tayyor natijalar bemorning Telegramiga avtomatik yuboriladi"
      className="max-w-3xl"
      bodyClassName="p-6 space-y-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <Badge
          variant="outline"
          className={
            enabled
              ? "gap-1.5 border-emerald-500/25 bg-emerald-500/10 font-medium text-emerald-700 dark:text-emerald-300"
              : "gap-1.5 font-medium text-muted-foreground"
          }
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${enabled ? "bg-emerald-500" : "bg-muted-foreground/50"}`}
          />
          {enabled ? "Ulangan" : "Sozlanmagan"}
        </Badge>
        {username && (
          <a
            href={`https://t.me/${username}`}
            target="_blank"
            rel="noreferrer"
            className="text-sm font-medium text-primary hover:underline"
          >
            @{username}
          </a>
        )}
      </div>

      <ol className="space-y-1.5 text-sm text-muted-foreground">
        <li>1. Bemor botni ochib <span className="font-medium text-foreground">/start</span> bosadi.</li>
        <li>2. Tugma orqali telefon raqamini yuboradi — raqam bazadagi bemor bilan solishtiriladi.</li>
        <li>
          3. Buyurtmaning barcha natijalari kiritilgach, xabar avtomatik yuboriladi. Bemor keyinroq
          ulansa, ulangan zahoti yetkaziladi.
        </li>
      </ol>

      {!enabled && (
        <p className="rounded-lg border bg-muted/40 p-3 text-sm text-muted-foreground">
          Bot o'chirilgan: server muhitida <span className="font-mono text-xs">TELEGRAM_BOT_TOKEN</span>{" "}
          o'zgaruvchisi yo'q.
        </p>
      )}
    </SectionCard>
  );
}

// -------------------------------------------------------------- test catalogue

const testFormSchema = insertTestSchema;
type TestFormValues = z.input<typeof testFormSchema>;

/** The price list, as handed to a partner clinic — see lib/export.ts. */
const TEST_EXPORT_COLUMNS: ExportColumn<Test>[] = [
  { header: "Tahlil nomi", value: (t) => t.name, width: 34 },
  { header: "Kategoriya", value: (t) => t.category, width: 22 },
  { header: "Me'yoriy oraliq", value: (t) => t.referenceRange ?? "", width: 18 },
  { header: "Birlik", value: (t) => t.unit ?? "", width: 12 },
  { header: "Holat", value: (t) => (t.isActive ? "Faol" : "O'chirilgan"), width: 14 },
  { header: "Narx", value: (t) => t.price, type: "money", width: 16, total: true },
];

function TestsPanel() {
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<Test | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<Test | null>(null);

  const { data: tests = [], isLoading } = useQuery<Test[]>({ queryKey: ["/api/tests?all=1"] });

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return tests;
    return tests.filter((t) => t.name.toLowerCase().includes(q) || t.category.toLowerCase().includes(q));
  }, [tests, search]);

  const categories = useMemo(
    () => Array.from(new Set(tests.map((t) => t.category))).sort(),
    [tests],
  );

  const form = useForm<TestFormValues>({
    resolver: zodResolver(testFormSchema),
    defaultValues: { name: "", price: 0, category: "", unit: "", referenceRange: "", isActive: true },
  });

  useEffect(() => {
    if (!dialogOpen) return;
    form.reset({
      name: editing?.name ?? "",
      price: editing?.price ?? 0,
      category: editing?.category ?? categories[0] ?? "",
      unit: editing?.unit ?? "",
      referenceRange: editing?.referenceRange ?? "",
      isActive: editing?.isActive ?? true,
    });
  }, [dialogOpen, editing, categories, form]);

  const saveMutation = useMutation({
    mutationFn: async (values: TestFormValues) => {
      const payload = { ...values, unit: values.unit || null, referenceRange: values.referenceRange || null };
      const res = editing
        ? await apiRequest("PATCH", `/api/tests/${editing.id}`, payload)
        : await apiRequest("POST", "/api/tests", payload);
      return (await res.json()) as Test;
    },
    onSuccess: () => {
      invalidateApi("/api/tests");
      toast({ title: editing ? "Tahlil yangilandi" : "Tahlil qo'shildi" });
      setDialogOpen(false);
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "Saqlanmadi", description: err.message }),
  });

  const toggleMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: string; isActive: boolean }) => {
      await apiRequest("PATCH", `/api/tests/${id}`, { isActive });
    },
    onSuccess: () => {
      invalidateApi("/api/tests");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/tests/${id}`);
    },
    onSuccess: () => {
      invalidateApi("/api/tests");
      toast({ title: "Tahlil o'chirildi" });
      setDeleting(null);
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "O'chirilmadi", description: err.message }),
  });

  return (
    <div className="space-y-4">
      <div className="card-premium flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder="Tahlil yoki kategoriya..."
          className="sm:w-80"
          data-testid="input-search-tests"
        />
        <div className="flex items-center gap-3">
          <span className="text-sm tabular text-muted-foreground">{filtered.length} ta tahlil</span>
          <ExportButtons
            testIdPrefix="export-tests"
            disabled={isLoading}
            build={() => ({
              filename: "narxlar-royxati",
              title: "Tahlillar narxlar ro'yxati",
              subtitle: search
                ? `Qidiruv: "${search}" · ${filtered.length} ta tahlil`
                : `${filtered.length} ta tahlil`,
              sheetName: "Narxlar",
              columns: TEST_EXPORT_COLUMNS,
              rows: filtered,
            })}
          />
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
            data-testid="button-add-test"
          >
            <Plus className="mr-2 h-4 w-4" />
            Yangi tahlil
          </Button>
        </div>
      </div>

      <div className="card-premium overflow-hidden">
        {isLoading ? (
          <TableSkeleton />
        ) : filtered.length === 0 ? (
          <EmptyState icon={FlaskConical} title="Tahlil topilmadi" description="Qidiruv so'zini o'zgartiring." />
        ) : (
          <div className="overflow-x-auto">
            <Table className="table-premium">
              <TableHeader>
                <TableRow>
                  <TableHead>Nomi</TableHead>
                  <TableHead className="hidden md:table-cell">Kategoriya</TableHead>
                  <TableHead className="hidden lg:table-cell">Me'yor</TableHead>
                  <TableHead className="text-right">Narx</TableHead>
                  <TableHead className="w-20 text-center">Faol</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((t) => (
                  <TableRow key={t.id} data-testid={`row-test-${t.id}`}>
                    <TableCell className={cn("font-medium", !t.isActive && "text-muted-foreground line-through")}>
                      {t.name}
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Badge variant="secondary" className="font-normal">{t.category}</Badge>
                    </TableCell>
                    <TableCell className="hidden text-sm text-muted-foreground lg:table-cell">
                      {t.referenceRange ? `${t.referenceRange}${t.unit ? ` ${t.unit}` : ""}` : "—"}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-right font-semibold tabular">
                      {money(t.price)}
                    </TableCell>
                    <TableCell className="text-center">
                      <Switch
                        checked={t.isActive}
                        onCheckedChange={(isActive) => toggleMutation.mutate({ id: t.id, isActive })}
                        data-testid={`switch-test-${t.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon">
                            <MoreVertical className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onClick={() => {
                              setEditing(t);
                              setDialogOpen(true);
                            }}
                          >
                            <Pencil className="h-4 w-4 mr-2" />
                            Tahrirlash
                          </DropdownMenuItem>
                          <DropdownMenuItem className="text-destructive" onClick={() => setDeleting(t)}>
                            <Trash2 className="h-4 w-4 mr-2" />
                            O'chirish
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Tahlilni tahrirlash" : "Yangi tahlil"}</DialogTitle>
            <DialogDescription>Narx va me'yoriy oraliq blankada ko'rinadi.</DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form
              id="test-form"
              onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))}
              className="space-y-4"
            >
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tahlil nomi</FormLabel>
                    <FormControl>
                      <Input data-testid="input-test-name" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="category"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Kategoriya</FormLabel>
                      <FormControl>
                        <Input list="category-list" data-testid="input-test-category" {...field} />
                      </FormControl>
                      <datalist id="category-list">
                        {categories.map((c) => (
                          <option key={c} value={c} />
                        ))}
                      </datalist>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="price"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Narx</FormLabel>
                      <FormControl>
                        <MoneyInput
                          value={field.value as number}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          data-testid="input-test-price"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <div className="grid gap-4 sm:grid-cols-[1fr_2fr]">
                <FormField
                  control={form.control}
                  name="unit"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Birlik</FormLabel>
                      <FormControl>
                        <Input placeholder="mmol/l" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="referenceRange"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Me'yoriy oraliq</FormLabel>
                      <FormControl>
                        <Input placeholder="3.9-6.1" {...field} value={field.value ?? ""} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </form>
          </Form>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Bekor qilish
            </Button>
            <Button type="submit" form="test-form" disabled={saveMutation.isPending} data-testid="button-save-test">
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Saqlash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Tahlilni o'chirish"
        description={
          <>
            <strong>{deleting?.name}</strong> narxlar ro'yxatidan o'chiriladi. Eski buyurtmalarga
            ta'sir qilmaydi. Vaqtincha yashirish uchun "Faol" tugmasini o'chirish yetarli.
          </>
        }
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}

// ---------------------------------------------------------------------- users

const userFormSchema = insertUserSchema.extend({
  // Editing an existing user may leave the password blank to keep the old one.
  password: z.string().min(5, "Parol kamida 5 ta belgi").or(z.literal("")),
});
type UserFormValues = z.input<typeof userFormSchema>;

/** Staff list — see lib/export.ts. Passwords are, of course, not in it. */
const USER_EXPORT_COLUMNS: ExportColumn<PublicUser>[] = [
  { header: "F.I.Sh", value: (u) => u.fullName, width: 30 },
  { header: "Login", value: (u) => u.username, width: 20 },
  { header: "Rol", value: (u) => ROLE_LABELS[u.role as Role], width: 18 },
  { header: "Holat", value: (u) => (u.isActive ? "Faol" : "Bloklangan"), width: 14 },
];

function UsersPanel() {
  const { toast } = useToast();
  const { user: currentUser } = useAuth();
  const [editing, setEditing] = useState<PublicUser | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState<PublicUser | null>(null);

  const { data: users = [], isLoading } = useQuery<PublicUser[]>({ queryKey: ["/api/users"] });

  const form = useForm<UserFormValues>({
    resolver: zodResolver(userFormSchema),
    defaultValues: { username: "", password: "", fullName: "", role: "registrator", isActive: true },
  });

  useEffect(() => {
    if (!dialogOpen) return;
    form.reset({
      username: editing?.username ?? "",
      password: "",
      fullName: editing?.fullName ?? "",
      role: (editing?.role as Role) ?? "registrator",
      isActive: editing?.isActive ?? true,
    });
  }, [dialogOpen, editing, form]);

  const saveMutation = useMutation({
    mutationFn: async (values: UserFormValues) => {
      if (editing) {
        const payload: Record<string, unknown> = {
          username: values.username,
          fullName: values.fullName,
          role: values.role,
          isActive: values.isActive,
        };
        if (values.password) payload.password = values.password;
        const res = await apiRequest("PATCH", `/api/users/${editing.id}`, payload);
        return (await res.json()) as PublicUser;
      }
      if (!values.password) throw new Error("Yangi foydalanuvchi uchun parol majburiy");
      const res = await apiRequest("POST", "/api/users", values);
      return (await res.json()) as PublicUser;
    },
    onSuccess: () => {
      invalidateApi("/api/users");
      toast({ title: editing ? "Foydalanuvchi yangilandi" : "Foydalanuvchi qo'shildi" });
      setDialogOpen(false);
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "Saqlanmadi", description: err.message }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/users/${id}`);
    },
    onSuccess: () => {
      invalidateApi("/api/users");
      toast({ title: "Foydalanuvchi o'chirildi" });
      setDeleting(null);
    },
    onError: (err: Error) => toast({ variant: "destructive", title: "O'chirilmadi", description: err.message }),
  });

  /** The escape hatch from the escalating login lockout — see shared/lockout.ts. */
  const unlockMutation = useMutation({
    mutationFn: async (user: PublicUser) => {
      await apiRequest("POST", `/api/users/${user.id}/unlock`);
      return user;
    },
    onSuccess: (user) => {
      invalidateApi("/api/users");
      toast({
        title: "Qulf ochildi",
        description: `${user.fullName} endi tizimga kira oladi`,
      });
    },
    onError: (err: Error) =>
      toast({ variant: "destructive", title: "Ochilmadi", description: err.message }),
  });

  return (
    <div className="space-y-4">
      <div className="card-premium flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="max-w-2xl text-sm text-muted-foreground">
          Administrator to'liq huquqqa ega, registrator bemor va buyurtma bilan, laborant esa
          natijalar bilan ishlaydi.
        </p>
        <div className="flex shrink-0 items-center gap-3">
          <ExportButtons
            testIdPrefix="export-users"
            disabled={isLoading}
            build={() => ({
              filename: "xodimlar",
              title: "Xodimlar ro'yxati",
              subtitle: `${users.length} ta xodim`,
              sheetName: "Xodimlar",
              columns: USER_EXPORT_COLUMNS,
              rows: users,
            })}
          />
          <Button
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
            data-testid="button-add-user"
          >
            <Plus className="mr-2 h-4 w-4" />
            Yangi xodim
          </Button>
        </div>
      </div>

      <div className="card-premium overflow-hidden">
        {isLoading ? (
          <TableSkeleton rows={3} />
        ) : (
          <Table className="table-premium">
            <TableHeader>
              <TableRow>
                <TableHead>Xodim</TableHead>
                <TableHead>Login</TableHead>
                <TableHead>Rol</TableHead>
                <TableHead className="text-center">Holat</TableHead>
                <TableHead className="w-12" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((u) => (
                <TableRow key={u.id} data-testid={`row-user-${u.username}`}>
                  <TableCell>
                    <div className="flex items-center gap-3">
                      <Avatar name={u.fullName} size="sm" />
                      <span className="font-medium">{u.fullName}</span>
                      {u.id === currentUser?.id && (
                        <Badge variant="secondary" className="text-[10px]">Siz</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-muted-foreground">@{u.username}</TableCell>
                  <TableCell>
                    <RoleBadge role={u.role as Role} />
                  </TableCell>
                  <TableCell className="text-center">
                    {/* A lock outranks the active flag: an enabled account
                        nobody can sign in to is the thing an admin needs to
                        notice first. */}
                    {lockRemainingMs(u.lockedUntil) > 0 ? (
                      <Badge
                        variant="outline"
                        className="gap-1.5 border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300"
                        data-testid={`badge-locked-${u.username}`}
                      >
                        <Lock className="h-3 w-3" />
                        {formatLockRemaining(lockRemainingMs(u.lockedUntil))}
                      </Badge>
                    ) : u.isActive ? (
                      <Badge
                        variant="outline"
                        className="gap-1.5 border-emerald-500/25 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        Faol
                      </Badge>
                    ) : (
                      <Badge
                        variant="outline"
                        className="gap-1.5 border-rose-500/25 bg-rose-500/10 text-rose-700 dark:text-rose-300"
                      >
                        <span className="h-1.5 w-1.5 rounded-full bg-rose-500" />
                        Bloklangan
                      </Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button variant="ghost" size="icon">
                          <MoreVertical className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        {lockRemainingMs(u.lockedUntil) > 0 && (
                          <DropdownMenuItem
                            onClick={() => unlockMutation.mutate(u)}
                            disabled={unlockMutation.isPending}
                            data-testid={`button-unlock-${u.username}`}
                          >
                            <LockOpen className="mr-2 h-4 w-4" />
                            Qulfni ochish
                          </DropdownMenuItem>
                        )}
                        <DropdownMenuItem
                          onClick={() => {
                            setEditing(u);
                            setDialogOpen(true);
                          }}
                        >
                          <Pencil className="h-4 w-4 mr-2" />
                          Tahrirlash
                        </DropdownMenuItem>
                        {u.id !== currentUser?.id && (
                          <DropdownMenuItem className="text-destructive" onClick={() => setDeleting(u)}>
                            <Trash2 className="h-4 w-4 mr-2" />
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
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Xodimni tahrirlash" : "Yangi xodim"}</DialogTitle>
            <DialogDescription>
              {editing
                ? "Parol maydonini bo'sh qoldirsangiz, eski parol saqlanadi."
                : "Xodim shu login va parol bilan tizimga kiradi."}
            </DialogDescription>
          </DialogHeader>

          <Form {...form}>
            <form id="user-form" onSubmit={form.handleSubmit((v) => saveMutation.mutate(v))} className="space-y-4">
              <FormField
                control={form.control}
                name="fullName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>F.I.Sh</FormLabel>
                    <FormControl>
                      <Input data-testid="input-user-fullname" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Login</FormLabel>
                      <FormControl>
                        <Input autoComplete="off" data-testid="input-user-username" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="password"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Parol</FormLabel>
                      <FormControl>
                        <Input
                          type="password"
                          autoComplete="new-password"
                          placeholder={editing ? "O'zgarishsiz" : ""}
                          data-testid="input-user-password"
                          {...field}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>

              <FormField
                control={form.control}
                name="role"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Rol</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl>
                        <SelectTrigger data-testid="select-user-role">
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {ROLES.map((r) => (
                          <SelectItem key={r} value={r}>
                            {ROLE_LABELS[r]}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="isActive"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between rounded-lg border p-3">
                    <div>
                      <Label>Faol hisob</Label>
                      <p className="text-xs text-muted-foreground mt-0.5">
                        O'chirilsa, xodim tizimga kira olmaydi
                      </p>
                    </div>
                    <FormControl>
                      <Switch checked={field.value} onCheckedChange={field.onChange} />
                    </FormControl>
                  </FormItem>
                )}
              />
            </form>
          </Form>

          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Bekor qilish
            </Button>
            <Button type="submit" form="user-form" disabled={saveMutation.isPending} data-testid="button-save-user">
              {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Saqlash
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="Xodimni o'chirish"
        description={
          <>
            <strong>{deleting?.fullName}</strong> tizimdan o'chiriladi va boshqa kira olmaydi.
          </>
        }
        onConfirm={() => deleting && deleteMutation.mutate(deleting.id)}
        isPending={deleteMutation.isPending}
      />
    </div>
  );
}
