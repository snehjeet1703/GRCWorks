-- AlterTable
ALTER TABLE "questionnaire_responses" ADD COLUMN     "contact_email" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "invite_expires_at" TIMESTAMP(3),
ADD COLUMN     "invite_token_hash" TEXT,
ADD COLUMN     "otp_attempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "otp_expires_at" TIMESTAMP(3),
ADD COLUMN     "otp_hash" TEXT;

-- CreateTable
CREATE TABLE "vendor_response_files" (
    "id" TEXT NOT NULL,
    "response_id" TEXT NOT NULL,
    "question_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL,
    "mime_type" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vendor_response_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendor_response_files_response_id_idx" ON "vendor_response_files"("response_id");

-- CreateIndex
CREATE UNIQUE INDEX "questionnaire_responses_invite_token_hash_key" ON "questionnaire_responses"("invite_token_hash");

-- AddForeignKey
ALTER TABLE "vendor_response_files" ADD CONSTRAINT "vendor_response_files_response_id_fkey" FOREIGN KEY ("response_id") REFERENCES "questionnaire_responses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

