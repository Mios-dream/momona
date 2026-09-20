import type {
  HomeWidget,
  HomeWidgetSettings,
  HomeWidgetType,
  IconName,
  LinkPlatform,
  LinkWidgetSettings,
  HoyoGame,
  StarRailAccountData,
} from "./types";

export const HOME_GRID_COLUMNS = 16;
export const HOME_GRID_ROWS = 4;

export interface HomeWidgetDefinition {
  type: HomeWidgetType;
  label: string;
  description: string;
  defaultPosition: { col: number; row: number };
  defaultSize: {
    colSpan: number;
    rowSpan: number;
    mobileColSpan: number;
    mobileRowSpan: number;
  };
  settingsKind?: "link" | "game";
  /** 只有需要适配不同内容长度的组件才开放尺寸调整。 */
  resizable?: boolean;
  defaultVisible: boolean;
}

const definition = (
  type: HomeWidgetType,
  label: string,
  description: string,
  col: number,
  row: number,
  colSpan: number,
  rowSpan: number,
  mobileColSpan: number,
  mobileRowSpan: number,
  options: Pick<
    HomeWidgetDefinition,
    "settingsKind" | "resizable" | "defaultVisible"
  > = {
    defaultVisible: true,
  },
): HomeWidgetDefinition => ({
  type,
  label,
  description,
  defaultPosition: { col, row },
  defaultSize: { colSpan, rowSpan, mobileColSpan, mobileRowSpan },
  ...options,
});

/** 首页组件目录。新增组件只需要先在这里登记，再接入 HomePage 的组件映射。 */
export const homeWidgetDefinitions: HomeWidgetDefinition[] = [
  definition("greeting", "问候", "时间与问候语", 1, 1, 2, 2, 1, 1),
  definition("feed", "动态摘要", "轮播式内容摘要", 5, 1, 4, 2, 2, 1),
  definition(
    "collection",
    "收藏统计",
    "最近收藏的封面与统计",
    9,
    1,
    4,
    2,
    2,
    1,
  ),
  definition("friend", "友链", "一个外部站点入口", 13, 1, 2, 2, 1, 1),
  definition("agent", "Agent 人设", "角色与人设展示", 15, 1, 2, 2, 1, 1),
  definition("weather", "天气", "当前天气摘要", 1, 3, 2, 2, 2, 1),
  definition("media", "媒体收藏", "最近播放与收藏", 3, 3, 4, 2, 2, 1),
  definition(
    "game",
    "游戏资料",
    "HoYoverse 游戏账号资料，可绑定 UID",
    7,
    3,
    4,
    2,
    2,
    1,
    { settingsKind: "game", defaultVisible: true },
  ),
  definition("music", "正在播放", "音乐播放状态", 11, 3, 2, 2, 1, 1),
  definition(
    "activities",
    "最近活动",
    "来自全局数据的活动摘要",
    13,
    3,
    4,
    2,
    2,
    1,
  ),
  definition(
    "link",
    "跳转按钮",
    "可自定义图标、标题和地址的通用入口",
    1,
    1,
    2,
    2,
    1,
    1,
    { settingsKind: "link", resizable: true, defaultVisible: false },
  ),
  definition(
    "github",
    "GitHub 活动",
    "直接读取全局 GitHub 仓库数据",
    1,
    1,
    4,
    2,
    2,
    1,
    { defaultVisible: true },
  ),
  definition(
    "bilibili",
    "Bilibili 视频",
    "直接读取全局 Bilibili 视频数据",
    1,
    1,
    4,
    2,
    2,
    1,
    { defaultVisible: false },
  ),
];

export const widgetDefinition = (type: HomeWidgetType): HomeWidgetDefinition =>
  homeWidgetDefinitions.find((item) => item.type === type) ??
  homeWidgetDefinitions[0];

export const widgetIconOptions: IconName[] = [
  "external",
  "link",
  "github",
  "game",
  "video",
  "music",
  "mail",
  "at",
  "user",
  "globe",
  "star",
  "sparkles",
  "messageCircle",
  "messagesSquare",
  "send",
  "camera",
  "code2",
  "cloud",
  "headphones",
  "radio",
  "bot",
  "palette",
  "shoppingBag",
  "mapPin",
  "circleUser",
  "disc3",
];

