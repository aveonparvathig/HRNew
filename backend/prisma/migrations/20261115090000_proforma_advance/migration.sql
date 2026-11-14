-- AlterTable: advance already received, printed as "Advance Received" + "Balance Due"
ALTER TABLE "proforma_invoices" ADD COLUMN "advanceReceived" DOUBLE PRECISION NOT NULL DEFAULT 0;
