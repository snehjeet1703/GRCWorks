-- Architecture Redesign v2
-- P0: FrameworkRequirement + ControlMapping (replaces FrameworkControl)
-- P0: Enhanced AuditLog, Evidence lifecycle, Risk treatment
-- P1: Finding, ControlException, RiskAction

-- ═══ New Enums ═══════════════════════════════════════════════

CREATE TYPE "Applicability" AS ENUM ('APPLICABLE', 'NOT_APPLICABLE', 'PARTIALLY_APPLICABLE', 'INHERITED');
CREATE TYPE "EvidenceSource" AS ENUM ('MANUAL_UPLOAD', 'INTEGRATION', 'GENERATED', 'POLICY_LINK');
CREATE TYPE "EvidenceStatus" AS ENUM ('VALID', 'EXPIRING', 'EXPIRED', 'REJECTED');
CREATE TYPE "FindingSeverity" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');
CREATE TYPE "FindingStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'RESOLVED', 'ACCEPTED', 'CLOSED');
CREATE TYPE "ExceptionStatus" AS ENUM ('REQUESTED', 'APPROVED', 'REJECTED', 'EXPIRED', 'CLOSED');
CREATE TYPE "RiskStatus" AS ENUM ('OPEN', 'IN_TREATMENT', 'ACCEPTED', 'CLOSED');
CREATE TYPE "RiskActionStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');

-- Expand EvidenceType enum with new values
ALTER TYPE "EvidenceType" ADD VALUE IF NOT EXISTS 'DOCUMENT';
ALTER TYPE "EvidenceType" ADD VALUE IF NOT EXISTS 'SCREENSHOT';
ALTER TYPE "EvidenceType" ADD VALUE IF NOT EXISTS 'REPORT';
ALTER TYPE "EvidenceType" ADD VALUE IF NOT EXISTS 'CONFIGURATION';
ALTER TYPE "EvidenceType" ADD VALUE IF NOT EXISTS 'EXPORT';
ALTER TYPE "EvidenceType" ADD VALUE IF NOT EXISTS 'LOG';

-- ═══ Enhance existing tables ═════════════════════════════════

-- Framework: add publisher
ALTER TABLE "frameworks" ADD COLUMN "publisher" TEXT NOT NULL DEFAULT '';

-- Control: add applicability + implementation notes
ALTER TABLE "controls" ADD COLUMN "applicability" "Applicability" NOT NULL DEFAULT 'APPLICABLE';
ALTER TABLE "controls" ADD COLUMN "applicability_justification" TEXT NOT NULL DEFAULT '';
ALTER TABLE "controls" ADD COLUMN "implementation_notes" TEXT NOT NULL DEFAULT '';

-- Evidence: lifecycle fields
ALTER TABLE "evidence" ADD COLUMN "source" "EvidenceSource" NOT NULL DEFAULT 'MANUAL_UPLOAD';
ALTER TABLE "evidence" ADD COLUMN "storage_key" TEXT NOT NULL DEFAULT '';
ALTER TABLE "evidence" ADD COLUMN "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "evidence" ADD COLUMN "valid_from" TIMESTAMP(3);
ALTER TABLE "evidence" ADD COLUMN "valid_until" TIMESTAMP(3);
ALTER TABLE "evidence" ADD COLUMN "status" "EvidenceStatus" NOT NULL DEFAULT 'VALID';
ALTER TABLE "evidence" ADD COLUMN "reviewed_by_id" TEXT;
ALTER TABLE "evidence" ADD COLUMN "reviewed_at" TIMESTAMP(3);

ALTER TABLE "evidence" ADD CONSTRAINT "evidence_reviewed_by_id_fkey"
  FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Risk: inherent/residual scores + status
ALTER TABLE "risks" ADD COLUMN "inherent_score" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "risks" ADD COLUMN "residual_score" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "risks" ADD COLUMN "status" "RiskStatus" NOT NULL DEFAULT 'OPEN';

-- Backfill inherent scores from likelihood * impact
UPDATE "risks" SET "inherent_score" = "likelihood" * "impact";

-- Policy: owner + dates
ALTER TABLE "policies" ADD COLUMN "owner_id" TEXT;
ALTER TABLE "policies" ADD COLUMN "effective_date" TIMESTAMP(3);
ALTER TABLE "policies" ADD COLUMN "review_date" TIMESTAMP(3);

ALTER TABLE "policies" ADD CONSTRAINT "policies_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AuditLog: before/after snapshots + metadata
ALTER TABLE "audit_logs" ADD COLUMN "before_json" JSONB;
ALTER TABLE "audit_logs" ADD COLUMN "after_json" JSONB;
ALTER TABLE "audit_logs" ADD COLUMN "metadata_json" JSONB;
ALTER TABLE "audit_logs" ADD COLUMN "request_id" TEXT;

-- ═══ New tables ══════════════════════════════════════════════

