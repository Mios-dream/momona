<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from "vue";
import type {
  MusicCatalog,
  MusicPlaybackMode,
  MusicSettings,
  MusicTrack,
} from "../../data/types";
import { normalizeMusicPlaylist } from "../../lib/music";

interface Props {
  track: MusicSettings;
  catalog: MusicCatalog;
  editable?: boolean;
}

const props = withDefaults(defineProps<Props>(), { editable: false });

interface PlayerSong {
  id: string;
  name: string;
  artist: string;
  album: string;
  cover: string;
  url: string;
  source: "netease" | "qq" | "manual";
  playlistId: string;
}

interface PlayerDetail {
  isEnabled?: boolean;
  isPlaying?: boolean;
  currentTime?: number;
  duration?: number;
  isMuted?: boolean;
  isShuffle?: boolean;
  repeatMode?: RepeatMode;
  playbackMode?: MusicPlaybackMode;
  volume?: number;
  currentSong?: PlayerSong | null;
  playlistSource?: "netease" | "qq";
  playlistId?: string;
  playlistTitle?: string;
  playlistTracks?: MusicTrack[];
}

type RepeatMode = "off" | "all" | "one";

const audioRef = ref<HTMLAudioElement | null>(null);
const currentTrack = ref<MusicSettings>({ ...props.track });
const currentPlaylistTracks = ref<MusicTrack[]>([]);
const currentPlaylistTitle = ref("");
const isPlaying = ref(false);
const currentTime = ref(0);
const duration = ref(0);
const isMuted = ref(false);
const isShuffle = ref(false);
const repeatMode = ref<RepeatMode>("off");
const volume = ref(1);
let playlistLoadToken = 0;

/**
 * 根据随机和重复开关计算播放器对外暴露的播放模式。
 *
 * @returns 当前播放器使用的播放模式。
 */
function getPlaybackMode(): MusicPlaybackMode {
  if (isShuffle.value) return "shuffle";
  if (repeatMode.value === "one") return "one";
  return "sequential";
}

interface LoadedPlaylist {
  title: string;
  tracks: MusicTrack[];
}

/**
 * 将页面配置中的音乐设置转换为播放器事件使用的曲目对象。
 *
 * @param track - 当前音乐设置。
 * @returns 对外发布的播放器曲目快照。
 */
function toSong(track: MusicSettings): PlayerSong {
  return {
    id: track.id,
    name: track.title,
    artist: track.artist,
    album: track.album,
    cover: track.cover,
    url: track.audioUrl,
    source: track.source,
    playlistId: track.playlistId,
  };
}

/**
 * 在本地可编辑模式下通知设置页保存当前曲目配置。
 *
 * @returns 无返回值；生产模式或服务端渲染阶段不会派发事件。
 */
function dispatchConfigChange(): void {
  if (typeof window === "undefined" || !props.editable) return;
  window.dispatchEvent(
    new CustomEvent("music-player-config-change", {
      detail: { ...currentTrack.value },
    }),
  );
}

/**
 * 从公开音乐目录中查找当前曲目所属歌单。
 *
 * @returns 与当前来源和歌单 ID 匹配的歌单，找不到时返回 undefined。
 */
function currentPlaylist(): MusicCatalog["playlists"][number] | undefined {
  return props.catalog.playlists.find(
    (playlist) =>
      playlist.id === currentTrack.value.playlistId &&
      playlist.source === currentTrack.value.source,
  );
}

/**
 * 组装并发布播放器状态，供音乐控件和首页卡片共享。
 *
 * @returns 无返回值；状态同时写入 window 缓存并派发自定义事件。
 */
function publishState(): void {
  if (typeof window === "undefined") return;
  const playlist = currentPlaylist();
  const detail: PlayerDetail = {
    isEnabled: Boolean(currentTrack.value.enabled && currentTrack.value.title),
    isPlaying: isPlaying.value,
    currentTime: currentTime.value,
    duration: duration.value,
    isMuted: isMuted.value,
    isShuffle: isShuffle.value,
    repeatMode: repeatMode.value,
    playbackMode: getPlaybackMode(),
    volume: volume.value,
    currentSong: currentTrack.value.title ? toSong(currentTrack.value) : null,
    playlistSource:
      currentTrack.value.source === "netease" || currentTrack.value.source === "qq"
        ? currentTrack.value.source
        : undefined,
    playlistId: currentTrack.value.playlistId,
    playlistTitle: currentPlaylistTitle.value || playlist?.title || "",
    playlistTracks:
      currentPlaylistTracks.value.length > 0
        ? currentPlaylistTracks.value
        : playlist?.tracks ?? [],
  };
  (window as Window & { __musicPlayerState?: PlayerDetail }).__musicPlayerState =
    detail;
  window.dispatchEvent(new CustomEvent("music-player-state-change", { detail }));
}

