-- Track who generated each proposal so the MARKETING role can be scoped
-- to their own records. Existing rows stay NULL (admin-visible only).
ALTER TABLE "proposal_records" ADD COLUMN "createdById" TEXT;

ALTER TABLE "proposal_records" ADD CONSTRAINT "proposal_records_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
