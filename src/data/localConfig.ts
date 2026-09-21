import {
  createHomeWidget,
  normalizeHomeWidgets,
  widgetIconOptions,
  widgetToneOptions,
} from "./homeWidgets";
import { normalizeFriendLink } from "./friends";
import { dataSourceIds } from "./sourceCatalog";
import type {
  HomeWidget,
  IconName,
  LinkWidgetSettings,
  LocalConfig,
  MusicSettings,
  SiteProfile,
  SiteSettings,
  SocialLink,
  SourceConfig,
  SourceContentConfig,
} from "./types";

/**
 * 判断未知输入是否为可读取属性的普通对象。
 *
 * @param value - 待判断的未知输入。
 * @returns 输入是非数组对象时返回 true。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * 读取配置中的文本字段，并统一去除首尾空白。
 *
 * @param value - 待读取的未知字段。
 * @returns 类型为字符串时的去空白文本，否则返回空字符串。
 */
function text(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * 判断未知图标是否属于首页配置允许的图标集合。
 *
 * @param value - 待判断的未知图标值。
 * @returns 值属于允许的图标集合时返回 true。
 */
function isIconName(value: unknown): value is IconName {
  return (
    typeof value === "string" && widgetIconOptions.includes(value as IconName)
  );
}

/**
 * 判断未知颜色是否属于社交链接允许的主题集合。
 *
 * @param value - 待判断的未知主题色。
 * @returns 值属于允许的主题色集合时返回 true。
 */
function isSocialTone(value: unknown): value is SocialLink["tone"] {
  return (
    typeof value === "string" &&
    (widgetToneOptions as readonly string[]).includes(value)
  );
}

/**
 * 创建个人站点的默认身份信息。
 *
 * @returns 站点首次启动时使用的默认个人资料。
 */
function defaultProfile(): SiteProfile {
  return {
    name: "三三 sama",
    latinName: "@miosdream",
    motto: "「世界中のすべての素晴らしいために戦う！」",
    avatar: "/assets/avatar.jpg",
  };
}

/** 创建站点首次启动时使用的页面身份设置。 */
function defaultSiteSettings(): SiteSettings {
  return {
    title: "Love on the page",
    description: "Momona 期待和你相遇的每一天。",
    favicon: "/favicon.svg",
  };
}

/**
 * 创建空的播放器配置。
 *
 * @returns 未选择曲目的默认播放器配置。
 */
function emptyMusic(): MusicSettings {
  return {
    enabled: false,
    source: "manual",
    playlistId: "",
    id: "",
    title: "",
    artist: "",
    album: "",
    cover: "",
    audioUrl: "",
  };
}

/**
 * 创建所有来源内容均关闭的配置。
 *
 * @returns 所有来源内容开关均关闭的默认对象。
 */
function emptyContent(): SourceContentConfig {
  return {
    bangumiAnime: false,
    bangumiGames: false,
    bangumiBooks: false,
    bangumiMusic: false,
    bilibiliVideos: false,
    bilibiliFavorites: false,
    bilibiliBangumi: false,
    neteaseLiked: false,
    neteaseCreated: false,
    neteaseCollected: false,
    qqmusicLiked: false,
    qqmusicCreated: false,
    qqmusicCollected: false,
    steamRecentGames: false,
    steamLibrary: false,
    sfacgBooks: false,
    githubRepositories: false,
    githubRepositoryScope: "all",
    githubRepositorySort: "updated",
  };
}

/**
 * 创建单个来源的默认配置。
 *
 * @returns 未启用且没有身份信息的来源配置。
 */
function emptySource(): SourceConfig {
  return {
    enabled: false,
    username: "",
    userId: "",
    token: "",
    limit: 24,
    content: emptyContent(),
  };
}

/**
 * 创建默认的本地自动刷新配置。
 *
 * @returns 关闭自动刷新的默认配置。
 */
function emptyAutoRefresh(): LocalConfig["autoRefresh"] {
  return {
    enabled: false,
    intervalHours: 24,
  };
}

/**
 * 创建首次启动时的默认链接组件。
 *
 * @param id - 组件实例标识。
 * @param col - 组件在首页网格中的起始列。
 * @param row - 组件在首页网格中的起始行。
 * @param link - 链接组件的展示与跳转设置。
 * @returns 配置好默认尺寸和位置的链接组件。
 */
function defaultLinkWidget(
  id: string,
  col: number,
  row: number,
  link: LinkWidgetSettings,
): HomeWidget {
  return {
    ...createHomeWidget("link", id),
    visible: true,
    col,
    row,
    colSpan: 1,
    rowSpan: 1,
    mobileColSpan: 1,
    mobileRowSpan: 1,
    settings: { link },
  };
}

/**
 * 创建首次启动时的首页组件布局。
 *
 * @returns 带有基础社交链接和默认展示组件的首页布局。
 */
function defaultHomeWidgets(): HomeWidget[] {
  return [
    createHomeWidget("greeting", "greeting"),
    defaultLinkWidget("social-qq", 3, 1, {
      title: "QQ",
      subtitle: "",
      href: "https://im.qq.com/",
      platform: "qq",
      icon: "user",
      tone: "blue",
      openInNewTab: true,
    }),
    defaultLinkWidget("social-github", 4, 1, {
      title: "GitHub",
      subtitle: "查看项目",
      href: "https://github.com/",
      platform: "github",
      icon: "github",
      tone: "ink",
      openInNewTab: true,
    }),
    defaultLinkWidget("social-mail", 3, 2, {
      title: "Email",
      subtitle: "写一封信",
      href: "mailto:hello@example.com",
      platform: "email",
      icon: "at",
      tone: "indigo",
      openInNewTab: true,
    }),
    defaultLinkWidget("social-steam", 4, 2, {
      title: "Steam",
      subtitle: "游戏收藏",
      href: "https://store.steampowered.com/",
      platform: "steam",
      icon: "game",
      tone: "violet",
      openInNewTab: true,
    }),
    createHomeWidget("feed", "feed"),
    createHomeWidget("collection", "collection"),
    createHomeWidget("friend", "friend"),
    createHomeWidget("agent", "agent"),
    createHomeWidget("weather", "weather"),
    createHomeWidget("media", "media"),
    createHomeWidget("game", "game"),
    createHomeWidget("music", "music"),
    {
      ...createHomeWidget("github", "github"),
      col: 13,
      row: 3,
    },
  ];
}

/**
 * 创建首次启动用的本地配置；数据来源和内容为空，身份与首页布局提供默认值。
 *
 * @returns 可直接用于设置页和同步流程的空本地配置。
 */
export function createEmptyLocalConfig(): LocalConfig {
  return {
    version: 1,
    site: defaultSiteSettings(),
    account: defaultProfile(),
    socialLinks: [],
    friends: [],
    sources: {
      bangumi: emptySource(),
      bilibili: emptySource(),
      github: emptySource(),
      netease: emptySource(),
      qqmusic: emptySource(),
      steam: emptySource(),
      sfacg: emptySource(),
    },
    autoRefresh: emptyAutoRefresh(),
    music: emptyMusic(),
    widgets: defaultHomeWidgets(),
  };
}

/** 规范化站点级页面身份设置。 */
function normalizeSiteSettings(value: unknown): SiteSettings {
  const record = isRecord(value) ? value : {};
  return {
    title: text(record.title) || "Love on the page",
    description: text(record.description) || "一个静态的个人数字生活展示入口。",
    favicon: text(record.favicon) || "/favicon.svg",
  };
}

/**
 * 规范化个人资料字段，缺失字段保持为空。
 *
 * @param value - 文件或接口中的未知个人资料。
 * @returns 具有稳定字段的个人资料对象。
 */
function normalizeProfile(value: unknown): SiteProfile {
  const record = isRecord(value) ? value : {};
  return {
    name: text(record.name),
    latinName: text(record.latinName),
    motto: text(record.motto),
    avatar: text(record.avatar),
  };
}

/**
 * 过滤并规范化社交链接配置。
 *
 * @param value - 文件或接口中的未知社交链接列表。
 * @returns 去除无效项并补齐默认字段后的链接列表。
 */
function normalizeSocialLinks(value: unknown): SocialLink[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    if (!isRecord(entry)) return [];
    const label = text(entry.label);
    const href = text(entry.href);
    if (!label || !href) return [];
    return [
      {
        id: text(entry.id) || `social-${index + 1}`,
        label,
        caption: text(entry.caption),
        href,
        icon: isIconName(entry.icon) ? entry.icon : "link",
        tone: isSocialTone(entry.tone) ? entry.tone : "blue",
      },
    ];
  });
}

