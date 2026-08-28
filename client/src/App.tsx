import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { Redirect, Route, Switch, useLocation } from "wouter";
import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { CalendarDays, ChevronRight, LogOut, Search } from "lucide-react";
import { queryClient } from "./lib/queryClient";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { AppSidebar } from "@/components/app-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Avatar, RoleBadge } from "@/components/ui-kit";
import { CommandPalette } from "@/components/command-palette";
import { OrderDialog } from "@/components/order-dialog";
import { PatientDialog } from "@/components/patient-dialog";
import { OrderDetailDialog } from "@/components/order-detail-dialog";
import { useHotkeys, type Hotkey } from "@/hooks/use-hotkeys";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { formatWeekdayDate } from "@/lib/format";
import type { OrderWithDetails, Patient, Role } from "@shared/schema";
import Login from "@/pages/login";
import Home from "@/pages/home";
import Patients from "@/pages/patients";
import Orders from "@/pages/orders";
import Results from "@/pages/results";
import NotFound from "@/pages/not-found";

/**
 * Split out of the first download. Everything above is on the path a
 * registrator walks every day and is worth having ready; these three are not.
 *
 * Reports is the expensive one — it pulls in the whole charting library, which
 * was roughly a third of the bundle, and every user was paying for it on every
 * refresh whether or not they ever opened a chart. Settings and Expenses are
 * admin-only, so most staff never load them at all.
 */
const Reports = lazy(() => import("@/pages/reports"));
const Expenses = lazy(() => import("@/pages/expenses"));
const SettingsPage = lazy(() => import("@/pages/settings"));

function Router() {
  return (
    <Suspense fallback={null}>
      <Switch>
        {/* The dashboard lives at /home; "/" is kept as an alias so old links
            and bookmarks keep working. */}
        <Route path="/">
          <Redirect to="/home" replace />
        </Route>
        <Route path="/home" component={Home} />
        <Route path="/patients" component={Patients} />
        <Route path="/orders" component={Orders} />
        <Route path="/results" component={Results} />
        <Route path="/reports" component={Reports} />
        <Route path="/expenses" component={Expenses} />
        <Route path="/settings" component={SettingsPage} />
        <Route component={NotFound} />
      </Switch>
    </Suspense>
  );
}

const PAGE_TITLES: Record<string, string> = {
  "/home": "Bosh sahifa",
  "/patients": "Bemorlar",
  "/orders": "Buyurtmalar",
  "/results": "Natijalar",
  "/reports": "Hisobotlar",
  "/expenses": "Xarajatlar",
  "/settings": "Sozlamalar",
};

