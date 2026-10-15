-- CreateTable
CREATE TABLE "audit_period_controls" (
    "id" TEXT NOT NULL,
    "audit_period_id" TEXT NOT NULL,
    "control_id" TEXT NOT NULL,
    "frequency" "ControlFrequency" NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_period_controls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_period_controls_control_id_idx" ON "audit_period_controls"("control_id");

-- CreateIndex
CREATE UNIQUE INDEX "audit_period_controls_audit_period_id_control_id_key" ON "audit_period_controls"("audit_period_id", "control_id");

-- AddForeignKey
ALTER TABLE "audit_period_controls" ADD CONSTRAINT "audit_period_controls_audit_period_id_fkey" FOREIGN KEY ("audit_period_id") REFERENCES "audit_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_period_controls" ADD CONSTRAINT "audit_period_controls_control_id_fkey" FOREIGN KEY ("control_id") REFERENCES "controls"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Backfill: existing periods keep the controls (and frequencies) they cover today.
INSERT INTO "audit_period_controls" ("id", "audit_period_id", "control_id", "frequency")
SELECT gen_random_uuid()::text, p."id", c."id", c."frequency"
FROM "audit_periods" p
JOIN "controls" c ON c."organization_id" = p."organization_id"
WHERE c."applicability" <> 'NOT_APPLICABLE'
  AND EXISTS (
    SELECT 1 FROM "control_mappings" m
    JOIN "framework_requirements" r ON r."id" = m."framework_requirement_id"
    WHERE m."control_id" = c."id" AND r."framework_id" = p."framework_id"
  )
ON CONFLICT DO NOTHING;
