import {
  homeWidgetDefinitions,
  type HomeWidgetDefinition,
} from "../data/homeWidgets";
import {
  widgetCategory,
  type HomeWidgetCategory,
  type HomeWidgetCategoryId,
} from "../data/homeWidgetCategories";
import {
  variantFieldSpecs,
  widgetVariants,
  type VariantFieldSpec,
  type WidgetVariant,
} from "../data/widgetVariants";
import type { HomeWidget, HomeWidgetType } from "../data/types";

/**
 * 「添加组件」目录的共享模型。
 *
 * 目录卡片、尺寸标签、状态文案和等比预览比例全部从这里派生，
 * HomeWidgetCatalog 只负责渲染，不再各自计算，避免同一组件在两处
 * 得到不一样的尺寸或状态。
 *
 * 目录的最小单位是「组件类型」而不是「变体」：一个类型只占一张卡，
 * 平台、游戏这些变体收在卡片里，点添加时在独立窗口里选。
 * 这样 13 个平台不会把别的组件挤到第三屏去。
 */

/** 预览画布的逻辑单元：与桌面 16 列网格在 1280px 宽下的实际格子对齐。 */
export const CATALOG_PREVIEW_CELL = 80;

/**
 * 首页槽位四周各留 4px，卡片本身比格子小一圈。
 *
 * 预览要减掉这 8px，否则画出来的卡比首页那张胖一点点，
 * 撑满后多出来的高度就变成卡片底部一条空玻璃。
 */
const SLOT_GUTTER = 8;

/** 预览画布高度（像素），所有卡片共用，保证同一行卡片基线一致。 */
export const CATALOG_STAGE_HEIGHT = 148;

/** 预览内层与画布边缘的留白，让组件像浮在画布上而不是贴边截图。 */
export const CATALOG_STAGE_PADDING = 10;

/** 卡片内边距总和（左右各 10px），用于从卡片宽度反推画布可用宽度。 */
export const CATALOG_CARD_INSET = 20;

/**
 * 目录卡片使用的聚合名称。
 *
 * 跳转按钮在目录里是一整组社交入口，卡片名说"这一类是什么"比说
 * "这是一个按钮"更接近用户要找的东西；落地到首页后仍按具体平台命名。
 */
const catalogLabels: Partial<Record<HomeWidgetType, string>> = {
  link: "社交卡片",
};

/** 变体在界面上被称为什么，用于添加窗口里的那行小标题。 */
const variantGroups: Partial<Record<HomeWidgetType, string>> = {
  link: "平台",
  game: "游戏",
};

/** 目录卡片上「添加」按钮的三种状态。 */
export type WidgetCatalogStatus = "available" | "added" | "hidden";

/** 目录中一张组件卡的完整展示数据。 */
export interface WidgetCatalogEntry {
  /** 卡片唯一键，等于组件类型。 */
  key: string;
  definition: HomeWidgetDefinition;
  category: HomeWidgetCategory;
  /** 卡片标题：聚合名（社交卡片 / 游戏资料）。 */
  label: string;
  /** 网格跨格文案，例如 `4 × 2`。 */
  sizeLabel: string;
  /** 组件在桌面网格中的逻辑尺寸，预览按这个尺寸等比缩放。 */
  frame: { width: number; height: number };
  /** 该类型下的全部变体；只有一个时添加窗口不显示选择区。 */
  variants: WidgetVariant[];
  /** 变体选择区的小标题（平台 / 游戏）；空串表示不需要标题。 */
  variantGroup: string;
}

/** 添加窗口里选中某个变体后要判断的状态。 */
export interface CatalogVariantMatch {
  entry: WidgetCatalogEntry;
  variant: WidgetVariant;
}

/**
 * 生成目录卡片上的跨格文案。
 *
 * @param definition - 组件定义。
 * @returns 形如 `4 × 2` 的尺寸标签。
 */
function sizeLabelOf(definition: HomeWidgetDefinition): string {
  const { colSpan, rowSpan } = definition.defaultSize;
  return `${colSpan} × ${rowSpan}`;
}

/** 目录全部条目：一个组件类型一张卡，变体挂在卡片上。 */
export const widgetCatalogEntries: WidgetCatalogEntry[] = homeWidgetDefinitions.map(
  (definition) => {
    const variants = widgetVariants(definition.type, definition.label);
    return {
      key: definition.type,
      definition,
      category: widgetCategory(definition.category),
      label: catalogLabels[definition.type] ?? definition.label,
      sizeLabel: sizeLabelOf(definition),
      frame: {
        width:
          CATALOG_PREVIEW_CELL * definition.defaultSize.colSpan - SLOT_GUTTER,
        height:
          CATALOG_PREVIEW_CELL * definition.defaultSize.rowSpan - SLOT_GUTTER,
      },
      variants,
      variantGroup:
        variants.length > 1 ? (variantGroups[definition.type] ?? "") : "",
    };
  },
);

