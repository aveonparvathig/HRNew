-- AlterTable
ALTER TABLE "person_documents" ADD COLUMN     "createdByName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "templateId" TEXT,
ADD COLUMN     "visibleToEmployee" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "letter_templates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "audience" TEXT NOT NULL DEFAULT 'CANDIDATE',
    "subject" TEXT NOT NULL DEFAULT '',
    "salutation" TEXT NOT NULL DEFAULT '',
    "body" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "updatedByName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "letter_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "employee_documents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "documentDate" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "fileData" TEXT NOT NULL,
    "visibleToEmployee" BOOLEAN NOT NULL DEFAULT false,
    "uploadedByName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "employee_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "letter_templates_organizationId_code_key" ON "letter_templates"("organizationId", "code");

-- CreateIndex
CREATE INDEX "employee_documents_organizationId_personId_idx" ON "employee_documents"("organizationId", "personId");

-- AddForeignKey
ALTER TABLE "employee_documents" ADD CONSTRAINT "employee_documents_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

