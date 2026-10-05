-- AlterTable
ALTER TABLE "payslip_entries" ADD COLUMN     "leaveLopDays" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "leave_types" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "paid" BOOLEAN NOT NULL DEFAULT true,
    "unit" TEXT NOT NULL DEFAULT 'DAY',
    "annualQuota" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "genderGate" TEXT NOT NULL DEFAULT '',
    "halfDayAllowed" BOOLEAN NOT NULL DEFAULT true,
    "requiresAttachment" BOOLEAN NOT NULL DEFAULT false,
    "eligibleAfterProbation" BOOLEAN NOT NULL DEFAULT false,
    "encashable" BOOLEAN NOT NULL DEFAULT false,
    "carryForward" BOOLEAN NOT NULL DEFAULT false,
    "carryForwardCap" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_balances" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "opening" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "granted" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "taken" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "applied" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lapsed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "encashed" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_balances_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_transactions" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "days" DOUBLE PRECISION NOT NULL,
    "effectiveDate" TEXT NOT NULL,
    "requestId" TEXT,
    "note" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_requests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "requestNumber" TEXT NOT NULL,
    "leaveTypeId" TEXT NOT NULL,
    "startDate" TEXT NOT NULL,
    "endDate" TEXT NOT NULL,
    "halfDayStart" BOOLEAN NOT NULL DEFAULT false,
    "halfDayEnd" BOOLEAN NOT NULL DEFAULT false,
    "days" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reason" TEXT NOT NULL DEFAULT '',
    "attachmentData" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "currentApproverId" TEXT,
    "approvalLevel" INTEGER NOT NULL DEFAULT 0,
    "appliedOnBehalf" BOOLEAN NOT NULL DEFAULT false,
    "submittedOn" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_approvals" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "approverId" TEXT NOT NULL,
    "approverName" TEXT NOT NULL DEFAULT '',
    "decision" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT NOT NULL DEFAULT '',
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "leave_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'PUBLIC',
    "workLocationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "leave_settings" (
    "organizationId" TEXT NOT NULL,
    "leaveYearStartMonth" INTEGER NOT NULL DEFAULT 1,
    "weekOffDays" INTEGER[],
    "hrApplyOnBehalf" BOOLEAN NOT NULL DEFAULT true,
    "lopLeaveTypeCode" TEXT NOT NULL DEFAULT 'LOP',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "leave_settings_pkey" PRIMARY KEY ("organizationId")
);

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_organizationId_code_key" ON "leave_types"("organizationId", "code");

-- CreateIndex
CREATE INDEX "leave_balances_organizationId_personId_idx" ON "leave_balances"("organizationId", "personId");

-- CreateIndex
CREATE UNIQUE INDEX "leave_balances_organizationId_personId_leaveTypeId_year_key" ON "leave_balances"("organizationId", "personId", "leaveTypeId", "year");

-- CreateIndex
CREATE INDEX "leave_transactions_organizationId_personId_idx" ON "leave_transactions"("organizationId", "personId");

-- CreateIndex
CREATE INDEX "leave_transactions_requestId_idx" ON "leave_transactions"("requestId");

-- CreateIndex
CREATE INDEX "leave_requests_organizationId_status_idx" ON "leave_requests"("organizationId", "status");

-- CreateIndex
CREATE INDEX "leave_requests_personId_idx" ON "leave_requests"("personId");

-- CreateIndex
CREATE INDEX "leave_requests_currentApproverId_idx" ON "leave_requests"("currentApproverId");

-- CreateIndex
CREATE UNIQUE INDEX "leave_requests_organizationId_requestNumber_key" ON "leave_requests"("organizationId", "requestNumber");

-- CreateIndex
CREATE INDEX "leave_approvals_organizationId_approverId_idx" ON "leave_approvals"("organizationId", "approverId");

-- CreateIndex
CREATE UNIQUE INDEX "leave_approvals_requestId_level_key" ON "leave_approvals"("requestId", "level");

-- CreateIndex
CREATE INDEX "holidays_organizationId_idx" ON "holidays"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "holidays_organizationId_date_workLocationId_key" ON "holidays"("organizationId", "date", "workLocationId");

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_balances" ADD CONSTRAINT "leave_balances_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_transactions" ADD CONSTRAINT "leave_transactions_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_transactions" ADD CONSTRAINT "leave_transactions_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_requests" ADD CONSTRAINT "leave_requests_leaveTypeId_fkey" FOREIGN KEY ("leaveTypeId") REFERENCES "leave_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "leave_approvals" ADD CONSTRAINT "leave_approvals_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "leave_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_workLocationId_fkey" FOREIGN KEY ("workLocationId") REFERENCES "work_locations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

