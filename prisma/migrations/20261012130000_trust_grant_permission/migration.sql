-- Per-grant permission; existing grants inherit their document's current setting.
ALTER TABLE "trust_document_access" ADD COLUMN "permission" "TrustDocPermission" NOT NULL DEFAULT 'VIEW_ONLY';

UPDATE "trust_document_access" AS a
SET "permission" = d."permission"
FROM "trust_vault_documents" AS d
WHERE a."document_id" = d."id";
