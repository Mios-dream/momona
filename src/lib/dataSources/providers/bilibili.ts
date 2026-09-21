import { imageOr, readJson, slug, sourceLimit, sourceValue } from "../shared";
import type { LibraryItem, LocalConfig } from "../../../data/types";
import type { ProviderSyncData } from "../types";
import { ProviderError } from "../types";

/**
 * 请求 Bilibili JSON 接口并检查平台级错误码。
 *
 * @param url - Bilibili 接口地址。
 * @returns 接口返回的指定类型数据。
 * @throws 当接口返回平台错误码时抛出 ProviderError。
 */
async function readBilibiliJson<T>(url: string): Promise<T> {
  const payload = (await readJson(url, {
    headers: { Accept: "application/json" },
  })) as T & { code?: number; message?: string };
  if (typeof payload.code === "number" && payload.code !== 0) {
    throw new ProviderError(
      payload.message || `Bilibili ${payload.code}`,
      payload.code,
    );
  }
  return payload;
}

/**
 * 清理 Bilibili 标题中的 HTML 标签。
 *
 * @param value - Bilibili 返回的未知标题值。
 * @returns 去除标签和首尾空白后的标题。
 */
function cleanBilibiliTitle(value: unknown): string {
  return typeof value === "string" ? value.replace(/<[^>]+>/g, "").trim() : "";
}

/**
 * 将 Bilibili 图片地址转换为可直接加载的 HTTPS 地址。
 *
 * @param value - Bilibili 返回的未知图片地址。
 * @returns 可直接加载的图片地址；无效输入返回空字符串。
 */
function bilibiliImageUrl(value: unknown): string {
  const image = imageOr(value);
  if (!image) return "";

  try {
    const url = new URL(image);
    if (
      url.protocol === "http:" &&
      (url.hostname === "hdslb.com" || url.hostname.endsWith(".hdslb.com"))
    ) {
      url.protocol = "https:";
    }
    return url.toString();
  } catch {
    return image;
  }
}

interface BilibiliGroupResult {
  rawData: unknown;
  libraryItems: LibraryItem[];
}

interface BilibiliRawData {
  videos?: unknown;
  favorites?: unknown;
  bangumi?: unknown;
}

/**
 * 判断未知接口数据是否为普通对象。
 *
 * @param value - 待判断的未知接口数据。
 * @returns 值是非数组对象时返回 true。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * 将投稿视频响应投影为统一资料库条目。
 *
 * @param payload - 投稿视频接口原始响应。
 * @returns 统一视频资料库条目。
 */
export function projectBilibiliVideosRaw(payload: unknown): LibraryItem[] {
  const entries = isRecord(payload)
    ? ((isRecord(payload.data) &&
        isRecord(payload.data.list) &&
        Array.isArray(payload.data.list.vlist)
        ? payload.data.list.vlist
        : []) as unknown[])
    : [];
  return entries.flatMap((entry): LibraryItem[] => {
    if (!isRecord(entry)) return [];
    const title = cleanBilibiliTitle(entry.title);
    if (!title) return [];
    return [
      {
        id: `bilibili-video-${String(entry.bvid ?? entry.aid ?? slug(title))}`,
        itemType: "video",
        title,
        subtitle: "Bilibili · 投稿视频",
        cover: bilibiliImageUrl(entry.pic),
        platform: "Bilibili",
        url: entry.bvid
          ? `https://www.bilibili.com/video/${String(entry.bvid)}`
          : undefined,
        sourceId: "bilibili",
        sourceKind: "bilibiliVideos",
        metadata: entry,
      },
    ];
  });
}

/**
 * 从收藏夹组合响应中提取收藏夹资源列表。
 *
 * @param value - 收藏夹接口组合响应。
 * @returns 收藏夹资源列表；响应结构不匹配时返回空数组。
 */
function favoriteResources(value: unknown): unknown[] {
  if (!isRecord(value) || !Array.isArray(value.resources)) return [];
  return value.resources;
}

/**
 * 将 Bilibili 收藏夹响应去重后投影为统一条目。
 *
 * @param rawData - 收藏夹及资源的组合原始响应。
 * @param limit - 需要保留的最大条目数。
 * @returns 去重后的统一视频资料库条目。
 */
