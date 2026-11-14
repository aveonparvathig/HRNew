-- CreateTable
CREATE TABLE "proforma_invoices" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "billingId" TEXT,
    "number" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "periodLabel" TEXT NOT NULL DEFAULT '',
    "invoiceDate" TEXT NOT NULL,
    "lineDescription" TEXT NOT NULL,
    "taxableValue" DOUBLE PRECISION NOT NULL,
    "gstAmount" DOUBLE PRECISION NOT NULL,
    "oneTimePayment" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "oneTimeGst" BOOLEAN NOT NULL DEFAULT false,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "html" TEXT NOT NULL,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "proforma_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "proforma_invoices_organizationId_number_key" ON "proforma_invoices"("organizationId", "number");

-- CreateIndex
CREATE INDEX "proforma_invoices_organizationId_clientId_idx" ON "proforma_invoices"("organizationId", "clientId");

-- CreateIndex
CREATE INDEX "proforma_invoices_organizationId_academicYear_idx" ON "proforma_invoices"("organizationId", "academicYear");

-- AddForeignKey
ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "income_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_billingId_fkey" FOREIGN KEY ("billingId") REFERENCES "client_billings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
