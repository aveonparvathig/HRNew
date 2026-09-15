-- CreateTable
CREATE TABLE "proposal_records" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "selectionLabel" TEXT NOT NULL DEFAULT '',
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "formData" JSONB NOT NULL DEFAULT '{}',
    "html" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proposal_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "proposal_records_organizationId_clientName_idx" ON "proposal_records"("organizationId", "clientName");

-- AddForeignKey
ALTER TABLE "proposal_records" ADD CONSTRAINT "proposal_records_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
