"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { Shield } from "lucide-react";
import { PasswordInput } from "@/components/password-input";
import { slugify } from "@/lib/install-slug";

export function SetupForm() {
  const [form, setForm] = useState({ organizationName: "", name: "", email: "", password: "", confirm: "" });
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm({ ...form, [key]: e.target.value });

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (form.password !== form.confirm) {
      setError("Passwords don't match.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch("/api/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          organizationName: form.organizationName,
          name: form.name,
          email: form.email,
          password: form.password,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Setup failed");

      const login = await signIn("credentials", { email: form.email, password: form.password, redirect: false });
      window.location.href = login?.error ? "/login" : "/onboarding";
    } catch (err: any) {
      setError(err.message);
      setSubmitting(false);
    }
  }

  const slug = form.organizationName.trim() ? slugify(form.organizationName) : "your-org";

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-primary">
            <Shield className="h-6 w-6 text-primary-foreground" />
          </div>
          <h1 className="mt-5 text-xl font-semibold tracking-tight">Set up GRCWorks</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Create your organisation and the first administrator account.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="card space-y-4">
          <div className="grid gap-2">
            <label htmlFor="organizationName" className="text-sm font-medium">Organisation name</label>
            <input id="organizationName" required value={form.organizationName} onChange={set("organizationName")} className="input" placeholder="Acme Corp" autoComplete="organization" />
            <p className="text-xs text-muted-foreground">
              Public trust page: <span className="font-mono">/trust/{slug}</span>
            </p>
          </div>
          <div className="grid gap-2">
            <label htmlFor="name" className="text-sm font-medium">Your name</label>
            <input id="name" required value={form.name} onChange={set("name")} className="input" placeholder="Priya Sharma" autoComplete="name" />
          </div>
          <div className="grid gap-2">
            <label htmlFor="email" className="text-sm font-medium">Work email</label>
            <input id="email" type="email" required value={form.email} onChange={set("email")} className="input" placeholder="you@company.com" autoComplete="email" />
          </div>
          <div className="grid gap-2">
            <label htmlFor="password" className="text-sm font-medium">Password</label>
            <PasswordInput id="password" required minLength={12} value={form.password} onChange={set("password")} autoComplete="new-password" />
            <p className="text-xs text-muted-foreground">At least 12 characters.</p>
          </div>
          <div className="grid gap-2">
            <label htmlFor="confirm" className="text-sm font-medium">Confirm password</label>
            <PasswordInput id="confirm" required value={form.confirm} onChange={set("confirm")} autoComplete="new-password" />
          </div>

          {error && (
            <p role="alert" className="rounded-md border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          <button type="submit" disabled={submitting} className="btn-primary w-full">
            {submitting ? "Setting up…" : "Create organisation"}
          </button>
          <p className="text-center text-xs text-muted-foreground">
            This page is only available once. Additional users are invited from Settings.
          </p>
        </form>
      </div>
    </div>
  );
}
