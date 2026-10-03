-- CreateTable
CREATE TABLE "import_logs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "ranByName" TEXT NOT NULL DEFAULT '',
    "summary" JSONB NOT NULL DEFAULT '{}',
    "rows" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "import_logs_organizationId_createdAt_idx" ON "import_logs"("organizationId", "createdAt");

