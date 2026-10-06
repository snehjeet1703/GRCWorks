-- AlterTable: add onboarding flag
ALTER TABLE "organizations" ADD COLUMN "onboarding_complete" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable: company profiles
CREATE TABLE "company_profiles" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "industry" TEXT NOT NULL DEFAULT '',
    "employee_count" INTEGER NOT NULL DEFAULT 0,
    "cloud_provider" TEXT NOT NULL DEFAULT '',
    "critical_apps" INTEGER NOT NULL DEFAULT 0,
    "security_team_size" INTEGER NOT NULL DEFAULT 0,
    "selected_goals" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "company_profiles_organization_id_key" ON "company_profiles"("organization_id");

-- AddForeignKey
ALTER TABLE "company_profiles" ADD CONSTRAINT "company_profiles_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Mark existing orgs as onboarded (they already have data)
UPDATE "organizations" SET "onboarding_complete" = true;
