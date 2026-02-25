import type { LucideIcon } from "lucide-react";
import {
  Type,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  List,
  ListOrdered,
  Code2,
  Quote,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Bold,
  Italic,
  Underline,
  Strikethrough,
  Code,
  ChevronRight,
} from "lucide-react";

export type SlashCommandId =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "heading4"
  | "heading5"
  | "heading6"
  | "headingMore"
  | "bulletList"
  | "orderedList"
  | "codeBlock"
  | "blockquote"
  | "alignLeft"
  | "alignCenter"
  | "alignRight"
  | "bold"
  | "italic"
  | "underline"
  | "strike"
  | "inlineCode";

export interface SlashMenuItem {
  id: SlashCommandId;
  label: string;
  icon: LucideIcon;
  keywords?: string[];
  children?: SlashMenuItem[];
  rightIcon?: LucideIcon;
}

export interface SlashMenuSection {
  id: string;
  title: string;
  items: SlashMenuItem[];
}

export interface SlashMenuModel {
  title: string;
  sections: SlashMenuSection[];
  flatItems: SlashMenuItem[];
}

const otherHeadingChildren: SlashMenuItem[] = [
  {
    id: "heading4",
    label: "Heading 4",
    icon: Heading4,
    keywords: ["h4"],
  },
  {
    id: "heading5",
    label: "Heading 5",
    icon: Heading5,
    keywords: ["h5"],
  },
  {
    id: "heading6",
    label: "Heading 6",
    icon: Heading6,
    keywords: ["h6"],
  },
];

const rootSections: SlashMenuSection[] = [
  {
    id: "basic",
    title: "Basic",
    items: [
      { id: "paragraph", label: "Text", icon: Type, keywords: ["p", "text"] },
      { id: "heading1", label: "Heading 1", icon: Heading1, keywords: ["h1"] },
      { id: "heading2", label: "Heading 2", icon: Heading2, keywords: ["h2"] },
      { id: "heading3", label: "Heading 3", icon: Heading3, keywords: ["h3"] },
      {
        id: "headingMore",
        label: "Other heading",
        icon: Heading4,
        rightIcon: ChevronRight,
        keywords: ["h4", "h5", "h6", "heading 4", "heading 5", "heading 6"],
        children: otherHeadingChildren,
      },
      {
        id: "bulletList",
        label: "Bulleted list",
        icon: List,
        keywords: ["ul", "bullet", "list"],
      },
      {
        id: "orderedList",
        label: "Numbered list",
        icon: ListOrdered,
        keywords: ["ol", "ordered", "numbered", "list"],
      },
      {
        id: "codeBlock",
        label: "Code block",
        icon: Code2,
        keywords: ["code", "block"],
      },
      {
        id: "blockquote",
        label: "Quote",
        icon: Quote,
        keywords: ["quote", "blockquote"],
      },
    ],
  },
  {
    id: "align",
    title: "Align",
    items: [
      { id: "alignLeft", label: "Align left", icon: AlignLeft, keywords: ["left"] },
      {
        id: "alignCenter",
        label: "Align center",
        icon: AlignCenter,
        keywords: ["center", "middle"],
      },
      { id: "alignRight", label: "Align right", icon: AlignRight, keywords: ["right"] },
    ],
  },
  {
    id: "style",
    title: "Style",
    items: [
      { id: "bold", label: "Bold", icon: Bold, keywords: ["strong"] },
      { id: "italic", label: "Italic", icon: Italic, keywords: ["em"] },
      { id: "underline", label: "Underline", icon: Underline, keywords: ["u"] },
      {
        id: "strike",
        label: "Strikethrough",
        icon: Strikethrough,
        keywords: ["strike", "del"],
      },
      { id: "inlineCode", label: "Inline code", icon: Code, keywords: ["code"] },
    ],
  },
];

function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

function itemMatches(item: SlashMenuItem, query: string): boolean {
  const q = normalizeQuery(query);
  if (!q) return true;

  const haystack = [item.label, ...(item.keywords ?? [])]
    .join(" ")
    .toLowerCase();

  if (haystack.includes(q)) return true;

  if (item.children?.length) {
    return item.children.some((child) => itemMatches(child, q));
  }

  return false;
}

export function getRootSlashMenuModel(query: string): SlashMenuModel {
  const sections: SlashMenuSection[] = rootSections
    .map((section) => {
      const items = section.items.filter((i) => itemMatches(i, query));
      return { ...section, items };
    })
    .filter((s) => s.items.length > 0);

  const flatItems = sections.flatMap((s) => s.items);

  return {
    title: "Commands",
    sections,
    flatItems,
  };
}

export function getChildrenSlashMenuModel(
  query: string,
  parent: SlashMenuItem
): SlashMenuModel {
  const items = (parent.children ?? []).filter((i) => itemMatches(i, query));
  const sections: SlashMenuSection[] = [
    { id: String(parent.id), title: parent.label, items },
  ];

  return { title: parent.label, sections, flatItems: items };
}

export function getItemByFlatIndex(model: { flatItems: SlashMenuItem[] }, index: number) {
  if (model.flatItems.length === 0) return null;
  const safeIndex = Math.max(0, Math.min(index, model.flatItems.length - 1));
  return model.flatItems[safeIndex] ?? null;
}
