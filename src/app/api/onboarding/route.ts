import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, handleError, parseBody, requireSession } from "@/lib/api";
import { CONTROL_MAPPINGS, type FrameworkName } from "../../../../prisma/control-mappings";
import { ONBOARDING_GOALS } from "@/lib/onboarding-goals";

// ── Policy → Control mappings ────────────────────────────────
// Each policy maps to canonical control codes it governs.

const POLICY_CONTROL_MAP: Record<string, string[]> = {
  "Information Security Policy": ["INFOSEC-POLICY", "RISK-ASSESSMENT"],
  "Access Control Policy": ["MFA-ADMIN", "LEAST-PRIVILEGE", "ACCESS-REVIEW", "OFFBOARDING"],
  "Incident Response Plan": ["INCIDENT-RESPONSE", "DATA-BREACH-NOTIFICATION"],
  "Change Management Policy": ["CHANGE-MGMT"],
  "Risk Assessment Policy": ["RISK-ASSESSMENT"],
  "Risk Management Policy": ["RISK-ASSESSMENT"],
  "Vendor Management Policy": ["VENDOR-RISK"],
  "Supplier Relationships Policy": ["VENDOR-RISK"],
  "Supply Chain Risk Management Policy": ["VENDOR-RISK"],
  "Business Continuity Plan": ["BACKUP", "INCIDENT-RESPONSE"],
  "Contingency Plan": ["BACKUP", "INCIDENT-RESPONSE"],
  "Acceptable Use Policy": ["LEAST-PRIVILEGE", "SECURITY-TRAINING"],
  "Cryptography Policy": ["ENCRYPTION-AT-REST", "ENCRYPTION-IN-TRANSIT"],
  "Encryption Policy": ["ENCRYPTION-AT-REST", "ENCRYPTION-IN-TRANSIT"],
  "Physical Security Policy": [], // no canonical control for physical security yet
  "Asset Management Policy": ["ASSET-INVENTORY"],
  "HR Security Policy": ["OFFBOARDING", "SECURITY-TRAINING"],
  "Workforce Security Policy": ["OFFBOARDING", "SECURITY-TRAINING"],
  "Secure Development Policy": ["SECURE-DEV", "CHANGE-MGMT"],
  "Anti-Malware Policy": ["MALWARE-PROTECTION"],
  "Vulnerability Management Policy": ["VULNERABILITY-MGMT"],
  "Network Security Policy": ["MONITORING", "LOGGING"],
  "Audit Controls Policy": ["LOGGING", "MONITORING"],
  "Device and Media Controls Policy": ["ENCRYPTION-AT-REST"],
  "Business Associate Agreement Template": ["VENDOR-RISK"],
  "Privacy Policy": ["PRIVACY-NOTICE", "CONSENT-MGMT", "DATA-MINIMIZATION"],
  "Privacy Policy (India)": ["PRIVACY-NOTICE", "CONSENT-MGMT", "DATA-MINIMIZATION"],
  "Data Protection Policy": ["ENCRYPTION-AT-REST", "ENCRYPTION-IN-TRANSIT", "DATA-MINIMIZATION"],
  "Data Subject Rights Procedure": ["DATA-SUBJECT-RIGHTS"],
  "Data Principal Rights Procedure": ["DATA-SUBJECT-RIGHTS"],
  "Data Breach Response Plan": ["DATA-BREACH-NOTIFICATION", "INCIDENT-RESPONSE"],
  "Data Breach Notification Procedure": ["DATA-BREACH-NOTIFICATION", "INCIDENT-RESPONSE"],
  "Data Processing Agreement Template": ["VENDOR-RISK", "PROCESSING-RECORDS"],
  "Data Retention Policy": ["DATA-MINIMIZATION"],
  "Data Retention and Deletion Policy": ["DATA-MINIMIZATION"],
  "Privacy Impact Assessment Procedure": ["RISK-ASSESSMENT"],
  "Data Protection Impact Assessment Procedure": ["RISK-ASSESSMENT"],
  "Consent Management Procedure": ["CONSENT-MGMT"],
  "PII Transfer Policy": ["CROSS-BORDER-TRANSFER"],
  "Cross-border Transfer Policy": ["CROSS-BORDER-TRANSFER"],
  "Grievance Redressal Mechanism": ["DATA-SUBJECT-RIGHTS"],
  "Children's Data Protection Policy": ["CHILDREN-DATA"],
};

