-- CreateTable
CREATE TABLE "expense_reports" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "reportNumber" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "businessPurpose" TEXT NOT NULL DEFAULT '',
    "reportTo" TEXT NOT NULL DEFAULT '',
    "periodStart" TEXT,
    "periodEnd" TEXT,
    "submittedOn" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "expense_lines" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "date" TEXT,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "description" TEXT NOT NULL DEFAULT '',
    "merchant" TEXT NOT NULL DEFAULT '',
    "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "receiptData" TEXT NOT NULL DEFAULT '',
    "receiptFilename" TEXT NOT NULL DEFAULT '',
    "ocrText" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expense_reports_organizationId_status_idx" ON "expense_reports"("organizationId", "status");

-- CreateIndex
CREATE INDEX "expense_reports_personId_idx" ON "expense_reports"("personId");

-- CreateIndex
CREATE UNIQUE INDEX "expense_reports_organizationId_reportNumber_key" ON "expense_reports"("organizationId", "reportNumber");

-- CreateIndex
CREATE INDEX "expense_lines_reportId_idx" ON "expense_lines"("reportId");

-- AddForeignKey
ALTER TABLE "expense_reports" ADD CONSTRAINT "expense_reports_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expense_lines" ADD CONSTRAINT "expense_lines_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "expense_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;
