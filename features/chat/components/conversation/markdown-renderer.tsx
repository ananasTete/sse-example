"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { memo } from "react";
import type { Components } from "react-markdown";

interface MarkdownRendererProps {
  content: string;
  isStreaming?: boolean;
}

// 自定义组件样式
const components: Components = {
  // 标题
  h1: ({ children }) => (
    <h1 className="text-2xl font-bold mb-4 mt-6 first:mt-0 text-stone-900">
      {children}
    </h1>
  ),
  h2: ({ children }) => (
    <h2 className="text-xl font-semibold mb-3 mt-5 first:mt-0 text-stone-800">
      {children}
    </h2>
  ),
  h3: ({ children }) => (
    <h3 className="text-lg font-medium mb-2 mt-4 first:mt-0 text-stone-800">
      {children}
    </h3>
  ),

  // 段落
  p: ({ children }) => <p className="mb-3 last:mb-0 leading-7">{children}</p>,

  // 列表
  ul: ({ children }) => (
    <ul className="mb-3 ml-4 space-y-1.5 list-disc list-outside marker:text-stone-400">
      {children}
    </ul>
  ),
  ol: ({ children }) => (
    <ol className="mb-3 ml-4 space-y-1.5 list-decimal list-outside marker:text-stone-500">
      {children}
    </ol>
  ),
  li: ({ children }) => <li className="leading-7 pl-1">{children}</li>,

  // 代码
  code: ({ className, children, ...props }) => {
    const isInline = !className;
    if (isInline) {
      return (
        <code
          className="px-1.5 py-0.5 rounded-md bg-stone-100 text-stone-800 text-[0.875em] font-mono border border-stone-200"
          {...props}
        >
          {children}
        </code>
      );
    }
    return (
      <code
        className={`${className} block text-[0.875em] font-mono`}
        {...props}
      >
        {children}
      </code>
    );
  },
  pre: ({ children }) => (
    <pre className="mb-4 p-4 rounded-xl bg-[#1e1e1e] text-stone-100 overflow-x-auto text-sm leading-relaxed shadow-inner">
      {children}
    </pre>
  ),

  // 引用
  blockquote: ({ children }) => (
    <blockquote className="mb-4 pl-4 border-l-4 border-amber-400 bg-amber-50/50 py-2 pr-3 rounded-r-lg text-stone-700 italic">
      {children}
    </blockquote>
  ),

  // 表格
  table: ({ children }) => (
    <div className="mb-4 overflow-x-auto rounded-lg border border-stone-200">
      <table className="min-w-full divide-y divide-stone-200">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead className="bg-stone-50">{children}</thead>,
  tbody: ({ children }) => (
    <tbody className="divide-y divide-stone-100 bg-white">{children}</tbody>
  ),
  tr: ({ children }) => <tr>{children}</tr>,
  th: ({ children }) => (
    <th className="px-4 py-2.5 text-left text-xs font-semibold text-stone-600 uppercase tracking-wider">
      {children}
    </th>
  ),
  td: ({ children }) => (
    <td className="px-4 py-2.5 text-sm text-stone-700">{children}</td>
  ),

  // 链接
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-emerald-600 hover:text-emerald-700 underline underline-offset-2 decoration-emerald-300 hover:decoration-emerald-500 transition-colors"
    >
      {children}
    </a>
  ),

  // 分隔线
  hr: () => <hr className="my-6 border-stone-200" />,

  // 强调
  strong: ({ children }) => (
    <strong className="font-semibold text-stone-900">{children}</strong>
  ),
  em: ({ children }) => <em className="italic">{children}</em>,
  del: ({ children }) => (
    <del className="text-stone-500 line-through">{children}</del>
  ),
};

export const MarkdownRenderer = memo(function MarkdownRenderer({
  content,
  isStreaming = false,
}: MarkdownRendererProps) {
  return (
    <div className="markdown-content">
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {content}
      </ReactMarkdown>
      {isStreaming && (
        <span className="inline-block w-2 h-5 align-middle bg-stone-400 ml-0.5 animate-pulse rounded-sm" />
      )}
    </div>
  );
});
