/**
 * 应用左侧导航允许进入的页面。
 */
export type AppPage =
  | "home"
  | "library"
  | "friends"
  | "brew"
  | "reports"
  | "settings";

/** 能够被本地同步器读取的公开数据源。 */
export type DataSourceId =
  | "bangumi"
  | "bilibili"
  | "github"
  | "netease"
  | "qqmusic"
  | "steam"
  | "sfacg";

/** 远程来源写入资料库时使用的稳定内容类别。 */
export type SourceContentKey =
  | "bangumiAnime"
  | "bangumiGames"
  | "bangumiBooks"
  | "bangumiMusic"
  | "bilibiliVideos"
  | "bilibiliFavorites"
  | "bilibiliBangumi"
  | "neteaseLiked"
  | "neteaseCreated"
  | "neteaseCollected"
  | "qqmusicLiked"
  | "qqmusicCreated"
  | "qqmusicCollected"
  | "steamRecentGames"
  | "steamLibrary"
  | "sfacgBooks";

/** 公开的 Hoyoverse 游戏标识，与参考站的 Game Presence 配置保持一致。 */
export type HoyoGame = "genshin" | "hsr" | "zzz";

/** 游戏资料卡中可轮播的公开展柜条目。 */
export interface GameShowcaseItem {
  name: string;
  level?: number;
  icon?: string;
  art?: string;
  rarity?: number;
}

export interface GameHighlight {
  label: string;
  value: string;
}

/** 首页配置中的资料卡组件类型。 */
export type HomeWidgetType =
  | "greeting"
  | "feed"
  | "friend"
  | "agent"
  | "collection"
  | "weather"
  | "media"
  | "music"
  | "game"
  | "activities"
  | "link"
  | "github"
  | "bilibili";

/** 可复用跳转卡片的设置。 */
export type LinkPlatform =
  | "generic"
  | "qq"
  | "github"
  | "email"
  | "steam"
  | "blog"
  | "bilibili"
  | "netease"
  | "qqmusic"
  | "youtube"
  | "x"
  | "discord"
  | "telegram";

export interface LinkWidgetSettings {
  title: string;
  subtitle: string;
  href: string;
  platform: LinkPlatform;
  icon: IconName;
  tone: SocialLink["tone"];
  openInNewTab: boolean;
}

/** 星穹铁道公开账号摘要；只保存页面展示需要的字段。 */
export interface StarRailAccountData {
  uid: string;
  nickname: string;
  level: number;
  worldLevel: number;
  achievements: number;
  characters: number;
  avatar?: string;
  game?: HoyoGame;
  signature?: string;
  score?: { label: string; value: string };
  presence?: { status: string; title?: string; detail?: string };
  highlights?: GameHighlight[];
  showcase?: GameShowcaseItem[];
  profileUrl?: string;
  degraded?: boolean;
  degradeReason?: string;
  updatedAt?: string;
}

/** 音乐卡片和报告页共用的当前曲目快照。 */
export interface MusicSettings {
  enabled: boolean;
  source: "manual" | MusicPlatform;
  playlistId: string;
  id: string;
  title: string;
  artist: string;
  album: string;
  cover: string;
  audioUrl: string;
}

export type MusicPlatform = "netease" | "qq";
export type MusicPlaylistKind = "liked" | "created" | "collected";
export type MusicPlaybackMode = "sequential" | "shuffle" | "one";

/** 同步歌单中可供播放器选择的曲目。 */
export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  album: string;
  cover: string;
  audioUrl: string;
  url: string;
  source: MusicPlatform;
  playlistId: string;
}

/** 网易云音乐公开用户统计，供首页媒体卡片使用。 */
export interface MusicUserStats {
  followerCount: number;
  playlistCount: number;
  level: number;
  moodKeywords?: string[];
}

