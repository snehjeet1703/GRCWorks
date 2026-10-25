-- CreateTable
CREATE TABLE "lab_access" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "team_code_id" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "lab_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_access_codes" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "months" INTEGER NOT NULL,
    "seats" INTEGER NOT NULL DEFAULT 1,
    "used" INTEGER NOT NULL DEFAULT 0,
    "redeem_by" TIMESTAMP(3),
    "buyer" TEXT NOT NULL DEFAULT '',
    "manager_email" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "disabled" BOOLEAN NOT NULL DEFAULT false,
    "created_by" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_access_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_redemptions" (
    "id" TEXT NOT NULL,
    "code_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "redeemed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_redemptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lab_certificates" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "course_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "course" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "level" TEXT NOT NULL,
    "issued_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lab_certificates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "lab_access_user_id_key" ON "lab_access"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "lab_access_codes_code_key" ON "lab_access_codes"("code");

-- CreateIndex
CREATE UNIQUE INDEX "lab_redemptions_code_id_user_id_key" ON "lab_redemptions"("code_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "lab_certificates_user_id_course_id_level_key" ON "lab_certificates"("user_id", "course_id", "level");

-- AddForeignKey
ALTER TABLE "lab_access" ADD CONSTRAINT "lab_access_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_redemptions" ADD CONSTRAINT "lab_redemptions_code_id_fkey" FOREIGN KEY ("code_id") REFERENCES "lab_access_codes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_redemptions" ADD CONSTRAINT "lab_redemptions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lab_certificates" ADD CONSTRAINT "lab_certificates_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

