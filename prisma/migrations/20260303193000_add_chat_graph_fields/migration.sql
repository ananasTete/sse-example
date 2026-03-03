ALTER TABLE "Chat"
ADD COLUMN "cursorMessageId" TEXT;

ALTER TABLE "Message"
ADD COLUMN "parentId" TEXT;

ALTER TABLE "Message"
ADD COLUMN "visible" BOOLEAN NOT NULL DEFAULT true;

CREATE INDEX "Message_chatId_parentId_createdAt_idx"
ON "Message"("chatId", "parentId", "createdAt");

WITH ordered AS (
  SELECT
    "id",
    LAG("id") OVER (
      PARTITION BY "chatId"
      ORDER BY "seq" ASC, "createdAt" ASC, "id" ASC
    ) AS "prevId"
  FROM "Message"
)
UPDATE "Message"
SET "parentId" = (
  SELECT "prevId"
  FROM ordered
  WHERE ordered."id" = "Message"."id"
);

UPDATE "Message"
SET "visible" = true;

UPDATE "Chat"
SET "cursorMessageId" = (
  SELECT m."id"
  FROM "Message" m
  WHERE m."chatId" = "Chat"."id"
  ORDER BY m."seq" DESC, m."createdAt" DESC, m."id" DESC
  LIMIT 1
);
