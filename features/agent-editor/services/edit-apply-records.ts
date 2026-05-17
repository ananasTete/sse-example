/**
 * edit 粒度的 apply 记录（内存）
 *
 * 用于去重：SSE 重连、resume_stream、组件 re-mount 都会触发 effect 重跑，
 * 用内存 Map 记录已处理的 (toolCallId, editId) 对，避免重复应用。
 *
 * 生命周期：与页面会话相同，刷新后清空。
 * - propose_edits 的 DiffBlock 持久化在文档里，刷新后不需要重新应用。
 * - apply_edit 是直接替换，刷新后文档已是新内容，不需要重新应用。
 * 所以不需要持久化到 localStorage。
 */

type EditApplyState =
    | { status: "applied" }
    | { status: "failed"; reason: "not-found" | "editor-not-ready" };

interface EditApplyRecord {
    state: EditApplyState;
}

const records = new Map<string, EditApplyRecord>();

function makeKey(toolCallId: string, editId: string) {
    return `${toolCallId}::${editId}`;
}

export const editApplyRecords = {
    lookup(toolCallId: string, editId: string): EditApplyRecord | null {
        return records.get(makeKey(toolCallId, editId)) ?? null;
    },

    markApplied(toolCallId: string, editId: string) {
        records.set(makeKey(toolCallId, editId), { state: { status: "applied" } });
    },

    markFailed(
        toolCallId: string,
        editId: string,
        reason: Extract<EditApplyState, { status: "failed" }>["reason"],
    ) {
        records.set(makeKey(toolCallId, editId), {
            state: { status: "failed", reason },
        });
    },

    /** 清除单条 edit 的记录，允许重试 */
    clearForEdit(toolCallId: string, editId: string) {
        records.delete(makeKey(toolCallId, editId));
    },

    /** 清除某个 toolCallId 下的所有记录 */
    clearForToolCall(toolCallId: string) {
        for (const key of records.keys()) {
            if (key.startsWith(`${toolCallId}::`)) {
                records.delete(key);
            }
        }
    },

    /** 获取 edit 的状态（用于 UI 展示） */
    getState(toolCallId: string, editId: string): EditApplyState | null {
        return records.get(makeKey(toolCallId, editId))?.state ?? null;
    },
};

export type { EditApplyState, EditApplyRecord };
