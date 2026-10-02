-- DropIndex
DROP INDEX "pt_policies_organizationId_state_effectiveFrom_key";

-- AlterTable
ALTER TABLE "pt_policies" ADD COLUMN     "locality" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "work_locations" ADD COLUMN     "excludeFromPt" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "pt_policies_organizationId_state_locality_effectiveFrom_key" ON "pt_policies"("organizationId", "state", "locality", "effectiveFrom");

