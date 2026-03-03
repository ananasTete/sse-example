import { chatStore } from "@/lib/chat-store";
import { jsonError } from "@/src/server/http/json";
import { resolveRequestUserId } from "./chat-service";
import { parsePatchMessageRequest } from "./contracts";

export async function patchMessageHandler(
  request: Request,
  chatId: string,
  messageId: string,
) {
  const userId = resolveRequestUserId(request);
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return jsonError("Invalid patch body", 400);
  }
  let body: ReturnType<typeof parsePatchMessageRequest>;
  try {
    body = parsePatchMessageRequest(payload);
  } catch (error) {
    return jsonError(
      error instanceof Error ? error.message : "Invalid patch body",
      400,
    );
  }

  const updated = await chatStore.updateMessage(
    chatId,
    messageId,
    {
      parts: body.parts,
      model: body.model,
      status: body.status,
      visible: body.visible,
    },
    userId,
  );

  if (!updated) {
    return jsonError("Message not found", 404);
  }

  return Response.json({ message: updated });
}

export async function deleteMessageHandler(
  request: Request,
  chatId: string,
  messageId: string,
) {
  const userId = resolveRequestUserId(request);
  const result = await chatStore.hideMessageSubtree(chatId, messageId, userId);

  if (!result) {
    return jsonError("Message not found", 404);
  }

  return Response.json({
    success: true,
    hiddenMessageIds: result.hiddenMessageIds,
    cursorMessageId: result.cursorMessageId,
  });
}