/** 一个同步歌单及其公开曲目目录。 */
export interface MusicPlaylist {
  id: string;
  title: string;
  cover: string;
  trackCount: number;
  ownerId: string;
  kind: MusicPlaylistKind;
  source: MusicPlatform;
  sourceKind: SourceContentKey;
  url: string;
  tracks: MusicTrack[];
}

export interface MusicCatalog {
  playlists: MusicPlaylist[];
  user?: MusicUserStats;
}

/** 首页组件的可选设置。没有专属设置的组件可以省略该字段。 */
export interface HomeWidgetSettings {
  link?: LinkWidgetSettings;
  game?: {
    uid: string;
    game?: HoyoGame;
    /** null 表示用户已切换 UID/游戏，等待下一次公开数据同步。 */
    account?: StarRailAccountData | null;
  };
  friend?: {
    interval: number;
  };
}

/** 首页网格中的一个可组合小组件。尺寸以网格单元为单位。 */
export interface HomeWidget {
  id: string;
  type: HomeWidgetType;
  label: string;
  visible: boolean;
  /** 桌面网格中的左上角位置，从 1 开始。 */
  col: number;
  row: number;
  colSpan: number;
  rowSpan: number;
  mobileColSpan: number;
  mobileRowSpan: number;
  settings?: HomeWidgetSettings;
}

/** 站点身份信息。 */
export interface SiteProfile {
  name: string;
  latinName: string;
  motto: string;
  avatar: string;
}

/** 站点级展示设置；它只影响页面身份，不参与来源同步。 */
export interface SiteSettings {
  title: string;
  description: string;
  favicon: string;
}

/** GitHub 仓库的统一展示字段。 */
export interface RepositorySummary {
  id: string;
  name: string;
  description: string;
  htmlUrl: string;
  language: string;
  stars: number;
  forks: number;
  updatedAt: string;
  image?: string;
}

/** 每个数据源最近一次同步的结果。 */
export interface ProviderStatus {
  id: DataSourceId;
  label: string;
  status: "success" | "skipped" | "error";
  message: string;
  count: number;
}

/** 原始快照与资料库派生数据的持久化状态。仅供本地设置接口使用。 */
export type SourceSnapshotState = "never" | "success" | "error" | "cleared";

export interface SourceSnapshotInfo {
  sourceId: DataSourceId;
  state: SourceSnapshotState;
  message: string;
  rawExists: boolean;
  rawBytes: number;
  rawUpdatedAt: string | null;
  derivedExists: boolean;
  derivedBytes: number;
  derivedUpdatedAt: string | null;
  itemCount: number;
  fetchedAt: string | null;
  processedAt: string | null;
}

/** 构建时注入页面的完整数据快照。 */
export interface SiteData {
  profile: SiteProfile;
  socialLinks: SocialLink[];
  friends: FriendLink[];
  feedCards: FeedCard[];
  collections: CollectionCard[];
  activities: ReportActivity[];
  libraryTiles: LibraryTile[];
  brewSources: BrewSource[];
  reportPlatforms: ReportPlatformCard[];
  repositories: RepositorySummary[];
  music: MusicSettings;
  musicCatalog: MusicCatalog;
  homeMedia: HomeMediaData;
  homeWidgets: HomeWidget[];
  providerStatus: ProviderStatus[];
  generatedAt: string;
}

/** 本地设置页中用于拉取远程数据的来源参数。 */
export interface SourceConfig {
  enabled: boolean;
  username: string;
  userId: string;
  token: string;
  limit: number;
  content: SourceContentConfig;
}

export interface AutoRefreshConfig {
  /** 静态站点只在本地开发服务运行期间自动刷新。 */
  enabled: boolean;
  intervalHours: 6 | 12 | 24;
}

