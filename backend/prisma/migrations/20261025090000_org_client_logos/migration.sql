-- Custom client logos for proposals, stored per organization as [{ name, logoUri }].
-- Table is mapped to "organizations"; IF NOT EXISTS keeps it idempotent on re-apply.
ALTER TABLE "organizations" ADD COLUMN IF NOT EXISTS "clientLogos" JSONB NOT NULL DEFAULT '[]';
