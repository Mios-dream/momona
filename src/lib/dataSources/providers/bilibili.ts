import { imageOr, readJson, slug, sourceLimit, sourceValue } from "../shared";
import type { LibraryItem, LocalConfig } from "../../../data/types";
import type { ProviderSyncData } from "../types";
import { ProviderError } from "../types";

const readBilibiliJson = async <T>(url: string): Promise<T> => {
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
};

const cleanBilibiliTitle = (value: unknown): string =>
  typeof value === "string" ? value.replace(/<[^>]+>/g, "").trim() : "";

const bilibiliImageUrl = (value: unknown): string => {
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
};

interface BilibiliGroupResult {
  rawData: unknown;
  libraryItems: LibraryItem[];
}

interface BilibiliRawData {
  videos?: unknown;
  favorites?: unknown;
  bangumi?: unknown;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const projectBilibiliVideosRaw = (payload: unknown): LibraryItem[] => {
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
};

const favoriteResources = (value: unknown): unknown[] => {
  if (!isRecord(value) || !Array.isArray(value.resources)) return [];
  return value.resources;
};

export const projectBilibiliFavoritesRaw = (
  rawData: unknown,
  limit: number,
): LibraryItem[] => {
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
};

export const projectBilibiliBangumiRaw = (payload: unknown): LibraryItem[] => {
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
};

export const projectBilibiliRaw = (
  rawData: unknown,
  config: LocalConfig["sources"]["bilibili"],
): LibraryItem[] => {
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
};

const mapBilibiliVideos = async (
  config: LocalConfig["sources"]["bilibili"],
  base: string,
  userId: string,
): Promise<BilibiliGroupResult> => {
  const payload = await readBilibiliJson<unknown>(
    `${base}/x/space/arc/search?mid=${encodeURIComponent(userId)}&ps=${sourceLimit(config.limit)}&pn=1`,
  );
  return { rawData: payload, libraryItems: projectBilibiliVideosRaw(payload) };
};

const mapBilibiliFavorites = async (
  config: LocalConfig["sources"]["bilibili"],
  base: string,
  userId: string,
): Promise<BilibiliGroupResult> => {
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
};

const mapBilibiliBangumi = async (
  config: LocalConfig["sources"]["bilibili"],
  base: string,
  userId: string,
): Promise<BilibiliGroupResult> => {
  const payload = await readBilibiliJson<unknown>(
    `${base}/x/space/bangumi/follow/list?vmid=${encodeURIComponent(userId)}&type=1&ps=${sourceLimit(config.limit)}&pn=1`,
  );
  return { rawData: payload, libraryItems: projectBilibiliBangumiRaw(payload) };
};

const mapBilibili = async (
  config: LocalConfig["sources"]["bilibili"],
): Promise<ProviderSyncData> => {
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
};

export const syncBilibili = mapBilibili;
