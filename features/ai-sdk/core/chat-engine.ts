import { ChatEngineState } from "./chat-engine-state";
import { ChatNetworkManager } from "./chat-engine-network";
import {
  ActiveChatRunV2,
  ChatMessageV2,
  ConversationStateV2,
  OnDataCallbackV2,
  OnErrorCallbackV2,
  OnFinishCallbackV2,
  RequestTrigger,
  StreamChatSettingsV2,
  StreamChatV2RequestBody,
  findLatestAssistantNode,
  getChildrenNodes,
  getPathMessages,
  initializeConversationState,
} from "../hooks/use-chat-v2/types";
import {
  createAssistantPlaceholderNode,
  CreateChatRunResponse,
  createUserNode,
  hasStreamingAssistantParts,
  toRunIdentity,
  RecoveryChatDetailResponse,
} from "../hooks/use-chat-v2/runtime";

export interface ChatEngineOptions {
  api: string;
  chatId: string;
  model: string;
  headers?: Record<string, string>;
  trigger?: RequestTrigger;
  settings?: StreamChatSettingsV2;
  initialConversation: ConversationStateV2;
  initialActiveRun?: ActiveChatRunV2;
  onFinish?: OnFinishCallbackV2;
  onError?: OnErrorCallbackV2;
  onData?: OnDataCallbackV2;
}

export class ChatEngine {
  public state: ChatEngineState;
  private networkManager: ChatNetworkManager;

  private api: string;
  private chatId: string;
  private model: string;
  private headers: Record<string, string>;
  private defaultTrigger: RequestTrigger;
  private settings?: StreamChatSettingsV2;

  // External Callbacks
  private onFinishCallback?: OnFinishCallbackV2;

  constructor(options: ChatEngineOptions) {
    this.api = options.api;
    this.chatId = options.chatId;
    this.model = options.model;
    this.headers = options.headers || {};
    this.defaultTrigger = options.trigger || "submit-message";
    this.settings = options.settings;
    this.onFinishCallback = options.onFinish;

    this.state = new ChatEngineState(
      initializeConversationState(options.initialConversation),
    );

    this.networkManager = new ChatNetworkManager({
      api: options.api,
      chatId: options.chatId,
      model: options.model,
      headers: this.headers,
      engineState: this.state,
      onData: options.onData,
      onError: options.onError,
      onFinish: (assistantNodeId, flags) => {
        const latestConversation = this.state.conversation;
        const latestMessages = getPathMessages(
          latestConversation,
          latestConversation.cursorId,
        );
        const finalMessage = latestConversation.mapping[assistantNodeId]
          ?.message ?? {
          id: assistantNodeId,
          chatId: this.chatId,
          role: "assistant" as const,
          createdAt: new Date().toISOString(),
          model: this.model,
          parts: [],
        };

        this.onFinishCallback?.({
          message: finalMessage,
          messages: latestMessages,
          conversation: latestConversation,
          isAbort: flags.isAbort,
          isDisconnect: flags.isDisconnect,
          isError: flags.isError,
        });
      },
      recoverChatDetailFromServer: async (recoverOpts) => {
        try {
          const response = await fetch(`${this.api}/${this.chatId}`, {
            method: "GET",
            headers: this.headers,
          });
          if (!response.ok) {
            throw new Error(
              `Failed to recover chat detail (${response.status})`,
            );
          }

          const data = (await response.json()) as RecoveryChatDetailResponse;
          if (!data?.conversation?.rootId || !data.conversation.mapping) {
            throw new Error("Invalid chat detail payload");
          }

          const recoveredConversation = initializeConversationState({
            rootId: data.conversation.rootId,
            cursorId: data.conversation.current_leaf_message_id,
            mapping: data.conversation.mapping,
          });

          if (recoverOpts?.applyConversation !== false) {
            this.state.replaceConversation(recoveredConversation);
          }

          const recoveredRun = data.active_run
            ? toRunIdentity(data.active_run)
            : null;

          return {
            conversation: recoveredConversation,
            activeRun: recoveredRun,
          };
        } catch (recoveryError) {
          console.warn(
            "Failed to recover chat detail from server",
            recoveryError,
          );
          return null;
        }
      },
    });
  }

  // --- React Lifecycle Mount & Unmount ---

  public onMount(initialActiveRun?: ActiveChatRunV2) {
    if (this.networkManager.activeRun) return; // Prevent duplicate resumes

    if (initialActiveRun && initialActiveRun.status === "running") {
      const snapshot = this.state.conversation;
      if (!snapshot.mapping[initialActiveRun.assistantMessageId]) {
        return;
      }
      this.networkManager
        .connectToStreamAsync(
          toRunIdentity(initialActiveRun),
          initialActiveRun.assistantMessageId,
        )
        .catch((err) => {
          console.warn("Failed to resume initial active run", err);
        });
      return;
    }

    const snapshot = this.state.conversation;
    if (
      initialActiveRun?.status !== "running" &&
      hasStreamingAssistantParts(snapshot)
    ) {
      console.info(
        "Detected stale streaming snapshot without active run; reconciling",
        { chatId: this.chatId },
      );
      this.networkManager
        .recoverChatDetailFromServer({ applyConversation: true })
        .then((recovered) => {
          if (!recovered) return;
          const recoveredRun = recovered.activeRun;
          if (
            recoveredRun &&
            recoveredRun.status === "running" &&
            recovered.conversation.mapping[recoveredRun.assistantMessageId]
          ) {
            this.networkManager
              .connectToStreamAsync(
                recoveredRun,
                recoveredRun.assistantMessageId,
              )
              .catch((err) => {
                console.warn(
                  "Failed to resume run after snapshot reconciliation",
                  err,
                );
              });
          }
        });
    }
  }