/** 每个来源允许写入公开页面的内容范围。 */
export interface SourceContentConfig {
  bangumiAnime: boolean;
  bangumiGames: boolean;
  bangumiBooks: boolean;
  bangumiMusic: boolean;
  bilibiliVideos: boolean;
  bilibiliFavorites: boolean;
  bilibiliBangumi: boolean;
  neteaseLiked: boolean;
  neteaseCreated: boolean;
  neteaseCollected: boolean;
  qqmusicLiked: boolean;
  qqmusicCreated: boolean;
  qqmusicCollected: boolean;
  steamRecentGames: boolean;
  steamLibrary: boolean;
  sfacgBooks: boolean;
  githubRepositories: boolean;
  githubRepositoryScope: GitHubRepositoryScope;
  githubRepositorySort: GitHubRepositorySort;
}

/** GitHub 仓库同步范围。Pinned 通过 GitHub GraphQL API 读取。 */
export type GitHubRepositoryScope = "all" | "pinned";

/** GitHub 首页和报告中的仓库展示顺序。 */
export type GitHubRepositorySort = "stars" | "updated" | "forks" | "name";

/** 只保存在本地的站点配置；token 不会写入生成后的 SiteData。 */
export interface LocalConfig {
  version: 1;
  site: SiteSettings;
  account: SiteProfile;
  socialLinks: SocialLink[];
  friends: FriendLink[];
  sources: Record<DataSourceId, SourceConfig>;
  autoRefresh: AutoRefreshConfig;
  music: MusicSettings;
  widgets: HomeWidget[];
}

/**
 * 资料库筛选栏允许显示的内容分类。
 */
export type LibraryFilter =
  | "all"
  | "game"
  | "video"
  | "music"
  | "anime"
  | "book";

/** 与页面卡片解耦的统一资料库条目。平台适配器只输出这一层。 */
export interface LibraryItem {
  id: string;
  itemType: Exclude<LibraryFilter, "all">;
  title: string;
  subtitle: string;
  cover: string;
  platform: string;
  url?: string;
  sourceId?: DataSourceId;
  sourceKind?: SourceContentKey;
  metadata?: Record<string, unknown>;
  /** Bangumi 条目的个人评分。 */
  rating?: number;
  /** Bangumi 的收藏状态。 */
  collectionStatus?: string;
}

/**
 * 图标组件使用的语义名称。
 *
 * 数据层只保存语义名称，真正的图标组件由 `IconGlyph.vue` 统一映射，
 * 这样页面数据不会直接依赖图标库的实现细节。
 */
export type IconName =
  | "activity"
  | "arrowLeft"
  | "arrowRight"
  | "arrowUpDown"
  | "at"
  | "book"
  | "bookMarked"
  | "bot"
  | "brew"
  | "calendar"
  | "camera"
  | "chart"
  | "check"
  | "chevronDown"
  | "circlePlus"
  | "circleUser"
  | "cloud"
  | "cloudFog"
  | "cloudLightning"
  | "cloudRain"
  | "cloudSnow"
  | "code2"
  | "disc3"
  | "droplets"
  | "external"
  | "fileDown"
  | "game"
  | "globe"
  | "github"
  | "gripVertical"
  | "home"
  | "imageOff"
  | "keyboard"
  | "library"
  | "link"
  | "layoutGrid"
  | "listMusic"
  | "headphones"
  | "mail"
  | "mapPin"
  | "menu"
  | "messageCircle"
  | "messagesSquare"
  | "mic"
  | "monitor"
  | "music"
  | "palette"
  | "pause"
  | "pencil"
  | "play"
  | "plus"
  | "refresh"
  | "report"
  | "radio"
  | "repeat"
  | "rss"
  | "save"
  | "search"
  | "send"
  | "settings"
  | "share"
  | "shoppingBag"
  | "sliders"
  | "sparkles"
  | "star"
  | "sun"
  | "shuffle"
  | "skipBack"
  | "skipForward"
  | "trash"
  | "user"
  | "video"
  | "volume"
  | "volumeX"
  | "wind"
  | "x"
  | "zoomIn"
  | "zoomOut";

