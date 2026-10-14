import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cookies } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { SIDEBAR_COOKIE } from "@/lib/sidebar-state";
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

  // Badge on "My Tasks": open work assigned to the signed-in user.
  const openTasks = await prisma.task.count({
    where: { assigneeId: user.id, status: { not: "DONE" } },
  });

  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get(SIDEBAR_COOKIE)?.value !== "false";

  return (
    <Providers>
      <AppShell
        defaultOpen={defaultOpen}
        permissions={user.permissions ?? []}
        roleName={user.roleName ?? user.role}
        userName={user.name ?? user.email}
        badges={{ openTasks }}
      >
        {children}
      </AppShell>
    </Providers>
  );
}
