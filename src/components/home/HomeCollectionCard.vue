<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { HomeBangumiItem, HomeBangumiStats } from "../../data/types";
import FallbackImage from "../app/FallbackImage.vue";
import IconGlyph from "../app/IconGlyph.vue";

interface Props {
  /** Bangumi 个人收藏统计与可轮播条目。 */
  stats: HomeBangumiStats;
}

interface TypeSegment {
  key: string;
  label: string;
  count: number;
  percent: number;
}

const props = defineProps<Props>();
const showStats = ref(true);
const currentIndex = ref(0);
let rotationTimer: number | undefined;

const itemsWithCover = computed(() =>
  props.stats.items.filter((item) => item.image || item.title),
);
const currentItems = computed<HomeBangumiItem[]>(() => {
  const items = itemsWithCover.value;
  if (!items.length) return [];
  if (items.length === 1) return [items[0]];
  const index = currentIndex.value % items.length;
  return [items[index], items[(index + 1) % items.length]];
});

const statusCounts = computed(() => props.stats.statusCounts);
const typeLabels: Record<string, string> = {
  anime: "追番",
  book: "书籍",
  game: "游戏",
  music: "音乐",
  video: "视频",
};
const typeColors: Record<string, string> = {
  anime: "#f16ea8",
  book: "#8b76df",
  game: "#1b9ed4",
  music: "#35a57b",
  video: "#ee9661",
};

const typeSegments = computed<TypeSegment[]>(() => {
  const entries = Object.entries(props.stats.typeCounts)
    .filter(([, count]) => count > 0)
    .sort(([, left], [, right]) => right - left);
  const total = entries.reduce((sum, [, count]) => sum + count, 0);
  if (!total) return [];
  return entries.map(([key, count]) => ({
    key,
    label: typeLabels[key] || key,
    count,
    percent: (count / total) * 100,
  }));
});

const coverWall = computed(() => itemsWithCover.value.slice(0, 5));

const clearRotation = (): void => {
  if (rotationTimer !== undefined) window.clearTimeout(rotationTimer);
  rotationTimer = undefined;
};

const scheduleRotation = (): void => {
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
};

const handleVisibility = (): void => {
  if (document.hidden) clearRotation();
  else scheduleRotation();
};

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
    class="home-collection-card glass-panel"
    aria-label="Bangumi 收藏统计"
    aria-live="polite"
  >
    <Transition name="bangumi-face" mode="out-in">
      <div v-if="showStats || currentItems.length === 0" key="stats" class="bangumi-stats-face">
        <div class="bangumi-stat-background" aria-hidden="true"></div>

        <div v-if="coverWall.length" class="bangumi-cover-wall" aria-hidden="true">
          <div
            v-for="(item, index) in coverWall"
            :key="`${item.id}-wall`"
            class="bangumi-wall-cover"
            :class="`bangumi-wall-cover-${index}`"
          >
            <FallbackImage
              :src="item.image"
              :alt="item.title"
              fallback-icon="bookMarked"
              :icon-size="20"
            />
          </div>
        </div>

        <div v-if="stats.total" class="bangumi-stats-content">
          <div class="bangumi-taste-pill">
            <span class="bangumi-taste-dot"></span>
            <span>{{ stats.tasteProfile || "ACG 深度收藏" }}</span>
          </div>

          <div class="bangumi-count-row">
            <div class="bangumi-count bangumi-count-primary">
              <strong>{{ statusCounts.done }}</strong>
              <span>看过</span>
            </div>
            <div class="bangumi-count">
              <strong>{{ statusCounts.doing }}</strong>
              <span>在看</span>
            </div>
            <div class="bangumi-count">
              <strong>{{ statusCounts.wish }}</strong>
              <span>想看</span>
            </div>
          </div>

          <div class="bangumi-stats-footer">
            <span class="bangumi-platform-mark" title="Bangumi">
              <IconGlyph name="bookMarked" :size="15" />
            </span>
            <div v-if="typeSegments.length" class="bangumi-type-summary">
              <div class="bangumi-type-labels">
                <span v-for="segment in typeSegments" :key="segment.key">
                  <i :style="{ backgroundColor: typeColors[segment.key] || '#a68fb6' }"></i>
                  {{ segment.label }} {{ segment.count }}
                </span>
              </div>
              <div class="bangumi-type-bar" aria-hidden="true">
                <i
                  v-for="segment in typeSegments"
                  :key="`${segment.key}-bar`"
                  :style="{
                    width: `${segment.percent}%`,
                    backgroundColor: typeColors[segment.key] || '#a68fb6',
                  }"
                ></i>
              </div>
            </div>
          </div>
        </div>

        <div v-else class="bangumi-empty-face">
          <IconGlyph name="bookMarked" :size="22" />
          <span>暂无 Bangumi 收藏</span>
        </div>
      </div>

      <div v-else key="collection" class="bangumi-collection-face">
        <article
          v-for="(item, index) in currentItems"
          :key="`${item.id}-${currentIndex}-${index}`"
          class="bangumi-collection-cover"
          :aria-label="item.title"
        >
          <FallbackImage
            :src="item.image"
            :alt="item.title"
            fallback-icon="bookMarked"
            :icon-size="30"
            referrer-policy="no-referrer"
          />
          <span v-if="item.rating && item.rating > 0" class="bangumi-rating-badge">
            {{ item.rating }}
          </span>
        </article>

        <div v-if="currentItems.length" class="bangumi-title-float" aria-hidden="true">
          <span class="bangumi-title-mark">
            <IconGlyph name="bookMarked" :size="12" />
          </span>
          <div class="bangumi-title-list">
            <span
              v-for="item in currentItems"
              :key="`${item.id}-title`"
              class="bangumi-title-line"
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
.home-collection-card {
  position: relative;
  min-height: 150px;
  overflow: hidden;
  color: var(--ink);
  background: rgba(255, 247, 252, 0.76);
}

