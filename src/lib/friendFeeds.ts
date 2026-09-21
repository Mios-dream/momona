import type { BrewArticle, BrewSource, FriendLink } from '../data/types';

const FEED_TIMEOUT = 12_000;
const MAX_FEED_SIZE = 2_000_000;
const ARTICLE_LIMIT = 6;

export interface FriendFeedResult {
  status: NonNullable<BrewSource['feedStatus']>;
  feedUrl?: string;
  type: 'Atom' | 'RSS';
  totalItems: number;
  articles: BrewArticle[];
}

/**
 * 创建没有文章的订阅源结果。
 *
 * @param status - 订阅源当前状态。
 * @param feedUrl - 订阅地址。
 * @param type - 订阅协议类型。
 * @returns 没有文章的订阅结果。
 */
function emptyResult(
  status: FriendFeedResult['status'],
  feedUrl: string | undefined,
  type: FriendFeedResult['type'],
): FriendFeedResult {
  return {
    status,
    feedUrl,
    type,
    totalItems: 0,
    articles: [],
  };
}

/**
 * 发送带超时控制的浏览器请求。
 *
 * @param input - fetch 接受的请求地址或请求对象。
 * @param init - 可选的请求配置。
 * @returns 浏览器响应。
 */
async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), FEED_TIMEOUT);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * 优先通过本地代理读取订阅源，静态部署再回退到跨域直连。
 *
 * @param feedUrl - 需要读取的订阅地址。
 * @returns 订阅源 XML 文本。
 * @throws 代理和直连都失败时抛出错误。
 */
