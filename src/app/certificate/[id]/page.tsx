import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { prisma } from "@/lib/db";
import { labMode } from "@/lib/lab/content";
import { PrintButton } from "./print-button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "GRCWorks Labs certificate", robots: { index: false } };

// Public, so employers can check a certificate by its link. Shows only what's printed on the certificate.
export default async function CertificatePage({ params }: { params: Promise<{ id: string }> }) {
  if (!labMode) notFound();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const cert = await prisma.labCertificate.findUnique({ where: { id } });
  if (!cert) notFound();
  const issued = cert.issuedAt.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-100 p-6 print:bg-white print:p-0">
      <div className="w-full max-w-3xl">
        <div className="rounded-xl border-4 border-double border-gray-800 bg-white p-10 text-center text-gray-900 shadow-sm print:shadow-none">
          <p className="text-sm font-semibold uppercase tracking-[0.3em] text-gray-500">GRCWorks Labs</p>
          <h1 className="mt-6 text-3xl font-bold">Certificate of completion</h1>
          <p className="mt-8 text-gray-600">This certifies that</p>
          <p className="mt-2 text-3xl font-semibold">{cert.name}</p>
          <p className="mt-6 text-gray-600">completed every hands-on lab in</p>
          <p className="mt-2 text-xl font-semibold">{cert.course}</p>
          <p className="mt-2 text-gray-600">Industry: {cert.industry} · Level: {cert.level}</p>
          <p className="mt-8 text-sm text-gray-500">Issued {issued}</p>
          <p className="mt-6 text-xs text-gray-400">Certificate ID {cert.id} · verify at this page&apos;s address</p>
        </div>
        <div className="mt-4 text-center print:hidden"><PrintButton /></div>
      </div>
    </div>
  );
}
