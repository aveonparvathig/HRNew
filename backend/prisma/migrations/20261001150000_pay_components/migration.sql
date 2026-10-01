-- CreateTable
CREATE TABLE "pay_components" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "taxable" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pay_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payslip_lines" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "remarks" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "payslip_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "salary_revisions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "effectiveFrom" TEXT NOT NULL,
    "oldMonthlyPackage" DOUBLE PRECISION NOT NULL,
    "newMonthlyPackage" DOUBLE PRECISION NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdByName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "salary_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pay_components_organizationId_code_key" ON "pay_components"("organizationId", "code");

-- CreateIndex
CREATE INDEX "payslip_lines_organizationId_idx" ON "payslip_lines"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "payslip_lines_entryId_componentId_key" ON "payslip_lines"("entryId", "componentId");

-- CreateIndex
CREATE INDEX "salary_revisions_organizationId_personId_idx" ON "salary_revisions"("organizationId", "personId");

-- AddForeignKey
ALTER TABLE "payslip_lines" ADD CONSTRAINT "payslip_lines_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "payslip_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payslip_lines" ADD CONSTRAINT "payslip_lines_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "pay_components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "salary_revisions" ADD CONSTRAINT "salary_revisions_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

