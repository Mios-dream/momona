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

const getPlaybackMode = (): MusicPlaybackMode => {
  if (isShuffle.value) return "shuffle";
  if (repeatMode.value === "one") return "one";
  return "sequential";
};

interface LoadedPlaylist {
  title: string;
  tracks: MusicTrack[];
}

const toSong = (track: MusicSettings): PlayerSong => ({
  id: track.id,
  name: track.title,
  artist: track.artist,
  album: track.album,
  cover: track.cover,
  url: track.audioUrl,
  source: track.source,
  playlistId: track.playlistId,
});

const dispatchConfigChange = (): void => {
  if (typeof window === "undefined" || !props.editable) return;
  window.dispatchEvent(
    new CustomEvent("music-player-config-change", {
      detail: { ...currentTrack.value },
    }),
  );
};

const currentPlaylist = () =>
  props.catalog.playlists.find(
    (playlist) =>
      playlist.id === currentTrack.value.playlistId &&
      playlist.source === currentTrack.value.source,
  );

const publishState = (): void => {
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
};

const syncAudio = (): void => {
  const audio = audioRef.value;
  if (!audio) return;
  currentTime.value = 0;
  duration.value = 0;
  audio.volume = volume.value;
  audio.muted = isMuted.value;
  audio.src = currentTrack.value.audioUrl || "";
  audio.load();
};

const setTrack = (
  track: MusicTrack,
  autoPlay = false,
  persist = false,
): void => {
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
};

const findPlaylistTracks = (
  source: "netease" | "qq",
  playlistId: string,
): MusicTrack[] => {
  const playlist = props.catalog.playlists.find(
    (item) => item.source === source && item.id === playlistId,
  );
  return playlist?.tracks ?? [];
};

const loadPlaylistFromDevServer = async (
  source: "netease" | "qq",
  playlistId: string,
): Promise<LoadedPlaylist> => {
  if (!props.editable) return { title: "", tracks: [] };
  const response = await fetch(
    `/__momona/music-playlist?source=${encodeURIComponent(source)}&id=${encodeURIComponent(playlistId)}`,
  );
  const payload = (await response.json().catch(() => null)) as unknown;
  if (!response.ok) throw new Error("歌单读取失败");
  const result = normalizeMusicPlaylist(payload, source, playlistId);
  if (!result) throw new Error("歌单中没有可播放的曲目");
  return { title: result.playlistTitle, tracks: result.tracks };
};

const loadPlaylist = async (detail: {
  source: "netease" | "qq";
  playlistId: string;
  autoPlay?: boolean;
}): Promise<void> => {
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
};

const togglePlaying = async (): Promise<void> => {
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
};

const handleSelectTrack = (event: Event): void => {
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
};

const handleLoadPlaylist = (event: Event): void => {
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
};

const handleToggle = (): void => {
  void togglePlaying();
};

const currentTrackIndex = (): number =>
  currentPlaylistTracks.value.findIndex(
    (track) =>
      track.source === currentTrack.value.source &&
      track.playlistId === currentTrack.value.playlistId &&
      track.id === currentTrack.value.id,
  );

const chooseRelativeTrack = (direction: -1 | 1): void => {
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
};

const handlePrevious = (): void => {
  const audio = audioRef.value;
  if (audio && currentTime.value > 3) {
    audio.currentTime = 0;
    currentTime.value = 0;
    publishState();
    return;
  }
  chooseRelativeTrack(-1);
};

const handleNext = (): void => {
  chooseRelativeTrack(1);
};

const handleRepeat = (): void => {
  isShuffle.value = false;
  repeatMode.value =
    repeatMode.value === "off"
      ? "all"
      : repeatMode.value === "all"
        ? "one"
        : "off";
  publishState();
};

const handleShuffle = (): void => {
  isShuffle.value = !isShuffle.value;
  if (isShuffle.value) repeatMode.value = "off";
  publishState();
};

const handlePlaybackMode = (event: Event): void => {
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
};

const handleMute = (): void => {
  isMuted.value = !isMuted.value;
  const audio = audioRef.value;
  if (audio) audio.muted = isMuted.value;
  publishState();
};

const handleSeek = (event: Event): void => {
  const nextTime = Number((event as CustomEvent<number>).detail);
  if (!Number.isFinite(nextTime)) return;
  const audio = audioRef.value;
  if (!audio || !Number.isFinite(audio.duration)) return;
  audio.currentTime = Math.min(audio.duration, Math.max(0, nextTime));
  currentTime.value = audio.currentTime;
  publishState();
};

const handleRequestState = (): void => publishState();

const handleAudioPlay = (): void => {
  isPlaying.value = true;
  publishState();
};

const handleAudioPause = (): void => {
  isPlaying.value = false;
  publishState();
};

const handleAudioLoadedMetadata = (): void => {
  const audio = audioRef.value;
  duration.value = audio && Number.isFinite(audio.duration) ? audio.duration : 0;
  publishState();
};

const handleAudioTimeUpdate = (): void => {
  const audio = audioRef.value;
  if (!audio || !Number.isFinite(audio.currentTime)) return;
  currentTime.value = audio.currentTime;
  if (Number.isFinite(audio.duration)) duration.value = audio.duration;
  publishState();
};

const handleAudioEnded = (): void => {
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
};

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
