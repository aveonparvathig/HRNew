-- CreateTable
CREATE TABLE "organizations" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "organizations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "firstName" TEXT NOT NULL DEFAULT '',
    "lastName" TEXT NOT NULL DEFAULT '',
    "organizationId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "academic_years" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "academic_years_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "income_clients" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "agreementStatus" TEXT NOT NULL DEFAULT '',
    "notes" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "income_clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_billings" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "academicYear" TEXT NOT NULL,
    "yearStart" INTEGER NOT NULL DEFAULT 0,
    "studentCount" INTEGER,
    "rate" DOUBLE PRECISION,
    "oneTimePayment" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "overrideAmounts" BOOLEAN NOT NULL DEFAULT false,
    "taxableValue" DOUBLE PRECISION,
    "gstAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "previousPending" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "engineer" TEXT NOT NULL DEFAULT '',
    "invoiceStatus" TEXT NOT NULL DEFAULT '',
    "remarks" TEXT NOT NULL DEFAULT '',
    "nextFollowupDate" TEXT,
    "followupNote" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_billings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_receipts" (
    "id" TEXT NOT NULL,
    "billingId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "receivedOn" TEXT,
    "mode" TEXT NOT NULL DEFAULT '',
    "note" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "payment_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "client_onboardings" (
    "clientId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "stage" TEXT NOT NULL DEFAULT 'ONBOARDING',
    "contactPerson" TEXT NOT NULL DEFAULT '',
    "contactDesignation" TEXT NOT NULL DEFAULT '',
    "contactPhone" TEXT NOT NULL DEFAULT '',
    "contactEmail" TEXT NOT NULL DEFAULT '',
    "institutionType" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "city" TEXT NOT NULL DEFAULT '',
    "studentStrength" INTEGER,
    "onboardedOn" TEXT,
    "goLiveDate" TEXT,
    "engineer" TEXT NOT NULL DEFAULT '',
    "poReceived" BOOLEAN NOT NULL DEFAULT false,
    "poNumber" TEXT NOT NULL DEFAULT '',
    "poDate" TEXT,
    "agreementSigned" BOOLEAN NOT NULL DEFAULT false,
    "agreementYears" INTEGER,
    "agreementStart" TEXT,
    "agreementEnd" TEXT,
    "reminderDays" INTEGER NOT NULL DEFAULT 90,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "client_onboardings_pkey" PRIMARY KEY ("clientId")
);

-- CreateTable
CREATE TABLE "feature_statuses" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NOT_STARTED',
    "engineer" TEXT NOT NULL DEFAULT '',
    "startedOn" TEXT,
    "completedOn" TEXT,
    "remarks" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "feature_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_organizationId_idx" ON "users"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "academic_years_organizationId_label_key" ON "academic_years"("organizationId", "label");

-- CreateIndex
CREATE UNIQUE INDEX "income_clients_organizationId_name_key" ON "income_clients"("organizationId", "name");

-- CreateIndex
CREATE INDEX "client_billings_organizationId_yearStart_idx" ON "client_billings"("organizationId", "yearStart");

-- CreateIndex
CREATE INDEX "client_billings_organizationId_nextFollowupDate_idx" ON "client_billings"("organizationId", "nextFollowupDate");

-- CreateIndex
CREATE UNIQUE INDEX "client_billings_clientId_academicYear_key" ON "client_billings"("clientId", "academicYear");

-- CreateIndex
CREATE INDEX "payment_receipts_organizationId_createdAt_idx" ON "payment_receipts"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "client_onboardings_organizationId_idx" ON "client_onboardings"("organizationId");

-- CreateIndex
CREATE INDEX "feature_statuses_organizationId_idx" ON "feature_statuses"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "feature_statuses_clientId_name_key" ON "feature_statuses"("clientId", "name");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "academic_years" ADD CONSTRAINT "academic_years_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "income_clients" ADD CONSTRAINT "income_clients_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_billings" ADD CONSTRAINT "client_billings_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "income_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_billingId_fkey" FOREIGN KEY ("billingId") REFERENCES "client_billings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "income_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_onboardings" ADD CONSTRAINT "client_onboardings_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "income_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feature_statuses" ADD CONSTRAINT "feature_statuses_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "income_clients"("id") ON DELETE CASCADE ON UPDATE CASCADE;
