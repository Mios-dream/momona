<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import type {
  IconName,
  MusicCatalog,
  MusicPlaybackMode,
  MusicSettings,
} from "../../data/types";
import {
  airQualityLabel,
  getWeatherInfo,
  type WeatherData,
} from "../../lib/weather";
import {
  clearNotifications,
  markNotificationsRead,
  notificationState,
  type NotificationCategory,
} from "../../lib/toast";
import FallbackImage from "./FallbackImage.vue";
import IconGlyph from "./IconGlyph.vue";
import MusicPicker from "../music/MusicPicker.vue";

interface Props {
  track?: MusicSettings;
  catalog?: MusicCatalog;
  editable?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  track: undefined,
  /**
   * 为缺少播放器目录的首页提供空目录默认值。
   *
   * @returns 没有歌单的音乐目录。
   */
  catalog: () => ({ playlists: [] }),
  editable: false,
});

interface PlayerState {
  isPlaying?: boolean;
  currentTime?: number;
  duration?: number;
  isMuted?: boolean;
  isShuffle?: boolean;
  repeatMode?: "off" | "all" | "one";
  playbackMode?: MusicPlaybackMode;
  playlistTitle?: string;
  currentSong?: {
    name?: string;
    artist?: string;
    album?: string;
    cover?: string;
    source?: string;
  } | null;
}

interface QuoteState {
  text: string;
  from: string;
}

type CollapsedItem = "quote" | "weather" | "greeting";

/** 控制台展开后的两个分区：常规控制与通知中心。 */
type PanelTab = "control" | "notifications";

const isExpanded = ref(false);
const isTeleportReady = ref(false);
const panelElement = ref<HTMLElement | null>(null);
const activeCollapsedItem = ref<CollapsedItem>("quote");
/** 展开面板当前所在的分区。 */
const panelTab = ref<PanelTab>("control");
const weather = ref<WeatherData | null>(null);
const weatherLoading = ref(true);
const playerState = ref<PlayerState>({});
const isPlaylistOpen = ref(false);
const expandedInnerRef = ref<HTMLElement | null>(null);
const musicRef = ref<HTMLElement | null>(null);
const stageRef = ref<HTMLElement | null>(null);
/**
 * 音乐卡片在内容切换期间的实际高度。
 *
 * 值为 null 时由内容自然撑开；切换播放器与播放列表时先锁定旧高度，
 * 再过渡到新内容高度，卡片底边才能和外层面板同步移动。
 */
const musicHeight = ref<number | null>(null);
/**
 * 展开面板内容的目标高度。
 *
 * 高度由内容实测值驱动，播放器与播放列表切换时面板才能平滑过渡，
 * 而不是依赖固定的展开高度。
 */
const expandedHeight = ref<number | null>(null);
const quote = ref<QuoteState>({
  text: "愿每一次回望，都有新的理解。",
  from: "Momona",
});
let rotationTimer: number | null = null;
let quoteRequest: AbortController | null = null;
let expandedResizeObserver: ResizeObserver | null = null;
let measureFrame: number | null = null;

/** 展开状态下用实测内容高度驱动面板高度过渡。 */
const panelStyle = computed(() =>
  isExpanded.value && expandedHeight.value !== null
    ? { height: `${expandedHeight.value}px` }
    : undefined,
);

/** 音乐卡片切换期间锁定为固定高度，交由 transition 做高度过渡。 */
const musicStyle = computed(() =>
  musicHeight.value === null ? undefined : { height: `${musicHeight.value}px` },
);

const greeting = computed(() => {
  const hour = new Date().getHours();
  if (hour < 6) return "夜深了";
  if (hour < 12) return "早上好";
  if (hour < 18) return "下午好";
  return "晚上好";
});

/** 通知来源图标：与手机通知一样，先识别来源，再通过颜色区分状态。 */
const categoryIcons: Record<NotificationCategory, IconName> = {
  system: "monitor",
  weather: "cloud",
  music: "music",
  game: "game",
  sync: "refresh",
  friends: "messagesSquare",
};

const categoryLabels: Record<NotificationCategory, string> = {
  system: "系统",
  weather: "天气",
  music: "音乐",
  game: "游戏",
  sync: "数据同步",
  friends: "友链",
};

/** 收起状态下的横幅：有最新通知时顶替一言/天气/问候展示。 */
const banner = computed(() => notificationState.latest);

/** 横幅顶部显示来源名称，与通知中心保持一致。 */
const bannerLabel = computed(() =>
  banner.value ? categoryLabels[banner.value.category] : categoryLabels.system,
);

const unreadCount = computed(() => notificationState.unread);

/**
 * 把通知时间戳格式化为相对时间。
 *
 * @param time - 通知到达的毫秒时间戳。
 * @returns 「刚刚 / N 分钟前 / N 小时前」或月日时分文本。
 */
function relativeTime(time: number): string {
  const diff = Date.now() - time;
  if (diff < 60_000) return "刚刚";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(time);
}

const greetingDate = computed(() =>
  new Intl.DateTimeFormat("zh-CN", {
    month: "long",
    day: "numeric",
    weekday: "long",
  }).format(new Date()),
);

const currentTitle = computed(
  () => playerState.value.currentSong?.name || props.track?.title || "暂无音乐",
);
const currentArtist = computed(
  () =>
    playerState.value.currentSong?.artist ||
    props.track?.artist ||
    (props.editable ? "从同步歌单中选择曲目" : "选择一首曲目开始播放"),
);
const currentCover = computed(
  () => playerState.value.currentSong?.cover || props.track?.cover || "",
);
const playbackProgress = computed(() => {
  const currentTime = Number(playerState.value.currentTime ?? 0);
  const duration = Number(playerState.value.duration ?? 0);
  if (!Number.isFinite(duration) || duration <= 0) return 0;
  return Math.min(100, Math.max(0, (currentTime / duration) * 100));
});

/**
 * 将播放器秒数格式化为分钟和秒。
 *
 * @param value - 播放器当前时间或总时长，单位为秒。
 * @returns 两位分钟和两位秒数组成的时间文本；输入无效时返回占位文本。
 */
function formatPlaybackTime(value?: number): string {
  if (!Number.isFinite(value) || Number(value) < 0) return "--:--";
  const totalSeconds = Math.floor(Number(value));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return `${String(minutes).padStart(2, "0")}:${seconds}`;
}

const currentTimeLabel = computed(() =>
  formatPlaybackTime(playerState.value.currentTime),
);
const durationLabel = computed(() =>
  playerState.value.duration && playerState.value.duration > 0
    ? `-${formatPlaybackTime(
        Math.max(
          0,
          Number(playerState.value.duration) -
            Number(playerState.value.currentTime || 0),
        ),
      )}`
    : "--:--",
);

const playbackMode = computed<MusicPlaybackMode>(() => {
  if (playerState.value.playbackMode) return playerState.value.playbackMode;
  if (playerState.value.isShuffle) return "shuffle";
  if (playerState.value.repeatMode === "one") return "one";
  return "sequential";
});

const repeatLabel = computed(() => {
  if (playbackMode.value === "one") return "单曲循环";
  if (playbackMode.value === "shuffle") return "随机播放";
  return "顺序播放";
});

const playbackModeIcon = computed<IconName>(() => {
  if (playbackMode.value === "one") return "repeatOne";
  if (playbackMode.value === "shuffle") return "shuffle";
  return "listOrdered";
});

const playbackModes: MusicPlaybackMode[] = ["sequential", "one", "shuffle"];

/**
 * 按顺序切换顺序播放、单曲循环和随机播放模式。
 *
 * @returns 无返回值；切换结果通过窗口事件通知播放器宿主。
 */
function cyclePlaybackMode(): void {
  const currentIndex = playbackModes.indexOf(playbackMode.value);
  const nextMode = playbackModes[(currentIndex + 1) % playbackModes.length];
  window.dispatchEvent(
    new CustomEvent("music-player-mode", { detail: nextMode }),
  );
}

const collapsedTitle = computed(() => {
  if (banner.value) return banner.value.message;
  if (activeCollapsedItem.value === "weather") {
    return weather.value
      ? `${weather.value.temperature}° ${weather.value.weather}`
      : weatherLoading.value
        ? "正在读取天气"
        : "天气暂不可用";
  }
  if (activeCollapsedItem.value === "greeting") return greeting.value;
  return quote.value.text;
});

