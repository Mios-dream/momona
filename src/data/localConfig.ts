import {
  createHomeWidget,
  normalizeHomeWidgets,
  widgetIconOptions,
  widgetToneOptions,
} from "./homeWidgets";
import { normalizeFriendLink } from "./friends";
import type {
  DataSourceId,
  HomeWidget,
  IconName,
  LibraryFilter,
  LinkWidgetSettings,
  LocalConfig,
  MusicSettings,
  SiteProfile,
  SocialLink,
  SourceConfig,
  SourceContentConfig,
} from "./types";

const sourceIds: DataSourceId[] = [
  "bangumi",
  "bilibili",
  "github",
  "netease",
  "qqmusic",
  "steam",
  "sfacg",
];

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const text = (value: unknown): string =>
  typeof value === "string" ? value.trim() : "";

const isIconName = (value: unknown): value is IconName =>
  typeof value === "string" && widgetIconOptions.includes(value as IconName);

const isSocialTone = (value: unknown): value is SocialLink["tone"] =>
  typeof value === "string" &&
  (widgetToneOptions as readonly string[]).includes(value);

const defaultProfile = (): SiteProfile => ({
  name: "三三 sama",
  latinName: "@miosdream",
  motto: "「世界中のすべての素晴らしいために戦う！」",
  avatar: "/assets/avatar.jpg",
});

const emptyMusic = (): MusicSettings => ({
  enabled: false,
  source: "manual",
  playlistId: "",
  id: "",
  title: "",
  artist: "",
  album: "",
  cover: "",
  audioUrl: "",
});

const emptyContent = (): SourceContentConfig => ({
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
});

const emptySource = (): SourceConfig => ({
  enabled: false,
  username: "",
  userId: "",
  token: "",
  endpoint: "",
  limit: 24,
  content: emptyContent(),
});

const emptyAutoRefresh = (): LocalConfig["autoRefresh"] => ({
  enabled: false,
  intervalHours: 24,
});

const defaultLinkWidget = (
  id: string,
  col: number,
  row: number,
  link: LinkWidgetSettings,
): HomeWidget => ({
  ...createHomeWidget("link", id),
  visible: true,
  col,
  row,
  colSpan: 1,
  rowSpan: 1,
  mobileColSpan: 1,
  mobileRowSpan: 1,
  settings: { link },
});

/** 首次启动时展示的首页布局；内容数据仍保持为空，方便用户继续编辑。 */
const defaultHomeWidgets = (): HomeWidget[] => [
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

/** 创建首次启动用的本地配置；数据来源和内容为空，身份与首页布局提供默认值。 */
export const createEmptyLocalConfig = (): LocalConfig => ({
  version: 1,
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
  manualItems: [],
  music: emptyMusic(),
  widgets: defaultHomeWidgets(),
});

const normalizeProfile = (value: unknown): SiteProfile => {
  const record = isRecord(value) ? value : {};
  return {
    name: text(record.name),
    latinName: text(record.latinName),
    motto: text(record.motto),
    avatar: text(record.avatar),
  };
};

const normalizeSocialLinks = (value: unknown): SocialLink[] => {
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
};

const normalizeSource = (value: unknown): SourceConfig => {
  const record = isRecord(value) ? value : {};
  const rawContent = isRecord(record.content) ? record.content : {};
  const boolean = (
    key: Exclude<
      keyof SourceContentConfig,
      "githubRepositoryScope" | "githubRepositorySort"
    >,
  ): boolean =>
    typeof rawContent[key] === "boolean" ? rawContent[key] : false;
  const parsedLimit = Number(record.limit);

  return {
    enabled: record.enabled === true,
    username: text(record.username),
    userId: text(record.userId),
    token: text(record.token),
    endpoint: text(record.endpoint),
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
};

const normalizeMusic = (value: unknown): MusicSettings => {
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
};

const normalizeAutoRefresh = (value: unknown): LocalConfig["autoRefresh"] => {
  const record = isRecord(value) ? value : {};
  const interval = Number(record.intervalHours);
  return {
    enabled: record.enabled === true,
    intervalHours:
      interval === 6 || interval === 12 || interval === 24 ? interval : 24,
  };
};

const libraryFilters: LibraryFilter[] = [
  "all",
  "game",
  "video",
  "music",
  "anime",
  "book",
];

const normalizeManualItems = (value: unknown): LocalConfig["manualItems"] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry, index) => {
    if (!isRecord(entry)) return [];
    const title = text(entry.title);
    const type = text(entry.type) as LibraryFilter;
    if (!title || !libraryFilters.includes(type)) return [];
    return [
      {
        id: text(entry.id) || `manual-${index}`,
        title,
        type,
        subtitle: text(entry.subtitle),
        cover: text(entry.cover),
        url: text(entry.url),
      },
    ];
  });
};

/** 对本地配置文件或导入文件做结构校验；缺失内容保持为空。 */
export const normalizeLocalConfig = (
  input: Partial<LocalConfig> | null | undefined,
): LocalConfig => {
  const sources = sourceIds.reduce(
    (result, sourceId) => {
      result[sourceId] = normalizeSource(input?.sources?.[sourceId]);
      return result;
    },
    {} as LocalConfig["sources"],
  );
  const socialLinks = normalizeSocialLinks(input?.socialLinks);

  return {
    version: 1,
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
    manualItems: normalizeManualItems(input?.manualItems),
    music: normalizeMusic(input?.music),
    widgets: normalizeHomeWidgets(input?.widgets, []),
  };
};

export const cloneLocalConfig = (config: LocalConfig): LocalConfig =>
  JSON.parse(JSON.stringify(config)) as LocalConfig;
