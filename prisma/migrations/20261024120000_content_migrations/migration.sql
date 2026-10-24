-- AlterTable
ALTER TABLE "Image" ADD COLUMN     "contentKey" TEXT;

-- AlterTable
ALTER TABLE "Region" ADD COLUMN     "contentKey" TEXT;

-- CreateTable
CREATE TABLE "ContentMigration" (
    "name" TEXT NOT NULL,
    "checksum" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "summary" JSONB NOT NULL,

    CONSTRAINT "ContentMigration_pkey" PRIMARY KEY ("name")
);

-- CreateIndex
CREATE UNIQUE INDEX "Image_contentKey_key" ON "Image"("contentKey");

-- CreateIndex
CREATE UNIQUE INDEX "Region_contentKey_key" ON "Region"("contentKey");

