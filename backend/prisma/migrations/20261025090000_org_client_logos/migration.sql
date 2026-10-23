-- Custom client logos for proposals, stored per organization as [{ name, logoUri }].
ALTER TABLE "Organization" ADD COLUMN "clientLogos" JSONB NOT NULL DEFAULT '[]';
