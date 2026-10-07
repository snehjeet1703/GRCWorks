"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  Shield,
  SlidersHorizontal,
  AlertTriangle,
  FileCheck,
  ScrollText,
  Settings,
  LogOut,
  Bug,
  ShieldOff,
  Building2,
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut } from "next-auth/react";

type NavItem = {
  name: string;
  href: string;
  icon: typeof LayoutDashboard;
  requiredPermission?: string;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

export const sections: NavSection[] = [
  {
    label: "Overview",
    items: [
      { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard, requiredPermission: "dashboard:view" },
      { name: "Compliance", href: "/compliance", icon: Shield, requiredPermission: "controls:read" },
      { name: "Controls", href: "/controls", icon: SlidersHorizontal, requiredPermission: "controls:read" },
      { name: "Risks", href: "/risks", icon: AlertTriangle, requiredPermission: "risks:read" },
    ],
  },
  {
    label: "Manage",
    items: [
      { name: "Policies", href: "/governance", icon: ScrollText, requiredPermission: "policies:read" },
      { name: "Evidence", href: "/compliance/evidence", icon: FileCheck, requiredPermission: "evidence:read" },
      { name: "Findings", href: "/findings", icon: Bug, requiredPermission: "findings:read" },
      { name: "Exceptions", href: "/exceptions", icon: ShieldOff, requiredPermission: "exceptions:read" },
      { name: "Vendors", href: "/vendors", icon: Building2, requiredPermission: "vendors:read" },
      { name: "Trust Vault", href: "/trust-vault", icon: Globe, requiredPermission: "trust_vault:read" },
    ],
  },
  {
    label: "System",
    items: [
      { name: "Settings", href: "/settings", icon: Settings, requiredPermission: "users:read" },
    ],
  },
];

const allItems = sections.flatMap((s) => s.items);

// Longest matching href wins, so /compliance/evidence beats /compliance.
export function activeItem(pathname: string) {
  return allItems
    .filter((i) => pathname === i.href || pathname.startsWith(i.href + "/"))
    .sort((a, b) => b.href.length - a.href.length)[0];
}

export function Sidebar({
  permissions,
  roleName,
  userName,
  collapsed = false,
  onNavigate,
}: {
  permissions?: string[];
  roleName?: string;
  userName?: string;
  collapsed?: boolean;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const permSet = new Set(permissions ?? []);
  const current = activeItem(pathname);

  const initials = (userName ?? "U")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex h-full w-full flex-col bg-sidebar-bg text-sidebar-foreground">
      <div className="flex items-center gap-2 p-2">
        <div className="flex h-12 w-full items-center gap-2 overflow-hidden rounded-md px-2 group-data-[collapsed=true]:px-0">
          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sidebar-primary">
            <Shield className="h-4 w-4 text-sidebar-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="grid flex-1 text-left leading-tight">
              <span className="truncate text-sm font-semibold text-foreground">GRC Platform</span>
              <span className="truncate text-xs text-muted-foreground">Governance & compliance</span>
            </div>
          )}
        </div>
      </div>

      <nav className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-4">
        {sections.map((section) => {
          const visible = section.items.filter(
            (item) => !item.requiredPermission || permSet.has(item.requiredPermission)
          );
          if (visible.length === 0) return null;

          return (
            <div key={section.label} className="pt-2">
              <div
                className={cn(
                  "flex h-8 items-center px-2 text-xs font-medium text-sidebar-foreground/70 transition-opacity",
                  collapsed && "h-2 opacity-0"
                )}
              >
                {!collapsed && section.label}
              </div>
              <ul className="flex flex-col gap-1">
                {visible.map((item) => {
                  const isActive = current?.href === item.href;
                  return (
                    <li key={item.name}>
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        title={collapsed ? item.name : undefined}
                        aria-current={isActive ? "page" : undefined}
                        className={cn(
                          "flex h-8 items-center gap-2 overflow-hidden rounded-md text-sm transition-colors",
                          collapsed ? "w-8 justify-center" : "px-2",
                          isActive
                            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                            : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                        )}
                      >
                        <item.icon className="h-4 w-4 shrink-0" />
                        {!collapsed && <span className="truncate">{item.name}</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-2">
        <div className={cn("flex items-center gap-2 rounded-md py-2", collapsed ? "justify-center" : "px-2")}>
          <div
            title={collapsed ? `${userName ?? "User"}${roleName ? ` · ${roleName}` : ""}` : undefined}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground"
          >
            {initials}
          </div>
          {!collapsed && (
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-foreground">{userName ?? "User"}</div>
              {roleName && <div className="truncate text-xs text-muted-foreground">{roleName}</div>}
            </div>
          )}
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          title={collapsed ? "Sign out" : undefined}
          className={cn(
            "flex h-8 items-center gap-2 rounded-md text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
            collapsed ? "w-8 justify-center" : "w-full px-2"
          )}
        >
          <LogOut className="h-4 w-4 shrink-0" />
          {!collapsed && "Sign out"}
        </button>
      </div>
    </div>
  );
}
