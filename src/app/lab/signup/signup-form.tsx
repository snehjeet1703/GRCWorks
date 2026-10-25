"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { GraduationCap } from "lucide-react";
import { PasswordInput } from "@/components/password-input";

async function post(url: string, body: unknown) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (res.ok) return null;
  const data = await res.json().catch(() => null);
  return (data?.error as string) ?? "Something went wrong. Try again.";
}

export function SignupForm({ course }: { course: { title: string; labs: string[] } | null }) {
  const [step, setStep] = useState<"details" | "code" | "building">("details");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function sendCode(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const err = await post("/api/lab/signup", { name, email, password });
    setLoading(false);
    if (err) return setError(err);
    setStep("code");
  }

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setStep("building");
    const err = await post("/api/lab/signup/verify", { email, code });
    if (err) {
      setLoading(false);
      setStep("code");
      return setError(err);
    }
    const result = await signIn("credentials", { email, password, redirect: false });
    window.location.href = result?.error ? "/login" : "/lab";
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 shadow-[0_2px_8px_rgba(79,70,229,0.3)]">
            <GraduationCap className="h-6 w-6 text-white" />
          </div>
          <h1 className="mt-5 text-xl font-semibold tracking-tight text-gray-900">GRCWorks Labs</h1>
          <p className="mt-1.5 text-sm text-gray-500">
            Free hands-on GRC practice. You get your own fictional company in a real GRC platform and work through it task by task.
          </p>
        </div>

        <div className="card">
          {step === "details" && (
            <form onSubmit={sendCode} className="space-y-4">
              <div>
                <label htmlFor="name" className="mb-1.5 block text-sm font-medium text-gray-700">Your name</label>
                <input id="name" className="input" value={name} onChange={(e) => setName(e.target.value)} required maxLength={120} />
              </div>
              <div>
                <label htmlFor="email" className="mb-1.5 block text-sm font-medium text-gray-700">Email</label>
                <input id="email" type="email" className="input" value={email} onChange={(e) => setEmail(e.target.value)} required placeholder="you@example.com" />
              </div>
              <div>
                <label htmlFor="password" className="mb-1.5 block text-sm font-medium text-gray-700">Password</label>
                <PasswordInput id="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={12} />
                <p className="mt-1 text-xs text-gray-500">At least 12 characters.</p>
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full">
                {loading ? "Sending code..." : "Email me a code"}
              </button>
            </form>
          )}

          {step === "code" && (
            <form onSubmit={verify} className="space-y-4">
              <p className="text-sm text-gray-600">We sent a 6-digit code to <strong>{email}</strong>. It expires in 15 minutes.</p>
              <div>
                <label htmlFor="code" className="mb-1.5 block text-sm font-medium text-gray-700">Code</label>
                <input
                  id="code" className="input tracking-[0.3em]" inputMode="numeric" autoComplete="one-time-code"
                  pattern="\d{6}" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} required
                />
              </div>
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button type="submit" disabled={loading} className="btn-primary w-full">Create my practice company</button>
              <button type="button" className="w-full text-sm text-gray-500 hover:underline" onClick={() => { setStep("details"); setError(""); setCode(""); }}>
                Use a different email
              </button>
            </form>
          )}

          {step === "building" && (
            <p className="py-6 text-center text-sm text-gray-600">Setting up your practice company. This takes a few seconds...</p>
          )}
        </div>

        {course && step === "details" && (
          <div className="mt-6 text-sm text-gray-600">
            <p className="font-medium text-gray-800">{course.title}: what you&apos;ll do</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              {course.labs.map((l) => <li key={l}>{l}</li>)}
            </ol>
          </div>
        )}

        <p className="mt-6 text-center text-sm text-gray-500">
          Already signed up? <a href="/login" className="font-medium text-brand-600 hover:underline">Sign in</a>
        </p>
      </div>
    </div>
  );
}