// ── Risk → Control mappings ──────────────────────────────────
// Each risk maps to canonical controls that mitigate it.

const RISK_CONTROL_MAP: Record<string, string[]> = {
  "Unauthorized access to sensitive data": ["MFA-ADMIN", "LEAST-PRIVILEGE", "ACCESS-REVIEW", "ENCRYPTION-AT-REST"],
  "Phishing attack on employees": ["SECURITY-TRAINING", "MFA-ADMIN", "MALWARE-PROTECTION"],
  "Third-party vendor data exposure": ["VENDOR-RISK", "ENCRYPTION-AT-REST", "ENCRYPTION-IN-TRANSIT"],
  "Service outage exceeding SLA": ["BACKUP", "MONITORING", "INCIDENT-RESPONSE"],
  "Employee credential compromise": ["MFA-ADMIN", "OFFBOARDING", "ACCESS-REVIEW", "LOGGING"],
  "Ransomware infection": ["MALWARE-PROTECTION", "BACKUP", "MONITORING", "INCIDENT-RESPONSE"],
  "Non-compliance with data retention laws": ["DATA-MINIMIZATION", "PROCESSING-RECORDS", "RISK-ASSESSMENT"],
  "Insider threat / data exfiltration": ["LEAST-PRIVILEGE", "LOGGING", "MONITORING", "OFFBOARDING"],
  "Inadequate disaster recovery capabilities": ["BACKUP", "INCIDENT-RESPONSE"],
  "Personal data breach affecting customers": ["DATA-BREACH-NOTIFICATION", "ENCRYPTION-AT-REST", "INCIDENT-RESPONSE", "CONSENT-MGMT"],
  "Unpatched critical vulnerability exploited": ["VULNERABILITY-MGMT", "CHANGE-MGMT", "MONITORING"],
  "Cloud misconfiguration": ["ASSET-INVENTORY", "MONITORING", "CHANGE-MGMT"],
  "Loss of encryption keys": ["ENCRYPTION-AT-REST", "ENCRYPTION-IN-TRANSIT", "BACKUP"],
  "Regulatory fine for non-compliance": ["RISK-ASSESSMENT", "INFOSEC-POLICY", "PROCESSING-RECORDS"],
  "Supply chain compromise": ["VENDOR-RISK", "VULNERABILITY-MGMT", "MONITORING"],
};

// ── Framework metadata ───────────────────────────────────────

const FRAMEWORK_META: Record<string, { version: string; description: string }> = {
  "SOC 2 Type II": { version: "2017", description: "AICPA Trust Services Criteria for Security, Availability, Processing Integrity, Confidentiality, and Privacy." },
  "ISO 27001:2022": { version: "2022", description: "Information security management systems — Requirements (Annex A controls)." },
  "HIPAA Security Rule": { version: "45 CFR §164.308-.312", description: "US health-data security safeguards: administrative, physical, and technical." },
  "PCI-DSS v4.0.1": { version: "4.0.1", description: "Payment Card Industry Data Security Standard." },
  "GDPR": { version: "2016/679", description: "EU General Data Protection Regulation." },
  "NIST CSF 2.0": { version: "2.0", description: "NIST Cybersecurity Framework 2.0." },
  "ISO 27701:2019": { version: "2019", description: "Privacy information management — extension to ISO 27001/ISO 27002." },
  "DPDP Act 2023": { version: "2023", description: "India's Digital Personal Data Protection Act." },
};

const FRAMEWORK_CONTROL_COUNTS: Record<string, number> = {
  "SOC 2 Type II": 33, "ISO 27001:2022": 49, "HIPAA Security Rule": 46,
  "PCI-DSS v4.0.1": 57, "GDPR": 31, "NIST CSF 2.0": 22,
  "ISO 27701:2019": 31, "DPDP Act 2023": 26,
};

