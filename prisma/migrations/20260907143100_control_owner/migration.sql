-- AlterTable
ALTER TABLE "controls" ADD COLUMN     "owner_id" TEXT;

-- AddForeignKey
ALTER TABLE "controls" ADD CONSTRAINT "controls_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
