import { createHomeWidget } from "../data/homeWidgets";
import { normalizeHref, type WidgetVariant } from "../data/widgetVariants";
import type {
  HomeBangumiStats,
  HomeNeteaseStats,
  HomeWidget,
  HomeWidgetType,
  LinkWidgetSettings,
  LocalConfig,
  SiteData,
} from "../data/types";

/** 组装首页组件 props 所需的页面上下文。 */
export interface HomeWidgetPropsContext {
  siteData: SiteData;
  localConfig?: LocalConfig | null;
  /** 音乐组件是否处于可编辑状态。 */
  editable?: boolean;
  /** 游戏组件是否允许交互（点击、切换游戏）。 */
  interactive?: boolean;
}

/**
 * 将统一组件配置映射为具体首页组件所需的 props。
 *
 * 首页网格按用户数据渲染组件；「添加组件」弹窗改用同文件的
 * `homeWidgetPreviewProps`，只传空数据让组件落到默认空态。新增组件
 * 类型时两处 switch 都要补上。
 *
 * @param widget - 当前要渲染的首页组件配置。
 * @param context - 页面数据与交互上下文。
 * @returns 传给具体 Vue 组件的属性对象。
 */
export function homeWidgetProps(
  widget: HomeWidget,
  context: HomeWidgetPropsContext,
): Record<string, unknown> {
  const { siteData, localConfig, editable, interactive } = context;
  switch (widget.type) {
    case "feed":
      return { repositories: siteData.repositories };
    case "collection":
      return { stats: siteData.homeMedia.bangumi };
    case "activities":
      return { activities: siteData.activities };
    case "friend":
      return {
        friends: siteData.friends,
        interval: widget.settings?.friend?.interval,
      };
    case "agent":
      return { profile: siteData.profile };
    case "media":
      return { stats: siteData.homeMedia.netease };
    case "game":
      return {
        settings: widget.settings?.game,
        interactive: interactive ?? true,
      };
    case "music":
      return {
        track: siteData.music,
        catalog: siteData.musicCatalog,
        editable: editable ?? false,
      };
    case "link":
      return {
        settings:
          widget.settings?.link ?? createHomeWidget("link").settings?.link,
      };
    case "github":
      return {
        repositories: siteData.repositories,
        sort:
          localConfig?.sources.github.content.githubRepositorySort ?? "updated",
      };
    case "bilibili":
      return {
        videos: siteData.libraryTiles.filter(
          (tile) =>
            tile.id.startsWith("bilibili-") ||
            tile.subtitle.toLocaleLowerCase().includes("bilibili"),
        ),
      };
    default:
      return {};
  }
}

/** 链接组件未做任何设置时的默认值，预览直接复用，渲染出「暂无链接」空态。 */
const EMPTY_LINK_SETTINGS: LinkWidgetSettings = {
  title: "",
  subtitle: "",
  href: "",
  platform: "generic",
  icon: "link",
  tone: "violet",
  openInNewTab: true,
};

/**
 * 构造空的 Bangumi 统计。
 *
 * @returns 计数全为 0、没有条目的统计对象。
 */
function emptyBangumiStats(): HomeBangumiStats {
  return {
    total: 0,
    statusCounts: { done: 0, doing: 0, wish: 0 },
    typeCounts: {},
    tasteProfile: "",
    items: [],
  };
}

/**
 * 构造空的网易云统计。
 *
 * @returns 计数全为 0、没有条目的统计对象。
 */
function emptyNeteaseStats(): HomeNeteaseStats {
  return {
    followerCount: 0,
    playlistCount: 0,
    level: 0,
    moodKeywords: [],
    items: [],
  };
}

/**
 * 生成预览用的设置项：变体预设 + 用户正在填的值。
 *
 * 只有跳转按钮和游戏资料带设置，其余组件没有可配的东西。
 *
 * @param type - 组件类型。
 * @param variant - 当前变体。
 * @param values - 用户正在填写的字段值。
 * @returns 该类型的新组件设置；没有可配项时返回 undefined。
 */
function previewSettings(
  type: HomeWidgetType,
  variant: WidgetVariant | undefined,
  values: Record<string, string>,
): HomeWidget["settings"] | undefined {
  if (type === "link") {
    return {
      link: {
        ...EMPTY_LINK_SETTINGS,
        ...variant?.link,
        // 名称跟着输入走；还没填时先给变体预设的名字，预览别落在空卡上。
        title: (values.title ?? "").trim() || variant?.link?.title || "链接",
        // 地址不参与外观，但空地址会让卡片退成"暂无链接"，所以补一个占位。
        // 画布是 inert 的，点不动，也不会真的跳走。
        href: normalizeHref(values.href ?? "") || "#",
      },
    };
  }
  if (type === "game") {
    return {
      game: {
        uid: (values.uid ?? "").trim(),
        game: variant?.game ?? "hsr",
        account: null,
      },
    };
  }
  return undefined;
}

/**
 * 生成「添加组件」目录预览用的默认 props。
 *
 * 预览的原则是**它就是那张卡**，所以拿到页面数据时走的是同一条
 * `homeWidgetProps` 通路：首页已经读到的仓库、追番、歌单、友链、个人资料
 * 原样带进来，卡片因此是"装到首页的样子"，而不是一张空壳。
 * 从前这里把数据一律置空，结果所有数据型组件都停在空态——预览里看是
 * 一整块空白毛玻璃，用户以为组件坏了。
 *
 * 变体（平台 / 游戏）带进各自的预设，详情页还会把正在填的值一起传进来，
 * 于是改一个字，画布上的那张卡就变一个字。
 *
 * @param type - 需要预览的组件类型。
 * @param variant - 该卡片对应的变体；省略时按类型默认值渲染。
 * @param values - 用户正在填写的字段值；省略时按变体预设渲染。
 * @param context - 页面数据；省略时退回空态（目录脱离页面单独渲染时）。
 * @returns 传给具体组件实例的属性对象。
 */
export function homeWidgetPreviewProps(
  type: HomeWidgetType,
  variant?: WidgetVariant,
  values: Record<string, string> = {},
  context?: HomeWidgetPropsContext,
): Record<string, unknown> {
  // 天气靠浏览器定位自取数据，预览只让它画空壳，不发请求。
  if (type === "weather") return { preview: true };

  const settings = previewSettings(type, variant, values);
  if (context) {
    const widget = createHomeWidget(type);
    if (settings) widget.settings = { ...widget.settings, ...settings };
    const props = homeWidgetProps(widget, {
      ...context,
      editable: false,
      interactive: false,
    });
    // 音乐卡要看到真实封面与曲名，但不能订阅全局播放器——
    // 否则预览会跟着用户在别处点的歌一起变。
    if (type === "music") return { ...props, preview: true };
    return props;
  }

  switch (type) {
    case "feed":
    case "github":
      return { repositories: [] };
    case "collection":
      return { stats: emptyBangumiStats() };
    case "media":
      return { stats: emptyNeteaseStats() };
    case "friend":
      return { friends: [] };
    case "agent":
      return { profile: { name: "", latinName: "", motto: "", avatar: "" } };
    case "game":
      return { settings: settings?.game, interactive: false };
    case "link":
      return { settings: settings?.link };
    case "activities":
      return { activities: [] };
    case "bilibili":
      return { videos: [] };
    case "music":
      return { track: undefined, editable: false, preview: true };
    default:
      return {};
  }
}
