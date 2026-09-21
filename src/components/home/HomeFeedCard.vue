<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { RepositorySummary } from "../../data/types";
import IconGlyph from "../app/IconGlyph.vue";
import ReportPlatformIcon from "../reports/ReportPlatformIcon.vue";

interface Props {
  repositories: RepositorySummary[];
}

const props = defineProps<Props>();
const activeRepositoryIndex = ref<number | null>(null);
const lastRepositoryIndex = ref<number | null>(null);
const isPaused = ref(false);
let rotationTimer: number | undefined;

const repositories = computed(() => props.repositories);
const hasRepositories = computed(() => repositories.value.length > 0);
const isOverview = computed(() => activeRepositoryIndex.value === null);
const currentRepository = computed(() =>
  activeRepositoryIndex.value === null
    ? undefined
    : repositories.value[activeRepositoryIndex.value],
);

/**
 * 将仓库统计数值转换为有限的非负整数。
 *
 * @param value - 来源数据中的未知统计值。
 * @returns 可用于展示和计算的非负整数。
 */
function safeNumber(value: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
}

const totalStars = computed(() =>
  props.repositories.reduce(
    (total, repository) => total + safeNumber(repository.stars),
    0,
  ),
);

/**
 * 将仓库统计数量转换为简短的 K/M 显示文本。
 *
 * @param value - 需要格式化的仓库统计数量。
 * @returns 适合卡片宽度的紧凑显示文本。
 */
function formatCount(value: number): string {
  const count = safeNumber(value);
  if (count >= 1_000_000) {
    return (count / 1_000_000).toFixed(1).replace(/\.0$/, "") + "m";
  }
  if (count >= 1_000) {
    return (count / 1_000).toFixed(1).replace(/\.0$/, "") + "k";
  }
  return String(count);
}

const languageColors: Record<string, string> = {
  TypeScript: "#3178c6",
  JavaScript: "#e7c53d",
  Python: "#3572a5",
  Rust: "#c58a53",
  Go: "#00add8",
  Java: "#b07219",
  "C++": "#f34b7d",
  "C#": "#178600",
  Ruby: "#701516",
  PHP: "#4f5d95",
  Dart: "#00b4ab",
  Vue: "#41b883",
};

const languageSegments = computed(() => {
  const counts = new Map<string, number>();
  props.repositories.forEach((repository) => {
    const language = repository.language.trim();
    if (language) counts.set(language, (counts.get(language) ?? 0) + 1);
  });
  const items = [...counts.entries()]
    .sort(
      (left, right) => right[1] - left[1] || left[0].localeCompare(right[0]),
    )
    .slice(0, 4);
  const total = items.reduce((sum, [, count]) => sum + count, 0);
  return items.map(([name, count]) => ({
    name,
    percent: (count / total) * 100,
    color: languageColors[name] ?? "#667085",
  }));
});

const level = computed(() => {
  if (totalStars.value >= 1_000 || props.repositories.length >= 40) {
    return { label: "传奇开发者", color: "#e96b7d" };
  }
  if (totalStars.value >= 100 || props.repositories.length >= 20) {
    return { label: "资深开发者", color: "#d88957" };
  }
  if (props.repositories.length >= 8) {
    return { label: "活跃开发者", color: "#5878c7" };
  }
  return { label: "持续创作", color: "#5c9b86" };
});

const profileUrl = computed(() => {
  const match = repositories.value[0]?.htmlUrl.match(
    /^(https?:\/\/github\.com\/[^/]+)/i,
  );
  return match?.[1] ?? "https://github.com/";
});

const heatmapCells = computed(() => {
  const days = 7;
  const weeks = 12;
  const total = days * weeks;
  const dayMs = 86_400_000;
  const today = new Date();
  const end = new Date(
    Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()),
  );
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - (total - 1) + (6 - end.getUTCDay()));
  const updates = new Map<number, number>();

  props.repositories.forEach((repository) => {
    const updatedAt = Date.parse(repository.updatedAt);
    if (!Number.isFinite(updatedAt)) return;
    const index = Math.floor((updatedAt - start.getTime()) / dayMs);
    if (index < 0 || index >= total) return;
    updates.set(index, (updates.get(index) ?? 0) + 1);
  });

  const maxCount = Math.max(1, ...updates.values());
  return Array.from({ length: total }, (_, index) => {
    const count = updates.get(index) ?? 0;
    return {
      id: "cell-" + index,
      opacity: count ? 0.35 + (count / maxCount) * 0.65 : 0.12,
    };
  });
});

