export interface LibraryCanvasLayout {
  left: number;
  top: number;
  width: number;
  height: number;
  gridX: number;
  gridY: number;
  gridW: number;
  gridH: number;
}

export interface LibraryCanvasTransform {
  x: number;
  y: number;
  scale: number;
}

export interface LibraryCanvasViewport {
  width: number;
  height: number;
}

export interface LibraryCanvasBounds {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
}

export const LIBRARY_CANVAS_CELL_SIZE = 184;
export const LIBRARY_CANVAS_GAP = 16;
export const LIBRARY_CANVAS_STRIDE =
  LIBRARY_CANVAS_CELL_SIZE + LIBRARY_CANVAS_GAP;
export const LIBRARY_CANVAS_FOCUS_MIN_SCALE = 0.62;
export const LIBRARY_CANVAS_FOCUS_MAX_SCALE = 1.3;
const LIBRARY_CANVAS_FOCUS_EXTENT = 1.7;

/**
 * 将指定半径的方形环按顺时针顺序追加到候选网格位置。
 *
 * @param candidates - 需要追加候选位置的数组。
 * @param radius - 当前方形环半径。
 * @returns 无返回值；候选坐标直接追加到输入数组。
 */
function appendSquareRing(
  candidates: Array<[number, number]>,
  radius: number,
): void {
  for (let x = -radius; x <= radius; x += 1) {
    candidates.push([x, -radius]);
  }
  for (let y = -radius + 1; y <= radius; y += 1) {
    candidates.push([radius, y]);
  }
  for (let x = radius - 1; x >= -radius; x -= 1) {
    candidates.push([x, radius]);
  }
  for (let y = radius - 1; y > -radius; y -= 1) {
    candidates.push([-radius, y]);
  }
}

/**
 * 以中心为锚点、沿方形环向外寻找可用网格位置。
 *
 * @param items - 需要排版的条目列表。
 * @param getGridSize - 获取条目网格宽高的函数。
 * @returns 按条目 ID 索引的画布布局。
 */
export function buildCenterOutCanvasLayout<T extends { id: string }>(
  items: readonly T[],
  getGridSize: (item: T) => { w: number; h: number },
): Map<string, LibraryCanvasLayout> {
  const occupied = new Set<string>();
  const layouts = new Map<string, LibraryCanvasLayout>();
  const candidates: Array<[number, number]> = [[0, 0]];
  let candidateRadius = 0;

  /**
   * 判断候选矩形是否与已占用网格重叠。
   *
   * @param x - 候选矩形的网格起始列。
   * @param y - 候选矩形的网格起始行。
   * @param w - 候选矩形的网格宽度。
   * @param h - 候选矩形的网格高度。
   * @returns 没有占用冲突时返回 true。
   */
  function fits(x: number, y: number, w: number, h: number): boolean {
    for (let dx = 0; dx < w; dx += 1) {
      for (let dy = 0; dy < h; dy += 1) {
        if (occupied.has(`${x + dx},${y + dy}`)) return false;
      }
    }
    return true;
  }

  /**
   * 将矩形覆盖的网格单元标记为已占用。
   *
   * @param x - 矩形的网格起始列。
   * @param y - 矩形的网格起始行。
   * @param w - 矩形的网格宽度。
   * @param h - 矩形的网格高度。
   * @returns 无返回值；占用信息写入内部集合。
   */
  function occupy(x: number, y: number, w: number, h: number): void {
    for (let dx = 0; dx < w; dx += 1) {
      for (let dy = 0; dy < h; dy += 1) {
        occupied.add(`${x + dx},${y + dy}`);
      }
    }
  }

  items.forEach((item) => {
    const { w, h } = getGridSize(item);
    let candidate: [number, number] | undefined;

    while (!candidate) {
      candidate = candidates.find(([centerX, centerY]) => {
        const gridX = centerX - Math.floor(w / 2);
        const gridY = centerY - Math.floor(h / 2);
        return fits(gridX, gridY, w, h);
      });
      if (!candidate) appendSquareRing(candidates, ++candidateRadius);
    }

    const gridX = candidate[0] - Math.floor(w / 2);
    const gridY = candidate[1] - Math.floor(h / 2);
    occupy(gridX, gridY, w, h);
    layouts.set(item.id, {
      left: gridX * LIBRARY_CANVAS_STRIDE - LIBRARY_CANVAS_CELL_SIZE / 2,
      top: gridY * LIBRARY_CANVAS_STRIDE - LIBRARY_CANVAS_CELL_SIZE / 2,
      width: w * LIBRARY_CANVAS_CELL_SIZE + (w - 1) * LIBRARY_CANVAS_GAP,
      height: h * LIBRARY_CANVAS_CELL_SIZE + (h - 1) * LIBRARY_CANVAS_GAP,
      gridX,
      gridY,
      gridW: w,
      gridH: h,
    });
  });

  // 将第一个卡片的中心对齐世界原点，再放大网格间的呼吸感。
  const firstLayout = items.length > 0 ? layouts.get(items[0].id) : undefined;
  if (firstLayout) {
    const anchorX = firstLayout.left + firstLayout.width / 2;
    const anchorY = firstLayout.top + firstLayout.height / 2;
    layouts.forEach((layout) => {
      const centerX = layout.left + layout.width / 2 - anchorX;
      const centerY = layout.top + layout.height / 2 - anchorY;
      layout.left = centerX * 1.32 - layout.width / 2;
      layout.top = centerY * 1.32 - layout.height / 2;
    });
  }

  return layouts;
}