/**
 * 读取某个变体需要补填的字段规格。
 *
 * @param variant - 目录变体。
 * @returns 字段规格数组；空数组表示这个变体填不了任何东西。
 */
export function variantFields(variant: WidgetVariant): VariantFieldSpec[] {
  return (variant.fields ?? []).map((field) => variantFieldSpecs[field]);
}

/**
 * 在现有布局里找出某个变体对应的组件实例。
 *
 * 游戏资料按"哪一款游戏"认人，其余类型按类型认人——一款游戏一张卡，
 * 所以原神和星穹铁道是两个不同的实例。
 *
 * @param widgets - 编辑器中的全部组件。
 * @param entry - 变体所属的目录条目。
 * @param variant - 需要查找的变体。
 * @returns 命中的组件配置；没有时返回 undefined。
 */
export function variantWidget(
  widgets: HomeWidget[],
  entry: WidgetCatalogEntry,
  variant: WidgetVariant,
): HomeWidget | undefined {
  if (variant.game) {
    return widgets.find(
      (widget) =>
        widget.type === entry.definition.type &&
        (widget.settings?.game?.game ?? "hsr") === variant.game,
    );
  }
  return widgets.find((widget) => widget.type === entry.definition.type);
}

/**
 * 计算单个变体在当前布局下的状态。
 *
 * @param widgets - 编辑器中的全部组件。
 * @param entry - 变体所属的目录条目。
 * @param variant - 需要判断的变体。
 * @returns 可添加、已添加或已隐藏（可重新启用）。
 */
export function variantStatus(
  widgets: HomeWidget[],
  entry: WidgetCatalogEntry,
  variant: WidgetVariant,
): WidgetCatalogStatus {
  // 社交卡片是模板，一个平台可以挂多张，永远还能再加一个。
  if (entry.definition.multi && !variant.game) return "available";
  const match = variantWidget(widgets, entry, variant);
  if (!match) return "available";
  return match.visible ? "added" : "hidden";
}

/**
 * 计算整张目录卡的状态。
 *
 * 卡片代表一整类组件，所以只有每个变体都已经在首页上时才算「已添加」；
 * 只要还有变体没加，卡片就保持可点，由添加窗口去说明哪些已经加过。
 *
 * @param widgets - 编辑器中的全部组件。
 * @param entry - 需要判断的目录条目。
 * @returns 可添加、已添加或已隐藏。
 */
export function catalogStatus(
  widgets: HomeWidget[],
  entry: WidgetCatalogEntry,
): WidgetCatalogStatus {
  const statuses = entry.variants.map((variant) =>
    variantStatus(widgets, entry, variant),
  );
  if (statuses.every((status) => status === "added")) return "added";
  if (statuses.every((status) => status !== "available")) return "hidden";
  return "available";
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
 * 判断某个目录条目是否命中搜索关键词。
 *
 * 变体名也要进检索范围：卡片叫「社交卡片」之后，用户搜 QQ、GitHub
 * 仍然必须能找到它，否则聚合反而藏起了东西。
 *
 * @param entry - 目录条目。
 * @param query - 已去除首尾空格的搜索词。
 * @returns 变体名、组件名、说明或能力标签命中时返回 true。
 */
export function catalogMatchesQuery(
  entry: WidgetCatalogEntry,
  query: string,
): boolean {
  if (!query) return true;
  const haystack = [
    entry.label,
    entry.definition.label,
    entry.definition.description,
    entry.category.label,
    entry.definition.type,
    ...entry.variants.map((variant) => variant.label),
    ...entry.variants.map((variant) => variant.game ?? ""),
    ...entry.definition.tags,
  ]
    .filter(Boolean)
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
 * 按变体键反查它所属的目录条目。
 *
 * @param key - 变体 id。
 * @returns 条目与变体；找不到时返回 undefined。
 */
export function findCatalogVariant(key: string): CatalogVariantMatch | undefined {
  for (const entry of widgetCatalogEntries) {
    const variant = entry.variants.find((item) => item.id === key);
    if (variant) return { entry, variant };
  }
  return undefined;
}
