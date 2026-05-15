import { prisma } from "@/lib/prisma";
import {
  chatCompletionHandler,
  resumeChatCompletionStreamHandler,
} from "@/src/server/session-chat/chat-completion";
import { AGENT_EDITOR_CHAT_AGENT } from "./chat-session";

function createJsonError(message: string, status: number) {
  return Response.json(
    {
      code: status,
      msg: message,
      data: {
        biz_code: status,
        biz_msg: message,
        biz_data: null,
      },
    },
    { status },
  );
}

function createSseError(message: string, status: number) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      controller.enqueue(
        encoder.encode(
          `event: error\ndata: ${JSON.stringify({ message, status })}\n\n`,
        ),
      );
      controller.close();
    },
  });

  return new Response(stream, {
    status,
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function getRequestBody(request: Request) {
  try {
    const body = (await request.clone().json()) as unknown;
    return isRecord(body) ? body : null;
  } catch {
    return null;
  }
}

async function assertAgentEditorSession(chatSessionId: unknown) {
  if (typeof chatSessionId !== "string" || !chatSessionId.trim()) {
    return {
      ok: false as const,
      status: 400,
      message: "chat_session_id is required",
    };
  }

  const session = await prisma.chatSession.findFirst({
    where: {
      id: chatSessionId.trim(),
      agent: AGENT_EDITOR_CHAT_AGENT,
    },
    select: { id: true },
  });

  if (!session) {
    return {
      ok: false as const,
      status: 404,
      message: "Chat session not found",
    };
  }

  return { ok: true as const };
}

export async function agentEditorChatCompletionHandler(
  request: Request,
  options: Parameters<typeof chatCompletionHandler>[1] = {},
) {
  const body = await getRequestBody(request);
  const check = await assertAgentEditorSession(body?.chat_session_id);

  if (!check.ok) {
    return createSseError(check.message, check.status);
  }

  return chatCompletionHandler(request, options);
}

export async function agentEditorResumeChatCompletionStreamHandler(
  request: Request,
) {
  const body = await getRequestBody(request);
  const check = await assertAgentEditorSession(body?.chat_session_id);

  if (!check.ok) {
    return createJsonError(check.message, check.status);
  }

  return resumeChatCompletionStreamHandler(request);
}