export function projectBilibiliFavoritesRaw(
  rawData: unknown,
  limit: number,
): LibraryItem[] {
  const libraryItems: LibraryItem[] = [];
  const seen = new Set<string>();
  for (const resource of favoriteResources(rawData)) {
    const payload =
      isRecord(resource) && isRecord(resource.payload)
        ? resource.payload
        : resource;
    const data = isRecord(payload) && isRecord(payload.data) ? payload.data : {};
    const entries = Array.isArray(data.medias) ? data.medias : [];
    for (const entry of entries) {
      if (!isRecord(entry)) continue;
      const title = cleanBilibiliTitle(entry.title);
      if (!title) continue;
      const key = String(entry.bvid ?? entry.id ?? slug(title));
      if (seen.has(key)) continue;
      seen.add(key);
      libraryItems.push({
        id: `bilibili-favorite-${key}`,
        itemType: "video",
        title,
        subtitle: "Bilibili · 收藏夹",
        cover: bilibiliImageUrl(entry.cover ?? entry.pic),
        platform: "Bilibili",
        url: entry.bvid
          ? `https://www.bilibili.com/video/${String(entry.bvid)}`
          : undefined,
        sourceId: "bilibili",
        sourceKind: "bilibiliFavorites",
        metadata: entry,
      });
      if (libraryItems.length >= sourceLimit(limit)) return libraryItems;
    }
  }
  return libraryItems;
}

/**
 * 将 Bilibili 追番/追剧响应投影为统一条目。
 *
 * @param payload - Bilibili 追番接口原始响应。
 * @returns 统一动画资料库条目。
 */
export function projectBilibiliBangumiRaw(payload: unknown): LibraryItem[] {
  const entries =
    isRecord(payload) && isRecord(payload.data)
      ? Array.isArray(payload.data.list)
        ? payload.data.list
        : []
      : [];
  return entries.flatMap((entry): LibraryItem[] => {
    if (!isRecord(entry)) return [];
    const title = cleanBilibiliTitle(entry.title);
    if (!title) return [];
    return [
      {
        id: `bilibili-bangumi-${String(entry.season_id ?? entry.media_id ?? slug(title))}`,
        itemType: "anime",
        title,
        subtitle: "Bilibili · 追番 / 追剧",
        cover: bilibiliImageUrl(entry.cover ?? entry.square_cover),
        platform: "Bilibili",
        url:
          entry.season_id || entry.media_id
            ? `https://www.bilibili.com/bangumi/media/md${String(entry.media_id ?? entry.season_id)}`
            : undefined,
        sourceId: "bilibili",
        sourceKind: "bilibiliBangumi",
        metadata: entry,
      },
    ];
  });
}

/**
 * 按当前内容配置组合 Bilibili 的多个原始响应投影。
 *
 * @param rawData - Bilibili 各内容接口的原始响应集合。
 * @param config - Bilibili 来源配置。
 * @returns 按内容开关筛选后的统一资料库条目。
 */
export function projectBilibiliRaw(
  rawData: unknown,
  config: LocalConfig["sources"]["bilibili"],
): LibraryItem[] {
  if (!isRecord(rawData)) return [];
  const snapshot = rawData as BilibiliRawData;
  const items: LibraryItem[] = [];
  if (config.content.bilibiliVideos && snapshot.videos) {
    items.push(...projectBilibiliVideosRaw(snapshot.videos));
  }
  if (config.content.bilibiliFavorites && snapshot.favorites) {
    items.push(...projectBilibiliFavoritesRaw(snapshot.favorites, config.limit));
  }
  if (config.content.bilibiliBangumi && snapshot.bangumi) {
    items.push(...projectBilibiliBangumiRaw(snapshot.bangumi));
  }
  return items;
}

/**
 * 请求 Bilibili 投稿视频。
 *
 * @param config - Bilibili 来源配置。
 * @param base - Bilibili API 基础地址。
 * @param userId - Bilibili 用户 UID。
 * @returns 投稿视频的原始响应和统一条目。
 */
async function mapBilibiliVideos(
  config: LocalConfig["sources"]["bilibili"],
  base: string,
  userId: string,
): Promise<BilibiliGroupResult> {
  const payload = await readBilibiliJson<unknown>(
    `${base}/x/space/arc/search?mid=${encodeURIComponent(userId)}&ps=${sourceLimit(config.limit)}&pn=1`,
  );
  return { rawData: payload, libraryItems: projectBilibiliVideosRaw(payload) };
}

