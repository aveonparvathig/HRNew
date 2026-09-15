-- AlterTable
ALTER TABLE "users" ADD COLUMN     "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "personId" TEXT,
ALTER COLUMN "role" SET DEFAULT 'SUPER_ADMIN';

-- CreateIndex
CREATE UNIQUE INDEX "users_personId_key" ON "users"("personId");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_personId_fkey" FOREIGN KEY ("personId") REFERENCES "people"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Data migration: legacy roles -> new role model
UPDATE "users" SET "role" = 'SUPER_ADMIN' WHERE "role" = 'OWNER';
UPDATE "users" SET "role" = 'HR' WHERE "role" = 'MEMBER';
