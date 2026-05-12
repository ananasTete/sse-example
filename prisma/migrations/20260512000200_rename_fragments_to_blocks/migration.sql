DROP INDEX IF EXISTS "MessageFragment_messageId_id_idx";
DROP INDEX IF EXISTS "MessageFragment_messageId_localId_key";

ALTER TABLE "ChatSession" RENAME COLUMN "nextFragmentId" TO "nextBlockId";
ALTER TABLE "ChatMessage" RENAME COLUMN "hasPendingFragment" TO "hasPendingBlock";
ALTER TABLE "MessageFragment" RENAME TO "MessageBlock";

UPDATE "MessageBlock"
SET "type" = CASE "type"
  WHEN 'REQUEST' THEN 'request'
  WHEN 'RESPONSE' THEN 'response'
  WHEN 'SEARCH' THEN 'search'
  WHEN 'TOOL_CALL' THEN 'tool_call'
  ELSE "type"
END;

CREATE INDEX "MessageBlock_messageId_id_idx" ON "MessageBlock"("messageId", "id");
CREATE UNIQUE INDEX "MessageBlock_messageId_localId_key" ON "MessageBlock"("messageId", "localId");