/**
 * 清理 GitHub 仓库轮播定时器。
 *
 * @returns 无返回值；重复调用不会产生副作用。
 */
function clearRotation(): void {
  if (rotationTimer !== undefined) window.clearInterval(rotationTimer);
  rotationTimer = undefined;
}

/**
 * 从当前仓库列表中随机选择一项展示。
 *
 * @returns 无返回值；没有仓库时回到概览状态。
 */
function showRandomRepository(): void {
  const count = repositories.value.length;
  if (!count) {
    activeRepositoryIndex.value = null;
    lastRepositoryIndex.value = null;
    return;
  }

  const previousIndex = lastRepositoryIndex.value;
  let nextIndex = Math.floor(Math.random() * count);
  if (count > 1 && nextIndex === previousIndex) {
    nextIndex = (nextIndex + 1) % count;
  }
  lastRepositoryIndex.value = nextIndex;
  activeRepositoryIndex.value = nextIndex;
}

/**
 * 推进一次仓库轮播或从概览进入仓库详情。
 *
 * @returns 无返回值；展示状态由当前卡片内容决定。
 */
function advanceRotation(): void {
  if (activeRepositoryIndex.value === null) {
    showRandomRepository();
    return;
  }
  activeRepositoryIndex.value = null;
}

/**
 * 启动仓库轮播定时器。
 *
 * @returns 无返回值；已有定时器会先被清理。
 */
function startRotation(): void {
  clearRotation();
  if (isPaused.value || !hasRepositories.value) return;
  rotationTimer = window.setInterval(() => {
    advanceRotation();
  }, 5600);
}

/**
 * 暂停仓库轮播。
 *
 * @returns 无返回值。
 */
function pauseRotation(): void {
  isPaused.value = true;
  clearRotation();
}

/**
 * 恢复仓库轮播。
 *
 * @returns 无返回值；页面隐藏时保持暂停。
 */
function resumeRotation(): void {
  isPaused.value = false;
  startRotation();
}

/**
 * 焦点离开仓库卡片区域时恢复轮播。
 *
 * @param event - 焦点离开事件。
 * @returns 无返回值；焦点仍在卡片内部时不恢复。
 */
function handleFocusout(event: FocusEvent): void {
  const root = event.currentTarget as HTMLElement | null;
  const nextTarget = event.relatedTarget;
  if (root && nextTarget instanceof Node && root.contains(nextTarget)) return;
  resumeRotation();
}

watch(
  () => props.repositories.map((repository) => repository.id).join("|"),
  () => {
    activeRepositoryIndex.value = null;
    lastRepositoryIndex.value = null;
    startRotation();
  },
);

onMounted(startRotation);
onBeforeUnmount(clearRotation);
</script>

