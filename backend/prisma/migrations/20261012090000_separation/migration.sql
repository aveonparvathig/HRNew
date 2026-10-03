-- CreateTable
CREATE TABLE "separations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "mode" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SUBMITTED',
    "submittedOn" TEXT,
    "reason" TEXT NOT NULL DEFAULT '',
    "noticeDays" INTEGER,
    "noticeLastDay" TEXT,
    "agreedLastDay" TEXT,
    "noticeShortfallDays" INTEGER NOT NULL DEFAULT 0,
    "noticeWaived" BOOLEAN NOT NULL DEFAULT false,
    "remarks" TEXT NOT NULL DEFAULT '',
    "relievedOn" TEXT,
    "assetsReturned" BOOLEAN NOT NULL DEFAULT false,
    "accessRevoked" BOOLEAN NOT NULL DEFAULT false,
    "handoverDone" BOOLEAN NOT NULL DEFAULT false,
    "exitInterviewDone" BOOLEAN NOT NULL DEFAULT false,
    "fitToRehire" TEXT NOT NULL DEFAULT '',
    "acceptedByName" TEXT NOT NULL DEFAULT '',
    "relievedByName" TEXT NOT NULL DEFAULT '',
    "createdByName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "separations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "separations_personId_key" ON "separations"("personId");

-- CreateIndex
CREATE INDEX "separations_organizationId_status_idx" ON "separations"("organizationId", "status");

-- AddForeignKey
ALTER TABLE "separations" ADD CONSTRAINT "separations_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

