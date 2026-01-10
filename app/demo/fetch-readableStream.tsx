
import { useCallback, useState } from "react";

/**
 * 这是一个使用原生 fetch + ReadableStream 处理流式数据的示例
 * 相比 EventSource 的优势：
 * 1. 支持 POST 请求
 * 2. 可以自定义 Headers (用于鉴权等)
 * 3. 可以精准控制请求的中断
 */
export const ReadableStreamExample = () => {
  const [value, setValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startStream = useCallback(async () => {
    try {
      // 0. 重置状态
      setValue('');
      setError(null);
      setIsLoading(true);

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer my-token' 
        },
        body: JSON.stringify({ prompt: '你好，介绍一下 SSE' })
      });

      if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
      if (!response.body) throw new Error('Response body is unavailable');

      const reader = response.body.getReader();
      const decoder = new TextDecoder();

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        // 解码并喂给解析器
        const chunk = decoder.decode(value, { stream: true });
        console.log('chunk', chunk);

        /**
         * 会得到：
         * 
         * data: {"text":"这"}\n\n
         * data: {"text":"是"}\n\n
         * data: {"text":"一"}\n\n
         * data: {"text":"个"}\n\n
         * ...
         * data: [done]\n\n
         * 
         * 需要自己解析，在网络波动时，你收到的 chunk 可能是半截的，或者粘在一起的，称为数据截断/粘连
         * 可以使用 eventsource-parser 来解析，见 fetch-eventsource-paser.tsx
         */ 

        setValue((prev) => prev + chunk);
      }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
      console.error('请求失败', err);
        setError(err.message || String(err));
    } finally {
      setIsLoading(false);
    }
  }, []);

  const handleClick = () => {
    startStream();
  };

  return (
    <div className="p-4 border rounded shadow-md max-w-lg bg-white">
      <h3 className="text-lg font-bold mb-2">ReadableStream (Fetch POST) 示例</h3>
      
      {/* 错误提示 */}
      {!!error && (
        <div className="bg-red-50 text-red-500 p-2 text-sm mb-2 rounded border border-red-100">
          出错了: {error}
        </div>
      )}
      
      {/* 结果展示区 */}
      <div className="bg-gray-50 p-4 min-h-[120px] whitespace-pre-wrap mb-4 rounded border font-mono text-sm leading-relaxed">
        {value || <span className="text-gray-400 italic">点击按钮开始测试流式接收...</span>}
      </div>

      <div className="flex gap-2">
        {!isLoading ? (
          <button 
            onClick={handleClick} 
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded transition-colors"
          >
            开始运行
          </button>
        ) : (
          <div className="flex gap-2">
            <button 
              disabled
              className="bg-blue-300 text-white px-6 py-2 rounded flex items-center gap-2"
            >
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              生成中...
            </button>
          </div>
        )}
      </div>
    </div>
  );
};