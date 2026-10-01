-- AlterTable
ALTER TABLE "employee_tax_profiles" DROP COLUMN "otherDeductions",
DROP COLUMN "section80C",
ADD COLUMN     "housingInterestApproved" DOUBLE PRECISION,
ADD COLUMN     "landlordName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "landlordPan" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "poiConsidered" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "rentApproved" DOUBLE PRECISION,
ADD COLUMN     "submittedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "payroll_runs" ADD COLUMN     "releasedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "declaration_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "sectionNew" TEXT NOT NULL DEFAULT '',
    "group" TEXT NOT NULL,
    "maxAmount" DOUBLE PRECISION,
    "deductPercent" DOUBLE PRECISION NOT NULL DEFAULT 100,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "declaration_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "declaration_lines" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "declaredAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "approvedAmount" DOUBLE PRECISION,
    "remarks" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "declaration_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "declaration_proofs" (
    "id" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "itemId" TEXT,
    "fileName" TEXT NOT NULL,
    "fileData" TEXT NOT NULL,
    "uploadedBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "declaration_proofs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tax_year_controls" (
    "organizationId" TEXT NOT NULL,
    "fyStart" INTEGER NOT NULL,
    "declarationOpen" BOOLEAN NOT NULL DEFAULT false,
    "proofOpen" BOOLEAN NOT NULL DEFAULT false,
    "employeeCanChooseRegime" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_year_controls_pkey" PRIMARY KEY ("organizationId","fyStart")
);

-- CreateIndex
CREATE UNIQUE INDEX "declaration_items_organizationId_code_key" ON "declaration_items"("organizationId", "code");

-- CreateIndex
CREATE UNIQUE INDEX "declaration_lines_profileId_itemId_key" ON "declaration_lines"("profileId", "itemId");

-- CreateIndex
CREATE INDEX "declaration_proofs_profileId_idx" ON "declaration_proofs"("profileId");

-- AddForeignKey
ALTER TABLE "declaration_lines" ADD CONSTRAINT "declaration_lines_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "employee_tax_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declaration_lines" ADD CONSTRAINT "declaration_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "declaration_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "declaration_proofs" ADD CONSTRAINT "declaration_proofs_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "employee_tax_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

