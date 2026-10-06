-- CreateEnum
CREATE TYPE "TestResult" AS ENUM ('PASS', 'FAIL', 'NOT_TESTED');

-- CreateTable
CREATE TABLE "control_tests" (
    "id" TEXT NOT NULL,
    "control_id" TEXT NOT NULL,
    "tester_id" TEXT,
    "result" "TestResult" NOT NULL DEFAULT 'NOT_TESTED',
    "test_date" TIMESTAMP(3) NOT NULL,
    "next_due_date" TIMESTAMP(3),
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "control_tests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "control_tests_control_id_idx" ON "control_tests"("control_id");

-- CreateIndex
CREATE INDEX "control_tests_next_due_date_idx" ON "control_tests"("next_due_date");

-- AddForeignKey
ALTER TABLE "control_tests" ADD CONSTRAINT "control_tests_control_id_fkey" FOREIGN KEY ("control_id") REFERENCES "controls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "control_tests" ADD CONSTRAINT "control_tests_tester_id_fkey" FOREIGN KEY ("tester_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