/**
 * 将当前曲目、音量和静音状态同步到原生 audio 元素。
 *
 * @returns 无返回值；没有挂载 audio 元素时直接结束。
 */
function syncAudio(): void {
  const audio = audioRef.value;
  if (!audio) return;
  currentTime.value = 0;
  duration.value = 0;
  audio.volume = volume.value;
  audio.muted = isMuted.value;
  audio.src = currentTrack.value.audioUrl || "";
  audio.load();
}

/**
 * 切换当前曲目，并按需自动播放和保存配置。
 *
 * @param track - 需要切换到的目录曲目。
 * @param autoPlay - 是否在同步 audio 后立即播放。
 * @param persist - 是否向本地设置页派发保存事件。
 * @returns 无返回值；所有播放器控件通过 publishState 获取最新状态。
 */
function setTrack(
  track: MusicTrack,
  autoPlay = false,
  persist = false,
): void {
  currentTrack.value = {
    ...currentTrack.value,
    enabled: true,
    source: track.source,
    playlistId: track.playlistId,
    id: track.id,
    title: track.title,
    artist: track.artist,
    album: track.album,
    cover: track.cover,
    audioUrl: track.audioUrl,
  };
  const catalogPlaylist = props.catalog.playlists.find(
    (playlist) =>
      playlist.source === track.source && playlist.id === track.playlistId,
  );
  if (catalogPlaylist) currentPlaylistTitle.value = catalogPlaylist.title;
  isPlaying.value = false;
  syncAudio();
  publishState();
  if (persist) dispatchConfigChange();
  if (autoPlay) void togglePlaying();
}

/**
 * 从构建时音乐目录中查找指定歌单的曲目。
 *
 * @param source - 音乐平台标识。
 * @param playlistId - 歌单 ID。
 * @returns 目录中已有的曲目列表；不存在时返回空数组。
 */
function findPlaylistTracks(
  source: "netease" | "qq",
  playlistId: string,
): MusicTrack[] {
  const playlist = props.catalog.playlists.find(
    (item) => item.source === source && item.id === playlistId,
  );
  return playlist?.tracks ?? [];
}

/**
 * 在本地开发模式下从代理接口加载完整歌单。
 *
 * @param source - 音乐平台标识。
 * @param playlistId - 歌单 ID。
 * @returns 规范化后的歌单标题和曲目列表。
 * @throws 当接口响应失败或没有可播放曲目时抛出异常。
 */
async function loadPlaylistFromDevServer(
  source: "netease" | "qq",
  playlistId: string,
): Promise<LoadedPlaylist> {
  if (!props.editable) return { title: "", tracks: [] };
  const response = await fetch(
    `/__momona/music-playlist?source=${encodeURIComponent(source)}&id=${encodeURIComponent(playlistId)}`,
  );
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) throw new Error("歌单读取失败");
  const result = normalizeMusicPlaylist(payload, source, playlistId);
  if (!result) throw new Error("歌单中没有可播放的曲目");
  return { title: result.playlistTitle, tracks: result.tracks };
}

/**
 * 加载歌单曲目，优先使用公开快照，缺失时回退到本地开发接口。
 *
 * @param detail - 歌单来源、ID和可选自动播放标志。
 * @returns 无返回值；过期请求不会覆盖较新的歌单结果。
 */
async function loadPlaylist(detail: {
  source: "netease" | "qq";
  playlistId: string;
  autoPlay?: boolean;
}): Promise<void> {
  const requestToken = ++playlistLoadToken;
  let tracks = findPlaylistTracks(detail.source, detail.playlistId);
  let playlistTitle =
    props.catalog.playlists.find(
      (playlist) => playlist.source === detail.source && playlist.id === detail.playlistId,
    )?.title ?? "";
  if (!tracks.length) {
    try {
      const loaded = await loadPlaylistFromDevServer(detail.source, detail.playlistId);
      if (requestToken !== playlistLoadToken) return;
      tracks = loaded.tracks;
      playlistTitle = loaded.title;
    } catch {
      if (requestToken !== playlistLoadToken) return;
      currentPlaylistTracks.value = [];
      currentPlaylistTitle.value = "";
      publishState();
      return;
    }
  }
  if (requestToken !== playlistLoadToken) return;
  currentPlaylistTracks.value = tracks;
  currentPlaylistTitle.value = playlistTitle;
  if (tracks[0]) setTrack(tracks[0], detail.autoPlay === true, true);
}

