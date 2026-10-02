-- AlterTable
ALTER TABLE "users" ADD COLUMN     "failedAttempts" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "lastLoginAt" TIMESTAMP(3),
ADD COLUMN     "lockedUntil" TIMESTAMP(3),
ADD COLUMN     "passwordChangedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "password_policies" (
    "organizationId" TEXT NOT NULL,
    "minLength" INTEGER NOT NULL DEFAULT 8,
    "lockoutAttempts" INTEGER NOT NULL DEFAULT 0,
    "lockoutMinutes" INTEGER NOT NULL DEFAULT 30,
    "expiryDays" INTEGER NOT NULL DEFAULT 0,
    "expiryReminderDays" INTEGER NOT NULL DEFAULT 7,
    "historyCount" INTEGER NOT NULL DEFAULT 0,
    "tempPasswordDays" INTEGER NOT NULL DEFAULT 0,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "password_policies_pkey" PRIMARY KEY ("organizationId")
);

-- CreateTable
CREATE TABLE "password_history" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "password_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_events" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "result" TEXT NOT NULL,
    "ip" TEXT NOT NULL DEFAULT '',
    "userAgent" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "password_history_userId_idx" ON "password_history"("userId");

-- CreateIndex
CREATE INDEX "login_events_organizationId_createdAt_idx" ON "login_events"("organizationId", "createdAt");

-- CreateIndex
CREATE INDEX "login_events_userId_idx" ON "login_events"("userId");

-- AddForeignKey
ALTER TABLE "password_history" ADD CONSTRAINT "password_history_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- When each existing password was set is not known. They are counted from
-- today, so switching on password expiry later does not expire every
-- account at once.
UPDATE "users" SET "passwordChangedAt" = now() WHERE "passwordChangedAt" IS NULL;
