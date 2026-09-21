import type { FriendLink } from '../data/types';
import {
  emptyFeedResult,
  parseFeedXml,
  type FriendFeedResult,
} from './brewFeedParser';

const FEED_TIMEOUT = 12_000;
const MAX_FEED_SIZE = 2_000_000;

/**
 * 在 Node 更新流程中读取单个 RSS/Atom 订阅源。
 *
 * @param friend - 至少包含稳定 ID 和订阅地址的友联配置。
 * @returns 可写入静态缓存的订阅结果。
 */
export async function fetchFriendFeedForSync(
  friend: Pick<FriendLink, 'id' | 'feedUrl'>,
): Promise<FriendFeedResult> {
  const feedUrl = friend.feedUrl?.trim();
  const type = /atom/i.test(feedUrl || '') ? 'Atom' : 'RSS';
  if (!feedUrl) return emptyFeedResult('unset', undefined, type);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FEED_TIMEOUT);
  try {
    const response = await fetch(feedUrl, {
      signal: controller.signal,
      headers: {
        Accept: 'application/rss+xml, application/atom+xml, application/xml, text/xml',
        'User-Agent': 'Momona Friend RSS Reader/1.0',
      },
    });
    if (!response.ok) {
      throw new Error(`订阅源返回 ${response.status}`);
    }
    const xml = await response.text();
    if (!xml.trim() || xml.length > MAX_FEED_SIZE) {
      throw new Error('订阅源内容无效');
    }
    return { ...parseFeedXml(xml, friend.id), feedUrl };
  } catch (error) {
    return emptyFeedResult(
      'unavailable',
      feedUrl,
      type,
      error instanceof Error ? error.message : String(error),
    );
  } finally {
    clearTimeout(timer);
  }
}
