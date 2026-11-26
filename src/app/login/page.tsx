import { redirect } from "next/navigation";
import { isInstalled } from "@/lib/install";
import { azureSsoEnabled } from "@/lib/sso-config";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  if (!(await isInstalled())) redirect("/setup");
  return (
    <LoginForm
      demoMode={process.env.DEMO_MODE === "true"}
      microsoftSso={azureSsoEnabled}
      labSignup={process.env.LAB_MODE === "true"}
      // Codes go by email, so only offer the reset where mail can be sent (or is logged, in development).
      passwordReset={!!process.env.SMTP_HOST || process.env.NODE_ENV !== "production"}
    />
  );
}