/**
 * 切换当前曲目的播放和暂停状态。
 *
 * @returns 播放器操作完成后结束；浏览器拒绝播放时会恢复暂停状态。
 */
async function togglePlaying(): Promise<void> {
  const audio = audioRef.value;
  if (!currentTrack.value.title) return;
  if (!audio || !currentTrack.value.audioUrl) {
    isPlaying.value = !isPlaying.value;
    publishState();
    return;
  }
  if (isPlaying.value) {
    audio.pause();
    return;
  }
  try {
    await audio.play();
  } catch {
    isPlaying.value = false;
    publishState();
  }
}

/**
 * 处理外部曲目选择事件并切换播放器当前曲目。
 *
 * @param event - 携带 MusicTrack 的自定义事件。
 * @returns 无返回值；无效曲目事件会被忽略。
 */
function handleSelectTrack(event: Event): void {
  const track = (event as CustomEvent<MusicTrack>).detail;
  if (!track || typeof track !== "object" || !track.id) return;
  playlistLoadToken += 1;
  const isCurrentPlaylist =
    currentTrack.value.source === track.source &&
    currentTrack.value.playlistId === track.playlistId;
  if (!isCurrentPlaylist || !currentPlaylistTracks.value.length) {
    const catalogTracks = findPlaylistTracks(track.source, track.playlistId);
    if (catalogTracks.length) currentPlaylistTracks.value = catalogTracks;
  }
  setTrack(track, false, true);
}

/**
 * 处理外部歌单加载事件，并启动带过期保护的异步加载。
 *
 * @param event - 携带平台、歌单 ID和自动播放标志的自定义事件。
 * @returns 无返回值；异步结果由 loadPlaylist 负责更新。
 */
function handleLoadPlaylist(event: Event): void {
  const detail = (event as CustomEvent<{
    source?: "netease" | "qq";
    playlistId?: string;
    autoPlay?: boolean;
  }>).detail;
  if (!detail?.source || !detail.playlistId) return;
  void loadPlaylist({
    source: detail.source,
    playlistId: detail.playlistId,
    autoPlay: detail.autoPlay,
  });
}

/**
 * 将播放器切换事件转交给播放状态方法。
 *
 * @returns 无返回值。
 */
function handleToggle(): void {
  void togglePlaying();
}

/**
 * 查找当前曲目在已加载歌单中的索引。
 *
 * @returns 当前曲目索引；找不到时返回 -1。
 */
function currentTrackIndex(): number {
  return currentPlaylistTracks.value.findIndex(
    (track) =>
      track.source === currentTrack.value.source &&
      track.playlistId === currentTrack.value.playlistId &&
      track.id === currentTrack.value.id,
  );
}

/**
 * 按相对方向切换歌单曲目，并处理随机和循环规则。
 *
 * @param direction - -1 表示上一首，1 表示下一首。
 * @returns 无返回值；没有可切换曲目时保持当前状态。
 */
function chooseRelativeTrack(direction: -1 | 1): void {
  const tracks = currentPlaylistTracks.value;
  if (!tracks.length) return;
  const index = currentTrackIndex();
  if (index < 0) {
    setTrack(tracks[0], isPlaying.value, true);
    return;
  }
  let nextIndex = index + direction;
  if (isShuffle.value && tracks.length > 1) {
    do {
      nextIndex = Math.floor(Math.random() * tracks.length);
    } while (nextIndex === index);
  } else if (nextIndex < 0 || nextIndex >= tracks.length) {
    if (repeatMode.value !== "all") return;
    nextIndex = (nextIndex + tracks.length) % tracks.length;
  }
  const next = tracks[nextIndex];
  if (next) setTrack(next, isPlaying.value, true);
}

/**
 * 处理上一首操作；播放超过三秒时先回到当前曲目开头。
 *
 * @returns 无返回值。
 */
