import type { IconName } from "./types";

/**
 * 首页组件体系中的分类标识。
 *
 * 分类只用于「添加组件」目录组织，不参与布局计算；新增分类时只需要
 * 在这里登记，并在 homeWidgets.ts 的组件定义里引用即可。
 */
export type HomeWidgetCategoryId = "basic" | "content" | "media" | "portal";

/** 目录左侧导航使用的分类定义。 */
export interface HomeWidgetCategory {
  id: HomeWidgetCategoryId;
  /** 导航中显示的分类名称。 */
  label: string;
  /** 分类图标，走 IconGlyph 的语义名称。 */
  icon: IconName;
}

/** 首页组件分类表，顺序即目录左侧导航的展示顺序。 */
export const homeWidgetCategories: HomeWidgetCategory[] = [
  {
    id: "basic",
    label: "基础",
    icon: "sparkles",
  },
  {
    id: "content",
    label: "内容",
    icon: "rss",
  },
  {
    id: "media",
    label: "媒体",
    icon: "headphones",
  },
  {
    id: "portal",
    label: "入口",
    icon: "globe",
  },
];

/**
 * 按标识查找分类定义。
 *
 * @param id - 分类标识。
 * @returns 对应的分类；找不到时回退到第一个分类。
 */
export function widgetCategory(id: HomeWidgetCategoryId): HomeWidgetCategory {
  return homeWidgetCategories.find((item) => item.id === id) ?? homeWidgetCategories[0];
}
