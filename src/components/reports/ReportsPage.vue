<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import type { ReportPlatformCard as ReportPlatformCardData } from "../../data/types";
import IconGlyph from "../app/IconGlyph.vue";
import ReportPlatformCard from "./ReportPlatformCard.vue";
import ReportStageMode from "./ReportStageMode.vue";

interface Props {
  platforms: ReportPlatformCardData[];
}

const props = defineProps<Props>();

const activeIndex = ref(0);
const stageOpen = ref(false);
const stagePlayAll = ref(false);
const stagePaused = ref(false);
const isClientReady = ref(false);
const cardViewport = ref<HTMLElement | null>(null);
let cardViewportResetTimer: number | null = null;
let cardScrollFrame: number | null = null;

const activeCard = computed(
  () => props.platforms[activeIndex.value] ?? props.platforms[0],
);
const activeLabel = computed(
  () =>
    activeCard.value?.platformLabel ||
    activeCard.value?.eyebrow ||
    "暂无数据报告",
);
const stageHeroNames: Record<string, string> = {
  bangumi: "Bangumi",
  bilibili: "Bilibili",
  discord: "Discord",
  github: "GitHub",
  mal: "MyAnimeList",
  netease: "NetEase",
  psn: "PlayStation",
  qq: "QQ",
  steam: "Steam",
  x: "X",
  xbox: "Xbox",
  youtube: "YouTube",
};
const activeSummary = computed(
  () =>
    activeCard.value?.summary ||
    (activeCard.value
      ? `${activeCard.value.title} · ${activeCard.value.subtitle}`
      : "保存数据快照后，这里会显示报告内容。"),
);
const activeStageHero = computed(() => {
  if (!stageOpen.value) return "Stage";
  const platformId = activeCard.value?.platformId?.toLowerCase() || "";
  return stageHeroNames[platformId] || activeLabel.value;
});
const activeStatusSummary = computed(() =>
  stageOpen.value ? "舞台模式播放中" : activeSummary.value,
);
const statusTitle = computed(() =>
  stageOpen.value ? `${activeLabel.value} · 舞台模式播放中` : "平台报告舞台",
);
const statusActionLabel = computed(() => {
  if (!stageOpen.value) return "播放所有平台报告";
  return stagePaused.value ? "继续播放" : "暂停";
});

const scrollCardIntoView = async (index: number): Promise<void> => {
  await nextTick();
  const viewport = cardViewport.value;
  if (!viewport) return;

  if (cardScrollFrame !== null) {
    window.cancelAnimationFrame(cardScrollFrame);
    cardScrollFrame = null;
  }

  if (index === 0) {
    viewport.scrollLeft = 0;
    return;
  }

  const target = viewport.children[index] as HTMLElement | undefined;
  if (!target) return;

  const targetCenter = target.offsetLeft + target.offsetWidth / 2;
  const destination = Math.max(
    0,
    Math.min(
      viewport.scrollWidth - viewport.clientWidth,
      targetCenter - viewport.clientWidth / 2,
    ),
  );
  const start = viewport.scrollLeft;
  const distance = destination - start;
  if (Math.abs(distance) < 1) return;

  const duration = 860;
  const startedAt = performance.now();
  const animate = (now: number): void => {
    const progress = Math.min(1, (now - startedAt) / duration);
    const eased = 1 - Math.pow(1 - progress, 3);
    viewport.scrollLeft = start + distance * eased;
    if (progress < 1) {
      cardScrollFrame = window.requestAnimationFrame(animate);
    } else {
      cardScrollFrame = null;
    }
  };
  cardScrollFrame = window.requestAnimationFrame(animate);
};

const resetCardViewport = (): void => {
  if (cardScrollFrame !== null) {
    window.cancelAnimationFrame(cardScrollFrame);
    cardScrollFrame = null;
  }
  if (cardViewport.value) cardViewport.value.scrollLeft = 0;
};