/**
 * 左侧导航条的一项配置。
 */
export interface NavigationItem {
  /** 页面唯一标识。 */
  id: AppPage;
  /** 页面展示名称。 */
  label: string;
  /** 面向屏幕阅读器和悬浮提示的补充说明。 */
  description: string;
  /** 静态页面路径。 */
  path: string;
  /** 需要渲染的语义图标。 */
  icon: IconName;
}

/**
 * 首页社交入口的数据结构。
 */
export interface SocialLink {
  /** 入口唯一标识。 */
  id: string;
  /** 社交平台名称。 */
  label: string;
  /** 用于显示在入口下方的小标题。 */
  caption: string;
  /** 外部链接地址。 */
  href: string;
  /** 图标语义名称。 */
  icon: IconName;
  /** 视觉主题色。 */
  tone: "blue" | "indigo" | "ink" | "violet";
}

/** 博客友联资料卡的数据结构。 */
export interface FriendLink {
  /** 友联唯一标识。 */
  id: string;
  /** 博客昵称。 */
  nickname: string;
  /** 友联主页地址。 */
  href: string;
  /** 头像地址，可以为空或加载失败时使用默认头像图标。 */
  avatar: string;
  /** 一句签名或站点介绍。 */
  signature: string;
  /** 友联标签。 */
  tags: string[];
  /** 可选的 RSS / Atom 订阅地址。 */
  feedUrl?: string;
  /** 卡片强调色。 */
  tone: "butter" | "lilac" | "mint" | "peach" | "rose" | "sky";
}

/**
 * 首页中央轮播信息卡的数据结构。
 */
export interface FeedCard {
  /** 卡片唯一标识。 */
  id: string;
  /** 卡片类别。 */
  category: string;
  /** 卡片主标题。 */
  title: string;
  /** 卡片正文摘要。 */
  summary: string;
  /** 统计信息。 */
  statistic: string;
  /** 统计信息的单位。 */
  statisticLabel: string;
  /** 头像或品牌图片。 */
  image: string;
  /** 卡片强调色。 */
  tone: "blue" | "pink" | "violet";
}

/**
 * 首页媒体收藏卡的数据结构。
 */
export interface CollectionCard {
  /** 收藏项唯一标识。 */
  id: string;
  /** 收藏项标题。 */
  title: string;
  /** 收藏项副标题。 */
  subtitle: string;
  /** 封面资源路径。 */
  image: string;
  /** 用于小角标的数字。 */
  badge: string;
}

/** Bangumi 首页卡片中的个人收藏摘要。 */
export interface HomeBangumiItem {
  id: string;
  title: string;
  image: string;
  type: Exclude<LibraryFilter, "all">;
  status: string;
  rating?: number;
  url?: string;
}

export interface HomeBangumiStats {
  total: number;
  statusCounts: {
    done: number;
    doing: number;
    wish: number;
  };
  typeCounts: Record<string, number>;
  tasteProfile: string;
  items: HomeBangumiItem[];
}

/** 网易云音乐首页卡片中的个人统计与收藏曲目。 */
export interface HomeNeteaseItem {
  id: string;
  title: string;
  artist: string;
  cover: string;
  url?: string;
}

export interface HomeNeteaseStats {
  followerCount: number;
  playlistCount: number;
  level: number;
  moodKeywords: string[];
  items: HomeNeteaseItem[];
}

export interface HomeMediaData {
  bangumi: HomeBangumiStats;
  netease: HomeNeteaseStats;
}

/**
 * 资料库自由画布中的卡片数据结构。
 */
