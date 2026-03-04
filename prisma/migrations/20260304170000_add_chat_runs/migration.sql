CREATE TABLE "ChatRun" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "chatId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "assistantMessageId" TEXT NOT NULL,
    "parentMessageId" TEXT,
    "resumeToken" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lastEventSeq" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    "finishedAt" DATETIME,
    CONSTRAINT "ChatRun_chatId_fkey" FOREIGN KEY ("chatId") REFERENCES "Chat" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ChatRunEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "runId" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "event" TEXT NOT NULL,
    "payloadJson" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChatRunEvent_runId_fkey" FOREIGN KEY ("runId") REFERENCES "ChatRun" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX "ChatRun_chatId_status_createdAt_idx"
ON "ChatRun"("chatId", "status", "createdAt");

CREATE INDEX "ChatRun_userId_status_createdAt_idx"
ON "ChatRun"("userId", "status", "createdAt");

CREATE INDEX "ChatRunEvent_runId_createdAt_idx"
ON "ChatRunEvent"("runId", "createdAt");

CREATE UNIQUE INDEX "ChatRunEvent_runId_seq_key"
ON "ChatRunEvent"("runId", "seq");
