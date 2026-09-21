import {
  imageOr,
  readJson,
  sourceLimit,
} from "../shared";
import type {
  LibraryItem,
  LocalConfig,
  MusicCatalog,
  MusicPlaylist,
  MusicTrack,
  MusicUserStats,
  SourceContentKey,
} from "../../../data/types";
import type { ProviderSyncData } from "../types";

export type MusicSourceId = "netease" | "qqmusic";
export type MusicPlaylistKind = "liked" | "created" | "collected";

export interface MusicTrackSnapshot {
  id: string;
  title: string;
  artist: string;
  album: string;
  cover: string;
  audioUrl: string;
}

export interface MusicPlaylistSnapshot {
  id: string;
  title: string;
  cover: string;
  trackCount: number;
  ownerId: string;
  kind: MusicPlaylistKind;
  tracks: MusicTrackSnapshot[];
}

export interface MusicSourceRawData {
  source: MusicSourceId;
  userId: string;
  user?: MusicUserStats;
  playlists: MusicPlaylistSnapshot[];
}

/**
 * 判断未知音乐接口值是否为普通对象。
 *
 * @param value - 待判断的未知接口值。
 * @returns 值是非数组对象时返回 true。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * 将音乐接口中的字符串或数字字段转成去空格文本。
 *
 * @param value - 待读取的未知字段。
 * @returns 去除首尾空白的字段文本。
 */
function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

/**
 * 将接口中的数字字段转换为非负整数。
 *
 * @param value - 待转换的未知数字字段。
 * @returns 非负整数；无法解析时返回 0。
 */
function number(value: unknown): number {
  const result = Number(value);
  return Number.isFinite(result) ? Math.max(0, Math.round(result)) : 0;
}

/**
 * 将音乐封面地址转换为 HTTPS 地址。
 *
 * @param value - 音乐接口返回的未知图片地址。
 * @returns 可用于页面展示的 HTTPS 图片地址。
 */
