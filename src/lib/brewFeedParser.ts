import { XMLParser } from 'fast-xml-parser';
import type { BrewArticle, BrewSource } from '../data/types';

const ARTICLE_LIMIT = 6;

export interface FriendFeedResult {
  status: NonNullable<BrewSource['feedStatus']>;
  feedUrl?: string;
  type: 'Atom' | 'RSS';
  totalItems: number;
  articles: BrewArticle[];
  error?: string;
}

const xmlParser = new XMLParser({
  attributeNamePrefix: '@_',
  ignoreAttributes: false,
  ignoreDeclaration: true,
  ignorePiTags: true,
  parseTagValue: false,
  removeNSPrefix: true,
  trimValues: true,
});

/**
 * 判断未知值是否为可读取属性的普通对象。
 *
 * @param value - 待判断的未知值。
 * @returns 值为非数组对象时返回 true。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

/**
 * 将 XML 节点值转换为文本；同时兼容属性、CDATA 和嵌套文本节点。
 *
 * @param value - XML 解析器返回的节点值。
 * @returns 节点中的纯文本。
 */
function textValue(value: unknown): string {
  if (typeof value === 'string' || typeof value === 'number') {
    return String(value).trim();
  }
  if (Array.isArray(value)) {
    return value.map(textValue).filter(Boolean).join(' ').trim();
  }
  if (!isRecord(value)) return '';

  const directText = value['#text'] ?? value.__cdata;
  if (directText !== undefined) return textValue(directText);

  return Object.entries(value)
    .filter(([key]) => !key.startsWith('@_'))
    .map(([, child]) => textValue(child))
    .filter(Boolean)
    .join(' ')
    .trim();
}

/**
 * 解码订阅源摘要里常见的 HTML 实体。
 *
 * @param value - 可能包含 HTML 标签和实体的原始文本。
 * @returns 适合页面展示的纯文本。
 */