export interface LibraryTile {
  /** 卡片唯一标识。 */
  id: string;
  /** 卡片标题。 */
  title: string;
  /** 卡片副标题或来源。 */
  subtitle: string;
  /** 卡片标签。 */
  tag: string;
  /** 画布上的横向位置。 */
  left: number;
  /** 画布上的纵向位置。 */
  top: number;
  /** 卡片宽度。 */
  width: number;
  /** 卡片高度。 */
  height: number;
  /** 卡片图片资源。 */
  image: string;
  /** 卡片视觉主题。 */
  tone: "cyan" | "cream" | "dark" | "pink" | "violet";
  /** 卡片使用的语义图标。 */
  icon: IconName;
  /** 可选的来源链接，供动态条目继续访问原平台。 */
  url?: string;
  /** 真实数据来源；固定内容不填写。 */
  sourceId?: DataSourceId;
  /** 来源内的内容类别，用于配置过滤，不依赖展示 ID 的前缀。 */
  sourceKind?: SourceContentKey;
  /** Bangumi 条目的个人评分。 */
  rating?: number;
  /** Bangumi 的收藏状态。 */
  collectionStatus?: string;
}

/**
 * Brew 阅读页的信息源卡片数据结构。
 */
export interface BrewSource {
  /** 信息源唯一标识。 */
  id: string;
  /** 信息源名称。 */
  name: string;
  /** 信息源作者或站点标识。 */
  author: string;
  /** 信息源类型。 */
  type: "Atom" | "Brewlia" | "RSS" | "链接";
  /** 信息源在瀑布流中使用的卡片形态。 */
  layout: "featured" | "standard" | "link";
  /** 已收录的文章数量。 */
  articleCount: number;
  /** 最新文章标题。 */
  latestTitle: string;
  /** 最新文章摘要。 */
  summary: string;
  /** 最新文章日期。 */
  date: string;
  /** 头像或图标资源。 */
  image: string;
  /** 信息源主页地址。 */
  href: string;
  /** RSS / Atom 地址；链接型友联没有该字段。 */
  feedUrl?: string;
  /** 当前浏览器最近一次验证订阅源的结果。 */
  feedStatus?: "available" | "unavailable" | "unset";
  /** 视觉强调色。 */
  tone: "blue" | "green" | "orange" | "pink" | "purple";
  /** 该信息源附带的标签。 */
  tags: string[];
  /** 卡片中显示的历史文章。 */
  articles: BrewArticle[];
}

/** Brew 卡片中的静态文章条目。 */
export interface BrewArticle {
  /** 文章唯一标识。 */
  id: string;
  /** 文章标题。 */
  title: string;
  /** 文章日期。 */
  date: string;
  /** 文章摘要。 */
  summary?: string;
  /** 文章原文地址。 */
  href?: string;
}

/**
 * 数据报告中的单个统计指标。
 */
export interface ReportMetric {
  /** 指标名称。 */
  label: string;
  /** 指标数值。 */
  value: string;
  /** 相比上一周期的变化。 */
  change: string;
  /** 趋势方向。 */
  trend: "down" | "flat" | "up";
}

/**
 * 数据报告页底部活动卡片的数据结构。
 */
export interface ReportActivity {
  /** 活动唯一标识。 */
  id: string;
  /** 活动分类。 */
  category: string;
  /** 活动标题。 */
  title: string;
  /** 活动副标题。 */
  subtitle: string;
  /** 活动展示图片。 */
  image: string;
  /** 左下角标记。 */
  mark: string;
}

/** 报告页横向卡片的视觉类型。 */
export type ReportPlatformKind =
  | "music"
  | "github"
  | "game"
  | "profile"
  | "social"
  | "community"
  | "platform";

/** 报告页的一个平台卡片。 */
export interface ReportPlatformCard {
  id: string;
  kind: ReportPlatformKind;
  platformId?: string;
  platformLabel?: string;
  title: string;
  subtitle: string;
  image?: string;
  secondaryImage?: string;
  eyebrow?: string;
  stats?: string[];
  statLabels?: string[];
  tags?: string[];
  summary?: string;
  /** Stage 模式中可逐句播放的补充洞察。 */
  insights?: string[];
  updatedAt?: string;
}
