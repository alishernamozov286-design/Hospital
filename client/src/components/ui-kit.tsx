import type { ComponentType, ReactNode } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Loader2, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ORDER_STATUS_LABELS,
  ROLE_LABELS,
  SAMPLE_STATUS_LABELS,
  type OrderStatus,
  type ResultFlag,
  type Role,
  type SampleStatus,
} from "@shared/schema";
import {
  FLAG_LABELS,
  FLAG_STYLES,
  ROLE_STYLES,
  SAMPLE_STATUS_DOTS,
  SAMPLE_STATUS_STYLES,
  STATUS_DOTS,
  STATUS_STYLES,
  avatarGradient,
  formatPhone,
  initials,
  money,
  paymentState,
  phoneE164,
} from "@/lib/format";

// ------------------------------------------------------------------ layout

/** Consistent title block for every page: eyebrow, heading, sub-line, actions. */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-primary">
            {eyebrow}
          </p>
        )}
        <h1 className="text-[26px] font-bold leading-tight tracking-tight sm:text-[32px]">{title}</h1>
        {description && <p className="mt-2 text-[15px] text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * A titled card. `flush` drops the body padding for tables and divided lists,
 * which supply their own.
 */
export function SectionCard({
  icon: Icon,
  title,
  description,
  action,
  children,
  className,
  bodyClassName,
  flush,
}: {
  icon?: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
  flush?: boolean;
}) {
  return (
    <section className={cn("card-premium overflow-hidden", className)}>
      <header className="flex items-center gap-3 border-b px-5 py-4">
        {Icon && (
          <div className="icon-tile h-9 w-9 bg-primary/10 text-primary">
            <Icon className="h-[18px] w-[18px]" />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-[15px] font-semibold">{title}</h2>
          {description && <p className="truncate text-xs text-muted-foreground">{description}</p>}
        </div>
        {action}
      </header>
      <div className={cn(flush ? "" : "p-5", bodyClassName)}>{children}</div>
    </section>
  );
}

// ------------------------------------------------------------------- stats

const TONES = {
  primary: { tile: "bg-primary/10 text-primary", wash: "from-primary/[0.07]" },
  amber: { tile: "bg-amber-500/10 text-amber-600 dark:text-amber-400", wash: "from-amber-500/[0.07]" },
  emerald: { tile: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400", wash: "from-emerald-500/[0.07]" },
  violet: { tile: "bg-violet-500/10 text-violet-600 dark:text-violet-400", wash: "from-violet-500/[0.07]" },
  rose: { tile: "bg-rose-500/10 text-rose-600 dark:text-rose-400", wash: "from-rose-500/[0.07]" },
} as const;

export function StatCard({
  label,
  value,
  suffix,
  hint,
  icon: Icon,
  tone = "primary",
  index = 0,
  isLoading,
  onClick,
}: {
  label: string;
  value: string | number;
  /** Unit rendered smaller next to the number, e.g. "so'm". */
  suffix?: string;
  hint?: ReactNode;
  icon: ComponentType<{ className?: string }>;
  tone?: keyof typeof TONES;
  index?: number;
  isLoading?: boolean;
  onClick?: () => void;
}) {
  const t = TONES[tone];
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      onClick={onClick}
      className={cn(
        "card-premium overflow-hidden p-5",
        onClick && "card-interactive",
      )}
    >
      {/* corner wash — gives the tile depth without another border */}
      <div
        className={cn("pointer-events-none absolute inset-0 bg-gradient-to-br to-transparent", t.wash)}
        aria-hidden
      />
      <div className="relative">
        <div className="flex items-start justify-between gap-3">
          <p className="text-[13px] font-medium text-muted-foreground">{label}</p>
          <div className={cn("icon-tile h-9 w-9", t.tile)}>
            <Icon className="h-[18px] w-[18px]" />
          </div>
        </div>

        {isLoading ? (
          <Skeleton className="mt-3.5 h-9 w-28 skeleton-shimmer" />
        ) : (
          <p className="mt-3.5 flex items-baseline gap-1.5 text-[30px] font-bold leading-none tracking-tight tabular">
            {value}
            {suffix && <span className="text-sm font-semibold text-muted-foreground">{suffix}</span>}
          </p>
        )}

        {hint && <div className="mt-2 text-xs text-muted-foreground">{hint}</div>}
      </div>
    </motion.div>
  );
}

// ------------------------------------------------------------------ badges

export function StatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-medium", STATUS_STYLES[status], className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", STATUS_DOTS[status])} />
      {ORDER_STATUS_LABELS[status]}
    </Badge>
  );
}

