import type { ReactNode } from "react";

export const metadata = { title: "Trust Vault" };

export default function TrustLayout({ children }: { children: ReactNode }) {
  return <div className="theme-light min-h-screen bg-gray-50 text-gray-900 antialiased">{children}</div>;
}
