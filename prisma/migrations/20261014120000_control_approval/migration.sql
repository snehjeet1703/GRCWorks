-- CreateEnum
CREATE TYPE "ControlReviewState" AS ENUM ('NONE', 'PENDING', 'CHANGES_REQUESTED');

-- AlterTable
ALTER TABLE "controls" ADD COLUMN     "review_note" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "review_state" "ControlReviewState" NOT NULL DEFAULT 'NONE',
ADD COLUMN     "review_submitted_at" TIMESTAMP(3),
ADD COLUMN     "review_submitted_by_id" TEXT;

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "control_approval_required" BOOLEAN NOT NULL DEFAULT true;

-- AddForeignKey
ALTER TABLE "controls" ADD CONSTRAINT "controls_review_submitted_by_id_fkey" FOREIGN KEY ("review_submitted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

