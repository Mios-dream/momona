<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  shallowRef,
  watch,
} from "vue";
import type { LibraryFilter, LibraryTile } from "../../data/types";
import {
  buildCenterOutCanvasLayout,
  getLibraryCanvasViewportBinKey,
  type LibraryCanvasLayout,
} from "../../utils/libraryCanvas";
import IconGlyph from "../app/IconGlyph.vue";
import LibraryTileCard from "./LibraryTileCard.vue";
import {
  CANVAS_DEFAULT_SCALE_DESKTOP,
  CANVAS_MAX_SCALE,
  CANVAS_MIN_SCALE,
  CANVAS_SPATIAL_BIN_SIZE,
  queryCanvasVisibleItems,
  readCanvasDefaultScale,
  type LibraryCanvasSpatialIndex,
} from "./libraryCanvasVisible";
import {
  canvasCardPaintCacheIsCurrent,
  createCanvasCardPaintCache,
  paintCanvasCardFocus,
  refreshCanvasCardPaintCache,
  resetCanvasCardPaintCache,
  sameLibraryTileIds,
} from "./libraryCanvasPaint";
import { useLibraryCanvasControls } from "../../composables/useLibraryCanvasControls";

interface Props {
  /** 由应用壳层统一维护的资料库筛选分类。 */
  activeFilter: LibraryFilter;
  /** 构建时注入的远程或手动资料项。 */
  tiles: LibraryTile[];
}

const props = defineProps<Props>();

const filterTags: Record<Exclude<LibraryFilter, "all">, string[]> = {
  game: ["游戏", "game"],
  video: ["视频", "video"],
  music: ["音乐", "music"],
  anime: ["追番", "追剧", "anime", "tv_series"],
  book: ["作品", "书籍", "book"],
};

const viewportRef = ref<HTMLDivElement | null>(null);
const worldRef = ref<HTMLDivElement | null>(null);
const viewportSize = ref({ width: 0, height: 0 });
const layouts = shallowRef<Map<string, LibraryCanvasLayout>>(new Map());
const spatialIndex = shallowRef<LibraryCanvasSpatialIndex>({
  bins: new Map(),
  order: new Map(),
});
const visibleTiles = shallowRef<LibraryTile[]>([]);
const paintCache = createCanvasCardPaintCache();
// SSR 与客户端先共享桌面初始值，挂载后再切换移动端缩放，避免 hydration mismatch。
const defaultScale = CANVAS_DEFAULT_SCALE_DESKTOP;
let paintFrame: number | null = null;
let resizeObserver: ResizeObserver | null = null;
let resizeHandler: (() => void) | null = null;
let pageMounted = false;

/** 让同一批数据每次刷新都保持稳定，同时避免退化为原始顺序。 */
const stableHash = (value: string): number => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const shuffleForCanvas = (tiles: readonly LibraryTile[]): LibraryTile[] =>
  [...tiles].sort((left, right) => {
    const leftHash = stableHash(`library-canvas:${left.id}`);
    const rightHash = stableHash(`library-canvas:${right.id}`);
    return leftHash - rightHash || left.id.localeCompare(right.id);
  });

const filteredTiles = computed(() => {
  if (props.activeFilter === "all") return shuffleForCanvas(props.tiles);
  const tags = filterTags[props.activeFilter];
  return shuffleForCanvas(
    props.tiles.filter((tile) => tags.includes(tile.tag.trim().toLowerCase())),
  );
});

const getGridSize = (tile: LibraryTile): { w: number; h: number } => {
  const type = tile.tag.trim().toLowerCase();
  if (filterTags.video.includes(type)) return { w: 2, h: 1 };
  if (filterTags.music.includes(type)) return { w: 1, h: 1 };
  if (filterTags.anime.includes(type)) return { w: 1, h: 2 };
  if (filterTags.book.includes(type)) return { w: 1, h: 2 };
  if (filterTags.game.includes(type)) {
    if (tile.sourceId === "bangumi" || tile.sourceKind === "bangumiGames") {
      return { w: 1, h: 2 };
    }
    const ratio = tile.width / Math.max(tile.height, 1);
    return ratio >= 1.15 ? { w: 2, h: 1 } : { w: 1, h: 2 };
  }
  return { w: 1, h: 1 };
};

