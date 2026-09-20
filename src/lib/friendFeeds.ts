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

const emptyResult = (
  status: FriendFeedResult['status'],
  feedUrl: string | undefined,
  type: FriendFeedResult['type'],
): FriendFeedResult => ({
  status,
  feedUrl,
  type,
  totalItems: 0,
  articles: [],
});

const fetchWithTimeout = async (
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), FEED_TIMEOUT);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
};

const requestFeedXml = async (feedUrl: string): Promise<string> => {
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
    // Static deployments do not have the local development proxy.
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
};

const localName = (element: Element): string =>
  (element.localName || element.tagName.split(':').pop() || '').toLowerCase();

const childElement = (parent: Element, names: string[]): Element | null => {
  const accepted = new Set(names.map((name) => name.toLowerCase()));
  return (
    Array.from(parent.children).find((child) => accepted.has(localName(child))) ?? null
  );
};

const cleanText = (value: string): string => {
  const parsed = new DOMParser().parseFromString(value, 'text/html');
  return (parsed.body.textContent || '').replace(/\s+/g, ' ').trim();
};

const childText = (parent: Element, names: string[]): string => {
  const element = childElement(parent, names);
  return element ? cleanText(element.textContent || '') : '';
};

const childLink = (parent: Element, atomEntry: boolean): string => {
  const links = Array.from(parent.children).filter((child) => localName(child) === 'link');
  if (atomEntry) {
    const alternate = links.find(
      (link) => (link.getAttribute('rel') || 'alternate').toLowerCase() === 'alternate',
    );
    return alternate?.getAttribute('href')?.trim() || links[0]?.getAttribute('href')?.trim() || '';
  }
  return childText(parent, ['link']) || childText(parent, ['guid']);
};

const displayDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return `${date.getUTCMonth() + 1}月${date.getUTCDate()}日`;
};

const parseFeedXml = (xml: string, friendId: string): FriendFeedResult => {
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
};

export const fetchFriendFeed = async (friend: FriendLink): Promise<FriendFeedResult> => {
  const feedUrl = friend.feedUrl?.trim();
  const type = /atom/i.test(feedUrl || '') ? 'Atom' : 'RSS';
  if (!feedUrl) return emptyResult('unset', undefined, type);

  try {
    const xml = await requestFeedXml(feedUrl);
    return { ...parseFeedXml(xml, friend.id), feedUrl };
  } catch {
    return emptyResult('unavailable', feedUrl, type);
  }
};

export const applyFriendFeed = (
  source: BrewSource,
  index: number,
  result: FriendFeedResult,
): BrewSource => {
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
};