.bangumi-stats-face,
.bangumi-collection-face {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.bangumi-stats-face {
  min-height: 150px;
}

.bangumi-stat-background {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, rgba(255, 239, 247, 0.82), rgba(255, 255, 255, 0.3));
}

.bangumi-cover-wall {
  position: absolute;
  top: -9%;
  right: 0;
  display: flex;
  width: 58%;
  height: 120%;
  align-items: center;
  justify-content: flex-end;
  gap: 6px;
  padding-right: 13px;
  opacity: 0.7;
  transform: rotate(7deg);
  mask-image: linear-gradient(to left, #000 42%, transparent 100%);
  -webkit-mask-image: linear-gradient(to left, #000 42%, transparent 100%);
}

.bangumi-wall-cover {
  width: 38px;
  height: 70px;
  flex: 0 0 auto;
  overflow: hidden;
  border-radius: 7px;
  box-shadow: 0 5px 10px rgba(85, 54, 91, 0.18);
}

.bangumi-wall-cover-0,
.bangumi-wall-cover-2,
.bangumi-wall-cover-4 {
  transform: translateY(-8px);
}

.bangumi-wall-cover-1,
.bangumi-wall-cover-3 {
  transform: translateY(10px);
}

.bangumi-stats-content {
  position: relative;
  z-index: 1;
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 150px;
  padding: 11px 12px 10px;
  flex-direction: column;
}

.bangumi-taste-pill {
  display: inline-flex;
  width: max-content;
  max-width: 64%;
  min-height: 19px;
  padding: 3px 8px 3px 7px;
  align-items: center;
  gap: 5px;
  border: 1px solid rgba(241, 110, 168, 0.3);
  border-radius: 7px;
  color: #e2528b;
  background: rgba(255, 222, 237, 0.76);
  box-shadow: 0 3px 8px rgba(241, 110, 168, 0.1);
  font-size: 0.56rem;
  font-weight: 750;
}

.bangumi-taste-pill span:last-child {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bangumi-taste-dot {
  width: 5px;
  height: 5px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #ed5a97;
}

.bangumi-count-row {
  display: flex;
  min-width: 0;
  margin-top: auto;
  margin-bottom: 22px;
  align-items: flex-end;
  gap: 15px;
}

.bangumi-count {
  display: flex;
  min-width: 19px;
  flex-direction: column;
  gap: 2px;
}

.bangumi-count strong {
  color: #303346;
  font-size: 1.35rem;
  font-weight: 850;
  line-height: 0.86;
  font-variant-numeric: tabular-nums;
}

.bangumi-count span {
  color: #70768a;
  font-size: 0.48rem;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.bangumi-count-primary strong {
  font-size: clamp(2rem, 4vw, 2.55rem);
}

.bangumi-stats-footer {
  display: flex;
  min-width: 0;
  align-items: flex-end;
  gap: 9px;
}

.bangumi-platform-mark {
  display: grid;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgba(241, 110, 168, 0.26);
  border-radius: 8px;
  color: #e95791;
  background: rgba(255, 223, 238, 0.88);
}

.bangumi-type-summary {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.bangumi-type-labels {
  display: flex;
  max-width: 100%;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 2px 8px;
  color: #74798b;
  font-size: 0.46rem;
  font-weight: 700;
}

.bangumi-type-labels span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
}

.bangumi-type-labels i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
}

.bangumi-type-bar {
  display: flex;
  width: 100%;
  height: 6px;
  overflow: hidden;
  gap: 2px;
  border-radius: 999px;
  background: rgba(220, 209, 220, 0.68);
}

.bangumi-type-bar i {
  min-width: 4px;
  border-radius: inherit;
}

.bangumi-empty-face {
  position: relative;
  z-index: 1;
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 150px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  color: #9a8193;
  font-size: 0.62rem;
}

.bangumi-collection-face {
  display: flex;
  gap: 6px;
  padding: 6px;
  background: rgba(255, 249, 252, 0.58);
}

.bangumi-collection-cover {
  position: relative;
  min-width: 0;
  flex: 1;
  overflow: hidden;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.55);
  box-shadow: 0 8px 17px rgba(84, 52, 91, 0.16);
}

.bangumi-rating-badge {
  position: absolute;
  top: 7px;
  left: 7px;
  display: grid;
  width: 28px;
  height: 28px;
  place-items: center;
  border: 1px solid rgba(255, 248, 198, 0.9);
  border-radius: 8px;
  color: #fff;
  background: linear-gradient(135deg, #f6ca54, #e8921f);
  box-shadow: 0 3px 9px rgba(180, 117, 14, 0.34);
  font-size: 0.72rem;
  font-weight: 850;
  line-height: 1;
}

.bangumi-title-float {
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
  box-shadow: 0 7px 16px rgba(73, 47, 82, 0.17);
  backdrop-filter: blur(8px);
  pointer-events: none;
}

.bangumi-title-mark {
  display: grid;
  width: 20px;
  height: 20px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 6px;
  color: #e95791;
  background: rgba(255, 224, 238, 0.95);
}

.bangumi-title-list {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.bangumi-title-line {
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

.bangumi-face-enter-active,
.bangumi-face-leave-active {
  transition: opacity 0.42s ease, transform 0.42s ease;
}

.bangumi-face-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.bangumi-face-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

@media (max-width: 820px) {
  .bangumi-stats-content {
    padding: 10px 11px 9px;
  }

  .bangumi-cover-wall {
    width: 55%;
    padding-right: 8px;
  }

  .bangumi-wall-cover {
    width: 31px;
    height: 58px;
  }

  .bangumi-count-row {
    gap: 10px;
    margin-bottom: 19px;
  }

  .bangumi-count-primary strong {
    font-size: 2rem;
  }

  .bangumi-count strong {
    font-size: 1.15rem;
  }

  .bangumi-type-labels {
    gap: 2px 5px;
    font-size: 0.42rem;
  }

  .bangumi-title-float {
    bottom: 7px;
    left: 7px;
    width: min(190px, 54%);
    padding: 5px 7px 5px 5px;
    gap: 5px;
  }

  .bangumi-title-mark {
    width: 18px;
    height: 18px;
  }

  .bangumi-title-line {
    font-size: 0.5rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .bangumi-face-enter-active,
  .bangumi-face-leave-active {
    transition-duration: 0.01ms;
  }
}
</style>
