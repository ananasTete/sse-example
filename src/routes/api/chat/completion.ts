import { createFileRoute } from "@tanstack/react-router";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { jsonError } from "@/src/server/http/json";

const DEFAULT_DEEPSEEK_API_BASE_URL = "https://api.deepseek.com/v1";
const DEFAULT_DEEPSEEK_MODEL = "deepseek-chat";

export const Route = createFileRoute("/api/chat/completion")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.DEEPSEEK_API_KEY;
        if (!apiKey) {
          return jsonError("Missing DEEPSEEK_API_KEY environment variable", 500);
        }

        const body = await request.json().catch(() => null);
        const prompt =
          body &&
          typeof body === "object" &&
          "prompt" in body &&
          typeof body.prompt === "string"
            ? body.prompt.trim()
            : "";

        if (!prompt) {
          return jsonError("Prompt is required", 400);
        }

        const deepseek = createOpenAI({
          name: "deepseek",
          apiKey,
          baseURL:
            process.env.DEEPSEEK_API_BASE_URL ?? DEFAULT_DEEPSEEK_API_BASE_URL,
        });

        const result = streamText({
          model: deepseek.chat(
            process.env.DEEPSEEK_MODEL ?? DEFAULT_DEEPSEEK_MODEL,
          ),
          prompt,
        });

        return result.toTextStreamResponse();
      },
    },
  },
});
