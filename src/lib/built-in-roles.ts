import type { Prisma, PrismaClient } from "@prisma/client";
import { BUILT_IN_ROLES } from "./permissions";

type Db = PrismaClient | Prisma.TransactionClient;

// Creates missing built-in roles and refreshes built-in permissions; custom roles are untouched.
export async function ensureBuiltInRoles(db: Db, organizationId: string) {
  const roleIdByName = new Map<string, string>();
  for (const template of BUILT_IN_ROLES) {
    const existing = await db.role.findUnique({
      where: { organizationId_name: { organizationId, name: template.name } },
    });
    if (existing) {
      if (existing.isBuiltIn) {
        await db.role.update({
          where: { id: existing.id },
          data: { description: template.description, permissions: template.permissions },
        });
      }
      roleIdByName.set(template.name, existing.id);
    } else {
      const role = await db.role.create({
        data: {
          organizationId,
          name: template.name,
          description: template.description,
          isBuiltIn: true,
          permissions: template.permissions,
        },
      });
      roleIdByName.set(template.name, role.id);
    }
  }
  return roleIdByName;
}