const collapsedDetail = computed(() => {
  if (banner.value) return `${relativeTime(banner.value.time)} · 点击查看`;
  if (activeCollapsedItem.value === "weather") {
    return weather.value
      ? `${weather.value.humidity}% 湿度 · ${airQualityLabel(weather.value.aqi)}`
      : "点击展开控制台";
  }
  if (activeCollapsedItem.value === "greeting") return greetingDate.value;
  return quote.value.from ? `—— ${quote.value.from}` : "今日一言";
});

const forecastHigh = computed(() => {
  if (!weather.value) return null;
  return (
    weather.value.highTemperature ??
    Math.max(weather.value.temperature, weather.value.feelsLike)
  );
});

const forecastLow = computed(() => {
  if (!weather.value) return null;
  return (
    weather.value.lowTemperature ??
    Math.min(weather.value.temperature, weather.value.feelsLike)
  );
});

const collapsedIcon = computed<IconName>(() => {
  if (banner.value) return categoryIcons[banner.value.category];
  if (activeCollapsedItem.value === "weather") {
    return (
      weather.value?.iconName || (weatherLoading.value ? "refresh" : "cloud")
    );
  }
  if (activeCollapsedItem.value === "greeting") return "sparkles";
  return "messageCircle";
});

/** 横幅状态下图标按通知级别着色；常规内容保持主题色。 */
const collapsedIconClass = computed(() =>
  banner.value ? `is-${banner.value.tone}` : "",
);

/**
 * 控制台根节点的样式类。
 *
 * 收起状态下收到横幅通知时，注入 `is-notifying` 与 `is-{tone}`：
 * - `is-notifying` 只展开胶囊并触发入场反馈，面板材质沿用默认毛玻璃，
 *   不额外叠加级别色背景、着色描边或发光投影；
 * - `is-{tone}` 注入 `--notice-accent`，仅用于指示点、状态文字与图标线条。
 *
 * 展开后不再注入——通知改由通知中心展示，避免横幅态抢夺注意力。
 */
const panelClass = computed<Record<string, boolean>>(() => {
  const cls: Record<string, boolean> = { "is-expanded": isExpanded.value };
  if (!isExpanded.value && banner.value) {
    cls["is-notifying"] = true;
    cls[`is-${banner.value.tone}`] = true;
  }
  /* 控制面板背景始终保持不变：Tab 切换只换内容，不改变面板材质。 */
  return cls;
});

/**
 * 发布播放器播放或暂停事件。
 *
 * @returns 无返回值。
 */
function publishPlayerToggle(): void {
  window.dispatchEvent(new CustomEvent("music-player-toggle"));
}

/**
 * 发布带可选数值载荷的播放器控制事件。
 *
 * @param name - 浏览器窗口事件名称。
 * @param detail - 事件携带的数值，例如跳转到的秒数。
 * @returns 无返回值。
 */
function publishPlayerEvent(name: string, detail?: number): void {
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

/**
 * 读取进度滑块值并请求播放器跳转。
 *
 * @param event - 进度输入框产生的 DOM 事件。
 * @returns 无返回值；非法数值会被直接忽略。
 */
function seekPlayback(event: Event): void {
  const value = Number((event.target as HTMLInputElement).value);
  if (Number.isFinite(value)) publishPlayerEvent("music-player-seek", value);
}

/**
 * 接收播放器宿主发布的最新播放状态。
 *
 * @param event - 携带播放器状态的自定义事件。
 * @returns 无返回值。
 */
function handlePlayerState(event: Event): void {
  const next = (event as CustomEvent<PlayerState>).detail;
  if (next && typeof next === "object") playerState.value = next;
}

/**
 * 请求一条远程一言，并在请求失败时保留本地回退文案。
 *
 * @returns 一个在请求和状态更新完成后结束的异步任务。
 */
async function loadQuote(): Promise<void> {
  quoteRequest = new AbortController();
  const timer = window.setTimeout(() => quoteRequest?.abort(), 8_000);
  try {
    const response = await fetch(
      "https://v1.hitokoto.cn/?c=a&c=b&c=c&encode=json",
      {
        signal: quoteRequest.signal,
      },
    );
    if (!response.ok) throw new Error("一言请求失败");
    const payload = (await response.json()) as {
      hitokoto?: unknown;
      from?: unknown;
      from_who?: unknown;
    };
    if (typeof payload.hitokoto !== "string" || !payload.hitokoto.trim())
      return;
    quote.value = {
      text: payload.hitokoto.trim(),
      from:
        typeof payload.from === "string" && payload.from.trim()
          ? payload.from.trim()
          : typeof payload.from_who === "string" && payload.from_who.trim()
            ? payload.from_who.trim()
            : "一言",
    };
  } catch {
    // 语录服务不可用时，使用本地回退文本，保证控制台区域仍然有内容。
  } finally {
    window.clearTimeout(timer);
    quoteRequest = null;
  }
}

/**
 * 在控制台收起状态下轮换一言、天气和问候内容。
 *
 * 横幅通知展示期间暂停轮换，通知让位后才继续。
 *
 * @returns 无返回值；展开状态下不会轮换。
 */
function rotateCollapsedItem(): void {
  if (isExpanded.value || banner.value) return;
  const items: CollapsedItem[] = ["quote", "weather", "greeting"];
  const currentIndex = items.indexOf(activeCollapsedItem.value);
  activeCollapsedItem.value = items[(currentIndex + 1) % items.length];
}

/**
 * 启动收起状态内容轮换定时器。
 *
 * @returns 无返回值。
 */
function startRotation(): void {
  if (rotationTimer !== null) window.clearInterval(rotationTimer);
  rotationTimer = window.setInterval(rotateCollapsedItem, 4_800);
}

/**
 * 停止收起状态内容轮换定时器。
 *
 * @returns 无返回值。
 */
function stopRotation(): void {
  if (rotationTimer !== null) {
    window.clearInterval(rotationTimer);
    rotationTimer = null;
  }
}

/**
 * 切换控制台展开状态。
 *
 * @param nextTab - 收起状态下点击胶囊时希望进入的分区；展开中忽略。
 * @returns 无返回值。
 */
function toggleExpanded(nextTab: PanelTab = "control"): void {
  if (!isExpanded.value) {
    panelTab.value = nextTab;
    isExpanded.value = true;
    stopRotation();
    return;
  }
  isExpanded.value = false;
  startRotation();
}

/**
 * 使用 Escape 键关闭已展开的控制台。
 *
 * @param event - 键盘事件。
 * @returns 无返回值。
 */
function handleKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape" && isExpanded.value) {
    isExpanded.value = false;
    startRotation();
  }
}

/**
 * 点击控制台外部时关闭展开面板。
 *
 * @param event - 文档级指针事件。
 * @returns 无返回值。
 */
function handleDocumentPointerDown(event: PointerEvent): void {
  if (!isExpanded.value || !(event.target instanceof Node)) return;
  if (panelElement.value?.contains(event.target)) return;
  isExpanded.value = false;
  startRotation();
}

/**
 * 读取元素的纵向盒模型附加高度。
 *
 * @param element - 需要读取计算样式的元素。
 * @returns 内边距与边框高度之和。
 */
function readVerticalBoxExtra(element: HTMLElement): number {
  const styles = window.getComputedStyle(element);
  /**
   * 将 CSS 尺寸文本转换为非负数。
   *
   * @param value - 浏览器计算样式中的尺寸文本。
   * @returns 可参与高度计算的非负像素值。
   */
  function parseSize(value: string): number {
    return Number.parseFloat(value) || 0;
  }

  return (
    parseSize(styles.paddingTop) +
    parseSize(styles.paddingBottom) +
    parseSize(styles.borderTopWidth) +
    parseSize(styles.borderBottomWidth)
  );
}

/**
 * 读取面板当前允许的最大高度。
 *
 * @param panel - 状态控制台面板元素。
 * @returns 计算后的最大高度；未设置上限时返回 Infinity。
 */
function readPanelMaxHeight(panel: HTMLElement): number {
  const { maxHeight } = window.getComputedStyle(panel);
  if (maxHeight === "none") return Number.POSITIVE_INFINITY;
  return Number.parseFloat(maxHeight) || Number.POSITIVE_INFINITY;
}

/**
 * 按展开面板的真实内容高度更新面板高度。
 *
 * 播放列表展开、收起或曲目数量变化时都会重新测量，让高度过渡保持连续。
 *
 * @returns 无返回值；未展开或元素缺失时直接结束。
 */
