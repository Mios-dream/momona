import { resolve } from 'node:path';
import type { BrewFeedCache, BrewSource, FriendLink } from '../data/types';
import { createBrewSources } from '../data/brew';
import { readJsonFile, writeJsonFileAtomically } from './persistence/jsonFile';
import { applyFriendFeed } from './brewFeedParser';
import { fetchFriendFeedForSync } from './brewFeedSync';

/** Brew 文章公开缓存的磁盘位置。 */
export const brewFeedCachePath = resolve(
  process.cwd(),
  '.momona',
  'brew-feeds.json',
);

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
 * 判断缓存中的文章结构是否可直接交给页面。
 *
 * @param value - 缓存中的未知文章值。
 * @returns 值满足页面文章的最小结构时返回 true。
 */
function isBrewArticle(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string' && typeof value.title === 'string';
}

/**
 * 判断缓存中的来源结构是否可用于恢复文章。
 *
 * @param value - 缓存中的未知来源值。
 * @returns 值满足 Brew 来源缓存的最小结构时返回 true。
 */
function isBrewSource(value: unknown): value is BrewSource {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === 'string' &&
    typeof value.feedUrl === 'string' &&
    (value.feedStatus === 'available' || value.feedStatus === 'unavailable') &&
    Array.isArray(value.articles) &&
    value.articles.every(isBrewArticle)
  );
}

/**
 * 读取公开 Brew 文章缓存。
 *
 * @returns 缓存来源列表；缓存缺失或损坏时返回 null。
 */
export async function readBrewFeedCache(): Promise<BrewSource[] | null> {
  const value = await readJsonFile(brewFeedCachePath);
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.sources)) {
    return null;
  }
  return value.sources.filter(isBrewSource);
}

/**
 * 原子写入公开 Brew 文章缓存。
 *
 * @param sources - 需要缓存的 Brew 来源卡片。
 * @returns 文件写入完成后结束的异步任务。
 */
export async function writeBrewFeedCache(
  sources: BrewSource[],
): Promise<void> {
  const cache: BrewFeedCache = {
    version: 1,
    updatedAt: new Date().toISOString(),
    sources,
  };
  await writeJsonFileAtomically(brewFeedCachePath, cache);
}

/**
 * 抓取全部友联订阅源，并在网络失败时保留已有文章缓存。
 *
 * @param friends - 当前友联配置。
 * @param cachedSources - 上一次成功抓取的来源卡片。
 * @returns 更新后的来源和各订阅源本轮抓取结果。
 */
export async function syncBrewFeeds(
  friends: FriendLink[],
  cachedSources: readonly BrewSource[] = [],
): Promise<{
  sources: BrewSource[];
  results: Array<Awaited<ReturnType<typeof fetchFriendFeedForSync>>>;
}> {
  const sources = createBrewSources(friends, cachedSources);
  const results = await Promise.all(friends.map(fetchFriendFeedForSync));
  const nextSources = sources.map((source, index) => {
    const result = results[index];
    return result?.status === 'available'
      ? applyFriendFeed(source, index, result)
      : source;
  });

  return { sources: nextSources, results };
}
