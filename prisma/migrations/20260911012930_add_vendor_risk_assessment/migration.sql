-- CreateEnum
CREATE TYPE "VendorStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'ONBOARDING', 'OFFBOARDING', 'UNDER_REVIEW');

-- CreateEnum
CREATE TYPE "VendorCriticality" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "VendorCategory" AS ENUM ('CLOUD_INFRASTRUCTURE', 'SAAS', 'DATA_PROCESSOR', 'PROFESSIONAL_SERVICES', 'IT_SUPPORT', 'SECURITY', 'HR', 'FINANCE', 'LEGAL', 'OTHER');

-- CreateEnum
CREATE TYPE "AssessmentStatus" AS ENUM ('DRAFT', 'IN_PROGRESS', 'COMPLETED', 'EXPIRED');

-- CreateTable
CREATE TABLE "vendors" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "category" "VendorCategory" NOT NULL DEFAULT 'OTHER',
    "status" "VendorStatus" NOT NULL DEFAULT 'ONBOARDING',
    "criticality" "VendorCriticality" NOT NULL DEFAULT 'MEDIUM',
    "contact_name" TEXT NOT NULL DEFAULT '',
    "contact_email" TEXT NOT NULL DEFAULT '',
    "contract_start" TIMESTAMP(3),
    "contract_end" TIMESTAMP(3),
    "data_access" BOOLEAN NOT NULL DEFAULT false,
    "data_types" TEXT NOT NULL DEFAULT '',
    "risk_score" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_assessments" (
    "id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "assessor_name" TEXT NOT NULL DEFAULT '',
    "status" "AssessmentStatus" NOT NULL DEFAULT 'DRAFT',
    "assessment_date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "next_review_date" TIMESTAMP(3),
    "overall_score" INTEGER NOT NULL DEFAULT 0,
    "security_score" INTEGER NOT NULL DEFAULT 0,
    "compliance_score" INTEGER NOT NULL DEFAULT 0,
    "operational_score" INTEGER NOT NULL DEFAULT 0,
    "financial_score" INTEGER NOT NULL DEFAULT 0,
    "findings" TEXT NOT NULL DEFAULT '',
    "recommendations" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_assessments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "vendors_organization_id_idx" ON "vendors"("organization_id");

-- CreateIndex
CREATE INDEX "vendors_status_idx" ON "vendors"("status");

-- CreateIndex
CREATE INDEX "vendor_assessments_vendor_id_idx" ON "vendor_assessments"("vendor_id");

-- AddForeignKey
ALTER TABLE "vendors" ADD CONSTRAINT "vendors_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_assessments" ADD CONSTRAINT "vendor_assessments_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;
