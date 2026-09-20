import type { BrewSource, FriendLink } from './types';

const tones: BrewSource['tone'][] = [
  'purple',
  'orange',
  'blue',
  'green',
  'pink',
];

const getHost = (href: string): string => {
  try {
    return new URL(href).hostname.replace(/^www\./, '');
  } catch {
    return href;
  }
};

const feedTypeFromUrl = (feedUrl: string): BrewSource['type'] =>
  /atom/i.test(feedUrl) ? 'Atom' : 'RSS';

const sourceFromFriend = (friend: FriendLink, index: number): BrewSource => {
  const feedUrl = friend.feedUrl?.trim() || undefined;

  return {
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
};

/** 根据当前友联配置创建 Brew 来源；文章必须由运行时验证订阅源后填充。 */
export const createBrewSources = (friends: FriendLink[]): BrewSource[] =>
  friends.map(sourceFromFriend);
