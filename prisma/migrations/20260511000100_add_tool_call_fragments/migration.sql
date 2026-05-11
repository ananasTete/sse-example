ALTER TABLE "MessageFragment" ADD COLUMN "toolName" TEXT;
ALTER TABLE "MessageFragment" ADD COLUMN "toolCallId" TEXT;
ALTER TABLE "MessageFragment" ADD COLUMN "toolInputJson" JSONB;
ALTER TABLE "MessageFragment" ADD COLUMN "toolOutputJson" JSONB;
