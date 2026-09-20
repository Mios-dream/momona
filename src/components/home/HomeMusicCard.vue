<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { MusicCatalog, MusicSettings } from "../../data/types";
import FallbackImage from "../app/FallbackImage.vue";
import IconGlyph from "../app/IconGlyph.vue";
import ReportPlatformIcon from "../reports/ReportPlatformIcon.vue";

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
    id?: string;
    name?: string;
    artist?: string;
    album?: string;
    cover?: string;
    source?: string;
  } | null;
}

const state = ref<State>({});
const hasTrack = computed(() => Boolean(state.value.currentSong?.name || props.track?.title));
const title = computed(() => state.value.currentSong?.name || props.track?.title || "暂无音乐");
const artist = computed(() => state.value.currentSong?.artist || props.track?.artist || "从同步歌单中选择曲目");
const cover = computed(() => state.value.currentSong?.cover || props.track?.cover || "");
const source = computed(() => {
  const value = state.value.currentSong?.source || props.track?.source;
  return value === "netease" || value === "qq" ? value : "manual";
});
const sourceLabel = computed(() => {
  if (source.value === "qq") return "QQ 音乐";
  if (source.value === "netease") return "网易云音乐";
  return "手动音乐";
});

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
  <section class="home-music-card glass-panel" :class="{ 'is-empty': !hasTrack }" aria-label="音乐播放器">
    <div class="music-card-top">
      <span class="music-platform" :aria-label="sourceLabel" :title="sourceLabel">
        <ReportPlatformIcon v-if="source !== 'manual'" :platform-id="source" :size="17" />
        <IconGlyph v-else name="music" :size="17" />
      </span>
      <FallbackImage
        class="music-cover-image"
        :src="cover"
        :alt="`${title} 音乐封面`"
        fallback-icon="music"
        :icon-size="18"
      />
    </div>
    <div class="music-card-copy">
      <strong>{{ title }}</strong>
      <span>{{ artist }}</span>
    </div>
    <button type="button" class="music-play" :aria-label="state.isPlaying ? '暂停' : '播放'" :title="state.isPlaying ? '暂停' : '播放'" @click="toggle">
      <IconGlyph :name="state.isPlaying ? 'pause' : 'play'" :size="14" />
    </button>
  </section>
</template>

<style scoped>
.home-music-card { position: relative; display: grid; width: 100%; height: 100%; min-width: 0; min-height: 0; padding: 11px; grid-template-rows: 47px minmax(0, 1fr) 31px; overflow: hidden; background: linear-gradient(145deg, rgba(255, 255, 255, 0.88), rgba(244, 251, 255, 0.72)); }
.music-card-top { display: flex; min-width: 0; align-items: flex-start; justify-content: space-between; }
.music-platform { display: grid; width: 22px; height: 22px; place-items: center; color: var(--ink); }
.music-platform :deep(svg) { display: block; }
.music-cover-image { width: 45px; height: 45px; flex: 0 0 auto; border-radius: 8px; background: rgba(225, 232, 246, 0.52); box-shadow: 0 7px 14px rgba(54, 45, 106, 0.1); }
.music-card-copy { display: grid; min-width: 0; align-self: end; gap: 3px; padding-bottom: 7px; }
.music-card-copy strong, .music-card-copy span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.music-card-copy strong { font-size: 0.8rem; line-height: 1.15; }
.music-card-copy span { color: var(--muted); font-size: 0.61rem; }
.music-play { display: grid; width: 31px; height: 31px; padding: 0; place-items: center; border: 1px solid rgba(255, 255, 255, 0.84); border-radius: 50%; color: var(--ink-soft); background: rgba(255, 255, 255, 0.82); box-shadow: 0 5px 12px rgba(54, 45, 106, 0.1); transition: color 0.18s ease, background 0.18s ease, transform 0.18s ease; }
.music-play:hover { color: var(--purple-deep); background: #fff; transform: translateY(-1px); }
.is-empty .music-card-copy strong { color: var(--muted); }
</style>
