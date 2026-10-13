-- Evidence can now support several controls. Existing single links are carried over unchanged.

-- 1. Link table
CREATE TABLE "evidence_controls" (
    "evidence_id" TEXT NOT NULL,
    "control_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_controls_pkey" PRIMARY KEY ("evidence_id","control_id")
);
CREATE INDEX "evidence_controls_control_id_idx" ON "evidence_controls"("control_id");
ALTER TABLE "evidence_controls" ADD CONSTRAINT "evidence_controls_evidence_id_fkey" FOREIGN KEY ("evidence_id") REFERENCES "evidence"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "evidence_controls" ADD CONSTRAINT "evidence_controls_control_id_fkey" FOREIGN KEY ("control_id") REFERENCES "controls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 2. Copy every existing evidence -> control link
INSERT INTO "evidence_controls" ("evidence_id", "control_id", "created_at")
SELECT "id", "control_id", "created_at" FROM "evidence";

-- 3. Evidence is scoped to its organisation directly (previously via its single control)
ALTER TABLE "evidence" ADD COLUMN "organization_id" TEXT;
UPDATE "evidence" e SET "organization_id" = c."organization_id" FROM "controls" c WHERE c."id" = e."control_id";
ALTER TABLE "evidence" ALTER COLUMN "organization_id" SET NOT NULL;
CREATE INDEX "evidence_organization_id_idx" ON "evidence"("organization_id");
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- 4. Drop the old single-control column
ALTER TABLE "evidence" DROP CONSTRAINT "evidence_control_id_fkey";
DROP INDEX "evidence_control_id_idx";
ALTER TABLE "evidence" DROP COLUMN "control_id";
