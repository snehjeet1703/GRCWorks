"use client";

import { History } from "lucide-react";
import type { LucideIcon } from "lucide-react";

export type TabDef = {
  key: string;
  label: string;
  icon: LucideIcon;
};

export function PageTabs({
  tabs,
  activeTab,
  onTabChange,
}: {
  tabs: TabDef[];
  activeTab: string;
  onTabChange: (key: string) => void;
}) {
  return (
    <div role="tablist" className="mb-6 inline-flex h-9 w-fit max-w-full items-center overflow-x-auto rounded-lg bg-muted p-[3px] text-muted-foreground">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          role="tab"
          aria-selected={activeTab === tab.key}
          onClick={() => onTabChange(tab.key)}
          className={`inline-flex h-full items-center justify-center gap-1.5 whitespace-nowrap rounded-md border border-transparent px-3 text-sm font-medium transition-all ${
            activeTab === tab.key
              ? "bg-background text-foreground shadow-sm"
              : "text-foreground/60 hover:text-foreground"
          }`}
        >
          <tab.icon className="h-4 w-4" />
          {tab.label}
        </button>
      ))}
    </div>
  );
}
