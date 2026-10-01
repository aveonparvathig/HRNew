-- AlterTable
ALTER TABLE "people" ADD COLUMN     "workLocationId" TEXT;

-- CreateTable
CREATE TABLE "org_statutory_profiles" (
    "organizationId" TEXT NOT NULL,
    "panNumber" TEXT NOT NULL DEFAULT '',
    "tanNumber" TEXT NOT NULL DEFAULT '',
    "pfCode" TEXT NOT NULL DEFAULT '',
    "esiCode" TEXT NOT NULL DEFAULT '',
    "ptRegistrationNo" TEXT NOT NULL DEFAULT '',
    "lwfRegistrationNo" TEXT NOT NULL DEFAULT '',
    "deductorType" TEXT NOT NULL DEFAULT '',
    "tdsCircleAddress" TEXT NOT NULL DEFAULT '',
    "responsibleName" TEXT NOT NULL DEFAULT '',
    "responsibleDesignation" TEXT NOT NULL DEFAULT '',
    "responsiblePan" TEXT NOT NULL DEFAULT '',
    "responsibleAddress" TEXT NOT NULL DEFAULT '',
    "responsibleEmail" TEXT NOT NULL DEFAULT '',
    "responsiblePhone" TEXT NOT NULL DEFAULT '',
    "form16SignatoryName" TEXT NOT NULL DEFAULT '',
    "form16SignatoryFatherName" TEXT NOT NULL DEFAULT '',
    "form16SignatoryDesignation" TEXT NOT NULL DEFAULT '',
    "form16SigningPlace" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "org_statutory_profiles_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "work_locations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL DEFAULT '',
    "state" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "work_locations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payroll_audit_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "runId" TEXT,
    "entryId" TEXT,
    "personId" TEXT,
    "period" TEXT NOT NULL DEFAULT '',
    "personName" TEXT NOT NULL DEFAULT '',
    "userId" TEXT,
    "userName" TEXT NOT NULL DEFAULT '',
    "action" TEXT NOT NULL,
    "field" TEXT NOT NULL DEFAULT '',
    "oldValue" TEXT NOT NULL DEFAULT '',
    "newValue" TEXT NOT NULL DEFAULT '',
    "source" TEXT NOT NULL DEFAULT 'MANUAL',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payroll_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "work_locations_organizationId_name_key" ON "work_locations"("organizationId", "name");

-- CreateIndex
CREATE INDEX "payroll_audit_logs_organizationId_createdAt_idx" ON "payroll_audit_logs"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "payroll_audit_logs_runId_idx" ON "payroll_audit_logs"("runId");

-- AddForeignKey
ALTER TABLE "people" ADD CONSTRAINT "people_workLocationId_fkey" FOREIGN KEY ("workLocationId") REFERENCES "work_locations"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "work_locations" ADD CONSTRAINT "work_locations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