/**
 * 规范化一个来源的开关、账号和内容范围。
 *
 * @param value - 文件或接口中的未知来源配置。
 * @returns 具有固定字段和合法范围的来源配置。
 */
function normalizeSource(value: unknown): SourceConfig {
  const record = isRecord(value) ? value : {};
  const rawContent = isRecord(record.content) ? record.content : {};
  /**
   * 读取来源内容配置中的布尔开关。
   *
   * @param key - 需要读取的内容开关字段。
   * @returns 字段确实为布尔值时返回其值，否则返回 false。
   */
  function boolean(
    key: Exclude<
      keyof SourceContentConfig,
      "githubRepositoryScope" | "githubRepositorySort"
    >,
  ): boolean {
    return typeof rawContent[key] === "boolean" ? rawContent[key] : false;
  }
  const parsedLimit = Number(record.limit);

  return {
    enabled: record.enabled === true,
    username: text(record.username),
    userId: text(record.userId),
    token: text(record.token),
    limit: Number.isFinite(parsedLimit)
      ? Math.min(120, Math.max(1, Math.round(parsedLimit)))
      : 24,
    content: {
      bangumiAnime: boolean("bangumiAnime"),
      bangumiGames: boolean("bangumiGames"),
      bangumiBooks: boolean("bangumiBooks"),
      bangumiMusic: boolean("bangumiMusic"),
      bilibiliVideos: boolean("bilibiliVideos"),
      bilibiliFavorites: boolean("bilibiliFavorites"),
      bilibiliBangumi: boolean("bilibiliBangumi"),
      neteaseLiked: boolean("neteaseLiked"),
      neteaseCreated: boolean("neteaseCreated"),
      neteaseCollected: boolean("neteaseCollected"),
      qqmusicLiked: boolean("qqmusicLiked"),
      qqmusicCreated: boolean("qqmusicCreated"),
      qqmusicCollected: boolean("qqmusicCollected"),
      steamRecentGames: boolean("steamRecentGames"),
      steamLibrary: boolean("steamLibrary"),
      sfacgBooks: boolean("sfacgBooks"),
      githubRepositories: boolean("githubRepositories"),
      githubRepositoryScope:
        rawContent.githubRepositoryScope === "pinned" ? "pinned" : "all",
      githubRepositorySort:
        rawContent.githubRepositorySort === "stars" ||
        rawContent.githubRepositorySort === "forks" ||
        rawContent.githubRepositorySort === "name"
          ? rawContent.githubRepositorySort
          : "updated",
    },
  };
}

