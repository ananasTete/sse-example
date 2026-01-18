"use client";

import { useCallback, useEffect, useRef } from "react";

export interface ConfirmDialogProps {
  /** 是否显示弹窗 */
  open: boolean;
  /** 弹窗标题 */
  title?: string;
  /** 弹窗内容 */
  message: string;
  /** 确认按钮文字 */
  confirmText?: string;
  /** 取消按钮文字 */
  cancelText?: string;
  /** 确认回调 */
  onConfirm: () => void;
  /** 取消回调 */
  onCancel: () => void;
}

export const ConfirmDialog = ({
  open,
  title = "确认",
  message,
  confirmText = "确认删除",
  cancelText = "取消",
  onConfirm,
  onCancel,
}: ConfirmDialogProps) => {
  const dialogRef = useRef<HTMLDivElement>(null);
  const confirmButtonRef = useRef<HTMLButtonElement>(null);

  // 处理 ESC 键关闭
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onCancel();
      }
    },
    [onCancel],
  );

  // 点击遮罩层关闭
  const handleBackdropClick = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget) {
        onCancel();
      }
    },
    [onCancel],
  );

  useEffect(() => {
    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      // 自动聚焦到确认按钮
      confirmButtonRef.current?.focus();
    }

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, handleKeyDown]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={handleBackdropClick}
    >
      <div
        ref={dialogRef}
        className="bg-white rounded-2xl shadow-2xl w-[380px] overflow-hidden animate-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
      >
        {/* 标题 */}
        <div className="px-6 pt-6 pb-2">
          <h2 id="dialog-title" className="text-lg font-semibold text-gray-900">
            {title}
          </h2>
        </div>

        {/* 内容 */}
        <div className="px-6 pb-6">
          <p className="text-gray-600 text-sm leading-relaxed">{message}</p>
        </div>

        {/* 按钮区域 */}
        <div className="flex border-t border-gray-100">
          <button
            onClick={onCancel}
            className="flex-1 py-3.5 text-gray-600 font-medium hover:bg-gray-50 transition-colors duration-200 cursor-pointer"
          >
            {cancelText}
          </button>
          <div className="w-px bg-gray-100" />
          <button
            ref={confirmButtonRef}
            onClick={onConfirm}
            className="flex-1 py-3.5 text-red-500 font-medium hover:bg-red-50 transition-colors duration-200 cursor-pointer"
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ConfirmDialog;