const openStage = (index: number, playAll = false): void => {
  if (!props.platforms.length) return;
  activeIndex.value = Math.max(0, Math.min(index, props.platforms.length - 1));
  stagePlayAll.value = playAll;
  stagePaused.value = false;
  stageOpen.value = true;
  void scrollCardIntoView(activeIndex.value);
};

const selectCard = (index: number): void => {
  if (stageOpen.value && index === activeIndex.value) {
    closeStage();
    return;
  }
  openStage(index);
};

const startPlayAll = (): void => {
  openStage(0, true);
};

const closeStage = (): void => {
  stageOpen.value = false;
  stagePlayAll.value = false;
  stagePaused.value = false;
  if (activeIndex.value === 0) {
    void nextTick().then(() => {
      resetCardViewport();
      window.requestAnimationFrame(resetCardViewport);
      if (cardViewportResetTimer !== null) {
        window.clearTimeout(cardViewportResetTimer);
      }
      cardViewportResetTimer = window.setTimeout(() => {
        resetCardViewport();
        cardViewportResetTimer = null;
      }, 420);
    });
  }
};

const handleStageComplete = (): void => {
  if (!stagePlayAll.value || activeIndex.value >= props.platforms.length - 1) {
    closeStage();
    return;
  }
  activeIndex.value += 1;
  stagePaused.value = false;
  void scrollCardIntoView(activeIndex.value);
};

const handleStatusAction = (): void => {
  if (!stageOpen.value) {
    startPlayAll();
    return;
  }
  stagePaused.value = !stagePaused.value;
};

onMounted(() => {
  isClientReady.value = true;
  resetCardViewport();
  window.requestAnimationFrame(resetCardViewport);
  cardViewportResetTimer = window.setTimeout(resetCardViewport, 1000);
});

watch(
  () => props.platforms.length,
  (length) => {
    if (length === 0) {
      activeIndex.value = 0;
      closeStage();
      return;
    }
    activeIndex.value = Math.min(activeIndex.value, length - 1);
  },
);

watch(
  () => props.platforms.map((card) => card.id).join("|"),
  () => {
    if (activeIndex.value >= props.platforms.length) {
      activeIndex.value = Math.max(0, props.platforms.length - 1);
    }
  },
);

onBeforeUnmount(() => {
  document.body.style.overflow = "";
  if (cardViewportResetTimer !== null)
    window.clearTimeout(cardViewportResetTimer);
  if (cardScrollFrame !== null) window.cancelAnimationFrame(cardScrollFrame);
});
</script>

