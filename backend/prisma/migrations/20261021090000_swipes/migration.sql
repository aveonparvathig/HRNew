-- CreateTable
CREATE TABLE "swipes" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "direction" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "deviceId" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "swipes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "swipes_organizationId_personId_date_idx" ON "swipes"("organizationId", "personId", "date");

-- CreateIndex
CREATE INDEX "swipes_organizationId_date_idx" ON "swipes"("organizationId", "date");

-- AddForeignKey
ALTER TABLE "swipes" ADD CONSTRAINT "swipes_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

