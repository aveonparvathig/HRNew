-- AlterTable
ALTER TABLE "people" ADD COLUMN     "grade" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "position_changes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "effectiveFrom" TEXT NOT NULL,
    "designation" TEXT NOT NULL DEFAULT '',
    "department" TEXT NOT NULL DEFAULT '',
    "workLocationId" TEXT,
    "grade" TEXT NOT NULL DEFAULT '',
    "reason" TEXT NOT NULL DEFAULT '',
    "remarks" TEXT NOT NULL DEFAULT '',
    "enteredByName" TEXT NOT NULL DEFAULT '',
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "position_changes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "position_changes_organizationId_appliedAt_idx" ON "position_changes"("organizationId", "appliedAt");

-- CreateIndex
CREATE UNIQUE INDEX "position_changes_personId_effectiveFrom_key" ON "position_changes"("personId", "effectiveFrom");

-- AddForeignKey
ALTER TABLE "position_changes" ADD CONSTRAINT "position_changes_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "position_changes" ADD CONSTRAINT "position_changes_workLocationId_fkey" FOREIGN KEY ("workLocationId") REFERENCES "work_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Every employee starts with one record: the position they hold today,
-- dated at their joining date (or the day their record was made when no
-- joining date is on file). Nothing printed changes: with only this
-- record, every month reads the same designation and department as before.
INSERT INTO "position_changes" ("id", "organizationId", "personId", "effectiveFrom", "designation", "department",
  "workLocationId", "grade", "reason", "enteredByName", "appliedAt", "createdAt", "updatedAt")
SELECT 'pos_' || p."id", p."organizationId", p."id",
  CASE WHEN p."joinDate" ~ '^\d{4}-\d{2}-\d{2}$' THEN p."joinDate"
       ELSE to_char((p."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD') END,
  p."designation", p."department", p."workLocationId", p."grade", 'STARTING', 'Starting record',
  CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "people" p
WHERE p."isEmployee" = true;
