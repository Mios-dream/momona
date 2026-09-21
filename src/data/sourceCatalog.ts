import type { DataSourceId, SourceContentConfig } from "./types";

/**
 * 项目支持的公开数据来源。
 *
 * 这个列表是配置、快照和同步流程共用的唯一来源清单，避免不同模块各自
 * 维护一份容易漂移的字符串数组。
 */
export const dataSourceIds = [
  "bangumi",
  "bilibili",
  "github",
  "netease",
  "qqmusic",
  "steam",
  "sfacg",
] as const satisfies readonly DataSourceId[];

/** 数据来源在页面和同步状态中使用的展示名称。 */
export const sourceLabels: Record<DataSourceId, string> = {
  bangumi: "Bangumi",
  bilibili: "Bilibili",
  github: "GitHub",
  netease: "网易云音乐",
  qqmusic: "QQ 音乐",
  steam: "Steam",
  sfacg: "SFACG",
};

/** 每个来源可选择同步的内容配置键，用于统一判断和展示已选内容。 */
export const sourceContentKeys: Record<
  DataSourceId,
  readonly (keyof SourceContentConfig)[]
> = {
  bangumi: ["bangumiAnime", "bangumiGames", "bangumiBooks", "bangumiMusic"],
  bilibili: ["bilibiliVideos", "bilibiliFavorites", "bilibiliBangumi"],
  github: ["githubRepositories"],
  netease: ["neteaseLiked", "neteaseCreated", "neteaseCollected"],
  qqmusic: ["qqmusicLiked", "qqmusicCreated", "qqmusicCollected"],
  steam: ["steamRecentGames", "steamLibrary"],
  sfacg: ["sfacgBooks"],
};

const sourceContentLabels: Partial<Record<keyof SourceContentConfig, string>> = {
  bangumiAnime: "追番",
  bangumiGames: "游戏",
  bangumiBooks: "书籍",
  bangumiMusic: "音乐",
  bilibiliVideos: "投稿视频",
  bilibiliFavorites: "收藏夹",
  bilibiliBangumi: "追番 / 追剧",
  neteaseLiked: "喜欢的音乐",
  neteaseCreated: "创建的歌单",
  neteaseCollected: "收藏的歌单",
  qqmusicLiked: "喜欢的音乐",
  qqmusicCreated: "创建的歌单",
  qqmusicCollected: "收藏的歌单",
  steamRecentGames: "最近游玩",
  steamLibrary: "游戏库",
  sfacgBooks: "开放书架作品",
  githubRepositories: "全部公开仓库",
};

/**
 * 根据来源内容配置生成同步状态中的已选内容名称。
 *
 * @param sourceId - 数据来源标识。
 * @param content - 当前来源的内容开关配置。
 * @returns 面向用户的已选内容名称；没有选择时返回空字符串。
 */
export function selectedSourceContentLabel(
  sourceId: DataSourceId,
  content: SourceContentConfig,
): string {
  if (sourceId === "github" && content.githubRepositories) {
    return content.githubRepositoryScope === "pinned"
      ? "Pinned 仓库"
      : "全部公开仓库";
  }
  return sourceContentKeys[sourceId]
    .filter((key) => content[key] === true)
    .map((key) => sourceContentLabels[key] ?? key)
    .join("、");
}

/**
 * 判断一个来源是否至少选择了一种需要同步的内容。
 *
 * @param sourceId - 数据来源标识。
 * @param content - 当前来源的内容开关配置。
 * @returns 至少启用一个同步内容时返回 true。
 */
export function hasSelectedSourceContent(
  sourceId: DataSourceId,
  content: SourceContentConfig,
): boolean {
  return sourceContentKeys[sourceId].some((key) => content[key] === true);
}
