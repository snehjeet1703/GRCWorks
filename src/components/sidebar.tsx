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
    <aside className="fixed inset-y-0 left-0 z-10 flex w-64 flex-col bg-sidebar-bg">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600">
          <Shield className="h-[18px] w-[18px] text-white" />
        </div>
        <span className="text-[15px] font-semibold text-sidebar-text-active tracking-tight">
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
              <div className="section-label px-3 pb-1.5 pt-5 text-sidebar-text/50">
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
                      "flex items-center gap-2.5 rounded-lg px-3 py-[7px] text-[13.5px] font-medium transition-colors mb-px",
                      isActive
                        ? "bg-sidebar-active-bg text-sidebar-active-accent"
                        : "text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-text-active"
                    )}
                  >
                    <item.icon
                      className={cn(
                        "h-[18px] w-[18px] flex-shrink-0",
                        isActive ? "opacity-100" : "opacity-55"
                      )}
                    />
                    {item.name}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* User + sign out */}
      <div className="border-t border-sidebar-border p-3">
        <div className="flex items-center gap-2.5 rounded-lg px-2.5 py-2">
          <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-brand-600 to-purple-600 text-xs font-semibold text-white">
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[13px] font-medium text-sidebar-text-active">
              {userName ?? "User"}
            </div>
            {roleName && (
              <div className="text-[11px] text-sidebar-text/70">{roleName}</div>
            )}
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="mt-1 flex w-full items-center gap-2.5 rounded-lg px-3 py-[7px] text-[13.5px] font-medium text-sidebar-text hover:bg-sidebar-hover hover:text-sidebar-text-active transition-colors"
        >
          <LogOut className="h-[18px] w-[18px] opacity-55" />
          Sign out
        </button>
      </div>
    </aside>
  );
}
