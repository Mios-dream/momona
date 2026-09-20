<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { ReportPlatformCard as ReportPlatformCardData } from "../../data/types";
import IconGlyph from "../app/IconGlyph.vue";
import ReportPlatformIcon from "./ReportPlatformIcon.vue";

interface Props {
  card: ReportPlatformCardData;
  active?: boolean;
  interactive?: boolean;
  stage?: boolean;
  stagePlaying?: boolean;
  index?: number;
}

const props = withDefaults(defineProps<Props>(), {
  active: false,
  interactive: true,
  stage: false,
  stagePlaying: false,
  index: 0,
});

const emit = defineEmits<{
  select: [];
}>();

const cardRoot = ref<HTMLElement | null>(null);

const graphCells = Array.from({ length: 48 }, (_, index) =>
  [5, 11, 17, 24, 31, 38, 42].includes(index),
);

const theme = computed(() => {
  const platform = props.card.platformId || props.card.kind;
  if (platform === "bilibili") {
    return { accent: "#00a1d6", soft: "rgba(0, 161, 214, .22)", ink: "#00799f" };
  }
  if (platform === "github") {
    return { accent: "#596579", soft: "rgba(89, 101, 121, .22)", ink: "#424e62" };
  }
  if (platform === "netease" || platform === "qq") {
    return { accent: "#e60026", soft: "rgba(230, 0, 38, .2)", ink: "#b61b38" };
  }
  if (platform === "hoyolab" || props.card.kind === "game") {
    return { accent: "#e58c54", soft: "rgba(229, 140, 84, .24)", ink: "#bb633d" };
  }
  if (platform === "profile") {
    return { accent: "#7564de", soft: "rgba(117, 100, 222, .23)", ink: "#5541b5" };
  }
  if (platform === "bangumi") {
    return { accent: "#d86e98", soft: "rgba(216, 110, 152, .22)", ink: "#ad4c72" };
  }
  return { accent: "#119dd9", soft: "rgba(17, 157, 217, .2)", ink: "#12739c" };
});

const cardStyle = computed(() => ({
  "--report-accent": theme.value.accent,
  "--report-accent-soft": theme.value.soft,
  "--report-accent-ink": theme.value.ink,
  "--report-card-index": String(props.index),
}));

const hideBrokenImage = (image: HTMLImageElement): void => {
  image.parentElement?.classList.add("has-broken-image");
  image.remove();
};

const markBrokenImage = (event: Event): void => {
  hideBrokenImage(event.currentTarget as HTMLImageElement);
};

onMounted(() => {
  cardRoot.value?.querySelectorAll<HTMLImageElement>("img").forEach((image) => {
    if (image.complete && image.naturalWidth === 0) hideBrokenImage(image);
  });
});
</script>