function Shell() {
  const { user, isLoading, logout } = useAuth();
  const [location] = useLocation();

  // Real-time soat — har daqiqada yangilanadi
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  /**
   * Shortcut targets. These dialogs live at the shell level rather than on a
   * page, because Ctrl+N has to open a new order from wherever the user
   * happens to be — including the reports screen, which has nothing to do
   * with orders.
   */
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [quickPatient, setQuickPatient] = useState(false);
  const [quickOrder, setQuickOrder] = useState(false);
  const [presetPatient, setPresetPatient] = useState<Patient | null>(null);
  const [detailOrder, setDetailOrder] = useState<OrderWithDetails | null>(null);

  const canRegister = user?.role === "admin" || user?.role === "registrator";

  const hotkeys = useMemo<Hotkey[]>(
    () => [
      { key: "k", ctrl: true, handler: () => setPaletteOpen((o) => !o) },
      // The palette is also reachable with "/", the convention everywhere from
      // Gmail to GitHub, for people who never learn the Ctrl combination.
      { key: "/", handler: () => setPaletteOpen(true) },
      ...(canRegister
        ? [
            { key: "n", ctrl: true, shift: true, handler: () => setQuickPatient(true) },
            {
              key: "n",
              ctrl: true,
              handler: () => {
                setPresetPatient(null);
                setQuickOrder(true);
              },
            },
          ]
        : []),
    ],
    [canRegister],
  );

  useHotkeys(hotkeys, Boolean(user));

  // Show interface immediately with cached data - no blocking
  if (isLoading) {
    // First ever load - try to show UI optimistically
    const cachedUser = queryClient.getQueryData<PublicUser | null>(["/api/user"]);
    if (cachedUser) {
      // We have cached user, render immediately
      return null;
    }
    // True first load with no cache - show minimal loading
    return null;
  }

  // Everything except /login sits behind the session, so an anonymous visitor
  // is always bounced to the login screen — no protected route can render.
  if (!user) {
    return location === "/login" ? <Login /> : <Redirect to="/login" replace />;
  }

  // Already signed in: /login has nothing to offer.
  if (location === "/login") return <Redirect to="/home" replace />;

  const style = {
    "--sidebar-width": "16.5rem",
    "--sidebar-width-icon": "3.25rem",
  } as React.CSSProperties;

  return (
    <SidebarProvider style={style}>
      <div className="flex h-screen w-full">
        <AppSidebar />
        <div className="flex flex-1 flex-col overflow-hidden">
          <header className="glass-bar no-print z-20 flex h-16 shrink-0 items-center gap-3 px-4 sm:px-6">
            <SidebarTrigger data-testid="button-sidebar-toggle" />
            <Separator orientation="vertical" className="h-5" />

            {/* Breadcrumb: where you are, at a glance. */}
            <nav className="flex min-w-0 flex-1 items-center gap-1.5 text-sm">
              <span className="hidden text-muted-foreground sm:inline">MedLab</span>
              <ChevronRight className="hidden h-3.5 w-3.5 text-muted-foreground/60 sm:inline" />
              <span className="truncate font-semibold">{PAGE_TITLES[location] ?? "Sahifa"}</span>
            </nav>

            {/* The palette's own trigger — a shortcut nobody can see is a
                shortcut nobody uses. */}
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              data-testid="button-open-palette"
              className="flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary/30 hover:text-foreground"
            >
              <Search className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Qidiruv</span>
              <kbd className="hidden rounded border bg-muted px-1 py-0.5 font-mono text-[10px] lg:inline">
                Ctrl K
              </kbd>
            </button>

            <div className="hidden items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-xs text-muted-foreground md:flex">
              <CalendarDays className="h-3.5 w-3.5" />
              <span className="tabular">{formatWeekdayDate(now)}</span>
              <span className="mx-1 opacity-40">·</span>
              <span className="tabular font-medium text-foreground">
                {String(now.getHours()).padStart(2, "0")}:{String(now.getMinutes()).padStart(2, "0")}:{String(now.getSeconds()).padStart(2, "0")}
              </span>
            </div>

            <ThemeToggle />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  className="flex items-center gap-2 rounded-full p-0.5 pr-2 transition-colors hover:bg-muted"
                  data-testid="button-user-menu"
                >
                  <Avatar name={user.fullName} size="sm" />
                  <span className="hidden max-w-[10rem] truncate text-sm font-medium lg:inline">
                    {user.fullName}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuLabel className="flex items-center gap-3 py-3">
                  <Avatar name={user.fullName} size="md" />
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{user.fullName}</p>
                    <p className="truncate text-xs font-normal text-muted-foreground">@{user.username}</p>
                  </div>
                </DropdownMenuLabel>
                <div className="px-2 pb-2">
                  <RoleBadge role={user.role as Role} className="text-[11px]" />
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive focus:text-destructive"
                  onClick={() => logout()}
                  data-testid="button-logout"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Tizimdan chiqish
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </header>

          <main className="flex-1 overflow-auto">
            <div className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 sm:py-8 lg:px-8">
              <div className="animate-fade-rise" key={location}>
                <Router />
              </div>
            </div>
          </main>
        </div>
      </div>

      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        onNewPatient={() => setQuickPatient(true)}
        onNewOrder={() => {
          setPresetPatient(null);
          setQuickOrder(true);
        }}
        // Picking a patient from the palette goes straight to the thing the
        // registrator wanted them for: a new order, already filled in.
        onOpenPatient={(patient) => {
          setPresetPatient(patient);
          setQuickOrder(true);
        }}
        onOpenOrder={setDetailOrder}
      />

      <PatientDialog open={quickPatient} onOpenChange={setQuickPatient} patient={null} />
      <OrderDialog
        open={quickOrder}
        onOpenChange={(o) => {
          setQuickOrder(o);
          if (!o) setPresetPatient(null);
        }}
        presetPatient={presetPatient}
      />
      <OrderDetailDialog
        open={Boolean(detailOrder)}
        onOpenChange={(o) => !o && setDetailOrder(null)}
        order={detailOrder}
      />
    </SidebarProvider>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
        <TooltipProvider delayDuration={300}>
          <AuthProvider>
            <Shell />
          </AuthProvider>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
