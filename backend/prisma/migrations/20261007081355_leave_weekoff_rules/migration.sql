-- AlterTable
ALTER TABLE "attendance_profiles" ADD COLUMN     "weekOffRules" JSONB NOT NULL DEFAULT '[]';

-- AlterTable
ALTER TABLE "leave_settings" ADD COLUMN     "weekOffRules" JSONB NOT NULL DEFAULT '[]';
