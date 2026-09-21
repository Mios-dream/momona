<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { MusicCatalog, MusicSettings, MusicTrack } from "../../data/types";
import { musicPlatformLabel } from "../../lib/music";
import IconGlyph from "../app/IconGlyph.vue";
import ReportPlatformIcon from "../reports/ReportPlatformIcon.vue";

interface Props {
  track?: MusicSettings;
  catalog: MusicCatalog;
  editable?: boolean;
  compact?: boolean;
  embedded?: boolean;
  open?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  track: undefined,
  editable: false,
  compact: false,
  embedded: false,
});

const emit = defineEmits<{
  "update:open": [value: boolean];
}>();

interface State {
  isPlaying?: boolean;
  currentSong?: {
    id?: string;
    name?: string;
    artist?: string;
    album?: string;
    cover?: string;
    source?: string;
    playlistId?: string;
  } | null;
  playlistSource?: "netease" | "qq";
  playlistId?: string;
  playlistTitle?: string;
  playlistTracks?: MusicTrack[];
}

const localOpen = ref(false);
const state = ref<State>({});
const selectedPlaylistKey = ref("");
const searchQuery = ref("");

const isOpen = computed(() => props.open ?? localOpen.value);

/**
 * 设置歌单选择面板的展开状态。
 *
 * @param value - 是否展开面板。
 * @returns 无返回值；受控模式通过事件通知父组件，非受控模式更新本地状态。
 */
function setOpen(value: boolean): void {
  if (props.open !== undefined) emit("update:open", value);
  else localOpen.value = value;
  if (!value) searchQuery.value = "";
}

/**
 * 判断来源值是否为播放器支持的音乐平台。
 *
 * @param value - 未经校验的来源字符串。
 * @returns 来源属于网易云音乐或 QQ 音乐时返回 true。
 */
function isMusicSource(
  value: string | undefined,
): value is "netease" | "qq" {
  return value === "netease" || value === "qq";
}

/**
 * 组合平台和歌单 ID，生成选择器内部使用的稳定键。
 *
 * @param source - 音乐平台标识。
 * @param playlistId - 歌单 ID。
 * @returns 用于下拉选择和状态匹配的稳定字符串键。
 */
function playlistKey(source: "netease" | "qq", playlistId: string): string {
  return `${source}:${playlistId}`;
}

const playlists = computed(() => props.catalog.playlists);
const activePlaylist = computed(() => {
  const stateSource =
    state.value.playlistSource ??
    (isMusicSource(state.value.currentSong?.source)
      ? state.value.currentSong.source
      : undefined);
  const trackSource = isMusicSource(props.track?.source)
    ? props.track.source
    : undefined;
  const currentKey =
    selectedPlaylistKey.value ||
    (stateSource && state.value.playlistId
      ? playlistKey(stateSource, state.value.playlistId)
      : stateSource && state.value.currentSong?.playlistId
        ? playlistKey(stateSource, state.value.currentSong.playlistId)
        : trackSource && props.track?.playlistId
          ? playlistKey(trackSource, props.track.playlistId)
          : "");
  return (
    playlists.value.find(
      (playlist) => playlistKey(playlist.source, playlist.id) === currentKey,
    ) ??
    playlists.value[0]
  );
});
const tracks = computed(() => {
  if (
    state.value.playlistTracks?.length &&
    activePlaylist.value &&
    state.value.playlistSource === activePlaylist.value.source &&
    state.value.playlistId === activePlaylist.value.id
  ) {
    return state.value.playlistTracks;
  }
  return activePlaylist.value?.tracks ?? [];
});
const filteredTracks = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase();
  if (!query) return tracks.value;
  return tracks.value.filter((track) =>
    [track.title, track.artist, track.album]
      .filter(Boolean)
      .join(" ")
      .toLocaleLowerCase()
      .includes(query),
  );
});
const playlistCountLabel = computed(() => {
  const total = activePlaylist.value?.trackCount || tracks.value.length;
  return `${tracks.value.length}/${total}`;
});
const currentId = computed(
  () => state.value.currentSong?.id || props.track?.id || "",
);
const currentTitle = computed(
  () => state.value.currentSong?.name || props.track?.title || "暂无音乐",
);
const currentArtist = computed(
  () => state.value.currentSong?.artist || props.track?.artist || "选择一首曲目开始播放",
);

/**
 * 判断指定曲目是否为播放器当前曲目。
 *
 * @param track - 需要比较的歌单曲目。
 * @returns 曲目 ID、平台和歌单都匹配时返回 true。
 */
function isCurrentTrack(track: MusicTrack): boolean {
  return (
    currentId.value === track.id &&
    state.value.currentSong?.source === track.source &&
    state.value.currentSong?.playlistId === track.playlistId
  );
}

