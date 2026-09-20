import type { FriendLink } from './types';

const isFriendTone = (value: unknown): value is FriendLink['tone'] =>
  value === 'butter' ||
  value === 'lilac' ||
  value === 'mint' ||
  value === 'peach' ||
  value === 'rose' ||
  value === 'sky';

export const normalizeFriendUrl = (value: string): string => {
  const raw = value.trim();
  if (!raw) return '';
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(raw)
    ? raw
    : `https://${raw}`;

  try {
    const url = new URL(candidate);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : '';
  } catch {
    return '';
  }
};

export const normalizeFriendTags = (value: string): string[] =>
  Array.from(
    new Set(
      value
        .split(/[,，]/)
        .map((tag) => tag.trim().replace(/^#/, ''))
        .filter(Boolean),
    ),
  ).slice(0, 4);

const makeFriendId = (nickname: string, index = 0): string => {
  const base = nickname
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-|-$/g, '') || 'friend';
  return `${base}-${index + 1}`;
};

export const cloneFriendLinks = (items: FriendLink[]): FriendLink[] =>
  items.map((friend) => ({ ...friend, tags: [...friend.tags] }));

export const normalizeFriendLink = (
  value: unknown,
  index = 0,
): FriendLink | null => {
  if (!value || typeof value !== 'object') return null;
  const record = value as Partial<FriendLink>;
  const nickname = typeof record.nickname === 'string' ? record.nickname.trim() : '';
  const signature = typeof record.signature === 'string' ? record.signature.trim() : '';
  const href = typeof record.href === 'string' ? normalizeFriendUrl(record.href) : '';
  if (!nickname || !signature || !href) return null;

  const rawTags = Array.isArray(record.tags)
    ? record.tags.filter((tag): tag is string => typeof tag === 'string').join(',')
    : '';
  const tags = normalizeFriendTags(rawTags);
  const feedUrl =
    typeof record.feedUrl === 'string' ? normalizeFriendUrl(record.feedUrl) : '';

  return {
    id: typeof record.id === 'string' && record.id ? record.id : makeFriendId(nickname, index),
    nickname,
    href,
    avatar: typeof record.avatar === 'string' ? record.avatar.trim() : '',
    signature,
    tags: tags.length ? tags : ['友联'],
    ...(feedUrl ? { feedUrl } : {}),
    tone: isFriendTone(record.tone) ? record.tone : 'lilac',
  };
};
