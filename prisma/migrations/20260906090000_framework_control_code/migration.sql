-- Add per-framework code to framework_controls.
-- Backfill from controls.code (each existing FC currently maps 1-to-1 to a Control with its own unique code).

ALTER TABLE "framework_controls" ADD COLUMN "code" TEXT;

UPDATE "framework_controls" fc
SET    "code" = c."code"
FROM   "controls" c
WHERE  fc."control_id" = c."id";

ALTER TABLE "framework_controls" ALTER COLUMN "code" SET NOT NULL;

-- One code per framework — you can't cite two different underlying controls as "CC6.1" in SOC 2.
CREATE UNIQUE INDEX "framework_controls_framework_id_code_key"
  ON "framework_controls" ("framework_id", "code");
