import { chatStore } from "@/lib/chat-store";
import { MessagePartV2 } from "@/features/ai-sdk/hooks/use-chat-v2/types";
import { jsonError } from "@/src/server/http/json";

interface PatchMessageBody {
  parts?: MessagePartV2[];
  model?: string | null;
  status?: "done" | "streaming" | "aborted" | "error";
  visible?: boolean;
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
    visible: body.visible,
  });

  if (!updated) {
    return jsonError("Message not found", 404);
  }

  return Response.json({ message: updated });
}

export async function deleteMessageHandler(chatId: string, messageId: string) {
  const result = await chatStore.hideMessageSubtree(chatId, messageId);

  if (!result) {
    return jsonError("Message not found", 404);
  }

  return Response.json({
    success: true,
    hiddenMessageIds: result.hiddenMessageIds,
    cursorMessageId: result.cursorMessageId,
  });
}