<template>
  <section
    class="home-feed-card home-github-feed-card glass-panel"
    aria-label="GitHub 动态"
    @mouseenter="pauseRotation"
    @mouseleave="resumeRotation"
    @focusin="pauseRotation"
    @focusout="handleFocusout"
  >
    <template v-if="hasRepositories">
      <Transition name="github-face" mode="out-in">
        <div v-if="isOverview" key="overview" class="github-overview-face">
          <div class="github-overview-main">
            <div class="github-overview-copy">
              <span
                class="github-level-pill"
                :style="{
                  color: level.color,
                  backgroundColor: level.color + '1c',
                  borderColor: level.color + '45',
                }"
              >
                <i aria-hidden="true"></i>{{ level.label }}
              </span>
              <div class="github-stat-stack">
                <span class="github-stat-row">
                  <strong>{{ formatCount(totalStars) }}</strong>
                  <small>stars</small>
                </span>
                <span class="github-stat-row">
                  <strong>{{ props.repositories.length }}</strong>
                  <small>仓库</small>
                </span>
              </div>
            </div>

            <div class="github-overview-side">
              <div class="github-heatmap" aria-hidden="true">
                <span
                  v-for="cell in heatmapCells"
                  :key="cell.id"
                  :style="{
                    backgroundColor: level.color,
                    opacity: cell.opacity,
                  }"
                ></span>
              </div>
              <span
                v-if="totalStars"
                class="github-stars-pill"
                :style="{
                  color: level.color,
                  backgroundColor: level.color + '1a',
                }"
                :title="totalStars + ' 个公开仓库 stars'"
              >
                <IconGlyph name="star" :size="10" />{{
                  formatCount(totalStars)
                }}
              </span>
            </div>
          </div>

          <div class="github-overview-footer">
            <a
              class="github-mark-link"
              :href="profileUrl"
              target="_blank"
              rel="noreferrer"
              aria-label="打开 GitHub 主页"
              title="打开 GitHub 主页"
            >
              <ReportPlatformIcon platform-id="github" :size="17" />
            </a>
            <div v-if="languageSegments.length" class="github-language-summary">
              <div class="github-language-labels">
                <span v-for="segment in languageSegments" :key="segment.name">
                  <i :style="{ backgroundColor: segment.color }"></i>
                  {{ segment.name }} {{ Math.round(segment.percent) }}%
                </span>
              </div>
              <div class="github-language-bar" aria-hidden="true">
                <span
                  v-for="segment in languageSegments"
                  :key="segment.name + '-bar'"
                  :style="{
                    width: segment.percent + '%',
                    backgroundColor: segment.color,
                  }"
                ></span>
              </div>
            </div>
          </div>
        </div>

        <a
          v-else-if="currentRepository"
          :key="currentRepository.id"
          class="github-repository-face"
          :href="currentRepository.htmlUrl"
          target="_blank"
          rel="noreferrer"
          :aria-label="`打开 GitHub 仓库 ${currentRepository.name}`"
        >
          <div class="github-repository-glow" aria-hidden="true"></div>
          <div class="github-repository-content">
            <div class="github-repository-heading">
              <span>最近更新</span>
              <ReportPlatformIcon platform-id="github" :size="18" />
            </div>
            <strong>{{ currentRepository.name }}</strong>
            <p>{{ currentRepository.description || "公开仓库" }}</p>
            <div class="github-repository-meta">
              <span>
                <IconGlyph name="star" :size="11" />{{
                  formatCount(currentRepository.stars)
                }}
              </span>
              <span>
                <IconGlyph name="code2" :size="11" />{{
                  formatCount(currentRepository.forks)
                }}
              </span>
              <span v-if="currentRepository.language">
                <i
                  :style="{
                    backgroundColor:
                      languageColors[currentRepository.language] ?? '#667085',
                  }"
                ></i>
                {{ currentRepository.language }}
              </span>
            </div>
          </div>
        </a>
      </Transition>
    </template>

    <div v-else class="github-empty-face">
      <ReportPlatformIcon platform-id="github" :size="24" />
      <div>
        <strong>GitHub 动态</strong>
        <span>在设置中同步 GitHub 后，这里会自动更新。</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.home-github-feed-card {
  position: relative;
  width: calc(100% - 10px);
  height: calc(100% - 10px);
  min-height: 150px;
  overflow: hidden;
  color: #26344e;
  background: linear-gradient(
    140deg,
    rgba(248, 250, 255, 0.94),
    rgba(234, 241, 255, 0.7)
  );
}

