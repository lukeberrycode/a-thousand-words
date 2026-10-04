-- Boxes become their own table, and each annotation belongs to one (ADR 0011).
-- Every existing annotation gets its own region, with the same id, author and box.

-- CreateTable
CREATE TABLE "Region" (
    "id" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "x" DOUBLE PRECISION NOT NULL,
    "y" DOUBLE PRECISION NOT NULL,
    "w" DOUBLE PRECISION NOT NULL,
    "h" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Region_pkey" PRIMARY KEY ("id")
);

-- Copy each annotation's box into a region
INSERT INTO "Region" ("id", "imageId", "authorId", "x", "y", "w", "h", "createdAt", "updatedAt")
SELECT "id", "imageId", "authorId", "x", "y", "w", "h", "createdAt", "updatedAt" FROM "Annotation";

-- Link each annotation to its region
ALTER TABLE "Annotation" ADD COLUMN "regionId" TEXT;
UPDATE "Annotation" SET "regionId" = "id";
ALTER TABLE "Annotation" ALTER COLUMN "regionId" SET NOT NULL;

-- DropForeignKey
ALTER TABLE "Annotation" DROP CONSTRAINT "Annotation_imageId_fkey";

-- DropIndex
DROP INDEX "Annotation_imageId_idx";

-- AlterTable
ALTER TABLE "Annotation" DROP COLUMN "h",
DROP COLUMN "imageId",
DROP COLUMN "w",
DROP COLUMN "x",
DROP COLUMN "y";

-- CreateIndex
CREATE INDEX "Region_imageId_idx" ON "Region"("imageId");

-- CreateIndex
CREATE UNIQUE INDEX "Annotation_regionId_authorId_key" ON "Annotation"("regionId", "authorId");

-- AddForeignKey
ALTER TABLE "Region" ADD CONSTRAINT "Region_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "Image"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Region" ADD CONSTRAINT "Region_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_regionId_fkey" FOREIGN KEY ("regionId") REFERENCES "Region"("id") ON DELETE CASCADE ON UPDATE CASCADE;