export function PaymentBadge({ total, paid }: { total: number; paid: number }) {
  const state = paymentState(total, paid);
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-medium", state.className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", state.dot)} />
      {state.label}
    </Badge>
  );
}

export function SampleBadge({ status, className }: { status: SampleStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn("gap-1.5 font-medium", SAMPLE_STATUS_STYLES[status], className)}>
      <span className={cn("h-1.5 w-1.5 rounded-full", SAMPLE_STATUS_DOTS[status])} />
      {SAMPLE_STATUS_LABELS[status]}
    </Badge>
  );
}

export function FlagBadge({ flag, className }: { flag: ResultFlag; className?: string }) {
  return (
    <Badge variant="outline" className={cn("font-medium", FLAG_STYLES[flag], className)}>
      {FLAG_LABELS[flag]}
      {flag === "high" ? " ↑" : flag === "low" ? " ↓" : ""}
    </Badge>
  );
}

export function RoleBadge({ role, className }: { role: Role; className?: string }) {
  return (
    <Badge variant="outline" className={cn("font-medium", ROLE_STYLES[role], className)}>
      {ROLE_LABELS[role]}
    </Badge>
  );
}

/**
 * Whether the patient's results can reach them on Telegram. "Ulanmagan" is not
 * an error — it only means the patient has not opened the bot yet — so it stays
 * muted rather than red.
 */
export function TelegramBadge({
  chatId,
  className,
}: {
  chatId: string | null | undefined;
  className?: string;
}) {
  const linked = Boolean(chatId);
  return (
    <Badge
      variant="outline"
      className={cn(
        "gap-1.5 font-medium",
        linked
          ? "bg-sky-500/10 text-sky-700 border-sky-500/25 dark:text-sky-300 dark:border-sky-400/25"
          : "text-muted-foreground",
        className,
      )}
    >
      <Send className="h-3 w-3" />
      {linked ? "Telegram" : "Ulanmagan"}
    </Badge>
  );
}

// ----------------------------------------------------------------- identity

/**
 * The patient's queue number — the one the registrator calls out and the
 * patient repeats back. Rendered as a ticket rather than plain text because it
 * is read aloud across a counter, so it has to survive a glance.
 *
 * Tolerates a missing number: a patient row cached by an older client build
 * shows "—" instead of "#undefined".
 */
export function PatientNumber({
  value,
  size = "md",
  className,
}: {
  value: number | null | undefined;
  size?: "sm" | "md";
  className?: string;
}) {
  if (typeof value !== "number") {
    return <span className={cn("text-muted-foreground", className)}>—</span>;
  }
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-lg border border-primary/20 bg-primary/10 font-bold tabular text-primary",
        size === "sm" ? "px-1.5 py-0.5 text-[11px]" : "px-2 py-0.5 text-sm",
        className,
      )}
      title={`Bemor raqami: ${value}`}
    >
      #{value}
    </span>
  );
}

const AVATAR_SIZES = {
  sm: "h-8 w-8 text-[11px]",
  md: "h-10 w-10 text-[13px]",
  lg: "h-12 w-12 text-[15px]",
} as const;

/** Initials on a gradient that is stable per person, so faces stay recognisable. */
export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: keyof typeof AVATAR_SIZES;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full bg-gradient-to-br font-semibold text-white shadow-sm ring-1 ring-black/5",
        avatarGradient(name),
        AVATAR_SIZES[size],
        className,
      )}
      aria-hidden
    >
      {initials(name) || "?"}
    </div>
  );
}

