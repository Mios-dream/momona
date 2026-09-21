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

/**
 * 判断未知值是否为可安全读取的对象。
 *
 * @param value - 待判断的未知值。
 * @returns 值是非数组对象时返回 true。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * 将未知值转换为去除首尾空白的文本。
 *
 * @param value - 待转换的未知值。
 * @returns 去除首尾空白的字符串；非字符串返回空字符串。
 */
function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * 解码小说卡片中常见的 HTML 字符实体。
 *
 * @param value - 包含 HTML 实体的文本。
 * @returns 解码后的文本。
 */
function decodeHtmlEntities(value: string): string {
  return value.replace(
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
}

/**
 * 移除 HTML 标签并压缩卡片文本中的空白。
 *
 * @param value - 原始 HTML 文本。
 * @returns 适合页面展示的纯文本。
 */
function stripHtmlText(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, " "))
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * 从 HTML 标签中读取指定属性值。
 *
 * @param tag - 单个 HTML 标签文本。
 * @param name - 需要读取的属性名。
 * @returns 属性值；不存在时返回空字符串。
 */
function attribute(tag: string, name: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = tag.match(
    new RegExp(`\\b${escaped}\\s*=\\s*(["'])(.*?)\\1`, "i"),
  );
  return match?.[2]?.trim() ?? "";
}

/**
 * 将 SFACG 图片地址转换为可加载的绝对 HTTP 地址。
 *
 * @param value - 原始图片地址。
 * @param baseUrl - 相对地址使用的基础地址。
 * @returns 可加载的绝对地址；协议或格式不合法时返回空字符串。
 */
function safeSfacgUrl(value: string, baseUrl = DEFAULT_SFACG_BASE): string {
  const normalized = imageOr(value);
  if (!normalized) return "";
  try {
    const url = new URL(normalized, `${baseUrl}/`);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.toString();
  } catch {
    return "";
  }
}

/**
 * 判断主站地址是否属于允许读取的 SFACG 公共域名。
 *
 * @param hostname - 待判断的主机名。
 * @returns 主机名属于公开 SFACG 域名时返回 true。
 */
function allowedSfacgHost(hostname: string): boolean {
  return hostname === "p.sfacg.com" || hostname === "www.sfacg.com";
}

/**
 * 校验并规范化 SFACG 公共书架主站地址。
 *
 * @param value - 配置中的主站地址。
 * @returns 规范化后的站点源地址。
 * @throws 地址格式或主机名不被支持时抛出 ProviderError。
 */
function normalizeBaseUrl(value: string): string {
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
}

/**
 * 将公开书架 URL 或书架编号规范化为首个分页地址。
 *
 * @param value - 书架 URL 或数字 ID。
 * @param baseUrl - 数字 ID 使用的默认站点地址。
 * @returns 规范化后的书架引用；输入无效时返回 null。
 */
export function parseSfacgShelfReference(
  value: string,
  baseUrl = DEFAULT_SFACG_BASE,
): SfacgShelfReference | null {
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
}

/**
 * 根据书架引用生成指定分页的公开页面地址。
 *
 * @param reference - 规范化后的书架引用。
 * @param page - 需要请求的分页编号。
 * @returns 对应分页的公开书架地址。
 */
function shelfPageUrl(
  reference: SfacgShelfReference,
  page: number,
): string {
  return `${reference.baseUrl}/p/${reference.shelfId}/${page > 1 ? `${page}/` : ""}`;
}

/**
 * 请求一个 SFACG 公开书架页面，并统一处理超时、大小和 HTTP 错误。
 *
 * @param url - 需要请求的书架分页地址。
 * @param referer - 可选的来源页地址。
 * @returns 书架页面 HTML 文本。
 * @throws 网络、超时、HTTP 或页面大小异常时抛出 ProviderError。
 */
async function readSfacgHtml(url: string, referer?: string): Promise<string> {
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
}

/**
 * 从一个小说列表卡片中提取标题、作者、封面和详情地址。
 *
 * @param card - 单个小说列表卡片的 HTML。
 * @param baseUrl - 卡片内相对图片地址使用的基础地址。
 * @returns 小说快照；不是小说卡片或缺少标题时返回 null。
 */
function novelFromCard(card: string, baseUrl: string): SfacgBookSnapshot | null {
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
}

/**
 * 解析公开书架页面中的小说卡片；漫画卡片会被刻意忽略。
 *
 * @param html - 公开书架页面 HTML。
 * @param baseUrl - 页面内相对资源使用的基础地址。
 * @returns 书架标题、总数和小说快照。
 */
export function parseSfacgShelfHtml(
  html: string,
  baseUrl = DEFAULT_SFACG_BASE,
): { shelfTitle: string; totalCount?: number; books: SfacgBookSnapshot[] } {
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
}

/**
 * 从书架页面链接中读取最大分页，并限制单次同步的页数。
 *
 * @param html - 书架页面 HTML。
 * @param shelfId - 书架 ID。
 * @returns 不超过单次同步上限的最大分页编号。
 */
export function parseSfacgPageCount(html: string, shelfId: string): number {
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
}

/**
 * 从本地原始快照读取结构完整的小说条目。
 *
 * @param rawData - SFACG 本地原始快照。
 * @returns 结构完整的小说快照列表。
 */
function booksFromRaw(rawData: unknown): SfacgBookSnapshot[] {
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
}

/**
 * 将 SFACG 原始快照投影为当前配置允许公开的资料库条目。
 *
 * @param rawData - SFACG 本地原始快照。
 * @param config - SFACG 来源配置。
 * @returns 统一资料库书籍条目。
 */
export function projectSfacgRaw(
  rawData: unknown,
  config: LocalConfig["sources"]["sfacg"],
): LibraryItem[] {
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
}

/**
 * 请求公开书架分页，合并去重条目并生成 SFACG 原始快照。
 *
 * @param config - SFACG 来源配置。
 * @returns 包含原始书架快照和统一资料条目的同步数据。
 */
export async function syncSfacg(
  config: LocalConfig["sources"]["sfacg"],
): Promise<ProviderSyncData> {
  const reference = parseSfacgShelfReference(config.username);
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

  /**
   * 按 ID 去重写入当前同步批次，并在达到配置上限后停止追加。
   *
   * @param entries - 当前分页解析出的小说列表。
   * @returns 无返回值；结果写入当前同步批次集合。
   */
  function addBooks(entries: SfacgBookSnapshot[]): void {
    for (const book of entries) {
      if (!books.has(book.id)) books.set(book.id, book);
      if (books.size >= limit) break;
    }
  }

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
}