<template>
  <article
    ref="cardRoot"
    class="reports-platform-card"
    :class="[
      `report-card-${props.card.kind}`,
      `report-card-${props.card.id}`,
      {
        'is-active': props.active,
        'is-stage-card': props.stage,
        'is-stage-playing': props.stagePlaying,
        'is-static': !props.interactive,
      },
    ]"
    :style="cardStyle"
    :tabindex="props.interactive ? 0 : -1"
    role="listitem"
    :aria-label="props.stagePlaying
      ? `${props.card.platformLabel || props.card.title}，舞台模式播放中`
      : `${props.card.title}，${props.card.subtitle}`"
    @click="props.interactive && emit('select')"
    @keydown.enter="props.interactive && emit('select')"
    @keydown.space.prevent="props.interactive && emit('select')"
  >
    <div class="report-card-glow" aria-hidden="true"></div>

    <Transition name="report-card-content">
      <div v-if="props.stagePlaying" key="stage-playing" class="report-card-body">
        <div class="report-stage-playing-content">
          <div class="report-stage-playing-icon">
            <ReportPlatformIcon :platform-id="props.card.platformId" :kind="props.card.kind" :size="18" />
          </div>
          <div class="report-stage-playing-copy">
            <strong>{{ props.card.platformLabel || props.card.title }}</strong>
            <span>舞台模式播放中</span>
          </div>
        </div>
      </div>

      <div v-else key="card-content" class="report-card-body">
        <template v-if="props.card.kind === 'music'">
          <div class="report-music-art" aria-hidden="true">
            <div class="report-art-fallback"><ReportPlatformIcon :platform-id="props.card.platformId" :kind="props.card.kind" :size="32" /></div>
            <img v-if="props.card.image" :src="props.card.image" alt="" @error="markBrokenImage" />
            <img
              v-if="props.card.secondaryImage || props.card.image"
              :src="props.card.secondaryImage || props.card.image"
              alt=""
              @error="markBrokenImage"
            />
          </div>
          <div class="report-card-chip report-music-chip">
            <ReportPlatformIcon :platform-id="props.card.platformId" :kind="props.card.kind" :size="16" />
            <span>
              <strong>{{ props.card.title }}</strong>
              <strong>{{ props.card.subtitle }}</strong>
            </span>
          </div>
        </template>

        <template v-else-if="props.card.kind === 'github'">
          <div class="report-github-grid" aria-hidden="true">
            <span v-for="(isFilled, index) in graphCells" :key="index" :class="{ 'is-filled': isFilled }"></span>
          </div>
          <div class="report-card-content report-github-content">
            <span class="report-badge">{{ props.card.eyebrow || props.card.platformLabel || "GitHub" }}</span>
            <div class="report-github-numbers">
              <span><strong>{{ props.card.stats?.[0] || "0" }}</strong><small>{{ props.card.statLabels?.[0] || "提交" }}</small></span>
              <span><strong>{{ props.card.stats?.[1] || "0" }}</strong><small>{{ props.card.statLabels?.[1] || "仓库" }}</small></span>
            </div>
            <span v-if="props.card.tags?.[0]" class="report-card-tag">☆ {{ props.card.tags[0] }}</span>
            <div class="report-card-icon"><ReportPlatformIcon platform-id="github" :size="17" /></div>
            <span v-if="props.card.tags?.[1]" class="report-card-foot">{{ props.card.tags[1] }}</span>
          </div>
        </template>

        <template v-else-if="props.card.kind === 'game'">
          <div class="report-art-layer" aria-hidden="true">
            <div class="report-art-fallback"><ReportPlatformIcon :platform-id="props.card.platformId" :kind="props.card.kind" :size="34" /></div>
            <img v-if="props.card.image" class="report-game-art" :src="props.card.image" alt="" @error="markBrokenImage" />
          </div>
          <div class="report-card-content report-game-content">
            <span class="report-card-kicker">{{ props.card.platformLabel || props.card.subtitle }}</span>
            <strong>{{ props.card.title }}</strong>
            <div class="report-game-stats">
              <span v-for="(stat, index) in props.card.stats" :key="`${stat}-${index}`"><b>{{ stat }}</b><small>{{ props.card.statLabels?.[index] || ['等级', '成就', '角色'][index] }}</small></span>
            </div>
            <div class="report-card-icon"><ReportPlatformIcon :platform-id="props.card.platformId" :kind="props.card.kind" :size="17" /></div>
          </div>
        </template>

        <template v-else-if="props.card.kind === 'platform'">
          <div class="report-art-layer" aria-hidden="true">
            <div class="report-art-fallback"><ReportPlatformIcon :platform-id="props.card.platformId" :kind="props.card.kind" :size="32" /></div>
            <img v-if="props.card.image" class="report-platform-art" :src="props.card.image" alt="" @error="markBrokenImage" />
          </div>
          <div class="report-card-content report-platform-content">
            <span class="report-card-kicker">{{ props.card.platformLabel }}</span>
            <strong>{{ props.card.title }}</strong>
            <span class="report-platform-subtitle">{{ props.card.subtitle }}</span>
            <div class="report-game-stats">
              <span v-for="(stat, index) in props.card.stats" :key="`${stat}-${index}`"><b>{{ stat }}</b><small>{{ props.card.statLabels?.[index] || '统计' }}</small></span>
            </div>
            <div class="report-card-icon"><ReportPlatformIcon :platform-id="props.card.platformId" :kind="props.card.kind" :size="17" /></div>
          </div>
        </template>

        <template v-else-if="props.card.kind === 'profile'">
          <div class="report-profile-bubbles" aria-hidden="true">
            <span class="bubble bubble-large">缱绻</span>
            <span class="bubble bubble-small">孤意</span>
            <span class="bubble bubble-bottom">庄严</span>
          </div>
          <div class="report-card-content report-profile-content">
            <div class="report-profile-heading">
              <div class="report-profile-avatar">
                <img v-if="props.card.image" :src="props.card.image" alt="" @error="markBrokenImage" />
                <IconGlyph v-else name="user" :size="17" />
              </div>
              <div>
                <strong>{{ props.card.title }}</strong>
                <span>{{ props.card.subtitle }}</span>
              </div>
            </div>
            <div class="report-profile-score">
              <template v-for="(stat, index) in props.card.stats" :key="`${stat}-${index}`">
                <strong>{{ stat }}</strong><small>{{ props.card.statLabels?.[index] || '统计' }}</small>
              </template>
            </div>
            <div class="report-card-icon"><ReportPlatformIcon :platform-id="props.card.platformId" :kind="props.card.kind" :size="17" /></div>
          </div>
        </template>

        <template v-else>
          <div class="report-art-layer" aria-hidden="true">
            <div class="report-art-fallback"><ReportPlatformIcon :platform-id="props.card.platformId" :kind="props.card.kind" :size="32" /></div>
            <img v-if="props.card.image" class="report-generic-art" :src="props.card.image" alt="" @error="markBrokenImage" />
          </div>
          <div class="report-card-content report-generic-content">
            <div class="report-generic-heading">
              <div class="report-generic-avatar">
                <img v-if="props.card.image" :src="props.card.image" alt="" @error="markBrokenImage" />
                <ReportPlatformIcon v-else :platform-id="props.card.platformId" :kind="props.card.kind" :size="16" />
              </div>
              <div><strong>{{ props.card.title }}</strong><span>{{ props.card.subtitle }}</span></div>
            </div>
            <div v-if="props.card.tags?.length" class="report-generic-tags">
              <span v-for="tag in props.card.tags" :key="tag">{{ tag }}</span>
            </div>
            <div class="report-card-icon"><ReportPlatformIcon :platform-id="props.card.platformId" :kind="props.card.kind" :size="17" /></div>
          </div>
        </template>
      </div>
    </Transition>
  </article>
