ALTER TABLE "ChatRun"
ADD COLUMN "lastPersistedSeq" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ChatRun"
ADD COLUMN "lastError" TEXT;

ALTER TABLE "ChatRun"
ADD COLUMN "lastHeartbeatAt" DATETIME;

UPDATE "ChatRun"
SET "lastPersistedSeq" = "lastEventSeq"
WHERE "status" <> 'running';
