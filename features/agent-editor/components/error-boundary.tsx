"use client";

import { Component, ReactNode } from "react";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * 错误边界组件
 * 捕获子组件树中的 JavaScript 错误，防止整个应用崩溃
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // 可以在这里记录错误到日志服务
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <div className="p-4 border border-red-200 bg-red-50 rounded-lg">
          <div className="text-red-600 font-medium mb-2">出错了</div>
          <div className="text-sm text-red-500 mb-3">
            {this.state.error?.message || "发生了未知错误"}
          </div>
          <button
            onClick={this.handleRetry}
            className="px-3 py-1 text-sm bg-red-500 text-white rounded hover:bg-red-600"
          >
            重试
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
