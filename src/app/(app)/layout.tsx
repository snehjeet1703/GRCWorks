import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { cookies } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { SIDEBAR_COOKIE } from "@/lib/sidebar-state";
import { Providers } from "@/components/providers";
import { prisma } from "@/lib/db";
import { pendingAccessRequests } from "@/lib/tasks";
import { controlReviewQueue, pendingControlWork } from "@/lib/control-work";
import { OWNER_ACTION, slotReviewQueue, slotWorkForOwner } from "@/lib/audit-periods";

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
  // Blocked (e.g. a lab account an admin suspended): back to sign-in, where the account is refused.
  if (user.blocked) redirect("/login");

  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { onboardingComplete: true, name: true, logoStorageKey: true, logoUpdatedAt: true, practice: true },
  });
  if (org && !org.onboardingComplete) {
    redirect("/onboarding");
  }

  // Badge on "My Tasks": open tasks, controls they own that aren't closed, audit evidence they owe,
  // and anything waiting for their review.
  const canReview = (user.permissions ?? []).includes("evidence:review");
  const canApproveAccess = (user.permissions ?? []).includes("trust_vault:manage");
  const [taskCount, ownedControls, controlReviews, slotWork, slotReviews, accessRequests] = await Promise.all([
    prisma.task.count({ where: { assigneeId: user.id, status: { not: "DONE" } } }),
    pendingControlWork(user.organizationId, user.id),
    canReview ? controlReviewQueue(user.organizationId, user.id) : Promise.resolve([]),
    slotWorkForOwner(user.organizationId, user.id),
    canReview ? slotReviewQueue(user.organizationId, user.id) : Promise.resolve([]),
    canApproveAccess ? pendingAccessRequests(user.organizationId) : Promise.resolve([]),
  ]);
  // Controls in a running audit are counted by their audit slots, not again as a control.
  const inAudit = new Set(slotWork.map((s) => s.control.id));
  const controlCount = ownedControls.filter((c) => c.reason !== "IN_REVIEW" && !inAudit.has(c.id)).length + controlReviews.length;
  const openTasks = taskCount + controlCount + slotWork.filter((s) => OWNER_ACTION.includes(s.slot.status)).length
    + slotReviews.length + accessRequests.length;

  const cookieStore = await cookies();
  const defaultOpen = cookieStore.get(SIDEBAR_COOKIE)?.value !== "false";

  return (
    <Providers>
      <AppShell
        defaultOpen={defaultOpen}
        permissions={[...(user.permissions ?? []), ...(org?.practice ? ["lab:practice"] : [])]}
        roleName={user.roleName ?? user.role}
        userName={user.name ?? user.email}
        badges={{ openTasks }}
        brand={{
          name: org?.name ?? "",
          logoUrl: org?.logoStorageKey ? `/api/organization/logo?v=${org.logoUpdatedAt?.getTime() ?? 1}` : null,
        }}
      >
        {children}
      </AppShell>
    </Providers>
  );
}