/**
 * 接收播放器状态并同步当前歌单选择。
 *
 * @param event - 携带播放器状态的自定义事件。
 * @returns 无返回值；无效状态事件会被忽略。
 */
function handleState(event: Event): void {
  const next = (event as CustomEvent<State>).detail;
  if (!next || typeof next !== "object") return;
  state.value = next;
  if (next.playlistSource && next.playlistId) {
    selectedPlaylistKey.value = playlistKey(next.playlistSource, next.playlistId);
  } else {
    selectedPlaylistKey.value = "";
  }
}

/**
 * 请求播放器宿主立即发布当前状态。
 *
 * @returns 无返回值；服务端渲染阶段不会访问 window。
 */
function requestState(): void {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("music-player-request-state"));
  }
}

/**
 * 发布播放器展开或播放切换事件。
 *
 * @returns 无返回值。
 */
function toggle(): void {
  window.dispatchEvent(new CustomEvent("music-player-toggle"));
}

/**
 * 选择当前歌单并请求播放器加载歌单曲目。
 *
 * @returns 无返回值；没有可选歌单时不派发事件。
 */
function choosePlaylist(): void {
  const playlist = activePlaylist.value;
  if (!playlist) return;
  selectedPlaylistKey.value = playlistKey(playlist.source, playlist.id);
  searchQuery.value = "";
  window.dispatchEvent(
    new CustomEvent("music-player-load-playlist", {
      detail: {
        source: playlist.source,
        playlistId: playlist.id,
        autoPlay: false,
      },
    }),
  );
}

/**
 * 选择曲目并通知播放器切换当前曲目。
 *
 * @param track - 用户选择的歌单曲目。
 * @returns 无返回值；嵌入播放器模式保持面板打开。
 */
function chooseTrack(track: MusicTrack): void {
  window.dispatchEvent(
    new CustomEvent("music-player-select-track", { detail: track }),
  );
  if (!props.embedded) setOpen(false);
}

onMounted(() => {
  window.addEventListener("music-player-state-change", handleState);
  requestState();
});
onBeforeUnmount(() =>
  window.removeEventListener("music-player-state-change", handleState),
);
</script>

<template>
  <div
    class="music-picker"
    :class="{ 'is-compact': props.compact, 'is-embedded': props.embedded }"
  >
    <button
      v-if="!props.embedded"
      class="music-picker-trigger"
      type="button"
      :aria-expanded="isOpen"
      aria-label="打开音乐曲目"
      @click="setOpen(!isOpen)"
    >
      <span class="music-picker-trigger-copy">
        <strong>{{ currentTitle }}</strong>
        <small>{{ currentArtist }}</small>
      </span>
      <IconGlyph
        :name="isOpen ? 'chevronDown' : props.compact ? 'listMusic' : 'music'"
        :size="14"
      />
    </button>

    <div
      v-if="isOpen"
      class="music-picker-panel"
      :class="{ 'is-embedded-panel': props.embedded }"
      :aria-label="props.embedded ? '播放列表' : undefined"
    >
      <div class="music-picker-head">
        <template v-if="props.embedded">
          <button
            type="button"
            class="music-picker-back"
            aria-label="返回播放器"
            title="返回播放器"
            @click="setOpen(false)"
          >
            <IconGlyph name="arrowLeft" :size="13" />
            <span>返回</span>
          </button>
          <div class="music-picker-title">
            <span><IconGlyph name="listMusic" :size="14" />播放列表</span>
            <small>{{ playlistCountLabel }}</small>
          </div>
          <label class="music-picker-search">
            <IconGlyph name="search" :size="13" />
            <input v-model="searchQuery" type="search" placeholder="搜索..." aria-label="搜索曲目" />
          </label>
        </template>
        <template v-else>
          <div>
            <span>PLAY QUEUE</span>
            <strong>{{ activePlaylist?.title || "同步歌单" }}</strong>
          </div>
          <button
            type="button"
            class="music-picker-close"
            aria-label="关闭音乐曲目"
            title="关闭"
            @click="setOpen(false)"
          >
            <IconGlyph name="x" :size="14" />
          </button>
        </template>
      </div>

      <label v-if="props.editable && playlists.length" class="music-playlist-select">
        <span>开发模式歌单</span>
        <select v-model="selectedPlaylistKey" @change="choosePlaylist">
          <option
            v-for="playlist in playlists"
            :key="`${playlist.source}-${playlist.id}`"
            :value="playlistKey(playlist.source, playlist.id)"
          >
            {{ musicPlatformLabel(playlist.source) }} · {{ playlist.title }}
          </option>
        </select>
      </label>

      <div v-if="filteredTracks.length" class="music-track-list">
        <button
          v-for="(track, index) in filteredTracks"
          :key="`${track.source}-${track.playlistId}-${track.id}`"
          type="button"
          class="music-track-row"
          :class="{ 'is-current': isCurrentTrack(track) }"
          @click="chooseTrack(track)"
        >
          <span class="music-track-index">
            <span v-if="props.embedded">{{ index + 1 }}</span>
            <template v-else>
              <IconGlyph v-if="isCurrentTrack(track) && state.isPlaying" name="pause" :size="12" />
              <IconGlyph v-else-if="isCurrentTrack(track)" name="play" :size="12" />
              <span v-else>{{ String(index + 1).padStart(2, "0") }}</span>
            </template>
          </span>
          <span class="music-track-copy">
            <strong>{{ track.title }}</strong>
            <small>{{ track.artist || "未知艺术家" }}<template v-if="track.album"> · {{ track.album }}</template></small>
          </span>
          <span class="music-track-end">
            <span v-if="isCurrentTrack(track) && state.isPlaying" class="music-track-equalizer" aria-hidden="true">
              <i></i><i></i><i></i>
            </span>
            <ReportPlatformIcon v-else-if="!props.embedded" :platform-id="track.source" :size="13" />
          </span>
        </button>
      </div>
      <p v-else class="music-picker-empty">
        {{ searchQuery ? "没有匹配的曲目。" : props.editable ? "先从同步数据中选择一个歌单。" : "该歌单暂时没有曲目快照。" }}
      </p>

      <div v-if="!props.embedded" class="music-picker-foot">
        <span>{{ tracks.length ? `${tracks.length} 首已同步曲目` : "等待音乐目录" }}</span>
        <button
          type="button"
          class="music-picker-play"
          :aria-label="state.isPlaying ? '暂停' : '播放'"
          :title="state.isPlaying ? '暂停' : '播放'"
          @click="toggle"
        >
          <IconGlyph :name="state.isPlaying ? 'pause' : 'play'" :size="13" />
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.music-picker {
  position: relative;
  min-width: 0;
}

