import { redirect } from "next/navigation";
import { isInstalled } from "@/lib/install";
import { authOptions } from "@/lib/auth";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!(await isInstalled())) redirect("/setup");
  return (
    <LoginForm
      demoMode={process.env.DEMO_MODE === "true"}
      microsoftSso={authOptions.providers.some((p) => p.id === "azure-ad")}
    />
  );
}
