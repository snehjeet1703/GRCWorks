import { prisma } from "./db";

export async function getTrustConfigId(organizationId: string) {
  const config =
    (await prisma.trustVaultConfig.findUnique({ where: { organizationId } })) ??
    (await prisma.trustVaultConfig.create({ data: { organizationId } }));
  return config.id;
}