</template>

<style scoped>
.reports-platform-card {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  min-width: 0;
  flex: 1 1 auto;
  aspect-ratio: 2;
  overflow: hidden;
  outline: none;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  color: var(--ink);
  background: rgba(255, 255, 255, 0.74);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.28) inset,
    0 -1px 0 rgba(0, 0, 0, 0.04) inset,
    0 8px 28px rgba(31, 38, 135, 0.1);
  backdrop-filter: blur(13.6px) saturate(180%);
  scroll-snap-align: start;
  transform: translateZ(0);
  transition: transform 0.42s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.48s ease,
    border-color 0.44s ease;
}

.reports-platform-card::before,
.reports-platform-card::after {
  position: absolute;
  inset: 0;
  pointer-events: none;
  content: "";
}

.report-card-body {
  position: absolute;
  inset: 0;
}

.report-card-content-enter-active,
.report-card-content-leave-active {
  transition: opacity 0.78s ease, transform 0.94s cubic-bezier(0.16, 1, 0.3, 1),
    filter 0.78s ease;
}

.report-card-content-enter-from {
  opacity: 0;
  filter: blur(7px);
  transform: translateY(9px) scale(0.985);
}

.report-card-content-leave-to {
  opacity: 0;
  filter: blur(5px);
  transform: translateY(-7px) scale(1.01);
}

.reports-platform-card::before {
  z-index: 0;
  background: linear-gradient(135deg, rgba(255, 255, 255, 0.08), transparent 56%);
}

.reports-platform-card::after {
  z-index: 3;
  border-radius: inherit;
  box-shadow: inset 0 -48px 50px rgba(255, 255, 255, 0.12);
}

.reports-platform-card:hover,
.reports-platform-card:focus-visible {
  border-color: rgba(255, 255, 255, 0.1);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.28) inset,
    0 -1px 0 rgba(0, 0, 0, 0.04) inset,
    0 12px 32px rgba(31, 38, 135, 0.13);
  transform: translateY(-1px) scale(1.005);
}

