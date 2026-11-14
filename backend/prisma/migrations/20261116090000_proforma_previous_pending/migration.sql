-- AlterTable: carry-forward from earlier periods, printed as "Previous Pending" (no GST)
ALTER TABLE "proforma_invoices" ADD COLUMN "previousPending" DOUBLE PRECISION NOT NULL DEFAULT 0;
