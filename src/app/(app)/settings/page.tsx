import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { SettingsClient } from "./settings-client";

export default async function SettingsPage() {
  const session = await getServerSession(authOptions);
  const user = session!.user as any;
  const orgId = user.organizationId;
  const permissions: string[] = user.permissions ?? [];

  const [org, users, roles] = await Promise.all([
    prisma.organization.findUnique({
      where: { id: orgId },
      select: { id: true, name: true, slug: true, logoStorageKey: true },
    }),
    prisma.user.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        roleId: true,
        customRole: { select: { id: true, name: true } },
        createdAt: true,
      },
      orderBy: { name: "asc" },
    }),
    prisma.role.findMany({
      where: { organizationId: orgId },
      select: {
        id: true,
        name: true,
        description: true,
        isBuiltIn: true,
        permissions: true,
        _count: { select: { users: true } },
      },
      orderBy: [{ isBuiltIn: "desc" }, { name: "asc" }],
    }),
  ]);

  return (
    <SettingsClient
      organization={{ id: org!.id, name: org!.name, slug: org!.slug, hasLogo: !!org!.logoStorageKey }}
      users={users.map((u) => ({
        id: u.id,
        email: u.email,
        name: u.name,
        role: u.role,
        roleId: u.roleId,
        roleName: u.customRole?.name ?? u.role,
        createdAt: u.createdAt.toISOString(),
      }))}
      roles={roles.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        isBuiltIn: r.isBuiltIn,
        permissions: r.permissions as string[],
        userCount: r._count.users,
      }))}
      currentUserId={user.id}
      permissions={permissions}
    />
  );
}
