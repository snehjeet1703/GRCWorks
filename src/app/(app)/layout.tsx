import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { Sidebar } from "@/components/sidebar";
import { Providers } from "@/components/providers";
import { prisma } from "@/lib/db";

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);

  if (!session) {
    redirect("/login");
  }

  const user = session.user as any;

  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { onboardingComplete: true },
  });
  if (org && !org.onboardingComplete) {
    redirect("/onboarding");
  }

  return (
    <Providers>
      <div className="min-h-screen">
        <Sidebar
          permissions={user.permissions ?? []}
          roleName={user.roleName ?? user.role}
          userName={user.name ?? user.email}
        />
        <main className="pl-64">
          <div className="mx-auto max-w-7xl px-6 py-8">{children}</div>
        </main>
      </div>
    </Providers>
  );
}
