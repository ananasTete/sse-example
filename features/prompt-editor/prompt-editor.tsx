"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect, useState, useMemo, useRef } from "react";
import { Download, FileText, RotateCcw } from "lucide-react";
import "./editor.css";
import { ImageRegistry, PromptDocument } from "./extensions/prompt-document";
import { ImageTag } from "./extensions/image-tag";
import { ImageMention } from "./extensions/image-mention";
import { ImageCardList } from "./components/image-card-list";
import { ImageMentionMenu } from "./components/image-mention-menu";
import { ImageCropDialog } from "./components/image-crop-dialog";
import { usePromptEditor } from "./hooks/use-prompt-editor";
import type { PromptImage } from "./types";
import { EMPTY_DOC } from "./utils";

const PromptEditor = () => {
  const [cropTargetId, setCropTargetId] = useState<string | null>(null);
  const imageSuggestionsRef = useRef<PromptImage[]>([]);

  const extensions = useMemo(
    () => [
      PromptDocument,
      StarterKit.configure({
        document: false,
        dropcursor: false,
      }),
      ImageRegistry,
      ImageTag,
      ImageMention.configure({
        getImages: () => imageSuggestionsRef.current,
      }),
    ],
    [],
  );

  const editor = useEditor({
    extensions,
    content: EMPTY_DOC,
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

  const cropImage =
    images.find(
      (image): image is (typeof images)[number] & { status: "ready"; url: string } =>
        image.id === cropTargetId &&
        image.status === "ready" &&
        Boolean(image.url),
    ) ?? null;

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
                    console.log("log", getPromptData().prompt);
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
