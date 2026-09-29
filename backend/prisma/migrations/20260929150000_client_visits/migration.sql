-- Client visit attendance log: engineer, date, time in/out, work done,
-- whom they met and the next follow-up.
CREATE TABLE "client_visits" (
  "id" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "clientId" TEXT NOT NULL,
  "engineerName" TEXT NOT NULL DEFAULT '',
  "visitDate" TEXT NOT NULL,
  "timeIn" TEXT NOT NULL DEFAULT '',
  "timeOut" TEXT NOT NULL DEFAULT '',
  "workDone" TEXT NOT NULL DEFAULT '',
  "metPersons" TEXT NOT NULL DEFAULT '',
  "followupNote" TEXT NOT NULL DEFAULT '',
  "followupDate" TEXT,
  "createdById" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "client_visits_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "client_visits_organizationId_visitDate_idx" ON "client_visits"("organizationId", "visitDate");
CREATE INDEX "client_visits_clientId_idx" ON "client_visits"("clientId");

ALTER TABLE "client_visits" ADD CONSTRAINT "client_visits_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "income_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "client_visits" ADD CONSTRAINT "client_visits_createdById_fkey"
  FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
