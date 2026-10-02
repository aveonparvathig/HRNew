-- AlterTable
ALTER TABLE "employee_documents" ADD COLUMN     "storage" TEXT NOT NULL DEFAULT 'DB',
ADD COLUMN     "storageKey" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "fileData" SET DEFAULT '';

-- CreateTable
CREATE TABLE "storage_settings" (
    "organizationId" TEXT NOT NULL,
    "provider" TEXT NOT NULL DEFAULT 'DB',
    "endpoint" TEXT NOT NULL DEFAULT '',
    "region" TEXT NOT NULL DEFAULT '',
    "bucket" TEXT NOT NULL DEFAULT '',
    "accessKeyId" TEXT NOT NULL DEFAULT '',
    "secretEnc" TEXT NOT NULL DEFAULT '',
    "prefix" TEXT NOT NULL DEFAULT '',
    "forcePathStyle" BOOLEAN NOT NULL DEFAULT false,
    "updatedByName" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "storage_settings_pkey" PRIMARY KEY ("organizationId")
);