const buildSpatialIndex = (
  items: readonly LibraryTile[],
  nextLayouts: ReadonlyMap<string, LibraryCanvasLayout>,
): LibraryCanvasSpatialIndex => {
  const bins = new Map<string, LibraryTile[]>();
  const order = new Map<string, number>();

  items.forEach((item, index) => {
    const layout = nextLayouts.get(item.id);
    if (!layout) return;
    order.set(item.id, index);

    const minBinX = Math.floor(layout.left / CANVAS_SPATIAL_BIN_SIZE);
    const maxBinX = Math.floor(
      (layout.left + layout.width) / CANVAS_SPATIAL_BIN_SIZE,
    );
    const minBinY = Math.floor(layout.top / CANVAS_SPATIAL_BIN_SIZE);
    const maxBinY = Math.floor(
      (layout.top + layout.height) / CANVAS_SPATIAL_BIN_SIZE,
    );

    for (let binX = minBinX; binX <= maxBinX; binX += 1) {
      for (let binY = minBinY; binY <= maxBinY; binY += 1) {
        const key = `${binX},${binY}`;
        const bin = bins.get(key);
        if (bin) bin.push(item);
        else bins.set(key, [item]);
      }
    }
  });

  return { bins, order };
};

const getSourceLabel = (tile: LibraryTile): string => {
  const sourceLabels: Partial<Record<NonNullable<LibraryTile["sourceId"]>, string>> = {
    bangumi: "Bangumi",
    bilibili: "Bilibili",
    github: "GitHub",
    netease: "网易云音乐",
    qqmusic: "QQ 音乐",
    steam: "Steam",
    sfacg: "SFACG",
    manual: "手动内容",
  };
  if (tile.sourceId && sourceLabels[tile.sourceId]) {
    return sourceLabels[tile.sourceId] as string;
  }

  const subtitle = tile.subtitle.toLowerCase();
  if (tile.sourceId === "qqmusic" || subtitle.includes("qq 音乐")) {
    return "QQ 音乐";
  }
  if (
    tile.sourceId === "netease" ||
    subtitle.includes("netease") ||
    subtitle.includes("网易")
  ) {
    return "网易云音乐";
  }
  if (subtitle.includes("bilibili") || subtitle.includes("哔哩")) {
    return "Bilibili";
  }
  if (tile.tag.toLowerCase().includes("游戏")) return "Steam";
  if (tile.tag.toLowerCase().includes("音乐")) return "音乐";
  return tile.tag.toLowerCase().includes("video") || tile.tag.includes("视频")
    ? "Bilibili"
    : "Momona";
};

const updateVisibleTiles = (transform: {
  x: number;
  y: number;
  scale: number;
}): void => {
  const nextVisible = queryCanvasVisibleItems(
    transform,
    viewportSize.value,
    layouts.value,
    spatialIndex.value,
    filteredTiles.value,
  );
  if (!sameLibraryTileIds(visibleTiles.value, nextVisible)) {
    visibleTiles.value = nextVisible;
  }
};

const paintCanvasTransform = (transform: {
  x: number;
  y: number;
  scale: number;
}): void => {
  const viewport = viewportRef.value;
  const world = worldRef.value;
  if (world) {
    world.style.transform = `translate3d(${transform.x}px, ${transform.y}px, 0) scale(${transform.scale})`;
  }
  if (viewport) {
    viewport.style.backgroundSize = `${28 * transform.scale}px ${28 * transform.scale}px`;
    viewport.style.backgroundPosition = `calc(50% + ${transform.x}px) calc(50% + ${transform.y}px)`;
  }

  updateVisibleTiles(transform);

  if (world) {
    if (!canvasCardPaintCacheIsCurrent(paintCache, world)) {
      refreshCanvasCardPaintCache(paintCache, world);
    }
    paintCanvasCardFocus(paintCache.nodes, transform, viewportSize.value);
  }
};

const canvasControls = useLibraryCanvasControls({
  active: true,
  defaultScale,
  maxScale: CANVAS_MAX_SCALE,
  minScale: CANVAS_MIN_SCALE,
  surfaceRef: viewportRef,
  onPaint: paintCanvasTransform,
  shouldCommit: (next, committed) =>
    getLibraryCanvasViewportBinKey(
      next,
      viewportSize.value,
      CANVAS_SPATIAL_BIN_SIZE,
    ) !==
    getLibraryCanvasViewportBinKey(
      committed,
      viewportSize.value,
      CANVAS_SPATIAL_BIN_SIZE,
    ),
});

