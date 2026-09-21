import type {
  MusicPlatform as MusicPlatformType,
  MusicSettings,
  MusicTrack,
} from "../data/types";

export type MusicPlatform = MusicPlatformType;

export interface MusicPlaylistTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  cover: string;
  audioUrl: string;
}

export interface MusicPlaylistResult {
  platform: MusicPlatform;
  playlistId: string;
  playlistTitle: string;
  track: MusicPlaylistTrack;
  tracks: MusicTrack[];
  cover: string;
  trackCount: number;
}

/**
 * 返回音乐平台的中文展示名称。
 *
 * @param platform - 音乐平台标识。
 * @returns 面向用户的音乐平台名称。
 */
export function musicPlatformLabel(platform: MusicPlatform | string): string {
  return platform === "qq" ? "QQ 音乐" : "网易云音乐";
}

/**
 * 根据平台和歌单 ID 生成歌单详情地址。
 *
 * @param platform - 音乐平台标识。
 * @param playlistId - 歌单 ID。
 * @returns 歌单详情地址。
 */
export function musicPlaylistUrl(
  platform: MusicPlatform | string,
  playlistId: string,
): string {
  return platform === "qq"
    ? `https://y.qq.com/n/ryqq/playlist/${encodeURIComponent(playlistId)}`
    : `https://music.163.com/#/playlist?id=${encodeURIComponent(playlistId)}`;
}

/**
 * 从数字 ID、查询参数或歌单路径中解析平台和歌单 ID。
 *
 * @param platform - 用户选择的音乐平台标识。
 * @param value - 数字 ID、查询参数或歌单路径。
 * @returns 规范化的平台和歌单 ID；无法解析时返回 null。
 */
export function parseMusicPlaylistReference(
  platform: MusicPlatform | string,
  value: string,
): { platform: MusicPlatform; playlistId: string } | null {
  const source = platform === "qq" || platform === "netease" ? platform : "netease";
  const input = value.trim();
  if (!input) return null;
  const queryMatch = input.match(/[?&](?:id|disstid)=(\d+)/i);
  const pathMatch = input.match(/(?:playlist|diss|detail)\/(\d+)/i);
  const bareMatch = input.match(/^\d+$/);
  const playlistId = queryMatch?.[1] ?? pathMatch?.[1] ?? bareMatch?.[0] ?? "";
  return playlistId ? { platform: source, playlistId } : null;
}

/**
 * 将音乐接口中的字符串或数字字段转换为文本。
 *
 * @param value - 待读取的未知字段。
 * @returns 字符串或数字对应的文本；其他类型返回空字符串。
 */
function asText(value: unknown): string {
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

/**
 * 读取接口艺人数组中的第一个艺人名称。
 *
 * @param value - 接口返回的艺人数组。
 * @returns 第一位艺人名称；数据无效时返回空字符串。
 */
function firstArtist(value: unknown): string {
  if (!Array.isArray(value)) return "";
  const artist = value[0];
  if (!artist || typeof artist !== "object") return "";
  const record = artist as Record<string, unknown>;
  return asText(record.name ?? record.title);
}

/**
 * 将接口艺人数组合并为页面展示文本。
 *
 * @param value - 接口返回的艺人数组。
 * @returns 以顿号连接的艺人名称。
 */
function artists(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const name = asText((entry as Record<string, unknown>).name);
      return name ? [name] : [];
    })
    .join("、");
}

/**
 * 根据平台和曲目 ID 生成曲目详情地址。
 *
 * @param platform - 音乐平台标识。
 * @param id - 曲目 ID。
 * @returns 曲目详情地址。
 */
function musicTrackUrl(platform: MusicPlatform, id: string): string {
  return platform === "qq"
    ? `https://y.qq.com/n/ryqq/songDetail/${encodeURIComponent(id)}`
    : `https://music.163.com/#/song?id=${encodeURIComponent(id)}`;
}

/**
 * 将一个平台曲目响应转换为统一的音乐曲目。
 *
 * @param value - 平台曲目原始对象。
 * @param platform - 音乐平台标识。
 * @param playlistId - 曲目所属歌单 ID。
 * @param fallbackCover - 曲目封面缺失时使用的回退封面。
 * @returns 统一音乐曲目；数据不完整时返回 null。
 */
