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

export const createCanvasCardPaintCache = (): CanvasCardPaintCache => ({
  world: null,
  childCount: -1,
  first: null,
  last: null,
  nodes: [],
});

export const resetCanvasCardPaintCache = (
  cache: CanvasCardPaintCache,
): void => {
  cache.world = null;
  cache.childCount = -1;
  cache.first = null;
  cache.last = null;
  cache.nodes = [];
};

export const canvasCardPaintCacheIsCurrent = (
  cache: CanvasCardPaintCache,
  world: HTMLElement,
): boolean =>
  cache.world === world &&
  cache.childCount === world.childElementCount &&
  cache.first === world.firstElementChild &&
  cache.last === world.lastElementChild &&
  cache.nodes.length === world.childElementCount;

export const refreshCanvasCardPaintCache = (
  cache: CanvasCardPaintCache,
  world: HTMLElement,
): void => {
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
};

const readLayoutFromElement = (element: HTMLElement): LibraryCanvasLayout | null => {
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
};

export const paintCanvasCardFocus = (
  nodes: readonly CanvasCardPaintNode[],
  transform: LibraryCanvasTransform,
  viewport: LibraryCanvasViewport,
): void => {
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
};

export const sameLibraryTileIds = (
  previous: readonly { id: string }[] | null,
  next: readonly { id: string }[],
): boolean => {
  if (!previous || previous.length !== next.length) return false;
  for (let index = 0; index < next.length; index += 1) {
    if (previous[index]?.id !== next[index]?.id) return false;
  }
  return true;
};
