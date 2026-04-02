"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useMemo, useState } from "react";
import { Download, FileText, RotateCcw } from "lucide-react";
import "./editor.css";
import { PromptDocument, ResourceRegistry } from "./extensions/prompt-document";
import { ImageTag } from "./extensions/image-tag";
import { ImageMention } from "./extensions/image-mention";
import { DisableShiftEnter } from "./extensions/disable-shift-enter";
import { ImageCardList } from "./components/image-card-list";
import { ImageCropDialog } from "./components/image-crop-dialog";
import { usePromptEditor } from "./hooks/use-prompt-editor";
import type { ReadyPromptResource } from "./types";
import { EMPTY_DOC } from "./utils";

const PromptEditor = () => {
  const [cropTargetId, setCropTargetId] = useState<string | null>(null);

  const extensions = useMemo(
    () => [
      PromptDocument,
      StarterKit.configure({
        blockquote: false,
        bold: false,
        bulletList: false,
        code: false,
        codeBlock: false,
        document: false,
        dropcursor: false,
        gapcursor: false,
        hardBreak: false,
        heading: false,
        horizontalRule: false,
        italic: false,
        listItem: false,
        listKeymap: false,
        link: false,
        orderedList: false,
        strike: false,
        trailingNode: false,
        underline: false,
      }),
      ResourceRegistry,
      ImageTag,
      ImageMention,
      DisableShiftEnter,
    ],
    [],
  );

  const editor = useEditor({
    extensions,
    content: EMPTY_DOC,
    immediatelyRender: false,
  });

  const {
    resources,
    replacingResourceIds,
    addImages,
    replaceImage,
    removeImage,
    setImageCrop,
    canAddMore,
    getPromptPayload,
    setPromptPayload,
  } = usePromptEditor({ editor, maxImages: 4 });

  const cropImage =
    resources.find(
      (resource): resource is ReadyPromptResource =>
        resource.id === cropTargetId &&
        resource.status === "ready" &&
        Boolean(resource.asset?.url),
      ) ?? null;

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
                resources={resources}
                replacingResourceIds={replacingResourceIds}
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
                    console.log("log", getPromptPayload().text);
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
                    const stored = localStorage.getItem("promptPayload");
                    if (stored) {
                      const payload = JSON.parse(stored);
                      setPromptPayload(payload);
                      console.log("回显数据:", payload);
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
                    const payload = getPromptPayload();
                    localStorage.setItem("promptPayload", JSON.stringify(payload));
                    console.log("导出数据:", payload);
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
