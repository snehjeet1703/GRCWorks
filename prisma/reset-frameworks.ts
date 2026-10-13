// Wipe all frameworks + controls (and their evidence/risk/policy links) for the demo org,
// so a subsequent `prisma db seed` can rebuild them with the shared, mapping-catalog layout.
// Refuses to run against a non-demo org so it can't nuke real data.

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.findUnique({ where: { slug: "demo" } });
  if (!org) {
    console.log("No 'demo' org — nothing to reset.");
    return;
  }

  console.log(`Resetting frameworks for org "${org.name}" (${org.slug})…`);

  const controls = await prisma.control.findMany({
    where: { organizationId: org.id },
    select: { id: true },
  });
  const controlIds = controls.map((c) => c.id);

  await prisma.$transaction(async (tx) => {
    // Join tables cascade from Control; evidence that only supported these controls goes too.
    await tx.controlMapping.deleteMany({ where: { controlId: { in: controlIds } } });
    await tx.evidence.deleteMany({
      where: { organizationId: org.id, controls: { every: { controlId: { in: controlIds } } } },
    });
    await tx.riskControl.deleteMany({ where: { controlId: { in: controlIds } } });
    await tx.policyControl.deleteMany({ where: { controlId: { in: controlIds } } });
    await tx.control.deleteMany({ where: { organizationId: org.id } });
    await tx.framework.deleteMany({ where: { organizationId: org.id } });
  });

  console.log(`  Deleted: ${controls.length} controls + all framework/link/evidence rows.`);
  console.log(`Now run:  npx prisma db seed`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
