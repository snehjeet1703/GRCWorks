"use client";

import { ReactNode, useCallback, useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { PanelLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { SIDEBAR_COOKIE } from "@/lib/sidebar-state";
import { Sidebar, activeItem, type Brand } from "./sidebar";
import { ThemeCustomizer } from "./theme-customizer";

export function AppShell({
  children,
  defaultOpen,
  permissions,
  roleName,
  userName,
  badges,
  brand,
}: {
  children: ReactNode;
  defaultOpen: boolean;
  permissions: string[];
  roleName?: string;
  userName?: string;
  badges?: Record<string, number>;
  brand?: Brand;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const [mobileOpen, setMobileOpen] = useState(false);
  const pathname = usePathname();
  const title = activeItem(pathname)?.name;

  const setSidebar = useCallback((next: boolean) => {
    setOpen(next);
    document.cookie = `${SIDEBAR_COOKIE}=${next}; path=/; max-age=${60 * 60 * 24 * 365}`;
  }, []);

  const toggle = useCallback(() => {
    if (window.matchMedia("(max-width: 767px)").matches) {
      setMobileOpen((o) => !o);
      return;
    }
    setSidebar(!open);
  }, [open, setSidebar]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "b" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        toggle();
      }
      if (e.key === "Escape") setMobileOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggle]);

  const sidebarProps = { permissions, roleName, userName, badges, brand };

  return (
    <div className="flex min-h-svh w-full">
      <aside
        data-collapsed={!open}
        className={cn(
          "group fixed inset-y-0 left-0 z-20 hidden border-r border-sidebar-border transition-[width] duration-200 ease-linear md:block",
          open ? "w-64" : "w-12"
        )}
      >
        <Sidebar {...sidebarProps} collapsed={!open} />
      </aside>

      {mobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden">
          <div className="anim-fade absolute inset-0 bg-black/20 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <aside className="anim-slide absolute inset-y-0 left-0 w-72 border-r border-sidebar-border shadow-lg">
            <Sidebar {...sidebarProps} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col transition-[padding] duration-200 ease-linear",
          open ? "md:pl-64" : "md:pl-12"
        )}
      >
        <header className="sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b border-border bg-background/40 px-4 backdrop-blur-md">
          <button
            type="button"
            onClick={toggle}
            aria-label="Toggle sidebar"
            title="Toggle sidebar (Ctrl+B)"
            className="-ml-1 inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground"
          >
            <PanelLeft className="h-4 w-4" />
          </button>
          <div className="mx-2 h-4 w-px bg-border" />
          <span className="text-sm font-medium text-muted-foreground">{title}</span>
          <div className="ml-auto">
            <ThemeCustomizer sidebarOpen={open} onSidebarChange={setSidebar} />
          </div>
        </header>
        <main className="flex-1">
          <div className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8">{children}</div>
        </main>
      </div>
    </div>
  );
}
