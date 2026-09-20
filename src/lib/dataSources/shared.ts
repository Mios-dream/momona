import type { LibraryFilter, LibraryItem, LibraryTile } from "../../data/types";
import { ProviderError, type LibraryItemSeed } from "./types";

export const readJson = async (
  url: string,
  init?: RequestInit,
): Promise<unknown> => {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new ProviderError(
      `${response.status} ${response.statusText || "请求失败"}`,
      response.status,
    );
  }
  return response.json() as Promise<unknown>;
};

export const sourceLimit = (value: number): number =>
  Math.min(120, Math.max(1, Math.round(value || 24)));

export const sourceValue = (value: string, pattern: RegExp): string => {
  const input = value.trim();
  if (!input) return "";
  try {
    const url = new URL(input);
    const match = url.pathname.match(pattern);
    if (match?.[1]) return match[1];
  } catch {
    // The setting may already be a bare username or UID.
  }
  return input.replace(/\/$/, "").split("/").pop() || input;
};

export const imageOr = (value: unknown, fallback = ""): string => {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value.startsWith("//") ? `https:${value}` : value;
};

export const slug = (value: string): string =>
  value
    .toLocaleLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
    .replace(/^-|-$/g, "") || "item";

export const toneFor = (index: number): LibraryTile["tone"] =>
  (["cyan", "pink", "violet", "cream", "dark"] as LibraryTile["tone"][])[
    index % 5
  ];

export const iconFor = (type: LibraryFilter): LibraryTile["icon"] =>
  (
    {
      anime: "play",
      book: "book",
      game: "game",
      music: "music",
      video: "video",
      all: "sparkles",
    } as const
  )[type];

export const tileFor = (index: number, item: LibraryItem): LibraryTile => {
  const column = index % 3;
  const row = Math.floor(index / 3);
  const type = item.itemType as LibraryFilter;
  const portrait =
    type === "anime" ||
    type === "book" ||
    (type === "game" &&
      (item.sourceId === "bangumi" || item.sourceKind === "bangumiGames"));
  const square = type === "music";
  return {
    id: item.id,
    title: item.title,
    subtitle: item.subtitle,
    tag: item.itemType,
    image: item.cover,
    left: 300 + column * 520,
    top: 80 + row * 310,
    width: portrait ? 218 : square ? 218 : 430,
    height: portrait ? 418 : square ? 218 : 210,
    tone: toneFor(index),
    icon: iconFor(type),
    ...(item.url ? { url: item.url } : {}),
    ...(item.sourceId ? { sourceId: item.sourceId } : {}),
    ...(item.sourceKind ? { sourceKind: item.sourceKind } : {}),
    ...(item.rating === undefined ? {} : { rating: item.rating }),
    ...(item.collectionStatus
      ? { collectionStatus: item.collectionStatus }
      : {}),
  };
};

/** 将适配器输入规范化为统一资料库条目。 */
export const libraryItemFor = (item: LibraryItemSeed): LibraryItem => ({
  ...item,
});
