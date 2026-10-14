-- CreateEnum
CREATE TYPE "SlotReviewStatus" AS ENUM ('IN_REVIEW', 'CHANGES_REQUESTED', 'APPROVED');

-- AlterTable
ALTER TABLE "evidence" ADD COLUMN     "period_end" TIMESTAMP(3),
ADD COLUMN     "period_start" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "reminder_final_days" INTEGER NOT NULL DEFAULT 7,
ADD COLUMN     "reminder_weekday" INTEGER NOT NULL DEFAULT 1,
ADD COLUMN     "reminders_enabled" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "audit_periods" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "framework_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "start_date" TIMESTAMP(3) NOT NULL,
    "end_date" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "audit_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence_slot_reviews" (
    "id" TEXT NOT NULL,
    "audit_period_id" TEXT NOT NULL,
    "control_id" TEXT NOT NULL,
    "slot_index" INTEGER NOT NULL,
    "status" "SlotReviewStatus" NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "submitted_by_id" TEXT,
    "submitted_at" TIMESTAMP(3),
    "reviewed_by_id" TEXT,
    "reviewed_at" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "evidence_slot_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reminder_logs" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "audit_period_id" TEXT,
    "kind" TEXT NOT NULL,
    "sent_on" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reminder_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "audit_periods_organization_id_idx" ON "audit_periods"("organization_id");

-- CreateIndex
CREATE INDEX "evidence_slot_reviews_status_idx" ON "evidence_slot_reviews"("status");

-- CreateIndex
CREATE UNIQUE INDEX "evidence_slot_reviews_audit_period_id_control_id_slot_index_key" ON "evidence_slot_reviews"("audit_period_id", "control_id", "slot_index");

-- CreateIndex
CREATE UNIQUE INDEX "reminder_logs_user_id_kind_sent_on_key" ON "reminder_logs"("user_id", "kind", "sent_on");

-- AddForeignKey
ALTER TABLE "audit_periods" ADD CONSTRAINT "audit_periods_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_periods" ADD CONSTRAINT "audit_periods_framework_id_fkey" FOREIGN KEY ("framework_id") REFERENCES "frameworks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_slot_reviews" ADD CONSTRAINT "evidence_slot_reviews_audit_period_id_fkey" FOREIGN KEY ("audit_period_id") REFERENCES "audit_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_slot_reviews" ADD CONSTRAINT "evidence_slot_reviews_control_id_fkey" FOREIGN KEY ("control_id") REFERENCES "controls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_slot_reviews" ADD CONSTRAINT "evidence_slot_reviews_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence_slot_reviews" ADD CONSTRAINT "evidence_slot_reviews_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_logs" ADD CONSTRAINT "reminder_logs_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reminder_logs" ADD CONSTRAINT "reminder_logs_audit_period_id_fkey" FOREIGN KEY ("audit_period_id") REFERENCES "audit_periods"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Existing evidence: treat the upload date as the period it covers.
UPDATE "evidence" SET "period_start" = "collected_at", "period_end" = "collected_at" WHERE "period_start" IS NULL;