.reports-platform-card.is-active {
  border-color: color-mix(in srgb, var(--report-accent) 54%, white);
  box-shadow: 0 17px 32px rgba(79, 67, 156, 0.16), 0 0 0 2px var(--report-accent-soft);
}

.reports-platform-card.is-stage-card {
  border-radius: 16px;
  border-color: rgba(255, 255, 255, 0.1);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.28) inset,
    0 -1px 0 rgba(0, 0, 0, 0.04) inset,
    0 8px 28px rgba(31, 38, 135, 0.1);
  animation: none;
}

.reports-platform-card.is-static {
  cursor: default;
}

.reports-platform-card:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--report-accent) 72%, white);
  outline-offset: 4px;
}

.report-card-glow {
  position: absolute;
  z-index: 1;
  top: -32px;
  right: -32px;
  width: 12rem;
  height: 12rem;
  border-radius: 50%;
  background: var(--report-accent);
  filter: blur(64px);
  opacity: 0.12;
  animation: report-glow-in 3s ease-in-out both;
  transition: opacity 0.25s ease, transform 0.4s ease;
}

.report-stage-playing-content {
  position: relative;
  z-index: 4;
  display: flex;
  width: 100%;
  height: 100%;
  padding: 24px;
  align-items: center;
  justify-content: center;
  gap: 12px;
}

.report-stage-playing-icon {
  display: grid;
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--report-accent) 32%, white);
  border-radius: 12px;
  color: var(--report-accent-ink);
  background: color-mix(in srgb, var(--report-accent-soft) 72%, white);
  box-shadow: 0 8px 16px rgba(54, 45, 106, 0.1);
}

.report-stage-playing-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.report-stage-playing-copy strong,
.report-stage-playing-copy span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.report-stage-playing-copy strong {
  color: var(--ink);
  font-size: 0.84rem;
  line-height: 1.2;
}

.report-stage-playing-copy span {
  color: var(--muted-strong);
  font-size: 0.62rem;
  line-height: 1.2;
}

.reports-platform-card:hover .report-card-glow {
  opacity: 0.18;
  transform: scale(1.08);
}

.report-art-layer,
.report-music-art {
  position: absolute;
  z-index: 0;
  inset: 6px;
  overflow: hidden;
  border-radius: 13px;
}

.report-art-layer::after,
.report-music-art::after {
  position: absolute;
  inset: 0;
  background: linear-gradient(135deg, transparent 30%, rgba(255, 255, 255, 0.18)), linear-gradient(to top, rgba(255, 255, 255, 0.16), transparent 55%);
  content: "";
}

.report-art-layer > .report-art-fallback,
.report-music-art > .report-art-fallback {
  position: absolute;
  z-index: 0;
  inset: 0;
}

.report-art-layer img,
.report-music-art img {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.8s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.3s ease;
}

.reports-platform-card:hover .report-art-layer img,
.reports-platform-card:hover .report-music-art img {
  transform: scale(1.06);
}

.report-art-layer img.is-broken,
.report-music-art img.is-broken {
  opacity: 0;
}

.report-art-fallback {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  color: var(--report-accent-ink);
  background: linear-gradient(135deg, var(--report-accent-soft), rgba(255, 255, 255, 0.14));
}

