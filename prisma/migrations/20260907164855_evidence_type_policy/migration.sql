-- CreateEnum
CREATE TYPE "EvidenceType" AS ENUM ('UPLOAD', 'POLICY');

-- AlterTable
ALTER TABLE "evidence" ADD COLUMN     "policy_id" TEXT,
ADD COLUMN     "type" "EvidenceType" NOT NULL DEFAULT 'UPLOAD';

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
