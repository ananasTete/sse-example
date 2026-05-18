import type { LucideIcon } from "lucide-react";
import {
  Type,
  Bold,
  Italic,
  Underline,
  Strikethrough,
} from "lucide-react";

export type SlashCommandId =
  | "paragraph"
  | "bold"
  | "italic"
  | "underline"
  | "strike";

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

const rootSections: SlashMenuSection[] = [
  {
    id: "basic",
    title: "Basic",
    items: [
      { id: "paragraph", label: "Text", icon: Type, keywords: ["p", "text"] },
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
