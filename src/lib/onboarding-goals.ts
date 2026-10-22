// Onboarding goal definitions.
// Each goal maps to one or more frameworks from the seed catalog plus any
// meta-controls for "soft" goals like questionnaire readiness.

export type GoalSlug =
  | "iso-27001"
  | "soc-2"
  | "iso-27701"
  | "nist-csf"
  | "dpdp"
  | "hipaa"
  | "pci-dss"
  | "gdpr"
  | "iso-42001"
  | "security-questionnaires"
  | "general-security";

export type OnboardingGoal = {
  slug: GoalSlug;
  label: string;
  description: string;
  icon: string; // emoji or lucide icon name
  frameworks: string[]; // framework names from the seed catalog
  popular?: boolean;
};

export const ONBOARDING_GOALS: OnboardingGoal[] = [
  {
    slug: "iso-27001",
    label: "ISO 27001",
    description: "International standard for information security management systems",
    icon: "shield",
    frameworks: ["ISO 27001:2022"],
    popular: true,
  },
  {
    slug: "soc-2",
    label: "SOC 2",
    description: "Trust Services Criteria for service organizations",
    icon: "check-circle",
    frameworks: ["SOC 2 Type II"],
    popular: true,
  },
  {
    slug: "iso-27701",
    label: "ISO 27701",
    description: "Privacy information management — extension to ISO 27001",
    icon: "eye-off",
    frameworks: ["ISO 27701:2019"],
  },
  {
    slug: "nist-csf",
    label: "NIST CSF",
    description: "Cybersecurity Framework 2.0 — Govern, Identify, Protect, Detect, Respond, Recover",
    icon: "layers",
    frameworks: ["NIST CSF 2.0"],
    popular: true,
  },
  {
    slug: "dpdp",
    label: "DPDP",
    description: "India's Digital Personal Data Protection Act 2023",
    icon: "flag",
    frameworks: ["DPDP Act 2023"],
  },
  {
    slug: "hipaa",
    label: "HIPAA",
    description: "US health-data security safeguards for covered entities",
    icon: "heart-pulse",
    frameworks: ["HIPAA Security Rule"],
  },
  {
    slug: "pci-dss",
    label: "PCI-DSS",
    description: "Payment Card Industry Data Security Standard v4.0",
    icon: "credit-card",
    frameworks: ["PCI-DSS v4.0.1"],
  },
  {
    slug: "gdpr",
    label: "GDPR",
    description: "EU General Data Protection Regulation",
    icon: "globe",
    frameworks: ["GDPR"],
  },
  {
    slug: "iso-42001",
    label: "ISO 42001",
    description: "AI management system: responsible development and use of AI",
    icon: "sparkles",
    frameworks: ["ISO/IEC 42001:2023"],
  },
  {
    slug: "security-questionnaires",
    label: "Customer security questionnaires",
    description: "Prepare for SIG, CAIQ, VSA, and customer due-diligence questionnaires",
    icon: "clipboard-list",
    frameworks: ["SOC 2 Type II", "ISO 27001:2022"], // questionnaire readiness overlaps with SOC2 + ISO
  },
  {
    slug: "general-security",
    label: "General security program",
    description: "Build a foundational security program with essential controls",
    icon: "lock",
    frameworks: ["NIST CSF 2.0"], // baseline framework
  },
];

export const INDUSTRY_OPTIONS = [
  "Technology / SaaS",
  "Financial Services",
  "Healthcare",
  "E-Commerce / Retail",
  "Education",
  "Government",
  "Manufacturing",
  "Professional Services",
  "Media / Entertainment",
  "Other",
];

export const CLOUD_OPTIONS = [
  "AWS",
  "Azure",
  "Google Cloud",
  "AWS + Azure",
  "Azure + Google Cloud",
  "AWS + Google Cloud",
  "Multi-cloud (all major)",
  "On-premises",
  "Hybrid",
  "Other",
];
