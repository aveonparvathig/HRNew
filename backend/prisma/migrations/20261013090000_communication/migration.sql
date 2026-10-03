-- AlterTable
ALTER TABLE "people" ADD COLUMN     "detailsConfirmedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "change_requests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "changes" JSONB NOT NULL DEFAULT '{}',
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "fileName" TEXT NOT NULL DEFAULT '',
    "mimeType" TEXT NOT NULL DEFAULT '',
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "fileData" TEXT NOT NULL DEFAULT '',
    "storage" TEXT NOT NULL DEFAULT 'DB',
    "storageKey" TEXT NOT NULL DEFAULT '',
    "reviewedByName" TEXT NOT NULL DEFAULT '',
    "reviewNote" TEXT NOT NULL DEFAULT '',
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "change_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "bulletins" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "scope" TEXT NOT NULL DEFAULT 'EVERYONE',
    "scopeValue" TEXT NOT NULL DEFAULT '',
    "fileName" TEXT NOT NULL DEFAULT '',
    "mimeType" TEXT NOT NULL DEFAULT '',
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "fileData" TEXT NOT NULL DEFAULT '',
    "storage" TEXT NOT NULL DEFAULT 'DB',
    "storageKey" TEXT NOT NULL DEFAULT '',
    "expiresOn" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "bulletins_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policies" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "scope" TEXT NOT NULL DEFAULT 'EVERYONE',
    "scopeValue" TEXT NOT NULL DEFAULT '',
    "fileName" TEXT NOT NULL DEFAULT '',
    "mimeType" TEXT NOT NULL DEFAULT '',
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "fileData" TEXT NOT NULL DEFAULT '',
    "storage" TEXT NOT NULL DEFAULT 'DB',
    "storageKey" TEXT NOT NULL DEFAULT '',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdByName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "policy_acknowledgements" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_acknowledgements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mail_campaigns" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL DEFAULT '',
    "scope" TEXT NOT NULL,
    "scopeValue" TEXT NOT NULL DEFAULT '',
    "personIds" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'SENDING',
    "total" INTEGER NOT NULL DEFAULT 0,
    "sent" INTEGER NOT NULL DEFAULT 0,
    "failed" INTEGER NOT NULL DEFAULT 0,
    "createdByName" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),

    CONSTRAINT "mail_campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "change_requests_organizationId_status_idx" ON "change_requests"("organizationId", "status");

-- CreateIndex
CREATE INDEX "change_requests_personId_idx" ON "change_requests"("personId");

-- CreateIndex
CREATE INDEX "bulletins_organizationId_isActive_idx" ON "bulletins"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "policies_organizationId_isActive_idx" ON "policies"("organizationId", "isActive");

-- CreateIndex
CREATE INDEX "policy_acknowledgements_organizationId_policyId_idx" ON "policy_acknowledgements"("organizationId", "policyId");

-- CreateIndex
CREATE UNIQUE INDEX "policy_acknowledgements_policyId_personId_key" ON "policy_acknowledgements"("policyId", "personId");

-- CreateIndex
CREATE INDEX "mail_campaigns_organizationId_createdAt_idx" ON "mail_campaigns"("organizationId", "createdAt");

-- AddForeignKey
ALTER TABLE "change_requests" ADD CONSTRAINT "change_requests_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_acknowledgements" ADD CONSTRAINT "policy_acknowledgements_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "policies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "policy_acknowledgements" ADD CONSTRAINT "policy_acknowledgements_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

