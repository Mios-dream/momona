<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { HomeNeteaseItem, HomeNeteaseStats } from "../../data/types";
import FallbackImage from "../app/FallbackImage.vue";
import IconGlyph from "../app/IconGlyph.vue";

interface Props {
  /** 网易云音乐个人统计与喜欢的音乐。 */
  stats: HomeNeteaseStats;
}

interface MoodBubble {
  tag: string;
  color: string;
  left: number;
  top: number;
  size: number;
  duration: number;
  delay: number;
}

const props = defineProps<Props>();
const showStats = ref(true);
const currentIndex = ref(0);
let rotationTimer: number | undefined;

const itemsWithCover = computed(() =>
  props.stats.items.filter((item) => item.cover || item.title),
);
const currentItems = computed<HomeNeteaseItem[]>(() => {
  const items = itemsWithCover.value;
  if (!items.length) return [];
  if (items.length === 1) return [items[0]];
  const index = currentIndex.value % items.length;
  return [items[index], items[(index + 1) % items.length]];
});

const hasStats = computed(
  () =>
    Boolean(
      itemsWithCover.value.length ||
        props.stats.followerCount ||
        props.stats.playlistCount ||
        props.stats.level ||
        props.stats.moodKeywords.length,
    ),
);

/**
 * 根据文本和种子生成稳定的伪随机浮点数。
 *
 * @param value - 参与计算的文本。
 * @param seed - 控制结果变化的数字种子。
 * @returns 范围为 0 到 1 的稳定数值。
 */
function hash(value: string, seed: number): number {
  let result = seed;
  for (const character of value) {
    result = Math.imul(result ^ character.charCodeAt(0), 2654435761);
  }
  return ((result ^ (result >>> 16)) >>> 0) / 4294967296;
}

const moodBubbleSlots = [
  { left: 72, top: 22, jitterX: 6, jitterY: 6 },
  { left: 18, top: 45, jitterX: 5, jitterY: 7 },
  { left: 43, top: 84, jitterX: 6, jitterY: 5 },
  { left: 84, top: 42, jitterX: 5, jitterY: 7 },
  { left: 27, top: 76, jitterX: 5, jitterY: 5 },
  { left: 52, top: 48, jitterX: 6, jitterY: 6 },
];

const moodBubbles = computed<MoodBubble[]>(() => {
  const colors = ["#6d687d", "#9b7184", "#5b7e83", "#a28b70", "#617e91"];
  const bubbles: MoodBubble[] = [];

  props.stats.moodKeywords.filter(Boolean).slice(0, 6).forEach((tag, index) => {
    const size =
      index === 0
        ? 64 + Math.floor(hash(tag, 1) * 16)
        : 34 + Math.floor(hash(tag, 1) * 15);
    const slot = moodBubbleSlots[index % moodBubbleSlots.length];
    const left = slot.left + (hash(tag, 100 + index) - 0.5) * slot.jitterX;
    const top = slot.top + (hash(tag, 200 + index) - 0.5) * slot.jitterY;
    bubbles.push({
      tag,
      color: colors[index % colors.length],
      left,
      top,
      size,
      duration: 3.5 + hash(tag, 4) * 3,
      delay: hash(tag, 5) * 1.5,
    });
  });
  return bubbles;
});

/**
 * 将首页统计数字转换为紧凑显示文本。
 *
 * @param value - 需要展示的统计数量。
 * @returns 适合媒体卡片宽度的数字文本。
 */
