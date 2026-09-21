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

/**
 * 创建首页组件目录项，统一描述位置、尺寸和设置类型。
 *
 * @param type - 首页组件类型。
 * @param label - 组件在设置页显示的名称。
 * @param description - 组件功能说明。
 * @param col - 组件默认起始列。
 * @param row - 组件默认起始行。
 * @param colSpan - 组件默认占用的桌面列数。
 * @param rowSpan - 组件默认占用的桌面行数。
 * @param mobileColSpan - 组件在移动端占用的列数。
 * @param mobileRowSpan - 组件在移动端占用的行数。
 * @param options - 组件设置类型、可调整性和默认可见性。
 * @returns 一个完整的首页组件目录项。
 */
function definition(
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
): HomeWidgetDefinition {
  return {
    type,
    label,
    description,
    defaultPosition: { col, row },
    defaultSize: { colSpan, rowSpan, mobileColSpan, mobileRowSpan },
    ...options,
  };
}

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

/**
 * 根据组件类型查找目录定义；未知类型回退到目录首项。
 *
 * @param type - 需要查找的首页组件类型。
 * @returns 对应的组件目录项；找不到时返回默认目录项。
 */
export function widgetDefinition(type: HomeWidgetType): HomeWidgetDefinition {
  return (
    homeWidgetDefinitions.find((item) => item.type === type) ??
    homeWidgetDefinitions[0]
  );
}

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

/**
 * 从旧版链接配置推断平台，保证已有首页卡片自动升级。
 *
 * @param title - 链接标题。
 * @param href - 链接地址。
 * @param icon - 旧配置中的图标，可用于辅助判断 QQ 链接。
 * @returns 推断出的链接平台标识。
 */
export function inferLinkPlatform(
  title: string,
  href: string,
  icon?: IconName,
): LinkPlatform {
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
}

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

/**
 * 创建链接组件的空设置。
 *
 * @returns 可直接用于链接组件的默认设置。
 */
function emptyLinkSettings(): LinkWidgetSettings {
  return {
    title: "",
    subtitle: "",
    href: "",
    platform: "generic",
    icon: "link",
    tone: "blue",
    openInNewTab: true,
  };
}

/**
 * 创建游戏组件的空设置。
 *
 * @returns 可直接用于游戏组件的默认设置。
 */
function emptyGameSettings(): NonNullable<HomeWidgetSettings["game"]> {
  return {
    uid: "",
    game: "hsr",
    account: null,
  };
}

/**
 * 创建友联轮播组件的空设置。
 *
 * @returns 可直接用于友联轮播组件的默认设置。
 */
function emptyFriendSettings(): NonNullable<HomeWidgetSettings["friend"]> {
  return { interval: FRIEND_ROTATION_INTERVAL };
}

/**
 * 根据组件类型创建对应的设置默认值。
 *
 * @param type - 需要初始化设置的首页组件类型。
 * @returns 对应的设置对象；无需额外设置的组件返回 undefined。
 */
function createEmptySettings(
  type: HomeWidgetType,
): HomeWidgetSettings | undefined {
  if (type === "link") return { link: emptyLinkSettings() };
  if (type === "game") return { game: emptyGameSettings() };
  if (type === "friend") return { friend: emptyFriendSettings() };
  return undefined;
}

/**
 * 根据目录定义创建一个可编辑的首页组件实例。
 *
 * @param type - 需要创建的首页组件类型。
 * @param id - 组件实例标识；省略时使用组件类型。
 * @returns 带有默认位置、尺寸和设置的首页组件。
 */
export function createHomeWidget(
  type: HomeWidgetType,
  id: string = type,
): HomeWidget {
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
}

/**
 * 判断未知值是否为首页组件允许的图标名称。
 *
 * @param value - 待判断的未知值。
 * @returns 值属于图标名称集合时返回 true。
 */
function isIconName(value: unknown): value is IconName {
  return typeof value === "string" && widgetIconOptions.includes(value as IconName);
}

/**
 * 判断未知值是否为链接组件允许的平台标识。
 *
 * @param value - 待判断的未知值。
 * @returns 值属于链接平台集合时返回 true。
 */
