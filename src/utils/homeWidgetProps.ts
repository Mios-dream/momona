import { createHomeWidget } from "../data/homeWidgets";
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
 * 生成「添加组件」目录预览用的默认 props。
 *
 * 预览展示的是组件未绑定数据、未做设置时的默认样子：数据源一律传空，
 * 设置一律传默认值，组件自然落到自己的空态。这样目录里既能看清组件
 * 的真实版式和配色，又不会读取用户数据、不会发请求、不会起轮播定时器。
 *
 * @param type - 需要预览的组件类型。
 * @returns 只包含空数据与默认值的属性对象。
 */
export function homeWidgetPreviewProps(
  type: HomeWidgetType,
): Record<string, unknown> {
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
    case "weather":
      // 天气组件会自己请求数据，预览模式只渲染默认空态。
      return { preview: true };
    case "game":
      return { interactive: false };
    case "link":
      return { settings: EMPTY_LINK_SETTINGS };
    case "activities":
      return { activities: [] };
    case "bilibili":
      return { videos: [] };
    case "music":
      // 同样不订阅全局播放器状态，避免把正在播放的歌带进预览。
      return { track: undefined, editable: false, preview: true };
    default:
      return {};
  }
}
