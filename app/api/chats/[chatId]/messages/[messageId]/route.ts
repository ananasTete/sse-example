import { NextRequest } from "next/server";
import { chatStore } from "@/lib/chat-store";
import { MessagePart } from "@/features/ai-sdk/hooks/use-chat/types";

export const runtime = "nodejs";

interface PatchMessageBody {
  parts?: MessagePart[];
  model?: string | null;
  status?: "done" | "streaming" | "aborted" | "error";
}

export async function PATCH(
  req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ chatId: string; messageId: string }>;
  }
) {
  const { chatId, messageId } = await params;
  const body = (await req.json()) as PatchMessageBody;

  const updated = await chatStore.updateMessage(chatId, messageId, {
    parts: body.parts,
    model: body.model,
    status: body.status,
  });

  if (!updated) {
    return Response.json({ error: "Message not found" }, { status: 404 });
  }

  return Response.json({ message: updated });
}

export async function DELETE(
  _req: NextRequest,
  {
    params,
  }: {
    params: Promise<{ chatId: string; messageId: string }>;
  }
) {
  const { chatId, messageId } = await params;
  const deleted = await chatStore.deleteMessage(chatId, messageId);

  if (!deleted) {
    return Response.json({ error: "Message not found" }, { status: 404 });
  }

  return Response.json({ success: true });
}
