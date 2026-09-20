<script setup lang="ts">
import { computed } from 'vue';
import type { LibraryTile } from '../../data/types';
import FallbackImage from '../app/FallbackImage.vue';
import IconGlyph from '../app/IconGlyph.vue';
import ReportPlatformIcon from '../reports/ReportPlatformIcon.vue';

interface Props {
  /** 资料库中的单张静态收藏卡片。 */
  tile: LibraryTile;
  /** 卡片右上角显示的来源名称。 */
  sourceLabel: string;
}

const props = defineProps<Props>();

const tileType = computed(() => props.tile.tag.trim().toLowerCase());
const isGame = computed(() => tileType.value === 'game');
const isMusic = computed(() => tileType.value === 'music');
const isVideo = computed(() => tileType.value === 'video');
const isBangumiGame = computed(
  () =>
    isGame.value &&
    (props.tile.sourceId === 'bangumi' || props.tile.sourceKind === 'bangumiGames'),
);
const brandSourceIds = new Set(['bangumi', 'bilibili', 'netease', 'qqmusic', 'github', 'steam', 'sfacg']);
const platformIconId = computed(() => {
  const sourceId = props.tile.sourceId;
  return sourceId && brandSourceIds.has(sourceId) ? sourceId : null;
});
</script>

<template>
  <article
    class="library-tile"
    :class="[
      `tile-${props.tile.id}`,
      `tone-${props.tile.tone}`,
      {
        'is-portrait': props.tile.height > props.tile.width * 1.25,
        'is-square': Math.abs(props.tile.width - props.tile.height) < 12,
        'is-game': isGame,
        'is-bangumi-game': isBangumiGame,
        'is-music': isMusic,
        'is-video': isVideo,
      },
    ]"
    :aria-label="props.tile.title"
  >
    <FallbackImage
      class="tile-image"
      :src="props.tile.image"
      :alt="props.tile.title"
      :fallback-icon="props.tile.icon"
      :icon-size="38"
      :show-loading-skeleton="true"
      :referrer-policy="props.tile.sourceId === 'bilibili' ? 'no-referrer' : undefined"
      :draggable="false"
    />
    <span
      class="tile-source"
      :class="`source-${props.tile.sourceId ?? 'manual'}`"
      :aria-label="props.sourceLabel"
      :title="props.sourceLabel"
    >
      <ReportPlatformIcon
        v-if="platformIconId"
        :platform-id="platformIconId"
        :size="14"
      />
      <IconGlyph v-else :name="props.tile.icon" :size="12" />
      <span class="tile-source-label">{{ props.sourceLabel }}</span>
    </span>
    <div class="tile-caption">
      <strong>{{ props.tile.title }}</strong>
      <span v-if="props.tile.subtitle && !isVideo">
        {{ props.tile.subtitle }}
      </span>
    </div>
  </article>
</template>

<style scoped>
.library-tile {
  position: relative;
  width: 100%;
  height: 100%;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.82);
  border-radius: 11px;
  background: rgba(226, 230, 241, 0.62);
  box-shadow: 0 10px 22px rgba(54, 45, 106, 0.18);
  isolation: isolate;
  pointer-events: auto;
  transition: box-shadow 0.2s ease,
    transform 0.24s cubic-bezier(0.22, 0.72, 0.22, 1);
  will-change: transform;
}

.library-tile:hover {
  z-index: 6;
  box-shadow: 0 19px 34px rgba(54, 45, 106, 0.3);
  transform: translate3d(0, -5px, 0);
}

.tile-image {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  --app-image-transform-duration: 0.52s;
  --app-image-transform-timing: cubic-bezier(0.16, 1, 0.3, 1);
}

.tile-image {
  display: block;
  user-select: none;
}

.tile-image :deep(img) {
  transform: scale(1);
  transform-origin: center;
  transition: transform 0.52s cubic-bezier(0.16, 1, 0.3, 1);
}