export const linkPlatformOptions: LinkPlatform[] = [
  "generic",
  "qq",
  "github",
  "email",
  "steam",
  "blog",
  "bilibili",
  "netease",
  "qqmusic",
  "youtube",
  "x",
  "discord",
  "telegram",
];

/** 从旧版链接配置推断平台，保证已有首页卡片自动升级。 */
export const inferLinkPlatform = (
  title: string,
  href: string,
  icon?: IconName,
): LinkPlatform => {
  const value = `${title} ${href}`.toLocaleLowerCase();
  if (value.includes("github")) return "github";
  if (value.includes("bilibili") || value.includes("哔哩")) return "bilibili";
  if (value.includes("netease") || value.includes("163.com") || value.includes("网易云")) {
    return "netease";
  }
  if (value.includes("qqmusic") || value.includes("y.qq.com") || value.includes("qq音乐")) {
    return "qqmusic";
  }
  if (value.startsWith("mailto:") || value.includes("email") || value.includes("邮箱")) {
    return "email";
  }
  if (value.includes("steam")) return "steam";
  if (value.includes("youtube")) return "youtube";
  if (value.includes("discord")) return "discord";
  if (value.includes("telegram")) return "telegram";
  if (value.includes("twitter") || value.includes("x.com")) return "x";
  if (value.includes("blog") || value.includes("博客")) return "blog";
  if (value.includes("qq") || icon === "user") return "qq";
  return "generic";
};

export const widgetToneOptions: LinkWidgetSettings["tone"][] = [
  "blue",
  "indigo",
  "ink",
  "violet",
];

export const friendIntervalOptions = [
  { value: 2500, label: "2.5 秒" },
  { value: 4000, label: "4 秒" },
  { value: 6000, label: "6 秒" },
  { value: 9000, label: "9 秒" },
  { value: 12000, label: "12 秒" },
] as const;

export const FRIEND_ROTATION_INTERVAL = 6000;

const emptyLinkSettings = (): LinkWidgetSettings => ({
  title: "",
  subtitle: "",
  href: "",
  platform: "generic",
  icon: "link",
  tone: "blue",
  openInNewTab: true,
});

const emptyGameSettings = (): NonNullable<HomeWidgetSettings["game"]> => ({
  uid: "",
  game: "hsr",
  account: null,
});

const emptyFriendSettings = (): NonNullable<HomeWidgetSettings["friend"]> => ({
  interval: FRIEND_ROTATION_INTERVAL,
});

const createEmptySettings = (
  type: HomeWidgetType,
): HomeWidgetSettings | undefined => {
  if (type === "link") return { link: emptyLinkSettings() };
  if (type === "game") return { game: emptyGameSettings() };
  if (type === "friend") return { friend: emptyFriendSettings() };
  return undefined;
};

export const createHomeWidget = (
  type: HomeWidgetType,
  id: string = type,
): HomeWidget => {
  const item = widgetDefinition(type);
  return {
    id,
    type: item.type,
    label: item.label,
    visible: item.defaultVisible,
    col: item.defaultPosition.col,
    row: item.defaultPosition.row,
    ...item.defaultSize,
    settings: createEmptySettings(item.type),
  };
};

const isIconName = (value: unknown): value is IconName =>
  typeof value === "string" && widgetIconOptions.includes(value as IconName);

const isLinkPlatform = (value: unknown): value is LinkPlatform =>
  typeof value === "string" &&
  linkPlatformOptions.includes(value as LinkPlatform);

const isTone = (value: unknown): value is LinkWidgetSettings["tone"] =>
  typeof value === "string" &&
  widgetToneOptions.includes(value as LinkWidgetSettings["tone"]);

const isHoyoGame = (value: unknown): value is HoyoGame =>
  value === "genshin" || value === "hsr" || value === "zzz";

const numberOr = (
  candidate: unknown,
  fallback: number,
  min: number,
  max: number,
): number => {
  const parsed = Number(candidate);
  return Number.isFinite(parsed)
    ? Math.min(max, Math.max(min, Math.round(parsed)))
    : fallback;
};

