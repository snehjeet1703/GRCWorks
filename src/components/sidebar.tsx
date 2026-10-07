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

const sections: NavSection[] = [
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

export function Sidebar({
  permissions,
  roleName,
  userName,
}: {
  permissions?: string[];
  roleName?: string;
  userName?: string;
}) {
  const pathname = usePathname();
  const permSet = new Set(permissions ?? []);

  const initials = (userName ?? "U")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return (
    <aside className="fixed inset-y-0 left-0 z-10 flex w-64 flex-col border-r border-sidebar-border bg-sidebar-bg text-sidebar-foreground">
      <div className="flex items-center gap-2.5 px-4 py-4">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-sidebar-primary">
          <Shield className="h-4 w-4 text-sidebar-primary-foreground" />
        </div>
        <span className="text-sm font-semibold text-foreground tracking-tight">
          GRC Platform
        </span>
      </div>

      {/* Navigation sections */}
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {sections.map((section) => {
          const visible = section.items.filter(
            (item) => !item.requiredPermission || permSet.has(item.requiredPermission)
          );
          if (visible.length === 0) return null;

          return (
            <div key={section.label}>
              <div className="flex h-8 items-center px-2 pt-3 text-xs font-medium text-sidebar-foreground/70">
                {section.label}
              </div>
              {visible.map((item) => {
                const isActive =
                  pathname === item.href || pathname.startsWith(item.href + "/");
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    className={cn(
                      "mb-1 flex h-8 items-center gap-2 rounded-md px-2 text-sm transition-colors",
                      isActive
                        ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
                        : "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
                    )}
                  >
                    <item.icon className="h-4 w-4 flex-shrink-0" />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* User + sign out */}
      <div className="border-t border-sidebar-border p-2">
        <div className="flex items-center gap-2 rounded-md px-2 py-2">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-full bg-sidebar-accent text-xs font-semibold text-sidebar-accent-foreground">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-sm font-medium text-foreground">
              {userName ?? "User"}
            </div>
            {roleName && (
              <div className="text-xs text-muted-foreground">{roleName}</div>
            )}
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="flex h-8 w-full items-center gap-2 rounded-md px-2 text-sm transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
        >
          <LogOut className="h-4 w-4" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
