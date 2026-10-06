import { requirePagePermission } from "@/lib/page-auth";
import { prisma } from "@/lib/db";
import { TrustVaultClient } from "./trust-vault-client";

export default async function TrustVaultPage() {
  const { user } = await requirePagePermission("trust_vault:read");
  const perms: string[] = user.permissions ?? [];

  const org = await prisma.organization.findUnique({
    where: { id: user.organizationId },
    select: { slug: true },
  });

  return (
    <TrustVaultClient
      canManage={perms.includes("trust_vault:manage")}
      orgSlug={org?.slug || ""}
    />
  );
}
