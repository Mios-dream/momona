import { mergeSiteData } from "../../data/site";
import { sortGithubRepositories } from "./providers/github";
import { createBrewSources } from "../../data/brew";
import type {
  CollectionCard,
  DataSourceId,
  FeedCard,
  HomeBangumiStats,
  HomeMediaData,
  HomeNeteaseStats,
  LibraryItem,
  LibraryTile,
  LocalConfig,
  ManualLibraryItem,
  MusicCatalog,
  MusicPlatform,
  MusicSettings,
  MusicTrack,
  ProviderStatus,
  ReportActivity,
  ReportPlatformCard,
  RepositorySummary,
  SiteData,
} from "../../data/types";
import { tileFor } from "./shared";
import { dataSourceIds, type SourceSyncResult } from "./types";

export const sourceLabels: Record<DataSourceId, string> = {
  bangumi: "Bangumi",
  bilibili: "Bilibili",
  github: "GitHub",
  netease: "网易云音乐",
  qqmusic: "QQ 音乐",
  steam: "Steam",
  sfacg: "SFACG",
};

export const sourceLabel = (sourceId: DataSourceId): string =>
  sourceLabels[sourceId];

const musicForReport = (music: MusicSettings): ReportPlatformCard | null => {
  if (!music.enabled || !music.title.trim()) return null;
  const summary = [music.artist, music.album].filter(Boolean).join(" · ");
  return {
  id: "report-music",
  kind: "music",
  platformId: music.source,
  platformLabel:
    music.source === "netease"
      ? "NetEase"
      : music.source === "qq"
        ? "QQ 音乐"
        : "音乐",
    title: music.title,
    subtitle: music.artist,
    ...(music.cover ? { image: music.cover, secondaryImage: music.cover } : {}),
    ...(summary ? { summary } : {}),
  };
};

