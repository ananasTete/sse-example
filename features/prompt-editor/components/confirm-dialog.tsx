"use client";

import * as Dialog from "@radix-ui/react-dialog";

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
  return (
    <Dialog.Root open={open} onOpenChange={(isOpen) => !isOpen && onCancel()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-slate-950/28 backdrop-blur-md animate-in fade-in duration-200" />
        <div className="fixed inset-0 z-50 flex items-center justify-center px-4">
          <Dialog.Content
            className="w-full max-w-[420px] overflow-hidden rounded-[28px] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(246,247,249,0.96))] shadow-[0_32px_80px_rgba(15,23,42,0.24)] animate-in zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 duration-200 outline-none"
            onOpenAutoFocus={(e) => {
              const confirmBtn = document.getElementById("confirm-dialog-btn");
              if (confirmBtn) {
                e.preventDefault();
                confirmBtn.focus();
              }
            }}
          >
            <div className="px-6 pt-6 pb-3 sm:px-7">
              <div className="mb-4 inline-flex rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
                Confirm
              </div>
              <Dialog.Title className="text-lg font-semibold text-slate-950">
                {title}
              </Dialog.Title>
            </div>

            <Dialog.Description className="px-6 pb-6 sm:px-7 text-sm leading-6 text-slate-600">
              {message}
            </Dialog.Description>

            <div className="flex gap-3 border-t border-slate-200/80 px-6 py-5 sm:px-7">
              <Dialog.Close asChild>
                <button
                  type="button"
                  onClick={onCancel}
                  className="flex-1 rounded-full border border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
                >
                  {cancelText}
                </button>
              </Dialog.Close>
              <button
                id="confirm-dialog-btn"
                type="button"
                onClick={onConfirm}
                className="flex-1 rounded-full bg-slate-950 px-4 py-3 text-sm font-medium text-white transition hover:bg-slate-800 outline-none focus-visible:ring-2 focus-visible:ring-slate-950 focus-visible:ring-offset-2"
              >
                {confirmText}
              </button>
            </div>
          </Dialog.Content>
        </div>
      </Dialog.Portal>
    </Dialog.Root>
  );
};

export default ConfirmDialog;
