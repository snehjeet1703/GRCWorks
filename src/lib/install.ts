import { prisma } from "./db";

// One organisation per deployment; an empty database means first-run setup hasn't happened.
export async function isInstalled() {
  return (await prisma.organization.count()) > 0;
}