function measureExpandedHeight(): void {
  measureFrame = null;
  const panel = panelElement.value;
  const inner = expandedInnerRef.value;
  if (!panel || !inner || !isExpanded.value) return;

  const nextHeight = Math.ceil(
    Math.min(
      inner.offsetHeight + readVerticalBoxExtra(panel),
      readPanelMaxHeight(panel),
    ),
  );

  if (nextHeight > 0 && nextHeight !== expandedHeight.value) {
    expandedHeight.value = nextHeight;
  }
}

/**
 * 合并同一帧内的多次高度测量请求。
 *
 * @returns 无返回值；重复请求会在下一帧统一测量。
 */
function scheduleExpandedMeasure(): void {
  if (measureFrame !== null) return;
  measureFrame = window.requestAnimationFrame(measureExpandedHeight);
}

/**
 * 监听展开内容尺寸，保证播放列表等局部内容变化能被高度过渡捕获。
 *
 * @returns 无返回值；展开内容未挂载时释放监听。
 */
async function observeExpandedContent(): Promise<void> {
  expandedResizeObserver?.disconnect();
  expandedResizeObserver = null;
  if (!isExpanded.value) return;

  await nextTick();
  const inner = expandedInnerRef.value;
  if (!inner) return;

  expandedResizeObserver = new ResizeObserver(scheduleExpandedMeasure);
  expandedResizeObserver.observe(inner);
  measureExpandedHeight();
}

watch(isExpanded, () => {
  musicHeight.value = null;
  void observeExpandedContent();
});

/* 横幅通知到达时暂停收起态轮换，让位后恢复。 */
watch(
  () => notificationState.latest?.id ?? null,
  (id) => {
    if (id !== null) stopRotation();
    else if (!isExpanded.value) startRotation();
  },
);

/* 展开状态下收到新通知，自动切到通知分区并计为已读（手机通知中心的行为）。 */
watch(
  () => notificationState.items[0]?.id ?? 0,
  (id) => {
    if (id > 0 && isExpanded.value) {
      panelTab.value = "notifications";
      markNotificationsRead();
    }
  },
);

/* 进入通知分区即视为已读。 */
watch(panelTab, (tab) => {
  if (tab === "notifications") markNotificationsRead();
});

/* 重渲染前锁定旧高度，重渲染后再量新内容高度并统一过渡。 */
watch(isPlaylistOpen, freezeMusicHeight, { flush: "sync" });
watch(isPlaylistOpen, applyMusicTargetHeight, { flush: "post" });

/**
 * 内容替换前锁定音乐卡片的当前高度，并暂停尺寸监听。
 *
 * 同步 watch 保证在 Vue 重渲染前拿到旧高度，
 * 否则新内容挂载的瞬间卡片会直接跳到目标高度。
 *
 * @returns 无返回值；面板未展开或卡片不存在时跳过。
 */
function freezeMusicHeight(): void {
  const card = musicRef.value;
  if (!isExpanded.value || !card) return;

  musicHeight.value = Math.round(card.getBoundingClientRect().height);
  expandedResizeObserver?.disconnect();
  expandedResizeObserver = null;
  if (measureFrame !== null) {
    window.cancelAnimationFrame(measureFrame);
    measureFrame = null;
  }
}

/**
 * 读取新内容的自然高度，并让卡片与面板沿同一条曲线过渡过去。
 *
 * 舞台高度不受卡片固定高度影响，因此能稳定拿到目标值；
 * 面板同步累加相同增量，底边才能和卡片一起移动。
 *
 * @returns 无返回值；元素缺失或新内容尚未布局时跳过。
 */
function applyMusicTargetHeight(): void {
  const card = musicRef.value;
  const stage = stageRef.value;
  if (!card || !stage) return;

  const natural = Math.round(stage.offsetHeight + readVerticalBoxExtra(card));
  const frozen = musicHeight.value;

  if (frozen === null) {
    musicHeight.value = natural;
    return;
  }

  const delta = natural - frozen;
  if (Math.abs(delta) < 1) {
    musicHeight.value = null;
    void observeExpandedContent();
    return;
  }

  musicHeight.value = natural;
  const panel = panelElement.value;
  if (expandedHeight.value !== null) {
    expandedHeight.value = Math.min(
      expandedHeight.value + delta,
      panel ? readPanelMaxHeight(panel) : Number.POSITIVE_INFINITY,
    );
  }
}

/**
 * 高度过渡结束后释放固定高度，恢复由内容自然撑开。
 *
 * 结束值与自然高度一致，因此不会产生二次跳动；随后重启尺寸监听。
 *
 * @param event - 卡片冒泡上来的过渡结束事件。
 * @returns 无返回值；非本卡片的 height 过渡时忽略。
 */
function handleMusicHeightTransitionEnd(event: TransitionEvent): void {
  if (event.target !== musicRef.value || event.propertyName !== "height")
    return;
  musicHeight.value = null;
  void observeExpandedContent();
}

onMounted(async () => {
  isTeleportReady.value = true;
  window.addEventListener("music-player-state-change", handlePlayerState);
  window.addEventListener("keydown", handleKeydown);
  window.addEventListener("resize", scheduleExpandedMeasure);
  document.addEventListener("pointerdown", handleDocumentPointerDown);
  window.dispatchEvent(new CustomEvent("music-player-request-state"));

  weather.value = await getWeatherInfo();
  weatherLoading.value = false;
  void loadQuote();
  startRotation();
});

onBeforeUnmount(() => {
  window.removeEventListener("music-player-state-change", handlePlayerState);
  window.removeEventListener("keydown", handleKeydown);
  window.removeEventListener("resize", scheduleExpandedMeasure);
  document.removeEventListener("pointerdown", handleDocumentPointerDown);
  expandedResizeObserver?.disconnect();
  expandedResizeObserver = null;
  if (measureFrame !== null) window.cancelAnimationFrame(measureFrame);
  stopRotation();
  quoteRequest?.abort();
});
</script>

