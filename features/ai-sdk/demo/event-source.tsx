
// 这是一个原生的 EventSource API 示例
// 注意：EventSource 仅支持 GET 请求，无法自定义 Headers（如 Authorization）

import { useCallback, useState } from "react";

export const EventSourceExample = () => {
  const [value, setValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  
  const startStream = useCallback(() => {
    // 建立连接
    const eventSource = new EventSource('/api/chat');

    // 监听消息
    eventSource.onopen = () => {
      console.log('连接已建立');
    };

    eventSource.onmessage = (event) => {
      setIsLoading(true);

      // event.data 就是服务端返回的数据
      console.log('收到数据:', event.data);

      /**
       * 会得到：
       * 
       * {"text":"这"}
       * {"text":"是"}
       * {"text":"一"}
       * {"text":"个"}
       * ...
       * [done]
       * 
       * 需要自己简单解析
       */ 

      // 注意：你需要手动处理数据，比如拼接字符串
      // 如果后端返回的数据是 JSON 字符串，记得 JSON.parse
      try {
        const data = JSON.parse(event.data);
        console.log('解析后文字:', data.text);
        setValue((prev) => prev + data.text);
      } catch (e) {
        console.log('纯文本:', event.data);
      }

      // 如果后端发送了特定的结束标识，需要手动关闭
      if (event.data === '[DONE]') {
        eventSource.close();
        setIsLoading(false);
      }
    };

    eventSource.onerror = (err) => {
      console.error('连接出错:', err);
      setError('连接出错，请重试');
      setIsLoading(false);
      eventSource.close();
    };

    // 返回清理函数以便在组件卸载时关闭连接
    return () => {
      eventSource.close();
    };
  }, []);

  const handleClick = () => {
    startStream();
  };

  return (
    <div className="p-4 border rounded shadow-md max-w-lg">
      <h3 className="text-lg font-bold mb-2">EventSource Example</h3>
      
      {/* 错误提示 */}
      {!!error && <div className="text-red-500 text-sm mb-2">出错了，请重试</div>}
      
      {/* 结果展示区 */}
      <div className="bg-gray-50 p-4 min-h-[100px] whitespace-pre-wrap mb-4">
        {value || <span className="text-gray-400">点击生成查看结果...</span>}
      </div>

      <div className="flex gap-2">
        <button 
          onClick={handleClick} 
          disabled={isLoading}
          className="bg-blue-600 text-white px-4 py-2 rounded disabled:opacity-50"
        >
          {isLoading ? '生成中...' : '开始润色'}
        </button>
        
        {isLoading && (
          <button 
            onClick={stop} 
            className="border border-red-500 text-red-500 px-4 py-2 rounded hover:bg-red-50"
          >
            停止
          </button>
        )}
      </div>
    </div>
  );
};