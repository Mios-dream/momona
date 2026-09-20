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

export const readCanvasDefaultScale = (): number => {
  if (typeof window === "undefined") return CANVAS_DEFAULT_SCALE_DESKTOP;
  return window.matchMedia("(max-width: 820px)").matches
    ? CANVAS_DEFAULT_SCALE_MOBILE
    : CANVAS_DEFAULT_SCALE_DESKTOP;
};

export const queryCanvasVisibleItems = (
  transform: LibraryCanvasTransform,
  viewport: { width: number; height: number },
  layouts: ReadonlyMap<string, LibraryCanvasLayout>,
  spatialIndex: LibraryCanvasSpatialIndex,
  laidOutItems: readonly LibraryTile[],
): LibraryTile[] => {
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
};
