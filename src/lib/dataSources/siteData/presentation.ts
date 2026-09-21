import type {
  CollectionCard,
  FeedCard,
  LibraryTile,
  LocalConfig,
  MusicSettings,
  ReportActivity,
  ReportPlatformCard,
  RepositorySummary,
} from "../../../data/types";
import { sourceLabel } from "./visibility";

/**
 * 将当前播放曲目转换为报告页的音乐平台卡片。
 *
 * @param music - 当前播放器设置。
 * @returns 可展示的音乐平台卡片；没有有效曲目时返回 null。
 */
function musicForReport(music: MusicSettings): ReportPlatformCard | null {
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
}

/**
 * 将游戏标识转换为页面展示名称。
 *
 * @param game - HoYoverse 游戏标识。
 * @returns 面向用户的游戏名称。
 */
function gameLabel(game: string | undefined): string {
  if (game === "genshin") return "原神";
  if (game === "zzz") return "绝区零";
  return "星穹铁道";
}

/**
 * 将动态账号、仓库和个人资料填充到一个预置报告卡片中。
 *
 * @param card - 报告页中的预置卡片。
 * @param repositories - 当前公开仓库列表。
 * @param config - 当前完整本地配置。
 * @returns 填充后的卡片；当前没有对应数据时返回 null。
 */
