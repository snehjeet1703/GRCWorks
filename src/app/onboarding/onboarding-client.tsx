"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Shield,
  CheckCircle,
  EyeOff,
  Layers,
  Flag,
  HeartPulse,
  CreditCard,
  Globe,
  ClipboardList,
  Lock,
  ChevronRight,
  ChevronLeft,
  Building2,
  Users,
  Cloud,
  Monitor,
  ShieldCheck,
  Sparkles,
  ArrowRight,
  Check,
  BarChart3,
  FileText,
  AlertTriangle,
  FolderOpen,
  Target,
  Loader2,
} from "lucide-react";
import {
  ONBOARDING_GOALS,
  INDUSTRY_OPTIONS,
  CLOUD_OPTIONS,
  type GoalSlug,
} from "@/lib/onboarding-goals";

const GOAL_ICONS: Record<string, React.ReactNode> = {
  shield: <Shield className="h-5 w-5" />,
  "check-circle": <CheckCircle className="h-5 w-5" />,
  "eye-off": <EyeOff className="h-5 w-5" />,
  layers: <Layers className="h-5 w-5" />,
  flag: <Flag className="h-5 w-5" />,
  "heart-pulse": <HeartPulse className="h-5 w-5" />,
  "credit-card": <CreditCard className="h-5 w-5" />,
  globe: <Globe className="h-5 w-5" />,
  "clipboard-list": <ClipboardList className="h-5 w-5" />,
  lock: <Lock className="h-5 w-5" />,
};

