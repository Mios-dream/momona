<script setup lang="ts">
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
      :referrer-policy="props.tile.sourceId === 'bilibili' ? 'no-referrer' : undefined"
      :draggable="false"
    />
    <span class="tile-wash" aria-hidden="true"></span>
    <span class="tile-source" :aria-label="props.sourceLabel" :title="props.sourceLabel">
      <ReportPlatformIcon
        v-if="props.tile.sourceId === 'netease' || props.tile.sourceId === 'qqmusic'"
        :platform-id="props.tile.sourceId"
        :size="12"
      />
      <IconGlyph v-else :name="props.tile.icon" :size="12" />
      {{ props.sourceLabel }}
    </span>
    <div class="tile-caption">
      <strong>{{ props.tile.title }}</strong>
      <span v-if="props.tile.subtitle && !['Bilibili', 'Netease'].includes(props.tile.subtitle)">
        {{ props.tile.subtitle }}
      </span>
      <em>{{ props.tile.tag }}</em>
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
    transform 0.2s ease,
    filter 0.2s ease;
  will-change: transform;
}

.library-tile:hover {
  z-index: 6;
  box-shadow: 0 19px 34px rgba(54, 45, 106, 0.3);
  filter: saturate(1.06);
  transform: translateY(-4px) rotate(-0.4deg);
}

.tile-image,
.tile-wash {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.tile-image {
  display: block;
  user-select: none;
}

.tile-wash {
  z-index: 1;
  background: linear-gradient(180deg, rgba(30, 37, 66, 0.04) 23%, rgba(14, 19, 38, 0.65) 100%);
}

.tone-cyan .tile-wash {
  background: linear-gradient(180deg, rgba(22, 190, 216, 0.06), rgba(18, 45, 83, 0.7));
}

.tone-pink .tile-wash {
  background: linear-gradient(180deg, rgba(247, 95, 170, 0.04), rgba(67, 31, 72, 0.68));
}

.tone-violet .tile-wash {
  background: linear-gradient(180deg, rgba(119, 89, 233, 0.03), rgba(39, 33, 77, 0.72));
}

.tone-cream .tile-wash {
  background: linear-gradient(180deg, rgba(255, 202, 85, 0.02), rgba(65, 45, 30, 0.66));
}

.tone-dark .tile-wash {
  background: linear-gradient(180deg, rgba(9, 16, 36, 0.05), rgba(8, 14, 28, 0.78));
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
  background: rgba(229, 247, 250, 0.72);
  font-size: 0;
  font-weight: 700;
  line-height: 1;
  backdrop-filter: blur(8px);
}

.tone-pink .tile-source {
  background: rgba(255, 231, 243, 0.76);
}

.tone-violet .tile-source {
  background: rgba(239, 235, 255, 0.78);
}

.tone-dark .tile-source {
  color: rgba(255, 255, 255, 0.88);
  background: rgba(27, 36, 58, 0.72);
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
  background: rgba(244, 247, 251, 0.78);
  box-shadow: 0 5px 13px rgba(18, 29, 55, 0.08);
  backdrop-filter: blur(10px) saturate(135%);
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

.tile-caption em {
  display: inline-flex;
  margin-top: 2px;
  padding: 3px 5px;
  border-radius: 5px;
  color: rgba(192, 53, 112, 0.9);
  background: rgba(252, 221, 235, 0.88);
  font-size: clamp(0.42rem, 0.57vw, 0.52rem);
  font-style: normal;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
}

.tone-dark .tile-caption {
  color: #f7f8ff;
  background: rgba(19, 28, 47, 0.76);
}

.tone-dark .tile-caption span {
  color: rgba(236, 241, 255, 0.7);
}

.tone-dark .tile-caption em {
  color: rgba(222, 233, 255, 0.9);
  background: rgba(90, 109, 143, 0.64);
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

  .tile-caption span,
  .tile-caption em {
    font-size: 0.4rem;
  }
}
</style>
