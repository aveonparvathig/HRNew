-- AlterTable
ALTER TABLE "payroll_settings" ADD COLUMN     "jvFilePrefix" TEXT NOT NULL DEFAULT 'JV',
ADD COLUMN     "payslipEmailTo" TEXT NOT NULL DEFAULT 'OFFICIAL',
ADD COLUMN     "payslipFileContext" TEXT NOT NULL DEFAULT 'EMPNO',
ADD COLUMN     "payslipFilePrefix" TEXT NOT NULL DEFAULT 'Payslip',
ADD COLUMN     "payslipPdfPassword" TEXT NOT NULL DEFAULT 'NONE';

-- CreateTable
CREATE TABLE "mail_settings" (
    "organizationId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "host" TEXT NOT NULL DEFAULT '',
    "port" INTEGER NOT NULL DEFAULT 587,
    "security" TEXT NOT NULL DEFAULT 'STARTTLS',
    "username" TEXT NOT NULL DEFAULT '',
    "passwordEnc" TEXT NOT NULL DEFAULT '',
    "fromName" TEXT NOT NULL DEFAULT '',
    "fromEmail" TEXT NOT NULL DEFAULT '',
    "replyTo" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "mail_settings_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "mail_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "toEmail" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT NOT NULL DEFAULT '',
    "runId" TEXT,
    "entryId" TEXT,
    "personId" TEXT,
    "personName" TEXT NOT NULL DEFAULT '',
    "sentBy" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mail_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "mail_logs_organizationId_createdAt_idx" ON "mail_logs"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "mail_logs_runId_idx" ON "mail_logs"("runId");