<template>
  <div class="reports-page" :class="{ 'is-stage-open': stageOpen }">
    <div class="reports-atmosphere" aria-hidden="true">
      <span class="reports-orbit reports-orbit-one"></span>
      <span class="reports-orbit reports-orbit-two"></span>
      <span class="reports-grid"></span>
    </div>

    <section v-if="activeCard" class="reports-stage" aria-label="平台报告舞台">
      <div class="reports-stage-head">
        <div class="reports-stage-heading">
          <Transition name="report-hero-swap" mode="out-in">
            <span
              :key="`${activeCard.id}-${stageOpen}`"
              class="reports-stage-title"
              aria-hidden="true"
              >{{ activeStageHero }}</span
            >
          </Transition>
        </div>
        <div
          class="reports-status glass-panel"
          :class="{ 'is-stage-active': stageOpen }"
          role="status"
          :aria-label="statusTitle"
        >
          <Transition name="report-status-swap" mode="out-in">
            <div
              :key="`${activeCard.id}-${stageOpen}`"
              class="reports-status-copy"
            >
              <strong>{{ activeLabel }}</strong>
              <span>{{ activeStatusSummary }}</span>
            </div>
          </Transition>
          <span class="reports-status-divider" aria-hidden="true"></span>
          <div class="reports-status-actions">
            <button
              class="reports-play"
              type="button"
              :aria-label="statusActionLabel"
              :title="statusActionLabel"
              @click="handleStatusAction"
            >
              <IconGlyph
                :name="stageOpen && !stagePaused ? 'pause' : 'play'"
                :size="16"
              />
            </button>
            <button
              v-if="stageOpen"
              class="reports-close"
              type="button"
              aria-label="关闭舞台"
              title="关闭舞台"
              @click="closeStage"
            >
              <IconGlyph name="x" :size="15" />
            </button>
          </div>
        </div>
      </div>

      <div
        ref="cardViewport"
        class="reports-card-viewport"
        role="list"
        aria-label="平台报告卡片"
      >
        <div
          v-for="(card, index) in props.platforms"
          :key="card.id"
          class="reports-card-slot"
          :style="{ '--report-card-index': index }"
        >
          <ReportPlatformCard
            :card="card"
            :index="index"
            :active="stageOpen && index === activeIndex"
            :stage-playing="stageOpen && index === activeIndex"
            @select="selectCard(index)"
          />
        </div>
      </div>
    </section>

    <div v-else class="reports-empty glass-panel">
      <div class="reports-empty-icon">
        <IconGlyph name="report" :size="22" />
      </div>
      <div>
        <span class="reports-empty-kicker">NO SNAPSHOT YET</span>
        <strong>暂无数据报告</strong>
        <p>保存数据快照后，这里会显示平台报告内容。</p>
      </div>
    </div>

    <ReportStageMode
      v-if="isClientReady"
      :open="stageOpen"
      :card="activeCard"
      :card-index="activeIndex"
      :card-count="props.platforms.length"
      :play-all="stagePlayAll"
      :paused="stagePaused"
      @update:paused="stagePaused = $event"
      @complete="handleStageComplete"
      @close="closeStage"
    />
  </div>
</template>

<style scoped>
.reports-page {
  --report-page-padding: 24px;
  --report-visible-cards: 4;
  position: relative;
  width: 100%;
  height: 100dvh;
  min-height: 100vh;
  overflow: hidden;
  isolation: isolate;
}

.reports-page::before {
  position: absolute;
  z-index: 0;
  inset: 0;
  background: rgba(255, 255, 255, 0.97);
  content: "";
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.55s ease;
}

.reports-page.is-stage-open::before {
  opacity: 1;
}

.reports-page.is-stage-open .reports-atmosphere {
  opacity: 0;
  transition: opacity 0.4s ease;
}

.reports-atmosphere {
  position: absolute;
  z-index: -1;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}

.reports-orbit {
  position: absolute;
  display: block;
  border: 1px solid rgba(255, 255, 255, 0.34);
  border-radius: 50%;
  opacity: 0.55;
  transform: rotate(-18deg);
}

.reports-orbit-one {
  top: 20%;
  right: -7%;
  width: min(46vw, 620px);
  aspect-ratio: 1.5;
}

.reports-orbit-two {
  top: 27%;
  right: -3%;
  width: min(37vw, 500px);
  aspect-ratio: 1.5;
  border-color: rgba(117, 100, 222, 0.22);
}

