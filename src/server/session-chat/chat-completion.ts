import {
  createDeepSeek,
  type DeepSeekLanguageModelOptions,
} from "@ai-sdk/deepseek";
import { streamText } from "ai";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  SSE_HEADERS,
  createSseResponse,
  sendSseEvent,
  sendSseFrame,
} from "@/src/server/http/sse";

// 最新配置，不要改这里
const MODEL_API_KEY_ENV = ["DEEP", "SEEK_API_KEY"].join("");
const MODEL_API_BASE_URL_ENV = ["DEEP", "SEEK_API_BASE_URL"].join("");
const MODEL_NAME_ENV = ["DEEP", "SEEK_MODEL"].join("");
const TAVILY_API_KEY_ENV = "TAVILY_API_KEY";
const TAVILY_API_BASE_URL_ENV = "TAVILY_API_BASE_URL";
const DEFAULT_MODEL_API_BASE_URL = ["https://api.", "deep", "seek.com"].join(
  "",
);
const DEFAULT_MODEL_NAME = ["deep", "seek-v4-flash"].join("");
const DEFAULT_TAVILY_API_BASE_URL = "https://api.tavily.com";
const DEFAULT_TAVILY_MAX_RESULTS = 10;

interface CompletionRequestBody {
  chat_session_id: string;
  parent_message_id: number | null;
  model_type: string;
  prompt: string;
  ref_file_ids: string[];
  thinking_enabled: boolean;
  search_enabled: boolean;
  preempt: boolean;
}

interface ChatCompletionHandlerOptions {
  streamText?: typeof streamText;
  webSearch?: WebSearchFn;
}

class CompletionHttpError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

const activeCompletionControllers = new Map<
  string,
  {
    assistantMessageId: number;
    controller: AbortController;
  }
>();

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

const toEpochSeconds = (date: Date) => date.getTime() / 1000;

interface SearchQueryPayload {
  query: string;
}

interface SearchResultPayload {
  url: string;
  title: string;
  snippet: string;
  cite_index: number;
  published_at?: number | null;
  site_icon?: string;
  site_name?: string;
  query_indexes?: number[];
}

interface WebSearchPayload {
  queries: SearchQueryPayload[];
  results: SearchResultPayload[];
}

type WebSearchFn = (
  query: string,
  options?: { signal?: AbortSignal },
) => Promise<WebSearchPayload>;

function getStringField(value: unknown, key: string) {
  if (!isRecord(value)) return "";
  const field = value[key];
  return typeof field === "string" ? field : "";
}

function getNumberField(value: unknown, key: string) {
  if (!isRecord(value)) return null;
  const field = value[key];
  return typeof field === "number" ? field : null;
}

function getArrayField(value: unknown, key: string) {
  if (!isRecord(value)) return [];
  const field = value[key];
  return Array.isArray(field) ? field : [];
}

function toSearchQueryPayload(query: string): SearchQueryPayload | null {
  const normalizedQuery = query.trim();
  return normalizedQuery ? { query: normalizedQuery } : null;
}

function getSiteName(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function getEpochSeconds(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return null;

  const time = Date.parse(value);
  return Number.isNaN(time) ? null : time / 1000;
}

function toSearchResultPayload(
  value: unknown,
  citeIndex: number,
): SearchResultPayload | null {
  if (!isRecord(value)) return null;

  const url = getStringField(value, "url");
  if (!url) return null;

  const title = getStringField(value, "title") || url;
  const snippet =
    getStringField(value, "content") ||
    getStringField(value, "snippet") ||
    getStringField(value, "text");
  const publishedAt =
    getEpochSeconds(value.published_at) ??
    getEpochSeconds(value.publishedAt) ??
    getEpochSeconds(value.published_date) ??
    getEpochSeconds(value.publishedDate);
  const siteIcon =
    getStringField(value, "favicon") ||
    getStringField(value, "site_icon") ||
    getStringField(value, "siteIcon");
  const siteName =
    getStringField(value, "site_name") ||
    getStringField(value, "siteName") ||
    getStringField(value, "source") ||
    getSiteName(url);

  return {
    url,
    title,
    snippet,
    cite_index: getNumberField(value, "cite_index") ?? citeIndex,
    ...(publishedAt !== null ? { published_at: publishedAt } : {}),
    ...(siteIcon ? { site_icon: siteIcon } : {}),
    ...(siteName ? { site_name: siteName } : {}),
    query_indexes: [0],
  } satisfies SearchResultPayload;
}

async function runTavilySearch(
  queryText: string,
  options: { signal?: AbortSignal } = {},
): Promise<WebSearchPayload> {
  const query = toSearchQueryPayload(queryText);
  if (!query) {
    return { queries: [], results: [] };
  }

  const apiKey = process.env[TAVILY_API_KEY_ENV];
  if (!apiKey) {
    throw new Error(`Missing ${TAVILY_API_KEY_ENV} environment variable`);
  }

  const baseURL =
    process.env[TAVILY_API_BASE_URL_ENV] ?? DEFAULT_TAVILY_API_BASE_URL;
  const response = await fetch(`${baseURL.replace(/\/$/, "")}/search`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: query.query,
      topic: "general",
      search_depth: "basic",
      max_results: DEFAULT_TAVILY_MAX_RESULTS,
      include_answer: false,
      include_raw_content: false,
    }),
    signal: options.signal,
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");
    throw new Error(
      `Tavily search failed: ${response.status}${errorText ? ` ${errorText.slice(0, 300)}` : ""}`,
    );
  }

  const data = (await response.json()) as unknown;
  const results = getArrayField(data, "results")
    .map((item, index) => toSearchResultPayload(item, index + 1))
    .filter((item): item is SearchResultPayload => item !== null);

  return {
    queries: [query],
    results,
  };
}