.music-picker.is-embedded {
  width: 100%;
  min-width: 0;
}

.music-picker-trigger {
  display: flex;
  width: 100%;
  min-width: 0;
  padding: 0;
  align-items: center;
  gap: 8px;
  border: 0;
  color: inherit;
  background: transparent;
  text-align: left;
}

.music-picker-trigger:hover .music-picker-trigger-copy strong {
  color: var(--purple-deep);
}

.music-picker-trigger > svg {
  flex: 0 0 auto;
  color: var(--muted);
}

.music-picker-trigger-copy {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 2px;
}

.music-picker-trigger-copy strong,
.music-picker-trigger-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.music-picker-trigger-copy strong {
  font-size: 0.72rem;
}

.music-picker-trigger-copy small {
  color: var(--muted);
  font-size: 0.55rem;
}

.music-picker-panel {
  position: absolute;
  z-index: 50;
  top: calc(100% + 10px);
  right: 0;
  display: grid;
  width: min(330px, calc(100vw - 28px));
  max-height: min(430px, calc(100svh - 86px));
  padding: 12px;
  gap: 10px;
  overflow: auto;
  border: 1px solid rgba(255, 255, 255, 0.9);
  border-radius: 13px;
  background: rgba(253, 254, 255, 0.94);
  box-shadow: 0 20px 42px rgba(54, 45, 106, 0.2);
  backdrop-filter: blur(22px) saturate(140%);
}

.music-picker-panel.is-embedded-panel {
  position: static;
  width: 100%;
  max-height: none;
  padding: 0;
  overflow: hidden;
  border: 0;
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
}

.is-compact .music-picker-panel {
  right: 0;
}