.library-tile:hover .tile-image :deep(img) {
  transform: scale(1.035);
}

.tile-source {
  position: absolute;
  z-index: 2;
  top: 8px;
  right: 8px;
  display: inline-flex;
  width: 25px;
  height: 25px;
  padding: 0;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 50%;
  color: rgba(36, 49, 69, 0.8);
  background: rgba(229, 247, 250, 0.94);
  font-size: 0;
  font-weight: 700;
  line-height: 1;
}

.tone-pink .tile-source {
  background: rgba(255, 231, 243, 0.94);
}

.tone-violet .tile-source {
  background: rgba(239, 235, 255, 0.94);
}

.tone-dark .tile-source {
  color: rgba(255, 255, 255, 0.88);
  background: rgba(27, 36, 58, 0.94);
}

.source-bangumi {
  color: #dd6b77;
}

.source-bilibili {
  color: #00aeec;
}

.source-netease {
  color: #d43c33;
}

.source-qqmusic {
  color: #18a957;
}

.source-github {
  color: #24292f;
}

.source-steam {
  color: #1b75bb;
}

.source-sfacg {
  color: #d56b8b;
}

.tile-caption {
  position: absolute;
  z-index: 2;
  right: 8px;
  bottom: 8px;
  left: 8px;
  display: grid;
  min-width: 0;
  padding: 7px 8px 6px;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  column-gap: 7px;
  border: 1px solid rgba(255, 255, 255, 0.54);
  border-radius: 8px;
  color: #172338;
  background: rgba(244, 247, 251, 0.94);
  box-shadow: 0 5px 13px rgba(18, 29, 55, 0.08);
  transition: opacity 0.22s ease, transform 0.22s ease;
}

.tile-caption strong,
.tile-caption span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tile-caption strong {
  grid-column: 1 / -1;
  font-size: clamp(0.53rem, 0.8vw, 0.68rem);
  font-weight: 760;
  line-height: 1.2;
}

.tile-caption span {
  margin-top: 2px;
  color: rgba(67, 80, 102, 0.74);
  font-size: clamp(0.45rem, 0.62vw, 0.55rem);
  line-height: 1.15;
}

.tile-source-label {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

.is-music .tile-caption {
  opacity: 0;
  transform: translateY(8px);
  pointer-events: none;
}

.is-music:hover .tile-caption {
  opacity: 1;
  transform: translateY(0);
}

.tone-dark .tile-caption {
  color: #f7f8ff;
  background: rgba(19, 28, 47, 0.76);
}

.tone-dark .tile-caption span {
  color: rgba(236, 241, 255, 0.7);
}

.is-portrait .tile-caption {
  right: 7px;
  bottom: 7px;
  left: 7px;
  padding: 6px 7px;
}

.is-portrait .tile-caption strong {
  font-size: clamp(0.48rem, 0.65vw, 0.6rem);
}

.is-square .tile-caption strong {
  font-size: clamp(0.48rem, 0.67vw, 0.61rem);
}

.is-game .tile-caption {
  right: auto;
  width: fit-content;
  max-width: calc(100% - 16px);
  grid-template-columns: minmax(0, 1fr);
}

@media (max-width: 820px) {
  .library-tile {
    border-radius: 9px;
  }

  .tile-source {
    top: 6px;
    right: 6px;
    width: 20px;
    height: 20px;
  }

  .tile-caption {
    right: 6px;
    bottom: 6px;
    left: 6px;
    padding: 5px 6px;
  }

  .tile-caption strong {
    font-size: 0.5rem;
  }

  .tile-caption span {
    font-size: 0.4rem;
  }

  .is-game .tile-caption {
    max-width: calc(100% - 12px);
  }
}

@media (hover: none) {
  .is-music .tile-caption {
    opacity: 1;
    transform: none;
    pointer-events: auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .library-tile,
  .tile-image :deep(img),
  .tile-caption {
    transition: none;
  }
}
</style>
