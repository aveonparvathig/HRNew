-- AlterTable
ALTER TABLE "client_onboardings" ADD COLUMN     "agreementDocumentData" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "agreementFilename" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "poDocumentData" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "poFilename" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "job_applications" ADD COLUMN     "personId" TEXT;