function formatNumber(value: number): string {
  if (value >= 10000) return `${(value / 10000).toFixed(1)}万`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

/**
 * 清理媒体摘要轮播定时器。
 *
 * @returns 无返回值；重复调用不会产生副作用。
 */
function clearRotation(): void {
  if (rotationTimer !== undefined) window.clearTimeout(rotationTimer);
  rotationTimer = undefined;
}

/**
 * 安排下一次媒体摘要轮换。
 *
 * @returns 无返回值；没有足够摘要或页面隐藏时不创建定时器。
 */
function scheduleRotation(): void {
  clearRotation();
  if (itemsWithCover.value.length < 2) return;
  rotationTimer = window.setTimeout(() => {
    if (document.hidden) return;
    if (showStats.value) {
      showStats.value = false;
    } else {
      currentIndex.value =
        (currentIndex.value + 2) % itemsWithCover.value.length;
      showStats.value = true;
    }
    scheduleRotation();
  }, showStats.value ? 8000 : 5000);
}

/**
 * 根据页面可见性暂停或恢复媒体摘要轮换。
 *
 * @returns 无返回值；页面重新可见时从当前摘要继续轮播。
 */
function handleVisibility(): void {
  if (document.hidden) clearRotation();
  else scheduleRotation();
}

watch(
  () => props.stats.items,
  () => {
    currentIndex.value = 0;
    showStats.value = true;
    scheduleRotation();
  },
  { deep: true },
);

onMounted(() => {
  document.addEventListener("visibilitychange", handleVisibility);
  scheduleRotation();
});

onBeforeUnmount(() => {
  clearRotation();
  document.removeEventListener("visibilitychange", handleVisibility);
});
</script>

<template>
  <section
    class="home-media-pair-card glass-panel"
    aria-label="网易云音乐收藏统计"
    aria-live="polite"
  >
    <Transition name="netease-face" mode="out-in">
      <div v-if="showStats || currentItems.length === 0" key="stats" class="netease-stats-face">
        <div class="netease-stat-background" aria-hidden="true"></div>

        <div v-if="moodBubbles.length" class="netease-mood-field" aria-hidden="true">
          <span
            v-for="bubble in moodBubbles"
            :key="bubble.tag"
            class="netease-mood-bubble"
            :style="{
              left: `${bubble.left}%`,
              top: `${bubble.top}%`,
              width: `${bubble.size}px`,
              height: `${bubble.size}px`,
              color: bubble.color,
              borderColor: `${bubble.color}26`,
              background: `linear-gradient(145deg, rgba(255,255,255,.92), ${bubble.color}16 52%, ${bubble.color}4c)`,
              animationDuration: `${bubble.duration}s`,
              animationDelay: `${bubble.delay}s`,
            }"
          >
            {{ bubble.tag }}
          </span>
        </div>

        <div v-if="hasStats" class="netease-stats-content">
          <div class="netease-platform-pill">
            <span class="netease-platform-dot"></span>
            <span>网易云音乐</span>
          </div>

          <div class="netease-stats-footer">
            <span class="netease-platform-mark" title="网易云音乐">
              <IconGlyph name="radio" :size="15" />
            </span>
            <div class="netease-stat-stack">
              <div class="netease-level-pill">Lv.{{ stats.level }}</div>
              <div class="netease-count-panel">
                <div>
                  <strong>{{ formatNumber(stats.followerCount) }}</strong>
                  <span>粉丝</span>
                </div>
                <i></i>
                <div>
                  <strong>{{ formatNumber(stats.playlistCount) }}</strong>
                  <span>歌单</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="netease-empty-face">
          <IconGlyph name="radio" :size="22" />
          <span>暂无网易云音乐收藏</span>
        </div>
      </div>

      <div v-else key="collection" class="netease-collection-face">
        <article
          v-for="(item, index) in currentItems"
          :key="`${item.id}-${currentIndex}-${index}`"
          class="netease-collection-cover"
          :aria-label="`${item.title}${item.artist ? ` · ${item.artist}` : ''}`"
          :title="`${item.title}${item.artist ? ` · ${item.artist}` : ''}`"
        >
          <FallbackImage
            :src="item.cover"
            :alt="item.title"
            fallback-icon="music"
            :icon-size="30"
            referrer-policy="no-referrer"
          />
        </article>

        <div v-if="currentItems.length" class="netease-title-float" aria-hidden="true">
          <span class="netease-title-mark">
            <IconGlyph name="music" :size="12" />
          </span>
          <div class="netease-title-list">
            <span
              v-for="item in currentItems"
              :key="`${item.id}-title`"
              class="netease-title-line"
              :title="item.title"
            >
              {{ item.title }}
            </span>
          </div>
        </div>
      </div>
    </Transition>
  </section>
</template>

<style scoped>
.home-media-pair-card {
  position: relative;
  min-height: 150px;
  overflow: hidden;
  color: var(--ink);
  background: rgba(255, 248, 250, 0.72);
}

.netease-stats-face,
.netease-collection-face {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.netease-stats-face {
  min-height: 150px;
}

.netease-stat-background {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    135deg,
    rgba(240, 248, 252, 0.88),
    rgba(255, 255, 255, 0.68) 50%,
    rgba(255, 242, 244, 0.86)
  );
}

