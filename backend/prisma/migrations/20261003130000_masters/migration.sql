-- AlterTable
ALTER TABLE "org_statutory_profiles" ADD COLUMN     "form16SignatureData" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "gstNumber" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "logoPosition" TEXT NOT NULL DEFAULT 'LEFT',
ADD COLUMN     "signatureData" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "payout_batches" ADD COLUMN     "bankAccountId" TEXT;

-- CreateTable
CREATE TABLE "company_bank_accounts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "label" TEXT NOT NULL DEFAULT '',
    "bankName" TEXT NOT NULL,
    "branch" TEXT NOT NULL DEFAULT '',
    "accountNumber" TEXT NOT NULL,
    "ifsc" TEXT NOT NULL DEFAULT '',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "company_bank_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "list_values" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "listType" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "list_values_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "company_bank_accounts_organizationId_idx" ON "company_bank_accounts"("organizationId");

-- CreateIndex
CREATE UNIQUE INDEX "list_values_organizationId_listType_label_key" ON "list_values"("organizationId", "listType", "label");

-- AddForeignKey
ALTER TABLE "payout_batches" ADD CONSTRAINT "payout_batches_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "company_bank_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- The salary account kept in the payroll settings becomes the company's
-- first bank account, marked as the default.
INSERT INTO "company_bank_accounts"
  ("id", "organizationId", "label", "bankName", "branch", "accountNumber", "ifsc", "isDefault", "isActive", "createdAt", "updatedAt")
SELECT concat('c', md5(random()::text || s."organizationId")), s."organizationId", 'Salary account',
       s."payoutBankName", s."payoutBranch", s."payoutAccountNumber", upper(trim(s."payoutIfsc")), true, true, now(), now()
FROM "payroll_settings" s
WHERE trim(s."payoutAccountNumber") <> '';

-- A company state typed in another case or with stray spaces is set to
-- its spelling in the list of states. Anything else is left as typed; the
-- Company Settings screen asks for it to be picked from the list.
UPDATE "organizations" o SET "state" = v."name"
FROM (VALUES
  ('Andhra Pradesh'), ('Arunachal Pradesh'), ('Assam'), ('Bihar'), ('Chhattisgarh'), ('Goa'), ('Gujarat'),
  ('Haryana'), ('Himachal Pradesh'), ('Jharkhand'), ('Karnataka'), ('Kerala'), ('Madhya Pradesh'),
  ('Maharashtra'), ('Manipur'), ('Meghalaya'), ('Mizoram'), ('Nagaland'), ('Odisha'), ('Punjab'),
  ('Rajasthan'), ('Sikkim'), ('Tamil Nadu'), ('Telangana'), ('Tripura'), ('Uttar Pradesh'), ('Uttarakhand'),
  ('West Bengal'), ('Andaman and Nicobar Islands'), ('Chandigarh'),
  ('Dadra and Nagar Haveli and Daman and Diu'), ('Delhi'), ('Jammu and Kashmir'), ('Ladakh'),
  ('Lakshadweep'), ('Puducherry')
) AS v("name")
WHERE lower(trim(o."state")) = lower(v."name") AND o."state" <> v."name";
