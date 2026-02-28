import { createFileRoute, Link } from "@tanstack/react-router";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-6 bg-gray-100">
      <h1 className="text-2xl font-bold">SSE 示例导航</h1>
      <div className="flex gap-4">
        <Link
          to="/chat"
          className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded transition-colors"
        >
          Chat Demo
        </Link>
        <Link
          to="/use-gen"
          className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded transition-colors"
        >
          useGeneration Demo
        </Link>
        <Link
          to="/agent-editor"
          className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded transition-colors"
        >
          Agent Editor Demo
        </Link>
        <Link
          to="/prompt-editor"
          className="bg-green-500 hover:bg-green-600 text-white px-6 py-3 rounded transition-colors"
        >
          Prompt Editor Demo
        </Link>
      </div>
    </div>
  );
}
