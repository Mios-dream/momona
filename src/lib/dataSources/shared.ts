import type { LibraryFilter, LibraryItem, LibraryTile } from "../../data/types";
import { ProviderError, type LibraryItemSeed } from "./types";

/**
 * 请求 JSON 来源并将非成功响应转换为统一来源错误。
 *
 * @param url - 需要请求的地址。
 * @param init - 可选的请求配置。
 * @returns 解析后的未知 JSON 数据。
 * @throws 当响应状态不是成功状态时抛出 ProviderError。
 */
export async function readJson(
  url: string,
  init?: RequestInit,
): Promise<unknown> {
  const response = await fetch(url, init);
  if (!response.ok) {
    throw new ProviderError(
      `${response.status} ${response.statusText || "请求失败"}`,
      response.status,
    );
  }
  return response.json() as Promise<unknown>;
}

/**
 * 将来源条目数量限制在个人项目允许的安全范围内。
 *
 * @param value - 配置中的原始条目数量。
 * @returns 限制在 1 到 120 之间的整数数量。
 */
export function sourceLimit(value: number): number {
  return Math.min(120, Math.max(1, Math.round(value || 24)));
}

/**
 * 从用户名、UID 或链接中提取来源适配器需要的最后一段标识。
 *
 * @param value - 用户名、UID 或来源链接。
 * @param pattern - 用于提取路径片段的正则表达式。
 * @returns 适配器可以直接使用的来源标识。
 */
export function sourceValue(value: string, pattern: RegExp): string {
  const input = value.trim();
  if (!input) return "";
  try {
    const url = new URL(input);
    const match = url.pathname.match(pattern);
    if (match?.[1]) return match[1];
  } catch {
    // 设置项也可能已经是裸用户名或 UID，因此解析失败时直接使用原值。
  }
  return input.replace(/\/$/, "").split("/").pop() || input;
}

/**
 * 规范化来源图片地址，并为无效输入提供回退值。
 *
 * @param value - 来源返回的未知图片地址。
 * @param fallback - 图片地址无效时使用的回退地址。
 * @returns 可用于页面展示的图片地址。
 */
export function imageOr(value: unknown, fallback = ""): string {
  if (typeof value !== "string" || !value.trim()) return fallback;
  return value.startsWith("//") ? `https:${value}` : value;
}

/**
 * 将标题转换为稳定、可读的短 ID 片段。
 *
 * @param value - 需要转换的标题文本。
 * @returns 只包含稳定字符的短 ID 片段。
 */
export function slug(value: string): string {
  return (
    value
      .toLocaleLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fff]+/g, "-")
      .replace(/^-|-$/g, "") || "item"
  );
}

/**
 * 按条目位置循环分配资料库卡片主题色。
 *
 * @param index - 条目在当前列表中的索引。
 * @returns 资料库卡片使用的主题色。
 */
export function toneFor(index: number): LibraryTile["tone"] {
  return (["cyan", "pink", "violet", "cream", "dark"] as LibraryTile["tone"][])[
    index % 5
  ];
}

/**
 * 根据统一条目类别选择资料库卡片图标。
 *
 * @param type - 统一资料库条目类别。
 * @returns 资料库卡片使用的图标标识。
 */
export function iconFor(type: LibraryFilter): LibraryTile["icon"] {
  return (
    {
      anime: "play",
      book: "book",
      game: "game",
      music: "music",
      video: "video",
      all: "sparkles",
    } as const
  )[type];
}

/**
 * 将统一资料条目转换为画布布局使用的资料卡片。
 *
 * @param index - 条目在当前资料库列表中的索引。
 * @param item - 统一资料库条目。
 * @returns 带主题色、图标、尺寸和来源信息的画布卡片。
 */
export function tileFor(index: number, item: LibraryItem): LibraryTile {
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
}

/**
 * 将适配器输入规范化为统一资料库条目。
 *
 * @param item - 适配器生成的资料库条目种子。
 * @returns 可进入统一页面数据层的资料库条目。
 */
export function libraryItemFor(item: LibraryItemSeed): LibraryItem {
  return { ...item };
}
