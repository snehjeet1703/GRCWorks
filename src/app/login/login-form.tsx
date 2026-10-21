"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Shield } from "lucide-react";
import { PasswordInput } from "@/components/password-input";

export function LoginForm({ demoMode, microsoftSso }: { demoMode: boolean; microsoftSso: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setError("Invalid email or password.");
      setLoading(false);
      return;
    }

    window.location.href = "/dashboard";
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 shadow-[0_2px_8px_rgba(79,70,229,0.3)]">
            <Shield className="h-6 w-6 text-white" />
          </div>
          <h1 className="mt-5 text-xl font-semibold tracking-tight text-gray-900">
            Sign in to GRCWorks
          </h1>
          <p className="mt-1.5 text-sm text-gray-500">
            Manage your governance, risk, and compliance.
          </p>
        </div>

        {/* Form */}
        <div className="card">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="block text-sm font-medium text-gray-700 mb-1.5"
              >
                Email
              </label>
              <input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                placeholder="you@company.com"
                required
              />
            </div>

            <div>
              <label
                htmlFor="password"
                className="block text-sm font-medium text-gray-700 mb-1.5"
              >
                Password
              </label>
              <PasswordInput
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required
              />
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          {microsoftSso && (
            <>
              <div className="relative my-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-gray-200" />
                </div>
                <div className="relative flex justify-center text-xs">
                  <span className="bg-white px-2 text-gray-400">or</span>
                </div>
              </div>

              <button
                type="button"
                onClick={() => signIn("azure-ad", { callbackUrl: "/dashboard" })}
                className="flex w-full items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2.5 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 transition-colors"
              >
                <svg className="h-4 w-4" viewBox="0 0 21 21">
                  <path fill="#f25022" d="M0 0h10v10H0z" />
                  <path fill="#7fba00" d="M11 0h10v10H11z" />
                  <path fill="#00a4ef" d="M0 11h10v10H0z" />
                  <path fill="#ffb900" d="M11 11h10v10H11z" />
                </svg>
                Sign in with Microsoft
              </button>
            </>
          )}

          {demoMode && (
            <div className="mt-5 rounded-lg border border-gray-100 bg-gray-50/80 p-3 text-xs text-gray-500">
              <p className="font-medium text-gray-600 mb-1">Demo credentials</p>
              <p className="font-mono text-[11px]">admin@demo.com / admin123</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
