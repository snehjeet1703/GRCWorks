-- Replace the composite (framework_id, control_id) PK with a real uuid `id`.
-- This lets one control be cited by multiple codes within the same framework
-- (e.g. INCIDENT-RESPONSE covering SOC 2 CC7.3, CC7.4, and CC7.5).

-- Add id column and populate for existing rows.
ALTER TABLE "framework_controls" ADD COLUMN "id" TEXT;
UPDATE "framework_controls" SET "id" = gen_random_uuid()::text WHERE "id" IS NULL;
ALTER TABLE "framework_controls" ALTER COLUMN "id" SET NOT NULL;

-- Drop old composite PK, make id the new PK.
ALTER TABLE "framework_controls" DROP CONSTRAINT "framework_controls_pkey";
ALTER TABLE "framework_controls" ADD CONSTRAINT "framework_controls_pkey" PRIMARY KEY ("id");

-- Add a lookup index over (framework, control) so the app can still find
-- "all citations of this control in this framework" cheaply.
CREATE INDEX "framework_controls_framework_id_control_id_idx"
  ON "framework_controls" ("framework_id", "control_id");
