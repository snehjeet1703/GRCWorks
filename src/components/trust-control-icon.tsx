import {
  AppWindow,
  Award,
  Boxes,
  Building2,
  Database,
  FileBarChart,
  KeyRound,
  Laptop,
  Network,
  Server,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";

const ICONS: [RegExp, LucideIcon][] = [
  [/access|identity|auth/i, KeyRound],
  [/data|privacy|encrypt/i, Database],
  [/network/i, Network],
  [/endpoint|device/i, Laptop],
  [/app|application|code/i, AppWindow],
  [/infra|cloud|availability|resilien/i, Server],
  [/corporate|people|hr|organi[sz]ation/i, Building2],
  [/product/i, Boxes],
  [/report|audit/i, FileBarChart],
  [/grade|rating|certif/i, Award],
];

export function TrustControlIcon({ category, className }: { category: string; className?: string }) {
  const Icon = ICONS.find(([re]) => re.test(category))?.[1] ?? ShieldCheck;
  return <Icon className={className} aria-hidden="true" />;
}