const schedulePaint = (): void => {
  if (typeof window === "undefined") return;
  if (paintFrame !== null) return;
  paintFrame = window.requestAnimationFrame(() => {
    paintFrame = null;
    paintCanvasTransform(canvasControls.transformRef.current);
  });
};

const rebuildLayout = (): void => {
  const items = filteredTiles.value;
  const nextLayouts = buildCenterOutCanvasLayout(items, getGridSize);
  layouts.value = nextLayouts;
  spatialIndex.value = buildSpatialIndex(items, nextLayouts);
  updateVisibleTiles(canvasControls.transformRef.current);
  void nextTick(() => {
    resetCanvasCardPaintCache(paintCache);
    schedulePaint();
  });

  if (pageMounted) canvasControls.reset();
};

watch(filteredTiles, rebuildLayout, { immediate: true });

watch(
  visibleTiles,
  () => {
    void nextTick(() => {
      resetCanvasCardPaintCache(paintCache);
      schedulePaint();
    });
  },
  { flush: "post" },
);

onMounted(() => {
  pageMounted = true;
  const responsiveScale = readCanvasDefaultScale();
  if (responsiveScale !== defaultScale) {
    canvasControls.setDefaultScale(responsiveScale);
  }

  const measureViewport = (): void => {
    const element = viewportRef.value;
    if (!element) return;
    const nextSize = {
      width: element.clientWidth,
      height: element.clientHeight,
    };
    if (
      nextSize.width === viewportSize.value.width &&
      nextSize.height === viewportSize.value.height
    ) {
      return;
    }
    viewportSize.value = nextSize;
    updateVisibleTiles(canvasControls.transformRef.current);
    schedulePaint();
  };

  measureViewport();
  resizeObserver = new ResizeObserver(measureViewport);
  if (viewportRef.value) resizeObserver.observe(viewportRef.value);
  resizeHandler = measureViewport;
  window.addEventListener("resize", measureViewport, { passive: true });
  schedulePaint();
});

onBeforeUnmount(() => {
  resizeObserver?.disconnect();
  if (resizeHandler) window.removeEventListener("resize", resizeHandler);
  if (paintFrame !== null) window.cancelAnimationFrame(paintFrame);
  resetCanvasCardPaintCache(paintCache);
});
</script>

<template>
  <div class="library-page">
    <div
      ref="viewportRef"
      class="library-viewport"
      tabindex="0"
      role="application"
      aria-label="资料库无限画布"
      @pointerdown="canvasControls.handlePointerDown"
      @pointermove="canvasControls.handlePointerMove"
      @pointerup="canvasControls.finishPointer"
      @pointercancel="canvasControls.finishPointer"
      @click.capture="canvasControls.handleClickCapture"
      @keydown="canvasControls.handleKeyDown"
      @keyup="canvasControls.handleKeyUp"
      @blur="canvasControls.handleBlur"
    >
      <div v-if="!filteredTiles.length" class="library-empty">
        <IconGlyph name="library" :size="22" />
        <strong>暂无资料</strong>
        <span>添加内容或同步数据源后，这里会显示资料。</span>
      </div>
      <div ref="worldRef" class="library-world">
        <template v-for="tile in visibleTiles" :key="tile.id">
          <div
            v-if="layouts.get(tile.id)"
            class="library-canvas-card"
            data-canvas-card
            :data-layout-left="layouts.get(tile.id)?.left"
            :data-layout-top="layouts.get(tile.id)?.top"
            :data-layout-width="layouts.get(tile.id)?.width"
            :data-layout-height="layouts.get(tile.id)?.height"
            :style="{
              left: `${layouts.get(tile.id)?.left ?? 0}px`,
              top: `${layouts.get(tile.id)?.top ?? 0}px`,
              width: `${layouts.get(tile.id)?.width ?? 0}px`,
              height: `${layouts.get(tile.id)?.height ?? 0}px`,
            }"
          >
            <LibraryTileCard
              :tile="tile"
              :source-label="getSourceLabel(tile)"
            />
          </div>
        </template>
      </div>

      <aside class="library-help-tip" aria-label="画布操作提示">
        <span>拖动画布移动 · 滚轮平移 · Ctrl / ⌘ + 滚轮缩放 · 0 复位</span>
      </aside>
    </div>

    <div
      class="library-zoom-toolbar"
      role="toolbar"
      aria-label="资料库无限画布"
    >
      <button
        type="button"
        aria-label="缩小画布"
        :disabled="canvasControls.atMinZoom.value"
        @click="canvasControls.zoom(1 / 1.16)"
      >
        <IconGlyph name="zoomOut" :size="17" />
      </button>
      <output aria-live="polite">{{
        `${canvasControls.zoomPercent.value}%`
      }}</output>
      <button
        type="button"
        aria-label="放大画布"
        :disabled="canvasControls.atMaxZoom.value"
        @click="canvasControls.zoom(1.16)"
      >
        <IconGlyph name="zoomIn" :size="17" />
      </button>
      <button
        class="library-center-button"
        type="button"
        aria-label="回到中心"
        :disabled="canvasControls.isDefault.value"
        @click="canvasControls.reset"
      >
        <IconGlyph name="refresh" :size="15" />
        <span>回到中心</span>
      </button>
    </div>
  </div>
