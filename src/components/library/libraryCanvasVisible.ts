import type { LibraryTile } from "../../data/types";
import type { LibraryCanvasLayout, LibraryCanvasTransform } from "../../utils/libraryCanvas";
import {
  getLibraryCanvasViewportBounds,
  libraryCanvasLayoutIntersects,
  LIBRARY_CANVAS_STRIDE,
} from "../../utils/libraryCanvas";

export const CANVAS_DEFAULT_SCALE_DESKTOP = 0.75;
export const CANVAS_DEFAULT_SCALE_MOBILE = 0.5;
export const CANVAS_MIN_SCALE = 0.45;
export const CANVAS_MAX_SCALE = 1.6;
export const CANVAS_SPATIAL_BIN_SIZE = LIBRARY_CANVAS_STRIDE * 4;

export interface LibraryCanvasSpatialIndex {
  bins: Map<string, LibraryTile[]>;
  order: Map<string, number>;
}

/**
 * 从当前视口读取资料库画布的初始缩放比例。
 *
 * @param viewport - 需要测量的资料库视口元素。
 * @returns 适合当前桌面或窄屏视口的初始缩放比例。
 */
export function readCanvasDefaultScale(): number {
  if (typeof window === "undefined") return CANVAS_DEFAULT_SCALE_DESKTOP;
  return window.matchMedia("(max-width: 820px)").matches
    ? CANVAS_DEFAULT_SCALE_MOBILE
    : CANVAS_DEFAULT_SCALE_DESKTOP;
}

/**
 * 查询当前视口内可见的画布卡片元素。
 *
 * @param transform - 当前画布的平移和缩放变换。
 * @param viewport - 当前可视区域尺寸。
 * @param layouts - 资料库条目的世界坐标布局。
 * @param spatialIndex - 按空间分箱建立的布局索引。
 * @param laidOutItems - 已经完成布局的资料库条目。
 * @returns 当前视口附近需要保留 DOM 的条目 ID 集合。
 */
export function queryCanvasVisibleItems(
  transform: LibraryCanvasTransform,
  viewport: { width: number; height: number },
  layouts: ReadonlyMap<string, LibraryCanvasLayout>,
  spatialIndex: LibraryCanvasSpatialIndex,
  laidOutItems: readonly LibraryTile[],
): LibraryTile[] {
  if (layouts.size === 0) return [];
  if (viewport.width === 0 || viewport.height === 0) {
    return laidOutItems.slice(0, 30);
  }

  const bounds = getLibraryCanvasViewportBounds(transform, viewport);
  const minBinX = Math.floor(bounds.minX / CANVAS_SPATIAL_BIN_SIZE);
  const maxBinX = Math.floor(bounds.maxX / CANVAS_SPATIAL_BIN_SIZE);
  const minBinY = Math.floor(bounds.minY / CANVAS_SPATIAL_BIN_SIZE);
  const maxBinY = Math.floor(bounds.maxY / CANVAS_SPATIAL_BIN_SIZE);
  const candidates: LibraryTile[] = [];
  const seen = new Set<string>();

  for (let binX = minBinX; binX <= maxBinX; binX += 1) {
    for (let binY = minBinY; binY <= maxBinY; binY += 1) {
      const bin = spatialIndex.bins.get(`${binX},${binY}`);
      if (!bin) continue;

      bin.forEach((item) => {
        if (seen.has(item.id)) return;
        seen.add(item.id);
        const layout = layouts.get(item.id);
        if (layout && libraryCanvasLayoutIntersects(layout, bounds)) {
          candidates.push(item);
        }
      });
    }
  }

  return candidates.sort(
    (left, right) =>
      (spatialIndex.order.get(left.id) ?? 0) -
      (spatialIndex.order.get(right.id) ?? 0),
  );
}