function handlePrevious(): void {
  const audio = audioRef.value;
  if (audio && currentTime.value > 3) {
    audio.currentTime = 0;
    currentTime.value = 0;
    publishState();
    return;
  }
  chooseRelativeTrack(-1);
}

/**
 * 处理下一首操作。
 *
 * @returns 无返回值。
 */
function handleNext(): void {
  chooseRelativeTrack(1);
}

/**
 * 循环切换关闭、列表循环和单曲循环模式。
 *
 * @returns 无返回值；切换循环时会关闭随机播放。
 */
function handleRepeat(): void {
  isShuffle.value = false;
  repeatMode.value =
    repeatMode.value === "off"
      ? "all"
      : repeatMode.value === "all"
        ? "one"
        : "off";
  publishState();
}

/**
 * 切换随机播放模式。
 *
 * @returns 无返回值；开启随机播放时会关闭循环模式。
 */
function handleShuffle(): void {
  isShuffle.value = !isShuffle.value;
  if (isShuffle.value) repeatMode.value = "off";
  publishState();
}

/**
 * 将播放器外部模式事件转换为内部随机/循环状态。
 *
 * @param event - 携带播放模式的自定义事件。
 * @returns 无返回值；不支持的模式不会改变当前状态。
 */
function handlePlaybackMode(event: Event): void {
  const mode = (event as CustomEvent<MusicPlaybackMode>).detail;
  if (mode === "shuffle") {
    isShuffle.value = true;
    repeatMode.value = "off";
  } else if (mode === "one") {
    isShuffle.value = false;
    repeatMode.value = "one";
  } else if (mode === "sequential") {
    isShuffle.value = false;
    repeatMode.value = "off";
  } else {
    return;
  }
  publishState();
}

/**
 * 切换静音状态并同步原生 audio 元素。
 *
 * @returns 无返回值。
 */
function handleMute(): void {
  isMuted.value = !isMuted.value;
  const audio = audioRef.value;
  if (audio) audio.muted = isMuted.value;
  publishState();
}

/**
 * 将播放器进度移动到外部控件指定的时间点。
 *
 * @param event - 携带目标秒数的自定义事件。
 * @returns 无返回值；非法时间或未加载音频时直接忽略。
 */
function handleSeek(event: Event): void {
  const nextTime = Number((event as CustomEvent<number>).detail);
  if (!Number.isFinite(nextTime)) return;
  const audio = audioRef.value;
  if (!audio || !Number.isFinite(audio.duration)) return;
  audio.currentTime = Math.min(audio.duration, Math.max(0, nextTime));
  currentTime.value = audio.currentTime;
  publishState();
}

/**
 * 响应其他音乐控件的状态请求。
 *
 * @returns 无返回值；通过 publishState 重新广播当前状态。
 */
function handleRequestState(): void {
  publishState();
}

/**
 * 处理原生 audio 的播放事件。
 *
 * @returns 无返回值。
 */
function handleAudioPlay(): void {
  isPlaying.value = true;
  publishState();
}

/**
 * 处理原生 audio 的暂停事件。
 *
 * @returns 无返回值。
 */
function handleAudioPause(): void {
  isPlaying.value = false;
  publishState();
}

/**
 * 处理原生 audio 元数据加载完成事件并记录总时长。
 *
 * @returns 无返回值。
 */
function handleAudioLoadedMetadata(): void {
  const audio = audioRef.value;
  duration.value = audio && Number.isFinite(audio.duration) ? audio.duration : 0;
  publishState();
}

/**
 * 处理原生 audio 播放进度变化并广播当前时间。
 *
 * @returns 无返回值；无法读取有效时间时直接忽略。
 */
function handleAudioTimeUpdate(): void {
  const audio = audioRef.value;
  if (!audio || !Number.isFinite(audio.currentTime)) return;
  currentTime.value = audio.currentTime;
  if (Number.isFinite(audio.duration)) duration.value = audio.duration;
  publishState();
}

/**
 * 处理原生 audio 播放结束事件，并按当前模式决定重播、下一首或停止。
 *
 * @returns 无返回值；播放列表为空时只广播停止状态。
 */
