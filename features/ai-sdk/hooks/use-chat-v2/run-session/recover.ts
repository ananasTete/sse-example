import { initializeConversationState } from "../types";
import {
  RecoveryChatDetailResponse,
  RecoverySnapshot,
  toRunIdentity,
} from "../runtime";
import type { RecoverChatDetailInput } from "./types";

export const recoverChatDetailSnapshotFromServer = async ({
  api,
  chatId,
  headers,
  dispatch,
  setAppliedSeq,
  options,
}: RecoverChatDetailInput): Promise<RecoverySnapshot | null> => {
  try {
    const response = await fetch(`${api}/${chatId}`, {
      method: "GET",
      headers,
    });
    if (!response.ok) {
      throw new Error(`Failed to recover chat detail (${response.status})`);
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

    if (options?.applyConversation !== false) {
      dispatch({
        type: "REPLACE_CONVERSATION",
        payload: {
          conversation: recoveredConversation,
        },
      });
    }

    const recoveredRun = data.active_run ? toRunIdentity(data.active_run) : null;
    if (recoveredRun) {
      setAppliedSeq(recoveredRun.id, recoveredRun.lastPersistedSeq);
    }

    return {
      conversation: recoveredConversation,
      activeRun: recoveredRun,
    };
  } catch (recoveryError) {
    console.warn("Failed to recover chat detail from server", recoveryError);
    return null;
  }
};