function buildSearchSystemPrompt(searchResults: SearchResultPayload[]) {
  if (searchResults.length === 0) return undefined;

  return [
    "你可以使用以下搜索结果回答用户问题。",
    "回答必须基于搜索结果；引用来源时使用 [citation:N]，N 对应搜索结果编号。",
    "搜索结果无法支持的内容，直接说明当前搜索结果未提供。",
    "",
    ...searchResults.map((result) =>
      [
        `[${result.cite_index}] ${result.title}`,
        `URL: ${result.url}`,
        result.published_at
          ? `Published at: ${new Date(result.published_at * 1000).toISOString()}`
          : null,
        `Snippet: ${result.snippet}`,
      ]
        .filter(Boolean)
        .join("\n"),
    ),
  ].join("\n\n");
}

function parseCompletionRequestBody(body: unknown): CompletionRequestBody {
  if (!isRecord(body)) {
    throw new Error("request body must be an object");
  }

  const chatSessionId = body.chat_session_id;
  const prompt = body.prompt;
  const parentMessageId = body.parent_message_id;

  if (typeof chatSessionId !== "string" || !chatSessionId.trim()) {
    throw new Error("chat_session_id is required");
  }

  if (typeof prompt !== "string" || !prompt.trim()) {
    throw new Error("prompt is required");
  }

  if (
    parentMessageId !== null &&
    parentMessageId !== undefined &&
    (typeof parentMessageId !== "number" ||
      !Number.isSafeInteger(parentMessageId) ||
      parentMessageId <= 0)
  ) {
    throw new Error("parent_message_id must be a positive integer");
  }

  return {
    chat_session_id: chatSessionId.trim(),
    parent_message_id: parentMessageId ?? null,
    model_type:
      typeof body.model_type === "string" && body.model_type.trim()
        ? body.model_type.trim()
        : "default",
    prompt: prompt.trim(),
    ref_file_ids: Array.isArray(body.ref_file_ids)
      ? body.ref_file_ids.filter(
          (fileId): fileId is string => typeof fileId === "string",
        )
      : [],
    thinking_enabled:
      typeof body.thinking_enabled === "boolean"
        ? body.thinking_enabled
        : false,
    search_enabled:
      typeof body.search_enabled === "boolean" ? body.search_enabled : false,
    preempt: typeof body.preempt === "boolean" ? body.preempt : false,
  };
}

function toResponseMessagePayload(input: {
  messageId: number;
  parentId: number;
  thinkingEnabled: boolean;
  searchEnabled: boolean;
  insertedAt: Date;
  fragments?: unknown[];
  hasPendingFragment?: boolean;
}) {
  return {
    message_id: input.messageId,
    parent_id: input.parentId,
    model: "",
    role: "ASSISTANT",
    thinking_enabled: input.thinkingEnabled,
    ban_edit: false,
    ban_regenerate: false,
    status: "WIP",
    incomplete_message: null,
    accumulated_token_usage: 0,
    feedback: null,
    inserted_at: toEpochSeconds(input.insertedAt),
    search_enabled: input.searchEnabled,
    fragments: input.fragments ?? [],
    conversation_mode: input.searchEnabled ? "SEARCH" : "DEFAULT",
    has_pending_fragment: input.hasPendingFragment ?? false,
    auto_continue: false,
  };
}

