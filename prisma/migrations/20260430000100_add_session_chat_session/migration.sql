-- CreateTable
CREATE TABLE "ChatSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "seqId" INTEGER NOT NULL,
    "agent" TEXT NOT NULL DEFAULT 'chat',
    "modelType" TEXT NOT NULL DEFAULT 'default',
    "title" TEXT,
    "titleType" TEXT NOT NULL DEFAULT 'WIP',
    "version" INTEGER NOT NULL DEFAULT 0,
    "currentMessageId" INTEGER,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "isEmpty" BOOLEAN NOT NULL DEFAULT true,
    "expiresAt" DATETIME,
    "insertedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "ChatSequence" (
    "name" TEXT NOT NULL PRIMARY KEY,
    "value" INTEGER NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatSession_seqId_key" ON "ChatSession"("seqId");

-- CreateIndex
CREATE INDEX "ChatSession_updatedAt_idx" ON "ChatSession"("updatedAt");

-- CreateIndex
CREATE INDEX "ChatSession_pinned_updatedAt_idx" ON "ChatSession"("pinned", "updatedAt");

-- CreateIndex
CREATE INDEX "ChatSession_expiresAt_idx" ON "ChatSession"("expiresAt");