/**
 * 规范化播放器当前曲目设置。
 *
 * @param value - 文件或接口中的未知播放器设置。
 * @returns 具有稳定字段和合法来源标识的播放器设置。
 */
function normalizeMusic(value: unknown): MusicSettings {
  const record = isRecord(value) ? value : {};
  return {
    enabled: record.enabled === true,
    source:
      record.source === "netease" || record.source === "qq"
        ? record.source
        : "manual",
    playlistId: text(record.playlistId),
    id: text(record.id),
    title: text(record.title),
    artist: text(record.artist),
    album: text(record.album),
    cover: text(record.cover),
    audioUrl: text(record.audioUrl),
  };
}

/**
 * 规范化本地开发服务器的自动刷新设置。
 *
 * @param value - 文件或接口中的未知自动刷新设置。
 * @returns 限定刷新间隔范围的自动刷新配置。
 */
function normalizeAutoRefresh(value: unknown): LocalConfig["autoRefresh"] {
  const record = isRecord(value) ? value : {};
  const interval = Number(record.intervalHours);
  return {
    enabled: record.enabled === true,
    intervalHours:
      interval === 6 || interval === 12 || interval === 24 ? interval : 24,
  };
}

/**
 * 对本地配置文件或导入文件做结构校验；缺失内容保持为空。
 *
 * @param input - 待规范化的部分本地配置。
 * @returns 可供应用运行的完整本地配置。
 */
export function normalizeLocalConfig(
  input: Partial<LocalConfig> | null | undefined,
): LocalConfig {
  const sources = dataSourceIds.reduce(
    (result, sourceId) => {
      result[sourceId] = normalizeSource(input?.sources?.[sourceId]);
      return result;
    },
    {} as LocalConfig["sources"],
  );
  const socialLinks = normalizeSocialLinks(input?.socialLinks);

  return {
    version: 1,
    site: normalizeSiteSettings(input?.site),
    account: normalizeProfile(input?.account),
    socialLinks,
    friends: Array.isArray(input?.friends)
      ? input.friends.flatMap((entry, index) => {
          const friend = normalizeFriendLink(entry, index);
          return friend ? [friend] : [];
        })
      : [],
    sources,
    autoRefresh: normalizeAutoRefresh(input?.autoRefresh),
    music: normalizeMusic(input?.music),
    widgets: normalizeHomeWidgets(input?.widgets, []),
  };
}

/**
 * 深拷贝本地配置，供编辑状态与原始状态隔离使用。
 *
 * @param config - 需要复制的完整本地配置。
 * @returns 与原配置内容相同但引用完全隔离的配置副本。
 */
export function cloneLocalConfig(config: LocalConfig): LocalConfig {
  return JSON.parse(JSON.stringify(config)) as LocalConfig;
}