const reportPlatformsWithData = (
  existing: ReportPlatformCard[],
  repositories: RepositorySummary[],
  libraryTiles: LibraryTile[],
  config: LocalConfig,
): ReportPlatformCard[] => {
  const gameSettings = config.widgets.find((widget) => widget.type === "game")?.settings?.game;
  const gameAccount = gameSettings?.account;
  const base = existing.flatMap((card) => {
    if (card.id === "report-music") {
      const music = musicForReport(config.music);
      return music ? [music] : [];
    }
    if (card.id === "report-github") {
      if (!repositories.length) return [];
      const first = repositories[0];
      return {
        ...card,
        platformId: "github",
        platformLabel: "GitHub",
        title: first.name,
        subtitle: first.description,
        stats: [String(first.stars), String(repositories.length)],
        statLabels: ["stars", "仓库"],
        tags: [first.language || "未标注", `${first.forks} forks`],
        summary: `${first.name} 拥有 ${first.stars} stars、${first.forks} forks；当前快照包含 ${repositories.length} 个公开仓库。`,
        updatedAt: first.updatedAt,
      };
    }
    if (card.id === "report-game") {
      if (!gameAccount) return [];
      const firstShowcase = gameAccount.showcase?.[0];
      const gameName =
        gameAccount.game === "genshin"
          ? "原神"
          : gameAccount.game === "zzz"
            ? "绝区零"
            : "星穹铁道";
      return {
        ...card,
        platformId: "hoyolab",
        platformLabel: gameName,
        title: gameAccount.nickname,
        subtitle: gameAccount.signature || `${gameName}公开账号摘要`,
        ...(firstShowcase?.art || firstShowcase?.icon
          ? { image: firstShowcase.art || firstShowcase.icon }
          : {}),
        stats: [
          gameAccount.score?.value || String(gameAccount.level),
          String(gameAccount.achievements),
          String(gameAccount.characters),
        ],
        statLabels: ["等级", "成就", "角色"],
        summary: `${gameAccount.nickname} 的${gameName}公开展柜，共展示 ${gameAccount.showcase?.length ?? 0} 个角色。`,
        updatedAt: gameAccount.updatedAt,
      };
    }
    if (card.id === "report-profile") {
      if (!config.account.name.trim()) return [];
      return {
        ...card,
        platformId: "profile",
        platformLabel: "个人资料",
        title: config.account.name,
        subtitle: config.account.motto,
        ...(config.account.avatar ? { image: config.account.avatar } : {}),
        ...(config.account.motto ? { summary: config.account.motto } : {}),
      };
    }
    return card;
  });

  const sourceCards = ([
    "bangumi",
    "bilibili",
    "netease",
    "qqmusic",
    "steam",
    "sfacg",
  ] as const).flatMap((sourceId) => {
    const items = libraryTiles.filter((tile) => tile.sourceId === sourceId);
    if (!items.length) return [];
    const counts = items.reduce<Record<string, number>>((result, tile) => {
      const key = tile.tag.toLocaleLowerCase();
      result[key] = (result[key] ?? 0) + 1;
      return result;
    }, {});
    const label = sourceLabel(sourceId);
    const first = items[0];
    const recentSteamCount = items.filter(
      (item) =>
        item.sourceKind === "steamRecentGames" ||
        item.subtitle.includes("近两周"),
    ).length;
    const recentSteamHours = items.reduce((total, item) => {
      const match = item.subtitle.match(/近两周\s+([\d.]+)\s+小时/);
      return total + (match ? Number(match[1]) : 0);
    }, 0);
    const primaryCount =
      sourceId === "bangumi"
        ? counts.game ?? counts.anime ?? counts.book ?? 0
        : sourceId === "bilibili"
          ? counts.video ?? 0
          : sourceId === "steam"
            ? recentSteamCount
            : sourceId === "sfacg"
              ? counts.book ?? 0
              : counts.music ?? 0;
    const categoryCount = new Set(items.map((item) => item.sourceKind)).size;
    const secondaryCount =
      sourceId === "steam"
        ? recentSteamHours.toFixed(1)
        : sourceId === "netease" || sourceId === "qqmusic"
          ? String(categoryCount)
          : sourceId === "sfacg"
            ? String(categoryCount)
            : String(counts.music ?? counts.book ?? 0);
    const secondaryLabel =
      sourceId === "steam"
        ? "近两周小时"
        : sourceId === "sfacg" ||
            sourceId === "netease" ||
            sourceId === "qqmusic"
          ? "分类"
          : "其他";
    const primaryLabel =
      sourceId === "bangumi"
        ? "主类"
        : sourceId === "bilibili"
          ? "视频"
          : sourceId === "sfacg"
            ? "小说"
            : sourceId === "steam"
              ? "最近游玩"
              : "歌单";
    return [
      {
        id: `report-${sourceId}`,
        kind: "platform" as const,
        platformId: sourceId,
        platformLabel: label,
        title: first.title,
        subtitle: `${items.length} 项公开内容`,
        image: first.image,
        stats: [String(items.length), String(primaryCount), secondaryCount],
        statLabels: ["总数", primaryLabel, secondaryLabel],
        tags: Array.from(new Set(items.map((item) => item.tag))).slice(0, 3),
        summary:
          sourceId === "steam"
            ? `${label} 已同步 ${items.length} 个游戏，其中 ${recentSteamCount} 个最近游玩，近两周共 ${recentSteamHours.toFixed(1)} 小时。`
            : sourceId === "sfacg"
              ? `${label} 已同步 ${items.length} 部小说，最近一项是「${first.title}」。`
              : `${label} 已同步 ${items.length} 项内容，最近一项是「${first.title}」。`,
      },
    ];
  });

  return [
    ...base.filter(
      (card) =>
        ![
          "report-bangumi",
          "report-bilibili",
          "report-netease",
          "report-qqmusic",
          "report-steam",
          "report-sfacg",
        ].includes(card.id),
    ),
    ...sourceCards,
  ];
};

const feedCardsWithRepos = (
  existing: FeedCard[],
  repositories: RepositorySummary[],
): FeedCard[] => {
  const staticCards = existing.filter((card) => card.id !== "github-latest");
  if (!repositories.length) return staticCards;
  return [
    {
      id: "github-latest",
      category: "GitHub 仓库",
      title: repositories[0].name,
      summary: repositories[0].description || "最近更新的公开仓库",
      statistic: String(repositories[0].stars),
      statisticLabel: "stars",
      image: repositories[0].image ?? "",
      tone: "blue",
    },
    ...staticCards,
  ];
};

