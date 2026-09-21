import type {
  DataSourceId,
  IconName,
  SourceContentConfig,
  SourceSnapshotInfo,
} from "./types";

/** 设置页数据来源卡片的静态描述。 */
export interface SourceCard {
  /** 与配置和快照关联的来源 ID。 */
  id: DataSourceId;
  /** 设置页显示名称。 */
  title: string;
  /** 来源用途简介。 */
  description: string;
  /** 账号输入项的标签。 */
  accountLabel: string;
  /** 账号值在来源配置中的字段名。 */
  accountKey: "username" | "userId";
  /** 输入框占位内容。 */
  placeholder: string;
  /** 是否显示 token 输入框。 */
  token: boolean;
  /** 来源卡片使用的语义图标。 */
  icon: IconName;
  /** 可选同步内容。 */
  contentOptions: Array<{
    key: keyof SourceContentConfig;
    label: string;
    description: string;
  }>;
}

/** 设置页的一级标签。 */
export type SettingsTab =
  | "profile"
  | "data"
  | "status";

/** 设置页展示的来源配置目录。 */
export const sourceCards: SourceCard[] = [
  {
    id: "bangumi",
    title: "Bangumi",
    description: "追番、游戏、书籍、音乐",
    accountLabel: "用户名或用户页 URL",
    accountKey: "username",
    placeholder: "例如：miosdream 或 https://bgm.tv/user/…",
    token: false,
    icon: "bookMarked",
    contentOptions: [
      { key: "bangumiAnime", label: "追番", description: "动画与番剧收藏" },
      { key: "bangumiGames", label: "游戏", description: "游戏收藏" },
      { key: "bangumiBooks", label: "书籍", description: "书籍与小说收藏" },
      { key: "bangumiMusic", label: "音乐", description: "音乐收藏" },
    ],
  },
  {
    id: "bilibili",
    title: "Bilibili",
    description: "投稿、收藏、追番",
    accountLabel: "UID 或空间 URL",
    accountKey: "userId",
    placeholder: "例如：205296924 或 https://space.bilibili.com/…",
    token: false,
    icon: "video",
    contentOptions: [
      { key: "bilibiliVideos", label: "投稿视频", description: "你发布的公开视频" },
      { key: "bilibiliFavorites", label: "收藏夹内容", description: "公开收藏夹中的视频" },
      { key: "bilibiliBangumi", label: "追番 / 追剧", description: "公开追番与追剧列表" },
    ],
  },
  {
    id: "github",
    title: "GitHub",
    description: "仓库与统计",
    accountLabel: "用户名或个人页 URL",
    accountKey: "username",
    placeholder: "例如：Mios-dream 或 https://github.com/…",
    token: true,
    icon: "github",
    contentOptions: [
      { key: "githubRepositories", label: "公开仓库", description: "个人主页中的公开仓库" },
    ],
  },
  {
    id: "steam",
    title: "Steam",
    description: "最近游玩、游戏库",
    accountLabel: "个人页 URL 或 SteamID64",
    accountKey: "username",
    placeholder: "例如：76561198863810095 或 Steam 个人页链接",
    token: true,
    icon: "game",
    contentOptions: [
      { key: "steamRecentGames", label: "最近游玩", description: "最近游戏、近两周时长和最后游玩日期" },
      { key: "steamLibrary", label: "游戏库", description: "Steam 账号拥有的游戏及累计游玩时长" },
    ],
  },
  {
    id: "sfacg",
    title: "SFACG",
    description: "菠萝包轻小说开放书架",
    accountLabel: "开放书架地址",
    accountKey: "username",
    placeholder: "例如：https://p.sfacg.com/p/8933368/",
    token: false,
    icon: "bookMarked",
    contentOptions: [
      { key: "sfacgBooks", label: "开放书架作品", description: "书架中的小说标题、作者和封面" },
    ],
  },
  {
    id: "netease",
    title: "网易云音乐",
    description: "喜欢、创建、收藏歌单",
    accountLabel: "用户 ID 或个人页 URL",
    accountKey: "username",
    placeholder: "例如：32953014 或网易云用户页链接",
    token: false,
    icon: "music",
    contentOptions: [
      { key: "neteaseLiked", label: "喜欢的音乐", description: "我喜欢的音乐歌单" },
      { key: "neteaseCreated", label: "创建的歌单", description: "自己创建的公开歌单" },
      { key: "neteaseCollected", label: "收藏的歌单", description: "收藏的公开歌单" },
    ],
  },
  {
    id: "qqmusic",
    title: "QQ 音乐",
    description: "喜欢、创建、收藏歌单",
    accountLabel: "QQ 音乐用户 ID",
    accountKey: "username",
    placeholder: "例如：10000 或 QQ 音乐个人页链接",
    token: false,
    icon: "radio",
    contentOptions: [
      { key: "qqmusicLiked", label: "喜欢的音乐", description: "平台公开的喜欢歌单" },
      { key: "qqmusicCreated", label: "创建的歌单", description: "自己创建的公开歌单" },
      { key: "qqmusicCollected", label: "收藏的歌单", description: "收藏的公开歌单" },
    ],
  },
];

/** 设置页的一级标签目录。 */
export const settingsTabs: Array<{
  id: SettingsTab;
  label: string;
  icon: IconName;
}> = [
  { id: "profile", label: "基础设置", icon: "settings" },
  { id: "data", label: "数据管理", icon: "globe" },
  { id: "status", label: "同步状态", icon: "activity" },
];

/**
 * 创建单个来源尚未同步时使用的空快照状态。
 *
 * @param sourceId - 需要初始化的来源标识。
 * @returns 与来源标识对应的空快照状态。
 */
export function emptySourceSnapshotInfo(
  sourceId: DataSourceId,
): SourceSnapshotInfo {
  return {
    sourceId,
    state: "never",
    message: "尚未同步",
    rawExists: false,
    rawBytes: 0,
    rawUpdatedAt: null,
    derivedExists: false,
    derivedBytes: 0,
    derivedUpdatedAt: null,
    itemCount: 0,
    fetchedAt: null,
    processedAt: null,
  };
}

/**
 * 创建所有来源的初始快照状态映射，避免组件中重复维护来源清单。
 *
 * @returns 按来源 ID 索引的空快照状态映射。
 */
export function emptySourceSnapshotStatuses(): Record<
  DataSourceId,
  SourceSnapshotInfo
> {
  return {
    bangumi: emptySourceSnapshotInfo("bangumi"),
    bilibili: emptySourceSnapshotInfo("bilibili"),
    github: emptySourceSnapshotInfo("github"),
    netease: emptySourceSnapshotInfo("netease"),
    qqmusic: emptySourceSnapshotInfo("qqmusic"),
    steam: emptySourceSnapshotInfo("steam"),
    sfacg: emptySourceSnapshotInfo("sfacg"),
  };
}
