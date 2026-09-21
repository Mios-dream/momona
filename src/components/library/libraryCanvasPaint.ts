import type {
  LibraryCanvasLayout,
  LibraryCanvasTransform,
  LibraryCanvasViewport,
} from "../../utils/libraryCanvas";
import { getLibraryCanvasFocusScaleAt } from "../../utils/libraryCanvas";

interface CanvasCardPaintNode {
  el: HTMLElement;
  cx: number;
  cy: number;
  lastFocus: number;
  lastZ: number;
}

export interface CanvasCardPaintCache {
  world: HTMLElement | null;
  childCount: number;
  first: Element | null;
  last: Element | null;
  nodes: CanvasCardPaintNode[];
}

export const CANVAS_FOCUS_WRITE_EPS = 0.004;

/**
 * 创建空的画布卡片绘制缓存。
 *
 * @param world - 需要建立缓存的画布世界状态。
 * @returns 与当前条目集合对应的空绘制缓存。
 */
export function createCanvasCardPaintCache(): CanvasCardPaintCache {
  return { world: null, childCount: -1, first: null, last: null, nodes: [] };
}

/**
 * 清空画布卡片绘制缓存中的 DOM 引用和尺寸信息。
 *
 * @param cache - 需要重置的绘制缓存。
 * @returns 无返回值；缓存会恢复为未绑定 DOM 的初始状态。
 */
export function resetCanvasCardPaintCache(
  cache: CanvasCardPaintCache,
): void {
  cache.world = null;
  cache.childCount = -1;
  cache.first = null;
  cache.last = null;
  cache.nodes = [];
}

/**
 * 判断缓存是否仍对应当前画布卡片集合。
 *
 * @param cache - 已有的绘制缓存。
 * @param world - 当前画布世界状态。
 * @returns 缓存仍可复用时返回 true。
 */
export function canvasCardPaintCacheIsCurrent(
  cache: CanvasCardPaintCache,
  world: HTMLElement,
): boolean {
  return (
    cache.world === world &&
    cache.childCount === world.childElementCount &&
    cache.first === world.firstElementChild &&
    cache.last === world.lastElementChild &&
    cache.nodes.length === world.childElementCount
  );
}

/**
 * 从 DOM 读取卡片位置、尺寸和绘制样式。
 *
 * @param cache - 需要更新的绘制缓存。
 * @param world - 当前画布世界状态。
 * @returns 无返回值；读取结果写入缓存供后续 Canvas 绘制使用。
 */
export function refreshCanvasCardPaintCache(
  cache: CanvasCardPaintCache,
  world: HTMLElement,
): void {
  const previous = new Map<HTMLElement, CanvasCardPaintNode>();
  cache.nodes.forEach((node) => previous.set(node.el, node));

  const nodes: CanvasCardPaintNode[] = [];
  const children = world.children;
  for (let index = 0; index < children.length; index += 1) {
    const element = children[index] as HTMLElement;
    if (!element.hasAttribute("data-canvas-card")) continue;

    const layout = readLayoutFromElement(element);
    if (!layout) continue;
    const oldNode = previous.get(element);
    nodes.push({
      el: element,
      cx: layout.left + layout.width / 2,
      cy: layout.top + layout.height / 2,
      lastFocus: oldNode?.lastFocus ?? Number.NaN,
      lastZ: oldNode?.lastZ ?? -1,
    });
  }

  cache.world = world;
  cache.childCount = world.childElementCount;
  cache.first = world.firstElementChild;
  cache.last = world.lastElementChild;
  cache.nodes = nodes;
}

/**
 * 从卡片元素的数据属性读取统一布局信息。
 *
 * @param element - 带有画布布局 data 属性的卡片元素。
 * @returns 卡片在世界坐标中的布局；数据不完整时返回 null。
 */
function readLayoutFromElement(element: HTMLElement): LibraryCanvasLayout | null {
  const left = Number(element.dataset.layoutLeft);
  const top = Number(element.dataset.layoutTop);
  const width = Number(element.dataset.layoutWidth);
  const height = Number(element.dataset.layoutHeight);
  if (![left, top, width, height].every(Number.isFinite)) return null;

  return {
    left,
    top,
    width,
    height,
    gridX: 0,
    gridY: 0,
    gridW: 1,
    gridH: 1,
  };
}

/**
 * 使用 CSS 变量高亮当前聚焦的画布卡片。
 *
 * @param nodes - 已读取的卡片绘制节点。
 * @param transform - 当前画布变换。
 * @param viewport - 画布视口尺寸。
 * @returns 无返回值；焦点卡片的可见 CSS 状态会被更新。
 */
export function paintCanvasCardFocus(
  nodes: readonly CanvasCardPaintNode[],
  transform: LibraryCanvasTransform,
  viewport: LibraryCanvasViewport,
): void {
  nodes.forEach((node) => {
    const focus = getLibraryCanvasFocusScaleAt(
      node.cx,
      node.cy,
      transform,
      viewport,
    );
    const z = Math.round(focus * 100);
    if (
      Number.isFinite(node.lastFocus) &&
      Math.abs(focus - node.lastFocus) < CANVAS_FOCUS_WRITE_EPS &&
      z === node.lastZ
    ) {
      return;
    }

    node.lastFocus = focus;
    node.lastZ = z;
    node.el.style.transform = `scale(${focus})`;
    node.el.style.zIndex = String(z);
  });
}

/**
 * 判断两组资料库条目的 ID 顺序是否完全一致。
 *
 * @param previous - 旧的资料库条目 ID 顺序。
 * @param next - 新的资料库条目 ID 顺序。
 * @returns 两组 ID 数量和顺序都一致时返回 true。
 */
export function sameLibraryTileIds(
  previous: readonly { id: string }[] | null,
  next: readonly { id: string }[],
): boolean {
  if (!previous || previous.length !== next.length) return false;
  for (let index = 0; index < next.length; index += 1) {
    if (previous[index]?.id !== next[index]?.id) return false;
  }
  return true;
}