const FRAMEWORK_POLICY_SUGGESTIONS: Record<string, string[]> = {
  "SOC 2 Type II": ["Information Security Policy", "Access Control Policy", "Incident Response Plan", "Change Management Policy", "Risk Assessment Policy", "Vendor Management Policy", "Business Continuity Plan", "Acceptable Use Policy"],
  "ISO 27001:2022": ["Information Security Policy", "Access Control Policy", "Cryptography Policy", "Physical Security Policy", "Asset Management Policy", "HR Security Policy", "Incident Response Plan", "Business Continuity Plan", "Supplier Relationships Policy", "Secure Development Policy"],
  "HIPAA Security Rule": ["Information Security Policy", "Access Control Policy", "Workforce Security Policy", "Incident Response Plan", "Contingency Plan", "Device and Media Controls Policy", "Audit Controls Policy", "Business Associate Agreement Template"],
  "PCI-DSS v4.0.1": ["Information Security Policy", "Network Security Policy", "Access Control Policy", "Encryption Policy", "Anti-Malware Policy", "Secure Development Policy", "Incident Response Plan", "Vulnerability Management Policy", "Physical Security Policy"],
  "GDPR": ["Privacy Policy", "Data Protection Policy", "Data Subject Rights Procedure", "Data Breach Response Plan", "Data Processing Agreement Template", "Data Retention Policy", "Privacy Impact Assessment Procedure"],
  "NIST CSF 2.0": ["Information Security Policy", "Risk Management Policy", "Access Control Policy", "Incident Response Plan", "Business Continuity Plan", "Supply Chain Risk Management Policy"],
  "ISO 27701:2019": ["Privacy Policy", "Data Protection Impact Assessment Procedure", "Consent Management Procedure", "Data Subject Rights Procedure", "PII Transfer Policy", "Data Retention and Deletion Policy"],
  "DPDP Act 2023": ["Privacy Policy (India)", "Consent Management Procedure", "Data Principal Rights Procedure", "Grievance Redressal Mechanism", "Data Breach Notification Procedure", "Children's Data Protection Policy", "Cross-border Transfer Policy"],
};

const RISK_TEMPLATES: { title: string; category: string; likelihood: number; impact: number }[] = [
  { title: "Unauthorized access to sensitive data", category: "Security", likelihood: 3, impact: 5 },
  { title: "Phishing attack on employees", category: "Security", likelihood: 4, impact: 3 },
  { title: "Third-party vendor data exposure", category: "Vendor", likelihood: 2, impact: 4 },
  { title: "Service outage exceeding SLA", category: "Availability", likelihood: 2, impact: 4 },
  { title: "Employee credential compromise", category: "Security", likelihood: 3, impact: 4 },
  { title: "Ransomware infection", category: "Security", likelihood: 2, impact: 5 },
  { title: "Non-compliance with data retention laws", category: "Compliance", likelihood: 2, impact: 5 },
  { title: "Insider threat / data exfiltration", category: "Security", likelihood: 2, impact: 5 },
  { title: "Inadequate disaster recovery capabilities", category: "Availability", likelihood: 2, impact: 5 },
  { title: "Personal data breach affecting customers", category: "Privacy", likelihood: 2, impact: 5 },
  { title: "Unpatched critical vulnerability exploited", category: "Security", likelihood: 3, impact: 4 },
  { title: "Cloud misconfiguration", category: "Security", likelihood: 3, impact: 4 },
  { title: "Loss of encryption keys", category: "Security", likelihood: 1, impact: 5 },
  { title: "Regulatory fine for non-compliance", category: "Compliance", likelihood: 2, impact: 4 },
  { title: "Supply chain compromise", category: "Vendor", likelihood: 2, impact: 4 },
];

const generateSchema = z.object({
  goals: z.array(z.string()).min(1),
  company: z.object({
    industry: z.string(),
    employeeCount: z.number().int().min(1),
    cloudProvider: z.string(),
    criticalApps: z.number().int().min(0),
    securityTeamSize: z.number().int().min(0),
  }),
});

