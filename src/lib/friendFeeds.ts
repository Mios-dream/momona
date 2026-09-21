import type { FriendLink } from '../data/types';
import {
  emptyFeedResult,
  parseFeedXml,
  type FriendFeedResult,
} from './brewFeedParser';

const FEED_TIMEOUT = 12_000;
const MAX_FEED_SIZE = 2_000_000;

export type { FriendFeedResult } from './brewFeedParser';
export { applyFriendFeed, parseFeedXml } from './brewFeedParser';

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
 * 读取单个友联的订阅源并将网络失败转换为可展示状态。
 *
 * @param friend - 至少包含稳定 ID 和订阅地址的友联配置。
 * @returns 可直接展示在 Brew 页面中的订阅结果。
 */
export async function fetchFriendFeed(
  friend: Pick<FriendLink, 'id' | 'feedUrl'>,
): Promise<FriendFeedResult> {
  const feedUrl = friend.feedUrl?.trim();
  const type = /atom/i.test(feedUrl || '') ? 'Atom' : 'RSS';
  if (!feedUrl) return emptyFeedResult('unset', undefined, type);

  try {
    const xml = await requestFeedXml(feedUrl);
    return { ...parseFeedXml(xml, friend.id), feedUrl };
  } catch (error) {
    return emptyFeedResult(
      'unavailable',
      feedUrl,
      type,
      error instanceof Error ? error.message : String(error),
    );
  }
}
