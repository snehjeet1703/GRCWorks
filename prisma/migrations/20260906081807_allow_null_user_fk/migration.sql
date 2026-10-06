-- Drop existing FKs so we can change the nullability and re-create with ON DELETE SET NULL.
ALTER TABLE "audit_logs" DROP CONSTRAINT "audit_logs_user_id_fkey";
ALTER TABLE "evidence"   DROP CONSTRAINT "evidence_uploaded_by_id_fkey";

-- Add user_name to audit_logs. Backfill from users, then enforce NOT NULL.
ALTER TABLE "audit_logs" ADD COLUMN "user_name" TEXT;
UPDATE "audit_logs" a
SET    "user_name" = COALESCE(u."name", '(unknown)')
FROM   "users" u
WHERE  a."user_id" = u."id";
UPDATE "audit_logs" SET "user_name" = '(unknown)' WHERE "user_name" IS NULL;
ALTER TABLE "audit_logs" ALTER COLUMN "user_name" SET NOT NULL;

-- Allow null user_id / uploaded_by_id.
ALTER TABLE "audit_logs" ALTER COLUMN "user_id" DROP NOT NULL;
ALTER TABLE "evidence"   ALTER COLUMN "uploaded_by_id" DROP NOT NULL;

-- Recreate FKs with ON DELETE SET NULL.
ALTER TABLE "evidence"
  ADD CONSTRAINT "evidence_uploaded_by_id_fkey"
  FOREIGN KEY ("uploaded_by_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "audit_logs"
  ADD CONSTRAINT "audit_logs_user_id_fkey"
  FOREIGN KEY ("user_id") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