.github-overview-face,
.github-repository-face {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.github-overview-face {
  display: flex;
  min-height: 0;
  padding: 8px 10px 7px;
  flex-direction: column;
  justify-content: space-between;
}

.github-overview-main {
  display: flex;
  min-width: 0;
  min-height: 0;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.github-overview-copy {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  align-items: flex-start;
  gap: 5px;
}

.github-level-pill {
  display: inline-flex;
  max-width: 100%;
  min-height: 17px;
  padding: 2px 7px 2px 6px;
  align-items: center;
  gap: 5px;
  border: 1px solid transparent;
  border-radius: 7px;
  box-shadow: 0 3px 8px rgba(62, 72, 121, 0.08);
  font-size: 0.52rem;
  font-weight: 780;
  white-space: nowrap;
}

.github-level-pill i {
  width: 5px;
  height: 5px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: currentColor;
}

.github-stat-stack {
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 4px;
}

.github-stat-row {
  display: flex;
  align-items: baseline;
  gap: 6px;
}

.github-stat-row strong {
  color: #2b3447;
  font-size: 1.4rem;
  font-weight: 850;
  line-height: 0.82;
  font-variant-numeric: tabular-nums;
}

.github-stat-row small {
  color: #737d91;
  font-size: 0.44rem;
  font-weight: 760;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.github-overview-side {
  display: flex;
  min-width: 0;
  min-height: 0;
  flex-direction: column;
  align-items: flex-end;
  gap: 5px;
}

.github-heatmap {
  display: grid;
  width: 108px;
  height: 50px;
  grid-template-columns: repeat(12, minmax(0, 1fr));
  grid-template-rows: repeat(7, minmax(0, 1fr));
  gap: 2px;
}

.github-heatmap span {
  min-width: 0;
  min-height: 0;
  border-radius: 1px;
}

.github-stars-pill {
  display: inline-flex;
  padding: 2px 6px 2px 4px;
  align-items: center;
  gap: 4px;
  border-radius: 999px;
  font-size: 0.5rem;
  font-weight: 800;
  line-height: 1;
}

.github-overview-footer {
  display: flex;
  min-width: 0;
  align-items: flex-end;
  gap: 9px;
}

.github-mark-link {
  display: grid;
  width: 29px;
  height: 29px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgba(65, 78, 107, 0.22);
  border-radius: 8px;
  color: #25334a;
  background: rgba(255, 255, 255, 0.66);
  box-shadow: 0 4px 9px rgba(56, 65, 96, 0.08);
  transition:
    background 0.18s ease,
    transform 0.18s ease;
}

.github-mark-link:hover,
.github-mark-link:focus-visible {
  background: rgba(255, 255, 255, 0.96);
  transform: translateY(-1px);
}

.github-language-summary {
  display: flex;
  min-width: 0;
  flex: 1;
  margin-left: 30px;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
}

.github-language-labels {
  display: flex;
  max-width: 100%;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 2px 8px;
  color: #737d91;
  font-size: 0.46rem;
  font-weight: 720;
}

.github-language-labels span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  white-space: nowrap;
}

.github-language-labels i,
.github-repository-meta i {
  width: 5px;
  height: 5px;
  flex: 0 0 auto;
  border-radius: 50%;
}

.github-language-bar {
  display: flex;
  width: 100%;
  height: 5px;
  overflow: hidden;
  gap: 2px;
  border-radius: 999px;
  background: rgba(196, 204, 222, 0.58);
  box-shadow: inset 0 0 0 1px rgba(66, 78, 105, 0.08);
}

.github-language-bar span {
  min-width: 4px;
  border-radius: inherit;
}

.github-repository-face {
  inset: 6px;
  display: flex;
  align-items: stretch;
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 10px;
  color: #eef3ff;
  background: linear-gradient(135deg, #253754, #3b4e76 62%, #586d9d);
  box-shadow: 0 7px 16px rgba(48, 55, 86, 0.16);
}

.github-repository-glow {
  position: absolute;
  inset: auto -14% -45% 36%;
  height: 76%;
  border-radius: 50%;
  background: rgba(180, 205, 255, 0.2);
  filter: blur(24px);
}

.github-repository-content {
  position: relative;
  display: flex;
  width: 100%;
  min-width: 0;
  padding: 14px 15px 12px;
  flex-direction: column;
  gap: 7px;
}

.github-repository-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: rgba(231, 239, 255, 0.72);
  font-size: 0.56rem;
  font-weight: 760;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.github-repository-content strong {
  overflow: hidden;
  color: #fff;
  font-size: 1.03rem;
  font-weight: 800;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.github-repository-content p {
  display: -webkit-box;
  max-width: 72%;
  margin: 0;
  overflow: hidden;
  color: rgba(231, 239, 255, 0.84);
  font-size: 0.62rem;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.github-repository-meta {
  display: flex;
  margin-top: auto;
  align-items: center;
  gap: 11px;
  color: rgba(238, 244, 255, 0.76);
  font-size: 0.55rem;
  font-weight: 700;
}

.github-repository-meta span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  white-space: nowrap;
}

.github-empty-face {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  align-items: center;
  justify-content: center;
  gap: 9px;
  color: #69758d;
}

.github-empty-face > svg {
  color: #4e607f;
}

.github-empty-face div {
  display: flex;
  max-width: 64%;
  flex-direction: column;
  gap: 3px;
}

.github-empty-face strong {
  color: #3b4a65;
  font-size: 0.72rem;
}

.github-empty-face span {
  font-size: 0.56rem;
  line-height: 1.4;
}

.github-face-enter-active,
.github-face-leave-active {
  transition:
    opacity 0.42s ease,
    transform 0.42s ease;
}

.github-face-enter-from {
  opacity: 0;
  transform: translateY(8px);
}

.github-face-leave-to {
  opacity: 0;
  transform: translateY(-8px);
}

@media (max-width: 820px) {
  .github-overview-face {
    padding: 10px 11px 9px;
  }

  .github-heatmap {
    width: 104px;
    height: 62px;
    gap: 2px;
  }

  .github-stat-row strong {
    font-size: 1.4rem;
  }

  .github-repository-content {
    padding: 12px 13px 11px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .github-face-enter-active,
  .github-face-leave-active,
  .github-mark-link {
    transition-duration: 0.01ms;
  }
}
</style>
