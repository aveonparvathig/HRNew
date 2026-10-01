-- AlterTable
ALTER TABLE "org_statutory_profiles" ADD COLUMN     "labourIdNumber" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "managerName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "natureOfBusiness" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "shopsRegistrationNo" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "payroll_settings" ADD COLUMN     "bonusEligibilityLimit" DOUBLE PRECISION NOT NULL DEFAULT 21000,
ADD COLUMN     "bonusPercent" DOUBLE PRECISION NOT NULL DEFAULT 8.33,
ADD COLUMN     "bonusWageCeiling" DOUBLE PRECISION NOT NULL DEFAULT 7000;

