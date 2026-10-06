"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Shield, Smartphone, Mail, Key, ArrowLeft } from "lucide-react";
import { startAuthentication } from "@simplewebauthn/browser";

type MfaStatus = {
  mfaEnabled: boolean;
  mfaMethod: string | null;
  totpConfigured: boolean;
  webauthnCredentials: { id: string; deviceName: string }[];
  orgMfaRequired: boolean;
};

export default function MfaVerifyPage() {
  const { data: session, update: updateSession } = useSession();
  const router = useRouter();
  const [status, setStatus] = useState<MfaStatus | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<"verify" | "recovery" | "setup">("verify");
  const [emailSent, setEmailSent] = useState(false);

  useEffect(() => {
    fetch("/api/mfa/status")
      .then((r) => r.json())
      .then((data) => {
        setStatus(data);
        if (!data.mfaEnabled && data.orgMfaRequired) {
          setMode("setup");
        }
      });
  }, []);

  const verify = useCallback(
    async (method: string, payload: Record<string, unknown>) => {
      setLoading(true);
      setError("");
      const res = await fetch("/api/mfa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method, ...payload }),
      });
      const data = await res.json();
      if (data.verified) {
        await updateSession({ mfaPending: false });
        router.push("/dashboard");
      } else {
        setError(data.error || "Verification failed");
        setLoading(false);
      }
    },
    [updateSession, router]
  );

  async function handleTotpSubmit(e: React.FormEvent) {
    e.preventDefault();
    await verify("TOTP", { code });
  }

  async function handleEmailSubmit(e: React.FormEvent) {
    e.preventDefault();
    await verify("EMAIL_OTP", { code });
  }

  async function sendEmailOtp() {
    setLoading(true);
    const res = await fetch("/api/mfa/verify/email-send", { method: "POST" });
    if (res.ok) setEmailSent(true);
    else setError("Failed to send code");
    setLoading(false);
  }

  async function handleWebAuthn() {
    setLoading(true);
    setError("");
    try {
      const optRes = await fetch("/api/mfa/verify/webauthn-options", { method: "POST" });
      const options = await optRes.json();
      const credential = await startAuthentication({ optionsJSON: options });
      await verify("WEBAUTHN", { credential });
    } catch (err: any) {
      setError(err.message || "WebAuthn failed");
      setLoading(false);
    }
  }

  async function handleRecoverySubmit(e: React.FormEvent) {
    e.preventDefault();
    await verify("RECOVERY", { code });
  }

  if (!status) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <div className="text-gray-400">Loading...</div>
      </div>
    );
  }

  if (mode === "setup") {
    return <MfaSetupInline onComplete={() => router.push("/dashboard")} />;
  }

  const method = status.mfaMethod;

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 shadow-[0_2px_8px_rgba(79,70,229,0.3)]">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <h1 className="mt-5 text-xl font-semibold tracking-tight text-gray-900">
            Two-Factor Authentication
          </h1>
          <p className="mt-1.5 text-sm text-gray-500">
            {mode === "recovery"
              ? "Enter a recovery code"
              : method === "TOTP"
                ? "Enter the code from your authenticator app"
                : method === "EMAIL_OTP"
                  ? "Enter the code sent to your email"
                  : "Verify with your security key"}
          </p>
        </div>

        <div className="card">
          {mode === "recovery" ? (
            <form onSubmit={handleRecoverySubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Recovery Code
                </label>
                <input
                  type="text"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  className="input font-mono tracking-wider"
                  placeholder="ABCD1234"
                  required
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? "Verifying..." : "Verify Recovery Code"}
              </button>
              <button
                type="button"
                onClick={() => { setMode("verify"); setCode(""); setError(""); }}
                className="flex items-center gap-1.5 text-sm text-brand-600 hover:text-brand-700 mx-auto"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Back to verification
              </button>
            </form>
          ) : method === "TOTP" ? (
            <form onSubmit={handleTotpSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  Authentication Code
                </label>
                <input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                  className="input text-center text-2xl tracking-[0.5em] font-mono"
                  placeholder="000000"
                  autoFocus
                  required
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button type="submit" disabled={loading || code.length < 6} className="btn-primary w-full">
                {loading ? "Verifying..." : "Verify"}
              </button>
            </form>
          ) : method === "EMAIL_OTP" ? (
            <div className="space-y-4">
              {!emailSent ? (
                <button onClick={sendEmailOtp} disabled={loading} className="btn-primary w-full">
                  <Mail className="h-4 w-4 mr-2 inline" />
                  {loading ? "Sending..." : "Send Verification Code"}
                </button>
              ) : (
                <form onSubmit={handleEmailSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      Verification Code
                    </label>
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={code}
                      onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                      className="input text-center text-2xl tracking-[0.5em] font-mono"
                      placeholder="000000"
                      autoFocus
                      required
                    />
                  </div>
                  {error && <p className="text-sm text-red-600">{error}</p>}
                  <button type="submit" disabled={loading || code.length < 6} className="btn-primary w-full">
                    {loading ? "Verifying..." : "Verify"}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setEmailSent(false); setCode(""); }}
                    className="text-sm text-brand-600 hover:text-brand-700 mx-auto block"
                  >
                    Resend code
                  </button>
                </form>
              )}
            </div>
          ) : method === "WEBAUTHN" ? (
            <div className="space-y-4">
              <button onClick={handleWebAuthn} disabled={loading} className="btn-primary w-full">
                <Key className="h-4 w-4 mr-2 inline" />
                {loading ? "Waiting for key..." : "Use Security Key"}
              </button>
              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>
          ) : null}

          {mode !== "recovery" && (
            <div className="mt-5 pt-4 border-t border-gray-100">
              <button
                onClick={() => { setMode("recovery"); setCode(""); setError(""); }}
                className="text-sm text-gray-500 hover:text-gray-700 mx-auto block"
              >
                Use a recovery code instead
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function MfaSetupInline({ onComplete }: { onComplete: () => void }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500 shadow">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <h1 className="mt-5 text-xl font-semibold tracking-tight text-gray-900">
            MFA Setup Required
          </h1>
          <p className="mt-1.5 text-sm text-gray-500">
            Your organization requires multi-factor authentication. Set up MFA to continue.
          </p>
        </div>
        <div className="card space-y-3">
          <a
            href="/settings"
            className="flex items-center gap-3 rounded-lg border border-gray-200 p-4 hover:border-brand-300 hover:bg-brand-50/50 transition"
          >
            <Smartphone className="h-5 w-5 text-brand-600" />
            <div>
              <div className="font-medium text-gray-900 text-sm">Go to Settings</div>
              <div className="text-xs text-gray-500">Set up MFA in the Security tab</div>
            </div>
          </a>
        </div>
      </div>
    </div>
  );
}
