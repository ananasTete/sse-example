import { chatStore } from "@/lib/chat-store";
import { MessagePart } from "@/features/ai-sdk/hooks/use-chat/types";
import { jsonError } from "@/src/server/http/json";

interface PatchMessageBody {
  parts?: MessagePart[];
  model?: string | null;
  status?: "done" | "streaming" | "aborted" | "error";
}

export async function patchMessageHandler(
  request: Request,
  chatId: string,
  messageId: string,
) {
  const body = (await request.json()) as PatchMessageBody;

  const updated = await chatStore.updateMessage(chatId, messageId, {
    parts: body.parts,
    model: body.model,
    status: body.status,
  });

  if (!updated) {
    return jsonError("Message not found", 404);
  }

  return Response.json({ message: updated });
}

export async function deleteMessageHandler(chatId: string, messageId: string) {
  const deleted = await chatStore.deleteMessage(chatId, messageId);

  if (!deleted) {
    return jsonError("Message not found", 404);
  }

  return Response.json({ success: true });
}
