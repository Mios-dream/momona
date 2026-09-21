<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
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
const panelElement = ref<HTMLElement | null>(null);
const activeCollapsedItem = ref<CollapsedItem>("quote");
const weather = ref<WeatherData | null>(null);
const weatherLoading = ref(true);
const playerState = ref<PlayerState>({});
const isPlaylistOpen = ref(false);
const quote = ref<QuoteState>({
  text: "愿每一次回望，都有新的理解。",
  from: "Momona",
});
let rotationTimer: number | null = null;
let quoteRequest: AbortController | null = null;

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

const collapsedLabel = computed(() => {
  if (activeCollapsedItem.value === "weather") {
    return weather.value
      ? `${weather.value.temperature}° ${weather.value.weather}`
      : weatherLoading.value
        ? "正在读取天气"
        : "天气暂不可用";
  }
  if (activeCollapsedItem.value === "greeting") return "问候";
  return "一言";
});

const collapsedTitle = computed(() => {
  if (activeCollapsedItem.value === "weather")
    return weather.value?.city || "当前位置";
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
    const response = await fetch("https://v1.hitokoto.cn/?c=a&c=b&c=c&encode=json", {
      signal: quoteRequest.signal,
    });
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

onMounted(async () => {
  window.addEventListener("music-player-state-change", handlePlayerState);
  window.addEventListener("keydown", handleKeydown);
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
  document.removeEventListener("pointerdown", handleDocumentPointerDown);
  stopRotation();
  quoteRequest?.abort();
});
</script>

<template>
  <aside
    ref="panelElement"
    class="control-panel"
    :class="{ 'is-expanded': isExpanded, 'is-playlist-open': isPlaylistOpen }"
    aria-label="状态控制台"
  >
    <div class="control-panel-viewport">
      <Transition name="control-panel-swap">
        <button
          v-if="!isExpanded"
          key="collapsed"
          type="button"
          class="control-collapsed"
          :aria-label="`展开状态控制台，当前显示${collapsedLabel}`"
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
            <span
              :key="activeCollapsedItem"
              class="control-collapsed-copy"
              :class="{ 'is-weather': activeCollapsedItem === 'weather' }"
            >
              <template v-if="activeCollapsedItem === 'weather'">
                <strong>{{ collapsedLabel }}</strong>
                <small>{{ collapsedTitle }}</small>
                <em>{{ collapsedDetail }}</em>
              </template>
              <template v-else>
                <small>{{ collapsedLabel }}</small>
                <strong>{{ collapsedTitle }}</strong>
                <em>{{ collapsedDetail }}</em>
              </template>
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

          <section class="control-quote" aria-label="一言">
            <IconGlyph name="messageCircle" :size="15" />
            <div>
              <span>一言</span>
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
              <img v-if="weather" :src="weather.icon" :alt="weather.weather" />
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
            class="control-music"
            :class="{ 'is-playlist': isPlaylistOpen }"
            :aria-label="isPlaylistOpen ? '播放列表' : '音乐播放器'"
          >
            <Transition name="control-music-view" mode="out-in">
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
          </section>
        </div>
      </Transition>
    </div>
  </aside>
</template>

<style scoped>
.control-panel {
  position: fixed;
  z-index: 35;
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
  backdrop-filter: blur(20px) saturate(145%);
  transition:
    width 0.46s cubic-bezier(0.22, 1, 0.36, 1),
    height 0.46s cubic-bezier(0.22, 1, 0.36, 1),
    border-radius 0.42s ease,
    box-shadow 0.32s ease;
}

.control-panel.is-expanded {
  width: min(400px, calc(100vw - 32px));
  height: min(400px, calc(100svh - 32px));
  border-radius: 18px;
  box-shadow: 0 18px 42px rgba(54, 45, 106, 0.16);
}

.control-panel.is-expanded.is-playlist-open {
  height: min(500px, calc(100svh - 32px));
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
  display: grid;
  width: 22px;
  height: 26px;
  flex: 0 0 auto;
  place-items: center;
  color: var(--purple-deep);
}

.control-collapsed-icon img {
  width: 22px;
  height: 22px;
  object-fit: contain;
}

.control-collapsed-copy {
  display: grid;
  min-width: 0;
  flex: 1;
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

.control-collapsed-copy.is-weather strong {
  font-size: 0.82rem;
  line-height: 1;
}

.control-collapsed-copy.is-weather small {
  color: var(--muted);
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
  display: grid;
  width: 100%;
  height: auto;
  min-height: 0;
  padding: 12px;
  overflow-y: auto;
  scrollbar-width: none;
  gap: 9px;
  border-radius: 18px;
}

.control-expanded::-webkit-scrollbar {
  display: none;
}

.control-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.control-head > div {
  display: grid;
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
  display: grid;
  width: 34px;
  height: 34px;
  padding: 0;
  flex: 0 0 auto;
  place-items: center;
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
  border: 1px solid rgba(118, 126, 151, 0.1);
  border-radius: 13px;
  color: var(--purple-deep);
  background: rgba(255, 255, 255, 0.5);
}

.control-quote > div {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.control-quote > svg {
  flex: 0 0 auto;
  margin-top: 1px;
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
  line-height: 1.55;
}

.control-quote small {
  overflow: hidden;
  color: var(--muted);
  font-size: 0.49rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.control-weather {
  display: grid;
  min-height: 84px;
  padding: 10px 12px;
  grid-template-columns: 45px minmax(0, 1fr) 42px;
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
  display: grid;
  width: 48px;
  height: 48px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 12px;
  color: var(--blue);
}

.control-weather-icon {
  display: grid;
  width: 45px;
  height: 45px;
  place-items: center;
  color: #7097bd;
}

.control-weather-icon img {
  width: 42px;
  height: 42px;
  object-fit: contain;
  filter: drop-shadow(0 4px 5px rgba(63, 116, 153, 0.12));
}

.control-weather-copy {
  display: grid;
  min-width: 0;
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
  display: grid;
  min-width: 0;
  justify-items: end;
  align-content: center;
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

.control-weather.is-unavailable {
  grid-template-columns: 45px minmax(0, 1fr);
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
  display: grid;
  min-width: 0;
  flex: 1;
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
  display: grid;
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
}

.control-music.is-playlist {
  padding: 10px;
  gap: 0;
}

.control-music-player {
  display: grid;
  min-width: 0;
  gap: 6px;
}

.control-music-top {
  display: grid;
  min-width: 0;
  grid-template-columns: 62px minmax(0, 1fr) 22px;
  align-items: center;
  gap: 12px;
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
  display: grid;
  grid-template-columns: 64px 34px minmax(0, 1fr) 34px;
  align-items: center;
  gap: 8px;
  color: var(--muted);
  font-size: 0.48rem;
  transform: translateY(-14px);
}

.control-music-progress > span:nth-child(2) {
  text-align: left;
}

.control-music-progress > span:last-child {
  text-align: right;
}

.control-music-progress-input {
  width: 100%;
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
  display: grid;
  min-width: 0;
  grid-template-columns: repeat(7, minmax(28px, 1fr));
  align-items: center;
  justify-items: center;
  gap: 0;
}

.control-music-action {
  display: grid;
  width: 28px;
  height: 28px;
  padding: 0;
  place-items: center;
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
  display: grid;
  width: 28px;
  height: 28px;
  padding: 0;
  place-items: center;
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

.control-music-view-enter-active,
.control-music-view-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.26s cubic-bezier(0.22, 1, 0.36, 1);
}

.control-music-view-enter-from {
  opacity: 0;
  transform: translateX(8px);
}

.control-music-view-leave-to {
  opacity: 0;
  transform: translateX(-8px);
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
  transform: translateY(-10px) scale(0.94);
  filter: blur(4px);
  clip-path: inset(0 0 8% 0 round 18px);
}

.control-panel-swap-leave-to {
  opacity: 0;
  transform: translateY(7px) scale(0.98);
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

@media (max-width: 560px) {
  .control-panel {
    top: 12px;
    right: 12px;
    width: min(400px, calc(100vw - 24px));
  }

  .control-panel.is-expanded {
    height: min(390px, calc(100svh - 24px));
  }

  .control-panel.is-expanded.is-playlist-open {
    height: min(500px, calc(100svh - 24px));
  }

  .control-panel:not(.is-expanded) {
    width: min(160px, calc(100vw - 24px));
  }

  .control-expanded {
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
