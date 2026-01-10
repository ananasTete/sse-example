import { useGeneration } from '../hooks/useGeneration';

export const EventSourcePaserExample = () => {
  const { generate, value, isLoading, stop, error } = useGeneration({
    api: '/api/chat',
    onResponse: (response) => console.log('Response received:', response),
    onFinish: (fullText, params) => console.log('生成完成:', fullText, params),
    onError: (err) => console.error('生成出错:', err)
  });

  const handleClick = () => {
    generate({
      prompt: '请把这段话变得更专业：我觉得这个产品还行吧。' 
    });
  };

  return (
    <div className="p-4 border rounded shadow-md max-w-lg">
      <h3 className="text-lg font-bold mb-2">eventsource-parser</h3>
      
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
