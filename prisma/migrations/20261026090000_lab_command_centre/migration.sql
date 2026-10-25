-- CreateTable
CREATE TABLE "lab_settings" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "pricing_text" TEXT NOT NULL DEFAULT '',
    "payment_text" TEXT NOT NULL DEFAULT '',
    "upi_id" TEXT NOT NULL DEFAULT '',
    "free_labs" JSONB NOT NULL DEFAULT '{}',
    "default_months" INTEGER NOT NULL DEFAULT 12,
    "signup_open" BOOLEAN NOT NULL DEFAULT true,
    "admins" JSONB NOT NULL DEFAULT '[]',
    "updated_by" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lab_settings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_access_requests" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "amount" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "decided_by" TEXT,
    "decided_at" TIMESTAMP(3),
    "decision_note" TEXT NOT NULL DEFAULT '',
    "months" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_access_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "lab_access_requests_status_idx" ON "lab_access_requests"("status");

-- AddForeignKey
ALTER TABLE "lab_access_requests" ADD CONSTRAINT "lab_access_requests_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