function secureImage(value: unknown): string {
  const image = imageOr(value);
  return image.replace(/^http:\/\//i, "https://");
}

/**
 * 从用户 ID、个人页链接或带 uid/id 的链接中提取数字账号。
 *
 * @param value - 用户填写的数字 ID 或个人页地址。
 * @returns 提取出的数字用户 ID；无法提取时返回空字符串。
 */
export function musicUserId(value: string): string {
  const input = value.trim();
  if (!input) return "";
  if (/^\d+$/.test(input)) return input;
  const query = input.match(/[?&#](?:uid|uin|hostuin|id)=(\d+)/i);
  if (query?.[1]) return query[1];
  const path = input.match(/\/(?:user|home|profile|u)\/(\d+)/i);
  if (path?.[1]) return path[1];
  return input.match(/\d{4,}/)?.[0] ?? "";
}

/**
 * 返回音乐来源的展示名称。
 *
 * @param sourceId - 音乐来源标识。
 * @returns 面向用户的音乐平台名称。
 */
function musicLabel(sourceId: MusicSourceId): string {
  return sourceId === "netease" ? "网易云音乐" : "QQ 音乐";
}

/**
 * 返回歌单类别的展示名称。
 *
 * @param kind - 歌单类别标识。
 * @returns 面向用户的歌单类别名称。
 */
function kindLabel(kind: MusicPlaylistKind): string {
  return kind === "liked"
    ? "喜欢的音乐"
    : kind === "created"
      ? "创建的歌单"
      : "收藏的歌单";
}

/**
 * 将平台和歌单类别组合为统一来源内容键。
 *
 * @param sourceId - 音乐来源标识。
 * @param kind - 歌单类别标识。
 * @returns 配置中使用的来源内容键。
 */
function sourceKind(
  sourceId: MusicSourceId,
  kind: MusicPlaylistKind,
): SourceContentKey {
  return `${sourceId}${kind[0].toUpperCase()}${kind.slice(1)}` as SourceContentKey;
}

/**
 * 生成音乐平台歌单详情链接。
 *
 * @param sourceId - 音乐来源标识。
 * @param id - 歌单 ID。
 * @returns 歌单详情地址。
 */
function playlistUrl(sourceId: MusicSourceId, id: string): string {
  return sourceId === "netease"
    ? `https://music.163.com/#/playlist?id=${encodeURIComponent(id)}`
    : `https://y.qq.com/n/ryqq/playlist/${encodeURIComponent(id)}`;
}

/**
 * 生成音乐平台曲目详情链接。
 *
 * @param sourceId - 音乐来源标识。
 * @param id - 曲目 ID。
 * @returns 曲目详情地址。
 */
function trackUrl(sourceId: MusicSourceId, id: string): string {
  return sourceId === "netease"
    ? `https://music.163.com/#/song?id=${encodeURIComponent(id)}`
    : `https://y.qq.com/n/ryqq/songDetail/${encodeURIComponent(id)}`;
}

/**
 * 根据来源配置计算每个歌单最多读取的曲目数。
 *
 * @param config - 音乐来源配置。
 * @returns 单个歌单最多读取的曲目数。
 */
function trackLimitFor(config: LocalConfig["sources"][MusicSourceId]): number {
  return Math.min(60, sourceLimit(config.limit));
}

/**
 * 将数组切分为指定大小的批次。
 *
 * @param items - 待切分的数组。
 * @param size - 每个批次的最大元素数量。
 * @returns 按顺序切分出的批次数组。
 */
function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

/**
 * 将网易云歌单列表响应转换为中间快照。
 *
 * @param payload - 网易云歌单列表原始响应。
 * @param userId - 当前用户 ID，用于判断创建与收藏类别。
 * @returns 网易云歌单中间快照列表。
 */
function neteasePlaylists(
  payload: unknown,
  userId: string,
): MusicPlaylistSnapshot[] {
  if (!isRecord(payload) || !Array.isArray(payload.playlist)) return [];
  return payload.playlist.flatMap((entry): MusicPlaylistSnapshot[] => {
    if (!isRecord(entry)) return [];
    const creator = isRecord(entry.creator) ? entry.creator : {};
    const id = text(entry.id);
    const title = text(entry.name);
    if (!id || !title) return [];
    const ownerId = text(entry.userId ?? creator.userId);
    const liked =
      Number(entry.specialType) === 5 ||
      /我喜欢|喜欢的音乐|liked/i.test(title);
    const kind: MusicPlaylistKind = liked
      ? "liked"
      : ownerId && ownerId === userId
        ? "created"
        : "collected";
    return [
      {
        id,
        title,
        cover: secureImage(entry.coverImgUrl ?? entry.coverImgUrlStr),
        trackCount: number(entry.trackCount),
        ownerId,
        kind,
        tracks: [],
      },
    ];
  });
}

/**
 * 从网易云用户响应中读取首页需要的统计字段。
 *
 * @param payload - 网易云用户详情原始响应。
 * @returns 首页需要的用户统计；没有有效统计时返回 undefined。
 */
function neteaseUserStats(payload: unknown): MusicUserStats | undefined {
  if (!isRecord(payload)) return undefined;
  const profile = isRecord(payload.profile) ? payload.profile : payload;
  const levelInfo = isRecord(profile.level_info) ? profile.level_info : {};
  const followerCount = number(
    profile.followeds ?? profile.followers ?? profile.followerCount,
  );
  const playlistCount = number(
    profile.playlistCount ?? profile.playlist_count,
  );
  const level = number(profile.level ?? levelInfo.current_level);
  const moodKeywords = Array.isArray(profile.moodKeywords)
    ? profile.moodKeywords.flatMap((entry) =>
        typeof entry === "string" && entry.trim() ? [entry.trim()] : [],
      )
    : Array.isArray(profile.mood_keywords)
      ? profile.mood_keywords.flatMap((entry) =>
          typeof entry === "string" && entry.trim() ? [entry.trim()] : [],
        )
      : [];
  if (followerCount === 0 && playlistCount === 0 && level === 0 && !moodKeywords.length) {
    return undefined;
  }
  return {
    followerCount,
    playlistCount,
    level,
    ...(moodKeywords.length ? { moodKeywords } : {}),
  };
}

/**
 * 从 QQ 音乐分类响应中读取歌单数组。
 *
 * @param payload - QQ 音乐分类接口原始响应。
 * @returns 响应中的歌单数组。
 */
function qqPlaylistEntries(payload: unknown): unknown[] {
  if (!isRecord(payload)) return [];
  const data = isRecord(payload.data) ? payload.data : payload;
  return Array.isArray(data.disslist) ? data.disslist : [];
}

/**
 * 合并 QQ 音乐多个分类响应并去重歌单。
 *
 * @param payloads - 各分类响应及对应分类编号。
 * @param userId - 当前用户 ID，用于判断歌单归属。
 * @returns 去重后的 QQ 音乐歌单快照。
 */
function qqPlaylists(
  payloads: Array<{ payload: unknown; category: number }>,
  userId: string,
): MusicPlaylistSnapshot[] {
  const byId = new Map<string, MusicPlaylistSnapshot>();
  const kindPriority: Record<MusicPlaylistKind, number> = {
    liked: 0,
    collected: 1,
    created: 2,
  };

  for (const { payload, category } of payloads) {
    for (const entry of qqPlaylistEntries(payload)) {
      if (!isRecord(entry)) continue;
      const id = text(entry.disstid ?? entry.tid ?? entry.dissid ?? entry.diss_id);
      const title = text(entry.diss_name ?? entry.dissname ?? entry.name);
      if (!id || id === "0" || !title) continue;
      const ownerId = text(entry.uin ?? entry.creator_uin ?? entry.hostuin);
      const liked =
        /我喜欢|喜欢的音乐|默认收藏|我最爱|liked/i.test(title) ||
        Number(entry.dirid) === 1 ||
        Number(entry.dirid) === 201;
      const categoryKind: MusicPlaylistKind | null =
        category === 2 ? "collected" : category === 1 ? "created" : null;
      const kind: MusicPlaylistKind = liked
        ? "liked"
        : categoryKind ?? (ownerId && ownerId !== userId ? "collected" : "created");
      const next: MusicPlaylistSnapshot = {
        id,
        title,
        cover: secureImage(entry.diss_cover ?? entry.logo ?? entry.cover),
        trackCount: number(entry.song_cnt ?? entry.song_count ?? entry.songnum),
        ownerId,
        kind,
        tracks: [],
      };
      const previous = byId.get(id);
      if (!previous || kindPriority[kind] < kindPriority[previous.kind]) {
        byId.set(id, next);
      }
    }
  }
  return [...byId.values()];
}

/**
 * 读取 QQ 音乐歌手列表中的第一位歌手。
 *
 * @param value - QQ 音乐返回的歌手数组。
 * @returns 以顿号连接的歌手名称。
 */
function firstArtistFromSingers(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .flatMap((entry) => {
      if (!isRecord(entry)) return [];
      const name = text(entry.name);
      return name ? [name] : [];
    })
    .join("、");
}

/**
 * 将网易云曲目响应转换为中间曲目快照。
 *
 * @param value - 网易云曲目原始对象。
 * @returns 曲目中间快照；数据不完整时返回 null。
 */
function neteaseTrack(
  value: unknown,
): MusicTrackSnapshot | null {
  if (!isRecord(value)) return null;
  const id = text(value.id);
  const title = text(value.name ?? value.mainTitle);
  if (!id || !title) return null;
  const album = isRecord(value.al ?? value.album)
    ? ((value.al ?? value.album) as Record<string, unknown>)
    : {};
  return {
    id,
    title,
    artist: firstArtistFromSingers(value.ar ?? value.artists),
    album: text(album.name),
    cover: secureImage(album.picUrl ?? album.pic),
    audioUrl: `https://music.163.com/song/media/outer/url?id=${encodeURIComponent(id)}`,
  };
}

/**
 * 分批请求网易云歌单曲目详情。
 *
 * @param base - 网易云 API 基础地址。
 * @param playlistId - 歌单 ID。
 * @param limit - 最多读取的曲目数量。
 * @returns 网易云曲目快照列表。
 */
async function readNeteasePlaylistTracks(
  base: string,
  playlistId: string,
  limit: number,
): Promise<MusicTrackSnapshot[]> {
  const detail = await readJson(
    `${base}/v6/playlist/detail?id=${encodeURIComponent(playlistId)}`,
    {
      headers: {
        Accept: "application/json, text/plain, */*",
        Referer: "https://music.163.com/",
        Origin: "https://music.163.com",
        "User-Agent": "Momona Music/1.0",
      },
    },
  );
  if (!isRecord(detail) || !isRecord(detail.playlist)) return [];
  const playlist = detail.playlist;
  const embedded = Array.isArray(playlist.tracks) ? playlist.tracks : [];
  const idList = Array.isArray(playlist.trackIds)
    ? playlist.trackIds.flatMap((entry) => {
        if (isRecord(entry)) {
          const id = text(entry.id);
          return id ? [id] : [];
        }
        const id = text(entry);
        return id ? [id] : [];
      })
    : [];
  const ids = [...new Set(
    (idList.length ? idList : embedded.flatMap((entry) => {
      const id = isRecord(entry) ? text(entry.id) : "";
      return id ? [id] : [];
    })).slice(0, limit),
  )];
  if (!ids.length) return [];

  const songs = new Map<string, unknown>();
  embedded.forEach((entry) => {
    const id = isRecord(entry) ? text(entry.id) : "";
    if (id) songs.set(id, entry);
  });
  for (const batch of chunks(ids, 50)) {
    try {
      const payload = await readJson(
        `${base}/song/detail?ids=[${batch.join(",")}]`,
        {
          headers: {
            Accept: "application/json, text/plain, */*",
            Referer: "https://music.163.com/",
            Origin: "https://music.163.com",
            "User-Agent": "Momona Music/1.0",
          },
        },
      );
      if (isRecord(payload) && Array.isArray(payload.songs)) {
        payload.songs.forEach((entry) => {
          const id = isRecord(entry) ? text(entry.id) : "";
          if (id) songs.set(id, entry);
        });
      }
    } catch {
      // 曲目详情批次失败时，歌单摘要仍然可以作为可展示的回退数据。
    }
  }
  return ids.flatMap((id) => {
    const song = neteaseTrack(songs.get(id));
    return song ? [song] : [];
  });
}

/**
 * 将 QQ 音乐曲目对象转换为中间曲目快照。
 *
 * @param value - QQ 音乐曲目原始对象。
 * @param fallbackCover - 曲目没有专辑封面时使用的歌单封面。
 * @returns 曲目中间快照；数据不完整时返回 null。
 */
function qqTrack(
  value: unknown,
  fallbackCover: string,
): MusicTrackSnapshot | null {
  if (!isRecord(value)) return null;
  const id = text(value.songmid ?? value.songid);
  const title = text(value.songname ?? value.songorig);
  if (!id || !title) return null;
  const albumMid = text(value.albummid);
  return {
    id,
    title,
    artist: firstArtistFromSingers(value.singer),
    album: text(value.albumname),
    cover: albumMid
      ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albumMid}.jpg`
      : fallbackCover,
    audioUrl: "",
  };
}

/**
 * 尝试批量解析 QQ 音乐曲目的可播放地址。
 *
 * @param tracks - 待解析音频地址的曲目列表。
 * @returns 补齐可播放地址后的曲目列表；解析失败时返回原列表。
 */
async function resolveQqAudioUrls(
  tracks: MusicTrackSnapshot[],
): Promise<MusicTrackSnapshot[]> {
  if (!tracks.length) return tracks;
  try {
    const response = await fetch("https://u.y.qq.com/cgi-bin/musicu.fcg", {
      method: "POST",
      headers: {
        Accept: "application/json, text/plain, */*",
        "Content-Type": "application/json",
        Referer: "https://y.qq.com/",
        Origin: "https://y.qq.com",
        "User-Agent": "Momona Music/1.0",
      },
      body: JSON.stringify({
        req_1: {
          module: "vkey.GetVkeyServer",
          method: "CgiGetVkey",
          param: {
            guid: "10000",
            songmid: tracks.map((track) => track.id),
            songtype: tracks.map(() => 0),
            uin: "0",
            loginflag: 1,
            platform: "20",
          },
        },
        loginUin: "0",
        format: "json",
        comm: { ct: 24, cv: 0 },
      }),
    });
    if (!response.ok) return tracks;
    const payload = (await response.json()) as unknown;
    const data =
      isRecord(payload) && isRecord(payload.req_1) && isRecord(payload.req_1.data)
        ? payload.req_1.data
        : {};
    const sip = Array.isArray(data.sip) ? text(data.sip[0]) : "";
    const base = (sip || "https://isure.stream.qqmusic.qq.com/").replace(
      /^http:\/\//i,
      "https://",
    );
    const urls = new Map<string, string>();
    if (Array.isArray(data.midurlinfo)) {
      data.midurlinfo.forEach((entry) => {
        if (!isRecord(entry)) return;
        const mid = text(entry.songmid);
        const purl = text(entry.purl);
        if (mid && purl) {
          try {
            urls.set(mid, new URL(purl, base).toString());
          } catch {
            // 无法拼出音频地址时仍保留平台详情页，用户可以从页面打开曲目。
          }
        }
      });
    }
    return tracks.map((track) => ({ ...track, audioUrl: urls.get(track.id) ?? "" }));
  } catch {
    return tracks;
  }
}

/**
 * 请求 QQ 音乐歌单曲目并补齐音频地址。
 *
 * @param playlistId - QQ 音乐歌单 ID。
 * @param limit - 最多读取的曲目数量。
 * @returns QQ 音乐曲目快照列表。
 */
async function readQqPlaylistTracks(
  playlistId: string,
  limit: number,
): Promise<MusicTrackSnapshot[]> {
  const upstreamUrl =
    `https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?` +
    `type=1&json=1&utf8=1&onlysong=0&disstid=${encodeURIComponent(playlistId)}` +
    "&g_tk=5381&loginUin=0&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8" +
    "&notice=0&platform=yqq.json&needNewCode=0";
  const payload = await readJson(upstreamUrl, {
    headers: {
      Accept: "application/json, text/plain, */*",
      Referer: "https://y.qq.com/",
      Origin: "https://y.qq.com",
      "User-Agent": "Momona Music/1.0",
    },
  });
  if (!isRecord(payload) || !Array.isArray(payload.cdlist)) return [];
  const collection = payload.cdlist.find(isRecord);
  if (!collection || !Array.isArray(collection.songlist)) return [];
  const fallbackCover = secureImage(collection.logo ?? collection.diss_cover);
  const tracks = collection.songlist
    .slice(0, limit)
    .flatMap((entry) => {
      const track = qqTrack(entry, fallbackCover);
      return track ? [track] : [];
    });
  return resolveQqAudioUrls(tracks);
}

/**
 * 判断音乐来源的某类歌单是否被配置允许。
 *
 * @param config - 音乐来源配置。
 * @param sourceId - 音乐来源标识。
 * @param kind - 歌单类别。
 * @returns 对应内容开关开启时返回 true。
 */
function contentEnabled(
  config: LocalConfig["sources"][MusicSourceId],
  sourceId: MusicSourceId,
  kind: MusicPlaylistKind,
): boolean {
  return config.content[sourceKind(sourceId, kind) as keyof typeof config.content] === true;
}

/**
 * 将来源 ID 转换为播放器使用的平台 ID。
 *
 * @param sourceId - 音乐来源标识。
 * @returns 播放器使用的音乐平台标识。
 */
function musicPlatform(sourceId: MusicSourceId): MusicTrack["source"] {
  return sourceId === "netease" ? "netease" : "qq";
}

/**
 * 从音乐原始快照构建当前配置对应的目录。
 *
 * @param rawData - 音乐来源私有原始快照。
 * @param sourceId - 音乐来源标识。
 * @param config - 音乐来源配置。
 * @returns 当前配置允许公开的音乐目录。
 */
function buildMusicCatalog(
  rawData: unknown,
  sourceId: MusicSourceId,
  config: LocalConfig["sources"][MusicSourceId],
): MusicCatalog {
  if (!isRecord(rawData) || !Array.isArray(rawData.playlists)) {
    return { playlists: [] };
  }
  const limit = sourceLimit(config.limit);
  const playlists = (rawData.playlists as unknown[]).flatMap((entry): MusicPlaylist[] => {
    if (!isRecord(entry)) return [];
    const kind = entry.kind as MusicPlaylistKind;
    if (!["liked", "created", "collected"].includes(kind)) return [];
    if (!contentEnabled(config, sourceId, kind)) return [];
    const id = text(entry.id);
    const title = text(entry.title);
    if (!id || !title) return [];
    const trackCount = number(entry.trackCount);
    const platform = musicPlatform(sourceId);
    const sourceKey = sourceKind(sourceId, kind);
    const tracks = (Array.isArray(entry.tracks) ? entry.tracks : []).flatMap(
      (track): MusicTrack[] => {
        if (!isRecord(track)) return [];
        const trackId = text(track.id);
        const trackTitle = text(track.title);
        if (!trackId || !trackTitle) return [];
        return [
          {
            id: trackId,
            title: trackTitle,
            artist: text(track.artist),
            album: text(track.album),
            cover: secureImage(track.cover) || secureImage(entry.cover),
            audioUrl: text(track.audioUrl),
            url: trackUrl(sourceId, trackId),
            source: platform,
            playlistId: id,
          },
        ];
      },
    );
    return [
      {
        id,
        title,
        cover: secureImage(entry.cover),
        trackCount,
        ownerId: text(entry.ownerId),
        kind,
        source: platform,
        sourceKind: sourceKey,
        url: playlistUrl(sourceId, id),
        tracks,
      },
    ];
  });
  const user = isRecord(rawData.user)
    ? neteaseUserStats(rawData.user)
    : undefined;
  return {
    playlists: playlists.slice(0, limit * 3),
    ...(user ? { user } : {}),
  };
}

/**
 * 将音乐原始快照投影为全局播放器目录。
 *
 * @param rawData - 音乐来源私有原始快照。
 * @param sourceId - 音乐来源标识。
 * @param config - 音乐来源配置。
 * @returns 全局播放器使用的音乐目录。
 */
export function projectMusicCatalog(
  rawData: unknown,
  sourceId: MusicSourceId,
  config: LocalConfig["sources"][MusicSourceId],
): MusicCatalog {
  return buildMusicCatalog(rawData, sourceId, config);
}

/**
 * 将音乐目录投影为资料库歌单和曲目条目。
 *
 * @param rawData - 音乐来源私有原始快照。
 * @param sourceId - 音乐来源标识。
 * @param config - 音乐来源配置。
 * @returns 统一资料库中的歌单和曲目条目。
 */
export function projectMusicRaw(
  rawData: unknown,
  sourceId: MusicSourceId,
  config: LocalConfig["sources"][MusicSourceId],
): LibraryItem[] {
  const catalog = buildMusicCatalog(rawData, sourceId, config);
  return catalog.playlists.flatMap((playlist) => [
    {
      id: `${sourceId}-playlist-${playlist.id}`,
      itemType: "music" as const,
      title: playlist.title,
      subtitle: `${musicLabel(sourceId)} · ${kindLabel(playlist.kind)}${playlist.trackCount ? ` · ${playlist.trackCount} 首` : ""}`,
      cover: playlist.cover,
      platform: musicLabel(sourceId),
      url: playlist.url,
      sourceId,
      sourceKind: playlist.sourceKind,
    },
    ...playlist.tracks.map((track) => ({
      id: `${sourceId}-track-${playlist.id}-${track.id}`,
      itemType: "music" as const,
      title: track.title,
      subtitle: [musicLabel(sourceId), track.artist, playlist.title]
        .filter(Boolean)
        .join(" · "),
      cover: track.cover || playlist.cover,
      platform: musicLabel(sourceId),
      url: track.url,
      sourceId,
      sourceKind: playlist.sourceKind,
    })),
  ]);
}

/**
 * 请求网易云用户公开歌单并按需读取曲目详情。
 *
 * @param config - 网易云来源配置。
 * @param userId - 网易云用户 ID。
 * @returns 网易云音乐原始快照。
 */
async function fetchNetease(
  config: LocalConfig["sources"]["netease"],
  userId: string,
): Promise<MusicSourceRawData> {
  const base = (config.endpoint.trim() || "https://music.163.com/api").replace(
    /\/$/,
    "",
  );
  const listLimit = Math.min(1000, Math.max(100, sourceLimit(config.limit) * 3));
  const payload = await readJson(
    `${base}/user/playlist?uid=${encodeURIComponent(userId)}&limit=${listLimit}&offset=0`,
    {
      headers: {
        Accept: "application/json, text/plain, */*",
        Referer: "https://music.163.com/",
        Origin: "https://music.163.com",
        "User-Agent": "Momona Music/1.0",
      },
    },
  );
  let user: MusicUserStats | undefined;
  try {
    const userPayload = await readJson(
      `${base}/v1/user/detail/${encodeURIComponent(userId)}`,
      {
        headers: {
          Accept: "application/json, text/plain, */*",
          Referer: "https://music.163.com/",
          Origin: "https://music.163.com",
          "User-Agent": "Momona Music/1.0",
        },
      },
    );
    user = neteaseUserStats(userPayload);
  } catch {
    // 用户资料接口不可用时，歌单数据仍然可以用于生成公开内容。
  }
  const playlists = neteasePlaylists(payload, userId).slice(
    0,
    sourceLimit(config.limit) * 3,
  );
  if (!playlists.length) throw new Error("网易云音乐没有可读取的公开歌单");
  const trackLimit = trackLimitFor(config);
  const hydrated = await Promise.all(
    playlists.map(async (playlist) => {
      try {
        return {
          ...playlist,
          tracks: await readNeteasePlaylistTracks(base, playlist.id, trackLimit),
        };
      } catch {
        return playlist;
      }
    }),
  );
  return {
    source: "netease",
    userId,
    ...(user ? { user } : {}),
    playlists: hydrated,
  };
}

/**
 * 请求 QQ 音乐用户各分类公开歌单并读取曲目。
 *
 * @param config - QQ 音乐来源配置。
 * @param userId - QQ 音乐用户 ID。
 * @returns QQ 音乐原始快照。
 */
async function fetchQq(
  config: LocalConfig["sources"]["qqmusic"],
  userId: string,
): Promise<MusicSourceRawData> {
  const base = (config.endpoint.trim() || "https://c.y.qq.com").replace(
    /\/$/,
    "",
  );
  const size = Math.min(100, Math.max(20, sourceLimit(config.limit) * 2));
  const categories = [0, 1, 2];
  const payloads = await Promise.all(
    categories.map(async (category) => {
      const query = new URLSearchParams({
        hostuin: userId,
        size: String(size),
        sin: "0",
        category: String(category),
        rnd: String(Date.now() + category),
        format: "json",
      });
      try {
        return {
          category,
          payload: await readJson(
            `${base}/rsc/fcgi-bin/fcg_user_created_diss?${query.toString()}`,
            {
              headers: {
                Accept: "application/json, text/plain, */*",
                Referer: "https://y.qq.com/",
                Origin: "https://y.qq.com",
                "User-Agent": "Momona Music/1.0",
              },
            },
          ),
        };
      } catch {
        return null;
      }
    }),
  );
  const valid = payloads.filter(
    (entry): entry is { category: number; payload: unknown } => entry !== null,
  );
  const playlists = qqPlaylists(valid, userId).slice(
    0,
    sourceLimit(config.limit) * 3,
  );
  if (!playlists.length) throw new Error("QQ 音乐没有可读取的公开歌单");
  const trackLimit = trackLimitFor(config);
  const hydrated = await Promise.all(
    playlists.map(async (playlist) => {
      try {
        return {
          ...playlist,
          tracks: await readQqPlaylistTracks(playlist.id, trackLimit),
        };
      } catch {
        return playlist;
      }
    }),
  );
  return { source: "qqmusic", userId, playlists: hydrated };
}

/**
 * 按平台抓取音乐原始快照并生成统一投影。
 *
 * @param sourceId - 需要同步的音乐来源标识。
 * @param config - 对应音乐来源配置。
 * @returns 包含原始快照、资料库条目和播放器目录的同步数据。
 */
export async function syncMusic(
  sourceId: MusicSourceId,
  config: LocalConfig["sources"][MusicSourceId],
): Promise<ProviderSyncData> {
  const userId = musicUserId(config.username || config.userId);
  if (!userId) {
    return {
      rawData: null,
      libraryItems: [],
      repositories: [],
      message: "未配置用户 ID",
    };
  }
  const rawData =
    sourceId === "netease"
      ? await fetchNetease(config, userId)
      : await fetchQq(config, userId);
  return {
    rawData,
    libraryItems: projectMusicRaw(rawData, sourceId, config),
    musicCatalog: buildMusicCatalog(rawData, sourceId, config),
    repositories: [],
    message: `${musicLabel(sourceId)}已同步公开歌单`,
  };
}