.reports-grid {
  position: absolute;
  right: 7%;
  bottom: 17%;
  width: min(42vw, 560px);
  height: 160px;
  opacity: 0.16;
  background-image:
    linear-gradient(rgba(117, 100, 222, 0.28) 1px, transparent 1px),
    linear-gradient(90deg, rgba(117, 100, 222, 0.28) 1px, transparent 1px);
  background-size: 22px 22px;
  mask-image: linear-gradient(to left, #000, transparent);
  transform: perspective(400px) rotateX(58deg) rotateZ(-5deg);
}

.reports-stage {
  position: absolute;
  z-index: 2;
  right: max(32px, calc((100vw - 1264px) / 2));
  top: min(calc(60dvh + 32px), calc(100dvh - 256px));
  left: max(32px, calc((100vw - 1264px) / 2));
  width: auto;
  height: 280px;
  margin: 0;
}

.reports-stage-head {
  position: relative;
  z-index: 2;
  height: 60px;
}

.reports-stage-heading {
  position: absolute;
  top: -90px;
  left: 4px;
  display: flex;
  flex-direction: column;
}

.reports-stage-title {
  color: rgba(88, 139, 214, 0.94);
  font-family: "Momona Script", cursive;
  font-size: 6rem;
  line-height: 1.5;
  white-space: nowrap;
  -webkit-text-stroke: 0.5px rgba(88, 139, 214, 0.28);
}

.reports-status {
  position: absolute;
  top: 4px;
  left: 4px;
  display: flex;
  width: min(281px, calc(100vw - 117px));
  height: 52px;
  min-height: 52px;
  padding: 0 8px 0 12px;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.74);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.28) inset,
    0 -1px 0 rgba(0, 0, 0, 0.04) inset,
    0 8px 28px rgba(31, 38, 135, 0.1);
  backdrop-filter: blur(13.6px) saturate(180%);
  box-sizing: border-box;
  transition:
    width 0.52s cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 0.42s ease,
    background-color 0.42s ease;
  will-change: width;
}

.reports-status.is-stage-active {
  width: min(201px, calc(100vw - 117px));
}

.reports-status-copy {
  display: flex;
  min-width: 0;
  flex: 0 1 200px;
  flex-direction: column;
  gap: 3px;
  margin-right: 6px;
  margin-left: 6px;
}

.reports-status-copy strong,
.reports-status-copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.reports-status-copy strong {
  color: rgba(31, 41, 55, 0.94);
  font-size: 0.875rem;
  font-weight: 700;
  line-height: 1.25rem;
}

.reports-status-copy span {
  color: rgba(75, 85, 99, 0.78);
  font-size: 0.75rem;
  line-height: 0.9375rem;
}

.reports-status-divider {
  width: 1px;
  height: 34px;
  flex: 0 0 auto;
  background: rgba(110, 119, 137, 0.18);
}

.reports-status-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 6px;
}

.reports-play,
.reports-close {
  display: grid;
  width: 30px;
  height: 30px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 8px;
  color: #6d7ea8;
  background: rgba(228, 235, 248, 0.76);
  transition:
    color 0.18s ease,
    background 0.18s ease,
    transform 0.18s ease;
}

.reports-close {
  width: 30px;
  color: var(--muted);
  background: rgba(235, 237, 244, 0.7);
}

.reports-play:hover,
.reports-close:hover {
  color: var(--purple-deep);
  background: rgba(214, 224, 247, 0.98);
  transform: translateY(-2px);
}

.reports-card-viewport {
  position: absolute;
  top: 40px;
  left: 50%;
  display: flex;
  width: 100vw;
  height: calc((min(100vw - 48px, 1280px) - 16px) / 8 + 80px);
  padding: 32px 32px 48px max(36px, calc((100vw - 1264px) / 2 + 4px));
  gap: 16px;
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  scroll-padding-left: max(36px, calc((100vw - 1264px) / 2 + 4px));
  scroll-snap-type: x mandatory;
  transform: translateX(-50%);
  cursor: grab;
}

.reports-card-viewport:active {
  cursor: grabbing;
}

.reports-card-viewport::-webkit-scrollbar {
  display: none;
}

.reports-card-slot {
  display: flex;
  min-width: 0;
  flex: 0 0 calc((min(100vw - 48px, 1280px) - 16px) / 4);
  align-self: flex-start;
  aspect-ratio: 2 / 1;
  animation: report-card-slot-in 0.64s cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: calc(110ms + var(--report-card-index) * 85ms);
  scroll-snap-align: start;
}

.reports-empty {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  width: min(430px, calc(100% - 48px));
  padding: 22px;
  align-items: center;
  gap: 14px;
  border-radius: 17px;
  background: rgba(255, 255, 255, 0.66);
  transform: translate(-50%, -50%);
}

