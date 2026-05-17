import { tool, zodSchema } from "ai";
import { z } from "zod";

const editSchema = z.object({
    id: z.string().describe("稳定 id（nanoid），同时作为 DiffBlock 的 suggestionId"),
    original_text: z
        .string()
        .describe(
            "一个段落的完整文本。必须等于文档中某个 textblock 的全部文本，不允许包含段间分隔（\\n\\n）",
        ),
    new_text: z
        .string()
        .describe(
            "替换后的整段文本。空字符串表示删除该段；含 \\n\\n 表示拆段（少数情况）",
        ),
    occurrence_index: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe(
            "当文档中存在多段文本完全等于 original_text 时，用 0-based 索引指明命中第 N 个匹配段。默认 0；段落唯一时省略",
        ),
    rationale: z
        .string()
        .optional()
        .describe("一句话说明改动理由，可选，用于工具块摘要展示"),
});

const proposeEditsSchema = z.object({
    edits: z
        .array(editSchema)
        .min(1)
        .describe("修改列表，至少 1 条，每条对应一个段落"),
});

export type ProposeEditsInput = z.infer<typeof proposeEditsSchema>;

export const proposeEditsTool = tool<ProposeEditsInput, ProposeEditsInput>({
    description:
        "向编辑器提议一组段落级修改。每条 edit 对应文档中的一个完整段落（textblock）。跨 N 段的改动必须返回 N 条 edits，每条对应一段。如果不需要修改，不要调用此工具，直接用文字说明即可。",
    inputSchema: zodSchema(proposeEditsSchema),
    execute: async (input) => input,
});
