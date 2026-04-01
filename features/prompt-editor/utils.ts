import type { JSONContent } from "@tiptap/core";
import { Node as ProseMirrorNode } from "@tiptap/pm/model";
import type {
  PromptPayload,
  PromptReference,
  PromptResource,
  ReadyPromptResource,
} from "./types";

export const RESOURCE_REGISTRY_NODE_NAME = "resourceRegistry";
export const IMAGE_TAG_NODE_NAME = "imageTag";
export const IMAGE_TAG_PAIR_GAP_SENTINEL = "\u200B";

export const generateId = () => `res-${crypto.randomUUID()}`;

export function stripImageTagPairGapSentinels(text: string): string {
  return text.replaceAll(IMAGE_TAG_PAIR_GAP_SENTINEL, "");
}

export function sanitizePromptText(text: string): string {
  return stripImageTagPairGapSentinels(text);
}

export function isImageTagPairGapSentinelText(text: string): boolean {
  return (
    text.length > 0 &&
    stripImageTagPairGapSentinels(text).length === 0
  );
}

export function isImageTagPairGapSentinelTextNode(
  node: ProseMirrorNode | null | undefined,
): boolean {
  return Boolean(
    node?.isText && isImageTagPairGapSentinelText(node.text ?? ""),
  );
}

export const EMPTY_DOC: JSONContent = {
  type: "doc",
  content: [
    {
      type: RESOURCE_REGISTRY_NODE_NAME,
      attrs: {
        resources: [],
      },
    },
    { type: "paragraph" },
  ],
};

export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export function getPromptResourceToken(resource: PromptResource): string {
  return resource.reference.type === "slot"
    ? `图${resource.reference.slot}`
    : resource.reference.handle;
}

export function getPromptResourceMentionText(resource: PromptResource): string {
  return `[@${getPromptResourceToken(resource)}]`;
}

export function isReadyPromptResource(
  resource: PromptResource,
): resource is ReadyPromptResource {
  return resource.status === "ready" && Boolean(resource.asset?.url);
}

export function getPromptResourcePreviewUrl(resource: PromptResource) {
  return resource.asset?.url ?? null;
}

function appendTextNodes(text: string, nodes: JSONContent[]) {
  const lines = text.split("\n");

  lines.forEach((line, index) => {
    if (line) {
      nodes.push({ type: "text", text: line });
    }

    if (index < lines.length - 1) {
      nodes.push({ type: "hardBreak" });
    }
  });
}

function buildResourceTokenMap(resources: PromptResource[]) {
  const tokenEntries = resources.map((resource) => [
    getPromptResourceMentionText(resource),
    resource,
  ] as const);

  tokenEntries.sort((a, b) => b[0].length - a[0].length);

  return tokenEntries;
}

function buildParagraphContent(
  text: string,
  resources: PromptResource[],
): JSONContent[] {
  const content: JSONContent[] = [];
  const tokenEntries = buildResourceTokenMap(resources);
  const normalizedText = sanitizePromptText(text);
  let cursor = 0;

  while (cursor < normalizedText.length) {
    const matchedEntry = tokenEntries.find(([token]) =>
      normalizedText.startsWith(token, cursor),
    );

    if (matchedEntry) {
      const [token, resource] = matchedEntry;
      content.push({
        type: IMAGE_TAG_NODE_NAME,
        attrs: { resourceId: resource.id },
      });
      cursor += token.length;
      continue;
    }

    const nextTokenStart = (() => {
      for (let index = cursor; index < normalizedText.length; index += 1) {
        if (normalizedText[index] !== "@") {
          continue;
        }

        if (tokenEntries.some(([token]) => normalizedText.startsWith(token, index))) {
          return index;
        }
      }

      return -1;
    })();

    const textEnd = nextTokenStart === -1 ? normalizedText.length : nextTokenStart;
    appendTextNodes(normalizedText.slice(cursor, textEnd), content);
    cursor = textEnd;
  }

  return content;
}

