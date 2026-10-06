import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { Providers } from "@/components/providers";

export default async function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const org = await prisma.organization.findUnique({
    where: { id: (session.user as any).organizationId },
    select: { onboardingComplete: true },
  });

  if (org?.onboardingComplete) redirect("/dashboard");

  return <Providers>{children}</Providers>;
}