function normalizeTrack(
  value: unknown,
  platform: MusicPlatform,
  playlistId: string,
  fallbackCover: string,
): MusicTrack | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (platform === "netease") {
    const album = record.al && typeof record.al === "object" ? record.al : {};
    const id = asText(record.id);
    const title = asText(record.name ?? record.mainTitle);
    if (!id || !title) return null;
    return {
      id,
      title,
      artist: artists(record.ar ?? record.artists) || firstArtist(record.ar),
      album: asText((album as Record<string, unknown>).name),
      cover:
        asText((album as Record<string, unknown>).picUrl) || fallbackCover,
      audioUrl: `https://music.163.com/song/media/outer/url?id=${encodeURIComponent(id)}`,
      url: musicTrackUrl(platform, id),
      source: platform,
      playlistId,
    };
  }

  const id = asText(record.songmid ?? record.songid);
  const title = asText(record.songname ?? record.songorig);
  if (!id || !title) return null;
  const albumMid = asText(record.albummid);
  return {
    id,
    title,
    artist: artists(record.singer) || firstArtist(record.singer),
    album: asText(record.albumname),
    cover: albumMid
      ? `https://y.gtimg.cn/music/photo_new/T002R300x300M000${albumMid}.jpg`
      : fallbackCover,
    audioUrl: "",
    url: musicTrackUrl(platform, id),
    source: platform,
    playlistId,
  };
}

/**
 * 解析网易云或 QQ 音乐歌单响应，并提取第一首曲目作为播放器主曲目。
 *
 * @param payload - 平台歌单接口原始响应。
 * @param platform - 音乐平台标识。
 * @param playlistId - 歌单 ID。
 * @returns 统一歌单结果；无法读取第一首有效曲目时返回 null。
 */
export function normalizeMusicPlaylist(
  payload: unknown,
  platform: MusicPlatform,
  playlistId: string,
): MusicPlaylistResult | null {
  if (!payload || typeof payload !== "object") return null;
  const root = payload as Record<string, unknown>;
  if (platform === "netease") {
    const result = root.result && typeof root.result === "object" ? root.result : root;
    const playlist =
      result && typeof result === "object" && "playlist" in result
        ? (result as Record<string, unknown>).playlist
        : result;
    if (!playlist || typeof playlist !== "object") return null;
    const record = playlist as Record<string, unknown>;
    const tracks = Array.isArray(record.tracks) ? record.tracks : [];
    const firstTrack = tracks[0];
    const firstAlbum =
      firstTrack && typeof firstTrack === "object" &&
      (firstTrack as Record<string, unknown>).al &&
      typeof (firstTrack as Record<string, unknown>).al === "object"
        ? (firstTrack as Record<string, unknown>).al
        : {};
    const cover = asText((firstAlbum as Record<string, unknown>).picUrl) ||
      asText(record.coverImgUrl);
    const normalizedTracks = tracks.flatMap((entry) => {
      const normalized = normalizeTrack(entry, platform, playlistId, cover);
      return normalized ? [normalized] : [];
    });
    const first = normalizedTracks[0];
    if (!first) return null;
    return {
      platform,
      playlistId,
      playlistTitle: asText(record.name) || "网易云歌单",
      track: {
        id: first.id,
        title: first.title,
        artist: first.artist,
        album: first.album,
        cover: first.cover,
        audioUrl: first.audioUrl,
      },
      tracks: normalizedTracks,
      cover,
      trackCount: Number(record.trackCount) || normalizedTracks.length,
    };
  }

  const collections = Array.isArray(root.cdlist) ? root.cdlist : [];
  const collection = collections[0];
  if (!collection || typeof collection !== "object") return null;
  const record = collection as Record<string, unknown>;
  const tracks = Array.isArray(record.songlist) ? record.songlist : [];
  const cover = asText(record.logo ?? record.diss_cover);
  const normalizedTracks = tracks.flatMap((entry) => {
    const normalized = normalizeTrack(entry, platform, playlistId, cover);
    return normalized ? [normalized] : [];
  });
  const first = normalizedTracks[0];
  if (!first) return null;
  return {
    platform,
    playlistId,
    playlistTitle: asText(record.dissname) || "QQ 音乐歌单",
    track: {
      id: first.id,
      title: first.title,
      artist: first.artist,
      album: first.album,
      cover: first.cover,
      audioUrl: first.audioUrl,
    },
    tracks: normalizedTracks,
    cover: first.cover || cover,
    trackCount: Number(record.songnum) || normalizedTracks.length,
  };
}

/**
 * 将读取到的歌单结果写入现有播放器配置。
 *
 * @param result - 已规范化的歌单结果。
 * @param previous - 当前播放器设置，用于保留未覆盖字段。
 * @returns 更新后的播放器设置。
 */
export function musicResultToSettings(
  result: MusicPlaylistResult,
  previous: MusicSettings,
): MusicSettings {
  return {
    ...previous,
    enabled: true,
    source: result.platform,
    playlistId: result.playlistId,
    id: result.track.id,
    title: result.track.title,
    artist: result.track.artist,
    album: result.track.album,
    cover: result.track.cover,
    audioUrl: result.track.audioUrl,
  };
}
