export interface PackedSize {
  width: number;
  height: number;
}

export interface PackedLayoutOptions {
  /** 画布的逻辑宽度。 */
  canvasWidth: number;
  /** 卡片之间的最小间距。 */
  gap?: number;
  /** 画布四周的留白。 */
  padding?: number;
  /** 没有卡片或内容较少时的最小高度。 */
  minHeight?: number;
}

export interface PackedPosition {
  left: number;
  top: number;
}

export type PackedItem<T extends PackedSize> = Omit<T, 'width' | 'height'> &
  PackedSize &
  PackedPosition;

export interface PackedLayout<T extends PackedSize> {
  height: number;
  items: PackedItem<T>[];
}

interface PackedRect extends PackedSize, PackedPosition {}

/**
 * 将带宽高的条目放入紧凑二维网格，并返回画布尺寸。
 *
 * 这类自由画布需要保留每张卡片自己的宽高，不能使用会把所有卡片
 * 拉伸到目标宽高比的 justified/packing grid。每次只尝试已占用矩形的
 * 左边和右边作为候选列，再把候选位置向下推到不相交为止，足以覆盖
 * 当前页面的小规模卡片墙，同时让筛选后的资料库重新排列而不留下空洞。
 *
 * @param items - 需要排布的固定尺寸条目。
 * @param options - 画布宽度、间距、内边距和最小高度配置。
 * @returns 包含每个条目位置以及最终画布高度的排布结果。
 */
export function packItems<T extends PackedSize>(
  items: readonly T[],
  options: PackedLayoutOptions,
): PackedLayout<T> {
  const gap = Math.max(0, options.gap ?? 24);
  const padding = Math.max(0, options.padding ?? 24);
  const canvasWidth = Math.max(1, Math.round(options.canvasWidth));
  const usableWidth = Math.max(1, canvasWidth - padding * 2);
  const placed: PackedRect[] = [];
  const packed: PackedItem<T>[] = [];

  items.forEach((item) => {
    const scale = Math.min(1, usableWidth / Math.max(1, item.width));
    const width = Math.max(1, Math.round(item.width * scale));
    const height = Math.max(1, Math.round(item.height * scale));
    const candidates = new Set<number>([padding]);

    placed.forEach((rect) => {
      candidates.add(rect.left);
      candidates.add(rect.left + rect.width + gap);
    });

    let best: PackedRect | null = null;
    [...candidates]
      .filter((left) => left >= padding && left + width <= canvasWidth - padding)
      .sort((left, right) => left - right)
      .forEach((left) => {
        let top = padding;
        let moved = true;

        while (moved) {
          moved = false;
          placed.forEach((rect) => {
            const horizontalOverlap =
              left < rect.left + rect.width + gap &&
              left + width + gap > rect.left;
            const verticalOverlap =
              top < rect.top + rect.height + gap &&
              top + height + gap > rect.top;

            if (horizontalOverlap && verticalOverlap) {
              top = rect.top + rect.height + gap;
              moved = true;
            }
          });
        }

        const candidate = { left, top, width, height };
        if (
          !best ||
          candidate.top < best.top ||
          (candidate.top === best.top && candidate.left < best.left)
        ) {
          best = candidate;
        }
      });

    const position = best ?? {
      left: padding,
      top:
        placed.reduce(
          (bottom, rect) => Math.max(bottom, rect.top + rect.height),
          padding,
        ) + gap,
      width,
      height,
    };

    placed.push(position);
    packed.push({
      ...item,
      width,
      height,
      left: position.left,
      top: position.top,
    } as PackedItem<T>);
  });

  const contentBottom = placed.reduce(
    (bottom, rect) => Math.max(bottom, rect.top + rect.height),
    padding,
  );

  return {
    height: Math.max(options.minHeight ?? 0, contentBottom + padding),
    items: packed,
  };
}