function isLinkPlatform(value: unknown): value is LinkPlatform {
  return (
    typeof value === "string" &&
    linkPlatformOptions.includes(value as LinkPlatform)
  );
}

/**
 * 判断未知值是否为链接组件允许的主题色。
 *
 * @param value - 待判断的未知值。
 * @returns 值属于链接主题色集合时返回 true。
 */
function isTone(value: unknown): value is LinkWidgetSettings["tone"] {
  return (
    typeof value === "string" &&
    widgetToneOptions.includes(value as LinkWidgetSettings["tone"])
  );
}

/**
 * 判断未知值是否为支持的 HoYoverse 游戏标识。
 *
 * @param value - 待判断的未知值。
 * @returns 值属于支持的游戏标识时返回 true。
 */
function isHoyoGame(value: unknown): value is HoyoGame {
  return value === "genshin" || value === "hsr" || value === "zzz";
}

/**
 * 将未知数字规范化到指定范围，并在失败时使用回退值。
 *
 * @param candidate - 待解析的未知数值。
 * @param fallback - 解析失败时使用的回退值。
 * @param min - 允许的最小值。
 * @param max - 允许的最大值。
 * @returns 四舍五入并限制在范围内的数字。
 */
function numberOr(
  candidate: unknown,
  fallback: number,
  min: number,
  max: number,
): number {
  const parsed = Number(candidate);
  return Number.isFinite(parsed)
    ? Math.min(max, Math.max(min, Math.round(parsed)))
    : fallback;
}

/**
 * 读取字符串配置字段并在类型不匹配时返回回退值。
 *
 * @param candidate - 待读取的未知值。
 * @param fallback - 类型不匹配时使用的回退文本。
 * @returns 规范化后的字符串。
 */
function stringOr(candidate: unknown, fallback: string): string {
  return typeof candidate === "string" ? candidate : fallback;
}

/**
 * 规范化游戏账号摘要，并尽量保留已有快照字段。
 *
 * @param value - 文件或接口中的未知账号数据。
 * @param fallback - 当前已有的账号快照，用于补齐缺失字段。
 * @returns 规范化后的账号摘要；无法识别且没有回退值时返回 undefined。
 */
function normalizeAccount(
  value: unknown,
  fallback?: StarRailAccountData,
): StarRailAccountData | undefined {
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
}

/**
 * 按组件类型规范化链接、游戏和友联轮播设置。
 *
 * @param type - 设置所属的首页组件类型。
 * @param value - 文件或接口中的未知设置值。
 * @param fallback - 当前已有设置，用于保留未覆盖字段。
 * @returns 规范化后的组件设置；无需设置的组件返回 undefined。
 */
function normalizeSettings(
  type: HomeWidgetType,
  value: unknown,
  fallback?: HomeWidgetSettings,
): HomeWidgetSettings | undefined {
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
}

/**
 * 将单个首页组件配置补齐为当前版本的稳定结构。
 *
 * @param value - 文件中的未知组件配置。
 * @param index - 组件在原始数组中的索引，用于生成缺省标识。
 * @param fallbackWidgets - 当前版本的已有组件，用于兼容旧配置字段。
 * @returns 规范化后的组件；无法识别组件类型时返回 null。
 */
export function normalizeHomeWidget(
  value: unknown,
  index: number,
  fallbackWidgets: HomeWidget[] = [],
): HomeWidget | null {
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
}

/**
 * 批量规范化首页组件配置并丢弃无法识别的项。
 *
 * @param input - 文件中的首页组件数组或未知输入。
 * @param fallbackWidgets - 输入不是数组时使用的默认组件列表。
 * @returns 可供首页直接渲染的规范化组件列表。
 */
export function normalizeHomeWidgets(
  input: unknown,
  fallbackWidgets: HomeWidget[] = [],
): HomeWidget[] {
  const values = Array.isArray(input) ? input : fallbackWidgets;
  return values.flatMap((value, index) => {
    const widget = normalizeHomeWidget(value, index, fallbackWidgets);
    return widget ? [widget] : [];
  });
}
