import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "./auth";

export async function requirePagePermission(...permissions: string[]) {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const user = session.user as any;
  const userPerms: string[] = user.permissions ?? [];

  for (const perm of permissions) {
    if (!userPerms.includes(perm)) {
      redirect("/dashboard");
    }
  }

  return { session, user };
}
