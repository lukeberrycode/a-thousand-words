-- AlterTable
ALTER TABLE "User" ADD COLUMN     "approvedAt" TIMESTAMP(3);

-- Accounts that existed before approval was introduced keep their access.
UPDATE "User" SET "approvedAt" = CURRENT_TIMESTAMP;
