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

const isExpanded = ref(false);
const isTeleportReady = ref(false);
const panelElement = ref<HTMLElement | null>(null);
const activeCollapsedItem = ref<CollapsedItem>("quote");
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

const collapsedIcon = computed(() => {
  if (activeCollapsedItem.value === "weather") {
    return (
      weather.value?.iconName || (weatherLoading.value ? "refresh" : "cloud")
    );
  }
  if (activeCollapsedItem.value === "greeting") return "sparkles";
  return "messageCircle";
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
 * @returns 无返回值；展开状态下不会轮换。
 */
function rotateCollapsedItem(): void {
  if (isExpanded.value) return;
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
 * 切换控制台展开状态，并同步轮换定时器。
 *
 * @returns 无返回值。
 */
function toggleExpanded(): void {
  isExpanded.value = !isExpanded.value;
  if (isExpanded.value) stopRotation();
  else startRotation();
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

  const natural = Math.round(
    stage.offsetHeight + readVerticalBoxExtra(card),
  );
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
  if (event.target !== musicRef.value || event.propertyName !== "height") return;
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
      :class="{ 'is-expanded': isExpanded }"
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
            aria-label="展开状态控制台"
            aria-expanded="false"
            @click="toggleExpanded"
          >
            <span class="control-collapsed-icon">
              <img
                v-if="activeCollapsedItem === 'weather' && weather"
                :src="weather.icon"
                :alt="weather.weather"
              />
              <IconGlyph v-else :name="collapsedIcon" :size="16" />
            </span>
            <Transition name="control-copy" mode="out-in">
              <span :key="activeCollapsedItem" class="control-collapsed-copy">
                <strong>{{ collapsedTitle }}</strong>
                <em>{{ collapsedDetail }}</em>
              </span>
            </Transition>
            <span
              v-if="
                activeCollapsedItem === 'weather' &&
                typeof weather?.aqi === 'number'
              "
              class="control-collapsed-aqi"
              aria-label="空气质量指数"
            >
              <i aria-hidden="true"></i>{{ weather.aqi }}
            </span>
            <IconGlyph
              class="control-expand-icon"
              name="chevronDown"
              :size="14"
            />
          </button>

          <div v-else key="expanded" class="control-expanded">
            <div ref="expandedInnerRef" class="control-expanded-inner">
              <div class="control-head">
                <div>
                  <span>STATUS CONSOLE</span>
                  <strong>今日状态</strong>
                </div>
                <button
                  type="button"
                  class="control-close"
                  aria-label="收起状态控制台"
                  title="收起"
                  aria-expanded="true"
                  @click="toggleExpanded"
                >
                  <IconGlyph name="chevronDown" :size="15" />
                </button>
              </div>

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
                  <span>{{ weatherLoading ? "正在定位" : "暂无可用定位" }}</span>
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
                          class="control-music-progress-input"
                          type="range"
                          min="0"
                          :max="Math.max(playerState.duration || 0, 1)"
                          :value="playerState.currentTime || 0"
                          :style="{ '--music-progress': `${playbackProgress}%` }"
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
                          :class="{ 'is-active': playbackMode !== 'sequential' }"
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
                          :title="playerState.isPlaying ? '暂停音乐' : '播放音乐'"
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
                          :aria-label="playerState.isMuted ? '取消静音' : '静音'"
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
  border-radius: 24px;
  color: var(--ink);
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 9px 24px rgba(54, 45, 106, 0.11);
  backdrop-filter: var(--glass-blur);
  transition:
    width 0.46s cubic-bezier(0.22, 1, 0.36, 1),
    height 0.46s cubic-bezier(0.22, 1, 0.36, 1),
    border-radius 0.42s ease,
    box-shadow 0.32s ease;
}

.control-panel.is-expanded {
  width: min(400px, calc(100vw - 32px));
  height: min(384px, calc(100svh - 32px));
  max-height: calc(100svh - 32px);
  border-radius: 18px;
  box-shadow: 0 18px 42px rgba(54, 45, 106, 0.16);
}

.control-panel:not(.is-expanded) {
  width: min(160px, calc(100vw - 32px));
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
  border-radius: 24px;
  color: inherit;
  text-align: left;
  transition:
    transform 0.2s ease,
    background 0.2s ease;
}

.control-collapsed:hover {
  background: rgba(255, 255, 255, 0.9);
  transform: translateY(-2px);
}

.control-collapsed-icon {
  display: flex;
  width: 22px;
  height: 26px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  color: var(--purple-deep);
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
  display: flex;
  width: 100%;
  padding: 12px;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  gap: 9px;
}

.control-expanded-inner > .control-head,
.control-expanded-inner > .control-quote,
.control-expanded-inner > .control-weather,
.control-expanded-inner > .control-music {
  flex: 0 0 auto;
}

.control-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.control-head > div {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.control-head span {
  color: var(--muted);
  font-size: 0.46rem;
  letter-spacing: 0.1em;
}

.control-head strong {
  font-size: 1rem;
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
  color: var(--purple-deep);
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
  border: 1px solid rgba(132, 151, 186, 0.2);
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
  color: var(--blue);
}

.control-weather-icon {
  display: flex;
  width: 45px;
  height: 45px;
  flex: 0 0 45px;
  align-items: center;
  justify-content: center;
  color: #7097bd;
}

.control-weather-icon img {
  width: 42px;
  height: 42px;
  object-fit: contain;
  filter: drop-shadow(0 4px 5px rgba(63, 116, 153, 0.12));
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
  border: 1px solid rgba(104, 151, 196, 0.34);
  border-radius: 14px;
  background: linear-gradient(
    135deg,
    rgba(255, 255, 255, 0.55),
    rgba(229, 240, 255, 0.54) 58%,
    rgba(255, 234, 244, 0.38)
  );
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
  color: var(--purple-deep);
  background: rgba(245, 248, 255, 0.72);
  box-shadow: 0 6px 14px rgba(59, 91, 133, 0.12);
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
  background: #6b8db2;
}

.control-music-equalizer i:nth-child(2) {
  height: 13px;
}

.control-music-equalizer i:nth-child(3) {
  height: 10px;
}

.control-music-equalizer.is-playing i {
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
  color: #fff;
  background: linear-gradient(135deg, #174c82 0%, #205f9c 100%);
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

.control-music-progress-input {
  min-width: 0;
  flex: 1 1 auto;
}

.control-music-progress > span:nth-child(2) {
  text-align: left;
}

.control-music-progress > span:last-child {
  text-align: right;
}

.control-music-progress-input {
  width: auto;
  height: 14px;
  margin: 0;
  appearance: none;
  cursor: pointer;
  border: 0;
  border-radius: 999px;
  outline: 0;
  background: linear-gradient(
    to right,
    #315f90 0 var(--music-progress),
    rgba(118, 146, 176, 0.25) var(--music-progress) 100%
  );
  background-position: center;
  background-repeat: no-repeat;
  background-size: 100% 3px;
}

.control-music-progress-input::-webkit-slider-runnable-track {
  height: 3px;
  border-radius: inherit;
  background: transparent;
}

.control-music-progress-input::-webkit-slider-thumb {
  width: 15px;
  height: 15px;
  margin-top: -6px;
  appearance: none;
  border: 2px solid #7b95b5;
  border-radius: 50%;
  background: #f7fbff;
}

.control-music-progress-input::-moz-range-track {
  height: 3px;
  border-radius: inherit;
  background: transparent;
}

.control-music-progress-input::-moz-range-progress {
  height: 3px;
  border-radius: inherit;
  background: #315f90;
}

.control-music-progress-input::-moz-range-thumb {
  width: 15px;
  height: 15px;
  border: 2px solid #7b95b5;
  border-radius: 50%;
  background: #f7fbff;
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
  color: var(--purple-deep);
  background: rgba(117, 100, 222, 0.1);
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
  border: 1px solid rgba(137, 162, 190, 0.2);
  background: rgba(224, 233, 244, 0.62);
}

.control-music-skip:hover {
  background: rgba(238, 244, 251, 0.9);
}

.control-music-primary {
  position: relative;
  width: 42px;
  height: 42px;
  z-index: 1;
  box-shadow:
    0 4px 12px rgba(23, 76, 130, 0.35),
    0 0 0 0 rgba(23, 76, 130, 0.4);
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
  background: linear-gradient(135deg, #174c82, #205f9c);
  opacity: 0;
  filter: blur(6.8px);
  pointer-events: none;
  transition: opacity 0.3s ease;
}

.control-music-primary:hover {
  transform: translateY(-3px) scale(1.08);
  box-shadow:
    0 6px 16px rgba(23, 76, 130, 0.45),
    0 0 0 8px rgba(23, 76, 130, 0.1);
}

.control-music-primary:hover::before {
  opacity: 0.6;
}

.control-music-primary:active {
  transform: translateY(-1px) scale(1.02);
  box-shadow:
    0 3px 8px rgba(23, 76, 130, 0.35),
    0 0 0 0 rgba(23, 76, 130, 0);
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
  color: var(--purple-deep);
  background: rgba(117, 100, 222, 0.1);
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
}
</style>
