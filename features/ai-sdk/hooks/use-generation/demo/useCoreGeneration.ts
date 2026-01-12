import { useState, useCallback } from "react";
import { createParser } from "eventsource-parser";

interface UseCoreGenerationOptions {
  api: string;
}

interface CoreGenerateParams {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export function useCoreGeneration({
  api,
}: UseCoreGenerationOptions) {
  const [value, setValue] = useState("");

  const generate = useCallback(
    async (params: CoreGenerateParams) => {
      // 重置状态
      setValue("");

      try {
        const response = await fetch(api, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(params),
        });

        if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
        if (!response.body) throw new Error("No response body");

        // 准备流解析
        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        // 定义解析器回调
        const parser = createParser({
          onEvent: (event) => {
            const data = event.data;
            console.log("chunk", data);

            /**
             * chunk 数据为：
             *
             * data: {"text":"这"}\n\n
             *
             * data: {"text":"是"}\n\n
             *
             * data: {"text":"一"}\n\n
             *
             * data: {"text":"个"}\n\n
             *
             * ...
             * data: [done]\n\n
             *
             */

            // 处理结束标识
            if (data === "[DONE]") return;

            let textChunk = "";

            try {
                const json = JSON.parse(data);
                textChunk = json.text || "";
              } catch (e) {
                console.warn("Failed to parse SSE data as JSON:", data, e);
              }

            if (textChunk) {
              setValue((prev) => prev + textChunk);
            }
          },
        });

        // 4. 循环读取流
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          parser.feed(decoder.decode(value, { stream: true }));
        }

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        console.log('err', err);
      }
    },
    [api]
  );

  return {
    generate,
    value,
  };
}