<template>
  <Teleport to="body" :disabled="!isTeleportReady">
    <aside
      ref="panelElement"
      class="control-panel"
      :class="panelClass"
      :style="panelStyle"
      aria-label="状态控制台"
    >
      <div class="control-panel-viewport">
        <Transition name="control-panel-swap">
          <button
            v-if="!isExpanded"
            key="collapsed"
            type="button"
            class="control-collapsed"
            :aria-label="
              banner
                ? `${bannerLabel}：${banner.message}，点击查看通知`
                : '展开状态控制台'
            "
            aria-expanded="false"
            @click="toggleExpanded(banner ? 'notifications' : 'control')"
          >
            <span
              class="control-collapsed-icon"
              :class="collapsedIconClass"
            >
              <img
                v-if="!banner && activeCollapsedItem === 'weather' && weather"
                :src="weather.icon"
                :alt="weather.weather"
              />
              <IconGlyph v-else :name="collapsedIcon" :size="16" />
            </span>
            <Transition name="control-copy" mode="out-in">
              <!-- 横幅期间用固定 key：连续多条通知只更新文字，不再触发额外的
                   进出场过渡，避免 out-in 被快速 key 跳变卡死。 -->
              <span
                :key="banner ? 'notice' : activeCollapsedItem"
                class="control-collapsed-copy"
              >
                <small v-if="banner" class="control-notice-kicker">
                  {{ bannerLabel }}
                </small>
                <strong>{{ collapsedTitle }}</strong>
                <em>{{ collapsedDetail }}</em>
              </span>
            </Transition>
            <span
              v-if="
                !banner &&
                unreadCount > 0
              "
              class="control-collapsed-badge"
              aria-label="未读通知数量"
            >
              <i aria-hidden="true"></i>{{ unreadCount > 9 ? "9+" : unreadCount }}
            </span>
            <span
              v-if="
                !banner &&
                activeCollapsedItem === 'weather' &&
                typeof weather?.aqi === 'number'
              "
              class="control-collapsed-aqi"
              aria-label="空气质量指数"
            >
              <i aria-hidden="true"></i>{{ weather.aqi }}
            </span>
            <span
              v-if="banner"
              class="control-notice-open"
              aria-hidden="true"
            >
              <IconGlyph name="chevronDown" :size="13" />
            </span>
            <IconGlyph
              v-else
              class="control-expand-icon"
              name="chevronDown"
              :size="14"
            />
          </button>

          <div v-else key="expanded" class="control-expanded">
            <div ref="expandedInnerRef" class="control-expanded-inner">
              <div class="control-head">
                <div class="control-tabs" role="tablist" aria-label="控制台分区">
                  <button
                    type="button"
                    role="tab"
                    :aria-selected="panelTab === 'control'"
                    :class="[
                      'control-tab',
                      { 'is-active': panelTab === 'control' },
                    ]"
                    @click="panelTab = 'control'"
                  >
                    控制
                  </button>
                  <button
                    type="button"
                    role="tab"
                    :aria-selected="panelTab === 'notifications'"
                    :class="[
                      'control-tab',
                      { 'is-active': panelTab === 'notifications' },
                    ]"
                    @click="panelTab = 'notifications'"
                  >
                    通知
                    <i
                      v-if="unreadCount > 0"
                      class="control-tab-dot"
                      aria-hidden="true"
                    ></i>
                  </button>
                </div>
                <button
                  type="button"
                  class="control-close"
                  aria-label="收起状态控制台"
                  title="收起"
                  aria-expanded="true"
                  @click="toggleExpanded()"
                >
                  <IconGlyph name="chevronDown" :size="15" />
                </button>
              </div>

              <div class="control-pane-stack">
                <!-- 控制分区常驻不动：面板高度永远由它决定，通知分区作为
                     磨砂浮层盖在上面，切 Tab 时高度不会突变。 -->
                <div
                  class="control-pane"
                  :class="{
                    'is-notifications-visible': panelTab === 'notifications',
                  }"
                  :inert="panelTab === 'notifications'"
                  :aria-hidden="panelTab === 'notifications'"
                >
                  <section class="control-quote glass-panel" aria-label="一言">
                <div>
                  <p>{{ quote.text }}</p>
                  <small v-if="quote.from">—— {{ quote.from }}</small>
                </div>
              </section>

              <section
                class="control-weather"
                :class="{ 'is-unavailable': !weather }"
                aria-label="天气信息"
              >
                <span class="control-weather-icon">
                  <img
                    v-if="weather"
                    :src="weather.icon"
                    :alt="weather.weather"
                  />
                  <IconGlyph
                    v-else
                    :name="weatherLoading ? 'refresh' : 'cloud'"
                    :size="22"
                  />
                </span>

                <div v-if="weather" class="control-weather-copy">
                  <div class="control-weather-primary">
                    <strong>{{ weather.temperature }}<sup>°C</sup></strong>
                    <span>{{ weather.city }}</span>
                  </div>
                  <div class="control-weather-meta" aria-label="天气指标">
                    <span>{{ weather.weather }}</span>
                    <span
                      ><IconGlyph name="droplets" :size="11" />{{
                        weather.humidity
                      }}%</span
                    >
                    <span
                      ><IconGlyph name="wind" :size="11" />{{
                        weather.windSpeed
                      }}</span
                    >
                  </div>
                </div>

                <div
                  v-else
                  class="control-weather-copy control-weather-unavailable-copy"
                >
                  <strong>{{
                    weatherLoading ? "正在读取天气" : "天气暂不可用"
                  }}</strong>
                  <span>{{
                    weatherLoading ? "正在定位" : "暂无可用定位"
                  }}</span>
                </div>

                <div
                  v-if="weather"
                  class="control-weather-forecast"
                  aria-label="今日天气预报"
                >
                  <span>{{ weather.weather }}</span>
                  <div>
                    <img :src="weather.icon" :alt="weather.weather" />
                    <strong>{{ forecastHigh }}°</strong>
                  </div>
                  <small>{{ forecastLow }}°</small>
                </div>
              </section>

              <section
                ref="musicRef"
                class="control-music"
                :style="musicStyle"
                :aria-label="isPlaylistOpen ? '播放列表' : '音乐播放器'"
                @transitionend="handleMusicHeightTransitionEnd"
              >
                <div ref="stageRef" class="control-music-stage">
                  <Transition name="control-music-view">
                    <MusicPicker
                      v-if="isPlaylistOpen"
                      key="playlist"
                      v-model:open="isPlaylistOpen"
                      :track="props.track"
                      :catalog="props.catalog"
                      :editable="props.editable"
                      compact
                      embedded
                    />

                    <div v-else key="player" class="control-music-player">
                      <div class="control-music-top">
                        <span class="control-music-cover-wrap">
                          <FallbackImage
                            class="control-music-cover"
                            :src="currentCover"
                            :alt="`${currentTitle} 封面`"
                            fallback-icon="music"
                            :icon-size="20"
                          />
                        </span>
                        <div class="control-section-copy control-music-copy">
                          <strong>{{ currentTitle }}</strong>
                          <small>{{ currentArtist }}</small>
                        </div>
                        <span
                          class="control-music-equalizer"
                          :class="{ 'is-playing': playerState.isPlaying }"
                          aria-hidden="true"
                        >
                          <i></i><i></i><i></i>
                        </span>
                      </div>

                      <div class="control-music-progress" aria-label="播放进度">
                        <span
                          class="control-music-progress-spacer"
                          aria-hidden="true"
                        ></span>
                        <span>{{ currentTimeLabel }}</span>
                        <input
                          class="m-range control-music-progress-input"
                          type="range"
                          min="0"
                          :max="Math.max(playerState.duration || 0, 1)"
                          :value="playerState.currentTime || 0"
                          :style="{
                            '--music-progress': `${playbackProgress}%`,
                          }"
                          aria-label="调整播放进度"
                          @input="seekPlayback"
                        />
                        <span>{{ durationLabel }}</span>
                      </div>

                      <div class="control-music-toolbar">
                        <button
                          type="button"
                          class="control-music-action"
                          aria-label="歌词（暂无同步歌词）"
                          title="暂无同步歌词"
                          disabled
                        >
                          <IconGlyph name="messagesSquare" :size="14" />
                        </button>
                        <button
                          type="button"
                          class="control-music-action"
                          :class="{
                            'is-active': playbackMode !== 'sequential',
                          }"
                          :aria-label="repeatLabel"
                          :title="repeatLabel"
                          @click="cyclePlaybackMode"
                        >
                          <IconGlyph :name="playbackModeIcon" :size="14" />
                        </button>
                        <button
                          type="button"
                          class="control-music-action control-music-skip"
                          aria-label="上一首"
                          title="上一首"
                          @click="publishPlayerEvent('music-player-previous')"
                        >
                          <IconGlyph name="skipBack" :size="15" />
                        </button>
                        <button
                          type="button"
                          class="control-play control-music-primary"
                          :aria-label="
                            playerState.isPlaying ? '暂停音乐' : '播放音乐'
                          "
                          :title="
                            playerState.isPlaying ? '暂停音乐' : '播放音乐'
                          "
                          @click="publishPlayerToggle"
                        >
                          <IconGlyph
                            :name="playerState.isPlaying ? 'pause' : 'play'"
                            :size="17"
                          />
                        </button>
                        <button
                          type="button"
                          class="control-music-action control-music-skip"
                          aria-label="下一首"
                          title="下一首"
                          @click="publishPlayerEvent('music-player-next')"
                        >
                          <IconGlyph name="skipForward" :size="15" />
                        </button>
                        <button
                          type="button"
                          class="control-music-action"
                          :class="{ 'is-active': playerState.isMuted }"
                          :aria-label="
                            playerState.isMuted ? '取消静音' : '静音'
                          "
                          :title="playerState.isMuted ? '取消静音' : '静音'"
                          @click="publishPlayerEvent('music-player-mute')"
                        >
                          <IconGlyph
                            :name="playerState.isMuted ? 'volumeX' : 'volume'"
                            :size="15"
                          />
                        </button>
                        <button
                          type="button"
                          class="control-music-action"
                          aria-label="打开播放列表"
                          title="打开播放列表"
                          @click="isPlaylistOpen = true"
                        >
                          <IconGlyph name="listMusic" :size="14" />
                        </button>
                      </div>
                    </div>
                  </Transition>
                </div>
              </section>
                </div>

                <Transition name="control-tab">
                  <div
                    v-if="panelTab === 'notifications'"
                    class="control-pane control-notifications"
                    aria-label="通知中心"
                  >
                    <TransitionGroup
                      v-if="notificationState.items.length"
                      name="control-notice-list"
                      tag="div"
                      class="control-notice-list"
                    >
                      <article
                        v-for="(item, index) in notificationState.items"
                        :key="item.id"
                        :class="[
                          'control-notice',
                          `is-${item.tone}`,
                          { 'is-latest': index === 0 },
                        ]"
                      >
                        <span class="control-notice-icon">
                          <IconGlyph
                            :name="categoryIcons[item.category]"
                            :size="17"
                            :stroke-width="2.4"
                          />
                        </span>
                        <div class="control-notice-copy">
                          <div class="control-notice-heading">
                            <strong>{{ categoryLabels[item.category] }}</strong>
                            <div class="control-notice-meta">
                              <span
                                v-if="index === 0"
                                class="control-notice-latest"
                              >
                                最新
                              </span>
                              <time :datetime="new Date(item.time).toISOString()">
                                {{ relativeTime(item.time) }}
                              </time>
                            </div>
                          </div>
                          <p>{{ item.message }}</p>
                        </div>
                      </article>
                    </TransitionGroup>

                    <p v-else class="control-notice-empty">暂无通知</p>

                    <button
                      v-if="notificationState.items.length"
                      type="button"
                      class="control-notice-clear"
                      @click="clearNotifications"
                    >
                      <IconGlyph name="trash" :size="12" />
                      <span>清空通知</span>
                    </button>
                  </div>
                </Transition>
              </div>
            </div>
          </div>
        </Transition>
      </div>
    </aside>
  </Teleport>
