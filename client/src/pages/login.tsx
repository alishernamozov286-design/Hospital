import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowRight,
  Eye,
  EyeOff,
  FileCheck2,
  FlaskConical,
  Loader2,
  Lock,
  ShieldAlert,
  ShieldCheck,
  Timer,
  TriangleAlert,
  User,
  Wallet,
} from "lucide-react";
import { loginSchema, type LoginInput } from "@shared/schema";
import { lockRemainingMs } from "@shared/lockout";
import { Button } from "@/components/ui/button";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/hooks/use-auth";
import { ThemeToggle } from "@/components/theme-toggle";

const FEATURES = [
  {
    icon: Activity,
    title: "Qabuldan blankagacha",
    text: "Bemor ro'yxati, buyurtma va natijalar bitta uzluksiz oqimda.",
  },
  {
    icon: Wallet,
    title: "To'lovlar nazorati",
    text: "Chegirma, qarzdorlik va kunlik tushum avtomatik hisoblanadi.",
  },
  {
    icon: FileCheck2,
    title: "Tayyor A4 blanka",
    text: "Me'yoriy oraliq, baho va imzo joyi bilan chop etishga tayyor.",
  },
];

const TRUST = ["3 xil rol", "Scrypt shifrlash", "A4 blanka", "CSV hisobot"];

/**
 * "01:59:03" while the wait is hours, "6 kun 4 soat" once it is days.
 *
 * A ticking clock is what makes a one-hour wait bearable; a week-long one
 * counted in seconds would just be absurd, so past a day it switches to words.
 */
function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const days = Math.floor(total / 86400);

  if (days >= 1) {
    const hours = Math.floor((total % 86400) / 3600);
    return hours > 0 ? `${days} kun ${hours} soat` : `${days} kun`;
  }

  const pad = (n: number) => String(n).padStart(2, "0");
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

/** Pulls the JSON body back out of apiRequest's "<status>: {json}" message. */
function parseErrorBody(raw: string): {
  message?: string;
  warning?: string | null;
  lockedUntil?: string | null;
} {
  const start = raw.indexOf("{");
  if (start !== -1) {
    try {
      return JSON.parse(raw.slice(start));
    } catch {
      // Fall through to the regex below — a truncated body is still worth
      // showing the human part of.
    }
  }
  const match = raw.match(/"message"\s*:\s*"([^"]+)"/);
  return { message: match?.[1] };
}

