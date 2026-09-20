import { imageOr, slug, sourceLimit } from "../shared";
import { ProviderError } from "../types";
import type { LibraryItem, LocalConfig } from "../../../data/types";
import type { ProviderSyncData } from "../types";

const DEFAULT_SFACG_BASE = "https://p.sfacg.com";
const MAX_HTML_BYTES = 8 * 1024 * 1024;
const MAX_PAGES = 100;

export interface SfacgBookSnapshot {
  id: string;
  title: string;
  author: string;
  cover: string;
  url: string;
}

export interface SfacgRawData {
  source: "sfacg";
  shelfId: string;
  shelfUrl: string;
  shelfTitle: string;
  totalCount?: number;
  pagesFetched: number;
  books: SfacgBookSnapshot[];
}

interface SfacgShelfReference {
  shelfId: string;
  baseUrl: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const decodeHtmlEntities = (value: string): string =>
  value.replace(
    /&(?:nbsp|amp|lt|gt|quot|apos|#39|#x[0-9a-f]+|#[0-9]+);/gi,
    (entity) => {
      const lower = entity.toLowerCase();
      if (lower === "&nbsp;") return " ";
      if (lower === "&amp;") return "&";
      if (lower === "&lt;") return "<";
      if (lower === "&gt;") return ">";
      if (lower === "&quot;") return '"';
      if (lower === "&apos;" || lower === "&#39;") return "'";
      const hexadecimal = lower.match(/^&#x([0-9a-f]+);$/i);
      const decimal = lower.match(/^&#([0-9]+);$/);
      const codePoint = hexadecimal
        ? Number.parseInt(hexadecimal[1], 16)
        : decimal
          ? Number.parseInt(decimal[1], 10)
          : Number.NaN;
      if (!Number.isFinite(codePoint)) return entity;
      try {
        return String.fromCodePoint(codePoint);
      } catch {
        return entity;
      }
    },
  );

const stripHtmlText = (value: string): string =>
  decodeHtmlEntities(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();

const attribute = (tag: string, name: string): string => {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(
    new RegExp(`\\b${escaped}\\s*=\\s*(["'])(.*?)\\1`, "i"),
  );
  return match?.[2]?.trim() ?? "";
};

const safeSfacgUrl = (value: string, baseUrl = DEFAULT_SFACG_BASE): string => {
  const normalized = imageOr(value);
  if (!normalized) return "";
  try {
    const url = new URL(normalized, `${baseUrl}/`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
};

const allowedSfacgHost = (hostname: string): boolean =>
  hostname === "p.sfacg.com" || hostname === "www.sfacg.com";

const normalizeBaseUrl = (value: string): string => {
  const input = value.trim() || DEFAULT_SFACG_BASE;
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    throw new ProviderError("SFACG API 地址无效");
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
    !allowedSfacgHost(parsed.hostname)
  ) {
    throw new ProviderError("SFACG 只支持 p.sfacg.com 公开书架地址");
  }
  return parsed.origin;
};

/** 将公开书架 URL 或书架编号规范化为首个分页地址。 */
export const parseSfacgShelfReference = (
  value: string,
  baseUrl = DEFAULT_SFACG_BASE,
): SfacgShelfReference | null => {
  const base = normalizeBaseUrl(baseUrl);
  const input = value.trim();
  if (!input) return null;
  if (/^\d+$/.test(input)) {
    return { shelfId: input, baseUrl: base };
  }

  try {
    const url = new URL(input);
    if (!allowedSfacgHost(url.hostname)) return null;
    const match = url.pathname.match(/^\/p\/(\d+)(?:\/\d+)?\/?$/i);
    if (!match) return null;
    return { shelfId: match[1], baseUrl: url.origin };
  } catch {
    return null;
  }
};

const shelfPageUrl = (
  reference: SfacgShelfReference,
  page: number,
): string =>
  `${reference.baseUrl}/p/${reference.shelfId}/${page > 1 ? `${page}/` : ""}`;

const readSfacgHtml = async (url: string, referer?: string): Promise<string> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        Accept: "text/html, application/xhtml+xml;q=0.9, */*;q=0.8",
        Referer: referer || `${DEFAULT_SFACG_BASE}/`,
        "User-Agent": "Momona SFACG Sync/1.0",
      },
    });
    if (!response.ok) {
      throw new ProviderError(
        `SFACG 返回 ${response.status} ${response.statusText || "请求失败"}`,
        response.status,
      );
    }
    const body = await response.text();
    if (!body.trim()) throw new ProviderError("SFACG 返回了空页面");
    if (body.length > MAX_HTML_BYTES) {
      throw new ProviderError("SFACG 书架页面过大，已停止读取");
    }
    return body;
  } catch (error) {
    if (error instanceof ProviderError) throw error;
    if (error instanceof Error && error.name === "AbortError") {
      throw new ProviderError("SFACG 书架请求超时");
    }
    throw new ProviderError(
      `SFACG 书架暂时无法访问：${error instanceof Error ? error.message : String(error)}`,
    );
  } finally {
    clearTimeout(timer);
  }
};

const novelFromCard = (card: string, baseUrl: string): SfacgBookSnapshot | null => {
  const novelLink = card.match(
    /href\s*=\s*["'](?:https?:\/\/book\.sfacg\.com)?\/?Novel\/(\d+)(?:\/[^"']*)?["']/i,
  );
  if (!novelLink) return null;
  const id = novelLink[1];
  const titleMatch = card.match(
    /<b\b[^>]*>\s*<a\b[^>]*href\s*=\s*["'][^"']*\/?Novel\/\d+[^"']*["'][^>]*>([\s\S]*?)<\/a>/i,
  );
  const title = titleMatch ? stripHtmlText(titleMatch[1]) : "";
  if (!title) return null;
  const authorMatch = card.match(
    /作者\s*[:：]\s*<a\b[^>]*>([\s\S]*?)<\/a>/i,
  );
  const author = authorMatch ? stripHtmlText(authorMatch[1]) : "未知作者";
  const imageTag = card.match(/<img\b[^>]*>/i)?.[0] ?? "";
  const cover = safeSfacgUrl(
    attribute(imageTag, "src") ||
      attribute(imageTag, "data-src") ||
      attribute(imageTag, "data-original"),
    baseUrl,
  );
  return {
    id,
    title,
    author: author || "未知作者",
    cover,
    url: `https://book.sfacg.com/Novel/${id}/`,
  };
};

/** 解析公开书架页面中的小说卡片；漫画卡片会被刻意忽略。 */
export const parseSfacgShelfHtml = (
  html: string,
  baseUrl = DEFAULT_SFACG_BASE,
): { shelfTitle: string; totalCount?: number; books: SfacgBookSnapshot[] } => {
  const titleMatch = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  const shelfTitle = titleMatch ? stripHtmlText(titleMatch[1]) : "SFACG 公开书架";
  const totalMatch = html.match(/全部小说\s*\(\s*([\d,]+)\s*\)/i);
  const totalValue = totalMatch
    ? Number(totalMatch[1].replace(/,/g, ""))
    : Number.NaN;
  const books: SfacgBookSnapshot[] = [];
  const seen = new Set<string>();
  const listPattern = /<ul\b[^>]*>[\s\S]*?<\/ul>/gi;
  for (const match of html.matchAll(listPattern)) {
    const card = match[0];
    const openingTag = card.match(/^<ul\b[^>]*>/i)?.[0] ?? "";
    if (!/\bcontent_comment\b/i.test(openingTag)) continue;
    const book = novelFromCard(card, baseUrl);
    if (!book || seen.has(book.id)) continue;
    seen.add(book.id);
    books.push(book);
  }
  return {
    shelfTitle,
    ...(Number.isFinite(totalValue) ? { totalCount: totalValue } : {}),
    books,
  };
};

export const parseSfacgPageCount = (html: string, shelfId: string): number => {
  const escapedId = shelfId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `/p/${escapedId}/(\\d+)(?:/|["'<>\\s])`,
    "gi",
  );
  let maxPage = 1;
  for (const match of html.matchAll(pattern)) {
    const page = Number(match[1]);
    if (Number.isFinite(page)) maxPage = Math.max(maxPage, page);
  }
  return Math.min(MAX_PAGES, maxPage);
};

const booksFromRaw = (rawData: unknown): SfacgBookSnapshot[] => {
  if (!isRecord(rawData) || !Array.isArray(rawData.books)) return [];
  return rawData.books.flatMap((entry): SfacgBookSnapshot[] => {
    if (!isRecord(entry)) return [];
    const id = text(entry.id);
    const title = text(entry.title);
    if (!id || !title) return [];
    return [
      {
        id,
        title,
        author: text(entry.author) || "未知作者",
        cover: imageOr(entry.cover),
        url: text(entry.url) || `https://book.sfacg.com/Novel/${id}/`,
      },
    ];
  });
};

export const projectSfacgRaw = (
  rawData: unknown,
  config: LocalConfig["sources"]["sfacg"],
): LibraryItem[] => {
  if (!config.content.sfacgBooks) return [];
  return booksFromRaw(rawData)
    .slice(0, sourceLimit(config.limit))
    .map((book) => ({
      id: `sfacg-${book.id || slug(book.title)}`,
      itemType: "book" as const,
      title: book.title,
      subtitle: `SFACG · ${book.author}`,
      cover: book.cover,
      platform: "SFACG",
      url: book.url,
      sourceId: "sfacg" as const,
      sourceKind: "sfacgBooks" as const,
      metadata: { author: book.author },
    }));
};

export const syncSfacg = async (
  config: LocalConfig["sources"]["sfacg"],
): Promise<ProviderSyncData> => {
  const reference = parseSfacgShelfReference(config.username, config.endpoint);
  if (!config.enabled || !reference) {
    return {
      rawData: null,
      libraryItems: [],
      repositories: [],
      message: "未配置有效的 SFACG 开放书架地址",
    };
  }

  const firstUrl = shelfPageUrl(reference, 1);
  const firstHtml = await readSfacgHtml(firstUrl);
  const firstPage = parseSfacgShelfHtml(firstHtml, reference.baseUrl);
  let pageCount = parseSfacgPageCount(firstHtml, reference.shelfId);
  const limit = sourceLimit(config.limit);
  const books = new Map<string, SfacgBookSnapshot>();

  const addBooks = (entries: SfacgBookSnapshot[]): void => {
    for (const book of entries) {
      if (!books.has(book.id)) books.set(book.id, book);
      if (books.size >= limit) break;
    }
  };

  addBooks(firstPage.books);
  let pagesFetched = 1;
  for (let page = 2; page <= pageCount && books.size < limit; page += 1) {
    const url = shelfPageUrl(reference, page);
    const html = await readSfacgHtml(url, firstUrl);
    pageCount = Math.max(
      pageCount,
      parseSfacgPageCount(html, reference.shelfId),
    );
    const parsed = parseSfacgShelfHtml(html, reference.baseUrl);
    addBooks(parsed.books);
    pagesFetched = page;
  }

  if (!books.size && (firstPage.totalCount ?? 0) > 0) {
    throw new ProviderError("SFACG 书架页面结构发生变化，未找到小说条目");
  }

  const rawData: SfacgRawData = {
    source: "sfacg",
    shelfId: reference.shelfId,
    shelfUrl: firstUrl,
    shelfTitle: firstPage.shelfTitle,
    ...(firstPage.totalCount === undefined
      ? {}
      : { totalCount: firstPage.totalCount }),
    pagesFetched,
    books: [...books.values()],
  };
  const libraryItems = projectSfacgRaw(rawData, config);
  return {
    rawData,
    libraryItems,
    repositories: [],
    message: `SFACG 已同步 ${libraryItems.length} 部小说${
      rawData.totalCount === undefined ? "" : `（书架共 ${rawData.totalCount} 部）`
    }`,
  };
};