const stringOr = (candidate: unknown, fallback: string): string =>
  typeof candidate === "string" ? candidate : fallback;

const normalizeAccount = (
  value: unknown,
  fallback?: StarRailAccountData,
): StarRailAccountData | undefined => {
  if (!value || typeof value !== "object") return fallback;
  const record = value as Partial<StarRailAccountData>;
  const uid = stringOr(record.uid, fallback?.uid ?? "");
  if (!uid) return fallback;
  return {
    uid,
    nickname: stringOr(record.nickname, fallback?.nickname ?? ""),
    level: numberOr(record.level, fallback?.level ?? 0, 0, 80),
    worldLevel: numberOr(record.worldLevel, fallback?.worldLevel ?? 0, 0, 8),
    achievements: numberOr(
      record.achievements,
      fallback?.achievements ?? 0,
      0,
      9999,
    ),
    characters: numberOr(record.characters, fallback?.characters ?? 0, 0, 999),
    avatar: stringOr(record.avatar, fallback?.avatar ?? "") || undefined,
    game: isHoyoGame(record.game) ? record.game : fallback?.game,
    signature:
      stringOr(record.signature, fallback?.signature ?? "") || undefined,
    score:
      record.score && typeof record.score === "object"
        ? {
            label: stringOr(
              (record.score as { label?: unknown }).label,
              fallback?.score?.label ?? "",
            ),
            value: stringOr(
              (record.score as { value?: unknown }).value,
              fallback?.score?.value ?? String(fallback?.level ?? 0),
            ),
          }
        : fallback?.score,
    presence: fallback?.presence,
    highlights: Array.isArray(record.highlights)
      ? record.highlights.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const value = item as { label?: unknown; value?: unknown };
          const label = stringOr(value.label, "");
          const itemValue = stringOr(value.value, "");
          if (!label && !itemValue) return [];
          return [
            {
              label,
              value: itemValue,
            },
          ];
        })
      : fallback?.highlights,
    showcase: Array.isArray(record.showcase)
      ? record.showcase.flatMap((item) => {
          if (!item || typeof item !== "object") return [];
          const value = item as unknown as Record<string, unknown>;
          const name = stringOr(value.name, "");
          if (!name) return [];
          return [
            {
              name,
              level: Number.isFinite(Number(value.level))
                ? Number(value.level)
                : undefined,
              icon: stringOr(value.icon, "") || undefined,
              art: stringOr(value.art, "") || undefined,
              rarity: Number.isFinite(Number(value.rarity))
                ? Number(value.rarity)
                : undefined,
            },
          ];
        })
      : fallback?.showcase,
    profileUrl:
      stringOr(record.profileUrl, fallback?.profileUrl ?? "") || undefined,
    degraded:
      typeof record.degraded === "boolean"
        ? record.degraded
        : fallback?.degraded,
    degradeReason:
      stringOr(record.degradeReason, fallback?.degradeReason ?? "") ||
      undefined,
    updatedAt:
      stringOr(record.updatedAt, fallback?.updatedAt ?? "") || undefined,
  };
};

