<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { ReportPlatformCard } from "../../data/types";
import ReportPlatformCardView from "./ReportPlatformCard.vue";

interface Props {
  open: boolean;
  card?: ReportPlatformCard;
  cardIndex: number;
  cardCount: number;
  playAll?: boolean;
  paused?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  card: undefined,
  playAll: false,
  paused: false,
});

const emit = defineEmits<{
  close: [];
  complete: [];
  "update:paused": [value: boolean];
}>();

interface StageChapter {
  title: string;
  lines: string[];
}

interface VisibleLine {
  id: string;
  text: string;
}

const chapterIndex = ref(0);
const visibleLines = ref<VisibleLine[]>([]);
let nextLineIndex = 0;
let lineTimer: number | null = null;
let chapterTimer: number | null = null;
let chapterDeadline = 0;
let chapterRemaining = 0;

const CONTROL_CHARS = /[\u0000-\u001F\u007F-\u009F]/g;
const MARKDOWN_SYMBOLS = /[*_~`]/g;
const PUNCTUATION = /([。！？.!?，,])/g;

const cleanText = (value: string): string =>
  value
    .replace(CONTROL_CHARS, "")
    .replace(MARKDOWN_SYMBOLS, "")
    .replace(/\s+/g, " ")
    .trim();

const splitSentences = (value: string): string[] =>
  value
    .replace(PUNCTUATION, "$1\uFFFF")
    .split("\uFFFF")
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 5);

const chapters = computed<StageChapter[]>(() => {
  const card = props.card;
  if (!card) return [];

  const summary = cleanText(card.summary || `${card.title} · ${card.subtitle}`);
  const dataEcho = splitSentences(summary);
  const labels = card.statLabels ?? [];
  const stats = (card.stats ?? [])
    .map((stat, index) => `${labels[index] || "统计"} ${stat}`)
    .filter(Boolean);
  const tags = (card.tags ?? []).filter(Boolean);
  const insights = (card.insights ?? []).map(cleanText).filter(Boolean);
  const metadataLines = [
    stats.length ? `这份快照记录了：${stats.join("、")}。` : "",
    tags.length ? `关键词聚合为：${tags.join("、")}。` : "",
    card.updatedAt ? `数据更新于 ${card.updatedAt}。` : "",
  ].filter(Boolean);

  const result: StageChapter[] = [];
  if (insights.length)
    result.push({ title: "深度洞察", lines: insights.slice(0, 5) });
  if (dataEcho.length)
    result.push({ title: "数据回响", lines: dataEcho.slice(0, 5) });
  if (metadataLines.length)
    result.push({ title: "数据细节", lines: metadataLines.slice(0, 5) });
  if (!result.length) {
    result.push({
      title: "数据回响",
      lines: ["这份报告暂时没有可展开的摘要。"],
    });
  }
  return result;
});

const currentChapter = computed(() => chapters.value[chapterIndex.value]);
const currentChapterLabel = computed(() => currentChapter.value?.title ?? "");
const stageActLabel = computed(
  () => `ACT ${chapterIndex.value + 1}/${Math.max(chapters.value.length, 1)}`,
);

const clearTimer = (timer: number | null): void => {
  if (timer !== null) window.clearTimeout(timer);
};

const clearPlayback = (): void => {
  clearTimer(lineTimer);
  clearTimer(chapterTimer);
  lineTimer = null;
  chapterTimer = null;
};

const chapterDuration = computed(() => {
  const lineCount = currentChapter.value?.lines.length ?? 1;
  return Math.max(7600, 1550 + lineCount * 1350);
});

const revealNextLine = (): void => {
  const lines = currentChapter.value?.lines ?? [];
  if (nextLineIndex >= lines.length || props.paused || !props.open) return;

  visibleLines.value = [
    ...visibleLines.value,
    {
      id: `${chapterIndex.value}-${nextLineIndex}`,
      text: lines[nextLineIndex],
    },
  ].slice(-5);
  nextLineIndex += 1;

  if (nextLineIndex < lines.length) {
    lineTimer = window.setTimeout(revealNextLine, 1350);
  }
};

const scheduleChapterEnd = (delay: number): void => {
  clearTimer(chapterTimer);
  if (props.paused || !props.open) return;
  chapterRemaining = delay;
  chapterDeadline = Date.now() + delay;
  chapterTimer = window.setTimeout(() => {
    chapterTimer = null;
    if (chapterIndex.value < chapters.value.length - 1) {
      chapterIndex.value += 1;
      visibleLines.value = [];
      nextLineIndex = 0;
      startChapter();
    } else {
      emit("complete");
    }
  }, delay);
};

const startChapter = (): void => {
  clearPlayback();
  chapterRemaining = chapterDuration.value;
  if (props.paused || !props.open) return;
  lineTimer = window.setTimeout(revealNextLine, 520);
  scheduleChapterEnd(chapterRemaining);
};

const pausePlayback = (): void => {
  if (chapterTimer !== null) {
    chapterRemaining = Math.max(0, chapterDeadline - Date.now());
  }
  clearPlayback();
};

const resumePlayback = (): void => {
  if (!props.open) return;
  if (nextLineIndex < (currentChapter.value?.lines.length ?? 0)) {
    lineTimer = window.setTimeout(revealNextLine, 260);
  }
  scheduleChapterEnd(chapterRemaining || chapterDuration.value);
};

const resetPlayback = (): void => {
  clearPlayback();
  chapterIndex.value = 0;
  visibleLines.value = [];
  nextLineIndex = 0;
  chapterRemaining = 0;
  if (props.open) startChapter();
};

const togglePause = (): void => {
  emit("update:paused", !props.paused);
};

const handleKeydown = (event: KeyboardEvent): void => {
  if (event.key === "Escape") emit("close");
  if (event.key === " ") {
    event.preventDefault();
    togglePause();
  }
};

watch(
  () => [props.open, props.card?.id] as const,
  () => {
    resetPlayback();
  },
  { immediate: true },
);

watch(
  () => props.paused,
  (paused) => {
    if (paused) pausePlayback();
    else resumePlayback();
  },
);

watch(
  () => props.open,
  (open) => {
    if (typeof document !== "undefined") {
      document.body.style.overflow = open ? "hidden" : "";
    }
    if (typeof window === "undefined") return;
    if (open) window.addEventListener("keydown", handleKeydown);
    else window.removeEventListener("keydown", handleKeydown);
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  clearPlayback();
  if (typeof document !== "undefined") document.body.style.overflow = "";
  window.removeEventListener("keydown", handleKeydown);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="report-stage-fade">
      <section
        v-if="props.open && props.card"
        class="report-stage-mode"
        role="region"
        aria-label="数据报告舞台"
      >
        <div class="report-stage-curtain" aria-hidden="true"></div>
        <div class="report-stage-noise" aria-hidden="true"></div>

        <div class="report-stage-inner">
          <Transition name="report-stage-theme" mode="out-in">
            <main :key="props.card.id" class="report-stage-main">
              <div class="report-stage-copy">
                <TransitionGroup
                  name="report-stage-line"
                  tag="div"
                  class="report-stage-lines"
                >
                  <p v-for="line in visibleLines" :key="line.id">
                    {{ line.text }}
                  </p>
                </TransitionGroup>
                <p v-if="!visibleLines.length" class="report-stage-pending">
                  正在读取这份快照……
                </p>
              </div>

              <div class="report-stage-card-column">
                <div class="report-stage-meta">
                  <Transition name="report-stage-meta-swap" mode="out-in">
                    <div
                      :key="`${props.card.id}-${chapterIndex}`"
                      class="report-stage-meta-copy"
                    >
                      <span>{{ stageActLabel }}</span>
                      <strong>{{ currentChapterLabel }}</strong>
                    </div>
                  </Transition>
                  <span class="report-stage-dots" aria-hidden="true">
                    <i
                      v-for="(_, index) in chapters"
                      :key="index"
                      :class="{ 'is-current': index === chapterIndex }"
                    ></i>
                  </span>
                </div>
                <div class="report-stage-card-frame">
                  <ReportPlatformCardView
                    :card="props.card"
                    :interactive="false"
                    :stage="true"
                  />
                </div>
              </div>
            </main>
          </Transition>
        </div>
      </section>
    </Transition>
  </Teleport>
</template>

<style scoped>
.report-stage-mode {
  position: fixed;
  z-index: 60;
  inset: 0;
  overflow: hidden;
  color: var(--ink-soft);
  background: rgba(246, 247, 252, 0.22);
  backdrop-filter: blur(2px) saturate(108%);
  isolation: isolate;
}

.report-stage-curtain,
.report-stage-noise {
  position: absolute;
  inset: 0;
  pointer-events: none;
}

.report-stage-curtain {
  z-index: 0;
  background:
    radial-gradient(
      ellipse 70% 55% at 30% 34%,
      rgba(117, 100, 222, 0.1),
      transparent 60%
    ),
    radial-gradient(
      ellipse 65% 50% at 72% 58%,
      rgba(0, 161, 214, 0.08),
      transparent 58%
    ),
    linear-gradient(
      to bottom,
      transparent 0%,
      transparent 35%,
      rgba(255, 255, 255, 0.2) 55%,
      rgba(255, 255, 255, 0.76) 85%,
      rgba(255, 255, 255, 0.92) 100%
    );
  animation: report-stage-curtain-breathe 12s ease-in-out infinite alternate;
}

.report-stage-noise {
  z-index: 0;
  opacity: 0.035;
  background-image:
    linear-gradient(rgba(89, 73, 137, 0.65) 1px, transparent 1px),
    linear-gradient(90deg, rgba(89, 73, 137, 0.65) 1px, transparent 1px);
  background-size: 50px 50px;
  mask-image: linear-gradient(to bottom, #000, transparent 78%);
}

.report-stage-inner {
  position: relative;
  z-index: 1;
  display: flex;
  width: min(1240px, calc(100% - 48px));
  height: 100%;
  margin: 0 auto;
  padding: 32px 0 24px;
  flex-direction: column;
}

.report-stage-header,
.report-stage-footer {
  display: flex;
  align-items: center;
}

.report-stage-header {
  min-height: 54px;
  gap: 24px;
}

.report-stage-brand {
  display: flex;
  min-width: 160px;
  flex-direction: column;
  gap: 2px;
}

.report-stage-brand span {
  color: var(--purple-deep);
  font-family: "Momona Script", cursive;
  font-size: 3.35rem;
  line-height: 0.8;
}

.report-stage-brand small,
.report-stage-meta,
.report-stage-card-caption,
.report-stage-footer-copy {
  font-size: 0.56rem;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.report-stage-brand small {
  color: rgba(68, 66, 108, 0.56);
}

.report-stage-meta {
  display: flex;
  min-width: 0;
  margin-left: auto;
  align-items: center;
  gap: 12px;
  color: rgba(68, 66, 108, 0.58);
}

.report-stage-meta strong {
  color: var(--ink-soft);
  font-size: 0.68rem;
  letter-spacing: 0.08em;
}

.report-stage-live {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: rgba(68, 66, 108, 0.7);
}

.report-stage-live i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #f16ea8;
  box-shadow: 0 0 0 4px rgba(241, 110, 168, 0.14);
}

.report-stage-icon-button,
.report-stage-pause {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.7);
  color: var(--muted-strong);
  background: rgba(255, 255, 255, 0.58);
  box-shadow: 0 8px 20px rgba(54, 45, 106, 0.1);
  transition:
    transform 0.2s ease,
    background 0.2s ease,
    border-color 0.2s ease;
}

.report-stage-icon-button {
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  padding: 0;
  border-radius: 12px;
}

.report-stage-icon-button:hover,
.report-stage-pause:hover {
  border-color: rgba(117, 100, 222, 0.4);
  color: var(--purple-deep);
  background: rgba(255, 255, 255, 0.84);
  transform: translateY(-2px);
}

.report-stage-main {
  display: grid;
  min-height: 0;
  flex: 1;
  grid-template-columns: minmax(0, 1fr) minmax(300px, 410px);
  align-items: center;
  gap: clamp(24px, 8vw, 120px);
}

.report-stage-copy {
  display: flex;
  min-width: 0;
  max-height: 68vh;
  flex-direction: column;
  justify-content: center;
}

.report-stage-copy-kicker {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 24px;
  color: rgba(68, 66, 108, 0.56);
  font-size: 0.62rem;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.report-stage-copy-kicker > span:first-child {
  color: var(--ink-soft);
}

.report-stage-rule {
  width: 34px;
  height: 1px;
  background: rgba(89, 73, 137, 0.35);
}

.report-stage-lines {
  display: flex;
  min-height: 230px;
  max-width: 720px;
  flex-direction: column;
  justify-content: end;
  overflow: hidden;
}

.report-stage-lines p,
.report-stage-pending {
  margin: 0 0 18px;
  color: var(--ink-soft);
  font-size: clamp(1.45rem, 3vw, 3rem);
  font-weight: 750;
  line-height: 1.18;
  letter-spacing: 0.06em;
  text-wrap: balance;
}

.report-stage-lines p:last-child {
  margin-bottom: 0;
}

.report-stage-pending {
  color: rgba(68, 66, 108, 0.56);
  font-size: 1.05rem;
  font-weight: 500;
}

.report-stage-card-column {
  position: relative;
  display: flex;
  width: 100%;
  flex-direction: column;
  gap: 12px;
  justify-self: end;
}

.report-stage-card-caption {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  color: rgba(68, 66, 108, 0.5);
}

.report-stage-card-caption span:last-child {
  overflow: hidden;
  color: var(--ink-soft);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.report-stage-card-frame {
  width: 100%;
  aspect-ratio: 2;
  animation: report-stage-card-in 1.08s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.report-stage-footer {
  min-height: 48px;
  gap: 16px;
}

.report-stage-progress {
  display: flex;
  width: min(230px, 32vw);
  gap: 5px;
}

.report-stage-progress span {
  display: block;
  height: 3px;
  flex: 1;
  border-radius: 99px;
  background: rgba(89, 73, 137, 0.18);
  transition: background 0.3s ease;
}

.report-stage-progress span.is-current,
.report-stage-progress span.is-past {
  background: var(--purple);
}

.report-stage-footer-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
  color: rgba(68, 66, 108, 0.52);
}

.report-stage-footer-copy strong {
  color: var(--ink-soft);
  font-size: 0.62rem;
}

.report-stage-footer-copy span {
  letter-spacing: 0.08em;
}

.report-stage-pause {
  min-width: 82px;
  height: 34px;
  gap: 7px;
  margin-left: auto;
  padding: 0 12px;
  border-radius: 10px;
  font-size: 0.62rem;
  letter-spacing: 0.08em;
}

.report-stage-line-enter-active,
.report-stage-line-leave-active {
  transition:
    opacity 0.88s ease,
    transform 0.96s cubic-bezier(0.16, 1, 0.3, 1),
    filter 0.88s ease;
}

.report-stage-line-enter-from {
  opacity: 0;
  filter: blur(10px);
  transform: translateX(-24px);
}

.report-stage-line-leave-to {
  opacity: 0;
  filter: blur(5px);
  transform: translateY(-18px);
}

.report-stage-fade-enter-active,
.report-stage-fade-leave-active {
  transition: opacity 0.68s ease;
}

.report-stage-fade-enter-from,
.report-stage-fade-leave-to {
  opacity: 0;
}

.report-stage-theme-enter-active,
.report-stage-theme-leave-active {
  transition:
    opacity 0.86s ease,
    transform 1.04s cubic-bezier(0.16, 1, 0.3, 1),
    filter 0.86s ease;
}

.report-stage-theme-enter-from {
  opacity: 0;
  filter: blur(9px);
  transform: translateY(18px) scale(0.985);
}

.report-stage-theme-leave-to {
  opacity: 0;
  filter: blur(7px);
  transform: translateY(-14px) scale(1.01);
}

.report-stage-meta-swap-enter-active,
.report-stage-meta-swap-leave-active {
  transition:
    opacity 0.58s ease,
    transform 0.72s cubic-bezier(0.16, 1, 0.3, 1),
    filter 0.58s ease;
}

.report-stage-meta-swap-enter-from {
  opacity: 0;
  filter: blur(5px);
  transform: translateY(7px);
}

.report-stage-meta-swap-leave-to {
  opacity: 0;
  filter: blur(4px);
  transform: translateY(-7px);
}

@keyframes report-stage-curtain-breathe {
  from {
    transform: scale(1) translate3d(0, 0, 0);
  }
  to {
    transform: scale(1.08) translate3d(-1.5%, 1%, 0);
  }
}

@keyframes report-stage-card-in {
  from {
    opacity: 0;
    transform: translateY(22px) scale(0.94) rotate(1deg);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1) rotate(0);
  }
}

@media (max-width: 820px) {
  .report-stage-inner {
    width: min(100% - 28px, 620px);
    padding: 18px 0 92px;
  }

  .report-stage-header {
    gap: 12px;
  }

  .report-stage-brand {
    min-width: 120px;
  }

  .report-stage-brand span {
    font-size: 2.8rem;
  }

  .report-stage-brand small {
    font-size: 0.46rem;
  }

  .report-stage-meta {
    gap: 7px;
    font-size: 0.47rem;
  }

  .report-stage-meta strong {
    max-width: 80px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .report-stage-live {
    display: none;
  }

  .report-stage-main {
    display: flex;
    flex-direction: column;
    align-items: stretch;
    justify-content: center;
    gap: 26px;
  }

  .report-stage-copy {
    flex: 0 1 auto;
  }

  .report-stage-copy-kicker {
    margin-bottom: 12px;
  }

  .report-stage-lines {
    min-height: 146px;
  }

  .report-stage-lines p {
    margin-bottom: 10px;
    font-size: clamp(1.25rem, 6vw, 2rem);
  }

  .report-stage-pending {
    margin-bottom: 0;
    font-size: 0.9rem;
  }

  .report-stage-card-column {
    width: min(100%, 390px);
    align-self: center;
  }

  .report-stage-footer {
    position: absolute;
    right: 0;
    bottom: 28px;
    left: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .report-stage-curtain,
  .report-stage-card-frame {
    animation: none;
  }

  .report-stage-line-enter-active,
  .report-stage-line-leave-active,
  .report-stage-fade-enter-active,
  .report-stage-fade-leave-active,
  .report-stage-theme-enter-active,
  .report-stage-theme-leave-active,
  .report-stage-meta-swap-enter-active,
  .report-stage-meta-swap-leave-active {
    transition-duration: 0.01ms;
  }
}

/* Keep the stage composition aligned with the report strip instead of treating it as a modal. */
.report-stage-mode {
  z-index: 40;
  background: transparent;
  backdrop-filter: none;
  pointer-events: none;
}

.report-stage-curtain,
.report-stage-noise {
  display: none;
}

.report-stage-inner {
  width: 100%;
  height: 100%;
  margin: 0;
  padding: 0;
}

.report-stage-header {
  position: absolute;
  top: 80px;
  right: 24px;
  left: 24px;
  display: flex;
  height: 54px;
  min-height: 54px;
  justify-content: flex-end;
  pointer-events: none;
}

.report-stage-brand,
.report-stage-icon-button,
.report-stage-copy-kicker,
.report-stage-card-caption,
.report-stage-footer {
  display: none;
}

.report-stage-meta {
  position: absolute;
  top: 0;
  right: max(8px, calc((100% - 445px) / 2));
  z-index: 3;
  display: flex;
  width: max-content;
  min-width: 118px;
  height: 54px;
  min-height: 54px;
  margin: 0;
  padding: 8px 16px;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 12px;
  color: rgba(68, 66, 108, 0.62);
  background: rgba(255, 255, 255, 0.8);
  box-shadow: 0 8px 20px rgba(54, 45, 106, 0.1);
  backdrop-filter: blur(14px) saturate(180%);
  box-sizing: border-box;
  pointer-events: none;
}

.report-stage-meta-copy {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 0;
}

.report-stage-meta-copy span {
  font-size: 0.56rem;
  line-height: 1rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.report-stage-meta-copy strong {
  color: var(--ink-soft);
  font-size: 0.875rem;
  line-height: 1.25rem;
  letter-spacing: 0;
}

.report-stage-dots {
  display: flex;
  gap: 4px;
  align-items: center;
}

.report-stage-dots i {
  display: block;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(68, 66, 108, 0.18);
}

.report-stage-dots i.is-current {
  background: var(--ink-soft);
  box-shadow: 0 0 0 2px rgba(68, 66, 108, 0.06);
}

.report-stage-main {
  position: absolute;
  top: 80px;
  right: 24px;
  left: 24px;
  display: flex;
  width: auto;
  height: 277px;
  min-height: 0;
  align-items: stretch;
  gap: 0;
}

.report-stage-copy {
  display: flex;
  width: 60%;
  height: 100%;
  max-height: none;
  padding: 0 0 32px max(112px, calc((100vw - 1280px) / 2));
  flex-direction: column;
  justify-content: flex-end;
  overflow: hidden;
  box-sizing: border-box;
}

.report-stage-lines {
  display: flex;
  width: 100%;
  max-width: 715px;
  min-height: 0;
  height: 100%;
  flex-direction: column;
  justify-content: flex-end;
  overflow: hidden;
}

.report-stage-lines p,
.report-stage-pending {
  margin: 0 0 32px;
  color: var(--ink-soft);
  font-size: clamp(1.5rem, 2.8125vw, 2.25rem);
  font-weight: 750;
  line-height: 1.25;
  letter-spacing: 0.11em;
  text-wrap: balance;
}

.report-stage-lines p:last-child {
  margin-bottom: 0;
}

.report-stage-card-column {
  position: relative;
  display: flex;
  width: 40%;
  height: 100%;
  padding: 24px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  pointer-events: none;
}

.report-stage-card-frame {
  width: 100%;
  max-width: 445px;
  aspect-ratio: 2;
}

@media (max-width: 820px) {
  .report-stage-header {
    top: 80px;
    right: 16px;
    left: 16px;
  }

  .report-stage-meta {
    min-width: 118px;
    height: 54px;
    padding: 8px 12px;
  }

  .report-stage-main {
    top: 80px;
    right: 16px;
    left: 16px;
    display: flex;
    height: 481px;
    flex-direction: row;
  }

  .report-stage-copy {
    width: 62%;
    padding: 0 0 32px 8px;
  }

  .report-stage-lines p,
  .report-stage-pending {
    font-size: 1.5rem;
    line-height: 1.25;
    letter-spacing: 0.1em;
    margin-bottom: 16px;
  }

  .report-stage-card-column {
    width: 38%;
    align-self: stretch;
    padding: 8px;
  }

  .report-stage-card-frame {
    max-width: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .report-stage-mode {
    transition: none;
  }
}
</style>
