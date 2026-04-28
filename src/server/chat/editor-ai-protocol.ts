export interface EditorAIRequest {
  requestId: string;
  message: string;
  selection: {
    contentWithSelection: string;
  };
}

export interface EditorAIPatchResult {
  requestId: string;
  oldText: string;
  newText: string;
}

export function parseEditorAIRequest(value: unknown): EditorAIRequest | null {
  if (typeof value === "string") {
    try {
      return parseEditorAIRequest(JSON.parse(value));
    } catch {
      return null;
    }
  }

  if (typeof value !== "object" || value === null) return null;
  const input = value as Partial<EditorAIRequest>;

  if (
    typeof input.requestId !== "string" ||
    typeof input.message !== "string" ||
    typeof input.selection !== "object" ||
    input.selection === null ||
    typeof input.selection.contentWithSelection !== "string"
  ) {
    return null;
  }

  return {
    requestId: input.requestId,
    message: input.message,
    selection: {
      contentWithSelection: input.selection.contentWithSelection,
    },
  };
}

function decodeHtmlEntities(text: string) {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
}

function htmlToText(html: string) {
  return decodeHtmlEntities(html.replace(/<[^>]*>/g, ""));
}

function selectionHtmlToText(html: string) {
  return htmlToText(
    html
      .replace(/<\/(?:p|h[1-6]|li|blockquote)>\s*<(?:p|h[1-6]|li|blockquote)\b[^>]*>/gi, "\n\n")
      .replace(/<(?:p|h[1-6]|li|blockquote)\b[^>]*>/gi, "")
      .replace(/<\/(?:p|h[1-6]|li|blockquote)>/gi, ""),
  );
}

export function extractSelectionText(contentWithSelection: string) {
  const match = contentWithSelection.match(
    /<selection-start><\/selection-start>([\s\S]*?)<selection-end><\/selection-end>/i,
  );

  return match ? selectionHtmlToText(match[1]) : "";
}

export function createMockPatchResult(
  request: EditorAIRequest,
): EditorAIPatchResult {
  const oldText = extractSelectionText(request.selection.contentWithSelection);
  const newText = createMockRewrite(oldText, request.message);

  return {
    requestId: request.requestId,
    oldText,
    newText,
  };
}

function createMockRewrite(oldText: string, message: string) {
  const wantsSimple = /简|短|精炼|简单/.test(message);
  const paragraphs = oldText.split(/\n{2,}/);
  const rewritten = paragraphs.map((paragraph) => {
    if (!wantsSimple) return `${paragraph}（已优化）`;

    return paragraph
      .replace(/似乎骤然间想起了什么，?/g, "")
      .replace(/眼中闪过一丝不易察觉的精光，?/g, "")
      .replace(/语气看似随意地/g, "")
      .replace(/啊！/g, "。")
      .replace(/搞错/g, "记错")
      .replace(/的，没听谁说过还有什么堂妹/g, "")
      .replace(/，只能相顾无言/g, "")
      .replace(/只能苦涩的苦笑了/g, "只得苦笑");
  });

  const newText = rewritten.join("\n\n");
  return newText === oldText ? `${oldText}（已简化）` : newText;
}