</template>

<style scoped>
.control-panel {
  position: fixed;
  z-index: 70;
  top: 16px;
  right: 16px;
  width: min(400px, calc(100vw - 32px));
  height: 48px;
  min-height: 48px;
  overflow: visible;
  border: 1px solid rgba(255, 255, 255, 0.86);
  /* 面板与内层按钮共用同一圆角，避免 hover 时出现两条不同弧线。 */
  --panel-radius: 24px;
  border-radius: var(--panel-radius);
  color: var(--ink);
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 9px 24px rgba(54, 45, 106, 0.11);
  backdrop-filter: var(--glass-blur);
  /* 控制栏贴着右上角，缩放锚定该角，hover 放大时不会向外漂出视口。 */
  transform-origin: top right;
  transition:
    width 0.46s cubic-bezier(0.22, 1, 0.36, 1),
    height 0.46s cubic-bezier(0.22, 1, 0.36, 1),
    border-radius 0.42s ease,
    scale 0.26s cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 0.32s ease,
    border-color 0.34s ease,
    background 0.34s ease;
}

/* 通知指示点：平时不可见，横幅态在控制栏右上角外侧浮现。
   7px tone 色纯色实心，不加白边或发光，不碰载体本体。 */
.control-panel::after {
  content: "";
  position: absolute;
  top: -3px;
  right: 14px;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--notice-accent, var(--theme));
  opacity: 0;
  transform: scale(0.6);
  pointer-events: none;
  z-index: 4;
  transition:
    opacity 0.28s ease,
    transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}

.control-panel.is-expanded {
  --panel-radius: 18px;
  width: min(400px, calc(100vw - 32px));
  height: min(384px, calc(100svh - 32px));
  max-height: calc(100svh - 32px);
  border-radius: var(--panel-radius);
  box-shadow: 0 18px 42px rgba(54, 45, 106, 0.16);
}

.control-panel:not(.is-expanded) {
  width: min(160px, calc(100vw - 32px));
}

/* 通知态只改变胶囊尺寸与内部信息层级：面板沿用默认毛玻璃，
   不额外叠加级别色底、着色描边、发光投影或倒计时进度线；
   固定定位保证尺寸变化不会推动首页内容，横幅结束后平滑收回原尺寸。 */
.control-panel.is-notifying {
  --panel-radius: 20px;
  width: min(320px, calc(100vw - 32px));
  height: 64px;
  min-height: 64px;
  border-radius: var(--panel-radius);
  animation: notice-panel-arrive 0.52s cubic-bezier(0.22, 1, 0.36, 1);
}

@keyframes notice-panel-arrive {
  0% {
    transform: translateY(-5px) scale(0.985);
  }

  64% {
    transform: translateY(1px) scale(1.004);
  }

  100% {
    transform: translateY(0) scale(1);
  }
}

.control-panel.is-notifying::after {
  opacity: 1;
  transform: scale(1);
}

/* 各通知级别只给小面积元素上色（指示点、状态文字、图标线条）：
   success 用绿、error 用粉、neutral 跟随主题色；面板本体不着色。 */
.control-panel.is-success {
  --notice-accent: var(--green);
}

.control-panel.is-error {
  --notice-accent: #bb4e6d;
}

.control-panel.is-neutral {
  --notice-accent: var(--theme);
}

.control-panel-viewport {
  position: relative;
  width: 100%;
  height: 100%;
}

.control-collapsed,
.control-expanded {
  position: absolute;
  inset: 0;
  border: 0;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
}

.control-collapsed {
  display: flex;
  width: 100%;
  height: auto;
  min-height: 48px;
  padding: 5px 8px;
  align-items: center;
  gap: 5px;
  border-radius: var(--panel-radius, 24px);
  color: inherit;
  text-align: left;
}

/* hover 反馈只作用在面板本体：整块玻璃轻微提亮并等比放大 2.5%，
   投影同步略微加深以强化「靠近」感；内层按钮始终透明且不单独变换，
   因此不会出现第二层白块、错位边缘或不一致的圆角。
   这里用独立的 scale 属性而不是 transform：通知入场动画的关键帧占用了
   transform，两者可叠加且互不覆盖；缩放锚定右上角，贴边位置不漂移。 */
.control-panel:not(.is-expanded):hover {
  scale: 1.025;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 11px 27px rgba(54, 45, 106, 0.13);
}

.control-collapsed-icon {
  display: flex;
  width: 22px;
  height: 26px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  color: var(--theme);
  transition:
    width 0.38s cubic-bezier(0.22, 1, 0.36, 1),
    height 0.38s cubic-bezier(0.22, 1, 0.36, 1),
    border-radius 0.38s ease,
    color 0.24s ease,
    background 0.24s ease,
    box-shadow 0.24s ease;
}

.control-collapsed-icon img {
  width: 22px;
  height: 22px;
  object-fit: contain;
}

.control-collapsed-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 1px;
  line-height: 1.12;
}

.control-collapsed-copy small,
.control-collapsed-copy strong,
.control-collapsed-copy em {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.control-collapsed-copy small {
  color: var(--muted);
  font-size: 0.46rem;
  font-weight: 600;
}

.control-collapsed-copy strong {
  font-size: 0.62rem;
  font-weight: 760;
}

.control-collapsed-copy em {
  color: var(--muted);
  font-size: 0.46rem;
  font-style: normal;
}

.control-expand-icon {
  flex: 0 0 auto;
  color: var(--muted);
}

.control-collapsed-aqi {
  display: inline-flex;
  min-width: 25px;
  height: 21px;
  padding: 0 6px 0 5px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1px solid rgba(53, 165, 123, 0.16);
  border-radius: 999px;
  color: #21845f;
  background: rgba(53, 165, 123, 0.11);
  font-size: 0.48rem;
  font-weight: 760;
}

.control-collapsed-aqi i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 3px rgba(53, 165, 123, 0.1);
}

/* 未读通知角标：和 AQI 徽章同构，但用主题色表示「有新东西」。 */
.control-collapsed-badge {
  display: inline-flex;
  min-width: 25px;
  height: 21px;
  padding: 0 6px 0 5px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1px solid color-mix(in srgb, var(--theme) 24%, transparent);
  border-radius: 999px;
  color: var(--theme-strong);
  background: color-mix(in srgb, var(--theme) 12%, transparent);
  font-size: 0.48rem;
  font-weight: 760;
}

.control-collapsed-badge i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme) 12%, transparent);
}

/* 横幅通知的图标按级别着色。 */
.control-collapsed-icon.is-success {
  color: var(--green);
}

.control-collapsed-icon.is-error {
  color: #bb4e6d;
}

.control-collapsed-icon.is-neutral {
  color: var(--theme);
}

/* 通知卡片内部：图标成为明确的视觉锚点，文字形成「状态 / 消息 / 时间」层级。 */
.control-panel.is-notifying .control-collapsed {
  padding: 9px 12px 10px 10px;
  gap: 10px;
}

.control-panel.is-notifying .control-collapsed-icon {
  width: 38px;
  height: 38px;
  border-radius: 13px;
  animation: notice-icon-arrive 0.56s cubic-bezier(0.22, 1, 0.36, 1);
}

.control-panel.is-notifying .control-collapsed-icon :deep(svg) {
  width: 18px;
  height: 18px;
}

.control-panel.is-notifying .control-collapsed-copy {
  gap: 2px;
}

