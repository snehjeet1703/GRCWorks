import type { ReactNode } from "react";

export const metadata = { title: "Vendor questionnaire", robots: { index: false, follow: false } };

export default function VendorPortalLayout({ children }: { children: ReactNode }) {
  return <div className="theme-light min-h-screen bg-gray-50 text-gray-900 antialiased">{children}</div>;
}