function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(?:nbsp|amp|lt|gt|quot|apos|#39|#x[0-9a-f]+|#[0-9]+);/gi,
    (entity) => {
      const lower = entity.toLowerCase();
      if (lower === '&nbsp;') return ' ';
      if (lower === '&amp;') return '&';
      if (lower === '&lt;') return '<';
      if (lower === '&gt;') return '>';
      if (lower === '&quot;') return '"';
      if (lower === '&apos;' || lower === '&#39;') return "'";

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
 * 移除摘要 HTML 标签并压缩空白。
 *
 * @param value - 订阅源中的原始摘要文本。
 * @returns 适合页面展示的纯文本摘要。
 */
function cleanText(value: string): string {
  return decodeHtmlEntities(value.replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 将 XML 中可能出现的单项或数组统一成数组。
 *
 * @param value - XML 节点值。
 * @returns 节点数组；空值返回空数组。
 */
function toArray(value: unknown): unknown[] {
  return value === undefined || value === null
    ? []
    : Array.isArray(value)
      ? value
      : [value];
}

/**
 * 读取父节点中的第一个指定子节点。
 *
 * @param parent - XML 父节点。
 * @param names - 可接受的子节点名称。
 * @returns 第一个匹配节点；没有匹配时返回 undefined。
 */
function childValue(
  parent: Record<string, unknown>,
  names: string[],
): unknown {
  for (const name of names) {
    if (parent[name] !== undefined) return parent[name];
  }
  return undefined;
}

/**
 * 读取指定子节点的纯文本。
 *
 * @param parent - XML 父节点。
 * @param names - 可接受的子节点名称。
 * @returns 清洗后的文本；没有匹配时返回空字符串。
 */
function childText(parent: Record<string, unknown>, names: string[]): string {
  return cleanText(textValue(childValue(parent, names)));
}

/**
 * 读取 XML 节点属性。
 *
 * @param value - XML 节点值。
 * @param name - 属性名称。
 * @returns 属性文本；不存在时返回空字符串。
 */
function attributeValue(value: unknown, name: string): string {
  if (!isRecord(value)) return '';
  return textValue(value[`@_${name}`] ?? value[name]);
}

/**
 * 按 RSS 或 Atom 规则读取文章链接。
 *
 * @param parent - 文章 XML 节点。
 * @param atomEntry - 是否按 Atom entry 规则读取。
 * @returns 文章链接；没有链接时返回空字符串。
 */
function childLink(parent: Record<string, unknown>, atomEntry: boolean): string {
  const links = toArray(childValue(parent, ['link']));
  if (atomEntry) {
    const alternate = links.find(
      (link) =>
        (attributeValue(link, 'rel') || 'alternate').toLowerCase() ===
        'alternate',
    );
    return (
      attributeValue(alternate, 'href') ||
      textValue(alternate) ||
      attributeValue(links[0], 'href') ||
      textValue(links[0])
    ).trim();
  }
  return childText(parent, ['link']) || childText(parent, ['guid']);
}

/**
 * 将订阅源日期格式化为页面使用的月日文本。
 *
 * @param value - 订阅源日期文本。
 * @returns 月日文本；日期无效时返回空字符串。
 */
function displayDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
}

/**
 * 创建没有文章的订阅源结果。
 *
 * @param status - 订阅源当前状态。
 * @param feedUrl - 订阅地址。
 * @param type - 订阅协议类型。
 * @param error - 可选的抓取错误信息。
 * @returns 没有文章的订阅结果。
 */
export function emptyFeedResult(
  status: FriendFeedResult['status'],
  feedUrl: string | undefined,
  type: FriendFeedResult['type'],
  error?: string,
): FriendFeedResult {
  return {
    status,
    feedUrl,
    type,
    totalItems: 0,
    articles: [],
    ...(error ? { error } : {}),
  };
}

/**
 * 解析 RSS/Atom XML，并按时间返回有限数量的文章。
 *
 * @param xml - RSS 或 Atom XML 文本。
 * @param friendId - 友联稳定 ID，用于生成文章 ID。
 * @returns 解析后的订阅源结果。
 * @throws XML 无效或根节点不是支持的订阅格式时抛出错误。
 */
export function parseFeedXml(xml: string, friendId: string): FriendFeedResult {
  const parsed = xmlParser.parse(xml) as Record<string, unknown>;
  const rootName = Object.keys(parsed)[0]?.toLowerCase() ?? '';
  const root = parsed[Object.keys(parsed)[0] ?? ''];
  if (!isRecord(root) || !['rss', 'feed', 'rdf', 'channel'].includes(rootName)) {
    throw new Error('不是 RSS 或 Atom 订阅源');
  }

  const atomEntry = rootName === 'feed';
  const channel = isRecord(root.channel) ? root.channel : undefined;
  const rawItems = atomEntry
    ? root.entry
    : channel?.item ?? root.item;
  const items = toArray(rawItems).flatMap((value, index) => {
    if (!isRecord(value)) return [];

    const title = childText(value, ['title']);
    if (!title) return [];
    const dateValue = childText(
      value,
      atomEntry
        ? ['published', 'updated']
        : ['pubDate', 'pubdate', 'published', 'updated', 'date'],
    );
    const summary = childText(
      value,
      atomEntry ? ['summary', 'content'] : ['description', 'summary', 'encoded'],
    );
    const href = childLink(value, atomEntry);
    const id =
      childText(value, atomEntry ? ['id'] : ['guid']) ||
      href ||
      `${friendId}-${index + 1}`;
    const timestamp = Date.parse(dateValue);

    return [
      {
        article: {
          id: `${friendId}-${id}`,
          title,
          date: displayDate(dateValue),
          ...(summary ? { summary: summary.slice(0, 220) } : {}),
          ...(href ? { href } : {}),
        },
        timestamp: Number.isNaN(timestamp) ? 0 : timestamp,
        index,
      },
    ];
  });

  items.sort(
    (first, second) =>
      second.timestamp - first.timestamp || first.index - second.index,
  );

  return {
    status: 'available',
    type: atomEntry ? 'Atom' : 'RSS',
    totalItems: items.length,
    articles: items.slice(0, ARTICLE_LIMIT).map(({ article }) => article),
  };
}

/**
 * 将运行时订阅结果合并回 Brew 来源卡片。
 *
 * @param source - 原始 Brew 来源卡片。
 * @param index - 来源在列表中的索引，用于决定布局。
 * @param result - 读取到的订阅结果。
 * @returns 合并订阅状态和文章后的 Brew 来源卡片。
 */
export function applyFriendFeed(
  source: BrewSource,
  index: number,
  result: FriendFeedResult,
): BrewSource {
  const hasArticles = result.articles.length > 0;
  const latest = result.articles[0];
  return {
    ...source,
    type: result.status === 'unset' ? source.type : result.type,
    feedUrl: result.feedUrl || source.feedUrl,
    feedStatus: result.status,
    layout: hasArticles ? (index % 4 === 0 ? 'featured' : 'standard') : 'link',
    articleCount: result.totalItems,
    latestTitle: latest?.title || '',
    summary: latest?.summary || '',
    date: latest?.date || '',
    articles: result.articles,
  };
}