.report-card-platform .report-art-layer {
  inset: 0 0 0 39%;
  border-radius: 0;
  opacity: 0.82;
  -webkit-mask-image: linear-gradient(to right, transparent 0%, rgba(0, 0, 0, 0.88) 34%, #000 66%);
  mask-image: linear-gradient(to right, transparent 0%, rgba(0, 0, 0, 0.88) 34%, #000 66%);
}

.report-card-platform .report-art-layer::after {
  background: linear-gradient(to right, rgba(255, 255, 255, 0.84), transparent 48%), linear-gradient(to top, rgba(255, 255, 255, 0.2), transparent 58%);
}

.report-music-art {
  display: flex;
  gap: 6px;
  opacity: 0.92;
  background: var(--report-accent-soft);
}

.report-music-art img {
  width: 50%;
  min-width: 0;
  border-radius: 12px;
  object-fit: cover;
}

.report-card-chip,
.report-card-icon,
.report-card-tag,
.report-badge,
.report-card-kicker {
  position: relative;
  z-index: 4;
}

.report-card-chip {
  position: absolute;
  right: auto;
  bottom: 12px;
  left: 12px;
  display: flex;
  max-width: min(72%, 230px);
  padding: 4px 8px;
  align-items: center;
  gap: 8px;
  border: 1px solid color-mix(in srgb, var(--report-accent) 26%, white);
  border-radius: 8px;
  color: var(--report-accent-ink);
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 7px 16px rgba(66, 34, 48, 0.13);
}

.report-card-chip span {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.report-card-chip strong {
  max-width: 170px;
  overflow: hidden;
  color: var(--ink);
  font-size: 0.61rem;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.report-card-content {
  position: relative;
  z-index: 4;
  width: 100%;
  height: 100%;
  padding: 14px;
}

.report-github-grid {
  position: absolute;
  z-index: 1;
  top: 14px;
  right: 16px;
  display: grid;
  width: 116px;
  height: 76px;
  grid-template-columns: repeat(8, 1fr);
  gap: 4px;
  opacity: 0.72;
  transform: rotate(-4deg);
}

.report-github-grid span {
  border-radius: 2px;
  background: rgba(93, 105, 128, 0.15);
}

.report-github-grid span.is-filled {
  background: color-mix(in srgb, var(--report-accent) 70%, white);
}

.report-github-content {
  display: flex;
  flex-direction: column;
}

.report-badge {
  width: max-content;
  padding: 3px 8px;
  border: 1px solid color-mix(in srgb, var(--report-accent) 25%, white);
  border-radius: 6px;
  color: var(--report-accent-ink);
  background: var(--report-accent-soft);
  font-size: 0.55rem;
  font-weight: 800;
  letter-spacing: 0.04em;
}

.report-github-numbers {
  display: flex;
  align-items: end;
  gap: 18px;
  margin-top: 19px;
}

.report-github-numbers span,
.report-game-stats span {
  display: flex;
  align-items: baseline;
  gap: 4px;
}

.report-github-numbers strong {
  font-size: 1.72rem;
  line-height: 0.9;
}

.report-github-numbers small,
.report-game-stats small {
  color: var(--muted-strong);
  font-size: 0.51rem;
}

.report-card-tag {
  position: absolute;
  right: 14px;
  bottom: 42px;
  max-width: 45%;
  padding: 4px 7px;
  overflow: hidden;
  border-radius: 7px;
  color: var(--report-accent-ink);
  background: var(--report-accent-soft);
  font-size: 0.54rem;
  font-weight: 760;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.report-card-icon {
  position: absolute;
  bottom: 13px;
  left: 13px;
  display: grid;
  width: 33px;
  height: 33px;
  place-items: center;
  border: 1px solid color-mix(in srgb, var(--report-accent) 25%, white);
  border-radius: 9px;
  color: var(--report-accent-ink);
  background: color-mix(in srgb, var(--report-accent-soft) 72%, white);
  box-shadow: 0 7px 14px rgba(54, 45, 106, 0.1);
}

.report-card-foot {
  position: absolute;
  right: 14px;
  bottom: 16px;
  max-width: 35%;
  overflow: hidden;
  color: var(--muted-strong);
  font-size: 0.5rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.report-game-content {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding-left: 17px;
}

.report-game-art {
  opacity: 0.24;
  filter: saturate(0.84);
}

.report-platform-content {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  padding: 15px;
}

.report-card-platform .report-platform-content {
  width: 62%;
  padding-right: 6px;
}

.report-platform-content > strong {
  max-width: 78%;
  overflow: hidden;
  color: var(--ink);
  font-size: 0.86rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.report-platform-subtitle {
  max-width: 84%;
  overflow: hidden;
  color: var(--muted-strong);
  font-size: 0.58rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.report-card-kicker {
  max-width: 80%;
  overflow: hidden;
  color: var(--report-accent-ink);
  font-size: 0.57rem;
  font-weight: 800;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.report-game-content > strong {
  max-width: 68%;
  margin-top: 5px;
  color: var(--ink-soft);
  font-size: 0.84rem;
  line-height: 1.25;
}

.report-game-stats {
  position: absolute;
  right: 14px;
  bottom: 16px;
  display: flex;
  gap: 10px;
}

.report-game-stats b {
  font-size: 0.74rem;
}

.report-profile-bubbles {
  position: absolute;
  z-index: 1;
  inset: 0;
  color: color-mix(in srgb, var(--report-accent-ink) 74%, white);
}

.bubble {
  position: absolute;
  display: grid;
  place-items: center;
  border-radius: 50%;
  background: var(--report-accent-soft);
  font-size: 0.72rem;
  font-weight: 700;
}

.bubble-large {
  top: -11px;
  left: 57%;
  width: 76px;
  height: 76px;
}

.bubble-small {
  top: 43px;
  right: 13%;
  width: 42px;
  height: 42px;
  font-size: 0.6rem;
}

.bubble-bottom {
  bottom: 8px;
  left: 44%;
  width: 46px;
  height: 46px;
  font-size: 0.6rem;
}

.report-profile-content {
  display: flex;
  flex-direction: column;
}

.report-profile-heading,
.report-generic-heading {
  display: flex;
  max-width: 76%;
  align-items: center;
  gap: 8px;
}

.report-profile-avatar,
.report-generic-avatar {
  display: grid;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  place-items: center;
  overflow: hidden;
  border: 2px solid rgba(255, 255, 255, 0.82);
  border-radius: 10px;
  color: var(--report-accent-ink);
  background: var(--report-accent-soft);
}

.report-profile-avatar img,
.report-generic-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: opacity 0.3s ease;
}

.report-profile-heading div:last-child,
.report-generic-heading > div:last-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.report-profile-heading strong,
.report-generic-heading strong {
  overflow: hidden;
  color: var(--ink);
  font-size: 0.76rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.report-profile-heading span,
.report-generic-heading span {
  overflow: hidden;
  color: var(--muted-strong);
  font-size: 0.51rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.report-profile-score {
  position: absolute;
  right: 14px;
  bottom: 14px;
  display: grid;
  grid-template-columns: repeat(2, auto);
  align-items: end;
  gap: 0 7px;
  padding: 7px 9px;
  border: 1px solid color-mix(in srgb, var(--report-accent) 17%, white);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 7px 15px rgba(54, 45, 106, 0.12);
}

.report-profile-score strong {
  font-size: 1.02rem;
  line-height: 1;
}

.report-profile-score small {
  color: var(--muted-strong);
  font-size: 0.49rem;
}

.report-generic-art {
  opacity: 0.28;
  filter: saturate(0.85);
}

.report-generic-content {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
}

.report-generic-tags {
  display: flex;
  max-width: 68%;
  align-self: flex-end;
  gap: 4px;
}

.report-generic-tags span {
  max-width: 90px;
  padding: 3px 6px;
  overflow: hidden;
  border-radius: 999px;
  color: var(--report-accent-ink);
  background: var(--report-accent-soft);
  font-size: 0.5rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@keyframes report-glow-in {
  0%,
  100% {
    opacity: 0.12;
    transform: scale(0.92);
  }
  46% {
    opacity: 0.18;
    transform: scale(1);
  }
}

@media (max-width: 640px) {
  .report-card-chip {
    bottom: 10px;
    left: 10px;
  }

  .report-card-chip strong {
    max-width: 140px;
  }

  .report-card-content {
    padding: 11px;
  }

  .report-platform-content {
    padding: 12px;
  }

  .report-card-icon {
    bottom: 10px;
    left: 10px;
  }

  .report-game-stats {
    right: 10px;
    bottom: 13px;
    gap: 7px;
  }

  .report-card-platform .report-art-layer {
    inset: 0 0 0 34%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .reports-platform-card.is-active {
    animation: none;
  }

  .report-art-layer img,
  .report-music-art img {
    transition-duration: 0.01ms;
  }

  .report-card-glow {
    animation: none;
  }

  .report-card-content-enter-active,
  .report-card-content-leave-active {
    transition-duration: 0.01ms;
  }
}
</style>
