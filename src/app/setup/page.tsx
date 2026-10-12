import { redirect } from "next/navigation";
import { isInstalled } from "@/lib/install";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  if (await isInstalled()) redirect("/login");
  return <SetupForm />;
}
