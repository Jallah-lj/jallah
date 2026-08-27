-- Document store: one row per CMS collection (profile, settings, projects, …).
CREATE TABLE "CmsDocument" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CmsDocument_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE INDEX "CmsDocument_updatedAt_idx" ON "CmsDocument"("updatedAt");
