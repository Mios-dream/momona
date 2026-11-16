import {
  homeWidgetDefinitions,
  type HomeWidgetDefinition,
} from "../data/homeWidgets";
import {
  widgetCategory,
  type HomeWidgetCategory,
  type HomeWidgetCategoryId,
} from "../data/homeWidgetCategories";
import type { HomeWidget, HomeWidgetType } from "../data/types";

/**
 * 「添加组件」目录的共享模型。
 *
 * 目录卡片、尺寸标签、状态文案和等比预览比例全部从这里派生，
 * HomeWidgetCatalog 只负责渲染，不再各自计算，避免同一组件在两处
 * 得到不一样的尺寸或状态。
 */

/** 预览画布的逻辑单元：与桌面 16 列网格在 1280px 宽下的实际格子对齐。 */
export const CATALOG_PREVIEW_CELL = 80;

/** 预览画布高度（像素），所有卡片共用，保证同一行卡片基线一致。 */
export const CATALOG_STAGE_HEIGHT = 148;

/** 预览内层与画布边缘的留白，让组件像浮在画布上而不是贴边截图。 */
export const CATALOG_STAGE_PADDING = 10;

/** 卡片内边距总和（左右各 10px），用于从卡片宽度反推画布可用宽度。 */
export const CATALOG_CARD_INSET = 20;

/** 目录卡片上「添加」按钮对应的四种状态。 */
export type WidgetCatalogStatus = "available" | "added" | "hidden" | "spawn";

/** 目录中一个组件的完整展示数据。 */
export interface WidgetCatalogEntry {
  definition: HomeWidgetDefinition;
  category: HomeWidgetCategory;
  /** 网格跨格文案，例如 `4 × 2`。 */
  sizeLabel: string;
  /** 组件在桌面网格中的逻辑尺寸，预览按这个尺寸等比缩放。 */
  frame: { width: number; height: number };
}

/** 目录全部条目，顺序与组件定义表一致。 */
export const widgetCatalogEntries: WidgetCatalogEntry[] = homeWidgetDefinitions.map(
  (definition) => ({
    definition,
    category: widgetCategory(definition.category),
    sizeLabel: `${definition.defaultSize.colSpan} × ${definition.defaultSize.rowSpan}`,
    frame: {
      width: CATALOG_PREVIEW_CELL * definition.defaultSize.colSpan,
      height: CATALOG_PREVIEW_CELL * definition.defaultSize.rowSpan,
    },
  }),
);

/**
 * 计算某个组件在当前布局下的目录状态。
 *
 * @param widgets - 编辑器中的全部组件。
 * @param definition - 需要判断的组件定义。
 * @returns 可添加、已添加、已隐藏或可多实例新增。
 */
export function catalogStatus(
  widgets: HomeWidget[],
  definition: HomeWidgetDefinition,
): WidgetCatalogStatus {
  if (definition.multi) return "spawn";
  const current = widgets.find((widget) => widget.type === definition.type);
  if (!current) return "available";
  return current.visible ? "added" : "hidden";
}

/**
 * 将目录状态转换为按钮文案。
 *
 * @param status - 目录状态。
 * @returns 按钮上显示的短文案。
 */
export function catalogStatusLabel(status: WidgetCatalogStatus): string {
  if (status === "added") return "已添加";
  if (status === "hidden") return "重新启用";
  if (status === "spawn") return "新增";
  return "添加";
}

/**
 * 计算预览画布的等比缩放样式。
 *
 * 组件按真实网格尺寸（80px 单元）排版，再整体缩放到画布内：
 * 宽度按卡片实际宽度收敛，高度受画布高度约束，因此 4×2 的组件
 * 在目录里会显示为宽卡、2×2 的组件显示为居中的小方卡。
 *
 * 缩放值放在自定义属性里而不是直接写 transform，样式表才能在悬停时
 * 在同一个基础上叠加放大，而不会被行内样式覆盖。
 *
 * @param entry - 目录条目。
 * @param cardWidth - 卡片实际宽度；尚未测量时返回兜底比例。
 * @returns 直接绑定到预览内层的样式。
 */
export function catalogPreviewStyle(
  entry: WidgetCatalogEntry,
  cardWidth: number,
): Record<string, string> {
  const stageWidth = Math.max(96, cardWidth - CATALOG_CARD_INSET);
  const stageHeight = CATALOG_STAGE_HEIGHT - CATALOG_STAGE_PADDING * 2;
  const fit = Math.min(
    stageWidth / entry.frame.width,
    stageHeight / entry.frame.height,
    1,
  );
  const scale = Number.isFinite(fit) && fit > 0 ? fit : 0.5;
  return {
    width: `${entry.frame.width}px`,
    height: `${entry.frame.height}px`,
    "--frame-scale": scale.toFixed(4),
  };
}

/**
 * 判断某个组件定义是否命中搜索关键词。
 *
 * @param entry - 目录条目。
 * @param query - 已去除首尾空格的搜索词。
 * @returns 名称、说明或能力标签命中时返回 true。
 */
export function catalogMatchesQuery(
  entry: WidgetCatalogEntry,
  query: string,
): boolean {
  if (!query) return true;
  const haystack = [
    entry.definition.label,
    entry.definition.description,
    entry.category.label,
    entry.definition.type,
    ...entry.definition.tags,
  ]
    .join(" ")
    .toLocaleLowerCase();
  return haystack.includes(query.toLocaleLowerCase());
}

/**
 * 判断目录条目是否属于当前分类。
 *
 * @param entry - 目录条目。
 * @param category - 当前选中的分类，`all` 表示全部分类。
 * @returns 命中分类时返回 true。
 */
export function catalogInCategory(
  entry: WidgetCatalogEntry,
  category: HomeWidgetCategoryId | "all",
): boolean {
  return category === "all" || entry.definition.category === category;
}

/**
 * 读取组件类型在目录中的定义。
 *
 * @param type - 首页组件类型。
 * @returns 对应的目录条目；找不到时返回第一个条目。
 */
export function catalogEntry(type: HomeWidgetType): WidgetCatalogEntry {
  return (
    widgetCatalogEntries.find((entry) => entry.definition.type === type) ??
    widgetCatalogEntries[0]
  );
}
