<script setup lang="ts">
import type { LibraryTile } from '../../data/types';
import FallbackImage from '../app/FallbackImage.vue';
import IconGlyph from '../app/IconGlyph.vue';

interface Props {
  videos: LibraryTile[];
}

const props = defineProps<Props>();
</script>

<template>
  <section class="home-bilibili-card glass-panel" aria-label="Bilibili 视频">
    <header class="bilibili-card-head">
      <div>
        <span class="widget-eyebrow">BILIBILI / VIDEOS</span>
        <h2>最近投稿</h2>
      </div>
      <IconGlyph name="video" :size="18" />
    </header>
    <div v-if="props.videos.length" class="bilibili-video-list">
      <article v-for="video in props.videos.slice(0, 2)" :key="video.id" class="bilibili-video">
        <FallbackImage
          class="bilibili-video-image"
          :src="video.image"
          :alt="video.title"
          fallback-icon="video"
          :icon-size="18"
          referrer-policy="no-referrer"
        />
        <div>
          <strong>{{ video.title }}</strong>
          <small>{{ video.subtitle || 'Bilibili 视频' }}</small>
        </div>
        <IconGlyph name="play" :size="13" />
      </article>
    </div>
    <p v-else class="bilibili-empty">在设置中同步 Bilibili 后，这里会自动读取投稿视频。</p>
  </section>
</template>

<style scoped>
.home-bilibili-card {
  display: flex;
  min-height: 148px;
  padding: 13px;
  flex-direction: column;
  gap: 9px;
  background: linear-gradient(145deg, rgba(255, 237, 246, 0.82), rgba(237, 242, 255, 0.68));
}

.bilibili-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.bilibili-card-head > svg {
  color: #e46391;
}

.widget-eyebrow {
  color: #d95887;
  font-size: 0.5rem;
  font-weight: 800;
  letter-spacing: 0.1em;
}

.bilibili-card-head h2 {
  margin: 4px 0 0;
  font-size: 0.77rem;
}

.bilibili-video-list {
  display: grid;
  min-height: 0;
  gap: 6px;
}

.bilibili-video {
  display: grid;
  min-width: 0;
  padding: 5px;
  grid-template-columns: 50px minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.5);
}

.bilibili-video-image {
  width: 50px;
  height: 35px;
  border-radius: 6px;
}

.bilibili-video div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.bilibili-video strong,
.bilibili-video small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bilibili-video strong {
  font-size: 0.58rem;
}

.bilibili-video small {
  color: var(--muted);
  font-size: 0.49rem;
}

.bilibili-video > svg {
  color: #e46391;
}

.bilibili-empty {
  margin: auto 0;
  color: var(--muted);
  font-size: 0.6rem;
  line-height: 1.45;
}
</style>