function handleAudioEnded(): void {
  isPlaying.value = false;
  if (repeatMode.value === "one") {
    const current = currentPlaylistTracks.value[currentTrackIndex()];
    if (current) setTrack(current, true, false);
    else {
      syncAudio();
      void togglePlaying();
    }
    return;
  }
  const tracks = currentPlaylistTracks.value;
  const index = currentTrackIndex();
  let nextIndex = index + 1;
  if (isShuffle.value && tracks.length > 1) {
    do {
      nextIndex = Math.floor(Math.random() * tracks.length);
    } while (nextIndex === index);
  } else if (nextIndex >= tracks.length) {
    if (repeatMode.value !== "all") {
      publishState();
      return;
    }
    nextIndex = 0;
  }
  const next = tracks[nextIndex];
  if (next) setTrack(next, true, true);
  else publishState();
}

watch(
  () => props.track,
  (next) => {
    const isSameTrack =
      next.source === currentTrack.value.source &&
      next.playlistId === currentTrack.value.playlistId &&
      next.id === currentTrack.value.id &&
      next.title === currentTrack.value.title &&
      next.audioUrl === currentTrack.value.audioUrl;
    if (isSameTrack) return;
    playlistLoadToken += 1;
    currentTrack.value = { ...next };
    if (next.source === "netease" || next.source === "qq") {
      const catalogTracks = findPlaylistTracks(next.source, next.playlistId);
      currentPlaylistTracks.value = catalogTracks;
      currentPlaylistTitle.value =
        props.catalog.playlists.find(
          (playlist) => playlist.source === next.source && playlist.id === next.playlistId,
        )?.title ?? "";
    } else {
      currentPlaylistTracks.value = [];
      currentPlaylistTitle.value = "";
    }
    isPlaying.value = false;
    syncAudio();
    publishState();
  },
  { deep: true },
);

watch(
  () => props.catalog,
  () => {
    if (currentTrack.value.source !== "netease" && currentTrack.value.source !== "qq") {
      return;
    }
    const catalogTracks = findPlaylistTracks(
      currentTrack.value.source,
      currentTrack.value.playlistId,
    );
    if (catalogTracks.length && !currentPlaylistTracks.value.length) {
      currentPlaylistTracks.value = catalogTracks;
      currentPlaylistTitle.value =
        props.catalog.playlists.find(
          (playlist) =>
            playlist.source === currentTrack.value.source &&
            playlist.id === currentTrack.value.playlistId,
        )?.title ?? currentPlaylistTitle.value;
      publishState();
    }
  },
  { deep: true },
);

onMounted(() => {
  window.addEventListener("music-player-select-track", handleSelectTrack);
  window.addEventListener("music-player-load-playlist", handleLoadPlaylist);
  window.addEventListener("music-player-toggle", handleToggle);
  window.addEventListener("music-player-previous", handlePrevious);
  window.addEventListener("music-player-next", handleNext);
  window.addEventListener("music-player-repeat", handleRepeat);
  window.addEventListener("music-player-shuffle", handleShuffle);
  window.addEventListener("music-player-mode", handlePlaybackMode);
  window.addEventListener("music-player-mute", handleMute);
  window.addEventListener("music-player-seek", handleSeek);
  window.addEventListener("music-player-request-state", handleRequestState);
  currentPlaylistTracks.value =
    currentTrack.value.source === "netease" || currentTrack.value.source === "qq"
      ? findPlaylistTracks(currentTrack.value.source, currentTrack.value.playlistId)
      : [];
  syncAudio();
  publishState();
});

onBeforeUnmount(() => {
  window.removeEventListener("music-player-select-track", handleSelectTrack);
  window.removeEventListener("music-player-load-playlist", handleLoadPlaylist);
  window.removeEventListener("music-player-toggle", handleToggle);
  window.removeEventListener("music-player-previous", handlePrevious);
  window.removeEventListener("music-player-next", handleNext);
  window.removeEventListener("music-player-repeat", handleRepeat);
  window.removeEventListener("music-player-shuffle", handleShuffle);
  window.removeEventListener("music-player-mode", handlePlaybackMode);
  window.removeEventListener("music-player-mute", handleMute);
  window.removeEventListener("music-player-seek", handleSeek);
  window.removeEventListener("music-player-request-state", handleRequestState);
});
</script>

<template>
  <audio
    ref="audioRef"
    class="music-player-audio"
    preload="none"
    @play="handleAudioPlay"
    @pause="handleAudioPause"
    @loadedmetadata="handleAudioLoadedMetadata"
    @timeupdate="handleAudioTimeUpdate"
    @ended="handleAudioEnded"
  ></audio>
</template>

<style scoped>
.music-player-audio {
  display: none;
}
</style>