export default function Login() {
  const { login, isLoggingIn } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [capsLock, setCapsLock] = useState(false);

  // Ticks once a second while a lock is live, so the countdown on screen is
  // the real remaining time rather than whatever it was at the last attempt.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!lockedUntil) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [lockedUntil]);

  const remainingMs = lockRemainingMs(lockedUntil, now);
  const locked = remainingMs > 0;

  // The lock expiring is the one case where the form should clear itself: the
  // user is now allowed to try again and should not be staring at a red box.
  useEffect(() => {
    if (lockedUntil && remainingMs <= 0) {
      setLockedUntil(null);
      setError(null);
    }
  }, [lockedUntil, remainingMs]);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const onSubmit = async (values: LoginInput) => {
    setError(null);
    setWarning(null);
    try {
      await login(values);
      setLockedUntil(null);
    } catch (err) {
      const raw = err instanceof Error ? err.message : "Kirishda xatolik";
      // apiRequest throws "<status>: {json}" — pull the JSON back out so the
      // lock deadline and the "attempts left" hint survive the round trip.
      const body = parseErrorBody(raw);
      setError(body.message ?? "Login yoki parol noto'g'ri");
      setWarning(body.warning ?? null);
      setLockedUntil(body.lockedUntil ?? null);
    }
  };

  return (
    <div className="grid min-h-screen w-full lg:grid-cols-[1fr_1.05fr]">
      {/* ------------------------------------------------------ brand panel
          Full-bleed on large screens: the product sells itself while the form
          stays uncluttered on the right. */}
      <aside className="hero-band relative hidden flex-col justify-between p-12 text-white lg:flex xl:p-14">
        <div className="relative z-10 flex items-center gap-3.5">
          <div className="icon-tile h-12 w-12 rounded-2xl bg-white/15 text-white backdrop-blur">
            <FlaskConical className="h-6 w-6" />
          </div>
          <div>
            <p className="text-xl font-bold leading-none tracking-tight">MedLab</p>
            <p className="mt-1 text-[13px] text-white/70">Tibbiy laboratoriya tizimi</p>
          </div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="relative z-10 max-w-lg"
        >
          <h2 className="text-[40px] font-bold leading-[1.1] tracking-tight xl:text-[46px]">
            Laboratoriyangizning
            <br />
            butun kuni — bitta oynada.
          </h2>
          <p className="mt-5 text-[17px] leading-relaxed text-white/75">
            Bemorni ro'yxatga olishdan tortib bemor qo'liga beriladigan blankagacha bo'lgan
            har bir qadam shu tizimda.
          </p>

          <ul className="mt-10 space-y-5">
            {FEATURES.map((f, i) => (
              <motion.li
                key={f.title}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.45, delay: 0.2 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                className="flex gap-4"
              >
                <div className="icon-tile mt-0.5 h-10 w-10 shrink-0 bg-white/15 text-white backdrop-blur">
                  <f.icon className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold">{f.title}</p>
                  <p className="mt-0.5 text-sm leading-relaxed text-white/70">{f.text}</p>
                </div>
              </motion.li>
            ))}
          </ul>
        </motion.div>

        <div className="relative z-10 flex flex-wrap gap-2">
          {TRUST.map((t) => (
            <span
              key={t}
              className="rounded-full border border-white/20 bg-white/10 px-3 py-1 text-xs font-medium text-white/85 backdrop-blur"
            >
              {t}
            </span>
          ))}
        </div>
      </aside>

      {/* ------------------------------------------------------------- form */}
      <main className="aurora relative flex items-center justify-center p-5 sm:p-8">
        <div className="absolute right-4 top-4 z-10">
          <ThemeToggle />
        </div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-[27rem]"
        >
          {/* Compact brand lockup for screens without the side panel. */}
          <div className="mb-7 flex items-center gap-3 lg:hidden">
            <div className="brand-gradient icon-tile h-11 w-11 text-white shadow-brand">
              <FlaskConical className="h-6 w-6" />
            </div>
            <div>
              <p className="text-lg font-bold leading-none tracking-tight">MedLab</p>
              <p className="mt-1 text-xs text-muted-foreground">Tibbiy laboratoriya tizimi</p>
            </div>
          </div>

          <div className="card-premium p-7 shadow-xl sm:p-9">
            <div className="mb-7">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">
                Xush kelibsiz
              </p>
              <h1 className="mt-2 text-[26px] font-bold leading-tight tracking-tight">
                Tizimga kirish
              </h1>
              <p className="mt-1.5 text-[15px] text-muted-foreground">
                Xodim hisobingiz ma'lumotlarini kiriting
              </p>
            </div>

            {locked ? (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                transition={{ duration: 0.22 }}
                className="mb-5 overflow-hidden"
                data-testid="alert-login-locked"
              >
                <div className="rounded-xl border border-destructive/30 bg-destructive/[0.07] p-4">
                  <div className="flex items-start gap-2.5 text-sm text-destructive">
                    <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                    <div className="min-w-0">
                      <p className="font-semibold">Hisob vaqtincha qulflandi</p>
                      <p className="mt-1 text-destructive/85">{error}</p>
                    </div>
                  </div>

                  {/* The live countdown. Without it the only way to find out
                      whether the wait is over is to fail another attempt. */}
                  <div className="mt-3 flex items-center gap-2 rounded-lg border border-destructive/20 bg-destructive/[0.06] px-3 py-2">
                    <Timer className="h-4 w-4 shrink-0 text-destructive" />
                    <span className="text-xs text-destructive/80">Qolgan vaqt:</span>
                    <span
                      className="ml-auto font-mono text-sm font-bold tabular text-destructive"
                      data-testid="text-lock-countdown"
                    >
                      {formatCountdown(remainingMs)}
                    </span>
                  </div>
                </div>
              </motion.div>
            ) : (
              error && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  transition={{ duration: 0.22 }}
                  className="mb-5 overflow-hidden"
                  data-testid="alert-login-error"
                >
                  <div className="rounded-xl border border-destructive/25 bg-destructive/[0.07] p-3.5">
                    <div className="flex items-start gap-2.5 text-sm text-destructive">
                      <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
                      <p className="min-w-0">{error}</p>
                    </div>

                    {/* "One more and the account locks" is worth saying before
                        it happens, not after — and worth its own amber band,
                        because a warning styled like the error above it reads
                        as more of the same and gets skipped. */}
                    {warning && (
                      <div
                        className="mt-2.5 flex items-start gap-2.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2.5 text-[13px] font-medium text-amber-700 dark:text-amber-300"
                        data-testid="alert-login-warning"
                      >
                        <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                        <p className="min-w-0">{warning}</p>
                      </div>
                    )}
                  </div>
                </motion.div>
              )
            )}

            <Form {...form}>
              <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
                <FormField
                  control={form.control}
                  name="username"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Login</FormLabel>
                      <FormControl>
                        <div className="relative">
                          <User className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            placeholder="Loginingiz"
                            autoComplete="username"
                            autoFocus
                            className="h-12 pl-10"
                            data-testid="input-username"
                            {...field}
                          />
                        </div>
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
                        <div className="relative">
                          <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                          <Input
                            type={showPassword ? "text" : "password"}
                            placeholder="••••••••"
                            autoComplete="current-password"
                            className="h-12 pl-10 pr-11"
                            data-testid="input-password"
                            {...field}
                            // Caps Lock silently breaks logins more often than a
                            // wrong password does — say so before submitting.
                            onKeyUp={(e) => setCapsLock(e.getModifierState("CapsLock"))}
                            onKeyDown={(e) => setCapsLock(e.getModifierState("CapsLock"))}
                          />
                          <button
                            type="button"
                            onClick={() => setShowPassword((v) => !v)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                            aria-label={showPassword ? "Parolni yashirish" : "Parolni ko'rsatish"}
                            tabIndex={-1}
                          >
                            {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                          </button>
                        </div>
                      </FormControl>
                      {capsLock && (
                        <p className="flex items-center gap-1.5 text-xs text-amber-600 dark:text-amber-400">
                          <TriangleAlert className="h-3.5 w-3.5" />
                          Caps Lock yoqilgan
                        </p>
                      )}
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <Button
                  type="submit"
                  className="group h-12 w-full text-[15px] shadow-brand"
                  // Disabled while locked so the countdown cannot be reset by
                  // hammering the button; the server refuses regardless.
                  disabled={isLoggingIn || locked}
                  data-testid="button-login"
                >
                  {isLoggingIn ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Tekshirilmoqda...
                    </>
                  ) : locked ? (
                    <>
                      <Lock className="mr-2 h-4 w-4" />
                      Qulflangan
                    </>
                  ) : (
                    <>
                      Kirish
                      <ArrowRight className="ml-2 h-4 w-4 transition-transform group-hover:translate-x-0.5" />
                    </>
                  )}
                </Button>
              </form>
            </Form>

            <div className="mt-7 flex items-start gap-2.5 border-t pt-5 text-xs leading-relaxed text-muted-foreground">
              <ShieldCheck className="mt-px h-4 w-4 shrink-0 text-primary" />
              <p>
                Parollar scrypt bilan shifrlanadi. Tizimdan o'zingiz chiqmaguningizcha kirgan
                holatingiz saqlanib qoladi.
              </p>
            </div>
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            Login yoki parolni unutdingizmi? Administratorga murojaat qiling.
          </p>
        </motion.div>
      </main>
    </div>
  );
}
