import { useQuery } from "@tanstack/react-query";
// Wallet — Xarajatlar menyusi qaytarilganda kerak bo'ladi (pastdagi izohga qarang).
import { BarChart3, FileText, FlaskConical, Home, Settings, ShieldCheck, Users } from "lucide-react";
import { Link, useLocation } from "wouter";
import type { LabSettings, Role } from "@shared/schema";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { Avatar, RoleBadge } from "@/components/ui-kit";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";

/** `roles` lists who sees the link; admin sees everything (see useAuth().can). */
type NavItem = { title: string; url: string; icon: typeof Home; roles?: Role[] };

const NAV_SECTIONS: { label: string; items: NavItem[] }[] = [
  {
    label: "Ish maydoni",
    items: [
      { title: "Bosh sahifa", url: "/home", icon: Home },
      { title: "Bemorlar", url: "/patients", icon: Users },
      { title: "Buyurtmalar", url: "/orders", icon: FlaskConical },
      { title: "Natijalar", url: "/results", icon: FileText },
    ],
  },
  {
    label: "Boshqaruv",
    items: [
      { title: "Hisobotlar", url: "/reports", icon: BarChart3, roles: [] },
      // Xarajatlar sahifasi hozircha yashirilgan — /expenses yo'li va uning
      // API'si ishlaydi, faqat menyuga chiqarilmaydi. Tayyor bo'lganda shu
      // qatorni qayta ochish kifoya:
      // { title: "Xarajatlar", url: "/expenses", icon: Wallet, roles: [] },
      { title: "Sozlamalar", url: "/settings", icon: Settings, roles: [] },
    ],
  },
];

export function AppSidebar() {
  const [location] = useLocation();
  const { user, can } = useAuth();
  const { data: settings } = useQuery<LabSettings>({ queryKey: ["/api/settings"] });

  const sections = NAV_SECTIONS.map((section) => ({
    ...section,
    items: section.items.filter((item) => !item.roles || can(...item.roles)),
  })).filter((section) => section.items.length > 0);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border p-4 group-data-[collapsible=icon]:px-2">
        <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
          <div className="brand-gradient icon-tile h-10 w-10 text-white shadow-brand flex-shrink-0">
            <FlaskConical className="h-5 w-5" />
          </div>
          <div className="min-w-0 group-data-[collapsible=icon]:hidden">
            <h2 className="truncate text-[15px] font-semibold leading-tight">
              {settings?.labName ?? "MedLab"}
            </h2>
            <p className="truncate text-xs text-muted-foreground">
              {settings?.tagline ?? "Laboratoriya tizimi"}
            </p>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent className="px-2 py-2">
        {sections.map((section) => (
          <SidebarGroup key={section.label}>
            <SidebarGroupLabel className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground/80">
              {section.label}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu className="gap-1">
                {section.items.map((item) => {
                  const active = location === item.url;
                  return (
                    <SidebarMenuItem key={item.url}>
                      <SidebarMenuButton
                        asChild
                        isActive={active}
                        tooltip={item.title}
                        data-testid={`link-${item.url.slice(1) || "home"}`}
                        className={cn(
                          "h-10 rounded-xl px-3 font-medium transition-all",
                          active &&
                            "bg-primary/10 text-primary shadow-[inset_0_0_0_1px_hsl(var(--primary)/0.18)] hover:bg-primary/15 hover:text-primary",
                        )}
                      >
                        <Link href={item.url}>
                          {/* active marker rail */}
                          <span
                            className={cn(
                              "absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full transition-all",
                              active ? "brand-gradient opacity-100" : "opacity-0",
                            )}
                            aria-hidden
                          />
                          <item.icon className={cn("h-[18px] w-[18px]", active && "text-primary")} />
                          <span>{item.title}</span>
                        </Link>
                      </SidebarMenuButton>
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>

      {user && (
        <SidebarFooter className="border-t border-sidebar-border p-3">
          <div className="flex min-w-0 items-center gap-3 rounded-xl bg-sidebar-accent/60 p-2.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0">
            <Avatar name={user.fullName} size="sm" />
            <div className="min-w-0 flex-1 group-data-[collapsible=icon]:hidden">
              <p className="truncate text-sm font-medium leading-tight">{user.fullName}</p>
              <RoleBadge role={user.role as Role} className="mt-1 h-5 px-1.5 text-[10px]" />
            </div>
          </div>
          <p className="mt-2 flex items-center gap-1.5 px-1 text-[11px] text-muted-foreground group-data-[collapsible=icon]:hidden">
            <ShieldCheck className="h-3 w-3" />
            Sessiya himoyalangan
          </p>
        </SidebarFooter>
      )}
    </Sidebar>
  );
}
