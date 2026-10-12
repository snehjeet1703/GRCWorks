-- Store only a SHA-256 hash of Trust Vault access tokens; existing links keep working.
ALTER TABLE "trust_access_requests" RENAME COLUMN "access_token" TO "access_token_hash";

UPDATE "trust_access_requests"
SET "access_token_hash" = encode(sha256(convert_to("access_token_hash", 'UTF8')), 'hex')
WHERE "access_token_hash" IS NOT NULL;

ALTER INDEX "trust_access_requests_access_token_key" RENAME TO "trust_access_requests_access_token_hash_key";
