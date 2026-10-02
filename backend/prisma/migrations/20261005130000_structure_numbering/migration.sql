-- AlterTable
ALTER TABLE "payout_batches" ADD COLUMN     "batchRef" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "payroll_settings" ADD COLUMN     "jvSplitBy" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "payslip_entries" ADD COLUMN     "structureName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "structureSplit" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "settlements" ADD COLUMN     "settlementNo" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "structure_templates" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "basicPercentOfPackage" DOUBLE PRECISION NOT NULL,
    "daPercentOfBasic" DOUBLE PRECISION NOT NULL,
    "hraPercentOfBasic" DOUBLE PRECISION NOT NULL,
    "transportPercentOfBasic" DOUBLE PRECISION NOT NULL,
    "foodPercentOfBasic" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "structure_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "structure_assignments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,

    CONSTRAINT "structure_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "recurring_components" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "componentId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "fromPeriod" TEXT NOT NULL,
    "toPeriod" TEXT NOT NULL DEFAULT '',
    "prorate" BOOLEAN NOT NULL DEFAULT true,
    "remarks" TEXT NOT NULL DEFAULT '',
    "createdByName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "recurring_components_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "number_series" (
    "organizationId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "prefix" TEXT NOT NULL DEFAULT '',
    "suffix" TEXT NOT NULL DEFAULT '',
    "padding" INTEGER NOT NULL DEFAULT 4,
    "nextNumber" INTEGER NOT NULL DEFAULT 1,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "number_series_pkey" PRIMARY KEY ("organizationId","key")
);

-- CreateTable
CREATE TABLE "ledger_overrides" (
    "organizationId" TEXT NOT NULL,
    "dimension" TEXT NOT NULL,
    "groupName" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "ledgerName" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ledger_overrides_pkey" PRIMARY KEY ("organizationId","dimension","groupName","key")
);

-- CreateIndex
CREATE UNIQUE INDEX "structure_templates_organizationId_name_key" ON "structure_templates"("organizationId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "structure_assignments_organizationId_scope_target_key" ON "structure_assignments"("organizationId", "scope", "target");

-- CreateIndex
CREATE INDEX "recurring_components_organizationId_personId_idx" ON "recurring_components"("organizationId", "personId");

-- AddForeignKey
ALTER TABLE "structure_assignments" ADD CONSTRAINT "structure_assignments_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "structure_templates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_components" ADD CONSTRAINT "recurring_components_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "recurring_components" ADD CONSTRAINT "recurring_components_componentId_fkey" FOREIGN KEY ("componentId") REFERENCES "pay_components"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

