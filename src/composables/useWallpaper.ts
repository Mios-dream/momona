import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { Ref } from "vue";
import type { SiteBackground } from "../data/types";
import {
  loadWallpaperLibrary,
  preloadWallpaper,
  wallpaperCandidates,
  wallpaperPaintUrl,
  type WallpaperEntry,
} from "../lib/wallpaper";

/** 参与交叉淡入的一层壁纸。 */
export interface WallpaperLayer {
  /** 固定的层标识，两层交替使用，切换时不会重建 DOM。 */
  key: number;
  /** 该层当前绘制的壁纸值。 */
  image: string;
  /** 是否处于可见状态，由透明度过渡完成淡入淡出。 */
  visible: boolean;
}

/** 一次切换最多尝试几张候选；图源集体不可用时及时收手，不留一串超时请求。 */
const maxAttempts = 3;

/**
 * 壁纸切换引擎。
 *
 * 负责三件事：把配置和目录扫描结果拼成候选池、按 `mode` 决定何时换图、
 * 用两层壁纸做交叉淡入。壳层只消费 `layers`，不关心候选从哪来。
 *
 * 切换前一定先预加载：网络图源失败时自动换下一张，全部失败就留在原图，
 * 这样"网络不好"的表现是壁纸不变，而不是整块背景变成空白。
 *
 * @param background - 当前生效的壁纸配置；设置页的草稿也会通过它进来预览。
 * @returns 壁纸层、当前壁纸值以及手动换图/重扫目录的方法。
 */