-- Framework Requirements (individual clauses/controls within a framework)
CREATE TABLE "framework_requirements" (
    "id" TEXT NOT NULL,
    "framework_id" TEXT NOT NULL,
    "parent_id" TEXT,
    "code" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "framework_requirements_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "framework_requirements_framework_id_code_key"
  ON "framework_requirements"("framework_id", "code");
CREATE INDEX "framework_requirements_framework_id_idx"
  ON "framework_requirements"("framework_id");

ALTER TABLE "framework_requirements" ADD CONSTRAINT "framework_requirements_framework_id_fkey"
  FOREIGN KEY ("framework_id") REFERENCES "frameworks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "framework_requirements" ADD CONSTRAINT "framework_requirements_parent_id_fkey"
  FOREIGN KEY ("parent_id") REFERENCES "framework_requirements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Control Mappings (replaces framework_controls)
CREATE TABLE "control_mappings" (
    "id" TEXT NOT NULL,
    "control_id" TEXT NOT NULL,
    "framework_requirement_id" TEXT NOT NULL,
    "mapping_type" TEXT NOT NULL DEFAULT 'IMPLEMENTS',
    "notes" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "control_mappings_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "control_mappings_control_id_framework_requirement_id_key"
  ON "control_mappings"("control_id", "framework_requirement_id");
CREATE INDEX "control_mappings_framework_requirement_id_idx"
  ON "control_mappings"("framework_requirement_id");

ALTER TABLE "control_mappings" ADD CONSTRAINT "control_mappings_control_id_fkey"
  FOREIGN KEY ("control_id") REFERENCES "controls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "control_mappings" ADD CONSTRAINT "control_mappings_framework_requirement_id_fkey"
  FOREIGN KEY ("framework_requirement_id") REFERENCES "framework_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Findings
CREATE TABLE "findings" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "control_id" TEXT,
    "risk_id" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "severity" "FindingSeverity" NOT NULL DEFAULT 'MEDIUM',
    "status" "FindingStatus" NOT NULL DEFAULT 'OPEN',
    "owner_id" TEXT,
    "due_date" TIMESTAMP(3),
    "resolution" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolved_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "findings_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "findings_organization_id_idx" ON "findings"("organization_id");
CREATE INDEX "findings_control_id_idx" ON "findings"("control_id");
CREATE INDEX "findings_status_idx" ON "findings"("status");

ALTER TABLE "findings" ADD CONSTRAINT "findings_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "findings" ADD CONSTRAINT "findings_control_id_fkey"
  FOREIGN KEY ("control_id") REFERENCES "controls"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "findings" ADD CONSTRAINT "findings_risk_id_fkey"
  FOREIGN KEY ("risk_id") REFERENCES "risks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "findings" ADD CONSTRAINT "findings_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Control Exceptions
CREATE TABLE "control_exceptions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "control_id" TEXT NOT NULL,
    "requested_by_id" TEXT,
    "approved_by_id" TEXT,
    "reason" TEXT NOT NULL,
    "compensating_control" TEXT NOT NULL DEFAULT '',
    "valid_from" TIMESTAMP(3) NOT NULL,
    "valid_until" TIMESTAMP(3) NOT NULL,
    "status" "ExceptionStatus" NOT NULL DEFAULT 'REQUESTED',
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "control_exceptions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "control_exceptions_organization_id_idx" ON "control_exceptions"("organization_id");
CREATE INDEX "control_exceptions_control_id_idx" ON "control_exceptions"("control_id");
CREATE INDEX "control_exceptions_status_idx" ON "control_exceptions"("status");

ALTER TABLE "control_exceptions" ADD CONSTRAINT "control_exceptions_organization_id_fkey"
  FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "control_exceptions" ADD CONSTRAINT "control_exceptions_control_id_fkey"
  FOREIGN KEY ("control_id") REFERENCES "controls"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "control_exceptions" ADD CONSTRAINT "control_exceptions_requested_by_id_fkey"
  FOREIGN KEY ("requested_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "control_exceptions" ADD CONSTRAINT "control_exceptions_approved_by_id_fkey"
  FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Risk Actions
CREATE TABLE "risk_actions" (
    "id" TEXT NOT NULL,
    "risk_id" TEXT NOT NULL,
    "owner_id" TEXT,
    "action" TEXT NOT NULL,
    "due_date" TIMESTAMP(3),
    "status" "RiskActionStatus" NOT NULL DEFAULT 'PENDING',
    "completed_at" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "risk_actions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "risk_actions_risk_id_idx" ON "risk_actions"("risk_id");

ALTER TABLE "risk_actions" ADD CONSTRAINT "risk_actions_risk_id_fkey"
  FOREIGN KEY ("risk_id") REFERENCES "risks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "risk_actions" ADD CONSTRAINT "risk_actions_owner_id_fkey"
  FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ═══ Data migration: framework_controls → framework_requirements + control_mappings ═══

-- Step 1: Create a FrameworkRequirement for each unique (framework_id, code) in framework_controls
INSERT INTO "framework_requirements" ("id", "framework_id", "code", "title", "sort_order")
SELECT
  gen_random_uuid()::text,
  fc."framework_id",
  fc."code",
  COALESCE(c."title", fc."code"),
  ROW_NUMBER() OVER (PARTITION BY fc."framework_id" ORDER BY fc."code")
FROM (
  SELECT DISTINCT "framework_id", "code", MIN("control_id") AS "first_control_id"
  FROM "framework_controls"
  GROUP BY "framework_id", "code"
) fc
LEFT JOIN "controls" c ON c."id" = fc."first_control_id";

-- Step 2: Create ControlMapping for each framework_control row
INSERT INTO "control_mappings" ("id", "control_id", "framework_requirement_id", "mapping_type", "notes")
SELECT
  gen_random_uuid()::text,
  fc."control_id",
  fr."id",
  'IMPLEMENTS',
  ''
FROM "framework_controls" fc
JOIN "framework_requirements" fr ON fr."framework_id" = fc."framework_id" AND fr."code" = fc."code"
ON CONFLICT ("control_id", "framework_requirement_id") DO NOTHING;

-- Step 3: Drop old framework_controls table
DROP TABLE "framework_controls";
