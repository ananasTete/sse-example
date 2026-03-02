import { ToolCallPart, WeatherData } from "@/features/ai-sdk/hooks/use-chat/types";
import { WeatherCard } from "./weather-card";

interface ToolCallRendererProps {
  part: ToolCallPart;
}

export function ToolCallRenderer({ part }: ToolCallRendererProps) {
  const { toolName, state, inputText, input, output } = part;

  // 根据工具名称和状态渲染不同的 UI
  return (
    <div className="border border-slate-200 rounded-xl bg-slate-50 overflow-hidden">
      {/* 工具调用头部 */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-slate-100 border-b border-slate-200">
        <span className="text-lg">🔧</span>
        <span className="font-medium text-slate-700">{toolName}</span>
        <StatusBadge state={state} />
      </div>

      {/* 工具调用内容 */}
      <div className="p-4">
        {/* 参数流式显示 */}
        {state === "streaming-input" && inputText && (
          <div className="font-mono text-sm text-slate-600 bg-white p-3 rounded-lg border border-slate-200">
            <div className="text-xs text-slate-400 mb-1">正在生成参数...</div>
            <div className="flex items-center">
              <span>{inputText}</span>
              <span className="inline-block w-2 h-4 bg-blue-500 ml-0.5 animate-pulse" />
            </div>
          </div>
        )}

        {/* 参数完成，等待执行 */}
        {state === "input-available" && (
          <div className="font-mono text-sm text-slate-600 bg-white p-3 rounded-lg border border-slate-200">
            <div className="text-xs text-slate-400 mb-1">参数</div>
            <pre className="whitespace-pre-wrap">{JSON.stringify(input, null, 2)}</pre>
            <div className="mt-3 flex items-center gap-2 text-amber-600">
              <span className="inline-block w-3 h-3 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-sm">工具执行中...</span>
            </div>
          </div>
        )}

        {/* 执行结果 */}
        {state === "output-available" && (
          <div className="space-y-3">
            {/* 根据工具类型渲染特定 UI */}
            {toolName === "weather" && !!output && (
              <WeatherCard data={output as WeatherData} />
            )}

            {/* 非天气工具显示原始 JSON */}
            {toolName !== "weather" && !!output && (
              <div className="font-mono text-sm text-slate-600 bg-white p-3 rounded-lg border border-slate-200">
                <div className="text-xs text-slate-400 mb-1">执行结果</div>
                <pre className="whitespace-pre-wrap max-h-40 overflow-auto">
                  {JSON.stringify(output, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ state }: { state: ToolCallPart["state"] }) {
  const config = {
    "streaming-input": {
      text: "生成参数中",
      className: "bg-blue-100 text-blue-700",
    },
    "input-available": {
      text: "执行中",
      className: "bg-amber-100 text-amber-700",
    },
    "output-available": {
      text: "完成",
      className: "bg-green-100 text-green-700",
    },
  };

  const { text, className } = config[state];

  return (
    <span className={`ml-auto text-xs px-2 py-0.5 rounded-full font-medium ${className}`}>
      {text}
    </span>
  );
}
