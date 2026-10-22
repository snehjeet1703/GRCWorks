import type { Prisma } from "@prisma/client";
import { CONTROL_MAPPINGS, type FrameworkName } from "../../prisma/control-mappings";

// Built-in frameworks: metadata plus an installer that creates the framework, its requirements and the
// shared controls that satisfy them (reusing any controls the organisation already has).

export const FRAMEWORK_META: Record<FrameworkName, { version: string; description: string }> = {
  "SOC 2 Type II": { version: "2017", description: "AICPA Trust Services Criteria for Security, Availability, Processing Integrity, Confidentiality, and Privacy." },
  "ISO 27001:2022": { version: "2022", description: "Information security management systems — Requirements (Annex A controls)." },
  "HIPAA Security Rule": { version: "45 CFR §164.308-.312", description: "US health-data security safeguards: administrative, physical, and technical." },
  "PCI-DSS v4.0.1": { version: "4.0.1", description: "Payment Card Industry Data Security Standard." },
  "GDPR": { version: "2016/679", description: "EU General Data Protection Regulation." },
  "NIST CSF 2.0": { version: "2.0", description: "NIST Cybersecurity Framework 2.0." },
  "ISO 27701:2019": { version: "2019", description: "Privacy information management — extension to ISO 27001/ISO 27002." },
  "DPDP Act 2023": { version: "2023", description: "India's Digital Personal Data Protection Act." },
  "ISO/IEC 42001:2023": { version: "2023", description: "AI management systems — responsible development, provision and use of AI systems." },
};

export const CATALOG_FRAMEWORKS = Object.keys(FRAMEWORK_META) as FrameworkName[];

export const isCatalogFramework = (name: string): name is FrameworkName => name in FRAMEWORK_META;

/** Number of requirements (citations) a built-in framework has in the catalogue. */
export function catalogRequirementCount(name: FrameworkName) {
  const codes = new Set<string>();
  for (const c of CONTROL_MAPPINGS) for (const cite of c.citations[name] ?? []) codes.add(cite.code);
  return codes.size;
}

/** Built-in frameworks with their requirement counts, for the "Add framework" picker. */
export function catalogSummary() {
  return CATALOG_FRAMEWORKS.map((name) => ({ name, description: FRAMEWORK_META[name].description, requirements: catalogRequirementCount(name) }));
}

/**
 * Installs a built-in framework for an organisation inside a transaction: the framework, its requirements,
 * any catalogue controls the organisation doesn't have yet, and the control→requirement mappings.
 * Existing controls with the same code are reused, so evidence already collected counts straight away.
 */
export async function installCatalogFramework(tx: Prisma.TransactionClient, organizationId: string, name: FrameworkName) {
  const meta = FRAMEWORK_META[name];
  const framework =
    (await tx.framework.findFirst({ where: { organizationId, name } })) ??
    (await tx.framework.create({ data: { organizationId, name, version: meta.version, description: meta.description } }));

  let controlsCreated = 0;
  let controlsReused = 0;
  const reqIds = new Map<string, string>();
  for (const concept of CONTROL_MAPPINGS) {
    const cites = concept.citations[name];
    if (!cites?.length) continue;

    const existing = await tx.control.findUnique({
      where: { organizationId_code: { organizationId, code: concept.canonicalCode } },
      select: { id: true },
    });
    const controlId = existing?.id ??
      (await tx.control.create({ data: { organizationId, code: concept.canonicalCode, title: concept.title }, select: { id: true } })).id;
    if (existing) controlsReused++; else controlsCreated++;

    for (const cite of cites) {
      let reqId = reqIds.get(cite.code);
      if (!reqId) {
        reqId = (
          (await tx.frameworkRequirement.findUnique({ where: { frameworkId_code: { frameworkId: framework.id, code: cite.code } }, select: { id: true } })) ??
          (await tx.frameworkRequirement.create({ data: { frameworkId: framework.id, code: cite.code, title: cite.title ?? cite.code }, select: { id: true } }))
        ).id;
        reqIds.set(cite.code, reqId);
      }
      await tx.controlMapping.createMany({ data: [{ controlId, frameworkRequirementId: reqId }], skipDuplicates: true });
    }
  }
  return { framework, requirements: reqIds.size, controlsCreated, controlsReused };
}