.control-notice-kicker {
  color: var(--notice-accent, var(--theme)) !important;
  letter-spacing: 0.08em;
  line-height: 1;
}

.control-panel.is-notifying .control-collapsed-copy strong {
  color: var(--ink);
  font-size: 0.68rem;
  line-height: 1.15;
}

.control-panel.is-notifying .control-collapsed-copy em {
  color: var(--muted-strong);
  font-size: 0.48rem;
}

.control-notice-open {
  display: inline-flex;
  width: 27px;
  height: 27px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  color: var(--notice-accent, var(--theme));
  transition:
    color 0.2s ease,
    transform 0.2s ease;
}

.control-notice-open svg {
  transform: rotate(-90deg);
}

.control-collapsed:hover .control-notice-open {
  transform: translateX(2px);
}

@keyframes notice-icon-arrive {
  0% {
    transform: scale(0.72) rotate(-8deg);
  }

  64% {
    transform: scale(1.06) rotate(1deg);
  }

  100% {
    transform: scale(1) rotate(0);
  }
}

/* 不绘制外层「最近通知」容器：底层控制分区淡出，通知直接铺在面板上。
   每条消息仍是独立卡片，列表与页脚分区固定，仅消息区域滚动。 */
.control-notifications {
  position: absolute;
  /* 左右各向外扩 16px，把「阴影呼吸空间」放在滚动容器之外；
     列表再用等量 padding 把卡片推回来，卡片边缘仍与上方 Tab 栏、
     下方清空按钮保持同一条垂直对齐线。 */
  inset: 0 -16px;
  z-index: 2;
  gap: 8px;
  padding: 0;
  overflow: hidden;
  border-radius: 16px;
  background: transparent;
  backdrop-filter: none;
}

.control-notice-list {
  position: relative;
  display: flex;
  min-height: 0;
  /* 水平 16px 抵消分区外扩 → 卡片与 Tab 栏对齐；
     上 14 / 下 20 覆盖 0 3px 8px 外投影的全部可见范围（约 13px 上、
     19px 下、16px 左右），四边柔光都落在 padding 内，不会被切出硬线。 */
  padding: 14px 16px 20px;
  overflow-y: auto;
  flex: 1;
  flex-direction: column;
  gap: 8px;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: rgba(118, 126, 151, 0.26) transparent;
}

/* 消息卡片严格沿用全站 .glass-panel 的毛玻璃配方：
   半透明白玻璃底、白色发丝边、内高光 + 大范围柔光投影、背景模糊与增饱和。
   叠加在近白的面板上时用更透的 --glass-soft，让玻璃层次能显出来；
   不额外加色条、渐变或状态色，材质本身才是视觉主角。 */
.control-notice {
  position: relative;
  display: grid;
  min-width: 0;
  padding: 12px 13px;
  flex: 0 0 auto;
  grid-template-columns: 34px minmax(0, 1fr);
  align-items: flex-start;
  gap: 11px;
  overflow: hidden;
  border: 1px solid var(--glass-border);
  border-radius: 15px;
  background: var(--glass-soft);
  /* --glass-shadow 的 13px/34px 是给整块大面板用的，套到滚动列表里的
     小卡片必然被四边裁平、切出硬边。这里按同样的玻璃材质语言收敛到
     卡片尺度：顶部白色内高光 + 底部极淡内暗边 + 一圈紧凑柔光，
     半径小于列表留白，阴影四边都完整可见。 */
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.72),
    inset 0 -1px 0 rgba(54, 45, 106, 0.045),
    0 3px 8px rgba(54, 45, 106, 0.11);
  backdrop-filter: var(--glass-blur);
  transition:
    transform 0.22s ease,
    background 0.22s ease,
    box-shadow 0.22s ease;
}

.control-notice.is-latest,
.control-notice:hover {
  background: var(--glass);
}

.control-notice:hover {
  transform: translateY(-1px);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.8),
    inset 0 -1px 0 rgba(54, 45, 106, 0.045),
    0 3px 8px rgba(54, 45, 106, 0.16);
}

/* 来源图标：纯主题色实底 + 白色粗线条，不叠任何渐变或内描边。 */
.control-notice-icon {
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: 11px;
  color: var(--theme-on, #fff);
  background: var(--theme);
  box-shadow: var(--theme-shadow);
}

.control-notice-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
}

.control-notice-heading {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

/* 文字只保留两级对比：来源标题近黑，正文与时间淡灰。 */
.control-notice-heading > strong {
  color: var(--ink);
  font-size: 0.7rem;
  font-weight: 780;
  letter-spacing: 0.01em;
  line-height: 1.2;
}

.control-notice-meta {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  color: color-mix(in srgb, var(--muted) 78%, #fff);
  font-size: 0.48rem;
  font-weight: 580;
  line-height: 1;
}

.control-notice-latest {
  padding: 2px 6px;
  border-radius: 999px;
  color: var(--theme-strong);
  background: var(--theme-soft);
  font-size: 0.44rem;
  font-weight: 720;
}

.control-notice-copy p {
  margin: 0;
  color: var(--muted);
  font-size: 0.64rem;
  font-weight: 520;
  line-height: 1.6;
  overflow-wrap: anywhere;
}

.control-notice-list-enter-active,
.control-notice-list-leave-active,
.control-notice-list-move {
  transition:
    opacity 0.26s ease,
    transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}

.control-notice-list-enter-from,
.control-notice-list-leave-to {
  opacity: 0;
  transform: translateY(-7px) scale(0.985);
}

/* 空状态只留一行淡灰文字：不绘制图标、边框、玻璃底或阴影，
   仍占满内容区并居中，避免面板出现大片空白却无处落脚。 */
.control-notice-empty {
  display: flex;
  margin: 0 16px;
  flex: 1;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  font-size: 0.72rem;
  font-weight: 520;
  letter-spacing: 0.02em;
  text-align: center;
}

.control-notice-clear {
  display: inline-flex;
  padding: 6px 12px;
  flex: 0 0 auto;
  align-self: flex-end;
  margin-right: 16px;
  align-items: center;
  gap: 5px;
  border: 1px solid rgba(118, 126, 151, 0.14);
  border-radius: 999px;
  color: var(--muted-strong);
  background: rgba(255, 255, 255, 0.58);
  font-size: 0.5rem;
  font-weight: 660;
  transition:
    color 0.18s ease,
    border-color 0.18s ease,
    background 0.18s ease;
}

.control-notice-clear:hover {
  border-color: color-mix(in srgb, var(--theme) 20%, transparent);
  color: var(--theme-strong);
  background: #fff;
}

.control-expanded {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 0;
  overflow-y: auto;
  overflow-x: hidden;
  border-radius: 18px;
  scrollbar-width: none;
}

.control-expanded-inner {
  position: relative;
  display: flex;
  width: 100%;
  padding: 12px;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  gap: 9px;
}

.control-expanded-inner > .control-head,
.control-expanded-inner > .control-pane {
  flex: 0 0 auto;
}

/* 两个 Tab 分区共用的内容容器：纵向排布内部卡片。 */
.control-pane {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: stretch;
  gap: 9px;
  transition: opacity 0.2s ease;
}

.control-pane.is-notifications-visible {
  opacity: 0;
  pointer-events: none;
}

.control-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

/* 分区切换胶囊：选中项白底浮起，未读通知带主题色圆点。 */
.control-tabs {
  display: flex;
  min-width: 0;
  gap: 3px;
  padding: 3px;
  border: 1px solid rgba(118, 126, 151, 0.14);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.55);
}

.control-tab {
  position: relative;
  display: inline-flex;
  padding: 5px 13px;
  align-items: center;
  gap: 6px;
  border: 0;
  border-radius: 999px;
  color: var(--muted-strong);
  background: transparent;
  font-size: 0.6rem;
  font-weight: 720;
  transition:
    color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease;
}

.control-tab:hover {
  color: var(--theme-strong);
}

.control-tab.is-active {
  color: var(--theme-strong);
  background: #fff;
  box-shadow: 0 2px 7px rgba(72, 83, 126, 0.12);
}

.control-tab-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--theme);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme) 18%, transparent);
}

/* Tab 分区容器：控制分区常驻决定高度，通知分区作为浮层覆盖。 */
.control-pane-stack {
  position: relative;
  flex: 0 0 auto;
}

/* Tab 分区切换：通知浮层淡入淡出，控制分区始终在底层，高度保持稳定。 */
.control-tab-enter-active,
.control-tab-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}

