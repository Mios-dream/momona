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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const text = (value: unknown): string =>
  typeof value === "string" || typeof value === "number" ? String(value).trim() : "";

const number = (value: unknown): number => {
  const result = Number(value);
  return Number.isFinite(result) ? Math.max(0, Math.round(result)) : 0;
};

const secureImage = (value: unknown): string => {
  const image = imageOr(value);
  return image.replace(/^http:\/\//i, "https://");
};

/** 从用户 ID、个人页链接或带 uid/id 的链接中提取数字账号。 */
export const musicUserId = (value: string): string => {
  const input = value.trim();
  if (!input) return "";
  if (/^\d+$/.test(input)) return input;
  const query = input.match(/[?&#](?:uid|uin|hostuin|id)=(\d+)/i);
  if (query?.[1]) return query[1];
  const path = input.match(/\/(?:user|home|profile|u)\/(\d+)/i);
  if (path?.[1]) return path[1];
  return input.match(/\d{4,}/)?.[0] ?? "";
};

const musicLabel = (sourceId: MusicSourceId): string =>
  sourceId === "netease" ? "网易云音乐" : "QQ 音乐";

const kindLabel = (kind: MusicPlaylistKind): string =>
  kind === "liked"
    ? "喜欢的音乐"
    : kind === "created"
      ? "创建的歌单"
      : "收藏的歌单";

const sourceKind = (
  sourceId: MusicSourceId,
  kind: MusicPlaylistKind,
): SourceContentKey =>
  `${sourceId}${kind[0].toUpperCase()}${kind.slice(1)}` as SourceContentKey;

const playlistUrl = (sourceId: MusicSourceId, id: string): string =>
  sourceId === "netease"
    ? `https://music.163.com/#/playlist?id=${encodeURIComponent(id)}`
    : `https://y.qq.com/n/ryqq/playlist/${encodeURIComponent(id)}`;

const trackUrl = (sourceId: MusicSourceId, id: string): string =>
  sourceId === "netease"
    ? `https://music.163.com/#/song?id=${encodeURIComponent(id)}`
    : `https://y.qq.com/n/ryqq/songDetail/${encodeURIComponent(id)}`;

const trackLimitFor = (config: LocalConfig["sources"][MusicSourceId]): number =>
  Math.min(60, sourceLimit(config.limit));

const chunks = <T>(items: T[], size: number): T[][] => {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
};

const neteasePlaylists = (
  payload: unknown,
  userId: string,
): MusicPlaylistSnapshot[] => {
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
};

const neteaseUserStats = (payload: unknown): MusicUserStats | undefined => {
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
};

const qqPlaylistEntries = (payload: unknown): unknown[] => {
  if (!isRecord(payload)) return [];
  const data = isRecord(payload.data) ? payload.data : payload;
  return Array.isArray(data.disslist) ? data.disslist : [];
};

const qqPlaylists = (
  payloads: Array<{ payload: unknown; category: number }>,
  userId: string,
): MusicPlaylistSnapshot[] => {
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
};

const firstArtistFromSingers = (value: unknown): string => {
  if (!Array.isArray(value)) return "";
  return value
    .flatMap((entry) => {
      if (!isRecord(entry)) return [];
      const name = text(entry.name);
      return name ? [name] : [];
    })
    .join("、");
};

const neteaseTrack = (
  value: unknown,
): MusicTrackSnapshot | null => {
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
};

const readNeteasePlaylistTracks = async (
  base: string,
  playlistId: string,
  limit: number,
): Promise<MusicTrackSnapshot[]> => {
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
      // The playlist summary is still useful when a song detail batch is unavailable.
    }
  }
  return ids.flatMap((id) => {
    const song = neteaseTrack(songs.get(id));
    return song ? [song] : [];
  });
};

const qqTrack = (
  value: unknown,
  fallbackCover: string,
): MusicTrackSnapshot | null => {
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
};

const resolveQqAudioUrls = async (
  tracks: MusicTrackSnapshot[],
): Promise<MusicTrackSnapshot[]> => {
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
            // Keep the track playable through its platform page when URL construction fails.
          }
        }
      });
    }
    return tracks.map((track) => ({ ...track, audioUrl: urls.get(track.id) ?? "" }));
  } catch {
    return tracks;
  }
};

const readQqPlaylistTracks = async (
  playlistId: string,
  limit: number,
): Promise<MusicTrackSnapshot[]> => {
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
};

const contentEnabled = (
  config: LocalConfig["sources"][MusicSourceId],
  sourceId: MusicSourceId,
  kind: MusicPlaylistKind,
): boolean =>
  config.content[sourceKind(sourceId, kind) as keyof typeof config.content] === true;

const musicPlatform = (sourceId: MusicSourceId): MusicTrack["source"] =>
  sourceId === "netease" ? "netease" : "qq";

const buildMusicCatalog = (
  rawData: unknown,
  sourceId: MusicSourceId,
  config: LocalConfig["sources"][MusicSourceId],
): MusicCatalog => {
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
};

export const projectMusicCatalog = (
  rawData: unknown,
  sourceId: MusicSourceId,
  config: LocalConfig["sources"][MusicSourceId],
): MusicCatalog => buildMusicCatalog(rawData, sourceId, config);

export const projectMusicRaw = (
  rawData: unknown,
  sourceId: MusicSourceId,
  config: LocalConfig["sources"][MusicSourceId],
): LibraryItem[] => {
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
};

const fetchNetease = async (
  config: LocalConfig["sources"]["netease"],
  userId: string,
): Promise<MusicSourceRawData> => {
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
    // Playlist data remains useful when the profile endpoint is unavailable.
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
};

const fetchQq = async (
  config: LocalConfig["sources"]["qqmusic"],
  userId: string,
): Promise<MusicSourceRawData> => {
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
};

export const syncMusic = async (
  sourceId: MusicSourceId,
  config: LocalConfig["sources"][MusicSourceId],
): Promise<ProviderSyncData> => {
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
};