const collectionsFromTiles = (tiles: LibraryTile[]): CollectionCard[] =>
  tiles.slice(0, 2).map((tile, index) => ({
    id: `collection-${tile.id}`,
    title: tile.title,
    subtitle: index === 0 ? "最近同步" : "资料库收藏",
    image: tile.image,
    badge: String(index + 1),
  }));

const activitiesFromSources = (
  repositories: RepositorySummary[],
): ReportActivity[] => {
  const dynamic = repositories.slice(0, 3).map((repository, index) => ({
    id: `github-activity-${repository.id}`,
    category: index === 0 ? "最近更新" : "仓库收藏",
    title: repository.name,
    subtitle: `${repository.stars} stars`,
    image: repository.image || "",
    mark: index === 0 ? "✦" : "＋",
  }));
  return dynamic;
};

export const mapManualItem = (
  item: ManualLibraryItem,
  index: number,
): LibraryItem => {
  const type = item.type === "all" ? "book" : item.type;
  return {
    id: item.id || `manual-${index}`,
    itemType: type,
    title: item.title,
    subtitle: item.subtitle,
    cover: item.cover,
    platform: "手动内容",
    url: item.url || undefined,
    sourceId: "manual",
  };
};

const tilesFromItems = (items: LibraryItem[]): LibraryTile[] =>
  items.map((item, index) => tileFor(index, item));

const emptyHomeBangumi = (): HomeBangumiStats => ({
  total: 0,
  statusCounts: { done: 0, doing: 0, wish: 0 },
  typeCounts: {},
  tasteProfile: "ACG 深度收藏",
  items: [],
});

const emptyHomeNetease = (): HomeNeteaseStats => ({
  followerCount: 0,
  playlistCount: 0,
  level: 0,
  moodKeywords: [],
  items: [],
});

const bangumiStatusFromTile = (tile: LibraryTile): string => {
  if (tile.collectionStatus?.trim()) return tile.collectionStatus.trim();
  const subtitleStatus = tile.subtitle.match(/[·•]\s*([^·•]+)/)?.[1]?.trim();
  return subtitleStatus || "收藏";
};

const bangumiStatusKey = (
  status: string,
): keyof HomeBangumiStats["statusCounts"] | null => {
  if (/看过|完成|done/i.test(status)) return "done";
  if (/在看|进行|doing/i.test(status)) return "doing";
  if (/想看|计划|wish/i.test(status)) return "wish";
  return null;
};

const bangumiHomeData = (
  tiles: LibraryTile[],
  previous: HomeBangumiStats,
): HomeBangumiStats => {
  const previousItems = new Map(previous.items.map((item) => [item.id, item]));
  const items = tiles
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

  const typeCounts = items.reduce<Record<string, number>>((counts, item) => {
    counts[item.type] = (counts[item.type] ?? 0) + 1;
    return counts;
  }, {});
  const statusCounts = items.reduce<HomeBangumiStats["statusCounts"]>(
    (counts, item) => {
      const key = bangumiStatusKey(item.status);
      if (key) counts[key] += 1;
      return counts;
    },
    { done: 0, doing: 0, wish: 0 },
  );
  const hasKnownStatus = items.some((item) => bangumiStatusKey(item.status));
  const fallback = previous.statusCounts ?? emptyHomeBangumi().statusCounts;

  return {
    total: items.length,
    statusCounts: hasKnownStatus ? statusCounts : fallback,
    typeCounts,
    tasteProfile: previous.tasteProfile || "ACG 深度收藏",
    items,
  };
};

const moodKeywordsFromTracks = (tracks: MusicTrack[]): string[] => {
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
  return rules.filter(([, pattern]) => pattern.test(source)).map(([label]) => label);
};

