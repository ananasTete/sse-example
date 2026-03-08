"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useState, useCallback, useMemo, useRef } from "react";
import { Download, FileText, RotateCcw } from "lucide-react";
import "./editor.css";
import { ImageTag } from "./extensions/image-tag";
import { ImageMention } from "./extensions/image-mention";
import { ImageCardList } from "./components/image-card-list";
import { ImageMentionMenu } from "./components/image-mention-menu";
import { ConfirmDialog } from "./components/confirm-dialog";
import { ImageCropDialog } from "./components/image-crop-dialog";
import { usePromptEditor } from "./hooks/use-prompt-editor";
import type { PromptImage } from "./types";

interface PendingDelete {
  imageId: string;
  label: string;
  resolve: (confirmed: boolean) => void;
}

const PromptEditor = () => {
  const [pendingDelete, setPendingDelete] = useState<PendingDelete | null>(
    null,
  );
  const [cropTargetId, setCropTargetId] = useState<string | null>(null);
  const imageSuggestionsRef = useRef<PromptImage[]>([]);

  const extensions = useMemo(
    () => [
      StarterKit.configure({
        dropcursor: false,
      }),
      ImageTag,
      ImageMention.configure({
        getImages: () => imageSuggestionsRef.current,
      }),
    ],
    [],
  );

  const editor = useEditor({
    extensions,
    content: "",
    immediatelyRender: false,
  });

  const {
    images,
    addImages,
    replaceImage,
    removeImage,
    setImageCrop,
    canAddMore,
    getPromptData,
    setPromptData,
  } = usePromptEditor({ editor, maxImages: 4 });

  const onBeforeTagDelete = useCallback(
    (imageId: string): Promise<boolean> => {
      return new Promise((resolve) => {
        const image = images.find((img) => img.id === imageId);
        const label = image?.label || "图片";
        setPendingDelete({ imageId, label, resolve });
      });
    },
    [images],
  );

  const confirmDelete = useCallback(() => {
    if (!pendingDelete) return;

    removeImage(pendingDelete.imageId);
    pendingDelete.resolve(true);
    setPendingDelete(null);
  }, [pendingDelete, removeImage]);

  const cancelDelete = useCallback(() => {
    if (!pendingDelete) return;
    pendingDelete.resolve(false);
    setPendingDelete(null);
  }, [pendingDelete]);

  const cropImage =
    images.find(
      (image): image is (typeof images)[number] & { status: "ready"; url: string } =>
        image.id === cropTargetId &&
        image.status === "ready" &&
        Boolean(image.url),
    ) ?? null;

  useEffect(() => {
    if (editor) {
      editor.commands.setImageTagDeleteHandler(onBeforeTagDelete);
    }
  }, [editor, onBeforeTagDelete]);

  useEffect(() => {
    imageSuggestionsRef.current = images;
  }, [images]);

  if (!editor) {
    return null;
  }

  return (
    <>
      <div className="mx-auto flex h-full w-full max-w-4xl flex-col">
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <section className="mx-auto flex w-full max-w-[420px] flex-col border border-slate-200 bg-white">
            <div className="border-b border-slate-200 px-3 py-2 text-xs text-slate-500">
              images
            </div>
            <div className="p-3">
              <ImageCardList
                images={images}
                onRemove={removeImage}
                onAdd={addImages}
                onReplace={replaceImage}
                onCrop={setCropTargetId}
                canAddMore={canAddMore}
              />
            </div>
          </section>

          <section className="mx-auto flex h-[300px] w-full max-w-[420px] flex-col border border-slate-200 bg-white">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-3 py-2">
              <div className="text-xs text-slate-500">content</div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    console.log("log", editor.getText());
                  }}
                  className="inline-flex items-center gap-1.5 border border-slate-200 px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-50"
                >
                  <FileText className="size-3.5" />
                  打印
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 border border-slate-200 px-3 py-1.5 text-xs text-slate-700 transition hover:bg-slate-50"
                  onClick={() => {
                    const stored = localStorage.getItem("promptData");
                    if (stored) {
                      const data = JSON.parse(stored);
                      setPromptData(data);
                      console.log("回显数据:", data);
                    }
                  }}
                >
                  <RotateCcw className="size-3.5" />
                  回显
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 bg-slate-950 px-3 py-1.5 text-xs text-white transition hover:bg-slate-800"
                  onClick={() => {
                    const data = getPromptData();
                    localStorage.setItem("promptData", JSON.stringify(data));
                    console.log("导出数据:", data);
                  }}
                >
                  <Download className="size-3.5" />
                  导出
                </button>
              </div>
            </div>

            <div className="prompt-editor-surface min-h-0 flex-1 overflow-auto px-3 py-2">
              <EditorContent editor={editor} />
            </div>
          </section>
        </div>
      </div>

      <ImageMentionMenu editor={editor} images={images} />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="删除确认"
        message={`是否同时删除 "${pendingDelete?.label || "图片"}" 对应的图片？`}
        confirmText="确认删除"
        cancelText="取消"
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />

      <ImageCropDialog
        open={cropImage !== null}
        image={cropImage}
        onCancel={() => setCropTargetId(null)}
        onApply={(id, crop) => {
          setImageCrop(id, crop);
          setCropTargetId(null);
        }}
        onClear={(id) => {
          setImageCrop(id);
          setCropTargetId(null);
        }}
      />
    </>
  );
};

export default PromptEditor;
