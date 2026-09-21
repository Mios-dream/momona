import type { BrewSource, FriendLink } from './types';

const tones: BrewSource['tone'][] = [
  'purple',
  'orange',
  'blue',
  'green',
  'pink',
];

/**
 * 从友联主页地址提取用于展示的主机名。
 *
 * @param href - 友联主页地址。
 * @returns 去除 www 前缀的主机名；地址无效时返回原文本。
 */
function getHost(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./, '');
  } catch {
    return href;
  }
}

/**
 * 根据订阅地址的文本特征推断 RSS 或 Atom 类型。
 *
 * @param feedUrl - 订阅地址。
 * @returns 订阅协议类型。
 */
function feedTypeFromUrl(feedUrl: string): BrewSource['type'] {
  return /atom/i.test(feedUrl) ? 'Atom' : 'RSS';
}

/**
 * 将友联配置转换为待运行时验证的 Brew 来源。
 *
 * @param friend - 友联配置。
 * @param index - 友联在配置数组中的索引，用于循环分配主题色。
 * @returns 尚未读取文章的 Brew 来源。
 */
function sourceFromFriend(
  friend: FriendLink,
  index: number,
  cachedSources: readonly BrewSource[],
): BrewSource {
  const feedUrl = friend.feedUrl?.trim() || undefined;
  const source: BrewSource = {
    id: `friend-${friend.id}`,
    name: friend.nickname,
    author: getHost(friend.href),
    type: feedUrl ? feedTypeFromUrl(feedUrl) : '链接',
    layout: 'link',
    articleCount: 0,
    latestTitle: '',
    summary: '',
    date: '',
    image: friend.avatar,
    href: friend.href,
    feedUrl,
    feedStatus: feedUrl ? 'unavailable' : 'unset',
    tone: tones[index % tones.length],
    tags: [...friend.tags],
    articles: [],
  };

  if (!feedUrl) return source;
  const cached = cachedSources.find(
    (candidate) =>
      candidate.id === source.id &&
      candidate.feedUrl === feedUrl &&
      candidate.feedStatus === 'available',
  );
  if (!cached) return source;

  return {
    ...source,
    type: cached.type === 'Atom' || cached.type === 'RSS' ? cached.type : source.type,
    layout: cached.articles.length
      ? index % 4 === 0
        ? 'featured'
        : 'standard'
      : 'link',
    articleCount: cached.articleCount,
    latestTitle: cached.latestTitle,
    summary: cached.summary,
    date: cached.date,
    feedStatus: 'available',
    articles: cached.articles,
  };
}

/**
 * 根据当前友联配置创建 Brew 来源，并恢复与订阅地址匹配的文章缓存。
 *
 * @param friends - 当前友联配置列表。
 * @param cachedSources - 上一次抓取成功的 Brew 来源缓存。
 * @returns 与友联一一对应的 Brew 来源列表。
 */
export function createBrewSources(
  friends: FriendLink[],
  cachedSources: readonly BrewSource[] = [],
): BrewSource[] {
  return friends.map((friend, index) =>
    sourceFromFriend(friend, index, cachedSources),
  );
}
