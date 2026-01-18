import Link from "next/link";

export default function Page() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-gray-100">
      <h1 className="text-2xl font-bold">SSE 示例导航</h1>
      <div className="flex gap-4">
        <Link
          href="/use-chat"
          className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded transition-colors"
        >
          useChat Demo
        </Link>
        <Link
          href="/use-gen"
          className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded transition-colors"
        >
          useGeneration Demo
        </Link>
        <Link
          href="/agent-editor"
          className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded transition-colors"
        >
          Agent Editor Demo
        </Link>
        <Link
          href="/prompt-editor"
          className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded transition-colors"
        >
          Prompt Editor Demo
        </Link>
      </div>
    </div>
  );
}
