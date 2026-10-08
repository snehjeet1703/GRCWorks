-- CreateEnum
CREATE TYPE "MfaMethod" AS ENUM ('EMAIL_OTP', 'TOTP', 'WEBAUTHN');

-- CreateEnum
CREATE TYPE "QuestionType" AS ENUM ('TEXT', 'YES_NO', 'SINGLE_CHOICE', 'MULTI_CHOICE', 'RATING', 'FILE_UPLOAD');

-- CreateEnum
CREATE TYPE "QuestionnaireStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ResponseStatus" AS ENUM ('NOT_STARTED', 'IN_PROGRESS', 'SUBMITTED', 'REVIEWED');

-- CreateEnum
CREATE TYPE "TrustDocVisibility" AS ENUM ('PUBLIC', 'ACCESS_REQUIRED');

-- CreateEnum
CREATE TYPE "TrustDocPermission" AS ENUM ('VIEW_ONLY', 'DOWNLOADABLE');

-- CreateEnum
CREATE TYPE "TrustAccessStatus" AS ENUM ('PENDING', 'APPROVED', 'DENIED');

-- AlterTable
ALTER TABLE "findings" ADD COLUMN     "source" TEXT NOT NULL DEFAULT 'MANUAL';

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "mfa_required" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "policies" ADD COLUMN     "reviewed_at" TIMESTAMP(3),
ADD COLUMN     "reviewed_by_id" TEXT,
ALTER COLUMN "version" SET DEFAULT '1.0',
ALTER COLUMN "version" SET DATA TYPE TEXT;

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "mfa_enabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "mfa_method" "MfaMethod",
ADD COLUMN     "recovery_codes" JSONB,
ADD COLUMN     "totp_secret" TEXT,
ADD COLUMN     "totp_verified_at" TIMESTAMP(3),
ALTER COLUMN "password_hash" DROP NOT NULL;