  // --- External API for React UI ---

  public getSnapshot() {
    return this.state.getSnapshot();
  }

  public subscribe(listener: () => void) {
    return this.state.subscribe(listener);
  }

  public getActiveMessages() {
    return this.state.getActiveMessages();
  }

  public setInput(input: string) {
    this.state.setInput(input);
  }

  public setCursor(nodeId: string) {
    this.state.setCursor(nodeId);
  }

  public getPathMessagesByNode(nodeId: string) {
    if (!this.state.conversation.mapping[nodeId]) return [];
    return getPathMessages(this.state.conversation, nodeId);
  }

  public getChildren(nodeId: string) {
    return getChildrenNodes(this.state.conversation, nodeId);
  }

  // --- Main Actions ---

  public async sendMessage(
    content: string,
    options?: { parentId?: string; trigger?: RequestTrigger },
  ) {
    if (!content.trim()) return;

    const parentId = options?.parentId ?? this.state.conversation.cursorId;
    if (!this.state.conversation.mapping[parentId]) {
      throw new Error(`parentId ${parentId} not found in conversation mapping`);
    }

    const userNode = createUserNode(this.chatId, content, parentId);
    const assistantNode = createAssistantPlaceholderNode(
      this.chatId,
      userNode.id,
      this.model,
    );

    this.state.addUserWithAssistantPlaceholder(
      parentId,
      userNode,
      assistantNode,
    );

    await this.runStreamRequest(
      assistantNode.id,
      parentId,
      userNode.message as ChatMessageV2,
      options?.trigger ?? this.defaultTrigger,
    );
  }

  public async regenerate(options?: { assistantMessageId?: string }) {
    const conversationSnapshot = this.state.conversation;

    const targetAssistantNode = options?.assistantMessageId
      ? conversationSnapshot.mapping[options.assistantMessageId]
      : findLatestAssistantNode(conversationSnapshot);

    if (!targetAssistantNode || targetAssistantNode.role !== "assistant") {
      console.warn("Assistant node not found for regenerate");
      return;
    }

    if (!targetAssistantNode.parentId) {
      console.warn("Target assistant node has no parent user node");
      return;
    }

    const targetUserNode =
      conversationSnapshot.mapping[targetAssistantNode.parentId];
    if (
      !targetUserNode ||
      targetUserNode.role !== "user" ||
      !targetUserNode.message
    ) {
      console.warn("Target user node not found for regenerate");
      return;
    }

    if (!targetUserNode.parentId) {
      console.warn("Target user node has no parentId");
      return;
    }

    const variantAssistantNode = createAssistantPlaceholderNode(
      this.chatId,
      targetUserNode.id,
      this.model,
    );

    this.state.addAssistantVariantPlaceholder(
      targetUserNode.id,
      variantAssistantNode,
    );

    await this.runStreamRequest(
      variantAssistantNode.id,
      targetUserNode.parentId,
      targetUserNode.message,
      "regenerate-message",
    );
  }

  public stop() {
    this.networkManager.abortActiveStream("manual-stop");

    this.state.abortStreaming(
      this.networkManager.streamingAssistantNodeId ??
        this.networkManager.activeRun?.assistantMessageId ??
        undefined,
    );

    this.networkManager.cancelActiveRun();
  }

  public destroy() {
    this.networkManager.abortActiveStream("hook-unmount");
  }

  // --- External Run Execution ---

  private async createRun(
    parentId: string,
    message: ChatMessageV2,
    trigger: RequestTrigger,
  ) {
    const payload: StreamChatV2RequestBody = {
      model: this.model,
      trigger,
      parentId,
      message,
      ...(this.settings ? { settings: this.settings } : {}),
    };

    const response = await fetch(`${this.api}/${this.chatId}/runs`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...this.headers,
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(response.statusText || "Failed to create chat run");
    }

    const data = (await response.json()) as CreateChatRunResponse;
    return toRunIdentity(data);
  }

  private async runStreamRequest(
    assistantNodeId: string,
    parentId: string,
    message: ChatMessageV2,
    trigger: RequestTrigger,
  ) {
    const createdRun = await this.createRun(parentId, message, trigger);

    if (createdRun.assistantMessageId !== assistantNodeId) {
      this.state.renameAssistantNode(
        assistantNodeId,
        createdRun.assistantMessageId,
        this.model,
      );
    }

    await this.networkManager.connectToStreamAsync(
      createdRun,
      createdRun.assistantMessageId,
    );
  }
}
