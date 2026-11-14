-- AlterTable: supplier GST details + proforma numbering floor
ALTER TABLE "organizations" ADD COLUMN "pincode" TEXT NOT NULL DEFAULT '',
ADD COLUMN "gstin" TEXT NOT NULL DEFAULT '',
ADD COLUMN "proformaSeqFloor" JSONB NOT NULL DEFAULT '{}';

-- AlterTable: buyer GST details
ALTER TABLE "client_onboardings" ADD COLUMN "state" TEXT NOT NULL DEFAULT '',
ADD COLUMN "pincode" TEXT NOT NULL DEFAULT '',
ADD COLUMN "gstin" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "proforma_invoices" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "billingIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "number" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "invoiceDate" TEXT NOT NULL,
    "validUntil" TEXT NOT NULL,
    "placeOfSupply" TEXT NOT NULL DEFAULT '',
    "taxType" TEXT NOT NULL DEFAULT 'CGST_SGST',
    "lines" JSONB NOT NULL DEFAULT '[]',
    "subtotal" DOUBLE PRECISION NOT NULL,
    "cgst" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sgst" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "igst" DOUBLE PRECISION NOT NULL DEFAULT 0,
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
CREATE INDEX "proforma_invoices_organizationId_fiscalYear_idx" ON "proforma_invoices"("organizationId", "fiscalYear");

-- AddForeignKey
ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "proforma_invoices" ADD CONSTRAINT "proforma_invoices_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "income_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
