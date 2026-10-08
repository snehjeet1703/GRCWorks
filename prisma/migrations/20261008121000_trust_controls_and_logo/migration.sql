-- AlterTable
ALTER TABLE "trust_vault_configs" ADD COLUMN     "logo_mime_type" TEXT,
ADD COLUMN     "logo_storage_key" TEXT;

-- CreateTable
CREATE TABLE "trust_controls" (
    "id" TEXT NOT NULL,
    "config_id" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "sort_order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "trust_controls_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "trust_controls_config_id_idx" ON "trust_controls"("config_id");

-- AddForeignKey
ALTER TABLE "trust_controls" ADD CONSTRAINT "trust_controls_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "trust_vault_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