/**
 * 请求 Bilibili 收藏夹及其视频资源。
 *
 * @param config - Bilibili 来源配置。
 * @param base - Bilibili API 基础地址。
 * @param userId - Bilibili 用户 UID。
 * @returns 收藏夹资源的原始响应和统一条目。
 */
async function mapBilibiliFavorites(
  config: LocalConfig["sources"]["bilibili"],
  base: string,
  userId: string,
): Promise<BilibiliGroupResult> {
  const foldersPayload = await readBilibiliJson<unknown>(
    `${base}/x/v3/fav/folder/created/list-all?up_mid=${encodeURIComponent(userId)}`,
  );
  const folders =
    isRecord(foldersPayload) && isRecord(foldersPayload.data)
      ? Array.isArray(foldersPayload.data.list)
        ? foldersPayload.data.list
        : []
      : [];
  const folderResponses = await Promise.all(
    folders.flatMap((folder) => {
      if (!isRecord(folder)) return [];
      const mediaId = String(folder.id ?? "");
      return mediaId
        ? [
            readBilibiliJson<unknown>(
              `${base}/x/v3/fav/resource/list?media_id=${encodeURIComponent(mediaId)}&ps=${sourceLimit(config.limit)}&pn=1&platform=web`,
            ).then((payload) => ({ mediaId, payload })),
          ]
        : [];
    }),
  );
  const rawData = { folders: foldersPayload, resources: folderResponses };
  return {
    rawData,
    libraryItems: projectBilibiliFavoritesRaw(rawData, config.limit),
  };
}

/**
 * 请求 Bilibili 追番/追剧列表。
 *
 * @param config - Bilibili 来源配置。
 * @param base - Bilibili API 基础地址。
 * @param userId - Bilibili 用户 UID。
 * @returns 追番列表的原始响应和统一条目。
 */
async function mapBilibiliBangumi(
  config: LocalConfig["sources"]["bilibili"],
  base: string,
  userId: string,
): Promise<BilibiliGroupResult> {
  const payload = await readBilibiliJson<unknown>(
    `${base}/x/space/bangumi/follow/list?vmid=${encodeURIComponent(userId)}&type=1&ps=${sourceLimit(config.limit)}&pn=1`,
  );
  return { rawData: payload, libraryItems: projectBilibiliBangumiRaw(payload) };
}

/**
 * 按配置并行请求 Bilibili 已选内容。
 *
 * @param config - Bilibili 来源配置。
 * @returns 包含原始响应和统一资料条目的同步数据。
 */
async function mapBilibili(
  config: LocalConfig["sources"]["bilibili"],
): Promise<ProviderSyncData> {
  const userId = sourceValue(config.userId, /\/(\d+)\/?$/);
  if (!config.enabled || !userId) {
    return {
      rawData: null,
      libraryItems: [],
      repositories: [],
      message: "未配置 UID",
    };
  }
  const base = (config.endpoint.trim() || "https://api.bilibili.com").replace(
    /\/$/,
    "",
  );
  const groups: Array<{
    key: keyof BilibiliRawData;
    task: Promise<BilibiliGroupResult>;
  }> = [];
  if (config.content.bilibiliVideos) {
    groups.push({
      key: "videos",
      task: mapBilibiliVideos(config, base, userId),
    });
  }
  if (config.content.bilibiliFavorites) {
    groups.push({
      key: "favorites",
      task: mapBilibiliFavorites(config, base, userId),
    });
  }
  if (config.content.bilibiliBangumi) {
    groups.push({
      key: "bangumi",
      task: mapBilibiliBangumi(config, base, userId),
    });
  }
  const results = await Promise.all(
    groups.map(async ({ key, task }) => ({ key, result: await task })),
  );
  const rawData = Object.fromEntries(
    results.map(({ key, result }) => [key, result.rawData]),
  );
  const libraryItems = projectBilibiliRaw(rawData, config);
  return {
    rawData,
    libraryItems,
    repositories: [],
    message: `Bilibili 已同步 ${libraryItems.length} 项内容`,
  };
}

export const syncBilibili = mapBilibili;
