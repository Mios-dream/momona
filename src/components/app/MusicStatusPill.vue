<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { MusicCatalog, MusicSettings } from "../../data/types";
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
  catalog: () => ({ playlists: [] }),
  editable: false,
});

interface State {
  isPlaying?: boolean;
  currentSong?: {
    name?: string;
    artist?: string;
    cover?: string;
  } | null;
}

const state = ref<State>({});
const title = computed(() => state.value.currentSong?.name || props.track?.title || "暂无音乐");
const artist = computed(() => state.value.currentSong?.artist || props.track?.artist || "选择曲目");
const cover = computed(() => state.value.currentSong?.cover || props.track?.cover || "");

const handleState = (event: Event): void => {
  const next = (event as CustomEvent<State>).detail;
  if (next && typeof next === "object") state.value = next;
};

const toggle = (): void => {
  window.dispatchEvent(new CustomEvent("music-player-toggle"));
};

onMounted(() => {
  window.addEventListener("music-player-state-change", handleState);
  window.dispatchEvent(new CustomEvent("music-player-request-state"));
});
onBeforeUnmount(() => window.removeEventListener("music-player-state-change", handleState));
</script>

<template>
  <div class="music-status-wrap">
    <div class="music-status-pill" :class="{ 'is-playing': state.isPlaying }">
      <FallbackImage class="music-status-cover" :src="cover" :alt="`${title} 封面`" fallback-icon="music" :icon-size="14" />
      <button type="button" class="music-status-main" aria-label="打开音乐曲目" @click="toggle">
        <strong>{{ title }}</strong>
        <small>{{ artist }}</small>
      </button>
      <button type="button" class="music-status-play" :aria-label="state.isPlaying ? '暂停' : '播放'" :title="state.isPlaying ? '暂停' : '播放'" @click="toggle">
        <IconGlyph :name="state.isPlaying ? 'pause' : 'play'" :size="12" />
      </button>
      <MusicPicker :track="props.track" :catalog="props.catalog" :editable="props.editable" compact />
    </div>
  </div>
</template>

<style scoped>
.music-status-wrap { position: fixed; z-index: 35; top: 16px; right: 196px; }
.music-status-pill { display: flex; min-width: 174px; min-height: 48px; padding: 6px 7px; align-items: center; gap: 7px; border: 1px solid rgba(255, 255, 255, 0.82); border-radius: 24px; background: rgba(255, 255, 255, 0.68); box-shadow: 0 10px 24px rgba(54, 45, 106, 0.11); backdrop-filter: blur(18px) saturate(145%); }
.music-status-cover { width: 32px; height: 32px; flex: 0 0 auto; border-radius: 9px; }
.music-status-main { display: grid; min-width: 0; flex: 1; padding: 0; gap: 2px; border: 0; color: var(--ink); background: transparent; text-align: left; }
.music-status-main strong, .music-status-main small { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.music-status-main strong { font-size: 0.61rem; }
.music-status-main small { color: var(--muted); font-size: 0.5rem; }
.music-status-play { display: grid; width: 27px; height: 27px; padding: 0; flex: 0 0 auto; place-items: center; border: 0; border-radius: 50%; color: var(--ink-soft); background: rgba(255, 255, 255, 0.78); }
.music-status-play:hover { color: var(--purple-deep); background: #fff; }
.music-status-pill :deep(.music-picker-trigger) { width: 20px; height: 28px; justify-content: center; }
.music-status-pill :deep(.music-picker-trigger-copy) { display: none; }
.music-status-pill :deep(.music-picker-trigger > svg) { color: var(--muted); }
.music-status-pill :deep(.music-picker-panel) { top: calc(100% + 9px); }
.is-playing .music-status-cover { box-shadow: 0 0 0 2px rgba(53, 165, 123, 0.24); }
@media (max-width: 820px) { .music-status-wrap { top: 12px; right: 176px; } }
@media (max-width: 560px) { .music-status-wrap { right: 12px; top: 68px; } .music-status-pill { min-width: min(220px, calc(100vw - 24px)); } }
</style>