.control-tab-enter-from,
.control-tab-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.control-close,
.control-play {
  display: flex;
  width: 34px;
  height: 34px;
  padding: 0;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(118, 126, 151, 0.16);
  border-radius: 50%;
  color: var(--muted-strong);
  background: rgba(255, 255, 255, 0.74);
}

.control-close:hover {
  color: var(--theme-strong);
  background: #fff;
}

.control-close :deep(svg) {
  transform: rotate(180deg);
}

.control-quote,
.control-music {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 9px;
}

.control-quote {
  padding: 10px 11px;
  align-items: flex-start;
  border: 1px solid rgba(118, 126, 151, 0.16);
  border-radius: 13px;
  background:
    linear-gradient(
      108deg,
      rgba(255, 255, 255, 0.92),
      rgba(252, 249, 255, 0.78) 58%,
      rgba(255, 247, 237, 0.74)
    ),
    rgba(255, 255, 255, 0.7);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.92),
    0 6px 15px rgba(72, 83, 126, 0.06);
}

.control-quote > div {
  display: flex;
  flex-direction: column;
  min-width: 0;
  flex: 1;
  gap: 4px;
}

.control-quote span,
.control-music .control-section-copy > span {
  color: var(--muted);
  font-size: 0.52rem;
}

.control-quote p {
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  margin: 0;
  color: var(--ink-soft);
  font-size: 0.66rem;
  font-weight: bold;
  line-height: 1.55;
}

.control-quote small {
  overflow: hidden;
  color: var(--muted);
  font-size: 0.49rem;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: end;
}

.control-weather {
  display: flex;
  min-height: 84px;
  padding: 10px 12px;
  align-items: center;
  gap: 10px;
  border: 1px solid rgba(118, 126, 151, 0.16);
  border-radius: 14px;
  background:
    linear-gradient(
      108deg,
      rgba(255, 255, 255, 0.92),
      rgba(252, 249, 255, 0.78) 58%,
      rgba(255, 247, 237, 0.74)
    ),
    rgba(255, 255, 255, 0.7);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.92),
    0 6px 15px rgba(72, 83, 126, 0.06);
}

.control-music-cover {
  display: flex;
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 12px;
  color: var(--theme-strong);
}

.control-weather-icon {
  display: flex;
  width: 45px;
  height: 45px;
  flex: 0 0 45px;
  align-items: center;
  justify-content: center;
  color: var(--theme-strong);
}

.control-weather-icon img {
  width: 42px;
  height: 42px;
  object-fit: contain;
  filter: drop-shadow(0 4px 5px rgba(38, 44, 66, 0.12));
}

.control-weather-copy {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 6px;
}

.control-weather-primary {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 8px;
}

.control-weather-primary strong,
.control-weather-primary span,
.control-weather-meta > span,
.control-weather-forecast > span,
.control-weather-forecast strong,
.control-weather-forecast small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.control-weather-primary strong {
  color: #26344b;
  font-size: 1.52rem;
  font-weight: 780;
  letter-spacing: 0;
  line-height: 0.92;
}

.control-weather-primary strong sup {
  margin-left: 1px;
  color: #5e718b;
  font-size: 0.54em;
  font-weight: 650;
  vertical-align: top;
}

.control-weather-primary span {
  min-width: 0;
  color: #26344b;
  font-size: 0.64rem;
  font-weight: 720;
}

.control-weather-meta {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
  color: #768197;
  font-size: 0.54rem;
}

.control-weather-meta > span {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 3px;
}

.control-weather-meta > span:first-child {
  color: #68758a;
}

.control-weather-meta svg {
  flex: 0 0 auto;
  color: #6d91b3;
}

.control-weather-forecast {
  display: flex;
  min-width: 0;
  flex: 0 0 42px;
  flex-direction: column;
  align-items: flex-end;
  justify-content: center;
  gap: 3px;
  color: #778196;
  font-size: 0.52rem;
  line-height: 1;
  text-align: right;
}

.control-weather-forecast > div {
  display: flex;
  align-items: center;
  gap: 3px;
  color: #314059;
}

.control-weather-forecast img {
  width: 18px;
  height: 18px;
  object-fit: contain;
}

.control-weather-forecast strong {
  max-width: 25px;
  font-size: 0.7rem;
  font-weight: 760;
}

.control-weather-forecast small {
  color: #8a94a5;
  font-size: 0.49rem;
}

.control-weather-unavailable-copy {
  gap: 3px;
}

.control-weather-unavailable-copy strong {
  color: var(--ink-soft);
  font-size: 0.84rem;
  line-height: 1;
}

.control-weather-unavailable-copy span {
  color: var(--muted);
  font-size: 0.54rem;
}

.control-weather.is-unavailable .control-weather-icon svg {
  animation: weather-pulse 1.8s ease-in-out infinite;
}

@keyframes weather-pulse {
  0%,
  100% {
    opacity: 0.64;
    transform: translateY(0);
  }

  50% {
    opacity: 1;
    transform: translateY(-2px);
  }
}

.control-section-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.control-section-copy strong,
.control-section-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.control-section-copy strong {
  font-size: 0.72rem;
}

.control-section-copy strong small {
  color: var(--muted);
  font-size: 0.62rem;
  font-weight: 500;
}

.control-section-copy > span {
  color: var(--muted);
  font-size: 0.53rem;
}

.control-music {
  position: relative;
  display: flex;
  overflow: hidden;
  flex-direction: column;
  align-items: stretch;
  padding: 16px 16px 12px;
  gap: 6px;
  border: 1px solid rgba(118, 126, 151, 0.16);
  border-radius: 14px;
  /* 卡面是中性玻璃，和上方「一言」「天气」同一族。
     主题色只留给播放键、进度条、播放中频谱这些真正要强调的点，
     整卡铺色会让它在控制栏里跳出来，反而显得突兀。 */
  background:
    radial-gradient(
      118% 92% at 100% 100%,
      color-mix(in srgb, var(--theme) 9%, transparent),
      transparent 64%
    ),
    linear-gradient(
      108deg,
      rgba(255, 255, 255, 0.92),
      rgba(252, 249, 255, 0.78) 58%,
      rgba(255, 247, 237, 0.74)
    ),
    rgba(255, 255, 255, 0.7);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.92),
    0 6px 15px rgba(72, 83, 126, 0.06);
  transition: height 0.46s cubic-bezier(0.22, 1, 0.36, 1);
}

/* 播放器与播放列表共用的定位舞台，切换时高度由卡片统一过渡。 */
.control-music-stage {
  position: relative;
  display: flex;
  min-width: 0;
  flex: 0 0 auto;
  flex-direction: column;
  gap: 6px;
}

.control-music-player {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}

.control-music-top {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 12px;
}

.control-music-top .control-music-copy {
  min-width: 0;
  flex: 1 1 auto;
}

.control-music-equalizer {
  flex: 0 0 22px;
}

.control-music-cover-wrap {
  position: relative;
  display: block;
  width: 62px;
  height: 62px;
  flex: 0 0 auto;
}

.control-music-cover {
  overflow: hidden;
  width: 62px;
  height: 62px;
  border-radius: 15px;
  color: var(--theme-strong);
  background: rgba(248, 249, 253, 0.78);
  /* 封面自带一圈很淡的主题色光晕：让卡面认得出来是播放器，
     又不会把整张卡染成粉色。 */
  box-shadow:
    0 6px 14px rgba(54, 45, 106, 0.1),
    0 2px 12px color-mix(in srgb, var(--theme) 18%, transparent);
}

.control-music-cover :deep(img) {
  transform-origin: center;
  transition: transform 0.36s cubic-bezier(0.22, 1, 0.36, 1);
  will-change: transform;
}

.control-music-cover:hover :deep(img) {
  transform: scale(1.06);
}

.control-music-copy {
  gap: 4px;
}

