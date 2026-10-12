import { redirect } from "next/navigation";
import { isInstalled } from "@/lib/install";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!(await isInstalled())) redirect("/setup");
  return (
    <LoginForm
      demoMode={process.env.DEMO_MODE === "true"}
      microsoftSso={!!process.env.AZURE_AD_CLIENT_ID}
    />
  );
}
