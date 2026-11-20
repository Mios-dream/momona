import type {
  HomeWidgetType,
  HoyoGame,
  IconName,
  LinkPlatform,
  LinkWidgetSettings,
} from "./types";

/**
 * 「同类组件的不同变体」。
 *
 * 一个类型可以铺成好几张目录卡：跳转按钮按平台铺开，游戏资料按游戏铺开。
 * 这样"选什么"发生在添加之前，而不是添加之后再打开一个详情页去调——
 * 详情页被取消之后，平台的图标、色调、名称都由变体自己带进来，
 * 用户只剩一个必填字段（地址或 UID）要在添加时填一次。
 */

/** 变体要求用户补填的字段。 */
export type VariantField = "title" | "href" | "uid";

/** 补填字段的渲染规格。 */
export interface VariantFieldSpec {
  key: VariantField;
  label: string;
  placeholder: string;
  /** 移动端键盘类型。 */
  inputMode: "text" | "url" | "numeric";
  maxLength: number;
}

/** 目录里的一张变体卡。 */
export interface WidgetVariant {
  /** 目录内的唯一键，也是新组件 id 的前缀。 */
  id: string;
  type: HomeWidgetType;
  /** 卡片标题，同时是跳转按钮落到首页时的名称。 */
  label: string;
  /** 添加前必须补填的字段；省略表示直接加入。 */
  fields?: VariantField[];
  /** 跳转按钮的预设：平台、图标、色调与标题。 */
  link?: Pick<LinkWidgetSettings, "platform" | "icon" | "tone" | "title">;
  /** 游戏资料属于哪一款游戏。 */
  game?: HoyoGame;
}

/** 补填字段的文案表；目录卡片按 key 取用，不各自写一遍。 */
export const variantFieldSpecs: Record<VariantField, VariantFieldSpec> = {
  title: {
    key: "title",
    label: "名称",
    placeholder: "显示在卡片上",
    inputMode: "text",
    maxLength: 24,
  },
  href: {
    key: "href",
    label: "地址",
    placeholder: "https://",
    inputMode: "url",
    maxLength: 300,
  },
  uid: {
    key: "uid",
    label: "UID",
    placeholder: "6-12 位数字",
    inputMode: "numeric",
    maxLength: 12,
  },
};

/** 三款 HoYoverse 游戏的中文名，目录卡片与提示文案共用。 */
export const hoyoGameLabels: Record<HoyoGame, string> = {
  genshin: "原神",
  hsr: "星穹铁道",
  zzz: "绝区零",
};

/**
 * 生成一个跳转按钮变体。
 *
 * @param platform - 平台标识，决定品牌图标与色调。
 * @param label - 目录卡片标题，也是卡片上的名称。
 * @param icon - 非品牌平台使用的语义图标。
 * @param tone - 卡片色调。
 * @param fields - 添加前要补填的字段。
 * @returns 目录可直接渲染的变体。
 */
function linkVariant(
  platform: LinkPlatform,
  label: string,
  icon: IconName,
  tone: LinkWidgetSettings["tone"],
  fields: VariantField[] = ["href"],
  title: string = label,
): WidgetVariant {
  return {
    id: `link-${platform}`,
    type: "link",
    label,
    fields,
    link: { platform, icon, tone, title },
  };
}

/** 跳转按钮的全部变体：一个平台一张卡，自定义链接还要求填名称。 */
export const linkVariants: WidgetVariant[] = [
  // 自定义链接的预设名只用于目录预览，真正落地时用用户填的名字。
  linkVariant("generic", "自定义链接", "link", "blue", ["title", "href"], "链接"),
  linkVariant("qq", "QQ", "user", "blue"),
  linkVariant("github", "GitHub", "github", "ink"),
  linkVariant("email", "Email", "mail", "indigo"),
  linkVariant("bilibili", "Bilibili", "video", "blue"),
  linkVariant("netease", "网易云音乐", "music", "violet"),
  linkVariant("qqmusic", "QQ 音乐", "disc3", "violet"),
  linkVariant("steam", "Steam", "game", "ink"),
  linkVariant("youtube", "YouTube", "video", "blue"),
  linkVariant("x", "X", "at", "ink"),
  linkVariant("discord", "Discord", "messagesSquare", "indigo"),
  linkVariant("telegram", "Telegram", "send", "blue"),
  linkVariant("blog", "博客", "globe", "blue"),
];

/** 游戏资料的全部变体：一款游戏一张卡，只要求填 UID。 */
export const gameVariants: WidgetVariant[] = (
  ["genshin", "hsr", "zzz"] as HoyoGame[]
).map((game) => ({
  id: `game-${game}`,
  type: "game",
  label: hoyoGameLabels[game],
  fields: ["uid"],
  game,
}));

/**
 * 读取某个类型的全部变体。
 *
 * 没有拆变体的类型也返回一条（id 与类型同名），目录因此只有一种数据形状，
 * 不需要为「单实例组件」单独写一套渲染分支。
 *
 * @param type - 首页组件类型。
 * @param label - 该类型的目录名称，用作默认变体的标题。
 * @returns 至少一条变体。
 */
export function widgetVariants(
  type: HomeWidgetType,
  label: string,
): WidgetVariant[] {
  if (type === "link") return linkVariants;
  if (type === "game") return gameVariants;
  return [{ id: type, type, label }];
}

/**
 * 把用户输入的地址补成可直接打开的形式。
 *
 * 用户很少会自己写 `https://`，但少了协议头 `href` 会被当成相对路径，
 * 点下去是 404；协议类地址（mailto:、tel:）和站内路径原样保留。
 *
 * @param value - 用户输入的地址。
 * @returns 补全协议头后的地址；空串表示尚未填写。
 */
export function normalizeHref(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^(https?:|mailto:|tel:|\/|#)/i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

/**
 * 判断字段值是否可以提交。
 *
 * @param field - 字段标识。
 * @param value - 用户输入。
 * @returns 通过校验时返回 true。
 */
export function variantFieldValid(field: VariantField, value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (field === "uid") return /^\d{6,12}$/.test(trimmed);
  if (field === "href") return normalizeHref(trimmed).length > 3;
  return trimmed.length <= 24;
}