.netease-mood-field {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.netease-mood-bubble {
  position: absolute;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 6px;
  border: 1px solid;
  border-radius: 50%;
  box-shadow:
    0 8px 18px rgba(76, 71, 87, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.72);
  font-size: 0.6rem;
  font-weight: 700;
  line-height: 1.1;
  text-align: center;
  text-shadow: 0 1px 1px rgba(255, 255, 255, 0.54);
  transform: translate(-50%, -50%);
  animation-name: netease-bubble-float;
  animation-iteration-count: infinite;
  animation-timing-function: ease-in-out;
  backdrop-filter: blur(5px);
  -webkit-backdrop-filter: blur(5px);
  white-space: nowrap;
}

@keyframes netease-bubble-float {
  0%,
  100% {
    margin-top: 0;
  }
  50% {
    margin-top: -4px;
  }
}

.netease-stats-content {
  position: relative;
  z-index: 2;
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 150px;
  padding: 11px 12px 10px;
  flex-direction: column;
}

.netease-platform-pill {
  display: inline-flex;
  width: max-content;
  min-height: 19px;
  padding: 3px 8px 3px 7px;
  align-items: center;
  gap: 5px;
  border: 1px solid rgba(220, 61, 84, 0.22);
  border-radius: 999px;
  color: #d24b60;
  background: rgba(255, 224, 229, 0.76);
  font-size: 0.56rem;
  font-weight: 750;
}

.netease-platform-dot {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: #dd5268;
}

.netease-stats-footer {
  display: flex;
  min-width: 0;
  margin-top: auto;
  align-items: flex-end;
  gap: 9px;
}

.netease-platform-mark {
  display: grid;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgba(220, 61, 84, 0.24);
  border-radius: 8px;
  color: #d94f66;
  background: rgba(255, 224, 229, 0.9);
}

.netease-stat-stack {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  align-items: flex-end;
  gap: 5px;
}

.netease-level-pill {
  padding: 3px 9px;
  border: 1px solid rgba(220, 61, 84, 0.22);
  border-radius: 999px;
  color: #d24b60;
  background: linear-gradient(135deg, rgba(255, 237, 239, 0.98), rgba(255, 214, 220, 0.76));
  box-shadow: 0 3px 9px rgba(220, 61, 84, 0.12);
  font-size: 0.52rem;
  font-weight: 800;
}

.netease-count-panel {
  display: flex;
  min-width: 126px;
  padding: 6px 9px;
  align-items: center;
  justify-content: flex-end;
  gap: 9px;
  border: 1px solid rgba(255, 255, 255, 0.64);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.66);
  box-shadow: 0 7px 15px rgba(99, 61, 77, 0.12);
}

.netease-count-panel div {
  display: flex;
  min-width: 34px;
  align-items: flex-end;
  flex-direction: column;
  gap: 2px;
}

.netease-count-panel strong {
  color: #303346;
  font-size: 1rem;
  font-weight: 850;
  line-height: 0.9;
  font-variant-numeric: tabular-nums;
}

.netease-count-panel span {
  color: #77798a;
  font-size: 0.46rem;
  font-weight: 700;
}

.netease-count-panel i {
  width: 1px;
  height: 22px;
  background: rgba(130, 111, 121, 0.22);
}

.netease-empty-face {
  position: relative;
  z-index: 2;
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 150px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  color: #9a7e88;
  font-size: 0.62rem;
}

.netease-collection-face {
  display: flex;
  gap: 6px;
  padding: 6px;
  background: rgba(255, 249, 251, 0.58);
}

.netease-collection-cover {
  position: relative;
  min-width: 0;
  flex: 1;
  overflow: hidden;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.6);
  box-shadow: 0 8px 17px rgba(84, 52, 67, 0.16);
}

.netease-title-float {
  position: absolute;
  bottom: 8px;
  left: 8px;
  z-index: 3;
  display: flex;
  width: min(205px, 52%);
  max-width: calc(100% - 16px);
  min-width: 0;
  padding: 6px 8px 6px 6px;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(255, 255, 255, 0.88);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 7px 16px rgba(73, 47, 61, 0.17);
  backdrop-filter: blur(8px);
  pointer-events: none;
}

.netease-title-mark {
  display: grid;
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 6px;
  color: #d94f66;
  background: rgba(255, 224, 229, 0.95);
}

.netease-title-list {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.netease-title-line {
  display: block;
  min-width: 0;
  overflow: hidden;
  color: #343448;
  font-size: 0.54rem;
  font-weight: 800;
  line-height: 1.2;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.netease-face-enter-active,
.netease-face-leave-active {
  transition: opacity 0.42s ease, transform 0.42s ease;
}

.netease-face-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.netease-face-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

@media (max-width: 820px) {
  .netease-stats-content {
    padding: 10px 11px 9px;
  }

  .netease-count-panel {
    min-width: 110px;
    gap: 7px;
  }

  .netease-count-panel strong {
    font-size: 0.9rem;
  }

  .netease-title-float {
    bottom: 7px;
    left: 7px;
    width: min(190px, 54%);
    padding: 5px 7px 5px 5px;
    gap: 5px;
  }

  .netease-title-mark {
    width: 18px;
    height: 18px;
  }

  .netease-title-line {
    font-size: 0.5rem;
  }

  .netease-mood-bubble {
    padding: 5px;
    font-size: 0.56rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .netease-mood-bubble {
    animation: none;
  }

  .netease-face-enter-active,
  .netease-face-leave-active {
    transition-duration: 0.01ms;
  }
}
</style>