export async function POST(req: Request) {
  try {
    const user = await requireSession();
    const data = await parseBody(req, generateSchema);

    const org = await prisma.organization.findUnique({
      where: { id: user.organizationId },
    });
    if (!org) throw new HttpError(404, "Organization not found");
    if (org.onboardingComplete) {
      throw new HttpError(400, "Onboarding already completed");
    }

    // Resolve selected goals to framework names
    const selectedFrameworkNames = new Set<string>();
    for (const goalSlug of data.goals) {
      const goal = ONBOARDING_GOALS.find((g) => g.slug === goalSlug);
      if (goal) {
        for (const fw of goal.frameworks) {
          selectedFrameworkNames.add(fw);
        }
      }
    }

    // Identify which canonical controls are relevant to the selected frameworks
    const relevantMappings = CONTROL_MAPPINGS.filter((concept) =>
      Array.from(selectedFrameworkNames).some(
        (fw) => (concept.citations[fw as FrameworkName] ?? []).length > 0
      )
    );

    // Calculate stats for summary
    const totalCitations = Array.from(selectedFrameworkNames).reduce(
      (sum, fw) => sum + (FRAMEWORK_CONTROL_COUNTS[fw] ?? 0), 0
    );
    let mappedCitationCount = 0;
    for (const fw of selectedFrameworkNames) {
      for (const concept of CONTROL_MAPPINGS) {
        const cites = concept.citations[fw as FrameworkName];
        if (cites) mappedCitationCount += cites.length;
      }
    }
    const unmappedControls = Math.max(0, totalCitations - mappedCitationCount);
    const totalControls = relevantMappings.length + unmappedControls;

    // Deduplicate policies
    const policySet = new Set<string>();
    for (const fwName of selectedFrameworkNames) {
      for (const p of FRAMEWORK_POLICY_SUGGESTIONS[fwName] ?? []) policySet.add(p);
    }

    // Evidence requirements
    const evidenceRequirements = Math.ceil(totalControls * 0.45);

    // Filter risks
    const hasPrivacy = data.goals.some((g) => ["gdpr", "dpdp", "iso-27701"].includes(g));
    const relevantRisks = RISK_TEMPLATES.filter((r) => {
      if (r.category === "Privacy" && !hasPrivacy) return false;
      return true;
    });
    const riskCount = Math.min(
      relevantRisks.length,
      Math.max(5, Math.ceil(data.company.employeeCount / 20))
    );

    // Readiness estimate
    let readinessPoints = 0;
    const maxPoints = 10;
    if (data.company.securityTeamSize > 0) readinessPoints += 2;
    if (data.company.securityTeamSize >= 3) readinessPoints += 1;
    if (/aws|azure|google/i.test(data.company.cloudProvider)) readinessPoints += 2;
    if (data.company.employeeCount > 50) readinessPoints += 1;
    if (data.company.industry === "Technology / SaaS") readinessPoints += 1;
    if (data.company.industry === "Financial Services") readinessPoints += 1;

    const baseReadiness = Math.round((readinessPoints / maxPoints) * 100);
    const frameworkReadiness: Record<string, number> = {};
    const frameworkCitations: Record<string, number> = {};
    for (const fwName of selectedFrameworkNames) {
      frameworkCitations[fwName] = FRAMEWORK_CONTROL_COUNTS[fwName] ?? 0;
      const controlCount = FRAMEWORK_CONTROL_COUNTS[fwName] ?? 20;
      const complexityPenalty = Math.min(15, Math.round(controlCount / 5));
      frameworkReadiness[fwName] = Math.max(5, Math.min(85, baseReadiness + 15 - complexityPenalty));
    }
    const gapCount = Math.ceil(totalControls * (1 - baseReadiness / 100) * 0.3);
    const highPriorityGaps = Math.ceil(gapCount * 0.35);

    // ── Create all data with full mappings ──────────────────────
    await prisma.$transaction(async (tx) => {
      // 1. Save company profile
      await tx.companyProfile.upsert({
        where: { organizationId: org.id },
        update: {
          industry: data.company.industry,
          employeeCount: data.company.employeeCount,
          cloudProvider: data.company.cloudProvider,
          criticalApps: data.company.criticalApps,
          securityTeamSize: data.company.securityTeamSize,
          selectedGoals: data.goals,
        },
        create: {
          organizationId: org.id,
          industry: data.company.industry,
          employeeCount: data.company.employeeCount,
          cloudProvider: data.company.cloudProvider,
          criticalApps: data.company.criticalApps,
          securityTeamSize: data.company.securityTeamSize,
          selectedGoals: data.goals,
        },
      });

      // 2. Create frameworks with metadata
      const frameworkIds = new Map<string, string>();
      for (const fwName of selectedFrameworkNames) {
        const existing = await tx.framework.findFirst({
          where: { organizationId: org.id, name: fwName },
        });
        if (existing) {
          frameworkIds.set(fwName, existing.id);
        } else {
          const meta = FRAMEWORK_META[fwName] ?? { version: "", description: "" };
          const created = await tx.framework.create({
            data: {
              organizationId: org.id,
              name: fwName,
              version: meta.version,
              description: meta.description,
            },
          });
          frameworkIds.set(fwName, created.id);
        }
      }

      // 3. Create controls from CONTROL_MAPPINGS + FrameworkRequirement + ControlMapping links
      const controlIdByCode = new Map<string, string>();

      for (const concept of relevantMappings) {
        const existing = await tx.control.findUnique({
          where: { organizationId_code: { organizationId: org.id, code: concept.canonicalCode } },
        });
        let controlId: string;
        if (existing) {
          controlId = existing.id;
        } else {
          const created = await tx.control.create({
            data: {
              organizationId: org.id,
              code: concept.canonicalCode,
              title: concept.title,
            },
          });
          controlId = created.id;
        }
        controlIdByCode.set(concept.canonicalCode, controlId);

        for (const fwName of selectedFrameworkNames) {
          const fwCitations = concept.citations[fwName as FrameworkName];
          if (!fwCitations) continue;
          const frameworkId = frameworkIds.get(fwName)!;

          for (const cite of fwCitations) {
            const existingReq = await tx.frameworkRequirement.findUnique({
              where: { frameworkId_code: { frameworkId, code: cite.code } },
            });
            let reqId: string;
            if (existingReq) {
              reqId = existingReq.id;
            } else {
              const createdReq = await tx.frameworkRequirement.create({
                data: { frameworkId, code: cite.code, title: cite.title ?? cite.code },
              });
              reqId = createdReq.id;
            }
            const existingMapping = await tx.controlMapping.findUnique({
              where: { controlId_frameworkRequirementId: { controlId, frameworkRequirementId: reqId } },
            });
            if (!existingMapping) {
              await tx.controlMapping.create({
                data: { controlId, frameworkRequirementId: reqId },
              });
            }
          }
        }
      }

      // 4. Create policies and link to controls
      const existingPolicies = await tx.policy.count({ where: { organizationId: org.id } });
      if (existingPolicies === 0) {
        for (const title of policySet) {
          const policy = await tx.policy.create({
            data: { organizationId: org.id, title, status: "DRAFT" },
          });

          const mappedCodes = POLICY_CONTROL_MAP[title] ?? [];
          for (const code of mappedCodes) {
            const controlId = controlIdByCode.get(code);
            if (controlId) {
              await tx.policyControl.create({
                data: { policyId: policy.id, controlId },
              });
            }
          }
        }
      }

      // 5. Create risks and link to controls
      const existingRisks = await tx.risk.count({ where: { organizationId: org.id } });
      if (existingRisks === 0) {
        const risksToCreate = relevantRisks.slice(0, riskCount);
        for (const riskData of risksToCreate) {
          const risk = await tx.risk.create({
            data: {
              organizationId: org.id,
              ownerId: user.id,
              title: riskData.title,
              category: riskData.category,
              likelihood: riskData.likelihood,
              impact: riskData.impact,
            },
          });

          const mappedCodes = RISK_CONTROL_MAP[riskData.title] ?? [];
          for (const code of mappedCodes) {
            const controlId = controlIdByCode.get(code);
            if (controlId) {
              await tx.riskControl.create({
                data: { riskId: risk.id, controlId },
              });
            }
          }
        }
      }

      // 6. Mark onboarding complete
      await tx.organization.update({
        where: { id: org.id },
        data: { onboardingComplete: true },
      });
    });

    return NextResponse.json({
      summary: {
        controls: totalControls,
        policies: policySet.size,
        evidenceRequirements,
        risks: riskCount,
        gaps: gapCount,
        highPriorityGaps,
        frameworks: Array.from(selectedFrameworkNames).map((name) => ({
          name,
          citations: frameworkCitations[name] ?? 0,
          readiness: frameworkReadiness[name] ?? 0,
        })),
        overallReadiness: baseReadiness,
      },
    });
  } catch (err) {
    return handleError(err);
  }
}
