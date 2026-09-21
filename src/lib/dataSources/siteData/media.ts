import type {
  HomeBangumiStats,
  HomeMediaData,
  HomeNeteaseStats,
  LibraryTile,
  LocalConfig,
  MusicCatalog,
  MusicPlatform,
  MusicTrack,
} from "../../../data/types";

/**
 * 返回首页 Bangumi 媒体统计的空值。
 *
 * @returns 没有收藏条目的默认 Bangumi 统计。
 */
function emptyHomeBangumi(): HomeBangumiStats {
  return {
    total: 0,
    statusCounts: { done: 0, doing: 0, wish: 0 },
    typeCounts: {},
    tasteProfile: "ACG 深度收藏",
    items: [],
  };
}

/**
 * 返回首页网易云音乐统计的空值。
 *
 * @returns 没有音乐数据的默认统计。
 */
function emptyHomeNetease(): HomeNeteaseStats {
  return {
    followerCount: 0,
    playlistCount: 0,
    level: 0,
    moodKeywords: [],
    items: [],
  };
}

/**
 * 从资料库卡片读取 Bangumi 收藏状态。
 *
 * @param tile - Bangumi 资料库卡片。
 * @returns 卡片中可展示的收藏状态文本。
 */
function bangumiStatusFromTile(tile: LibraryTile): string {
  if (tile.collectionStatus?.trim()) return tile.collectionStatus.trim();
  const subtitleStatus = tile.subtitle.match(/[·•]\s*([^·•]+)/)?.[1]?.trim();
  return subtitleStatus || "收藏";
}

/**
 * 将 Bangumi 收藏状态映射到首页统计的三个主要状态。
 *
 * @param status - 来源返回的收藏状态文本。
 * @returns 首页统计使用的状态键；无法识别时返回 null。
 */
function bangumiStatusKey(
  status: string,
): keyof HomeBangumiStats["statusCounts"] | null {
  if (/看过|完成|done/i.test(status)) return "done";
  if (/在看|进行|doing/i.test(status)) return "doing";
  if (/想看|计划|wish/i.test(status)) return "wish";
  return null;
}

/**
 * 统计 Bangumi 条目的类别数量。
 *
 * @param items - 首页展示用的 Bangumi 条目。
 * @returns 按条目类别聚合的数量映射。
 */
function countBangumiTypes(
  items: HomeBangumiStats["items"],
): Record<string, number> {
  return items.reduce<Record<string, number>>((counts, item) => {
    counts[item.type] = (counts[item.type] ?? 0) + 1;
    return counts;
  }, {});
}

/**
 * 统计 Bangumi 条目的收藏状态数量。
 *
 * @param items - 首页展示用的 Bangumi 条目。
 * @returns 按完成、进行中和想看状态聚合的数量。
 */
function countBangumiStatuses(
  items: HomeBangumiStats["items"],
): HomeBangumiStats["statusCounts"] {
  return items.reduce<HomeBangumiStats["statusCounts"]>((counts, item) => {
    const key = bangumiStatusKey(item.status);
    if (key) counts[key] += 1;
    return counts;
  }, { done: 0, doing: 0, wish: 0 });
}

/**
 * 将资料库 Bangumi 卡片转换为首页展示条目。
 *
 * @param tiles - 当前资料库卡片。
 * @param previous - 旧首页媒体快照，用于兼容缺失字段。
 * @returns 首页使用的 Bangumi 条目列表。
 */
function mapBangumiItems(
  tiles: LibraryTile[],
  previous: HomeBangumiStats,
): HomeBangumiStats["items"] {
  const previousItems = new Map(previous.items.map((item) => [item.id, item]));
  return tiles
    .filter((tile) => tile.sourceId === "bangumi")
    .map((tile) => {
      const old = previousItems.get(tile.id);
      const status = bangumiStatusFromTile(tile);
      return {
        id: tile.id,
        title: tile.title,
        image: tile.image,
        type: tile.tag as HomeBangumiStats["items"][number]["type"],
        status,
        ...((tile.rating ?? old?.rating) === undefined
          ? {}
          : { rating: tile.rating ?? old?.rating }),
        ...((tile.url ?? old?.url)
          ? { url: tile.url ?? old?.url }
          : {}),
      };
    });
}

/**
 * 从资料库卡片派生首页 Bangumi 统计。
 *
 * @param tiles - 当前资料库卡片。
 * @param previous - 旧首页 Bangumi 统计，用于兼容旧快照。
 * @returns 最新的首页 Bangumi 统计。
 */
function bangumiHomeData(
  tiles: LibraryTile[],
  previous: HomeBangumiStats,
): HomeBangumiStats {
  const items = mapBangumiItems(tiles, previous);
  const statusCounts = countBangumiStatuses(items);
  const hasKnownStatus = items.some((item) => bangumiStatusKey(item.status));
  return {
    total: items.length,
    statusCounts: hasKnownStatus ? statusCounts : previous.statusCounts,
    typeCounts: countBangumiTypes(items),
    tasteProfile: previous.tasteProfile || "ACG 深度收藏",
    items,
  };
}

/**
 * 根据曲目标题和艺人信息推断首页情绪关键词。
 *
 * @param tracks - 需要分析的音乐曲目。
 * @returns 命中的情绪关键词列表。
 */
function moodKeywordsFromTracks(tracks: MusicTrack[]): string[] {
  const rules: Array<[string, RegExp]> = [
    ["纯音乐", /纯音乐|instrumental|piano/i],
    ["日系", /[\u3040-\u30ff]/],
    ["翻唱", /翻唱|翻自|cover/i],
    ["幻想", /幻想|世界|星|梦|story/i],
    ["治愈", /晚安|温柔|治愈|love|calm/i],
  ];
  const source = tracks
    .map((track) => `${track.title} ${track.artist} ${track.album}`)
    .join("\n");
  return rules
    .filter(([, pattern]) => pattern.test(source))
    .map(([label]) => label);
}

