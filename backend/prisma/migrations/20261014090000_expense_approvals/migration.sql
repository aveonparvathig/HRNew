-- AlterTable
ALTER TABLE "expense_reports" ADD COLUMN     "approvalLevel" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "currentApproverId" TEXT;

-- CreateTable
CREATE TABLE "expense_approvals" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "reportId" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "approverId" TEXT NOT NULL,
    "approverName" TEXT NOT NULL DEFAULT '',
    "decision" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT NOT NULL DEFAULT '',
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "expense_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "expense_approvals_organizationId_approverId_idx" ON "expense_approvals"("organizationId", "approverId");

-- CreateIndex
CREATE UNIQUE INDEX "expense_approvals_reportId_level_key" ON "expense_approvals"("reportId", "level");

-- AddForeignKey
ALTER TABLE "expense_approvals" ADD CONSTRAINT "expense_approvals_reportId_fkey" FOREIGN KEY ("reportId") REFERENCES "expense_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

