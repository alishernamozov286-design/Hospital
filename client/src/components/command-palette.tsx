import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useLocation } from "wouter";
import {
  ArrowRight,
  BarChart3,
  ClipboardCheck,
  CornerDownLeft,
  FlaskConical,
  Loader2,
  Receipt,
  Search,
  Settings,
  UserPlus,
  Users,
  Wallet,
} from "lucide-react";
import type { OrderListResponse, Patient } from "@shared/schema";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Avatar } from "@/components/ui-kit";
import { useAuth } from "@/hooks/use-auth";
import { useDebounced } from "@/hooks/use-debounced";
import { formatDate, formatPhone } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Ctrl+K: one field that finds a patient or an order from anywhere, plus the
 * handful of actions a registrator repeats fifty times a day.
 *
 * Built on the existing search endpoints rather than a new one — both already
 * search server-side across number, name, phone and address, which is exactly
 * what is wanted here.
 */

type Item =
  | { kind: "action"; id: string; label: string; hint: string; icon: IconType; run: () => void }
  | { kind: "patient"; id: string; patient: Patient }
  | { kind: "order"; id: string; order: OrderListResponse["items"][number] };

type IconType = React.ComponentType<{ className?: string }>;

export function CommandPalette({
  open,
  onOpenChange,
  onNewPatient,
  onNewOrder,
  onOpenPatient,
  onOpenOrder,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNewPatient: () => void;
  onNewOrder: () => void;
  onOpenPatient: (patient: Patient) => void;
  onOpenOrder: (order: OrderListResponse["items"][number]) => void;
}) {
  const [, setLocation] = useLocation();
  const { can } = useAuth();

  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  const search = useDebounced(query.trim(), 250);
  const searching = search.length >= 2;

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActive(0);
  }, [open]);

  const { data: patientData, isFetching: loadingPatients } = useQuery<{ items: Patient[] }>({
    queryKey: [`/api/patients?search=${encodeURIComponent(search)}&limit=5`],
    enabled: open && searching,
  });

  const { data: orderData, isFetching: loadingOrders } = useQuery<OrderListResponse>({
    queryKey: [`/api/orders?search=${encodeURIComponent(search)}&limit=5`],
    enabled: open && searching,
  });

  const close = () => onOpenChange(false);
  const go = (path: string) => {
    setLocation(path);
    close();
  };

  const items = useMemo<Item[]>(() => {
    if (searching) {
      return [
        ...(patientData?.items ?? []).map((p): Item => ({ kind: "patient", id: p.id, patient: p })),
        ...(orderData?.items ?? []).map((o): Item => ({ kind: "order", id: o.id, order: o })),
      ];
    }

    // Nothing typed yet: offer the destinations and the two things a
    // registrator starts most often.
    const actions: Item[] = [];
    if (can("registrator")) {
      actions.push(
        {
          kind: "action",
          id: "new-patient",
          label: "Yangi bemor",
          hint: "Ro'yxatga olish",
          icon: UserPlus,
          run: () => {
            close();
            onNewPatient();
          },
        },
        {
          kind: "action",
          id: "new-order",
          label: "Yangi buyurtma",
          hint: "Tahlil buyurtma qilish",
          icon: FlaskConical,
          run: () => {
            close();
            onNewOrder();
          },
        },
      );
    }
    actions.push(
      { kind: "action", id: "go-patients", label: "Bemorlar", hint: "Bo'limga o'tish", icon: Users, run: () => go("/patients") },
      { kind: "action", id: "go-orders", label: "Buyurtmalar", hint: "Bo'limga o'tish", icon: Receipt, run: () => go("/orders") },
      { kind: "action", id: "go-results", label: "Natijalar", hint: "Bo'limga o'tish", icon: ClipboardCheck, run: () => go("/results") },
    );
    if (can("admin")) {
      actions.push(
        { kind: "action", id: "go-reports", label: "Hisobotlar", hint: "Bo'limga o'tish", icon: BarChart3, run: () => go("/reports") },
        { kind: "action", id: "go-expenses", label: "Xarajatlar", hint: "Bo'limga o'tish", icon: Wallet, run: () => go("/expenses") },
        { kind: "action", id: "go-settings", label: "Sozlamalar", hint: "Bo'limga o'tish", icon: Settings, run: () => go("/settings") },
      );
    }
    return actions;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching, patientData, orderData, can]);

  // Keep the highlight inside the list as results arrive and shrink it.
  useEffect(() => {
    setActive((a) => (a >= items.length ? 0 : a));
  }, [items.length]);

  const choose = (item: Item) => {
    if (item.kind === "action") return item.run();
    close();
    if (item.kind === "patient") return onOpenPatient(item.patient);
    return onOpenOrder(item.order);
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((a) => (items.length ? (a + 1) % items.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((a) => (items.length ? (a - 1 + items.length) % items.length : 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const item = items[active];
      if (item) choose(item);
    }
  };

  // Scroll the highlighted row into view when the arrows walk past the edge.
  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const loading = searching && (loadingPatients || loadingOrders);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="top-[12%] max-w-xl translate-y-0 gap-0 overflow-hidden p-0"
        onKeyDown={onKeyDown}
      >
        {/* Radix needs both for accessibility; neither belongs on screen here. */}
        <DialogTitle className="sr-only">Qidiruv</DialogTitle>
        <DialogDescription className="sr-only">
          Bemor, buyurtma qidiring yoki bo'limga o'ting
        </DialogDescription>

        <div className="flex items-center gap-3 border-b px-4">
          {loading ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          )}
          <input
            autoFocus
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            placeholder="Bemor, telefon, buyurtma № yoki bo'lim..."
            data-testid="input-command-palette"
            className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted-foreground"
          />
          <kbd className="hidden shrink-0 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline">
            Esc
          </kbd>
        </div>

        <div ref={listRef} className="max-h-[52vh] overflow-y-auto p-2">
          {items.length === 0 ? (
            <p className="px-3 py-10 text-center text-sm text-muted-foreground">
              {searching ? "Hech narsa topilmadi" : "Qidirish uchun yozing"}
            </p>
          ) : (
            <div className="space-y-0.5">
              {items.map((item, i) => (
                <Row
                  key={`${item.kind}-${item.id}`}
                  index={i}
                  active={i === active}
                  onHover={() => setActive(i)}
                  onSelect={() => choose(item)}
                  item={item}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3 border-t bg-muted/30 px-4 py-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <kbd className="rounded border bg-background px-1 font-mono">↑</kbd>
            <kbd className="rounded border bg-background px-1 font-mono">↓</kbd>
            tanlash
          </span>
          <span className="flex items-center gap-1">
            <CornerDownLeft className="h-3 w-3" />
            ochish
          </span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Row({
  item,
  index,
  active,
  onHover,
  onSelect,
}: {
  item: Item;
  index: number;
  active: boolean;
  onHover: () => void;
  onSelect: () => void;
}) {
  const base = cn(
    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors",
    active ? "bg-primary/10" : "hover:bg-muted/60",
  );

  if (item.kind === "action") {
    const Icon = item.icon;
    return (
      <button type="button" data-index={index} className={base} onMouseMove={onHover} onClick={onSelect}>
        <div className="icon-tile h-8 w-8 bg-primary/10 text-primary">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{item.label}</p>
          <p className="truncate text-xs text-muted-foreground">{item.hint}</p>
        </div>
        <ArrowRight className={cn("h-4 w-4 shrink-0", active ? "text-primary" : "text-muted-foreground/50")} />
      </button>
    );
  }

  if (item.kind === "patient") {
    const p = item.patient;
    return (
      <button type="button" data-index={index} className={base} onMouseMove={onHover} onClick={onSelect}>
        <Avatar name={p.fullName} size="sm" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{p.fullName}</p>
          <p className="truncate text-xs text-muted-foreground">
            <span className="tabular">#{p.patientNumber}</span> · {formatPhone(p.phone, true)}
          </p>
        </div>
        <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">Bemor</span>
      </button>
    );
  }

  const o = item.order;
  return (
    <button type="button" data-index={index} className={base} onMouseMove={onHover} onClick={onSelect}>
      <div className="icon-tile h-8 w-8 bg-muted text-muted-foreground">
        <Receipt className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">
          <span className="tabular">#{o.orderNumber}</span> · {o.patient?.fullName ?? "—"}
        </p>
        <p className="truncate text-xs text-muted-foreground">
          {o.items.length} ta tahlil · <span className="tabular">{formatDate(o.createdAt)}</span>
        </p>
      </div>
      <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">Buyurtma</span>
    </button>
  );
}