/**
 * 按曲目 ID 去重，保证首页不会重复展示同一首歌。
 *
 * @param tracks - 待去重的音乐曲目。
 * @returns 按首次出现顺序保留的唯一曲目。
 */
function uniqueTracks(tracks: MusicTrack[]): MusicTrack[] {
  const result = new Map<string, MusicTrack>();
  tracks.forEach((track) => {
    if (!result.has(track.id)) result.set(track.id, track);
  });
  return [...result.values()];
}

/**
 * 从旧资料库卡片创建网易云音乐的兼容回退条目。
 *
 * @param tiles - 旧版或当前资料库卡片。
 * @returns 从旧卡片提取出的首页音乐条目。
 */
function fallbackNeteaseItems(
  tiles: LibraryTile[],
): HomeNeteaseStats["items"] {
  return tiles
    .filter(
      (tile) =>
        tile.sourceId === "netease" &&
        tile.id.includes("-track-") &&
        tile.image,
    )
    .map((tile) => ({
      id: tile.id,
      title: tile.title,
      artist: tile.subtitle.split(" · ")[1] || "",
      cover: tile.image,
      ...(tile.url ? { url: tile.url } : {}),
    }));
}

/**
 * 将音乐曲目转换为首页卡片需要的精简结构。
 *
 * @param tracks - 音乐目录中的完整曲目。
 * @returns 首页卡片使用的精简曲目列表。
 */
function homeMusicItems(tracks: MusicTrack[]): HomeNeteaseStats["items"] {
  return tracks.map((track) => ({
    id: track.id,
    title: track.title,
    artist: track.artist,
    cover: track.cover,
    ...(track.url ? { url: track.url } : {}),
  }));
}

/**
 * 从音乐目录和资料库卡片派生首页网易云音乐统计。
 *
 * @param catalog - 合并后的音乐目录。
 * @param tiles - 当前资料库卡片，用于兼容旧快照。
 * @param previous - 旧首页网易云统计。
 * @returns 最新的首页网易云音乐统计。
 */
function neteaseHomeData(
  catalog: MusicCatalog,
  tiles: LibraryTile[],
  previous: HomeNeteaseStats,
): HomeNeteaseStats {
  const tracks = catalog.playlists
    .filter((playlist) => playlist.source === "netease")
    .flatMap((playlist) => playlist.tracks);
  const unique = uniqueTracks(tracks);
  const fallbackItems = fallbackNeteaseItems(tiles);
  const items = unique.length ? homeMusicItems(unique) : fallbackItems;
  const user = catalog.user;
  const moodKeywords = user?.moodKeywords?.filter(Boolean) ?? previous.moodKeywords;
  const derivedMoods = moodKeywords.length
    ? moodKeywords
    : moodKeywordsFromTracks(
        unique.length
          ? unique
          : fallbackItems.map((item) => ({
              ...item,
              album: "",
              audioUrl: "",
              url: item.url || "",
              source: "netease" as const,
              playlistId: "",
            })),
      );
  return {
    followerCount: user?.followerCount ?? previous.followerCount ?? 0,
    playlistCount:
      user?.playlistCount ||
      previous.playlistCount ||
      catalog.playlists.filter((playlist) => playlist.source === "netease").length,
    level: user?.level ?? previous.level ?? 0,
    moodKeywords: derivedMoods,
    items,
  };
}

/**
 * 根据资料库和音乐目录生成首页媒体数据。
 *
 * @param previous - 旧首页媒体快照。
 * @param tiles - 当前资料库卡片。
 * @param catalog - 当前合并后的音乐目录。
 * @returns 首页媒体卡片所需的派生数据。
 */
export function homeMediaFromData(
  previous: HomeMediaData,
  tiles: LibraryTile[],
  catalog: MusicCatalog,
): HomeMediaData {
  return {
    bangumi: bangumiHomeData(tiles, previous.bangumi ?? emptyHomeBangumi()),
    netease: neteaseHomeData(
      catalog,
      tiles,
      previous.netease ?? emptyHomeNetease(),
    ),
  };
}

/**
 * 合并某个平台的新音乐目录，并保留其他平台的目录。
 *
 * @param current - 当前已经合并的音乐目录。
 * @param source - 本次需要替换的平台。
 * @param next - 该平台本次同步得到的目录。
 * @returns 替换目标平台后的合并音乐目录。
 */
export function mergeMusicCatalog(
  current: MusicCatalog,
  source: MusicPlatform | undefined,
  next?: MusicCatalog,
): MusicCatalog {
  if (!source) return current;
  const user = source === "netease" ? next?.user ?? current.user : current.user;
  return {
    playlists: [
      ...current.playlists.filter((playlist) => playlist.source !== source),
      ...(next?.playlists ?? []),
    ],
    ...(user ? { user } : {}),
  };
}

/**
 * 根据来源开关和内容开关过滤音乐目录。
 *
 * @param catalog - 当前音乐目录。
 * @param config - 当前完整本地配置。
 * @returns 当前配置允许公开的音乐目录。
 */
export function musicCatalogForConfig(
  catalog: MusicCatalog,
  config: LocalConfig,
): MusicCatalog {
  return {
    playlists: catalog.playlists.filter((playlist) => {
      const sourceId = playlist.source === "netease" ? "netease" : "qqmusic";
      return (
        config.sources[sourceId].enabled &&
        config.sources[sourceId].content[playlist.sourceKind]
      );
    }),
    ...(catalog.user ? { user: catalog.user } : {}),
  };
}