export function useWallpaper(background: Readonly<Ref<SiteBackground>>) {
  const folder = ref<WallpaperEntry[]>([]);
  const candidates = computed(() =>
    wallpaperCandidates(background.value, folder.value),
  );
  const layers = ref<WallpaperLayer[]>([
    { key: 0, image: background.value.image, visible: true },
    { key: 1, image: "", visible: false },
  ]);
  const activeIndex = ref(0);
  /** 当前显示项在候选池里的 id，用来判断"这张还在不在壁纸库里"。 */
  const activeId = ref<string | null>(null);
  const activeImage = computed(
    () => layers.value[activeIndex.value]?.image ?? "",
  );

  let rotateTimer: number | null = null;
  let lastSwitchAt = 0;
  let switching = false;
  let disposed = false;

  /** 当前配置下的轮换间隔，单位毫秒。 */
  function intervalMs(): number {
    return Math.max(1, background.value.rotateMinutes || 30) * 60_000;
  }

  /**
   * 等两帧再揭幕。
   *
   * 新图先以 `opacity: 0` 落到 DOM 上，隔两帧再切到可见，浏览器才会真的
   * 触发过渡；否则同一帧内从 0 改到 1 会被合并成"直接出现"。
   *
   * @returns 两帧之后兑现的 Promise。
   */
  function nextFrame(): Promise<void> {
    return new Promise((resolve) => {
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => resolve());
      });
    });
  }

  /**
   * 把一张壁纸淡入到另一层，并交换当前层。
   *
   * @param entry - 待显示的壁纸项。
   * @returns 成功完成切换时为 true；预加载失败或组件已卸载时为 false。
   */
  async function attemptShow(entry: WallpaperEntry): Promise<boolean> {
    if (disposed) return false;
    const image = wallpaperPaintUrl(entry);
    if (image === activeImage.value) {
      activeId.value = entry.id;
      return true;
    }

    const index = activeIndex.value === 0 ? 1 : 0;
    const next = layers.value[index];
    next.image = image;
    next.visible = false;

    const loaded = await preloadWallpaper(image);
    if (!loaded || disposed) return false;

    await nextFrame();
    if (disposed) return false;

    next.visible = true;
    layers.value[activeIndex.value].visible = false;
    activeIndex.value = index;
    activeId.value = entry.id;
    lastSwitchAt = Date.now();
    return true;
  }

  /**
   * 洗牌，避免随机切换总是按目录顺序走。
   *
   * @param list - 待打乱的列表。
   * @returns 打乱后的新数组，原数组不变。
   */
  function shuffle<T>(list: T[]): T[] {
    const copy = [...list];
    for (let i = copy.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      [copy[i], copy[j]] = [copy[j], copy[i]];
    }
    return copy;
  }

  /**
   * 换到候选池里的另一张壁纸。
   *
   * @returns 切换流程结束后兑现的 Promise。
   */
  async function showNext(): Promise<void> {
    if (switching || disposed) return;
    const pool = candidates.value.filter((entry) => entry.id !== activeId.value);
    if (!pool.length) return;
    switching = true;
    try {
      for (const entry of shuffle(pool).slice(0, maxAttempts)) {
        if (await attemptShow(entry)) return;
      }
    } finally {
      switching = false;
    }
  }

  /**
   * 显示固定壁纸；加载失败时退回候选池里的第一张。
   *
   * @returns 切换流程结束后兑现的 Promise。
   */
  async function showPinned(): Promise<void> {
    if (switching || disposed) return;
    const image = background.value.image.trim();
    // 同一张图可能已经在候选池里（目录扫描或手动添加），优先复用它的 id，
    // 否则"当前项"会和候选池对不上，下一次清理壁纸库时会误判成已失效。
    const pinned: WallpaperEntry = candidates.value.find(
      (entry) => entry.image === image,
    ) ?? {
      id: "fixed",
      label: "固定壁纸",
      image,
      kind: "pool",
      dynamic: false,
    };
    const queue = [pinned, ...candidates.value.slice(0, maxAttempts)];
    switching = true;
    try {
      for (const entry of queue) {
        if (await attemptShow(entry)) return;
      }
    } finally {
      switching = false;
    }
  }

  /** 停掉轮换计时器。 */
  function stopRotation(): void {
    if (rotateTimer === null) return;
    window.clearInterval(rotateTimer);
    rotateTimer = null;
  }

  /** 按当前间隔重开轮换计时器。 */
  function startRotation(): void {
    stopRotation();
    rotateTimer = window.setInterval(() => {
      // 页面在后台时不换图，省流量也避免回到前台时看到一张没注意过的图。
      if (document.visibilityState !== "visible") return;
      void showNext();
    }, intervalMs());
  }

  /**
   * 按当前模式决定是否轮换、以及是否需要立刻换一张。
   *
   * @param initial - 是否为首次解析；首次会主动挑一张，而不是沿用上一张。
   * @returns 无返回值。
   */
  function apply(initial = false): void {
    if (disposed) return;
    const mode = background.value.mode;

    if (mode === "fixed") {
      stopRotation();
      void showPinned();
      return;
    }

    if (mode === "rotate") startRotation();
    else stopRotation();

    const stillAvailable = candidates.value.some(
      (entry) => entry.id === activeId.value,
    );
    if (initial || !stillAvailable) void showNext();
  }

  /** 回到前台时补上因后台暂停而错过的轮换。 */
  function handleVisibility(): void {
    if (document.visibilityState !== "visible") return;
    if (background.value.mode !== "rotate") return;
    if (Date.now() - lastSwitchAt >= intervalMs()) void showNext();
  }

  onMounted(() => {
    document.addEventListener("visibilitychange", handleVisibility);
    void loadWallpaperLibrary().then((entries) => {
      if (disposed) return;
      folder.value = entries;
      apply(true);
    });
  });

  onBeforeUnmount(() => {
    disposed = true;
    stopRotation();
    document.removeEventListener("visibilitychange", handleVisibility);
  });

  watch(() => background.value.mode, () => apply());
  watch(
    () => background.value.rotateMinutes,
    () => {
      if (background.value.mode === "rotate") startRotation();
    },
  );
  watch(
    () => background.value.image,
    () => {
      // 设置页点选图源时，无论当前是哪种模式都先把它显示出来：
      // 点了没有反应会让人以为选择没生效，换不换是下一步的事。
      void showPinned();
    },
  );
  // 壁纸库里删掉当前这张时立刻换图，避免留着一张"已不存在"的壁纸。
  // 拼成一个字符串再监听：每次求值都返回新数组的话，任何配置变化（比如拖模糊）
  // 都会被当成"库变了"，白白跑一遍判断。
  watch(
    () =>
      [
        background.value.pool.join("|"),
        background.value.remoteSources.join("|"),
        background.value.remoteCustom,
      ].join("§"),
    () => {
      if (background.value.mode === "fixed") return;
      const stillAvailable = candidates.value.some(
        (entry) => entry.id === activeId.value,
      );
      if (!stillAvailable) void showNext();
    },
  );

  return {
    /** 两层交叉淡入的壁纸。 */
    layers,
    /** 当前正在显示的壁纸值。 */
    activeImage,
    /** 当前壁纸在候选池里的 id。 */
    activeId,
    /** 候选池，供调试或后续扩展使用。 */
    candidates,
    /** 立刻换一张。 */
    advance: showNext,
    /** 重新扫描壁纸目录。 */
    refreshLibrary: async () => {
      // 设置页的"重新扫描"已经刷新过模块缓存，这里直接复用那份结果，避免重复请求。
      folder.value = await loadWallpaperLibrary();
      apply();
    },
  };
}
