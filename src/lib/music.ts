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

export const musicPlatformLabel = (platform: MusicPlatform | string): string =>
  platform === "qq" ? "QQ 音乐" : "网易云音乐";

export const musicPlaylistUrl = (
  platform: MusicPlatform | string,
  playlistId: string,
): string =>
  platform === "qq"
    ? `https://y.qq.com/n/ryqq/playlist/${encodeURIComponent(playlistId)}`
    : `https://music.163.com/#/playlist?id=${encodeURIComponent(playlistId)}`;

export const parseMusicPlaylistReference = (
  platform: MusicPlatform | string,
  value: string,
): { platform: MusicPlatform; playlistId: string } | null => {
  const source = platform === "qq" || platform === "netease" ? platform : "netease";
  const input = value.trim();
  if (!input) return null;
  const queryMatch = input.match(/[?&](?:id|disstid)=(\d+)/i);
  const pathMatch = input.match(/(?:playlist|diss|detail)\/(\d+)/i);
  const bareMatch = input.match(/^\d+$/);
  const playlistId = queryMatch?.[1] ?? pathMatch?.[1] ?? bareMatch?.[0] ?? "";
  return playlistId ? { platform: source, playlistId } : null;
};

const asText = (value: unknown): string =>
  typeof value === "string" || typeof value === "number" ? String(value) : "";

const firstArtist = (value: unknown): string => {
  if (!Array.isArray(value)) return "";
  const artist = value[0];
  if (!artist || typeof artist !== "object") return "";
  const record = artist as Record<string, unknown>;
  return asText(record.name ?? record.title);
};

const artists = (value: unknown): string => {
  if (!Array.isArray(value)) return "";
  return value
    .flatMap((entry) => {
      if (!entry || typeof entry !== "object") return [];
      const name = asText((entry as Record<string, unknown>).name);
      return name ? [name] : [];
    })
    .join("、");
};

const musicTrackUrl = (platform: MusicPlatform, id: string): string =>
  platform === "qq"
    ? `https://y.qq.com/n/ryqq/songDetail/${encodeURIComponent(id)}`
    : `https://music.163.com/#/song?id=${encodeURIComponent(id)}`;

const normalizeTrack = (
  value: unknown,
  platform: MusicPlatform,
  playlistId: string,
  fallbackCover: string,
): MusicTrack | null => {
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
};

export const normalizeMusicPlaylist = (
  payload: unknown,
  platform: MusicPlatform,
  playlistId: string,
): MusicPlaylistResult | null => {
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
};

export const musicResultToSettings = (
  result: MusicPlaylistResult,
  previous: MusicSettings,
): MusicSettings => ({
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
});
