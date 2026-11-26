"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { PasswordInput } from "@/components/password-input";

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (res.ok) return null;
  const data = await res.json().catch(() => null);
  return (data?.error as string) ?? "Something went wrong. Try again.";
}

export function ForgotForm() {
  const [step, setStep] = useState<"email" | "code" | "done">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const err = await post("/api/auth/password-reset", { email });
    setLoading(false);
    if (err) return setError(err);
    setStep("code");
  }

  async function reset(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) return setError("The two passwords don't match.");
    setLoading(true);
    setError("");
    const err = await post("/api/auth/password-reset/confirm", { email, code, password });
    setLoading(false);
    if (err) return setError(err);
    setStep("done");
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 shadow-[0_2px_8px_rgba(79,70,229,0.3)]">
            <KeyRound className="h-6 w-6 text-white" />
          </div>
          <h1 className="mt-5 text-xl font-semibold tracking-tight text-gray-900">Reset your password</h1>
          <p className="mt-1.5 text-sm text-gray-500">
            {step === "email" && "We'll email you a code to set a new password."}
            {step === "code" && `If ${email} has an account, a 6-digit code is on its way. It expires in 15 minutes.`}
            {step === "done" && "Your password has been changed."}
          </p>
        </div>

        <div className="card">
          {step === "email" && (
            <form onSubmit={sendCode} className="space-y-4">
              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700">Email</label>
                <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" required autoFocus />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? "Sending..." : "Email me a code"}</button>
            </form>
          )}

          {step === "code" && (
            <form onSubmit={reset} className="space-y-4">
              <div>
                <label htmlFor="code" className="mb-1.5 block text-sm font-medium text-gray-700">Code from the email</label>
                <input id="code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} className="input font-mono tracking-widest" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required autoFocus />
              </div>
              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-700">New password</label>
                <PasswordInput id="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={12} autoComplete="new-password" required />
                <p className="mt-1 text-xs text-gray-500">At least 12 characters.</p>
              </div>
              <div>
                <label htmlFor="confirm" className="mb-1.5 block text-sm font-medium text-gray-700">New password again</label>
                <PasswordInput id="confirm" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={12} autoComplete="new-password" required />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full">{loading ? "Saving..." : "Set new password"}</button>
              <button type="button" className="w-full text-center text-xs text-gray-500 hover:underline" onClick={() => { setStep("email"); setCode(""); setError(""); }}>
                Didn&apos;t get it? Send a new code
              </button>
            </form>
          )}

          {step === "done" && (
            <a href="/login" className="btn-primary block w-full text-center">Sign in</a>
          )}

          {step !== "done" && (
            <p className="mt-5 text-center text-sm text-gray-500">
              <a href="/login" className="font-medium text-brand-600 hover:underline">Back to sign in</a>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
