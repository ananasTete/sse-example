import { useState, useRef, useCallback } from "react";
import { createParser } from "eventsource-parser";

interface UseGenerationOptions {
  api: string;
  headers?: Record<string, string>;
  /** 成功完成后的回调 */
  onFinish?: (fullText: string, params: GenerateParams) => void;
  /** 发生错误的回调 */
  onError?: (error: unknown) => void;
  /** 收到响应时的回调 */
  onResponse?: (data: string) => void;
  /** 开始流式传输的回调 */
  onStartStream?: () => void;
  /** 自定义数据解析函数 */
  dataParser?: (data: string) => string;
}

interface GenerateParams {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

export function useGeneration({
  api,
  headers = {},
  onFinish,
  onError,
  onResponse,
  onStartStream,
  dataParser,
}: UseGenerationOptions) {
  const [value, setValue] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<unknown | null>(null);

  // 使用 useRef 存储 AbortController，确保在组件渲染之间保持引用
  const abortControllerRef = useRef<AbortController | null>(null);

  // 停止生成的函数
  const stop = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
  }, []);

  const generate = useCallback(
    async (params: GenerateParams) => {
      // 1. 重置状态
      setValue("");
      setError(null);
      setIsLoading(true);

      // 2. 初始化中断控制器
      if (abortControllerRef.current) {
        abortControllerRef.current.abort(); // 如果上一次还在请求，先取消
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const response = await fetch(api, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...headers,
          },
          body: JSON.stringify(params),
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(`Request failed with status ${response.status}`);
        }

        if (!response.body) return;

        // 3. 准备流解析
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let accumulatedText = ""; // 用于记录完整的文本，供 onFinish 使用
        let hasStartedStream = false;

        // 定义解析器回调
        const parser = createParser({
          onEvent: (event) => {
            const data = event.data;
            console.log("chunk", data);

            /**
             * 会得到：
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
             * 得到已经解析好的数据
             */

            // 处理结束标识 (根据你的后端约定，有时是 [DONE])
            if (data === "[DONE]") return;

            let textChunk = "";

            if (dataParser) {
              textChunk = dataParser(data) || "";
            } else {
              try {
                const json = JSON.parse(data);
                textChunk = json.text || "";
              } catch (e) {
                // 默认只处理 JSON 格式且包含 text 字段的数据
              }
            }

            if (textChunk) {
              if (!hasStartedStream) {
                onStartStream?.();
                hasStartedStream = true;
              }
              accumulatedText += textChunk;
              setValue((prev) => prev + textChunk);
              onResponse?.(textChunk);
            }
          },
        });

        // 4. 循环读取流
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          parser.feed(decoder.decode(value));
        }

        // 成功结束
        onFinish?.(accumulatedText, params);

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      } catch (err: any) {
        // 忽略由 abort 导致的错误
        if (err.name === "AbortError") {
          console.log("Generation stopped by user");
          return;
        }
        setError(err);
        onError?.(err);
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [api, headers, onFinish, onResponse, onStartStream, onError, dataParser]
  );

  return {
    generate,
    value,
    isLoading,
    error,
    stop,
  };
}