const normalizeSettings = (
  type: HomeWidgetType,
  value: unknown,
  fallback?: HomeWidgetSettings,
): HomeWidgetSettings | undefined => {
  const record =
    value && typeof value === "object"
      ? (value as Record<string, unknown>)
      : {};
  if (type === "link") {
    const raw =
      record.link && typeof record.link === "object"
        ? (record.link as Partial<LinkWidgetSettings>)
        : {};
    const fallbackValue = fallback?.link ?? emptyLinkSettings();
    return {
      link: {
        title: stringOr(raw.title, fallbackValue.title),
        subtitle: stringOr(raw.subtitle, fallbackValue.subtitle),
        href: stringOr(raw.href, fallbackValue.href),
        platform: isLinkPlatform(raw.platform)
          ? raw.platform
          : inferLinkPlatform(
              stringOr(raw.title, fallbackValue.title),
              stringOr(raw.href, fallbackValue.href),
              isIconName(raw.icon) ? raw.icon : fallbackValue.icon,
            ),
        icon: isIconName(raw.icon) ? raw.icon : fallbackValue.icon,
        tone: isTone(raw.tone) ? raw.tone : fallbackValue.tone,
        openInNewTab:
          typeof raw.openInNewTab === "boolean"
            ? raw.openInNewTab
            : fallbackValue.openInNewTab,
      },
    };
  }
  if (type === "game") {
    const raw =
      record.game && typeof record.game === "object"
        ? (record.game as Record<string, unknown>)
        : {};
    const fallbackValue = fallback?.game ?? emptyGameSettings();
    const uid = stringOr(raw.uid, fallbackValue.uid);
    const account =
      raw.account === null
        ? null
        : normalizeAccount(raw.account, fallbackValue.account ?? undefined);
    return {
      game: {
        uid,
        game: isHoyoGame(raw.game) ? raw.game : (fallbackValue.game ?? "hsr"),
        account,
      },
    };
  }
  if (type === "friend") {
    const raw =
      record.friend && typeof record.friend === "object"
        ? (record.friend as Record<string, unknown>)
        : {};
    const fallbackValue = fallback?.friend ?? emptyFriendSettings();
    return {
      friend: {
        interval: numberOr(raw.interval, fallbackValue.interval, 2000, 30000),
      },
    };
  }
  return undefined;
};

/** 将文件中的首页组件配置补成当前版本的结构。 */
export const normalizeHomeWidget = (
  value: unknown,
  index: number,
  fallbackWidgets: HomeWidget[] = [],
): HomeWidget | null => {
  const record =
    value && typeof value === "object" ? (value as Partial<HomeWidget>) : {};
  const fallback =
    fallbackWidgets.find((item) => item.id === record.id) ??
    fallbackWidgets.find((item) => item.type === record.type);
  const type = homeWidgetDefinitions.some((item) => item.type === record.type)
    ? (record.type as HomeWidgetType)
    : fallback?.type;
  if (!type) return null;
  const fallbackWidget =
    fallback ??
    createHomeWidget(
      type,
      typeof record.id === "string" && record.id
        ? record.id
        : `${type}-${index + 1}`,
    );
  const item = widgetDefinition(type);
  const colSpan = numberOr(
    item.resizable ? record.colSpan : item.defaultSize.colSpan,
    item.resizable
      ? (fallbackWidget.colSpan ?? item.defaultSize.colSpan)
      : item.defaultSize.colSpan,
    1,
    HOME_GRID_COLUMNS,
  );
  const rowSpan = numberOr(
    item.resizable ? record.rowSpan : item.defaultSize.rowSpan,
    item.resizable
      ? (fallbackWidget.rowSpan ?? item.defaultSize.rowSpan)
      : item.defaultSize.rowSpan,
    1,
    8,
  );
  const mobileColSpan = numberOr(
    item.resizable ? record.mobileColSpan : item.defaultSize.mobileColSpan,
    item.resizable
      ? fallbackWidget.mobileColSpan
      : item.defaultSize.mobileColSpan,
    1,
    2,
  );
  const mobileRowSpan = numberOr(
    item.resizable ? record.mobileRowSpan : item.defaultSize.mobileRowSpan,
    item.resizable
      ? fallbackWidget.mobileRowSpan
      : item.defaultSize.mobileRowSpan,
    1,
    6,
  );
  return {
    ...fallbackWidget,
    ...record,
    id: stringOr(record.id, fallbackWidget.id),
    type,
    label: item.label,
    visible:
      typeof record.visible === "boolean"
        ? record.visible
        : fallbackWidget.visible,
    col: numberOr(record.col, fallbackWidget.col, 1, HOME_GRID_COLUMNS),
    row: numberOr(record.row, fallbackWidget.row, 1, 12),
    colSpan,
    rowSpan,
    mobileColSpan,
    mobileRowSpan,
    settings: normalizeSettings(type, record.settings, fallbackWidget.settings),
  };
};

export const normalizeHomeWidgets = (
  input: unknown,
  fallbackWidgets: HomeWidget[] = [],
): HomeWidget[] => {
  const values = Array.isArray(input) ? input : fallbackWidgets;
  return values.flatMap((value, index) => {
    const widget = normalizeHomeWidget(value, index, fallbackWidgets);
    return widget ? [widget] : [];
  });
};