.music-picker-head,
.music-picker-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.music-picker-head > div {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.music-picker-back {
  display: inline-flex;
  min-width: 46px;
  padding: 5px 4px;
  align-items: center;
  gap: 3px;
  border: 0;
  border-radius: 7px;
  color: var(--muted-strong);
  background: transparent;
  font-size: 0.58rem;
  white-space: nowrap;
}

.music-picker-back:hover {
  color: var(--purple-deep);
  background: rgba(117, 100, 222, 0.1);
}

.music-picker-title {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 2px;
}

.music-picker-title > span {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 5px;
  color: var(--ink-soft) !important;
  font-size: 0.72rem !important;
  font-weight: 760;
  letter-spacing: 0 !important;
}

.music-picker-title small {
  color: var(--muted);
  font-size: 0.49rem;
}

.music-picker-search {
  display: flex;
  width: min(120px, 30%);
  min-width: 92px;
  height: 28px;
  padding: 0 7px;
  align-items: center;
  gap: 5px;
  border: 1px solid rgba(118, 126, 151, 0.16);
  border-radius: 7px;
  color: var(--muted);
  background: rgba(255, 255, 255, 0.28);
}

.music-picker-search:focus-within {
  border-color: rgba(117, 100, 222, 0.42);
  color: var(--purple-deep);
  background: rgba(255, 255, 255, 0.58);
}

.music-picker-search input {
  width: 100%;
  min-width: 0;
  padding: 0;
  border: 0;
  outline: 0;
  color: var(--ink-soft);
  background: transparent;
  font: inherit;
  font-size: 0.54rem;
}

.music-picker-search input::placeholder {
  color: var(--muted);
}

.music-picker-head span {
  color: var(--muted);
  font-size: 0.48rem;
  letter-spacing: 0.08em;
}

.music-picker-head strong {
  overflow: hidden;
  font-size: 0.66rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.music-picker-close,
.music-picker-play {
  display: grid;
  width: 27px;
  height: 27px;
  padding: 0;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgba(118, 126, 151, 0.18);
  border-radius: 8px;
  color: var(--muted-strong);
  background: rgba(255, 255, 255, 0.74);
}

.music-picker-close:hover,
.music-picker-play:hover {
  color: var(--purple-deep);
  background: #fff;
}

.music-playlist-select {
  display: grid;
  gap: 4px;
}

.music-playlist-select span {
  color: var(--muted);
  font-size: 0.52rem;
}

.music-playlist-select select {
  width: 100%;
  min-height: 31px;
  padding: 0 8px;
  border: 1px solid rgba(118, 126, 151, 0.18);
  border-radius: 7px;
  color: var(--ink-soft);
  background: rgba(255, 255, 255, 0.76);
  font-size: 0.55rem;
}

.is-embedded-panel .music-playlist-select {
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}

.is-embedded-panel .music-playlist-select select {
  min-width: 0;
}

.music-track-list {
  display: grid;
  gap: 3px;
}

.is-embedded-panel .music-track-list {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px 6px;
  min-height: 0;
  max-height: 162px;
  overflow-y: auto;
  scrollbar-width: thin;
}

.music-track-row {
  display: grid;
  min-width: 0;
  padding: 7px 6px;
  grid-template-columns: 22px minmax(0, 1fr) 17px;
  align-items: center;
  gap: 7px;
  border: 0;
  border-radius: 7px;
  color: var(--ink-soft);
  background: transparent;
  text-align: left;
}

.music-track-row:hover,
.music-track-row.is-current {
  color: var(--purple-deep);
  background: rgba(117, 100, 222, 0.09);
}

.music-track-index {
  display: grid;
  width: 22px;
  height: 22px;
  place-items: center;
  color: var(--muted);
  font-size: 0.52rem;
}

.music-track-copy {
  display: grid;
  min-width: 0;
  gap: 2px;
}

.music-track-copy strong,
.music-track-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.music-track-copy strong {
  font-size: 0.58rem;
  font-weight: 720;
}

.music-track-copy small {
  color: var(--muted);
  font-size: 0.49rem;
}

.music-track-row > svg {
  color: var(--muted);
}

.music-track-end {
  display: grid;
  width: 17px;
  height: 17px;
  place-items: center;
  color: var(--muted);
}

.music-track-end > svg {
  color: inherit;
}

.music-track-equalizer {
  display: flex;
  height: 12px;
  align-items: end;
  gap: 2px;
}

.music-track-equalizer i {
  display: block;
  width: 2px;
  height: 6px;
  border-radius: 2px;
  background: currentColor;
}

.music-track-equalizer i:nth-child(2) {
  height: 10px;
}

.music-track-equalizer i:nth-child(3) {
  height: 8px;
}

.is-embedded-panel .music-track-row {
  min-height: 36px;
  padding: 6px 7px;
  grid-template-columns: 18px minmax(0, 1fr) 17px;
  gap: 6px;
  border: 1px solid rgba(118, 126, 151, 0.13);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.22);
}

.is-embedded-panel .music-track-row:hover,
.is-embedded-panel .music-track-row.is-current {
  border-color: rgba(117, 100, 222, 0.2);
  background: rgba(117, 100, 222, 0.1);
}

.is-embedded-panel .music-track-index {
  width: 18px;
  height: 18px;
  font-size: 0.5rem;
}

.music-picker-empty {
  margin: 0;
  padding: 14px 8px;
  color: var(--muted);
  font-size: 0.57rem;
  line-height: 1.5;
}

.music-picker-foot {
  color: var(--muted);
  font-size: 0.51rem;
}

@media (max-width: 520px) {
  .music-picker-panel {
    position: fixed;
    top: auto;
    right: 12px;
    bottom: 76px;
    left: 12px;
    width: auto;
    max-height: min(60svh, 430px);
  }
}
</style>