// ------------------------------------------------------------------ values

/** So'm amount with tabular figures — used in every table and summary. */
export function Money({
  value,
  withSuffix = true,
  className,
}: {
  value: number;
  withSuffix?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("tabular whitespace-nowrap", className)}>{money(value, withSuffix)}</span>
  );
}

/** "+998 90 123 45 67", click-to-call on touch devices. */
export function PhoneText({
  value,
  className,
  asLink = true,
}: {
  value: string | null | undefined;
  className?: string;
  asLink?: boolean;
}) {
  const label = formatPhone(value);
  if (!asLink || !value) {
    return <span className={cn("tabular whitespace-nowrap", className)}>{label}</span>;
  }
  return (
    <a
      href={`tel:${phoneE164(value)}`}
      onClick={(e) => e.stopPropagation()}
      className={cn(
        "tabular whitespace-nowrap transition-colors hover:text-primary hover:underline underline-offset-2",
        className,
      )}
    >
      {label}
    </a>
  );
}

// ------------------------------------------------------------------- states

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: ComponentType<{ className?: string }>;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      <div className="surface-tint icon-tile mb-4 h-16 w-16 rounded-2xl">
        <Icon className="h-7 w-7 text-primary" />
      </div>
      <p className="text-lg font-semibold">{title}</p>
      {description && <p className="mt-1.5 max-w-sm text-sm text-muted-foreground">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <Skeleton key={i} className="h-14 w-full skeleton-shimmer" />
      ))}
    </div>
  );
}

// -------------------------------------------------------------- pagination

/**
 * Footer for a server-paged table. Renders nothing when everything already
 * fits on one page, so short lists stay uncluttered.
 */
export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  isFetching,
  className,
}: {
  /** Zero-based. */
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  isFetching?: boolean;
  className?: string;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;

  const first = page * pageSize + 1;
  const last = Math.min(total, (page + 1) * pageSize);

  return (
    <div
      className={cn(
        "flex flex-wrap items-center justify-between gap-3 border-t px-4 py-3",
        className,
      )}
    >
      <p className="text-sm text-muted-foreground">
        <span className="tabular font-medium text-foreground">
          {first}–{last}
        </span>{" "}
        / <span className="tabular">{total}</span> ta
        {isFetching && <Loader2 className="ml-2 inline h-3.5 w-3.5 animate-spin" />}
      </p>
      <div className="flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          disabled={page === 0}
          onClick={() => onPageChange(page - 1)}
          data-testid="button-prev-page"
        >
          <ChevronLeft className="mr-1 h-4 w-4" />
          Oldingi
        </Button>
        <span className="px-1 text-sm tabular text-muted-foreground">
          {page + 1} / {pageCount}
        </span>
        <Button
          variant="outline"
          size="sm"
          disabled={page + 1 >= pageCount}
          onClick={() => onPageChange(page + 1)}
          data-testid="button-next-page"
        >
          Keyingi
          <ChevronRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ meters

/** Labelled progress bar used for "3/5 tayyor" style counters. */
export function MeterBar({
  value,
  max,
  label,
  className,
  barClassName,
}: {
  value: number;
  max: number;
  label?: ReactNode;
  className?: string;
  barClassName?: string;
}) {
  const percent = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div className={cn("space-y-1.5", className)}>
      {label && <div className="flex justify-between text-xs text-muted-foreground">{label}</div>}
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
        <div
          className={cn("h-full rounded-full brand-gradient transition-[width] duration-500", barClassName)}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/** Compact circular progress for the results workbench cards. */
export function ProgressRing({
  value,
  max,
  size = 44,
}: {
  value: number;
  max: number;
  size?: number;
}) {
  const percent = max > 0 ? Math.min(1, value / max) : 0;
  const stroke = 4;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const complete = percent === 1;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          className="stroke-muted"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - percent)}
          className={cn(
            "transition-[stroke-dashoffset] duration-500",
            complete ? "stroke-emerald-500" : "stroke-primary",
          )}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-[11px] font-semibold tabular">
        {value}/{max}
      </span>
    </div>
  );
}
