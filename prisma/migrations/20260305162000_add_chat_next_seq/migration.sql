ALTER TABLE "Chat"
ADD COLUMN "nextSeq" INTEGER NOT NULL DEFAULT 0;

UPDATE "Chat"
SET "nextSeq" = COALESCE(
  (
    SELECT MAX(m."seq")
    FROM "Message" m
    WHERE m."chatId" = "Chat"."id"
  ),
  0
);
