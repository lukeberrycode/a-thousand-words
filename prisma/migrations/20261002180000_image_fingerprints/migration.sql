-- AlterTable
ALTER TABLE "Image" ADD COLUMN     "phash" BIGINT,
ADD COLUMN     "sha256" TEXT;

-- CreateIndex
CREATE INDEX "Image_sha256_idx" ON "Image"("sha256");

