-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "lab_course_id" TEXT,
ADD COLUMN     "lab_template" TEXT,
ADD COLUMN     "practice" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "can_sign_in" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "lab_signups" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "code_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_signups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_task_completions" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "lab_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_task_completions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lab_signups_email_key" ON "lab_signups"("email");

-- CreateIndex
CREATE UNIQUE INDEX "lab_task_completions_organization_id_course_id_lab_id_task__key" ON "lab_task_completions"("organization_id", "course_id", "lab_id", "task_id");

-- AddForeignKey
ALTER TABLE "lab_task_completions" ADD CONSTRAINT "lab_task_completions_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

