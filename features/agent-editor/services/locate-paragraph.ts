import type { Node as ProseMirrorNode } from "@tiptap/pm/model";

/**
 * 在 ProseMirror 文档中定位与 originalText 完全匹配的段落（textblock）。
 *
 * 规则：
 * - 跳过 pending DiffBlock，避免已插入的 DiffBlock 干扰后续 edit 的匹配
 * - 整段文本相等才算命中（段内换行用 "\n" 分隔，对应 hard break）
 * - 多个候选时用 occurrenceIndex（0-based）选定
 * - 越界或找不到时返回 null
 *
 * 注意：originalText 必须是完整段落文本，不能是子串。
 * AI 应当遵守"edit 锚点 = 段落"的约定，提供整段文本。
 */
export function locateParagraph(
    doc: ProseMirrorNode,
    originalText: string,
    occurrenceIndex = 0,
): { from: number; to: number } | null {
    const candidates: Array<{ from: number; to: number }> = [];

    doc.descendants((node, pos) => {
        // 跳过 pending DiffBlock，不让它干扰后续 edit 的匹配
        if (node.type.name === "diffBlock") return false;
        if (!node.isTextblock) return true;

        const text = node.textBetween(0, node.content.size, "\n");
        if (text === originalText) {
            candidates.push({ from: pos, to: pos + node.nodeSize });
        }
        return true;
    });

    return candidates[occurrenceIndex] ?? null;
}

/**
 * 定位连续多个 textblock 拼接后与 originalText 完全相等的范围。
 *
 * 用于兼容 apply_edit 偶发把跨段选区放进单条 edit 的情况。
 * 段间用 "\n\n" 拼接，仍然要求每个 textblock 都完整参与匹配。
 */
export function locateParagraphSequence(
    doc: ProseMirrorNode,
    originalText: string,
    occurrenceIndex = 0,
): { from: number; to: number } | null {
    const blocks: Array<{ from: number; to: number; text: string }> = [];

    doc.descendants((node, pos) => {
        if (node.type.name === "diffBlock") return false;
        if (!node.isTextblock) return true;

        blocks.push({
            from: pos,
            to: pos + node.nodeSize,
            text: node.textBetween(0, node.content.size, "\n"),
        });
        return true;
    });

    const candidates: Array<{ from: number; to: number }> = [];

    for (let start = 0; start < blocks.length; start += 1) {
        let text = "";

        for (let end = start; end < blocks.length; end += 1) {
            text = end === start ? blocks[end].text : `${text}\n\n${blocks[end].text}`;

            if (text === originalText) {
                candidates.push({
                    from: blocks[start].from,
                    to: blocks[end].to,
                });
                break;
            }

            if (text.length >= originalText.length) break;
        }
    }

    return candidates[occurrenceIndex] ?? null;
}

/**
 * 检查编辑器中是否已存在指定 suggestionId 的 DiffBlock
 * 用于兜底去重（覆盖内存记录丢失等极端场景）
 */
export function hasDiffBlockBySuggestionId(
    doc: ProseMirrorNode,
    suggestionId: string,
): boolean {
    let found = false;
    doc.descendants((node) => {
        if (found) return false;
        if (
            node.type.name === "diffBlock" &&
            node.attrs.suggestionId === suggestionId
        ) {
            found = true;
            return false;
        }
        return true;
    });
    return found;
}
