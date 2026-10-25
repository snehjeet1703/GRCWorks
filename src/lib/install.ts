import { prisma } from "./db";

// One organisation per deployment; an empty database means first-run setup hasn't happened.
export async function isInstalled() {
  // A lab install has no first-run admin: learners sign up and each gets a practice company.
  if (process.env.LAB_MODE === "true") return true;
  return (await prisma.organization.count()) > 0;
}
