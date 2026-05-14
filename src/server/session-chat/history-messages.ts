import { prisma } from "@/lib/prisma";

const toEpochSeconds = (date: Date) => date.getTime() / 1000;

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function toBlockResponse(block: {
  id: number;
  localId: number;
  type: string;
  status: string | null;
  content: string | null;
  toolName: string | null;
  toolCallId: string | null;
  toolInputJson: unknown;
  toolOutputJson: unknown;
  queriesJson: unknown;
  resultsJson: unknown;
  referencesJson: unknown;
  stageId: number | null;
}) {
  if (block.type === "text") {
    return {
      type: "text",
      content: block.content ?? "",
      references: asArray(block.referencesJson),
      stage_id: block.stageId,
    };
  }

  if (block.type === "search") {
    return {
      type: "search",
      status: block.status ?? "FINISHED",
      content: block.content,
      queries: asArray(block.queriesJson),
      results: asArray(block.resultsJson),
    };
  }

  if (block.type === "tool_call") {
    const toolOutput = block.toolOutputJson;

    const input = block.toolInputJson != null ? [block.toolInputJson] : [];
    const output =
      block.toolName === "web_search"
        ? asArray(toolOutput)
        : toolOutput != null
          ? [toolOutput]
          : [];

    return {
      type: "tool_call",
      status: block.status ?? "FINISHED",
      content: block.content,
      tool_name: block.toolName ?? "unknown",
      tool_call_id: block.toolCallId ?? "",
      input,
      output,
    };
  }

  return {
    type: block.type,
    content: block.content ?? "",
    references: asArray(block.referencesJson),
    stage_id: block.stageId,
  };
}

function toMessageResponse(message: {
  id: number;
  localId: number;
  parentId: number | null;
  model: string;
  role: string;
  thinkingEnabled: boolean;
  banEdit: boolean;
  banRegenerate: boolean;
  status: string;
  incompleteMessage: string | null;
  accumulatedTokenUsage: number;
  feedback: unknown;
  insertedAt: Date;
  searchEnabled: boolean;
  conversationMode: string;
  hasPendingBlock: boolean;
  autoContinue: boolean;
  blocks: Array<{
    id: number;
    localId: number;
    type: string;
    status: string | null;
    content: string | null;
    toolName: string | null;
    toolCallId: string | null;
    toolInputJson: unknown;
    toolOutputJson: unknown;
    queriesJson: unknown;
    resultsJson: unknown;
    referencesJson: unknown;
    stageId: number | null;
  }>;
}) {
  const base = {
    message_id: message.localId,
    parent_id: message.parentId,
    model: message.model,
    role: message.role,
    thinking_enabled: message.thinkingEnabled,
    ban_edit: message.banEdit,
    ban_regenerate: message.banRegenerate,
    status: message.status,
    incomplete_message: message.incompleteMessage,
    accumulated_token_usage: message.accumulatedTokenUsage,
    feedback: message.feedback,
    inserted_at: toEpochSeconds(message.insertedAt),
    search_enabled: message.searchEnabled,
    blocks: message.blocks.map(toBlockResponse),
    has_pending_block: message.hasPendingBlock,
    auto_continue: message.autoContinue,
  };

  if (message.role === "ASSISTANT") {
    return {
      ...base,
      conversation_mode: message.conversationMode,
    };
  }

  return base;
}

export async function historyMessagesHandler(request: Request) {
  const url = new URL(request.url);
  const chatSessionId = url.searchParams.get("chat_session_id")?.trim();

  if (!chatSessionId) {
    return Response.json(
      {
        code: 400,
        msg: "chat_session_id is required",
        data: {
          biz_code: 400,
          biz_msg: "chat_session_id is required",
          biz_data: null,
        },
      },
      { status: 400 },
    );
  }

  const session = await prisma.chatSession.findUnique({
    where: { id: chatSessionId },
    include: {
      messages: {
        orderBy: { localId: "asc" },
        include: {
          blocks: {
            orderBy: { localId: "asc" },
          },
        },
      },
    },
  });

  if (!session) {
    return Response.json(
      {
        code: 404,
        msg: "Chat session not found",
        data: {
          biz_code: 404,
          biz_msg: "Chat session not found",
          biz_data: null,
        },
      },
      { status: 404 },
    );
  }

  return Response.json({
    code: 0,
    msg: "",
    data: {
      biz_code: 0,
      biz_msg: "",
      biz_data: {
        chat_session: {
          id: session.id,
          title: session.title,
          title_type: session.titleType,
          pinned: session.pinned,
          updated_at: toEpochSeconds(session.updatedAt),
          seq_id: session.seqId,
          agent: session.agent,
          version: session.version,
          is_empty: session.isEmpty,
          current_message_id: session.currentMessageId,
          inserted_at: toEpochSeconds(session.insertedAt),
        },
        chat_messages: session.messages.map(toMessageResponse),
        cache_control: "REPLACE",
        cache_reset_at: session.expiresAt
          ? Math.floor(toEpochSeconds(session.expiresAt))
          : Math.floor(Date.now() / 1000),
      },
    },
  });
}
