-- CreateTable
CREATE TABLE "person_documents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "formData" JSONB NOT NULL DEFAULT '{}',
    "html" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "person_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "person_documents_personId_docType_idx" ON "person_documents"("personId", "docType");

-- AddForeignKey
ALTER TABLE "person_documents" ADD CONSTRAINT "person_documents_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;