export function payloadToContent(
  text: string,
  resources: PromptResource[],
): JSONContent {
  const normalizedText = sanitizePromptText(text);
  const paragraphs = normalizedText ? normalizedText.split("\n\n") : [""];
  const docContent = paragraphs.map((paragraph) => {
    const paragraphContent = buildParagraphContent(paragraph, resources);

    return paragraphContent.length > 0
      ? { type: "paragraph", content: paragraphContent }
      : { type: "paragraph" };
  });

  return {
    type: "doc",
    content: [
      {
        type: RESOURCE_REGISTRY_NODE_NAME,
        attrs: { resources },
      },
      ...(docContent.length > 0 ? docContent : [{ type: "paragraph" }]),
    ],
  };
}

export function findResourceRegistryPos(doc: ProseMirrorNode): number | null {
  return doc.firstChild?.type.name === RESOURCE_REGISTRY_NODE_NAME ? 0 : null;
}

export function getPromptResources(doc: ProseMirrorNode): PromptResource[] {
  const registryPos = findResourceRegistryPos(doc);
  if (registryPos === null) {
    return [];
  }

  const registryNode = doc.nodeAt(registryPos);
  const resources = registryNode?.attrs.resources;

  return Array.isArray(resources) ? (resources as PromptResource[]) : [];
}

export function getPromptResourceMap(doc: ProseMirrorNode) {
  return new Map(
    getPromptResources(doc).map((resource) => [resource.id, resource]),
  );
}

export function getReferencedResourceIds(doc: ProseMirrorNode) {
  const ids = new Set<string>();

  doc.descendants((node) => {
    if (node.type.name === RESOURCE_REGISTRY_NODE_NAME) {
      return false;
    }

    if (
      node.type.name === IMAGE_TAG_NODE_NAME &&
      typeof node.attrs.resourceId === "string"
    ) {
      ids.add(node.attrs.resourceId);
      return false;
    }
  });

  return ids;
}

function serializeInlineContent(
  node: ProseMirrorNode,
  resourceMap: Map<string, PromptResource>,
): string {
  const parts: string[] = [];

  node.forEach((child) => {
    if (child.isText) {
      parts.push(sanitizePromptText(child.text ?? ""));
      return;
    }

    if (child.type.name === "hardBreak") {
      parts.push("\n");
      return;
    }

    if (child.type.name === IMAGE_TAG_NODE_NAME) {
      const resourceId = child.attrs.resourceId as string | undefined;
      const resource = resourceId ? resourceMap.get(resourceId) : undefined;

      parts.push(
        resource ? getPromptResourceMentionText(resource) : `[@${resourceId ?? ""}]`,
      );
      return;
    }

    if (child.isLeaf) {
      parts.push(sanitizePromptText(child.textContent));
      return;
    }

    parts.push(serializeInlineContent(child, resourceMap));
  });

  return parts.join("");
}

export function serializePrompt(doc: ProseMirrorNode): string {
  const blocks: string[] = [];
  const resourceMap = getPromptResourceMap(doc);

  doc.forEach((node) => {
    if (node.type.name === RESOURCE_REGISTRY_NODE_NAME) {
      return;
    }

    blocks.push(serializeInlineContent(node, resourceMap));
  });

  return blocks.join("\n\n");
}

export function serializePromptPayload(doc: ProseMirrorNode): PromptPayload {
  const referencedResourceIds = getReferencedResourceIds(doc);
  const resources = getPromptResources(doc).filter((resource) => {
    return referencedResourceIds.has(resource.id);
  });

  return {
    text: serializePrompt(doc),
    resources,
  };
}

export function getLocalResourceSlots(resources: PromptResource[]) {
  return resources
    .filter(
      (resource): resource is PromptResource & {
        reference: Extract<PromptReference, { type: "slot" }>;
      } =>
        resource.kind === "local_image" && resource.reference.type === "slot",
    )
    .map((resource) => resource.reference.slot);
}
