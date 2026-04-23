import type { Editor } from '@tiptap/react'
import type { Selection } from '@tiptap/pm/state'

export type SavedSelectionBookmark = ReturnType<
  Editor['state']['selection']['getBookmark']
>

export interface SavedSelection {
  bookmark: SavedSelectionBookmark
  text: string
}

export interface ResolvedSavedSelection {
  selection: Selection
  from: number
  to: number
}

export function resolveSavedSelection(
  editor: Editor,
  savedSelection: SavedSelection | null,
): ResolvedSavedSelection | null {
  if (!savedSelection) return null

  try {
    const selection = savedSelection.bookmark.resolve(editor.state.doc)

    if (selection.empty) return null

    return {
      selection,
      from: selection.from,
      to: selection.to,
    }
  } catch {
    return null
  }
}
