import type { FriendLink } from './types';

/**
 * 判断未知值是否为友联卡片允许的主题色。
 *
 * @param value - 待判断的未知主题色。
 * @returns 值属于友联主题色集合时返回 true。
 */
function isFriendTone(value: unknown): value is FriendLink['tone'] {
  return (
    value === 'butter' ||
    value === 'lilac' ||
    value === 'mint' ||
    value === 'peach' ||
    value === 'rose' ||
    value === 'sky'
  );
}

/**
 * 将用户输入的友联地址规范化为 HTTP 或 HTTPS URL。
 *
 * @param value - 用户输入的主页地址。
 * @returns 规范化后的 HTTP 或 HTTPS 地址；输入无效时返回空字符串。
 */
export function normalizeFriendUrl(value: string): string {
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
}

/**
 * 将逗号分隔的标签清洗、去重并限制数量。
 *
 * @param value - 逗号分隔的原始标签文本。
 * @returns 最多四个去重后的标签。
 */
export function normalizeFriendTags(value: string): string[] {
  return Array.from(
    new Set(
      value
        .split(/[,，]/)
        .map((tag) => tag.trim().replace(/^#/, ''))
        .filter(Boolean),
    ),
  ).slice(0, 4);
}

/**
 * 根据昵称和位置生成旧配置兼容的友联 ID。
 *
 * @param nickname - 友联昵称。
 * @param index - 友联在配置中的位置。
 * @returns 稳定的友联 ID。
 */
function makeFriendId(nickname: string, index = 0): string {
  const base = nickname
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-|-$/g, '') || 'friend';
  return `${base}-${index + 1}`;
}

/**
 * 深拷贝友联数组，避免编辑页修改原始标签数组。
 *
 * @param items - 原始友联数组。
 * @returns 标签数组也被复制的新友联数组。
 */
export function cloneFriendLinks(items: FriendLink[]): FriendLink[] {
  return items.map((friend) => ({ ...friend, tags: [...friend.tags] }));
}

/**
 * 校验并规范化一条外部友联配置；不完整数据返回空值。
 *
 * @param value - 文件或表单中的未知友联配置。
 * @param index - 友联在列表中的索引，用于生成缺省 ID。
 * @returns 规范化后的友联；必填字段缺失时返回 null。
 */
export function normalizeFriendLink(
  value: unknown,
  index = 0,
): FriendLink | null {
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
}