async function requestFeedXml(feedUrl: string): Promise<string> {
  const proxyUrl = `/__momona/friend-rss?url=${encodeURIComponent(feedUrl)}`;
  let proxyReachable = false;
  try {
    const response = await fetchWithTimeout(proxyUrl, {
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });
    const contentType = response.headers.get('content-type') || '';
    proxyReachable = contentType.includes('application/json');
    if (proxyReachable) {
      if (!response.ok) throw new Error('订阅源代理请求失败');
      const payload = (await response.json()) as { xml?: unknown };
      if (typeof payload.xml === 'string' && payload.xml.trim()) return payload.xml;
      throw new Error('订阅源代理未返回内容');
    }
  } catch (error) {
    if (proxyReachable) throw error;
    // 静态部署没有本地开发代理，因此继续尝试浏览器直连。
  }

  const directResponse = await fetchWithTimeout(feedUrl, {
    headers: { Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml' },
    mode: 'cors',
  });
  if (!directResponse.ok) {
    throw new Error(`订阅源返回 ${directResponse.status}`);
  }
  const xml = await directResponse.text();
  if (!xml.trim() || xml.length > MAX_FEED_SIZE) throw new Error('订阅源内容无效');
  return xml;
}

/**
 * 读取 XML 元素的本地名称并统一为小写。
 *
 * @param element - XML 元素。
 * @returns 小写的本地元素名称。
 */
function localName(element: Element): string {
  return (element.localName || element.tagName.split(':').pop() || '').toLowerCase();
}

/**
 * 在元素的直接子节点中查找指定名称的第一个元素。
 *
 * @param parent - 父 XML 元素。
 * @param names - 可接受的子元素名称列表。
 * @returns 匹配的第一个子元素；找不到时返回 null。
 */
function childElement(parent: Element, names: string[]): Element | null {
  const accepted = new Set(names.map((name) => name.toLowerCase()));
  return (
    Array.from(parent.children).find((child) => accepted.has(localName(child))) ?? null
  );
}

/**
 * 移除摘要 HTML 标签并压缩空白。
 *
 * @param value - 订阅源中的原始摘要文本。
 * @returns 适合页面展示的纯文本摘要。
 */
function cleanText(value: string): string {
  const parsed = new DOMParser().parseFromString(value, 'text/html');
  return (parsed.body.textContent || '').replace(/\s+/g, ' ').trim();
}

/**
 * 读取并清洗指定子元素的文本。
 *
 * @param parent - 父 XML 元素。
 * @param names - 可接受的子元素名称列表。
 * @returns 清洗后的子元素文本；找不到时返回空字符串。
 */
function childText(parent: Element, names: string[]): string {
  const element = childElement(parent, names);
  return element ? cleanText(element.textContent || '') : '';
}

/**
 * 按 RSS 或 Atom 规则读取文章链接。
 *
 * @param parent - 文章 XML 元素。
 * @param atomEntry - 是否按 Atom entry 规则读取。
 * @returns 文章链接；没有链接时返回空字符串。
 */
function childLink(parent: Element, atomEntry: boolean): string {
  const links = Array.from(parent.children).filter((child) => localName(child) === 'link');
  if (atomEntry) {
    const alternate = links.find(
      (link) => (link.getAttribute('rel') || 'alternate').toLowerCase() === 'alternate',
    );
    return alternate?.getAttribute('href')?.trim() || links[0]?.getAttribute('href')?.trim() || '';
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
 * 解析 RSS/Atom XML，并按时间返回有限数量的文章。
 *
 * @param xml - RSS 或 Atom XML 文本。
 * @param friendId - 友联稳定 ID，用于生成文章 ID。
 * @returns 解析后的订阅源结果。
 * @throws XML 无效或根节点不是支持的订阅格式时抛出错误。
 */
function parseFeedXml(xml: string, friendId: string): FriendFeedResult {
  const parsed = new DOMParser().parseFromString(xml, 'application/xml');
  if (parsed.querySelector('parsererror')) throw new Error('订阅源 XML 无效');

  const rootType = localName(parsed.documentElement);
  if (!['rss', 'feed', 'rdf', 'channel'].includes(rootType)) {
    throw new Error('不是 RSS 或 Atom 订阅源');
  }
  const atomEntry = rootType === 'feed';
  const itemName = atomEntry ? 'entry' : 'item';
  const elements = Array.from(parsed.getElementsByTagName('*')).filter(
    (element) => localName(element) === itemName,
  );
  const items = elements.flatMap((element, index) => {
    const title = childText(element, ['title']);
    if (!title) return [];
    const dateValue = childText(
      element,
      atomEntry ? ['published', 'updated'] : ['pubdate', 'published', 'updated', 'date'],
    );
    const summary = childText(
      element,
      atomEntry ? ['summary', 'content'] : ['description', 'summary', 'encoded'],
    );
    const href = childLink(element, atomEntry);
    const id = childText(element, atomEntry ? ['id'] : ['guid']) || href || `${friendId}-${index + 1}`;
    const timestamp = Date.parse(dateValue);
    return [{
      id: `${friendId}-${id}`,
      title,
      date: displayDate(dateValue),
      ...(summary ? { summary: summary.slice(0, 220) } : {}),
      ...(href ? { href } : {}),
      timestamp: Number.isNaN(timestamp) ? 0 : timestamp,
      index,
    }];
  });

  items.sort((first, second) => second.timestamp - first.timestamp || first.index - second.index);
  const articles = items.slice(0, ARTICLE_LIMIT).map(({ timestamp, index, ...article }) => article);

  return {
    status: 'available',
    type: atomEntry ? 'Atom' : 'RSS',
    totalItems: items.length,
    articles,
  };
}

/**
 * 读取单个友联的订阅源并将网络失败转换为可展示状态。
 *
 * @param friend - 需要读取的友联配置。
 * @returns 可直接展示在 Brew 页面中的订阅结果。
 */
export async function fetchFriendFeed(friend: FriendLink): Promise<FriendFeedResult> {
  const feedUrl = friend.feedUrl?.trim();
  const type = /atom/i.test(feedUrl || '') ? 'Atom' : 'RSS';
  if (!feedUrl) return emptyResult('unset', undefined, type);

  try {
    const xml = await requestFeedXml(feedUrl);
    return { ...parseFeedXml(xml, friend.id), feedUrl };
  } catch {
    return emptyResult('unavailable', feedUrl, type);
  }
}

/**
 * 将运行时订阅结果合并回 Brew 来源卡片。
 *
 * @param source - 原始 Brew 来源卡片。
 * @param index - 来源在列表中的索引，用于决定布局。
 * @param result - 运行时读取到的订阅结果。
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
