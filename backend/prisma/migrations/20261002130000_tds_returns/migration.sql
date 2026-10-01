-- AlterTable
ALTER TABLE "payroll_settings" ADD COLUMN     "form12baName" TEXT NOT NULL DEFAULT 'Form 12BA',
ADD COLUMN     "form16Name" TEXT NOT NULL DEFAULT 'Form 16',
ADD COLUMN     "form24qName" TEXT NOT NULL DEFAULT 'Form 24Q';

-- AlterTable
ALTER TABLE "tax_year_controls" ADD COLUMN     "form16Released" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "tds_challans" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "fyStart" INTEGER NOT NULL,
    "quarter" INTEGER NOT NULL,
    "bsrCode" TEXT NOT NULL,
    "challanSerial" TEXT NOT NULL,
    "depositedOn" TEXT NOT NULL,
    "tds" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "surcharge" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cess" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "interest" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fee" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "others" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "minorHead" TEXT NOT NULL DEFAULT '200',
    "remarks" TEXT NOT NULL DEFAULT '',
    "createdByName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tds_challans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tds_challan_allocations" (
    "id" TEXT NOT NULL,
    "challanId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "tds_challan_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "form16_part_a" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "fyStart" INTEGER NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileData" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "form16_part_a_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tds_challans_organizationId_fyStart_quarter_idx" ON "tds_challans"("organizationId", "fyStart", "quarter");

-- CreateIndex
CREATE INDEX "tds_challan_allocations_entryId_idx" ON "tds_challan_allocations"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "tds_challan_allocations_challanId_entryId_key" ON "tds_challan_allocations"("challanId", "entryId");

-- CreateIndex
CREATE INDEX "form16_part_a_organizationId_fyStart_idx" ON "form16_part_a"("organizationId", "fyStart");

-- CreateIndex
CREATE UNIQUE INDEX "form16_part_a_personId_fyStart_key" ON "form16_part_a"("personId", "fyStart");

-- AddForeignKey
ALTER TABLE "tds_challan_allocations" ADD CONSTRAINT "tds_challan_allocations_challanId_fkey" FOREIGN KEY ("challanId") REFERENCES "tds_challans"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tds_challan_allocations" ADD CONSTRAINT "tds_challan_allocations_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "payslip_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "form16_part_a" ADD CONSTRAINT "form16_part_a_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

