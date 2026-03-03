ALTER TABLE "Chat"
ADD COLUMN "userId" TEXT NOT NULL DEFAULT 'local-user';

CREATE INDEX "Chat_userId_updatedAt_idx"
ON "Chat"("userId", "updatedAt");