function createCompletionErrorSseResponse(message: string, status: number) {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      sendSseFrame(controller, encoder, {
        event: "error",
        data: {
          message,
        },
      });
      sendSseFrame(controller, encoder, {
        event: "close",
        data: {
          click_behavior: "none",
          auto_resume: false,
        },
      });
      controller.close();
    },
  });

  return new Response(stream, {
    status,
    headers: SSE_HEADERS,
  });
}

async function createCompletionTurn(body: CompletionRequestBody) {
  return prisma.$transaction(async (tx) => {
    const reservedSession = await tx.chatSession.update({
      where: { id: body.chat_session_id },
      data: {
        nextMessageId: { increment: 2 },
      },
      select: {
        nextMessageId: true,
      },
    });

    const activeAssistantMessage = await tx.chatMessage.findFirst({
      where: {
        chatSessionId: body.chat_session_id,
        role: "ASSISTANT",
        status: "WIP",
      },
      select: { id: true },
      orderBy: { insertedAt: "desc" },
    });

    if (activeAssistantMessage) {
      if (!body.preempt) {
        throw new CompletionHttpError("A completion is already in progress", 409);
      }

      await tx.chatMessage.updateMany({
        where: {
          chatSessionId: body.chat_session_id,
          role: "ASSISTANT",
          status: "WIP",
        },
        data: {
          status: "FAILED",
          incompleteMessage: "Completion preempted",
          hasPendingFragment: false,
        },
      });
    }

    if (body.parent_message_id !== null) {
      const parentMessage = await tx.chatMessage.findFirst({
        where: {
          chatSessionId: body.chat_session_id,
          localId: body.parent_message_id,
        },
        select: { localId: true },
      });

      if (!parentMessage) {
        throw new CompletionHttpError("parent_message_id is invalid", 400);
      }
    }

    const userMessageLocalId = reservedSession.nextMessageId - 1;
    const assistantMessageLocalId = reservedSession.nextMessageId;

    const userMessage = await tx.chatMessage.create({
      data: {
        localId: userMessageLocalId,
        chatSessionId: body.chat_session_id,
        parentId: body.parent_message_id,
        role: "USER",
        status: "FINISHED",
        accumulatedTokenUsage: body.prompt.length,
        searchEnabled: body.search_enabled,
        fragments: {
          create: {
            localId: 1,
            type: "REQUEST",
            content: body.prompt,
          },
        },
      },
    });

    const assistantMessage = await tx.chatMessage.create({
      data: {
        localId: assistantMessageLocalId,
        chatSessionId: body.chat_session_id,
        parentId: userMessage.localId,
        role: "ASSISTANT",
        status: "WIP",
        thinkingEnabled: body.thinking_enabled,
        searchEnabled: body.search_enabled,
        conversationMode: body.search_enabled ? "SEARCH" : "DEFAULT",
        hasPendingFragment: true,
      },
    });

    const updatedSession = await tx.chatSession.update({
      where: { id: body.chat_session_id },
      data: {
        currentMessageId: assistantMessage.localId,
        isEmpty: false,
        modelType: body.model_type,
        version: { increment: 1 },
      },
      select: { updatedAt: true },
    });

    return {
      userMessage,
      assistantMessage,
      updatedSession,
    };
  });
}

