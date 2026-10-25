import Link from "next/link";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { ArrowLeft } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { labMode } from "@/lib/lab/content";
import { levelLabel } from "@/lib/lab/levels";

export const dynamic = "force-dynamic";

// Progress report for the manager named on a team code: who joined, their level, practice company and progress.
export default async function TeamProgressPage() {
  if (!labMode) notFound();
  const session = await getServerSession(authOptions);
  const me = await prisma.user.findUnique({ where: { id: (session!.user as any).id }, select: { email: true } });
  const codes = await prisma.labAccessCode.findMany({
    where: { plan: "team", managerEmail: { equals: me?.email ?? "", mode: "insensitive" } },
    orderBy: { createdAt: "desc" },
    include: {
      redemptions: {
        include: {
          user: {
            select: {
              name: true, email: true, labAccess: { select: { expiresAt: true } },
              labCertificates: { select: { id: true, level: true } },
              organization: { select: { name: true, labLevel: true, _count: { select: { labTaskCompletions: true } } } },
            },
          },
        },
      },
    },
  });
  if (!codes.length) notFound();

  return (
    <div className="max-w-5xl">
      <Link href="/lab" className="mb-4 inline-flex items-center gap-1 text-sm text-gray-500 hover:underline"><ArrowLeft className="h-4 w-4" /> Back to labs</Link>
      <h1 className="text-2xl font-bold tracking-tight">Team progress</h1>
      <p className="mt-1 text-sm text-gray-500">Learners who joined with your team codes.</p>
      {codes.map((c) => (
        <section key={c.id} className="mt-6">
          <h2 className="font-semibold">
            <span className="font-mono">{c.code}</span>
            <span className="ml-2 text-sm font-normal text-gray-500">{c.used} of {c.seats} seats used{c.buyer ? ` · ${c.buyer}` : ""}</span>
          </h2>
          <div className="mt-2 overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-800">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-50 text-left text-xs text-gray-600 dark:bg-gray-900 dark:text-gray-300">
                <tr>{["Name", "Email", "Level", "Practice company", "Tasks done", "Certificate", "Access until"].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {c.redemptions.map(({ user: u }) => (
                  <tr key={u.email}>
                    <td className="px-3 py-2">{u.name}</td>
                    <td className="px-3 py-2">{u.email}</td>
                    <td className="px-3 py-2">{levelLabel(u.organization.labLevel)}</td>
                    <td className="px-3 py-2">{u.organization.name}</td>
                    <td className="px-3 py-2">{u.organization._count.labTaskCompletions}</td>
                    <td className="px-3 py-2">
                      {u.labCertificates.length
                        ? u.labCertificates.map((cert) => <Link key={cert.id} href={`/certificate/${cert.id}`} target="_blank" className="mr-2 text-brand-600 hover:underline">{cert.level}</Link>)
                        : "—"}
                    </td>
                    <td className="px-3 py-2">{u.labAccess?.expiresAt.toISOString().slice(0, 10) ?? "—"}</td>
                  </tr>
                ))}
                {c.redemptions.length === 0 && <tr><td colSpan={7} className="px-3 py-4 text-center text-gray-500">Nobody has used this code yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}
