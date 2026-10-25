-- CreateTable
CREATE TABLE "lab_exercise_attempts" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "lab_id" TEXT NOT NULL,
    "task_id" TEXT NOT NULL,
    "flags" JSONB NOT NULL DEFAULT '{}',
    "found" INTEGER NOT NULL,
    "planted" INTEGER NOT NULL,
    "false_alarms" INTEGER NOT NULL,
    "passed" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_exercise_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lab_exercise_attempts_organization_id_lab_id_task_id_idx" ON "lab_exercise_attempts"("organization_id", "lab_id", "task_id");

-- AddForeignKey
ALTER TABLE "lab_exercise_attempts" ADD CONSTRAINT "lab_exercise_attempts_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