.control-music-copy strong {
  overflow: hidden;
  font-size: 0.86rem;
  line-height: 1.15;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.control-music-copy small {
  overflow: hidden;
  color: var(--muted);
  font-size: 0.58rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.control-music-equalizer {
  display: flex;
  height: 16px;
  align-items: end;
  justify-content: center;
  gap: 3px;
}

.control-music-equalizer i {
  width: 3px;
  height: 7px;
  border-radius: 3px;
  background: rgba(118, 126, 151, 0.34);
  transition: background 0.24s ease;
}

.control-music-equalizer i:nth-child(2) {
  height: 13px;
}

.control-music-equalizer i:nth-child(3) {
  height: 10px;
}

/* 播放中才点亮成主题色：颜色表示状态，平时保持中性。 */
.control-music-equalizer.is-playing i {
  background: var(--theme);
  animation: music-wave 0.72s ease-in-out infinite alternate;
}

.control-music-equalizer.is-playing i:nth-child(2) {
  animation-delay: 0.12s;
}

.control-music-equalizer.is-playing i:nth-child(3) {
  animation-delay: 0.2s;
}

.control-play {
  border: 0;
  color: var(--theme-on);
  background: linear-gradient(135deg, var(--theme) 0%, var(--theme-hover) 100%);
}

.control-music-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 0.48rem;
  transform: translateY(-14px);
}

.control-music-progress-spacer {
  flex: 0 0 64px;
}

.control-music-progress > span:nth-child(2),
.control-music-progress > span:last-child {
  flex: 0 0 34px;
}

.control-music-progress > span:nth-child(2) {
  text-align: left;
}

.control-music-progress > span:last-child {
  text-align: right;
}

/* 轨道与滑块由通用控件层（.m-range）绘制，这里只把进度变量接过去。 */
.control-music-progress-input {
  --range-progress: var(--music-progress, 0%);
  --range-track: 3px;
  min-width: 0;
  flex: 1 1 auto;
}

.control-music-toolbar {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 0;
}

.control-music-action {
  display: flex;
  width: 28px;
  height: 28px;
  padding: 0;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  color: var(--muted-strong);
  background: transparent;
  transition:
    color 0.18s ease,
    background 0.18s ease,
    transform 0.18s ease;
}

.control-music-action:hover,
.control-music-action.is-active {
  color: var(--theme-strong);
  background: color-mix(in srgb, var(--theme) 10%, transparent);
}

.control-music-action:hover {
  transform: translateY(-1px);
}

.control-music-action:disabled {
  cursor: not-allowed;
  opacity: 0.42;
}

.control-music-skip {
  width: 36px;
  height: 36px;
  border: 1px solid rgba(118, 126, 151, 0.16);
  background: rgba(255, 255, 255, 0.62);
}

.control-music-skip:hover {
  background: rgba(255, 255, 255, 0.9);
}

.control-music-primary {
  position: relative;
  width: 42px;
  height: 42px;
  z-index: 1;
  box-shadow:
    0 4px 12px color-mix(in srgb, var(--theme) 34%, transparent),
    0 0 0 0 var(--theme-ring);
  will-change: transform, box-shadow;
  transition:
    transform 0.3s cubic-bezier(0.4, 0, 0.2, 1),
    box-shadow 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.control-music-primary::before {
  position: absolute;
  z-index: -1;
  inset: -2px;
  content: "";
  border-radius: 50%;
  background: linear-gradient(135deg, var(--theme-hover), var(--theme));
  opacity: 0;
  filter: blur(6.8px);
  pointer-events: none;
  transition: opacity 0.3s ease;
}

.control-music-primary:hover {
  transform: translateY(-3px) scale(1.08);
  box-shadow:
    0 6px 16px color-mix(in srgb, var(--theme) 42%, transparent),
    0 0 0 8px var(--theme-ring);
}

.control-music-primary:hover::before {
  opacity: 0.6;
}

.control-music-primary:active {
  transform: translateY(-1px) scale(1.02);
  box-shadow:
    0 3px 8px color-mix(in srgb, var(--theme) 32%, transparent),
    0 0 0 0 transparent;
}

.control-music :deep(.music-picker) {
  width: 28px;
  min-width: 28px;
}

.control-music :deep(.music-picker-trigger) {
  display: flex;
  width: 28px;
  height: 28px;
  padding: 0;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 50%;
  color: var(--muted-strong);
  background: transparent;
  transition:
    color 0.18s ease,
    background 0.18s ease,
    transform 0.18s ease;
}

.control-music :deep(.music-picker-trigger:hover),
.control-music :deep(.music-picker-trigger[aria-expanded="true"]) {
  color: var(--theme-strong);
  background: color-mix(in srgb, var(--theme) 10%, transparent);
  transform: translateY(-1px);
}

.control-music :deep(.music-picker-trigger-copy) {
  display: none;
}

.control-music :deep(.music-picker-trigger > svg) {
  color: inherit;
  transition: transform 0.2s ease;
}

.control-music :deep(.music-picker-panel) {
  z-index: 60;
  top: calc(100% + 9px);
  right: 0;
}

.control-music :deep(.music-picker.is-embedded) {
  width: 100%;
  min-width: 0;
}

.control-music :deep(.music-picker-panel.is-embedded-panel) {
  position: static;
  top: auto;
  right: auto;
  bottom: auto;
  left: auto;
  width: 100%;
  z-index: auto;
}

/* 播放器与播放列表切换：交叉淡入淡出，离场内容绝对定位让位给新内容。 */
.control-music-view-enter-active,
.control-music-view-leave-active {
  transition: opacity 0.24s ease;
}

.control-music-view-enter-from,
.control-music-view-leave-to {
  opacity: 0;
}

.control-music-view-leave-active {
  position: absolute;
  top: 0;
  right: 0;
  left: 0;
}

.control-panel-swap-enter-active,
.control-panel-swap-leave-active {
  transition:
    opacity 0.26s ease,
    transform 0.42s cubic-bezier(0.22, 1, 0.36, 1),
    filter 0.26s ease,
    clip-path 0.42s cubic-bezier(0.22, 1, 0.36, 1);
  transform-origin: top right;
  will-change: opacity, transform, filter, clip-path;
}

.control-panel-swap-enter-from {
  opacity: 0;
  transform: translateY(-10px);
  filter: blur(4px);
  clip-path: inset(0 0 8% 0 round 18px);
}

.control-panel-swap-leave-to {
  opacity: 0;
  transform: translateY(7px);
  filter: blur(3px);
  clip-path: inset(0 0 8% 0 round 18px);
}

.control-copy-enter-active,
.control-copy-leave-active {
  transition:
    opacity 0.24s ease,
    transform 0.24s ease;
}

.control-copy-enter-from {
  opacity: 0;
  transform: translateY(5px);
}

.control-copy-leave-to {
  opacity: 0;
  transform: translateY(-5px);
}

@media (max-width: 820px) {
  .control-panel {
    top: 12px;
    right: 12px;
    width: min(400px, calc(100vw - 24px));
  }

  .control-panel.is-expanded {
    height: min(377px, calc(100svh - 24px));
    max-height: calc(100svh - 24px);
  }

  .control-panel:not(.is-expanded) {
    width: min(160px, calc(100vw - 24px));
  }

  .control-panel.is-notifying {
    width: min(320px, calc(100vw - 24px));
  }

  .control-expanded-inner {
    padding: 10px;
    gap: 8px;
  }

  .control-weather {
    padding-inline: 10px;
    gap: 8px;
  }

  .control-weather-meta {
    gap: 5px;
  }

  .control-music {
    padding-inline: 16px;
  }

  .control-music-top {
    gap: 9px;
  }

  .control-music :deep(.music-picker-panel) {
    top: calc(100svh - min(430px, 60svh) - 76px);
    right: 12px;
    bottom: auto;
    left: 12px;
    width: auto;
  }

  .control-music :deep(.music-picker-panel.is-embedded-panel) {
    top: auto;
    right: auto;
    bottom: auto;
    left: auto;
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .control-panel {
    transition-duration: 0.01ms;
  }

  .control-panel.is-notifying,
  .control-panel.is-notifying .control-collapsed-icon {
    animation: none;
  }

  /* 减少动态效果时保留提亮反馈，取消放大。 */
  .control-panel:not(.is-expanded):hover {
    scale: none;
  }

  .control-panel::after,
  .control-collapsed-icon,
  .control-notice-open {
    transition-duration: 0.01ms;
  }

  .control-music {
    transition-duration: 0.01ms;
  }

  .control-music-view-enter-active,
  .control-music-view-leave-active {
    transition-duration: 0.01ms;
  }

  .control-panel-swap-enter-active,
  .control-panel-swap-leave-active {
    transition-duration: 0.01ms;
  }

  .control-copy-enter-active,
  .control-copy-leave-active {
    transition-duration: 0.01ms;
  }

  .control-tab-enter-active,
  .control-tab-leave-active,
  .control-notice-list-enter-active,
  .control-notice-list-leave-active,
  .control-notice-list-move,
  .control-notice {
    transition-duration: 0.01ms;
  }
}
</style>