type ProgramSummary = {
  controls: number;
  policies: number;
  evidenceRequirements: number;
  risks: number;
  gaps: number;
  highPriorityGaps: number;
  frameworks: { name: string; citations: number; readiness: number }[];
  overallReadiness: number;
};

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [selectedGoals, setSelectedGoals] = useState<GoalSlug[]>([]);
  const [company, setCompany] = useState({
    industry: "",
    employeeCount: "",
    cloudProvider: "",
    criticalApps: "",
    securityTeamSize: "",
  });
  const [generating, setGenerating] = useState(false);
  const [summary, setSummary] = useState<ProgramSummary | null>(null);
  const [error, setError] = useState("");

  function toggleGoal(slug: GoalSlug) {
    setSelectedGoals((prev) =>
      prev.includes(slug) ? prev.filter((g) => g !== slug) : [...prev, slug]
    );
  }

  async function handleGenerate() {
    setGenerating(true);
    setError("");
    try {
      const res = await fetch("/api/onboarding", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          goals: selectedGoals,
          company: {
            industry: company.industry,
            employeeCount: parseInt(company.employeeCount) || 1,
            cloudProvider: company.cloudProvider,
            criticalApps: parseInt(company.criticalApps) || 0,
            securityTeamSize: parseInt(company.securityTeamSize) || 0,
          },
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || "Failed to generate program");
      }
      const data = await res.json();
      setSummary(data.summary);
      setStep(3);
    } catch (err: any) {
      setError(err.message || "Something went wrong");
    } finally {
      setGenerating(false);
    }
  }

  const canProceedStep1 = selectedGoals.length > 0;
  const canProceedStep2 =
    company.industry !== "" &&
    company.employeeCount !== "" &&
    company.cloudProvider !== "";

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-3xl px-6 py-4 flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600">
            <Shield className="h-5 w-5 text-white" />
          </div>
          <span className="font-semibold text-gray-900">GRC Platform</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="mx-auto max-w-3xl px-6 pt-8">
        <div className="flex items-center gap-2 mb-2">
          {[1, 2, 3].map((s) => (
            <div key={s} className="flex items-center gap-2 flex-1">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-medium transition-colors ${
                  s < step
                    ? "bg-brand-600 text-white"
                    : s === step
                    ? "bg-brand-600 text-white"
                    : "bg-gray-200 text-gray-500"
                }`}
              >
                {s < step ? <Check className="h-4 w-4" /> : s}
              </div>
              {s < 3 && (
                <div
                  className={`h-0.5 flex-1 rounded ${
                    s < step ? "bg-brand-600" : "bg-gray-200"
                  }`}
                />
              )}
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-gray-500 mb-8">
          <span>Compliance goals</span>
          <span>Company profile</span>
          <span>Your program</span>
        </div>
      </div>

      {/* Step content */}
      <div className="mx-auto max-w-3xl px-6 pb-16">
        {step === 1 && (
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">
              What are you trying to achieve?
            </h1>
            <p className="text-gray-500 mb-8">
              Select the compliance frameworks and goals that matter to your
              organization. We&apos;ll build a tailored program for you.
            </p>

            <div className="grid grid-cols-2 gap-3">
              {ONBOARDING_GOALS.map((goal) => {
                const selected = selectedGoals.includes(goal.slug);
                return (
                  <button
                    key={goal.slug}
                    onClick={() => toggleGoal(goal.slug)}
                    className={`relative flex items-start gap-3 rounded-xl border-2 p-4 text-left transition-all ${
                      selected
                        ? "border-brand-600 bg-brand-50 ring-1 ring-brand-600"
                        : "border-gray-200 bg-white hover:border-gray-300 hover:shadow-sm"
                    }`}
                  >
                    <div
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                        selected
                          ? "bg-brand-600 text-white"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {GOAL_ICONS[goal.icon]}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-gray-900">
                          {goal.label}
                        </span>
                        {goal.popular && (
                          <span className="badge bg-amber-50 text-amber-700 border-amber-200 text-[10px]">
                            Popular
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 text-xs text-gray-500 line-clamp-2">
                        {goal.description}
                      </p>
                    </div>
                    {selected && (
                      <div className="absolute top-3 right-3">
                        <Check className="h-5 w-5 text-brand-600" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="mt-8 flex justify-end">
              <button
                onClick={() => setStep(2)}
                disabled={!canProceedStep1}
                className="btn-primary gap-2"
              >
                Continue
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 mb-2">
              Tell us about your company
            </h1>
            <p className="text-gray-500 mb-8">
              This helps us estimate your current readiness and generate
              relevant controls, policies, and risk assessments.
            </p>

            <div className="space-y-6">
              <div className="card">
                <div className="grid grid-cols-2 gap-6">
                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                      <Building2 className="h-4 w-4 text-gray-400" />
                      Industry
                    </label>
                    <select
                      value={company.industry}
                      onChange={(e) =>
                        setCompany({ ...company, industry: e.target.value })
                      }
                      className="input"
                    >
                      <option value="">Select industry...</option>
                      {INDUSTRY_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                      <Users className="h-4 w-4 text-gray-400" />
                      Number of employees
                    </label>
                    <input
                      type="number"
                      value={company.employeeCount}
                      onChange={(e) =>
                        setCompany({ ...company, employeeCount: e.target.value })
                      }
                      className="input"
                      placeholder="e.g. 120"
                      min={1}
                    />
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                      <Cloud className="h-4 w-4 text-gray-400" />
                      Cloud infrastructure
                    </label>
                    <select
                      value={company.cloudProvider}
                      onChange={(e) =>
                        setCompany({ ...company, cloudProvider: e.target.value })
                      }
                      className="input"
                    >
                      <option value="">Select cloud...</option>
                      {CLOUD_OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                      <Monitor className="h-4 w-4 text-gray-400" />
                      Critical applications
                    </label>
                    <input
                      type="number"
                      value={company.criticalApps}
                      onChange={(e) =>
                        setCompany({ ...company, criticalApps: e.target.value })
                      }
                      className="input"
                      placeholder="e.g. 15"
                      min={0}
                    />
                  </div>

                  <div className="col-span-2">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-700 mb-2">
                      <ShieldCheck className="h-4 w-4 text-gray-400" />
                      Security team size
                    </label>
                    <input
                      type="number"
                      value={company.securityTeamSize}
                      onChange={(e) =>
                        setCompany({
                          ...company,
                          securityTeamSize: e.target.value,
                        })
                      }
                      className="input max-w-xs"
                      placeholder="e.g. 2"
                      min={0}
                    />
                    <p className="mt-1 text-xs text-gray-400">
                      Include dedicated security, compliance, and IT risk
                      staff
                    </p>
                  </div>
                </div>
              </div>

              {error && (
                <p className="text-sm text-red-600">{error}</p>
              )}

              <div className="flex justify-between">
                <button
                  onClick={() => setStep(1)}
                  className="btn-secondary gap-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Back
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={!canProceedStep2 || generating}
                  className="btn-primary gap-2"
                >
                  {generating ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Generating your program...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-4 w-4" />
                      Generate my GRC program
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        )}

        {step === 3 && summary && (
          <div>
            <div className="text-center mb-8">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl bg-green-100 mb-4">
                <Sparkles className="h-8 w-8 text-green-600" />
              </div>
              <h1 className="text-2xl font-semibold text-gray-900 mb-2">
                Your GRC Program
              </h1>
              <p className="text-gray-500">
                Here&apos;s what we&apos;ve built based on your goals and
                company profile.
              </p>
            </div>

            {/* Stats grid */}
            <div className="grid grid-cols-3 gap-4 mb-8">
              <StatCard
                icon={<Target className="h-5 w-5 text-brand-600" />}
                value={summary.controls}
                label="Applicable controls"
              />
              <StatCard
                icon={<FileText className="h-5 w-5 text-blue-600" />}
                value={summary.policies}
                label="Policies"
              />
              <StatCard
                icon={<FolderOpen className="h-5 w-5 text-violet-600" />}
                value={summary.evidenceRequirements}
                label="Evidence requirements"
              />
              <StatCard
                icon={<AlertTriangle className="h-5 w-5 text-amber-600" />}
                value={summary.risks}
                label="Identified risks"
              />
              <StatCard
                icon={<BarChart3 className="h-5 w-5 text-red-500" />}
                value={summary.gaps}
                label="Controls to implement"
              />
              <StatCard
                icon={<ShieldCheck className="h-5 w-5 text-red-600" />}
                value={summary.highPriorityGaps}
                label="High-priority gaps"
              />
            </div>

            {/* Framework readiness */}
            <div className="card mb-8">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">
                Framework Readiness
              </h2>
              <div className="space-y-4">
                {summary.frameworks.map((fw) => (
                  <div key={fw.name}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-900">
                          {fw.name}
                        </span>
                        <span className="text-xs text-gray-400">
                          {fw.citations} controls
                        </span>
                      </div>
                      <span
                        className={`text-sm font-semibold ${
                          fw.readiness >= 60
                            ? "text-green-600"
                            : fw.readiness >= 30
                            ? "text-amber-600"
                            : "text-red-600"
                        }`}
                      >
                        {fw.readiness}% ready
                      </span>
                    </div>
                    <div className="h-2.5 rounded-full bg-gray-100 overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-1000 ${
                          fw.readiness >= 60
                            ? "bg-green-500"
                            : fw.readiness >= 30
                            ? "bg-amber-500"
                            : "bg-red-500"
                        }`}
                        style={{ width: `${fw.readiness}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* CTA */}
            <div className="flex justify-center">
              <button
                onClick={() => router.push("/dashboard")}
                className="btn-primary gap-2 px-8 py-3 text-base"
              >
                Go to Dashboard
                <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatCard({
  icon,
  value,
  label,
}: {
  icon: React.ReactNode;
  value: number;
  label: string;
}) {
  return (
    <div className="card flex items-center gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-gray-50">
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-gray-900">{value}</p>
        <p className="text-xs text-gray-500">{label}</p>
      </div>
    </div>
  );
}
