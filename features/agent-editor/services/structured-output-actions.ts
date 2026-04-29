export type StructuredOutputActionType = "edit" | "apply";

export interface StructuredOutputActionInput {
  messageId: string;
  partId: string;
  itemId: string;
  action: StructuredOutputActionType;
  content: string;
}

export async function saveStructuredOutputAction(
  input: StructuredOutputActionInput,
) {
  await new Promise((resolve) => window.setTimeout(resolve, 120));
  console.info("[structured-output-action]", input);
}