const neteaseHomeData = (
  catalog: MusicCatalog,
  tiles: LibraryTile[],
  previous: HomeNeteaseStats,
): HomeNeteaseStats => {
  const tracks = catalog.playlists
    .filter((playlist) => playlist.source === "netease")
    .flatMap((playlist) => playlist.tracks);
  const uniqueTracks = new Map<string, MusicTrack>();
  tracks.forEach((track) => {
    if (!uniqueTracks.has(track.id)) uniqueTracks.set(track.id, track);
  });
  const fallbackItems = tiles
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
  const items = uniqueTracks.size
    ? [...uniqueTracks.values()].map((track) => ({
        id: track.id,
        title: track.title,
        artist: track.artist,
        cover: track.cover,
        ...(track.url ? { url: track.url } : {}),
      }))
    : fallbackItems;
  const user = catalog.user;
  const moodKeywords =
    user?.moodKeywords?.filter(Boolean) ??
    previous.moodKeywords.filter(Boolean);
  const derivedMoods = moodKeywords.length
    ? moodKeywords
    : moodKeywordsFromTracks(
        uniqueTracks.size
          ? [...uniqueTracks.values()]
          : fallbackItems.map((item) => ({
              id: item.id,
              title: item.title,
              artist: item.artist,
              album: "",
              cover: item.cover,
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
};

const homeMediaFromData = (
  previous: HomeMediaData,
  tiles: LibraryTile[],
  catalog: MusicCatalog,
): HomeMediaData => ({
  bangumi: bangumiHomeData(tiles, previous.bangumi ?? emptyHomeBangumi()),
  netease: neteaseHomeData(
    catalog,
    tiles,
    previous.netease ?? emptyHomeNetease(),
  ),
});

const mergeMusicCatalog = (
  current: MusicCatalog,
  source: MusicPlatform | undefined,
  next?: MusicCatalog,
): MusicCatalog => {
  if (!source) return current;
  const user = source === "netease" ? next?.user ?? current.user : current.user;
  return {
    playlists: [
      ...current.playlists.filter((playlist) => playlist.source !== source),
      ...(next?.playlists ?? []),
    ],
    ...(user ? { user } : {}),
  };
};

const musicCatalogForConfig = (
  catalog: MusicCatalog,
  config: LocalConfig,
): MusicCatalog => ({
  playlists: catalog.playlists.filter((playlist) => {
    const sourceId = playlist.source === "netease" ? "netease" : "qqmusic";
    return (
      config.sources[sourceId].enabled &&
      config.sources[sourceId].content[playlist.sourceKind]
    );
  }),
  ...(catalog.user ? { user: catalog.user } : {}),
});

const manualStatus = (config: LocalConfig): ProviderStatus => ({
  id: "manual",
  label: "手动内容",
  status: config.manualItems.length ? "success" : "skipped",
  message: config.manualItems.length ? "已加入手动条目" : "没有手动条目",
  count: config.manualItems.length,
});

export const hasSelectedContent = (
  sourceId: DataSourceId,
  config: LocalConfig,
): boolean => {
  const content = config.sources[sourceId].content;
  if (sourceId === "bangumi") {
    return (
      content.bangumiAnime ||
      content.bangumiGames ||
      content.bangumiBooks ||
      content.bangumiMusic
    );
  }
  if (sourceId === "bilibili") {
    return (
      content.bilibiliVideos ||
      content.bilibiliFavorites ||
      content.bilibiliBangumi
    );
  }
  if (sourceId === "netease") {
    return (
      content.neteaseLiked ||
      content.neteaseCreated ||
      content.neteaseCollected
    );
  }
  if (sourceId === "qqmusic") {
    return (
      content.qqmusicLiked ||
      content.qqmusicCreated ||
      content.qqmusicCollected
    );
  }
  if (sourceId === "steam") {
    return content.steamRecentGames || content.steamLibrary;
  }
  if (sourceId === "sfacg") {
    return content.sfacgBooks;
  }
  return content.githubRepositories;
};

export const selectedContentLabel = (
  sourceId: DataSourceId,
  config: LocalConfig,
): string => {
  const content = config.sources[sourceId].content;
  if (sourceId === "bangumi") {
    return [
      content.bangumiAnime ? "追番" : "",
      content.bangumiGames ? "游戏" : "",
      content.bangumiBooks ? "书籍" : "",
      content.bangumiMusic ? "音乐" : "",
    ]
      .filter(Boolean)
      .join("、");
  }
  if (sourceId === "bilibili") {
    return [
      content.bilibiliVideos ? "投稿视频" : "",
      content.bilibiliFavorites ? "收藏夹" : "",
      content.bilibiliBangumi ? "追番 / 追剧" : "",
    ]
      .filter(Boolean)
      .join("、");
  }
  if (sourceId === "netease") {
    return [
      content.neteaseLiked ? "喜欢的音乐" : "",
      content.neteaseCreated ? "创建的歌单" : "",
      content.neteaseCollected ? "收藏的歌单" : "",
    ]
      .filter(Boolean)
      .join("、");
  }
  if (sourceId === "qqmusic") {
    return [
      content.qqmusicLiked ? "喜欢的音乐" : "",
      content.qqmusicCreated ? "创建的歌单" : "",
      content.qqmusicCollected ? "收藏的歌单" : "",
    ]
      .filter(Boolean)
      .join("、");
  }
  if (sourceId === "steam") {
    return [
      content.steamRecentGames ? "最近游玩" : "",
      content.steamLibrary ? "游戏库" : "",
    ]
      .filter(Boolean)
      .join("、");
  }
  if (sourceId === "sfacg") {
    return content.sfacgBooks ? "开放书架作品" : "";
  }
  if (!content.githubRepositories) return "";
  return content.githubRepositoryScope === "pinned"
    ? "Pinned 仓库"
    : "全部公开仓库";
};

const statusList = (
  sourceStatuses: ProviderStatus[],
  config: LocalConfig,
): ProviderStatus[] => [
  ...dataSourceIds.map((sourceId) => {
    if (!config.sources[sourceId].enabled) {
      return {
        id: sourceId,
        label: sourceLabel(sourceId),
        status: "skipped" as const,
        message: "未启用",
        count: 0,
      };
    }
    if (!hasSelectedContent(sourceId, config)) {
      return {
        id: sourceId,
        label: sourceLabel(sourceId),
        status: "skipped" as const,
        message: "未选择显示内容",
        count: 0,
      };
    }
    return (
      sourceStatuses.find((status) => status.id === sourceId) ?? {
        id: sourceId,
        label: sourceLabel(sourceId),
        status: "skipped" as const,
        message: "尚未同步",
        count: 0,
      }
    );
  }),
  manualStatus(config),
];

const manualIds = (config: LocalConfig): Set<string> =>
  new Set(
    config.manualItems.map((item, index) => item.id || `manual-${index}`),
  );

/** 根据来源设置过滤统一资料库条目；过滤发生在页面卡片生成之前。 */
export const libraryItemVisibleForConfig = (
  item: LibraryItem,
  config: LocalConfig,
): boolean => {
  const sourceId = item.sourceId;
  if (!sourceId || sourceId === "manual") return true;
  const content = config.sources[sourceId].content;
  switch (item.sourceKind) {
    case "bangumiAnime":
      return config.sources.bangumi.enabled && content.bangumiAnime;
    case "bangumiGames":
      return config.sources.bangumi.enabled && content.bangumiGames;
    case "bangumiBooks":
      return config.sources.bangumi.enabled && content.bangumiBooks;
    case "bangumiMusic":
      return config.sources.bangumi.enabled && content.bangumiMusic;
    case "bilibiliVideos":
      return config.sources.bilibili.enabled && content.bilibiliVideos;
    case "bilibiliFavorites":
      return config.sources.bilibili.enabled && content.bilibiliFavorites;
    case "bilibiliBangumi":
      return config.sources.bilibili.enabled && content.bilibiliBangumi;
    case "neteaseLiked":
      return config.sources.netease.enabled && content.neteaseLiked;
    case "neteaseCreated":
      return config.sources.netease.enabled && content.neteaseCreated;
    case "neteaseCollected":
      return config.sources.netease.enabled && content.neteaseCollected;
    case "qqmusicLiked":
      return config.sources.qqmusic.enabled && content.qqmusicLiked;
    case "qqmusicCreated":
      return config.sources.qqmusic.enabled && content.qqmusicCreated;
    case "qqmusicCollected":
      return config.sources.qqmusic.enabled && content.qqmusicCollected;
    case "steamRecentGames":
      return config.sources.steam.enabled && content.steamRecentGames;
    case "steamLibrary":
      return config.sources.steam.enabled && content.steamLibrary;
    case "sfacgBooks":
      return config.sources.sfacg.enabled && content.sfacgBooks;
    default:
      return config.sources[sourceId].enabled;
  }
};

export const filterLibraryItemsForConfig = (
  items: LibraryItem[],
  config: LocalConfig,
): LibraryItem[] => items.filter((item) => libraryItemVisibleForConfig(item, config));

const tileVisibleForConfig = (
  tile: LibraryTile,
  config: LocalConfig,
): boolean => {
  const sources = config.sources;
  if (tile.sourceId === "bangumi" || tile.id.startsWith("bangumi-")) {
    if (!sources.bangumi.enabled) return false;
    if (tile.sourceKind === "bangumiAnime" || tile.tag === "anime")
      return sources.bangumi.content.bangumiAnime;
    if (tile.sourceKind === "bangumiGames" || tile.tag === "game")
      return sources.bangumi.content.bangumiGames;
    if (tile.sourceKind === "bangumiBooks" || tile.tag === "book")
      return sources.bangumi.content.bangumiBooks;
    if (tile.sourceKind === "bangumiMusic" || tile.tag === "music")
      return sources.bangumi.content.bangumiMusic;
  }
  if (
    tile.sourceId === "bilibili" &&
    (tile.sourceKind === "bilibiliFavorites" ||
      tile.id.startsWith("bilibili-favorite-"))
  )
    return sources.bilibili.enabled && sources.bilibili.content.bilibiliFavorites;
  if (
    tile.sourceId === "bilibili" &&
    (tile.sourceKind === "bilibiliBangumi" ||
      tile.id.startsWith("bilibili-bangumi-"))
  )
    return sources.bilibili.enabled && sources.bilibili.content.bilibiliBangumi;
  if (
    tile.sourceId === "bilibili" &&
    (tile.sourceKind === "bilibiliVideos" || tile.id.startsWith("bilibili-"))
  )
    return sources.bilibili.enabled && sources.bilibili.content.bilibiliVideos;
  if (tile.sourceId === "netease" || tile.sourceId === "qqmusic") {
    const sourceId = tile.sourceId;
    const key = tile.sourceKind;
    return key
      ? sources[sourceId].enabled && sources[sourceId].content[key]
      : sources[sourceId].enabled;
  }
  if (tile.sourceId === "steam") {
    if (tile.sourceKind === "steamRecentGames") {
      return sources.steam.enabled && sources.steam.content.steamRecentGames;
    }
    if (tile.sourceKind === "steamLibrary") {
      return sources.steam.enabled && sources.steam.content.steamLibrary;
    }
    return sources.steam.enabled;
  }
  if (tile.sourceId === "sfacg") {
    return sources.sfacg.enabled && sources.sfacg.content.sfacgBooks;
  }
  return true;
};

const removeManualAndHiddenTiles = (
  tiles: LibraryTile[],
  config: LocalConfig,
): LibraryTile[] => {
  const ids = manualIds(config);
  return tiles.filter(
    (tile) =>
      !ids.has(tile.id) &&
      !tile.id.startsWith("manual-") &&
      tileVisibleForConfig(tile, config),
  );
};

const deriveSiteData = (
  base: SiteData,
  config: LocalConfig,
  libraryTiles: LibraryTile[],
  repositories: RepositorySummary[],
  statuses: ProviderStatus[],
  musicCatalog = base.musicCatalog,
): SiteData => {
  const orderedRepositories = sortGithubRepositories(
    repositories,
    config.sources.github.content.githubRepositorySort,
  );
  const collections = libraryTiles.length
    ? libraryTiles.some((tile) => tile.sourceId || tile.id.startsWith("manual-"))
      ? collectionsFromTiles(libraryTiles)
      : base.collections
    : [];
  const activities = orderedRepositories.length
    ? activitiesFromSources(orderedRepositories)
    : base.activities.filter(
        (activity) =>
          !activity.id.startsWith("status-") &&
        !activity.id.startsWith("github-activity-"),
      );
  const nextMusicCatalog = musicCatalogForConfig(musicCatalog, config);
  return mergeSiteData({
    ...base,
    profile: { ...base.profile, ...config.account },
    socialLinks: config.socialLinks,
    friends: config.friends,
    libraryTiles: libraryTiles,
    brewSources: createBrewSources(config.friends),
    collections,
    feedCards: feedCardsWithRepos(base.feedCards, orderedRepositories),
    activities,
    reportPlatforms: reportPlatformsWithData(
      base.reportPlatforms,
      orderedRepositories,
      libraryTiles,
      config,
    ),
    music: { ...base.music, ...config.music },
    musicCatalog: nextMusicCatalog,
    homeMedia: homeMediaFromData(
      base.homeMedia,
      libraryTiles,
      nextMusicCatalog,
    ),
    repositories: orderedRepositories,
    homeWidgets: config.widgets,
    providerStatus: statuses,
    generatedAt: new Date().toISOString(),
  });
};

/** 只应用本地设置，不访问任何远程来源。 */
export const applyLocalConfigToSiteData = (
  current: Partial<SiteData> | null | undefined,
  config: LocalConfig,
): SiteData => {
  const base = mergeSiteData(current ?? {});
  const withoutHidden = removeManualAndHiddenTiles(base.libraryTiles, config);
  const manualTiles = tilesFromItems(config.manualItems.map(mapManualItem));
  const repositories =
    config.sources.github.enabled &&
    config.sources.github.content.githubRepositories
      ? base.repositories
      : [];
  return deriveSiteData(
    base,
    config,
    [...withoutHidden, ...manualTiles],
    repositories,
    statusList(base.providerStatus, config),
    musicCatalogForConfig(base.musicCatalog, config),
  );
};

/** 合并一个来源的结果；网络失败时保留该来源已有数据。 */
export const mergeSourceSiteData = (
  current: Partial<SiteData> | null | undefined,
  config: LocalConfig,
  result: SourceSyncResult,
): SiteData => {
  const base = applyLocalConfigToSiteData(current, config);
  const sourcePrefix = `${result.sourceId}-`;
  const sourceTiles = base.libraryTiles.filter(
    (tile) =>
      tile.sourceId === result.sourceId || tile.id.startsWith(sourcePrefix),
  );
  const retainedSourceTiles =
    result.status.status === "error"
      ? sourceTiles
      : tilesFromItems(filterLibraryItemsForConfig(result.libraryItems, config));
  const retainedTiles = removeManualAndHiddenTiles(base.libraryTiles, config)
    .filter(
      (tile) =>
        tile.sourceId !== result.sourceId && !tile.id.startsWith(sourcePrefix),
    );
  const libraryTiles = [
    ...retainedTiles,
    ...retainedSourceTiles,
    ...tilesFromItems(config.manualItems.map(mapManualItem)),
  ];
  const repositories =
    result.sourceId === "github" && result.status.status !== "error"
      ? result.repositories
      : base.repositories;
  const musicCatalog =
    result.status.status === "error"
      ? base.musicCatalog
      : mergeMusicCatalog(
          base.musicCatalog,
          result.sourceId === "netease"
            ? "netease"
            : result.sourceId === "qqmusic"
              ? "qq"
              : undefined,
          result.musicCatalog,
        );
  const statuses = statusList(
    [
      ...base.providerStatus.filter((status) => status.id !== result.sourceId),
      result.status,
    ],
    config,
  );

  return deriveSiteData(
    base,
    config,
    libraryTiles,
    repositories,
    statuses,
    musicCatalog,
  );
};

export const buildSiteDataFromResults = (
  config: LocalConfig,
  results: SourceSyncResult[],
): SiteData => {
  const statuses = statusList(
    results.map((result) => result.status),
    config,
  );
  const remoteTiles = tilesFromItems(
    filterLibraryItemsForConfig(
      results.flatMap((result) => result.libraryItems),
      config,
    ),
  );
  const manualTiles = tilesFromItems(config.manualItems.map(mapManualItem));
  const libraryTiles = [...remoteTiles, ...manualTiles];
  const musicCatalog = results.reduce(
    (catalog, result) =>
      mergeMusicCatalog(
        catalog,
        result.sourceId === "netease"
          ? "netease"
          : result.sourceId === "qqmusic"
            ? "qq"
            : undefined,
        result.musicCatalog,
      ),
    { playlists: [] } as MusicCatalog,
  );
  const github = results.find((result) => result.sourceId === "github");
  const repositories = github?.repositories ?? [];
  return deriveSiteData(
    mergeSiteData(),
    config,
    libraryTiles,
    repositories,
    statuses,
    musicCatalog,
  );
};
