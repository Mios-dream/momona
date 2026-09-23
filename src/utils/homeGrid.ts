import { HOME_GRID_COLUMNS } from "../data/homeWidgets";
import type { HomeWidget } from "../data/types";

/**
 * 计算首页组件在桌面网格中的合法列起点。
 *
 * @param widget - 首页组件配置。
 * @returns 限制在桌面网格范围内的列起点。
 */
function safeColumn(widget: HomeWidget): number {
  return Math.min(
    HOME_GRID_COLUMNS - widget.colSpan + 1,
    Math.max(1, widget.col),
  );
}

/**
 * 计算首页组件在网格中的合法行起点。
 *
 * @param widget - 首页组件配置。
 * @returns 不小于 1 的行起点。
 */
function safeRow(widget: HomeWidget): number {
  return Math.max(1, widget.row);
}

/**
 * 判断两个组件矩形是否发生重叠。
 *
 * @param widget - 当前待放置组件。
 * @param col - 当前组件候选列。
 * @param row - 当前组件候选行。
 * @param other - 已存在的其他组件。
 * @returns 两个矩形相交时返回 true。
 */
function widgetsOverlap(
  widget: HomeWidget,
  col: number,
  row: number,
  other: HomeWidget,
): boolean {
  return (
    col < other.col + other.colSpan &&
    col + widget.colSpan > other.col &&
    row < other.row + other.rowSpan &&
    row + widget.rowSpan > other.row
  );
}

/**
 * 判断组件放到指定网格位置后是否不会遮挡其他可见组件。
 *
 * @param widgets - 当前首页全部组件。
 * @param widget - 待放置的组件。
 * @param col - 候选列。
 * @param row - 候选行。
 * @returns 候选位置可用时返回 true。
 */
function isPositionFree(
  widgets: HomeWidget[],
  widget: HomeWidget,
  col: number,
  row: number,
): boolean {
  if (col < 1 || col + widget.colSpan > HOME_GRID_COLUMNS + 1 || row < 1) {
    return false;
  }
  return !widgets.some(
    (other) =>
      other.visible &&
      other.id !== widget.id &&
      widgetsOverlap(widget, col, row, other),
  );
}

/**
 * 在目标位置附近寻找第一个可用位置。
 *
 * 编辑器拖拽和新增组件共用这个算法，所有输入都通过参数传入，避免
 * 工具函数直接依赖 Vue 响应式状态。
 *
 * @param widgets - 当前首页全部组件。
 * @param widget - 需要寻找位置的组件。
 * @param desiredCol - 用户期望的列位置。
 * @param desiredRow - 用户期望的行位置。
 * @returns 与目标位置最近的可用网格坐标。
 */
export function findNearestWidgetPosition(
  widgets: HomeWidget[],
  widget: HomeWidget,
  desiredCol: number,
  desiredRow: number,
): { col: number; row: number } {
  const maxCol = HOME_GRID_COLUMNS - widget.colSpan + 1;
  const clampedCol = Math.min(maxCol, Math.max(1, desiredCol));
  const clampedRow = Math.max(1, desiredRow);
  if (isPositionFree(widgets, widget, clampedCol, clampedRow)) {
    return { col: clampedCol, row: clampedRow };
  }

  // 以距离为层级扩展搜索范围，保证拖拽后的落点稳定且不会遍历无界区域。
  for (let distance = 1; distance < 16; distance += 1) {
    for (
      let row = Math.max(1, clampedRow - distance);
      row <= clampedRow + distance;
      row += 1
    ) {
      for (
        let col = Math.max(1, clampedCol - distance);
        col <= clampedCol + distance;
        col += 1
      ) {
        const candidateCol = Math.min(maxCol, col);
        if (isPositionFree(widgets, widget, candidateCol, row)) {
          return { col: candidateCol, row };
        }
      }
    }
  }
  return { col: clampedCol, row: clampedRow };
}

/**
 * 将首页组件布局转换为 CSS 自定义属性。
 *
 * @param widget - 首页组件配置。
 * @param index - 组件在当前列表中的索引。
 * @returns 供模板绑定的 CSS 自定义属性映射。
 */
export function widgetStyle(
  widget: HomeWidget,
  index = 0,
): Record<string, string> {
  return {
    "--widget-enter-delay": `${Math.min(index, 8) * 42}ms`,
    "--widget-col-start": String(safeColumn(widget)),
    "--widget-row-start": String(safeRow(widget)),
    "--widget-col-span": String(widget.colSpan),
    "--widget-row-span": String(widget.rowSpan),
    "--widget-mobile-col-span": String(widget.mobileColSpan),
    "--widget-mobile-row-span": String(widget.mobileRowSpan),
  };
}