-- CreateTable
CREATE TABLE "webauthn_credentials" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "credential_id" TEXT NOT NULL,
    "public_key" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "device_name" TEXT NOT NULL DEFAULT '',
    "transports" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "webauthn_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mfa_challenges" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "MfaMethod" NOT NULL,
    "code" TEXT,
    "challenge" TEXT,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mfa_challenges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_versions" (
    "id" TEXT NOT NULL,
    "policy_id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL DEFAULT '',
    "status" "PolicyStatus" NOT NULL,
    "approver_id" TEXT,
    "approved_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vendor_questionnaires" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'GENERAL',
    "status" "QuestionnaireStatus" NOT NULL DEFAULT 'DRAFT',
    "questions" JSONB NOT NULL DEFAULT '[]',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "vendor_questionnaires_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "questionnaire_responses" (
    "id" TEXT NOT NULL,
    "questionnaire_id" TEXT NOT NULL,
    "vendor_id" TEXT NOT NULL,
    "status" "ResponseStatus" NOT NULL DEFAULT 'NOT_STARTED',
    "answers" JSONB NOT NULL DEFAULT '[]',
    "submitted_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by" TEXT,
    "review_notes" TEXT NOT NULL DEFAULT '',
    "score" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "questionnaire_responses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trust_vault_configs" (
    "id" TEXT NOT NULL,
    "organization_id" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "hero_title" TEXT NOT NULL DEFAULT '',
    "hero_description" TEXT NOT NULL DEFAULT '',
    "primary_color" TEXT NOT NULL DEFAULT '#6366f1',
    "show_compliance" BOOLEAN NOT NULL DEFAULT true,
    "show_documents" BOOLEAN NOT NULL DEFAULT true,
    "show_controls" BOOLEAN NOT NULL DEFAULT true,
    "show_subprocessors" BOOLEAN NOT NULL DEFAULT true,
    "require_nda" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trust_vault_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trust_compliance_badges" (
    "id" TEXT NOT NULL,
    "config_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "icon_url" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "framework_id" TEXT,

    CONSTRAINT "trust_compliance_badges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trust_vault_documents" (
    "id" TEXT NOT NULL,
    "config_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT 'General',
    "file_name" TEXT NOT NULL,
    "storage_key" TEXT NOT NULL,
    "file_size" INTEGER NOT NULL DEFAULT 0,
    "mime_type" TEXT NOT NULL DEFAULT 'application/octet-stream',
    "visibility" "TrustDocVisibility" NOT NULL DEFAULT 'ACCESS_REQUIRED',
    "permission" "TrustDocPermission" NOT NULL DEFAULT 'VIEW_ONLY',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "version" INTEGER NOT NULL DEFAULT 1,
    "valid_until" TIMESTAMP(3),
    "owner_id" TEXT,
    "previous_version_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trust_vault_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trust_subprocessors" (
    "id" TEXT NOT NULL,
    "config_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "purpose" TEXT NOT NULL DEFAULT '',
    "location" TEXT NOT NULL DEFAULT '',
    "website" TEXT NOT NULL DEFAULT '',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "trust_subprocessors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trust_access_requests" (
    "id" TEXT NOT NULL,
    "config_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT '',
    "company" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "status" "TrustAccessStatus" NOT NULL DEFAULT 'PENDING',
    "access_token" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "reviewed_at" TIMESTAMP(3),
    "reviewed_by" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trust_access_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trust_document_access" (
    "id" TEXT NOT NULL,
    "access_request_id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,

    CONSTRAINT "trust_document_access_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trust_ndas" (
    "id" TEXT NOT NULL,
    "config_id" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Non-Disclosure Agreement',
    "content" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "trust_ndas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trust_nda_acceptances" (
    "id" TEXT NOT NULL,
    "nda_id" TEXT NOT NULL,
    "access_request_id" TEXT NOT NULL,
    "nda_version" INTEGER NOT NULL,
    "accepted_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip_address" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "trust_nda_acceptances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "trust_document_controls" (
    "id" TEXT NOT NULL,
    "document_id" TEXT NOT NULL,
    "control_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "trust_document_controls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "webauthn_credentials_credential_id_key" ON "webauthn_credentials"("credential_id");

-- CreateIndex
CREATE INDEX "webauthn_credentials_user_id_idx" ON "webauthn_credentials"("user_id");

-- CreateIndex
CREATE INDEX "mfa_challenges_user_id_type_idx" ON "mfa_challenges"("user_id", "type");

-- CreateIndex
CREATE INDEX "policy_versions_policy_id_idx" ON "policy_versions"("policy_id");

-- CreateIndex
CREATE INDEX "vendor_questionnaires_organization_id_idx" ON "vendor_questionnaires"("organization_id");

-- CreateIndex
CREATE INDEX "questionnaire_responses_vendor_id_idx" ON "questionnaire_responses"("vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "questionnaire_responses_questionnaire_id_vendor_id_key" ON "questionnaire_responses"("questionnaire_id", "vendor_id");

-- CreateIndex
CREATE UNIQUE INDEX "trust_vault_configs_organization_id_key" ON "trust_vault_configs"("organization_id");

-- CreateIndex
CREATE INDEX "trust_compliance_badges_config_id_idx" ON "trust_compliance_badges"("config_id");

-- CreateIndex
CREATE UNIQUE INDEX "trust_vault_documents_previous_version_id_key" ON "trust_vault_documents"("previous_version_id");

-- CreateIndex
CREATE INDEX "trust_vault_documents_config_id_idx" ON "trust_vault_documents"("config_id");

-- CreateIndex
CREATE INDEX "trust_subprocessors_config_id_idx" ON "trust_subprocessors"("config_id");

-- CreateIndex
CREATE UNIQUE INDEX "trust_access_requests_access_token_key" ON "trust_access_requests"("access_token");

-- CreateIndex
CREATE INDEX "trust_access_requests_config_id_idx" ON "trust_access_requests"("config_id");

-- CreateIndex
CREATE INDEX "trust_access_requests_email_config_id_idx" ON "trust_access_requests"("email", "config_id");

-- CreateIndex
CREATE UNIQUE INDEX "trust_document_access_access_request_id_document_id_key" ON "trust_document_access"("access_request_id", "document_id");

-- CreateIndex
CREATE INDEX "trust_ndas_config_id_idx" ON "trust_ndas"("config_id");

-- CreateIndex
CREATE UNIQUE INDEX "trust_nda_acceptances_nda_id_access_request_id_key" ON "trust_nda_acceptances"("nda_id", "access_request_id");

-- CreateIndex
CREATE INDEX "trust_document_controls_control_id_idx" ON "trust_document_controls"("control_id");

-- CreateIndex
CREATE UNIQUE INDEX "trust_document_controls_document_id_control_id_key" ON "trust_document_controls"("document_id", "control_id");

-- AddForeignKey
ALTER TABLE "webauthn_credentials" ADD CONSTRAINT "webauthn_credentials_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policies" ADD CONSTRAINT "policies_reviewed_by_id_fkey" FOREIGN KEY ("reviewed_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_versions" ADD CONSTRAINT "policy_versions_policy_id_fkey" FOREIGN KEY ("policy_id") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vendor_questionnaires" ADD CONSTRAINT "vendor_questionnaires_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaire_responses" ADD CONSTRAINT "questionnaire_responses_questionnaire_id_fkey" FOREIGN KEY ("questionnaire_id") REFERENCES "vendor_questionnaires"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "questionnaire_responses" ADD CONSTRAINT "questionnaire_responses_vendor_id_fkey" FOREIGN KEY ("vendor_id") REFERENCES "vendors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_vault_configs" ADD CONSTRAINT "trust_vault_configs_organization_id_fkey" FOREIGN KEY ("organization_id") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_compliance_badges" ADD CONSTRAINT "trust_compliance_badges_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "trust_vault_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_vault_documents" ADD CONSTRAINT "trust_vault_documents_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "trust_vault_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_vault_documents" ADD CONSTRAINT "trust_vault_documents_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_vault_documents" ADD CONSTRAINT "trust_vault_documents_previous_version_id_fkey" FOREIGN KEY ("previous_version_id") REFERENCES "trust_vault_documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_subprocessors" ADD CONSTRAINT "trust_subprocessors_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "trust_vault_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_access_requests" ADD CONSTRAINT "trust_access_requests_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "trust_vault_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_document_access" ADD CONSTRAINT "trust_document_access_access_request_id_fkey" FOREIGN KEY ("access_request_id") REFERENCES "trust_access_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_document_access" ADD CONSTRAINT "trust_document_access_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "trust_vault_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_ndas" ADD CONSTRAINT "trust_ndas_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "trust_vault_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_nda_acceptances" ADD CONSTRAINT "trust_nda_acceptances_nda_id_fkey" FOREIGN KEY ("nda_id") REFERENCES "trust_ndas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_nda_acceptances" ADD CONSTRAINT "trust_nda_acceptances_access_request_id_fkey" FOREIGN KEY ("access_request_id") REFERENCES "trust_access_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_document_controls" ADD CONSTRAINT "trust_document_controls_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "trust_vault_documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trust_document_controls" ADD CONSTRAINT "trust_document_controls_control_id_fkey" FOREIGN KEY ("control_id") REFERENCES "controls"("id") ON DELETE CASCADE ON UPDATE CASCADE;

