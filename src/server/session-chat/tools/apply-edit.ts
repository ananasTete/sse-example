import { tool, zodSchema } from "ai";
import { z } from "zod";

const editSchema = z.object({
    original_text: z
        .string()
        .describe("段落完整原文，用于客户端定位。必须等于文档中某个 textblock 的全部文本"),
    new_text: z
        .string()
        .describe("段落替换后内容，可为空字符串（删除该段）"),
    occurrence_index: z
        .number()
        .int()
        .min(0)
        .optional()
        .describe("重复段消歧，0-based，默认 0"),
});

const applyEditSchema = z.object({
    edits: z
        .array(editSchema)
        .min(1)
        .describe("要应用的修改列表，每条对应一个段落"),
    origin_id: z
        .string()
        .optional()
        .describe("来源文档 ID，沿用上一轮 at_references 的 origin_id"),
});

export type ApplyEditInput = z.infer<typeof applyEditSchema>;

export const applyEditTool = tool<ApplyEditInput, ApplyEditInput>({
    description:
        "将用户选择的候选文本应用到编辑器。跨段选区需要多条 edits，每条对应一段。直接替换，不经过 DiffBlock 确认流程。",
    inputSchema: zodSchema(applyEditSchema),
    execute: async (input) => input,
});
