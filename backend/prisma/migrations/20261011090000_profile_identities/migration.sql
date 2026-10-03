-- AlterTable
ALTER TABLE "people" ADD COLUMN     "bankAccountName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "bankAccountType" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "bankBranch" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "disabilityType" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "emergencyName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "emergencyRelation" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "epsMember" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fatherName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "isDirector" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lwfCovered" TEXT NOT NULL DEFAULT 'AUTO',
ADD COLUMN     "marriageDate" TEXT,
ADD COLUMN     "nationality" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "permanentAddress" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "pfJoinDate" TEXT,
ADD COLUMN     "physicallyChallenged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "placeOfBirth" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "religion" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "residentialStatus" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "spouseName" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "family_members" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "relation" TEXT NOT NULL,
    "dateOfBirth" TEXT,
    "isDependant" BOOLEAN NOT NULL DEFAULT false,
    "nomineeShare" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "family_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "education" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "qualification" TEXT NOT NULL,
    "institute" TEXT NOT NULL DEFAULT '',
    "fromYear" INTEGER,
    "toYear" INTEGER,
    "grade" TEXT NOT NULL DEFAULT '',
    "isHighest" BOOLEAN NOT NULL DEFAULT false,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "education_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "previous_employments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "employer" TEXT NOT NULL,
    "designation" TEXT NOT NULL DEFAULT '',
    "fromDate" TEXT,
    "toDate" TEXT,
    "lastSalary" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "reasonForLeaving" TEXT NOT NULL DEFAULT '',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "previous_employments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "identity_documents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "personId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "number" TEXT NOT NULL DEFAULT '',
    "nameOnDocument" TEXT NOT NULL DEFAULT '',
    "expiryDate" TEXT,
    "fileName" TEXT NOT NULL DEFAULT '',
    "mimeType" TEXT NOT NULL DEFAULT '',
    "sizeBytes" INTEGER NOT NULL DEFAULT 0,
    "fileData" TEXT NOT NULL DEFAULT '',
    "storage" TEXT NOT NULL DEFAULT 'DB',
    "storageKey" TEXT NOT NULL DEFAULT '',
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "verifiedByName" TEXT NOT NULL DEFAULT '',
    "verifiedAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "identity_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "family_members_organizationId_personId_idx" ON "family_members"("organizationId", "personId");

-- CreateIndex
CREATE INDEX "education_organizationId_personId_idx" ON "education"("organizationId", "personId");

-- CreateIndex
CREATE INDEX "previous_employments_organizationId_personId_idx" ON "previous_employments"("organizationId", "personId");

-- CreateIndex
CREATE INDEX "identity_documents_organizationId_personId_idx" ON "identity_documents"("organizationId", "personId");

-- CreateIndex
CREATE INDEX "identity_documents_organizationId_docType_idx" ON "identity_documents"("organizationId", "docType");

-- AddForeignKey
ALTER TABLE "family_members" ADD CONSTRAINT "family_members_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "education" ADD CONSTRAINT "education_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "previous_employments" ADD CONSTRAINT "previous_employments_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "identity_documents" ADD CONSTRAINT "identity_documents_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE CASCADE ON UPDATE CASCADE;

