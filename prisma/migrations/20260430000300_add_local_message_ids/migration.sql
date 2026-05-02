-- AlterTable
ALTER TABLE "ChatSession" ADD COLUMN "nextMessageId" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "ChatSession" ADD COLUMN "nextFragmentId" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "ChatMessage" ADD COLUMN "localId" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "MessageFragment" ADD COLUMN "localId" INTEGER NOT NULL DEFAULT 0;

-- Backfill existing rows with their current global ids. New sessions use per-session ids.
UPDATE "ChatMessage" SET "localId" = "id";
UPDATE "MessageFragment" SET "localId" = "id";

UPDATE "ChatSession"
SET "nextMessageId" = COALESCE(
    (SELECT MAX("localId") FROM "ChatMessage" WHERE "ChatMessage"."chatSessionId" = "ChatSession"."id"),
    0
);

UPDATE "ChatSession"
SET "nextFragmentId" = COALESCE(
    (
        SELECT MAX("MessageFragment"."localId")
        FROM "MessageFragment"
        JOIN "ChatMessage" ON "ChatMessage"."id" = "MessageFragment"."messageId"
        WHERE "ChatMessage"."chatSessionId" = "ChatSession"."id"
    ),
    0
);

-- CreateIndex
CREATE UNIQUE INDEX "ChatMessage_chatSessionId_localId_key" ON "ChatMessage"("chatSessionId", "localId");

-- CreateIndex
CREATE UNIQUE INDEX "MessageFragment_messageId_localId_key" ON "MessageFragment"("messageId", "localId");