</template>

<style scoped>
.library-page {
  position: fixed;
  z-index: 2;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
  user-select: none;
  -webkit-user-select: none;
}

.library-viewport {
  position: absolute;
  inset: 0;
  overflow: hidden;
  outline: none;
  background-image: radial-gradient(
    circle,
    rgba(108, 123, 164, 0.27) 1px,
    transparent 1.15px
  );
  background-position: 50% 50%;
  background-repeat: repeat;
  background-size: 28px 28px;
  overscroll-behavior: none;
  pointer-events: auto;
  touch-action: none;
  cursor: grab;
}

.library-viewport:focus-visible {
  box-shadow: inset 0 0 0 2px rgba(118, 104, 221, 0.32);
}

.library-viewport[data-dragging="true"] {
  cursor: grabbing;
}

.library-world {
  position: absolute;
  top: 50%;
  left: 50%;
  width: 0;
  height: 0;
  transform-origin: 0 0;
  pointer-events: none;
  will-change: transform;
}

.library-empty {
  position: absolute;
  z-index: 2;
  top: 50%;
  left: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--muted);
  font-size: 0.65rem;
  pointer-events: none;
  transform: translate(-50%, -50%);
}

.library-empty strong {
  color: var(--ink-soft);
}

.library-canvas-card {
  position: absolute;
  transform: scale(1);
  transform-origin: center center;
  pointer-events: auto;
  will-change: transform;
}

.library-canvas-card > .library-tile {
  width: 100%;
  height: 100%;
}

.library-canvas-card:hover {
  z-index: 40 !important;
}

.library-help-tip {
  position: absolute;
  z-index: 12;
  top: 11px;
  left: 50%;
  display: flex;
  min-height: 34px;
  padding: 5px 13px;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.76);
  border-radius: 18px;
  color: rgba(51, 63, 87, 0.7);
  background: rgba(255, 255, 255, 0.54);
  box-shadow: 0 8px 20px rgba(54, 45, 106, 0.08);
  backdrop-filter: blur(17px) saturate(135%);
  font-size: 0.58rem;
  pointer-events: none;
  transform: translateX(-50%);
}

.library-zoom-toolbar {
  position: absolute;
  z-index: 12;
  bottom: 14px;
  left: 50%;
  display: flex;
  height: 42px;
  padding: 4px;
  align-items: center;
  gap: 1px;
  border: 1px solid rgba(255, 255, 255, 0.84);
  border-radius: 15px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 13px 28px rgba(54, 45, 106, 0.15);
  backdrop-filter: blur(19px) saturate(140%);
  pointer-events: auto;
  transform: translateX(-50%);
}

.library-zoom-toolbar button,
.library-zoom-toolbar output {
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 10px;
  color: rgba(47, 60, 82, 0.72);
  background: transparent;
}

.library-zoom-toolbar button:hover:not(:disabled) {
  color: var(--purple-deep);
  background: rgba(241, 239, 255, 0.9);
}

.library-zoom-toolbar button:disabled {
  cursor: default;
  opacity: 0.42;
}

.library-zoom-toolbar output {
  width: 44px;
  color: rgba(47, 60, 82, 0.84);
  font-size: 0.65rem;
}

.library-zoom-toolbar .library-center-button {
  width: 82px;
  gap: 5px;
  font-size: 0.59rem;
}

@media (max-width: 820px) {
  .library-viewport {
    background-size: 20px 20px;
  }

  .library-help-tip {
    display: none;
  }

  .library-zoom-toolbar {
    bottom: 88px;
  }

  .library-zoom-toolbar .library-center-button {
    width: 34px;
    height: 32px;
  }

  .library-zoom-toolbar .library-center-button span {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .library-canvas-card {
    will-change: auto;
  }
}
</style>