/**
 * 计算视口聚焦指定卡片时应使用的缩放比例。
 *
 * @param centerX - 卡片中心的世界坐标 X。
 * @param centerY - 卡片中心的世界坐标 Y。
 * @param transform - 当前画布变换。
 * @param viewport - 当前视口尺寸。
 * @returns 适合聚焦卡片的缩放比例。
 */
export function getLibraryCanvasFocusScaleAt(
  centerX: number,
  centerY: number,
  transform: LibraryCanvasTransform,
  viewport: LibraryCanvasViewport,
): number {
  if (viewport.width <= 0 || viewport.height <= 0) {
    return LIBRARY_CANVAS_FOCUS_MAX_SCALE;
  }

  const screenX = centerX * transform.scale + transform.x;
  const screenY = centerY * transform.scale + transform.y;
  const normalizedDistance = Math.hypot(
    screenX / (viewport.width / 2),
    screenY / (viewport.height / 2),
  );
  const progress = Math.min(
    1,
    normalizedDistance / LIBRARY_CANVAS_FOCUS_EXTENT,
  );
  const easedProgress = progress * progress * (3 - 2 * progress);

  return (
    LIBRARY_CANVAS_FOCUS_MAX_SCALE -
    (LIBRARY_CANVAS_FOCUS_MAX_SCALE - LIBRARY_CANVAS_FOCUS_MIN_SCALE) *
      easedProgress
  );
}

/**
 * 将画布布局和变换转换为当前视口的矩形边界。
 *
 * @param transform - 当前画布变换。
 * @param viewport - 当前视口尺寸。
 * @param overscanPx - 视口外额外预加载的像素范围。
 * @returns 世界坐标系中的可见边界。
 */
export function getLibraryCanvasViewportBounds(
  transform: LibraryCanvasTransform,
  viewport: LibraryCanvasViewport,
  overscanPx = 360,
): LibraryCanvasBounds {
  const overscan = overscanPx / transform.scale;
  return {
    minX: (-viewport.width / 2 - transform.x) / transform.scale - overscan,
    maxX: (viewport.width / 2 - transform.x) / transform.scale + overscan,
    minY: (-viewport.height / 2 - transform.y) / transform.scale - overscan,
    maxY: (viewport.height / 2 - transform.y) / transform.scale + overscan,
  };
}

/**
 * 将视口边界量化为稳定的空间索引键。
 *
 * @param transform - 当前画布变换。
 * @param viewport - 当前视口尺寸。
 * @param binSize - 空间索引单元大小。
 * @param overscanPx - 视口外额外预加载的像素范围。
 * @returns 当前视口对应的稳定索引键。
 */
export function getLibraryCanvasViewportBinKey(
  transform: LibraryCanvasTransform,
  viewport: LibraryCanvasViewport,
  binSize: number,
  overscanPx = 360,
): string {
  if (
    viewport.width <= 0 ||
    viewport.height <= 0 ||
    binSize <= 0 ||
    !Number.isFinite(binSize)
  ) {
    return "0";
  }

  const bounds = getLibraryCanvasViewportBounds(transform, viewport, overscanPx);
  return [
    Math.floor(bounds.minX / binSize),
    Math.floor(bounds.maxX / binSize),
    Math.floor(bounds.minY / binSize),
    Math.floor(bounds.maxY / binSize),
  ].join(",");
}

/**
 * 判断画布卡片布局是否与视口边界相交。
 *
 * @param layout - 画布卡片布局。
 * @param bounds - 当前视口世界坐标边界。
 * @returns 卡片与边界相交时返回 true。
 */
export function libraryCanvasLayoutIntersects(
  layout: LibraryCanvasLayout,
  bounds: LibraryCanvasBounds,
): boolean {
  return (
    layout.left + layout.width >= bounds.minX &&
    layout.left <= bounds.maxX &&
    layout.top + layout.height >= bounds.minY &&
    layout.top <= bounds.maxY
  );
}
