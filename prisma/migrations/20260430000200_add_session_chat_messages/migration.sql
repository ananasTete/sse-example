-- CreateTable
CREATE TABLE "ChatMessage" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "chatSessionId" TEXT NOT NULL,
    "parentId" INTEGER,
    "model" TEXT NOT NULL DEFAULT '',
    "role" TEXT NOT NULL,
    "thinkingEnabled" BOOLEAN NOT NULL DEFAULT false,
    "banEdit" BOOLEAN NOT NULL DEFAULT false,
    "banRegenerate" BOOLEAN NOT NULL DEFAULT false,
    "status" TEXT NOT NULL,
    "incompleteMessage" TEXT,
    "accumulatedTokenUsage" INTEGER NOT NULL DEFAULT 0,
    "feedback" JSONB,
    "searchEnabled" BOOLEAN NOT NULL DEFAULT false,
    "conversationMode" TEXT NOT NULL DEFAULT 'DEFAULT',
    "hasPendingFragment" BOOLEAN NOT NULL DEFAULT false,
    "autoContinue" BOOLEAN NOT NULL DEFAULT false,
    "insertedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatMessage_chatSessionId_fkey" FOREIGN KEY ("chatSessionId") REFERENCES "ChatSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "MessageFragment" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "messageId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT,
    "content" TEXT,
    "queriesJson" JSONB,
    "resultsJson" JSONB,
    "referencesJson" JSONB,
    "stageId" INTEGER,
    "insertedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MessageFragment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "ChatMessage" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "ChatMessage_chatSessionId_insertedAt_idx" ON "ChatMessage"("chatSessionId", "insertedAt");

-- CreateIndex
CREATE INDEX "ChatMessage_chatSessionId_parentId_idx" ON "ChatMessage"("chatSessionId", "parentId");

-- CreateIndex
CREATE INDEX "MessageFragment_messageId_id_idx" ON "MessageFragment"("messageId", "id");
