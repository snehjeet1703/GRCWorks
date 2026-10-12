import { prisma } from "./db";
import { HttpError } from "./api";
import { hashTrustToken } from "./trust-token";

// View-only needs an in-browser rendering; only these can be shown (and watermarked) safely.
export const VIEWABLE_MIME_TYPES = new Set(["application/pdf", "image/png", "image/jpeg"]);

export type TrustDocAccess = {
  organizationName: string;
  doc: { id: string; name: string; fileName: string; storageKey: string; mimeType: string };
  viewerEmail: string | null;
  canDownload: boolean;
  canView: boolean;
};

// Public docs use the document's own permission; restricted docs use the permission on the
// customer's grant, so the same file can be downloadable for one customer and view-only for another.
export async function resolveTrustDocAccess(slug: string, docId: string, token: string | null): Promise<TrustDocAccess> {
  const org = await prisma.organization.findUnique({ where: { slug }, select: { id: true, name: true } });
  if (!org) throw new HttpError(404, "Not found");
  const config = await prisma.trustVaultConfig.findUnique({ where: { organizationId: org.id } });
  if (!config?.enabled) throw new HttpError(404, "Trust vault not enabled");

  const doc = await prisma.trustVaultDocument.findFirst({ where: { id: docId, configId: config.id, enabled: true } });
  if (!doc) throw new HttpError(404, "Document not found");
  if (doc.validUntil && doc.validUntil < new Date()) throw new HttpError(410, "Document has expired");

  const viewable = VIEWABLE_MIME_TYPES.has(doc.mimeType);
  const summary = { id: doc.id, name: doc.name, fileName: doc.fileName, storageKey: doc.storageKey, mimeType: doc.mimeType };

  if (doc.visibility === "PUBLIC") {
    const canDownload = doc.permission === "DOWNLOADABLE";
    return { organizationName: org.name, doc: summary, viewerEmail: null, canDownload, canView: viewable };
  }

  if (!token) throw new HttpError(401, "Access token required");
  const request = await prisma.trustAccessRequest.findFirst({
    where: { configId: config.id, accessTokenHash: hashTrustToken(token), status: "APPROVED" },
    include: { documentAccess: { where: { documentId: doc.id }, select: { permission: true } } },
  });
  const grant = request?.documentAccess[0];
  if (!request || !grant) throw new HttpError(403, "Access denied");
  if (request.tokenExpiresAt && request.tokenExpiresAt < new Date()) throw new HttpError(401, "Token expired");

  if (config.requireNda) {
    const nda = await prisma.trustNda.findFirst({ where: { configId: config.id, active: true } });
    if (nda) {
      const accepted = await prisma.trustNdaAcceptance.findUnique({
        where: { ndaId_accessRequestId: { ndaId: nda.id, accessRequestId: request.id } },
      });
      if (!accepted || accepted.ndaVersion !== nda.version) throw new HttpError(403, "NDA acceptance required");
    }
  }

  return {
    organizationName: org.name,
    doc: summary,
    viewerEmail: request.email,
    canDownload: grant.permission === "DOWNLOADABLE",
    canView: viewable,
  };
}
