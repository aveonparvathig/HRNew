-- Proforma v2: PRO/<FY>/NNN numbering, multi-period line items, CGST/SGST vs
-- IGST, and the GST details the document prints. Upgrades the single-period
-- table from 20261114090000_proforma_invoices; issued invoices are kept
-- (their frozen html is unchanged, so reprints stay byte-identical).

-- AlterTable: supplier GST details + proforma numbering floor
ALTER TABLE "organizations" ADD COLUMN "pincode" TEXT NOT NULL DEFAULT '',
ADD COLUMN "gstin" TEXT NOT NULL DEFAULT '',
ADD COLUMN "proformaSeqFloor" JSONB NOT NULL DEFAULT '{}';

-- AlterTable: buyer GST details
ALTER TABLE "client_onboardings" ADD COLUMN "state" TEXT NOT NULL DEFAULT '',
ADD COLUMN "pincode" TEXT NOT NULL DEFAULT '',
ADD COLUMN "gstin" TEXT NOT NULL DEFAULT '';

-- New table shape
CREATE TABLE "proforma_invoices_next" (
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

    CONSTRAINT "proforma_invoices_next_pkey" PRIMARY KEY ("id")
);

-- Carry over invoices issued by v1: one subscription line (+ the one-time fee
-- line when there was one), the financial year from the invoice date, and
-- GST split evenly into CGST + SGST (v1 never charged IGST).
INSERT INTO "proforma_invoices_next" (
    "id", "organizationId", "clientId", "billingIds", "number", "fiscalYear",
    "invoiceDate", "validUntil", "placeOfSupply", "taxType", "lines",
    "subtotal", "cgst", "sgst", "igst", "totalAmount", "html", "createdById", "createdAt"
)
SELECT
    p."id", p."organizationId", p."clientId",
    CASE WHEN p."billingId" IS NULL THEN ARRAY[]::TEXT[] ELSE ARRAY[p."billingId"] END,
    p."number",
    fy.start_year || '-' || LPAD(((fy.start_year + 1) % 100)::TEXT, 2, '0'),
    p."invoiceDate", p."invoiceDate", '', 'CGST_SGST',
    jsonb_build_array(jsonb_build_object(
        'billingId', p."billingId", 'description', p."lineDescription", 'detail', p."periodLabel",
        'hsn', '998311', 'qty', 1, 'rate', p."taxableValue", 'taxable', p."taxableValue",
        'gstRate', 18, 'gst', p."gstAmount" - ot.gst,
        'total', p."taxableValue" + p."gstAmount" - ot.gst
    )) || CASE WHEN p."oneTimePayment" > 0 THEN jsonb_build_array(jsonb_build_object(
        'billingId', NULL, 'description', 'One-time fee', 'detail', '',
        'hsn', '998311', 'qty', 1, 'rate', p."oneTimePayment", 'taxable', p."oneTimePayment",
        'gstRate', CASE WHEN p."oneTimeGst" THEN 18 ELSE 0 END, 'gst', ot.gst,
        'total', p."oneTimePayment" + ot.gst
    )) ELSE '[]'::JSONB END,
    p."taxableValue" + p."oneTimePayment",
    ROUND((p."gstAmount" / 2)::NUMERIC, 2)::DOUBLE PRECISION,
    p."gstAmount" - ROUND((p."gstAmount" / 2)::NUMERIC, 2)::DOUBLE PRECISION,
    0,
    p."totalAmount", p."html", p."createdById", p."createdAt"
FROM "proforma_invoices" p
CROSS JOIN LATERAL (
    SELECT CASE WHEN SUBSTRING(p."invoiceDate", 6, 2)::INT >= 4
        THEN SUBSTRING(p."invoiceDate", 1, 4)::INT
        ELSE SUBSTRING(p."invoiceDate", 1, 4)::INT - 1 END AS start_year
) fy
CROSS JOIN LATERAL (
    SELECT CASE WHEN p."oneTimeGst" AND p."oneTimePayment" > 0
        THEN ROUND((p."oneTimePayment" * 0.18)::NUMERIC, 2)::DOUBLE PRECISION
        ELSE 0 END AS gst
) ot;

-- Swap the tables (dropping v1 also drops its indexes and foreign keys)
DROP TABLE "proforma_invoices";
ALTER TABLE "proforma_invoices_next" RENAME TO "proforma_invoices";
ALTER TABLE "proforma_invoices" RENAME CONSTRAINT "proforma_invoices_next_pkey" TO "proforma_invoices_pkey";

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
