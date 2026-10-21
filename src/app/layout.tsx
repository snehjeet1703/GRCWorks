import type { Metadata } from "next";
import { cookies } from "next/headers";
import { THEME_COOKIE, parseThemeCookie, themeHtmlAttributes } from "@/lib/theme-config";
import "./globals.css";
import "./theme-presets.css";
import "./dark-tints.css";

export const metadata: Metadata = {
  title: "GRCWorks",
  description: "Manage your governance, risk, and compliance.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const theme = parseThemeCookie((await cookies()).get(THEME_COOKIE)?.value);

  return (
    <html lang="en" {...themeHtmlAttributes(theme)}>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400..700&family=Overpass+Mono:wght@400;500;700&family=Kumbh+Sans:wght@400..700&family=Poppins:wght@400;500;600&family=PT+Sans:wght@400;700&family=Plus+Jakarta+Sans:wght@400;500;600;800&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>{children}</body>
    </html>
  );
}
