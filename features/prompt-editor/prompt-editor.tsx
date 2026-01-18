"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";
import "./editor.css";
import { ImageTag } from "./extensions/image-tag";
import { ImageCardList } from "./components/image-card-list";
import { ConfirmDialog } from "./components/confirm-dialog";
import { usePromptEditor } from "./hooks/use-prompt-editor";

const PromptEditor = () => {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        dropcursor: false,
      }),
      ImageTag,
    ],
    content: "",
    immediatelyRender: false,
  });

  const {
    images,
    addImage,
    removeImage,
    pendingDelete,
    confirmDelete,
    cancelDelete,
    onBeforeTagDelete,
    canAddMore,
    getPromptData,
    setPromptData,
  } = usePromptEditor({ editor, maxImages: 4 });

  useEffect(() => {
    if (editor) {
      editor.commands.setImageTagDeleteHandler(onBeforeTagDelete);
    }
  }, [editor, onBeforeTagDelete]);

  if (!editor) {
    return null;
  }

  return (
    <>
      <div className="mx-auto w-[640px] bg-amber-100 h-100 p-4 rounded-md gap-2 flex flex-col">
        <div className="min-h-40 bg-amber-200 rounded-md p-4">
          <ImageCardList
            images={images}
            onRemove={removeImage}
            onAdd={addImage}
            canAddMore={canAddMore}
          />
        </div>

        <div className="bg-amber-300 flex-1 rounded-md">
          <EditorContent editor={editor} />
        </div>

        <button
          onClick={() => {
            console.log("log", editor.getText());
          }}
        >
          打印
        </button>

        <div className="flex gap-2">
          <button
            className="px-3 py-1 bg-blue-500 text-white rounded"
            onClick={() => {
              const data = getPromptData();
              localStorage.setItem("promptData", JSON.stringify(data));
              console.log("导出数据:", data);
            }}
          >
            导出
          </button>
          <button
            className="px-3 py-1 bg-green-500 text-white rounded"
            onClick={() => {
              const stored = localStorage.getItem("promptData");
              if (stored) {
                const data = JSON.parse(stored);
                setPromptData(data);
                console.log("回显数据:", data);
              }
            }}
          >
            回显
          </button>
        </div>
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="删除确认"
        message={`是否同时删除 "${pendingDelete?.label || "图片"}" 对应的图片？`}
        confirmText="确认删除"
        cancelText="取消"
        onConfirm={confirmDelete}
        onCancel={cancelDelete}
      />
    </>
  );
};

export default PromptEditor;