.reports-empty-icon {
  display: grid;
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 13px;
  color: var(--purple-deep);
  background: rgba(117, 100, 222, 0.12);
}

.reports-empty > div:last-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.reports-empty-kicker {
  color: var(--purple-deep);
  font-size: 0.5rem;
  font-weight: 800;
  letter-spacing: 0.14em;
}

.reports-empty strong {
  color: var(--ink-soft);
  font-size: 0.86rem;
}

.reports-empty p {
  margin: 0;
  color: var(--muted);
  font-size: 0.62rem;
  line-height: 1.4;
}

.report-status-swap-enter-active,
.report-status-swap-leave-active {
  transition:
    opacity 0.52s ease,
    transform 0.68s cubic-bezier(0.16, 1, 0.3, 1),
    filter 0.52s ease;
}

.report-status-swap-enter-from,
.report-status-swap-leave-to {
  opacity: 0;
  filter: blur(4px);
  transform: translateY(8px);
}

.report-hero-swap-enter-active,
.report-hero-swap-leave-active {
  transition:
    opacity 0.72s ease,
    transform 0.92s cubic-bezier(0.16, 1, 0.3, 1),
    filter 0.72s ease;
}

.report-hero-swap-enter-from {
  opacity: 0;
  filter: blur(8px);
  transform: translateY(14px);
}

.report-hero-swap-leave-to {
  opacity: 0;
  filter: blur(6px);
  transform: translateY(-12px);
}

@keyframes report-card-slot-in {
  from {
    opacity: 0;
    transform: translate3d(0, 22px, 0) scale(0.94);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0) scale(1);
  }
}

@media (max-width: 1199px) and (min-width: 641px) {
  .reports-page {
    --report-visible-cards: 2;
  }

  .reports-stage {
    height: 280px;
  }

  .reports-card-viewport {
    height: 232px;
  }

  .reports-card-slot {
    flex-basis: min(304px, calc(50vw - 48px));
  }
}

@media (max-width: 1487px) and (min-width: 821px) {
  .reports-stage-heading,
  .reports-status {
    left: calc(116px - max(32px, calc((100vw - 1264px) / 2)));
  }
}

@media (max-width: 640px) {
  .reports-page {
    --report-page-padding: 16px;
    --report-visible-cards: 1;
  }

  .reports-stage {
    right: 24px;
    top: auto;
    bottom: 104px;
    left: 24px;
    width: auto;
    height: 247px;
    margin: 0;
    transform: none;
  }

  .reports-page.is-stage-open .reports-stage {
    height: 68px;
  }

  .reports-page.is-stage-open .reports-stage-heading,
  .reports-page.is-stage-open .reports-card-viewport {
    display: none;
  }

  .reports-stage-head {
    height: 60px;
  }

  .reports-status {
    width: min(273px, calc(100vw - 117px));
  }

  .reports-status.is-stage-active {
    width: min(193px, calc(100vw - 117px));
  }

  .reports-status-copy {
    flex-basis: 200px;
    margin-right: 2px;
    margin-left: 2px;
  }

  .reports-status-copy span {
    font-size: 0.65rem;
  }

  .reports-card-viewport {
    left: 50%;
    width: 100vw;
    height: 251px;
    padding: 32px 16px 48px 28px;
    scroll-padding-left: 28px;
    transform: translateX(-50%);
  }

  .reports-card-slot {
    flex-basis: calc(100vw - 48px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .reports-card-slot {
    animation: none;
  }

  .report-status-swap-enter-active,
  .report-status-swap-leave-active {
    transition-duration: 0.01ms;
  }

  .report-hero-swap-enter-active,
  .report-hero-swap-leave-active {
    transition-duration: 0.01ms;
  }
}

:global(.navigation-rail--reports) {
  opacity: 1;
  pointer-events: auto;
}
</style>
