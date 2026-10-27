import type { ReactNode } from "react";

const labMode = process.env.LAB_MODE === "true";

// On a lab server every Trust Center belongs to a learner's fictional practice company: keep them out of search
// engines and say so on the page, so nobody mistakes one for a real company's security page.
export const metadata = { title: "Trust Vault", ...(labMode ? { robots: { index: false, follow: false } } : {}) };

export default function TrustLayout({ children }: { children: ReactNode }) {
  return (
    <div className="theme-light min-h-screen bg-gray-50 text-gray-900 antialiased">
      {labMode && (
        <div className="bg-amber-100 px-4 py-2 text-center text-sm font-medium text-amber-900">
          Practice company for GRCWorks Labs training. This company and its documents are fictional.
        </div>
      )}
      {children}
    </div>
  );
}