export async function chatCompletionHandler(
  request: Request,
  options: ChatCompletionHandlerOptions = {},
) {
  const apiKey = process.env[MODEL_API_KEY_ENV];
  if (!apiKey) {
    return createCompletionErrorSseResponse(
      `Missing ${MODEL_API_KEY_ENV} environment variable`,
      500,
    );
  }

  let body: CompletionRequestBody;
  try {
    body = parseCompletionRequestBody(await request.json());
  } catch (error) {
    return createCompletionErrorSseResponse(
      error instanceof Error ? error.message : "Invalid request body",
      400,
    );
  }

  let turn: Awaited<ReturnType<typeof createCompletionTurn>>;
  try {
    turn = await createCompletionTurn(body);
  } catch (error) {
    const status =
      error instanceof CompletionHttpError
        ? error.status
        : error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2025"
          ? 404
          : 500;
    const message =
      error instanceof CompletionHttpError
        ? error.message
        : status === 404
          ? "Chat session not found"
          : "Failed to create completion";

    return createCompletionErrorSseResponse(
      message,
      status,
    );
  }

  if (body.preempt) {
    activeCompletionControllers.get(body.chat_session_id)?.controller.abort();
  }

  const completionController = new AbortController();
  activeCompletionControllers.set(body.chat_session_id, {
    assistantMessageId: turn.assistantMessage.id,
    controller: completionController,
  });

  request.signal.addEventListener(
    "abort",
    () => {
      completionController.abort();
    },
    { once: true },
  );

  const modelProvider = createDeepSeek({
    apiKey,
    baseURL: process.env[MODEL_API_BASE_URL_ENV] ?? DEFAULT_MODEL_API_BASE_URL,
  });

  const streamTextFn = options.streamText ?? streamText;
  const webSearch = options.webSearch ?? runTavilySearch;

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let fragmentId: number | null = null;
      let searchFragmentId: number | null = null;
      let searchFragmentLocalId: number | null = null;
      let searchStatus = "WIP";
      let searchQueries: SearchQueryPayload[] = [];
      let searchResults: SearchResultPayload[] = [];
      let content = "";
      let lastPersistedContent = "";
      let lastPersistedAt = 0;
      let tokenUsage = 0;
      let lastPatchPath: string | null = null;
      let lastPatchOperation: string | null = null;
      let responseInitialized = false;
      let nextAssistantFragmentLocalId = 1;

      const resetPatchContext = () => {
        lastPatchPath = null;
        lastPatchOperation = null;
      };

      const sendData = (data: object | string) => {
        sendSseEvent(controller, encoder, data);
      };

      const sendFullData = (data: object | string) => {
        resetPatchContext();
        sendData(data);
      };

      const sendPatch = (patch: { p: string; o?: string; v: unknown }) => {
        const operation = patch.o ?? null;

        if (patch.p === lastPatchPath && operation === lastPatchOperation) {
          sendData({ v: patch.v });
          return;
        }

        lastPatchPath = patch.p;
        lastPatchOperation = operation;
        sendData(patch);
      };

      const sendEventFrame = (frame: {
        event: string;
        data: object | string;
      }) => {
        resetPatchContext();
        sendSseFrame(controller, encoder, frame);
      };

      const persistContent = async (force = false) => {
        if (fragmentId === null || content === lastPersistedContent) return;

        const now = Date.now();
        if (!force && now - lastPersistedAt < 500) return;

        await prisma.messageFragment.update({
          where: { id: fragmentId },
          data: {
            content,
          },
        });
        lastPersistedContent = content;
        lastPersistedAt = now;
      };

      const persistSearchFragment = async () => {
        if (searchFragmentId === null) return;

        await prisma.messageFragment.update({
          where: { id: searchFragmentId },
          data: {
            status: searchStatus,
            queriesJson: searchQueries as unknown as Prisma.InputJsonArray,
            resultsJson: searchResults as unknown as Prisma.InputJsonArray,
          },
        });
      };

      const createSearchFragment = async () => {
        const localId = nextAssistantFragmentLocalId;
        nextAssistantFragmentLocalId += 1;

        const fragment = await prisma.messageFragment.create({
          data: {
            localId,
            messageId: turn.assistantMessage.id,
            type: "SEARCH",
            status: searchStatus,
            content: null,
            queriesJson: searchQueries as unknown as Prisma.InputJsonArray,
            resultsJson: searchResults as unknown as Prisma.InputJsonArray,
          },
        });

        searchFragmentId = fragment.id;
        searchFragmentLocalId = fragment.localId;

        return fragment;
      };

      const createResponseFragment = async (initialContent: string) => {
        const localId = nextAssistantFragmentLocalId;
        nextAssistantFragmentLocalId += 1;

        const fragment = await prisma.messageFragment.create({
          data: {
            localId,
            messageId: turn.assistantMessage.id,
            type: "RESPONSE",
            content: initialContent,
            referencesJson: [] as Prisma.InputJsonArray,
            stageId: body.search_enabled ? searchFragmentLocalId : null,
          },
        });

        fragmentId = fragment.id;
        lastPersistedContent = initialContent;
        lastPersistedAt = Date.now();

        return fragment;
      };

      const ensureResponseInitialized = async () => {
        if (responseInitialized) return;

        if (body.search_enabled) {
          const searchFragment = await createSearchFragment();
          sendInitialSearchResponse(searchFragment);
          return;
        }

        const fragment = await createResponseFragment("");
        sendInitialResponse(fragment);
      };

      const finishSearchFragment = async () => {
        if (!body.search_enabled || searchStatus === "FINISHED") return;

        searchStatus = "FINISHED";
        await persistSearchFragment();
        sendPatch({
          p: `response/fragments/${fragmentId === null ? "-1" : "0"}/status`,
          o: "SET",
          v: searchStatus,
        });
      };

      const ensureResponseFragmentInitialized = async () => {
        if (fragmentId !== null) return;

        if (body.search_enabled) {
          await ensureResponseInitialized();
          await finishSearchFragment();
          const fragment = await createResponseFragment("");
          sendFullData({
            p: "response",
            o: "BATCH",
            v: [
              {
                p: "fragments",
                o: "APPEND",
                v: {
                  id: fragment.localId,
                  type: "RESPONSE",
                  content: fragment.content ?? "",
                  references: [],
                  stage_id: searchFragmentLocalId,
                },
              },
              {
                p: "has_pending_fragment",
                o: "SET",
                v: false,
              },
            ],
          });
          return;
        }

        const fragment = await createResponseFragment("");
        sendInitialResponse(fragment);
      };

      const sendInitialSearchResponse = (fragment: {
        localId: number;
        content: string | null;
        status: string | null;
      }) => {
        responseInitialized = true;
        sendFullData({
          v: {
            response: toResponseMessagePayload({
              messageId: turn.assistantMessage.localId,
              parentId: turn.userMessage.localId,
              thinkingEnabled: body.thinking_enabled,
              searchEnabled: body.search_enabled,
              insertedAt: turn.assistantMessage.insertedAt,
              fragments: [
                {
                  id: fragment.localId,
                  type: "SEARCH",
                  status: fragment.status ?? searchStatus,
                  content: fragment.content,
                  queries: searchQueries,
                  results: searchResults,
                },
              ],
              hasPendingFragment: false,
            }),
          },
        });
      };

      const sendInitialResponse = (fragment: {
        localId: number;
        content: string | null;
      }) => {
        responseInitialized = true;
        sendFullData({
          v: {
            response: toResponseMessagePayload({
              messageId: turn.assistantMessage.localId,
              parentId: turn.userMessage.localId,
              thinkingEnabled: body.thinking_enabled,
              searchEnabled: body.search_enabled,
              insertedAt: turn.assistantMessage.insertedAt,
              fragments: [
                {
                  id: fragment.localId,
                  type: "RESPONSE",
                  content: fragment.content ?? "",
                  references: [],
                  stage_id: 1,
                },
              ],
              hasPendingFragment: false,
            }),
          },
        });
      };

      const upsertSearchQuery = async (queryText: string) => {
        if (!body.search_enabled) return;

        const query = toSearchQueryPayload(queryText);
        if (!query) return;

        if (searchQueries.some((item) => item.query === query.query)) return;

        const wasInitialized = responseInitialized;
        searchQueries = [...searchQueries, query];
        await ensureResponseInitialized();
        await persistSearchFragment();
        if (wasInitialized) {
          sendPatch({
            p: `response/fragments/${fragmentId === null ? "-1" : "0"}/queries`,
            o: "SET",
            v: searchQueries,
          });
        }
      };

      const appendSearchResult = async (value: unknown) => {
        if (!body.search_enabled) return;
        await ensureResponseInitialized();

        const result = toSearchResultPayload(value, searchResults.length + 1);
        if (!result) return;

        if (searchResults.some((item) => item.url === result.url)) return;

        searchResults = [...searchResults, result];
        await persistSearchFragment();
        sendPatch({
          p: `response/fragments/${fragmentId === null ? "-1" : "0"}/results`,
          v: searchResults,
        });
      };

      const performWebSearch = async () => {
        if (!body.search_enabled) return;

        await upsertSearchQuery(body.prompt);
        const searchPayload = await webSearch(body.prompt, {
          signal: completionController.signal,
        });

        for (const query of searchPayload.queries) {
          await upsertSearchQuery(query.query);
        }

        for (const result of searchPayload.results) {
          await appendSearchResult(result);
        }
      };

      sendEventFrame({
        event: "ready",
        data: {
          request_message_id: turn.userMessage.localId,
          response_message_id: turn.assistantMessage.localId,
          model_type: body.model_type,
        },
      });

      sendEventFrame({
        event: "update_session",
        data: {
          updated_at: toEpochSeconds(turn.updatedSession.updatedAt),
        },
      });

      try {
        await performWebSearch();

        const searchSystemPrompt = body.search_enabled
          ? buildSearchSystemPrompt(searchResults)
          : undefined;
        const result = streamTextFn({
          model: modelProvider.chat(
            process.env[MODEL_NAME_ENV] ?? DEFAULT_MODEL_NAME,
          ),
          ...(searchSystemPrompt ? { system: searchSystemPrompt } : {}),
          prompt: body.prompt,
          abortSignal: completionController.signal,
          providerOptions: {
            deepseek: {
              thinking: {
                type: body.thinking_enabled ? "enabled" : "disabled",
              },
            } satisfies DeepSeekLanguageModelOptions,
          },
        });

        for await (const part of result.fullStream) {
          if (part.type === "text-delta") {
            await ensureResponseFragmentInitialized();
            content += part.text;

            await persistContent();

            sendPatch({
              p: "response/fragments/-1/content",
              o: "APPEND",
              v: part.text,
            });
          }

          if (part.type === "finish") {
            tokenUsage = part.totalUsage.totalTokens ?? 0;
          }
        }

        if (fragmentId === null) {
          await ensureResponseFragmentInitialized();
        }

        await persistContent(true);

        const finished = await prisma.$transaction(async (tx) => {
          const updateResult = await tx.chatMessage.updateMany({
            where: { id: turn.assistantMessage.id, status: "WIP" },
            data: {
              status: "FINISHED",
              accumulatedTokenUsage: tokenUsage,
              hasPendingFragment: false,
            },
          });

          if (updateResult.count === 0) {
            return null;
          }

          const assistantMessage = await tx.chatMessage.findUniqueOrThrow({
            where: { id: turn.assistantMessage.id },
          });

          const session = await tx.chatSession.update({
            where: { id: body.chat_session_id },
            data: {
              title: body.prompt.slice(0, 30),
              titleType: "SYSTEM",
              version: { increment: 1 },
            },
            select: { updatedAt: true, title: true },
          });

          return { assistantMessage, session };
        });

        if (!finished) {
          sendEventFrame({
            event: "close",
            data: {
              click_behavior: "none",
              auto_resume: false,
            },
          });
          return;
        }

        sendFullData({
          p: "response",
          o: "BATCH",
          v: [
            {
              p: "accumulated_token_usage",
              v: tokenUsage,
            },
            {
              p: "quasi_status",
              v: "FINISHED",
            },
          ],
        });

        sendPatch({
          p: "response/status",
          o: "SET",
          v: finished.assistantMessage.status,
        });

        sendEventFrame({
          event: "update_session",
          data: {
            updated_at: toEpochSeconds(finished.session.updatedAt),
          },
        });

        sendEventFrame({
          event: "title",
          data: {
            content: finished.session.title ?? "新会话",
          },
        });

        sendEventFrame({
          event: "close",
          data: {
            click_behavior: "none",
            auto_resume: false,
          },
        });
      } catch (error) {
        if (!responseInitialized) {
          await ensureResponseInitialized();
        }

        try {
          await persistContent(true);
        } catch (persistError) {
          console.error("Failed to persist partial completion", persistError);
        }

        const errorMessage = completionController.signal.aborted
          ? "Completion aborted"
          : "Completion failed";
        console.error("Chat completion stream failed", error);

        if (searchFragmentId !== null && searchStatus !== "FINISHED") {
          searchStatus = "FINISHED";
          await persistSearchFragment();
          sendPatch({
            p: `response/fragments/${fragmentId === null ? "-1" : "0"}/status`,
            o: "SET",
            v: searchStatus,
          });
        }

        await prisma.chatMessage.updateMany({
          where: { id: turn.assistantMessage.id, status: "WIP" },
          data: {
            status: "FAILED",
            incompleteMessage: errorMessage,
            hasPendingFragment: false,
          },
        });

        if (responseInitialized) {
          sendPatch({
            p: "response/status",
            o: "SET",
            v: "FAILED",
          });
        }

        sendEventFrame({
          event: "error",
          data: {
            message: errorMessage,
          },
        });

        sendEventFrame({
          event: "close",
          data: {
            click_behavior: "none",
            auto_resume: false,
          },
        });
      } finally {
        const activeController = activeCompletionControllers.get(
          body.chat_session_id,
        );
        if (
          activeController?.assistantMessageId === turn.assistantMessage.id
        ) {
          activeCompletionControllers.delete(body.chat_session_id);
        }
        controller.close();
      }
    },
  });

  return createSseResponse(stream);
}