function hydrateReportCard(
  card: ReportPlatformCard,
  repositories: RepositorySummary[],
  config: LocalConfig,
): ReportPlatformCard | null {
  if (card.id === "report-music") return musicForReport(config.music);

  if (card.id === "report-github") {
    const first = repositories[0];
    if (!first) return null;
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
    const account = config.widgets.find((widget) => widget.type === "game")
      ?.settings?.game?.account;
    if (!account) return null;
    const label = gameLabel(account.game);
    const firstShowcase = account.showcase?.[0];
    return {
      ...card,
      platformId: "hoyolab",
      platformLabel: label,
      title: account.nickname,
      subtitle: account.signature || `${label}公开账号摘要`,
      ...(firstShowcase?.art || firstShowcase?.icon
        ? { image: firstShowcase.art || firstShowcase.icon }
        : {}),
      stats: [
        account.score?.value || String(account.level),
        String(account.achievements),
        String(account.characters),
      ],
      statLabels: ["等级", "成就", "角色"],
      summary: `${account.nickname} 的${label}公开展柜，共展示 ${account.showcase?.length ?? 0} 个角色。`,
      updatedAt: account.updatedAt,
    };
  }

  if (card.id !== "report-profile") return card;
  if (!config.account.name.trim()) return null;
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

/**
 * 计算指定来源卡片中的常用分类数量。
 *
 * @param items - 同一来源的资料库卡片。
 * @returns 按标签聚合的条目数量。
 */
function categoryCounts(items: LibraryTile[]): Record<string, number> {
  return items.reduce<Record<string, number>>((result, tile) => {
    const key = tile.tag.toLocaleLowerCase();
    result[key] = (result[key] ?? 0) + 1;
    return result;
  }, {});
}

/**
 * 读取 Steam 卡片中的最近游玩数量和时长。
 *
 * @param items - Steam 资料库卡片。
 * @returns 最近游玩数量及近两周累计小时数。
 */
function steamRecentSummary(items: LibraryTile[]): {
  count: number;
  hours: number;
} {
  return {
    count: items.filter(
      (item) =>
        item.sourceKind === "steamRecentGames" ||
        item.subtitle.includes("近两周"),
    ).length,
    hours: items.reduce((total, item) => {
      const match = item.subtitle.match(/近两周\s+([\d.]+)\s+小时/);
      return total + (match ? Number(match[1]) : 0);
    }, 0),
  };
}

/**
 * 为一个远程来源生成报告页平台卡片。
 *
 * @param sourceId - 远程数据来源标识。
 * @param items - 该来源的资料库卡片，调用方需保证列表非空。
 * @returns 报告页平台卡片。
 */
function sourceReportCard(
  sourceId: "bangumi" | "bilibili" | "netease" | "qqmusic" | "steam" | "sfacg",
  items: LibraryTile[],
): ReportPlatformCard {
  const counts = categoryCounts(items);
  const label = sourceLabel(sourceId);
  const first = items[0];
  const steam = sourceId === "steam" ? steamRecentSummary(items) : null;
  const primaryCount =
    sourceId === "bangumi"
      ? (counts.game ?? counts.anime ?? counts.book ?? 0)
      : sourceId === "bilibili"
        ? (counts.video ?? 0)
        : sourceId === "steam"
          ? (steam?.count ?? 0)
          : sourceId === "sfacg"
            ? (counts.book ?? 0)
            : (counts.music ?? 0);
  const categoryCount = new Set(items.map((item) => item.sourceKind)).size;
  const secondaryCount =
    sourceId === "steam"
      ? (steam?.hours ?? 0).toFixed(1)
      : sourceId === "netease" || sourceId === "qqmusic" || sourceId === "sfacg"
        ? String(categoryCount)
        : String(counts.music ?? counts.book ?? 0);
  const secondaryLabel =
    sourceId === "steam"
      ? "近两周小时"
      : sourceId === "sfacg" || sourceId === "netease" || sourceId === "qqmusic"
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
  const summary =
    sourceId === "steam"
      ? `${label} 已同步 ${items.length} 个游戏，其中 ${steam?.count ?? 0} 个最近游玩，近两周共 ${(steam?.hours ?? 0).toFixed(1)} 小时。`
      : sourceId === "sfacg"
        ? `${label} 已同步 ${items.length} 部小说，最近一项是「${first.title}」。`
        : `${label} 已同步 ${items.length} 项内容，最近一项是「${first.title}」。`;
  return {
    id: `report-${sourceId}`,
    kind: "platform",
    platformId: sourceId,
    platformLabel: label,
    title: first.title,
    subtitle: `${items.length} 项公开内容`,
    image: first.image,
    stats: [String(items.length), String(primaryCount), secondaryCount],
    statLabels: ["总数", primaryLabel, secondaryLabel],
    tags: Array.from(new Set(items.map((item) => item.tag))).slice(0, 3),
    summary,
  };
}

const reportSourceIds = [
  "bangumi",
  "bilibili",
  "netease",
  "qqmusic",
  "steam",
  "sfacg",
] as const;

/**
 * 将已有报告卡片和当前来源数据合并。
 *
 * @param existing - 页面中已有的预置报告卡片。
 * @param repositories - 当前公开仓库列表。
 * @param libraryTiles - 当前资料库卡片。
 * @param config - 当前完整本地配置。
 * @returns 已填充动态数据且移除无数据卡片的报告卡片列表。
 */
export function reportPlatformsWithData(
  existing: ReportPlatformCard[],
  repositories: RepositorySummary[],
  libraryTiles: LibraryTile[],
  config: LocalConfig,
): ReportPlatformCard[] {
  const base = existing.flatMap((card) => {
    const hydrated = hydrateReportCard(card, repositories, config);
    return hydrated ? [hydrated] : [];
  });
  const sourceCards = reportSourceIds.flatMap((sourceId) => {
    const items = libraryTiles.filter((tile) => tile.sourceId === sourceId);
    return items.length ? [sourceReportCard(sourceId, items)] : [];
  });
  const dynamicIds = new Set(
    reportSourceIds.map((sourceId) => `report-${sourceId}`),
  );
  return [...base.filter((card) => !dynamicIds.has(card.id)), ...sourceCards];
}

/**
 * 用最新 GitHub 仓库更新首页动态卡片。
 *
 * @param existing - 页面中已有的动态卡片。
 * @param repositories - 当前公开仓库列表。
 * @returns 包含最新仓库卡片的动态列表。
 */
export function feedCardsWithRepos(
  existing: FeedCard[],
  repositories: RepositorySummary[],
): FeedCard[] {
  const staticCards = existing.filter((card) => card.id !== "github-latest");
  const latest = repositories[0];
  if (!latest) return staticCards;
  return [
    {
      id: "github-latest",
      category: "GitHub 仓库",
      title: latest.name,
      summary: latest.description || "最近更新的公开仓库",
      statistic: String(latest.stars),
      statisticLabel: "stars",
      image: latest.image ?? "",
      tone: "blue",
    },
    ...staticCards,
  ];
}

/**
 * 从资料库卡片派生首页收藏摘要。
 *
 * @param tiles - 当前资料库卡片。
 * @returns 首页收藏摘要卡片，最多包含两项。
 */
export function collectionsFromTiles(tiles: LibraryTile[]): CollectionCard[] {
  return tiles.slice(0, 2).map((tile, index) => ({
    id: `collection-${tile.id}`,
    title: tile.title,
    subtitle: index === 0 ? "最近同步" : "资料库收藏",
    image: tile.image,
    badge: String(index + 1),
  }));
}

/**
 * 从仓库列表派生报告页最近活动。
 *
 * @param repositories - 当前公开仓库列表。
 * @returns 报告页最近活动，最多包含三项。
 */
export function activitiesFromSources(
  repositories: RepositorySummary[],
): ReportActivity[] {
  return repositories.slice(0, 3).map((repository, index) => ({
    id: `github-activity-${repository.id}`,
    category: index === 0 ? "最近更新" : "仓库收藏",
    title: repository.name,
    subtitle: `${repository.stars} stars`,
    image: repository.image || "",
    mark: index === 0 ? "✦" : "＋",
  }));
}
