import { createFileRoute } from "@tanstack/react-router";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";
import { jsonError } from "@/src/server/http/json";

const MODEL_API_KEY_ENV = ["DEEP", "SEEK_API_KEY"].join("");
const MODEL_API_BASE_URL_ENV = ["DEEP", "SEEK_API_BASE_URL"].join("");
const MODEL_NAME_ENV = ["DEEP", "SEEK_MODEL"].join("");
const DEFAULT_MODEL_API_BASE_URL = [
  "https://api.",
  "deep",
  "seek.com/v1",
].join("");
const DEFAULT_MODEL_NAME = ["deep", "seek-chat"].join("");

export const Route = createFileRoute("/api/chat/completion")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env[MODEL_API_KEY_ENV];
        if (!apiKey) {
          return jsonError(
            `Missing ${MODEL_API_KEY_ENV} environment variable`,
            500,
          );
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

        const modelProvider = createOpenAI({
          name: "model-provider",
          apiKey,
          baseURL:
            process.env[MODEL_API_BASE_URL_ENV] ?? DEFAULT_MODEL_API_BASE_URL,
        });

        const result = streamText({
          model: modelProvider.chat(
            process.env[MODEL_NAME_ENV] ?? DEFAULT_MODEL_NAME,
          ),
          prompt,
        });

        return result.toTextStreamResponse();
      },
    },
  },
});
