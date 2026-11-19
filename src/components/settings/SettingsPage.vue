<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type {
  DataSourceId,
  GitHubRepositoryScope,
  GitHubRepositorySort,
  HoyoGame,
  LocalConfig,
  ProviderStatus,
  SiteBackground,
  SiteData,
  SourceSnapshotInfo,
} from "../../data/types";
import {
  emptySourceSnapshotStatuses,
  settingsTabs,
  sourceCards,
  type SettingsTab,
} from "../../data/settings";
import { cloneLocalConfig, normalizeLocalConfig } from "../../data/localConfig";
import {
  selectedSourceContentLabel,
  sourceLabels,
} from "../../data/sourceCatalog";
import {
  musicPlatformLabel,
  musicResultToSettings,
  normalizeMusicPlaylist,
  parseMusicPlaylistReference,
} from "../../lib/music";
import { applyThemeColor } from "../../lib/theme";
import {
  loadWallpaperLibrary,
  wallpaperLabelOf,
  type WallpaperEntry,
} from "../../lib/wallpaper";
import {
  wallpaperModeOptions,
  wallpaperProviders,
  wallpaperRotateOptions,
} from "../../data/wallpapers";
import { showToast } from "../../lib/toast";
import {
  isThemePresetSelected,
  normalizeThemeColor,
  parseThemeColor,
  themePresets,
} from "../../data/theme";
import IconGlyph from "../app/IconGlyph.vue";
import SelectMenu from "../app/SelectMenu.vue";
import MoCheckbox from "../ui/MoCheckbox.vue";
import MoColor from "../ui/MoColor.vue";
import MoField from "../ui/MoField.vue";
import MoSegmented from "../ui/MoSegmented.vue";
import MoToggle from "../ui/MoToggle.vue";

interface Props {
  /** AppShell 提供的构建期配置。 */
  localConfig: LocalConfig;
  /** AppShell 提供的当前公开快照。 */
  siteData: SiteData;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  /** 保存完成后同步应用壳层，但不再重复发起一次保存请求。 */
  "config-change": [config: LocalConfig, persist?: boolean];
  /** 把未保存的背景草稿推给壳层即时预览；null 表示退回已保存配置。 */
  "background-preview": [background: SiteBackground | null];
}>();

const config = ref<LocalConfig>(
  cloneLocalConfig(normalizeLocalConfig(props.localConfig)),
);
const previewData = ref<SiteData | null>(props.siteData);
const activeTab = ref<SettingsTab>("profile");
const sourceBusy = ref<Record<DataSourceId, boolean>>({
  bangumi: false,
  bilibili: false,
  github: false,
  netease: false,
  qqmusic: false,
  steam: false,
  sfacg: false,
});
const gameBusy = ref(false);
const gameError = ref("");
const saveBusy = ref(false);
const syncError = ref<{ title: string; message: string } | null>(null);
const sourceSnapshotStatuses = ref<Record<DataSourceId, SourceSnapshotInfo>>(
  emptySourceSnapshotStatuses(),
);
type SourceFilter = "all" | "enabled" | "disabled";

/** 各控件统一走自建组件，选项集中在这里定义，模板只负责绑定。 */
const sourceFilterOptions: { value: SourceFilter; label: string }[] = [
  { value: "all", label: "全部" },
  { value: "enabled", label: "已启用" },
  { value: "disabled", label: "未启用" },
];
const repositoryScopeOptions: {
  value: GitHubRepositoryScope;
  label: string;
}[] = [
  { value: "all", label: "全部公开仓库" },
  { value: "pinned", label: "Pinned 仓库" },
];
const repositorySortOptions: {
  value: GitHubRepositorySort;
  label: string;
}[] = [
  { value: "updated", label: "最近更新" },
  { value: "stars", label: "Star 优先" },
  { value: "forks", label: "Fork 优先" },
  { value: "name", label: "名称排序" },
];
const refreshIntervalOptions: { value: number; label: string }[] = [
  { value: 6, label: "每 6 小时" },
  { value: 12, label: "每 12 小时" },
  { value: 24, label: "每天" },
];

const selectedSourceId = ref<DataSourceId>(sourceCards[0]?.id ?? "bangumi");
const sourceFilter = ref<SourceFilter>("all");
const sourceQuery = ref("");
const musicBusy = ref(false);
/** 主题色输入框里的原始文本，允许用户中途输入不完整的色值。 */
const themeDraft = ref(config.value.site.theme);
const musicError = ref("");
/**
 * Favicon 预览是否解码失败。
 *
 * 这个项目的 favicon.svg 里带 `@media (prefers-color-scheme)`，Chrome 把它当
 * `<img>` 加载时会解码失败。地址本身是合法的，所以不报错、只在预览位上退回图标，
 * 否则用户会看到一枚破图，还以为自己填错了。
 */
const faviconFailed = ref(false);
watch(
  () => config.value.site.favicon,
  () => {
    faviconFailed.value = false;
  },
);

/**
 * 列表末尾的「无图」项。
 *
 * 它不是一张图片，而是"只用底色"这一档配置（`image` 为空串），
 * 作为清空壁纸的出口放在最后，不必再单开一个按钮。
 */
const plainWallpaper = {
  id: "plain",
  label: "无图",
  image: "",
  swatch: "#e6e9f4",
  removable: false,
};

/** 壁纸目录扫描结果。 */
const folderWallpapers = ref<WallpaperEntry[]>([]);
/** 重新扫描期间禁用按钮，防止连点重复请求。 */
const folderScanning = ref(false);
/** 待加入壁纸库的地址。 */
const newWallpaperUrl = ref("");

/** 分段控件只吃 value/label，描述文字另外跟着选中项显示。 */
const wallpaperModeChoices = wallpaperModeOptions.map(({ value, label }) => ({
  value,
  label,
}));
/**
 * 壁纸列表：目录里的图片 + 手动添加的地址 + 「无图」。
 *
 * 三种来源放在同一个网格里——选中哪张、这张从哪来，不需要在两个区域之间
 * 对照着看。手动添加的项带删除按钮；目录项的增减由文件系统决定。
 */
const wallpaperChoices = computed(() => [
  ...folderWallpapers.value.map((entry) => ({
    id: entry.id,
    label: entry.label,
    image: entry.image,
    swatch: wallpaperThumb(entry.image),
    removable: false,
  })),
  ...config.value.site.background.pool
    .filter((image) => image.trim())
    .map((image, index) => ({
      id: `pool:${index}:${image}`,
      label: wallpaperLabelOf(image),
      image,
      swatch: wallpaperThumb(image),
      removable: true,
    })),
  plainWallpaper,
]);

/**
 * 壁纸库里可参与切换的张数。
 *
 * 只有一张时随机与轮换都不会有变化；这个数字用来在界面上提前说明，
 * 免得用户以为开关没生效。
 */
const wallpaperLibrarySize = computed(() => {
  const background = config.value.site.background;
  return (
    folderWallpapers.value.length +
    background.pool.filter((entry) => entry.trim()).length +
    background.remoteSources.length +
    (background.remoteCustom.trim() ? 1 : 0)
  );
});

/**
 * 把壁纸值转成缩略图的 background 简写。
 *
 * @param image - 壁纸绘制值。
 * @returns 可直接绑定的 background 值。
 */
function wallpaperThumb(image: string): string {
  const value = image.trim();
  if (!value) return "transparent";
  if (/gradient\(/.test(value)) return value;
  return `url("${value}") center / cover`;
}

/**
 * 扫描壁纸目录。
 *
 * @param force - 为 true 时忽略缓存，向开发服务器要一次实时结果。
 * @returns 扫描结束后兑现的 Promise。
 */
async function scanWallpapers(force = false): Promise<void> {
  folderScanning.value = true;
  try {
    folderWallpapers.value = await loadWallpaperLibrary(force);
    // 重扫之后让壳层的候选池同步跟上，否则新图要刷新页面才会参与轮换。
    if (force) window.dispatchEvent(new Event("momona-wallpaper-refresh"));
  } finally {
    folderScanning.value = false;
  }
}

/**
 * 把输入框里的地址加进壁纸库，并立刻切到这张。
 *
 * 只入列不选中会让人以为没加进去——尤其当前是"固定"模式时，页面上什么都不变。
 *
 * @returns 无返回值；空值或重复地址会被忽略。
 */
function addWallpaperToPool(): void {
  const value = newWallpaperUrl.value.trim();
  if (!value) return;
  const background = config.value.site.background;
  if (background.pool.includes(value)) {
    showToast("这张壁纸已经在壁纸库里了");
    return;
  }
  background.pool = [...background.pool, value];
  background.image = value;
  newWallpaperUrl.value = "";
}

/**
 * 从壁纸库移除一条地址。
 *
 * @param image - 需要移除的壁纸值。
 * @returns 无返回值。
 */
function removeWallpaperFromPool(image: string): void {
  const background = config.value.site.background;
  background.pool = background.pool.filter((entry) => entry !== image);
  // 删掉的正好是当前这张：换回目录里的第一张，避免"背景还画着、列表里却没有"。
  if (background.image.trim() === image.trim()) {
    background.image = folderWallpapers.value[0]?.image ?? "";
  }
}

/**
 * 开关一个网络图源。
 *
 * @param id - 图源标识。
 * @param enabled - 是否启用。
 * @returns 无返回值。
 */
function toggleRemoteSource(id: string, enabled: boolean): void {
  const next = new Set(config.value.site.background.remoteSources);
  if (enabled) next.add(id);
  else next.delete(id);
  config.value.site.background.remoteSources = [...next];
}

/**
 * 让壳层立刻换一张壁纸。
 *
 * 草稿还没保存，不能靠改配置触发；广播一个事件，壳层收到就从候选池里挑下一张。
 *
 * @returns 无返回值。
 */
function shuffleWallpaper(): void {
  window.dispatchEvent(new Event("momona-wallpaper-shuffle"));
}

/** 遮罩与饱和度在界面上用百分比表达，配置里存 0–1 的小数。 */
const overlayPercent = computed({
  get: () => Math.round(config.value.site.background.overlay * 100),
  set: (value: number) => {
    config.value.site.background.overlay = value / 100;
  },
});
const saturatePercent = computed({
  get: () => Math.round(config.value.site.background.saturate * 100),
  set: (value: number) => {
    config.value.site.background.saturate = value / 100;
  },
});

/** 配置是否与已保存版本不同；只用来提示，不禁用保存按钮。 */
const dirty = computed(
  () =>
    JSON.stringify(config.value) !==
    JSON.stringify(normalizeLocalConfig(props.localConfig)),
);

/**
 * 背景参数一变就推给壳层，未保存也能看到真实效果。
 *
 * 背景不适合"先保存再预览"：它影响整页明度，用户必须一边调一边看。
 */
watch(
  () => config.value.site.background,
  (background) => emit("background-preview", { ...background }),
  { deep: true, immediate: true },
);

const providerStatuses = computed(
  () => previewData.value?.providerStatus ?? [],
);
const anySourceBusy = computed(() =>
  Object.values(sourceBusy.value).some(Boolean),
);
const anyBusy = computed(
  () =>
    anySourceBusy.value || saveBusy.value || gameBusy.value || musicBusy.value,
);
const gameWidget = computed(() =>
  config.value.widgets.find((widget) => widget.type === "game"),
);
const gameSettings = computed(() => gameWidget.value?.settings?.game);
const gameName = computed(
  () =>
    ({ genshin: "原神", hsr: "崩坏：星穹铁道", zzz: "绝区零" })[
      gameSettings.value?.game ?? "hsr"
    ],
);
const selectedSource = computed(() =>
  selectedSourceId.value
    ? sourceCards.find((source) => source.id === selectedSourceId.value)
    : undefined,
);
const visibleSourceCards = computed(() => {
  const query = sourceQuery.value.trim().toLocaleLowerCase();
  return sourceCards.filter((source) => {
    const sourceConfig = config.value.sources[source.id];
    if (sourceFilter.value === "enabled" && !sourceConfig.enabled) return false;
    if (sourceFilter.value === "disabled" && sourceConfig.enabled) return false;
    if (!query) return true;
    return `${source.title} ${source.description}`
      .toLocaleLowerCase()
      .includes(query);
  });
});
watch(visibleSourceCards, (sources) => {
  if (
    sources.length &&
    !sources.some((source) => source.id === selectedSourceId.value)
  ) {
    selectSource(sources[0].id);
  }
});
const statusRows = computed(() =>
  sourceCards.map((source) => ({
    id: source.id,
    label: source.title,
    status: statusFor(source.id),
  })),
);
const snapshotTime = computed(() => {
  const value = previewData.value?.generatedAt;
  if (!value) return "尚未写入页面快照";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("zh-CN", { hour12: false });
});
function selectedAdapterCountFor(sourceId: DataSourceId): number {
  const source = sourceCards.find((item) => item.id === sourceId);
  if (!source) return 0;
  return source.contentOptions.filter(
    (option) => config.value.sources[sourceId].content[option.key] === true,
  ).length;
}

function adapterLabel(sourceId: DataSourceId): string {
  const value = selectedSourceContentLabel(
    sourceId,
    config.value.sources[sourceId].content,
  );
  return value || "未选择适配内容";
}

async function requestJson<T>(path: string, body?: unknown): Promise<T> {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST",
    headers:
      body === undefined ? undefined : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const payload = (await response.json().catch(() => null)) as {
    message?: string;
  } | null;
  if (!response.ok) throw new Error(payload?.message || "本地数据服务不可用");
  return payload as T;
}

async function refreshSourceStatus(): Promise<void> {
  try {
    const payload = await requestJson<{ sources?: SourceSnapshotInfo[] }>(
      "/__momona/source-status",
    );
    const next = emptySourceSnapshotStatuses();
    for (const status of payload.sources ?? []) next[status.sourceId] = status;
    sourceSnapshotStatuses.value = next;
  } catch {
    // 静态构建中没有本地快照接口，保留空状态。
  }
}

function selectSource(sourceId: DataSourceId): void {
  selectedSourceId.value = sourceId;
}

function sourceSnapshotText(status: SourceSnapshotInfo): string {
  if (status.state === "success") return "已就绪";
  if (status.state === "error") return "同步失败";
  if (status.state === "cleared") return "待同步";
  return "尚未同步";
}

function sourceSnapshotClass(status: SourceSnapshotInfo): string {
  return `is-${status.state}`;
}

async function loadInitialState(): Promise<void> {
  try {
    const payload = await requestJson<{ config?: LocalConfig }>(
      "/__momona/config",
    );
    if (payload.config) {
      config.value = normalizeLocalConfig(payload.config);
      selectedSourceId.value =
        sourceCards.find((source) => config.value.sources[source.id].enabled)
          ?.id ??
        sourceCards[0]?.id ??
        "bangumi";
    }
  } catch {
    // 静态构建中没有本地配置接口，继续使用构建时配置。
  }

  try {
    const payload = await requestJson<{ siteData?: SiteData }>(
      "/__momona/snapshot",
    );
    if (payload.siteData) previewData.value = payload.siteData;
  } catch {
    // 静态构建中没有本地快照接口。
  }

  await refreshSourceStatus();
}

onMounted(() => {
  void loadInitialState();
  void scanWallpapers();
});

/**
 * 选中一个主题色：写入配置并立即预览。
 *
 * @param value - 预设色值或颜色选择器返回的色值。
 * @returns 无返回值；无法解析的输入会被忽略。
 */
function selectTheme(value: string): void {
  const next = parseThemeColor(value);
  if (!next) {
    themeDraft.value = config.value.site.theme;
    return;
  }
  config.value.site.theme = next;
  themeDraft.value = next;
  applyThemeColor(next);
}

/**
 * 处理主题色文本框输入；只有解析成功时才实时预览。
 *
 * @param event - 文本框的输入事件。
 * @returns 无返回值；输错时不改动当前主题色。
 */
function handleThemeInput(event: Event): void {
  const raw = (event.target as HTMLInputElement).value;
  themeDraft.value = raw;
  const parsed = parseThemeColor(raw);
  if (!parsed) return;
  config.value.site.theme = parsed;
  applyThemeColor(parsed);
}

/** 结束输入时把文本框收敛为规范色值，避免留下半截内容。 */
function commitThemeDraft(): void {
  selectTheme(themeDraft.value);
}

/** 离开设置页时把预览用的临时颜色还原为已保存的颜色。 */
onBeforeUnmount(() => {
  applyThemeColor(props.localConfig.site.theme);
  emit("background-preview", null);
});

function closeSyncError(): void {
  syncError.value = null;
}

function showSyncError(title: string, error: unknown): void {
  syncError.value = {
    title,
    message: String(error instanceof Error ? error.message : error),
  };
}

function cachePreview(siteData: SiteData): SiteData {
  previewData.value = siteData;
  return siteData;
}

async function loadMusicPlaylist(): Promise<void> {
  if (musicBusy.value) return;
  const parsed = parseMusicPlaylistReference(
    config.value.music.source,
    config.value.music.playlistId,
  );
  if (!parsed) {
    musicError.value = "请输入有效的歌单 ID 或歌单链接";
    return;
  }
  musicBusy.value = true;
  musicError.value = "";
  try {
    const payload = await requestJson<unknown>(
      `/__momona/music-playlist?source=${encodeURIComponent(parsed.platform)}&id=${encodeURIComponent(parsed.playlistId)}`,
    );
    const result = normalizeMusicPlaylist(
      payload,
      parsed.platform,
      parsed.playlistId,
    );
    if (!result) throw new Error("歌单中没有可展示的曲目");
    config.value.music = musicResultToSettings(result, config.value.music);
    showToast(
      `${musicPlatformLabel(result.platform)}歌单已读取：${result.track.title}`,
      "success",
      undefined,
      "music",
    );
  } catch (error) {
    musicError.value = String(error instanceof Error ? error.message : error);
    showToast("音乐歌单读取失败", "error", undefined, "music");
  } finally {
    musicBusy.value = false;
  }
}

function updateGameWidget(patch: {
  uid?: string;
  game?: HoyoGame;
  account?: NonNullable<
    NonNullable<LocalConfig["widgets"][number]["settings"]>["game"]
  >["account"];
}): void {
  const widget = gameWidget.value;
  if (!widget || !widget.settings?.game) return;
  config.value.widgets = config.value.widgets.map((item) =>
    item.id === widget.id
      ? {
          ...item,
          settings: {
            ...item.settings,
            game: { ...item.settings?.game, ...patch },
          },
        }
      : item,
  );
}

async function syncGameAccount(): Promise<void> {
  const current = gameSettings.value;
  if (!current?.uid.trim() || gameBusy.value) return;
  gameBusy.value = true;
  gameError.value = "";
  try {
    const result = await requestJson<{
      account?: NonNullable<typeof current>["account"];
      message?: string;
    }>("/__momona/sync-game", {
      uid: current.uid,
      game: current.game ?? "hsr",
    });
    if (!result.account)
      throw new Error(result.message || "账号数据暂时无法读取");
    updateGameWidget({ account: result.account });
    showToast(
      `${gameName.value}账号已读取：${result.account.nickname}`,
      "success",
      undefined,
      "game",
    );
  } catch (error) {
    gameError.value = String(error instanceof Error ? error.message : error);
    showToast("游戏账号读取失败", "error", undefined, "game");
  } finally {
    gameBusy.value = false;
  }
}

async function saveSiteSnapshot(): Promise<SiteData> {
  const result = await requestJson<{ siteData: SiteData }>("/__momona/save", {
    config: config.value,
  });
  return cachePreview(result.siteData);
}

async function saveSettings(): Promise<void> {
  saveBusy.value = true;
  closeSyncError();
  showToast("正在保存本地设置", "neutral");
  try {
    const data = await saveSiteSnapshot();
    emit("config-change", cloneLocalConfig(config.value), false);
    showToast(`已保存 · ${data.libraryTiles.length} 个资料项`, "success");
  } catch (error) {
    showToast(
      `保存失败：${String(error instanceof Error ? error.message : error)}`,
      "error",
    );
    showSyncError("保存设置失败", error);
  } finally {
    saveBusy.value = false;
  }
}

async function syncSource(sourceId: DataSourceId): Promise<void> {
  if (sourceBusy.value[sourceId]) return;
  sourceBusy.value[sourceId] = true;
  closeSyncError();
  const source = sourceCards.find((item) => item.id === sourceId);
  showToast(
    `正在同步 ${source?.title ?? sourceLabels[sourceId]}`,
    "neutral",
    undefined,
    "sync",
  );
  try {
    const result = await requestJson<{
      siteData: SiteData;
      sourceStatus: ProviderStatus;
    }>("/__momona/sync-source", { config: config.value, sourceId });
    const status = result.sourceStatus;
    cachePreview(result.siteData);
    showToast(
      status.status === "error"
        ? `${source?.title ?? sourceLabels[sourceId]} 同步失败；旧数据已保留`
        : `${source?.title ?? sourceLabels[sourceId]} 已同步 · ${status.count} 项`,
      status.status === "error" ? "error" : "success",
      undefined,
      "sync",
    );
    if (status.status === "error") {
      showSyncError(
        `${source?.title ?? sourceLabels[sourceId]} 同步失败`,
        status.message,
      );
    }
  } catch (error) {
    showToast(
      `${source?.title ?? sourceLabels[sourceId]} 请求失败`,
      "error",
      undefined,
      "sync",
    );
    showSyncError(`${source?.title ?? sourceLabels[sourceId]} 同步失败`, error);
  } finally {
    sourceBusy.value[sourceId] = false;
    await refreshSourceStatus();
  }
}

function downloadJson(filename: string, value: unknown): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

function exportConfig(): void {
  const exportedConfig = cloneLocalConfig(config.value);
  for (const source of Object.values(exportedConfig.sources)) source.token = "";
  downloadJson("momona.config.json", {
    ...exportedConfig,
    siteData: previewData.value,
  });
  showToast("配置文件已导出", "success");
}

function statusFor(id: DataSourceId): ProviderStatus | undefined {
  return providerStatuses.value.find((status) => status.id === id);
}

function statusText(status?: ProviderStatus): string {
  if (!status) return "尚未同步";
  return {
    success: "已同步",
    skipped: "未启用",
    error: "同步失败",
  }[status.status];
}

function statusClass(status?: ProviderStatus): string {
  return `is-${status?.status ?? "unknown"}`;
}
</script>

<template>
  <div class="settings-page">
    <!--
      整个设置页是一扇窗：标题、分类、保存都在同一条窗框里。
      内容区不再有自己的卡片，只在窗内划线和留白——窗是唯一浮起来的物体。
    -->
    <section class="settings-window">
      <header class="settings-window-head">
        <h1 class="settings-window-title">设置</h1>

        <nav class="settings-nav" role="tablist" aria-label="设置分类">
          <button
            v-for="tab in settingsTabs"
            :id="`settings-tab-${tab.id}`"
            :key="tab.id"
            type="button"
            role="tab"
            :aria-selected="activeTab === tab.id"
            :aria-controls="`settings-panel-${tab.id}`"
            :class="[
              'settings-nav-item',
              { 'is-active': activeTab === tab.id },
            ]"
            @click="activeTab = tab.id"
          >
            <IconGlyph :name="tab.icon" :size="15" />
            <span>{{ tab.label }}</span>
          </button>
        </nav>

        <div class="settings-window-actions">
          <span v-if="dirty" class="settings-unsaved">未保存</span>
          <button
            type="button"
            class="m-btn m-btn--primary settings-save"
            :disabled="anyBusy"
            @click="saveSettings"
          >
            <IconGlyph name="save" :size="14" />{{
              saveBusy ? "保存中" : "保存"
            }}
          </button>
        </div>
      </header>

      <Transition name="settings-view" mode="out-in">
        <section
          v-if="activeTab === 'profile'"
          id="settings-panel-profile"
          key="profile"
          class="settings-view is-split"
          role="tabpanel"
          aria-labelledby="settings-tab-profile"
        >
          <!--
            每个分类都是"左改右看"：左边这一类的设置项，右边这一类的成品。
            预览各自独立，所以页面组看到的是站点名片，主题色组看到的是按钮和文字，
            资料组看到的是个人名片。
          -->
          <section class="settings-group">
            <h2 class="settings-group-title">页面</h2>
            <div class="settings-group-split">
              <div class="settings-group-form">
                <div class="settings-row">
                  <span class="settings-row-label">站点</span>
                  <!-- 标题和图标都是"这个站点叫什么、长什么样"，同一行两列。 -->
                  <div class="settings-row-body is-pair">
                    <MoField
                      v-model="config.site.title"
                      label="标题"
                      aria-label="网站标题"
                      placeholder="Love on the page"
                    />
                    <MoField
                      v-model="config.site.favicon"
                      label="图标"
                      type="url"
                      aria-label="Favicon 地址"
                      placeholder="/favicon.svg"
                    />
                  </div>
                </div>
                <div class="settings-row is-top">
                  <span class="settings-row-label">描述</span>
                  <div class="settings-row-body">
                    <MoField
                      v-model="config.site.description"
                      aria-label="网站描述"
                      multiline
                      :rows="2"
                    />
                  </div>
                </div>
              </div>

              <aside class="settings-group-preview" aria-hidden="true">
                <!--
                  站点名片，不是缩小版的页面。
                  套一个浏览器窗口去放这段描述，等于告诉人"这是页面正文"；
                  名片上只有三样东西：图标、站名、一句介绍——描述在这里是简介，
                  不是内容。卡片高度跟着内容走，不跟设置列拉平。
                -->
                <div class="settings-card">
                  <span class="settings-card-mark">
                    <img
                      v-if="config.site.favicon && !faviconFailed"
                      :src="config.site.favicon"
                      alt=""
                      @error="faviconFailed = true"
                    /><IconGlyph v-else name="globe" :size="16" />
                  </span>
                  <p class="settings-card-name">
                    {{ config.site.title || "未命名站点" }}
                  </p>
                  <p class="settings-card-note is-brief">
                    {{ config.site.description || "还没有描述" }}
                  </p>
                </div>
              </aside>
            </div>
          </section>

          <section class="settings-group">
            <h2 class="settings-group-title">个人资料</h2>
            <div class="settings-group-split">
              <div class="settings-group-form">
                <div class="settings-row">
                  <span class="settings-row-label">头像</span>
                  <div class="settings-row-body">
                    <MoField
                      v-model="config.account.avatar"
                      type="url"
                      aria-label="头像地址"
                      placeholder="/assets/avatar.jpg"
                    />
                  </div>
                </div>
                <div class="settings-row">
                  <span class="settings-row-label">名字</span>
                  <!-- 昵称和英文名是一对：同一行两列，行高不为一句话翻倍。 -->
                  <div class="settings-row-body is-pair">
                    <MoField
                      v-model="config.account.name"
                      label="昵称"
                      aria-label="昵称"
                      placeholder="三三 sama"
                    />
                    <MoField
                      v-model="config.account.latinName"
                      label="英文名"
                      aria-label="英文名 / 用户名"
                      placeholder="@miosdream"
                    />
                  </div>
                </div>
                <div class="settings-row">
                  <span class="settings-row-label">签名</span>
                  <div class="settings-row-body">
                    <MoField v-model="config.account.motto" aria-label="签名" />
                  </div>
                </div>
              </div>

              <aside class="settings-group-preview" aria-hidden="true">
                <!-- 同一套名片语言：头像、名字、账号、签名，一件不多。 -->
                <div class="settings-card">
                  <span class="settings-card-mark is-round">
                    <img
                      v-if="config.account.avatar"
                      :src="config.account.avatar"
                      alt=""
                    /><IconGlyph v-else name="user" :size="16" />
                  </span>
                  <p class="settings-card-name">
                    {{ config.account.name || "未命名" }}
                  </p>
                  <p class="settings-card-handle">
                    {{ config.account.latinName || "@username" }}
                  </p>
                  <p class="settings-card-note">
                    {{ config.account.motto || "还没有签名" }}
                  </p>
                </div>
              </aside>
            </div>
          </section>
        </section>

        <section
          v-else-if="activeTab === 'appearance'"
          id="settings-panel-appearance"
          key="appearance"
          class="settings-view is-split is-appearance"
          role="tabpanel"
          aria-labelledby="settings-tab-appearance"
        >
          <section class="settings-group">
            <h2 class="settings-group-title">壁纸</h2>
            <!--
              选择：目录图片、手动添加的地址和「无图」排在同一个网格里。
              当前用的是哪张、这张从哪来，一眼就能对上，不必在两处列表之间对照。
            -->
            <div class="settings-row is-top">
              <span class="settings-row-label">选择</span>
              <div class="settings-row-body is-wrap">
                <div
                  class="settings-wallpaper-grid"
                  role="group"
                  aria-label="壁纸列表"
                >
                  <div
                    v-for="entry in wallpaperChoices"
                    :key="entry.id"
                    class="settings-wallpaper"
                    :class="{
                      'is-active': config.site.background.image === entry.image,
                    }"
                  >
                    <button
                      type="button"
                      class="settings-wallpaper-pick"
                      :aria-pressed="
                        config.site.background.image === entry.image
                      "
                      :title="entry.image || '只用底色'"
                      @click="config.site.background.image = entry.image"
                    >
                      <span
                        class="settings-wallpaper-thumb"
                        :style="{ background: entry.swatch }"
                        aria-hidden="true"
                      ></span>
                      <span class="settings-wallpaper-name">{{
                        entry.label
                      }}</span>
                    </button>
                    <button
                      v-if="entry.removable"
                      type="button"
                      class="settings-wallpaper-delete"
                      :aria-label="`从壁纸库移除 ${entry.label}`"
                      @click="removeWallpaperFromPool(entry.image)"
                    >
                      <IconGlyph name="x" :size="12" :stroke-width="2.4" />
                    </button>
                  </div>
                </div>
                <!-- 目录是新增壁纸的入口：图片丢进 public/wallpapers，扫描后就会出现。 -->
                <p class="settings-wallpaper-note">
                  <span>
                    <code>public/wallpapers</code>
                    · {{ folderWallpapers.length }} 张
                  </span>
                  <button
                    type="button"
                    class="m-btn m-btn--ghost settings-wallpaper-scan"
                    :disabled="folderScanning"
                    @click="scanWallpapers(true)"
                  >
                    {{ folderScanning ? "扫描中…" : "重新扫描" }}
                  </button>
                </p>
              </div>
            </div>
            <div class="settings-row is-top">
              <span class="settings-row-label">添加</span>
              <div class="settings-row-body is-wrap">
                <div class="settings-wallpaper-add">
                  <MoField
                    v-model="newWallpaperUrl"
                    aria-label="要添加的壁纸地址"
                    placeholder="https://… 或 /wallpapers/x.webp"
                    @keyup.enter="addWallpaperToPool"
                  />
                  <button
                    type="button"
                    class="m-btn m-btn--secondary settings-wallpaper-add-button"
                    @click="addWallpaperToPool"
                  >
                    添加
                  </button>
                </div>
              </div>
            </div>
            <div class="settings-row is-top">
              <span class="settings-row-label">切换</span>
              <div class="settings-row-body is-wrap">
                <div class="settings-wallpaper-switch">
                  <MoSegmented
                    v-model="config.site.background.mode"
                    class="settings-wallpaper-mode"
                    :options="wallpaperModeChoices"
                    aria-label="壁纸切换方式"
                  />
                  <SelectMenu
                    v-if="config.site.background.mode === 'rotate'"
                    v-model="config.site.background.rotateMinutes"
                    class="settings-wallpaper-interval"
                    aria-label="壁纸轮换间隔"
                    :options="wallpaperRotateOptions"
                    :menu-min-width="140"
                  />
                  <button
                    v-if="config.site.background.mode !== 'fixed'"
                    type="button"
                    class="m-btn m-btn--ghost settings-wallpaper-shuffle"
                    :disabled="wallpaperLibrarySize < 2"
                    :title="
                      wallpaperLibrarySize < 2
                        ? `壁纸库里只有 ${wallpaperLibrarySize} 张，换不出新图`
                        : '从壁纸库里换一张'
                    "
                    @click="shuffleWallpaper"
                  >
                    <IconGlyph name="shuffle" :size="13" />
                    换一张
                  </button>
                </div>
              </div>
            </div>
            <div class="settings-row is-top">
              <span class="settings-row-label">网络图源</span>
              <div class="settings-row-body is-wrap">
                <div
                  class="settings-provider-grid"
                  role="group"
                  aria-label="网络图源"
                >
                  <MoCheckbox
                    v-for="provider in wallpaperProviders"
                    :key="provider.id"
                    :model-value="
                      config.site.background.remoteSources.includes(provider.id)
                    "
                    :label="provider.label"
                    :description="provider.description"
                    @update:model-value="
                      toggleRemoteSource(provider.id, $event)
                    "
                  />
                </div>
                <MoField
                  v-model="config.site.background.remoteCustom"
                  class="settings-wallpaper-field"
                  aria-label="自定义网络图源"
                  placeholder="自定义随机图接口，例如 https://…"
                />
              </div>
            </div>
          </section>

          <section class="settings-group">
            <h2 class="settings-group-title">画面</h2>
            <div class="settings-row">
              <span class="settings-row-label">遮罩浓度</span>
              <div class="settings-row-body">
                <input
                  v-model.number="overlayPercent"
                  class="settings-range"
                  type="range"
                  min="0"
                  max="80"
                  step="2"
                  aria-label="背景遮罩浓度"
                  :style="{ '--fill': `${(overlayPercent / 80) * 100}%` }"
                />
                <output class="settings-range-value"
                  >{{ overlayPercent }}%</output
                >
              </div>
            </div>
            <div class="settings-row">
              <span class="settings-row-label">模糊</span>
              <div class="settings-row-body">
                <input
                  v-model.number="config.site.background.blur"
                  class="settings-range"
                  type="range"
                  min="0"
                  max="24"
                  step="1"
                  aria-label="背景模糊半径"
                  :style="{
                    '--fill': `${(config.site.background.blur / 24) * 100}%`,
                  }"
                />
                <output class="settings-range-value"
                  >{{ config.site.background.blur }}px</output
                >
              </div>
            </div>
            <div class="settings-row">
              <span class="settings-row-label">饱和度</span>
              <div class="settings-row-body">
                <input
                  v-model.number="saturatePercent"
                  class="settings-range"
                  type="range"
                  min="30"
                  max="140"
                  step="2"
                  aria-label="背景饱和度"
                  :style="{
                    '--fill': `${((saturatePercent - 30) / 110) * 100}%`,
                  }"
                />
                <output class="settings-range-value"
                  >{{ saturatePercent }}%</output
                >
              </div>
            </div>
            <div class="settings-row">
              <span class="settings-row-label">视差</span>
              <div class="settings-row-body is-between">
                <span class="settings-row-hint">壁纸随指针与滚动微量位移</span>
                <MoToggle
                  v-model="config.site.background.parallax"
                  aria-label="启用背景视差"
                />
              </div>
            </div>
          </section>

          <section class="settings-group">
            <h2 class="settings-group-title">主题色</h2>
            <div class="settings-group-split">
              <div class="settings-group-form">
                <div class="settings-row is-top">
                  <span class="settings-row-label">强调色</span>
                  <!--
                    一条色带：预设是平涂的色片，选中的那个靠"撤掉墨线 + 外环"
                    表达，不靠彩色发光；最右是当前值的自定义位与它的色值。
                  -->
                  <div class="settings-row-body is-wrap">
                    <div class="settings-theme-bar">
                      <div
                        class="settings-theme-swatches"
                        role="group"
                        aria-label="主题色预设"
                      >
                        <button
                          v-for="preset in themePresets"
                          :key="preset.id"
                          type="button"
                          class="settings-theme-swatch"
                          :class="{
                            'is-active': isThemePresetSelected(
                              config.site.theme,
                              preset,
                            ),
                          }"
                          :style="{ background: preset.value }"
                          :aria-pressed="
                            isThemePresetSelected(config.site.theme, preset)
                          "
                          :aria-label="preset.label"
                          :title="`${preset.label} ${preset.value}`"
                          @click="selectTheme(preset.value)"
                        ></button>
                      </div>
                      <span class="settings-theme-divider" aria-hidden="true"></span>
                      <!-- 色点 + 色值：这两样是同一个值的两种写法，不该被读成第六个选项。 -->
                      <div class="settings-theme-value">
                        <MoColor
                          :model-value="config.site.theme"
                          aria-label="自定义主题色"
                          @update:model-value="selectTheme"
                        />
                        <input
                          class="settings-theme-code"
                          type="text"
                          :value="themeDraft"
                          aria-label="主题色色值"
                          placeholder="#fb7299"
                          spellcheck="false"
                          @input="handleThemeInput"
                          @change="commitThemeDraft"
                          @blur="commitThemeDraft"
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              <aside class="settings-group-preview" aria-hidden="true">
                <div class="settings-card is-accent">
                  <!--
                    三种落地强度排在一起：浅底标签、文字链接、实色按钮。
                    从左到右越来越重，看的人一眼就知道这个颜色能压到多重。
                  -->
                  <div class="settings-accent">
                    <span class="settings-accent-chip">标签</span>
                    <span class="settings-accent-link">正文链接</span>
                    <span class="settings-accent-button">主按钮</span>
                  </div>
                </div>
              </aside>
            </div>
          </section>

        </section>

        <section
          v-else-if="activeTab === 'data'"
          id="settings-panel-data"
          key="data"
          class="settings-view"
          role="tabpanel"
          aria-labelledby="settings-tab-data"
        >
          <div class="settings-source-workspace">
            <aside class="settings-source-index" aria-label="数据来源列表">
              <header class="settings-source-index-head">
                <h2 class="settings-group-title">数据来源</h2>
              </header>
              <label class="settings-source-search">
                <IconGlyph name="search" :size="14" />
                <input
                  v-model.trim="sourceQuery"
                  type="search"
                  aria-label="搜索数据来源"
                  placeholder="搜索平台"
                />
              </label>
              <MoSegmented
                v-model="sourceFilter"
                class="settings-source-filters"
                :options="sourceFilterOptions"
                aria-label="来源筛选"
              />
              <div
                v-if="visibleSourceCards.length"
                class="settings-source-list"
              >
                <article
                  v-for="source in visibleSourceCards"
                  :key="source.id"
                  :class="[
                    'settings-source-list-item',
                    {
                      'is-selected': selectedSourceId === source.id,
                      'is-disabled': !config.sources[source.id].enabled,
                    },
                  ]"
                >
                  <button
                    type="button"
                    class="settings-source-select"
                    :aria-pressed="selectedSourceId === source.id"
                    @click="selectSource(source.id)"
                  >
                    <span class="settings-source-icon"
                      ><IconGlyph :name="source.icon" :size="15"
                    /></span>
                    <span class="settings-source-select-copy"
                      ><strong>{{ source.title }}</strong
                      ><small>{{
                        adapterLabel(source.id) || source.description
                      }}</small></span
                    >
                    <span
                      :class="[
                        'settings-source-list-status',
                        sourceSnapshotClass(sourceSnapshotStatuses[source.id]),
                      ]"
                      :title="
                        sourceSnapshotText(sourceSnapshotStatuses[source.id])
                      "
                      ><i></i
                      ><em>{{
                        sourceSnapshotText(sourceSnapshotStatuses[source.id])
                      }}</em></span
                    >
                  </button>
                  <span class="settings-source-list-switch" @click.stop>
                    <MoToggle
                      v-model="config.sources[source.id].enabled"
                      size="sm"
                      :aria-label="`启用 ${source.title}`"
                    />
                  </span>
                </article>
              </div>
              <p v-else class="settings-source-list-empty">
                没有匹配的数据来源。
              </p>
            </aside>

            <section
              v-if="selectedSource"
              class="settings-source-detail"
              aria-live="polite"
            >
              <header class="settings-source-detail-head">
                <div class="settings-source-detail-title">
                  <span class="settings-source-icon"
                    ><IconGlyph :name="selectedSource.icon" :size="16"
                  /></span>
                  <h2>{{ selectedSource.title }}</h2>
                </div>
                <span
                  :class="[
                    'settings-source-status',
                    statusClass(statusFor(selectedSource.id)),
                  ]"
                  ><i></i>{{ statusText(statusFor(selectedSource.id))
                  }}<small v-if="statusFor(selectedSource.id)"
                    >· {{ statusFor(selectedSource.id)?.count }} 项</small
                  ></span
                >
              </header>

              <div class="settings-source-fields">
                <MoField
                  v-model="
                    config.sources[selectedSource.id][selectedSource.accountKey]
                  "
                  :label="selectedSource.accountLabel"
                  :placeholder="selectedSource.placeholder"
                />
                <MoField
                  v-model="config.sources[selectedSource.id].limit"
                  label="同步数量上限"
                  type="number"
                  :min="1"
                  :max="120"
                />
                <MoField
                  v-if="selectedSource.token"
                  v-model="config.sources[selectedSource.id].token"
                  class="settings-field-wide"
                  label="Token（仅本地）"
                  type="password"
                  autocomplete="off"
                  :placeholder="
                    selectedSource.id === 'steam'
                      ? '可选，Steam Web API Key'
                      : '可选，用于提高 GitHub 限额'
                  "
                />
              </div>

              <section class="settings-source-adapter">
                <header class="settings-source-adapter-head">
                  <span>同步内容</span
                  ><span class="settings-adapter-count"
                    >{{ selectedAdapterCountFor(selectedSource.id) }}/{{
                      selectedSource.contentOptions.length
                    }}</span
                  >
                </header>
                <div class="settings-content-options">
                  <MoCheckbox
                    v-for="option in selectedSource.contentOptions"
                    :key="option.key"
                    v-model="
                      config.sources[selectedSource.id].content[option.key]
                    "
                    :label="option.label"
                  />
                </div>
                <div
                  v-if="selectedSource.id === 'github'"
                  class="settings-source-scope"
                >
                  <span class="settings-source-scope-label">仓库适配</span>
                  <MoSegmented
                    v-model="
                      config.sources.github.content.githubRepositoryScope
                    "
                    :options="repositoryScopeOptions"
                    aria-label="GitHub 仓库范围"
                  />
                  <SelectMenu
                    v-model="config.sources.github.content.githubRepositorySort"
                    class="settings-source-sort"
                    label="仓库展示顺序"
                    :options="repositorySortOptions"
                  />
                </div>
              </section>

              <footer class="settings-source-detail-foot">
                <span class="settings-row-hint">同步结果会写入本地快照</span>
                <button
                  type="button"
                  class="m-btn m-btn--primary settings-source-sync"
                  :disabled="anyBusy"
                  @click="syncSource(selectedSource.id)"
                >
                  <IconGlyph name="refresh" :size="14" />{{
                    sourceBusy[selectedSource.id] ? "同步中" : "立即同步"
                  }}
                </button>
              </footer>
            </section>
          </div>
        </section>

        <section
          v-else
          id="settings-panel-status"
          key="status"
          class="settings-view is-narrow"
          role="tabpanel"
          aria-labelledby="settings-tab-status"
        >
          <section class="settings-group">
            <h2 class="settings-group-title">各来源最近一次同步</h2>
            <div class="settings-status-list">
              <div
                v-for="row in statusRows"
                :key="row.id"
                class="settings-status-row"
              >
                <span
                  :class="['settings-status-dot', statusClass(row.status)]"
                ></span>
                <strong>{{ row.label }}</strong>
                <span class="settings-status-message">{{
                  row.status?.message || "尚未同步"
                }}</span>
                <small>{{
                  row.status
                    ? `${statusText(row.status)} · ${row.status.count} 项`
                    : "等待操作"
                }}</small>
              </div>
            </div>
          </section>

          <section class="settings-group">
            <h2 class="settings-group-title">运行状态</h2>
            <div class="settings-row">
              <span class="settings-row-label">本地自动刷新</span>
              <div class="settings-row-body is-between">
                <span class="settings-row-hint">仅开发服务器运行期间生效</span>
                <MoToggle
                  v-model="config.autoRefresh.enabled"
                  aria-label="启用本地开发自动刷新"
                />
              </div>
            </div>
            <div class="settings-row">
              <span class="settings-row-label">刷新间隔</span>
              <div class="settings-row-body">
                <SelectMenu
                  v-model="config.autoRefresh.intervalHours"
                  class="settings-auto-refresh-interval"
                  aria-label="自动刷新间隔"
                  :options="refreshIntervalOptions"
                  :menu-min-width="140"
                />
              </div>
            </div>
            <div class="settings-row">
              <span class="settings-row-label">本地配置</span>
              <div class="settings-row-body">
                <span class="settings-row-value">.momona/localConfig.json</span>
              </div>
            </div>
            <div class="settings-row">
              <span class="settings-row-label">公开快照</span>
              <div class="settings-row-body">
                <span class="settings-row-value">.momona/generated.json</span>
              </div>
            </div>
            <div class="settings-row">
              <span class="settings-row-label">最近写入</span>
              <div class="settings-row-body">
                <span class="settings-row-value">{{ snapshotTime }}</span>
              </div>
            </div>
          </section>

          <footer class="settings-foot">
            <span class="settings-row-hint"
              >Token 保存在本地凭据文件，不会进入公开快照。</span
            >
            <div class="settings-foot-actions">
              <button
                type="button"
                class="m-btn m-btn--ghost settings-quiet-action"
                @click="activeTab = 'data'"
              >
                管理数据来源 <IconGlyph name="arrowRight" :size="14" />
              </button>
              <button
                type="button"
                class="m-btn m-btn--secondary settings-secondary"
                @click="exportConfig"
              >
                <IconGlyph name="fileDown" :size="14" />导出配置
              </button>
            </div>
          </footer>
        </section>
      </Transition>
    </section>

    <div
      v-if="syncError"
      class="settings-modal-backdrop"
      role="presentation"
      tabindex="-1"
      @click.self="closeSyncError"
      @keydown.esc="closeSyncError"
    >
      <section
        class="settings-error-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-error-title"
      >
        <header>
          <span class="settings-error-icon"
            ><IconGlyph name="x" :size="16" /></span
          ><button
            type="button"
            class="settings-icon-button"
            aria-label="关闭错误提示"
            title="关闭错误提示"
            @click="closeSyncError"
          >
            <IconGlyph name="x" :size="14" />
          </button>
        </header>
        <div>
          <h2 id="settings-error-title">{{ syncError.title }}</h2>
          <p>{{ syncError.message }}</p>
          <small>已有页面数据已保留，可以检查设置后再次同步。</small>
        </div>
        <footer>
          <button
            type="button"
            class="m-btn m-btn--primary settings-save"
            @click="closeSyncError"
          >
            知道了
          </button>
        </footer>
      </section>
    </div>
  </div>
</template>

<style scoped>
/*
 * 设置页 = 一扇窗 + 窗内划线。
 *
 * 窗是整页唯一浮起来的物体：标题、分类、保存都在窗框上，内容区不再有卡片。
 * 分层只靠三样东西——留白、发丝线、控件本身的凹槽，不再靠底色差和投影，
 * 所以无论壁纸是浅是深，页面都是同一副骨架。
 */
.settings-page {
  position: relative;
  display: flex;
  height: 100%;
  min-height: 0;
  padding: 30px max(112px, calc(clamp(16px, 6vw, 96px) + 24px)) 30px
    clamp(16px, 6vw, 96px);
  flex-direction: column;
  overflow: hidden;
  color: var(--ink);
}

.settings-window {
  display: flex;
  width: min(1040px, 100%);
  min-height: 0;
  margin: 0 auto;
  flex: 1 1 auto;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 22px;
  /* 0.83 + blur(34) + saturate(80%)：能读出壁纸的色调，读不出壁纸的图案。
     再低文字开始随壁纸明度漂移，再高就退化成一块和页面无关的白板；
     压饱和是必须的——面积越大，壁纸的粉色越容易被玻璃感知成"染色"。 */
  background: rgba(255, 255, 255, 0.83);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.9) inset,
    0 0 0 1px rgba(52, 42, 96, 0.05),
    0 30px 68px rgba(31, 25, 64, 0.17),
    0 4px 12px rgba(31, 25, 64, 0.06);
  backdrop-filter: blur(34px) saturate(80%);
}

.settings-window-head {
  display: flex;
  min-height: 64px;
  padding: 0 16px 0 28px;
  flex: 0 0 auto;
  align-items: center;
  gap: 18px;
  border-bottom: 1px solid var(--hairline);
  background: linear-gradient(
    rgba(255, 255, 255, 0.6),
    rgba(255, 255, 255, 0.3)
  );
}

.settings-window-title {
  margin: 0;
  flex: 0 0 auto;
  font-size: 20px;
  font-weight: 650;
  letter-spacing: -0.02em;
}

.settings-nav {
  display: flex;
  padding: 3px;
  align-items: center;
  gap: 2px;
  /* 分类轨是窗框上唯一被按进去的地方，用内阴影而不是描边。 */
  border-radius: 13px;
  background: rgba(19, 26, 45, 0.045);
  box-shadow: inset 0 1px 2px rgba(31, 25, 64, 0.06);
}

.settings-nav-item {
  display: inline-flex;
  min-height: 30px;
  padding: 0 12px;
  align-items: center;
  gap: 6px;
  border: 0;
  border-radius: 9px;
  color: var(--muted-strong);
  background: transparent;
  font-size: 13px;
  font-weight: 560;
  white-space: nowrap;
  transition:
    color 0.16s ease,
    background 0.16s ease,
    box-shadow 0.16s ease;
}

.settings-nav-item:hover {
  color: var(--ink);
  background: rgba(255, 255, 255, 0.6);
}

/* 当前分类用白片浮起来回答"我在哪"，颜色只给图标——强调色留给保存。 */
.settings-nav-item.is-active {
  color: var(--ink);
  background: #fff;
  font-weight: 640;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.9) inset,
    0 1px 3px rgba(31, 25, 64, 0.12);
}

.settings-nav-item.is-active svg {
  color: var(--theme-strong);
}

.settings-window-actions {
  display: flex;
  min-width: 0;
  margin-left: auto;
  align-items: center;
  gap: 12px;
}

.settings-unsaved {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 560;
}

.settings-unsaved::before {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--theme);
  content: "";
}

.settings-save {
  min-height: 32px;
  padding: 0 14px;
  font-size: 13px;
  font-weight: 640;
}

button:disabled {
  cursor: default;
  opacity: 0.48;
}

.settings-view {
  min-height: 0;
  padding: 22px 24px 32px 28px;
  flex: 1 1 auto;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: rgba(94, 100, 132, 0.24) transparent;
}

/*
 * 表单列与标题左对齐，宽度收到 720。
 *
 * 居中会让内容相对窗框有一圈不对称的留白，看着像"贴在窗口里的一张纸"；
 * 左对齐则读成"这个窗口的内容从这里开始"，右边的空白是窗口自己的余量。
 */
.settings-view.is-narrow > * {
  width: 100%;
  max-width: 760px;
}

/* 基础设置的每个分组多带一列预览，横向要多 336。 */
.settings-view.is-split > * {
  width: 100%;
  max-width: 940px;
}

.settings-view-enter-active,
.settings-view-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.2s cubic-bezier(0.22, 1, 0.36, 1);
}

.settings-view-enter-from {
  opacity: 0;
  transform: translateY(5px);
}

.settings-view-leave-to {
  opacity: 0;
  transform: translateY(-3px);
}

/* ---------- 分组与行 ---------- */

.settings-group + .settings-group {
  margin-top: 26px;
  padding-top: 24px;
  border-top: 1px solid var(--hairline);
}

.settings-group-title {
  display: flex;
  margin: 0 0 4px;
  align-items: baseline;
  gap: 10px;
  color: var(--ink);
  font-size: 13px;
  font-weight: 680;
  letter-spacing: 0.01em;
}

/*
 * 行是这套版式的基本单位：左边一列标签、右边一列控件。
 * 所有控件因此在同一条竖线上，扫读时不需要重新找起点。
 */
.settings-row {
  display: grid;
  min-height: 48px;
  padding: 10px 0;
  grid-template-columns: 132px minmax(0, 1fr);
  align-items: center;
  gap: 20px;
}

.settings-row.is-top {
  align-items: start;
}

.settings-row.is-top > .settings-row-label {
  padding-top: 9px;
}

.settings-row-label {
  color: var(--muted-strong);
  font-size: 13px;
  font-weight: 520;
  line-height: 1.4;
}

.settings-row-body {
  display: flex;
  min-width: 0;
  /* 控件不跟着窗口变宽：一行输入框横跨 700px 时，标签和值已经读不到一起了。 */
  max-width: 440px;
  align-items: center;
  gap: 10px;
}

.settings-row-body.is-wrap {
  max-width: 560px;
  flex-direction: column;
  align-items: stretch;
  gap: 12px;
}

.settings-row-body.is-between {
  justify-content: space-between;
}

/*
 * 一行两个字段：昵称和英文名是同一类信息，各占一行只是把行高翻倍。
 * 两个框各自带小标签，所以左边那列用一个统称（名字），不再重复写两遍。
 */
.settings-row-body.is-pair {
  display: grid;
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
  align-items: end;
  gap: 12px;
}

.settings-row-hint {
  color: var(--muted);
  font-size: 11.5px;
  line-height: 1.5;
}

.settings-row-value {
  overflow: hidden;
  color: var(--ink);
  font-size: 13px;
  font-variant-numeric: tabular-nums;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ---------- 分栏与预览 ---------- */

/*
 * 每个分类自己带一份预览：左边这一类的设置项，右边这一类的成品。
 *
 * 两列按内容高度排（align-items: start），不拉平。一张预览不是"另一列"，而是一张
 * 自己站得住的名片：把白纸硬撑到和设置列一样高，多出来的那截空白会读作"这里还没
 * 画完"，比短一截更难看。短，就用把设置项并行的办法压下来——两边高度自然靠近。
 *
 * 预览固定 256 宽，所以三张名片在同一条竖线上；视线从输入框往右一滑就到结果。
 */
.settings-group-split {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 256px;
  align-items: start;
  gap: 40px;
}

.settings-group-form {
  min-width: 0;
}

.settings-group-preview {
  min-width: 0;
}

/*
 * 名片：一个图标、一个名字、一句话。
 *
 * 它不做"缩小版的页面"——浏览器页签、窗口边框、滚动区都在暗示"这是内容"，
 * 于是描述被读成正文。名片没有内容区，只有身份信息，高度跟着这三样走。
 */
.settings-card {
  display: flex;
  width: 100%;
  padding: 16px;
  flex-direction: column;
  align-items: flex-start;
  border-radius: 14px;
  background: #fff;
  /* 它落在窗的内表面上，是"贴地"的：一圈墨、一道 2px 接触影，没有轮廓光。 */
  box-shadow:
    0 0 0 1px rgba(52, 42, 96, 0.08),
    0 1px 2px rgba(33, 27, 68, 0.05);
}

/* 强调色样张没有身份信息，只有一行强度对照，所以它是居中的一块色面。 */
.settings-card.is-accent {
  justify-content: center;
}

/* 图标槽：凹进纸里的一格，图标的透明底才不会和卡片白底糊在一起。 */
.settings-card-mark {
  display: grid;
  width: 36px;
  height: 36px;
  margin-bottom: 12px;
  flex: 0 0 auto;
  overflow: hidden;
  place-items: center;
  border-radius: 10px;
  background: rgba(19, 26, 45, 0.04);
  box-shadow: inset 0 0 0 1px var(--hairline-soft);
  color: var(--muted);
}

/* 头像天然是圆的，站点图标不是——形状跟着素材自己的语义走。 */
.settings-card-mark.is-round {
  border-radius: 50%;
}

.settings-card-mark img {
  width: 24px;
  height: 24px;
  object-fit: contain;
}

.settings-card-mark.is-round img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

/* 名字是名片上唯一的大字：两行封顶，长标题截断也要留住身份。 */
.settings-card-name {
  display: -webkit-box;
  max-width: 100%;
  margin: 0;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: var(--ink);
  font-size: 16px;
  font-weight: 660;
  line-height: 1.35;
  letter-spacing: -0.01em;
  word-break: break-word;
}

/* 账号是名字的注脚：小一档、松字距，读作"@handle"而不是第二行名字。 */
.settings-card-handle {
  max-width: 100%;
  margin: 4px 0 0;
  overflow: hidden;
  color: var(--muted);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.06em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/*
 * 一句话简介。描述是 meta 里的摘要、签名是自我介绍，两者在名片上是同一个位置：
 * 名字之下、灰一档、最多三行——它是注脚，不是内容。
 */
.settings-card-note {
  display: -webkit-box;
  max-width: 100%;
  margin: 8px 0 0;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
  color: var(--muted-strong);
  font-size: 13px;
  line-height: 1.5;
}

/* 站点描述是 meta 摘要，两行就够；签名是自己写的话，可以多给一行。 */
.settings-card-note.is-brief {
  -webkit-line-clamp: 2;
}

/* 强调色落到浅底块、文字、实色按钮上的三档强度。 */
.settings-accent-chip {
  padding: 2px 8px;
  border-radius: 6px;
  color: var(--theme-strong);
  background: var(--theme-wash);
  font-size: 11px;
  font-weight: 620;
}

.settings-accent {
  display: flex;
  width: 100%;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
}

.settings-accent-link {
  color: var(--theme-strong);
  font-size: 11px;
  font-weight: 600;
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--theme) 45%, transparent);
  text-underline-offset: 3px;
}

/* 样张里的按钮必须和真按钮同一套底色与投影，否则"预览"就成了另一种设计。 */
.settings-accent-button {
  padding: 4px 10px;
  border-radius: 8px;
  margin-left: auto;
  color: var(--theme-on);
  background: var(--theme);
  font-size: 11px;
  font-weight: 640;
  box-shadow: var(--theme-shadow);
}

/* ---------- 主题色 ---------- */

/*
 * 色带：预设是平涂的色片，不是珠子、不是药丸。
 *
 * 色片坐在纸面上，所以它的边界只能用墨（规范 §5）——用白描边或高光是
 * "浮在壁纸上"的语言，搬到纸上就变成一块假凸起。色片也不带投影：
 * 它是一块颜色，不是一件离地的物件。
 *
 * 选中态用通断表达：未选中读得到一条发丝墨线，选中后墨线撤掉、
 * 改由一圈墨环在纸面上"框住"它。不用主题色描边——五个彩块再各套一圈
 * 彩环，一屏的强调色预算会被这一个控件花光（规范 §6）。
 */
.settings-theme-bar {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 16px;
}

.settings-theme-swatches {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 10px;
}

/* 预设是别人定的，右边那块是你的：一条发丝把两种来源分开，
   免得当前值恰好等于某个预设时，两个同色块并排看着像重复了。 */
.settings-theme-divider {
  width: 1px;
  height: 20px;
  background: rgba(19, 26, 45, 0.16);
}

.settings-theme-swatch {
  width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: 10px;
  cursor: pointer;
  box-shadow: inset 0 0 0 1px rgba(19, 26, 45, 0.1);
  transition:
    box-shadow 0.16s ease,
    transform 0.16s ease;
}

/* 悬停只加深那条墨线：色片不该为了"有反馈"而开始发光或上浮。 */
.settings-theme-swatch:hover {
  box-shadow: inset 0 0 0 1px rgba(19, 26, 45, 0.26);
}

.settings-theme-swatch.is-active,
.settings-theme-swatch.is-active:hover {
  box-shadow:
    0 0 0 1.5px #fff,
    0 0 0 3px rgba(19, 26, 45, 0.38);
}

.settings-theme-swatch:focus-visible {
  outline: none;
  box-shadow:
    0 0 0 1.5px #fff,
    0 0 0 4px var(--theme-ring);
}

/*
 * 色点长在色值框里头，不是它旁边：左边一块颜色、右边一串字符，
 * 读起来是"这个值长这样"，不会变成第六个可选色。
 */
.settings-theme-value {
  position: relative;
  display: inline-flex;
}

.settings-theme-value :deep(.mo-color) {
  position: absolute;
  top: 50%;
  left: 6px;
  /* 22 × 22，比预设色片小一圈——它是值的预览，不是选项。 */
  width: 22px;
  height: 22px;
  border-radius: 6px;
  transform: translateY(-50%);
  z-index: 1;
}

.settings-theme-value :deep(.mo-color-input) {
  border-radius: 6px;
}

.settings-page .settings-theme-code {
  width: 124px;
  height: 34px;
  padding: 0 10px 0 34px !important;
  font-variant-numeric: tabular-nums;
  letter-spacing: 0.01em;
  text-transform: lowercase;
}

/* ---------- 外观 ---------- */

/*
 * 外观页最依赖"一行能放下多少"：壁纸网格、滑杆都排在这里。
 * 控件列比其他分类宽一档，四张壁纸正好一行，各行的右边线也就对齐了。
 */
.settings-view.is-appearance .settings-row-body,
.settings-view.is-appearance .settings-row-body.is-wrap {
  max-width: 640px;
}

/*
 * 壁纸列表：格子是固定宽度，图多图少都不会被拉成巨幅；窗口变窄时列数
 * 自己从 4 列退到 3 列、2 列，不需要额外的断点。
 */
.settings-wallpaper-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, 148px);
  gap: 14px 10px;
}

.settings-wallpaper {
  position: relative;
  min-width: 0;
}

.settings-wallpaper-pick {
  display: flex;
  width: 100%;
  padding: 0;
  flex-direction: column;
  gap: 6px;
  border: 0;
  background: transparent;
  text-align: left;
  cursor: pointer;
}

.settings-wallpaper-thumb {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 10;
  border: 1px solid var(--hairline);
  border-radius: 10px;
  background-color: rgba(255, 255, 255, 0.5);
  background-position: center;
  background-size: cover;
  transition:
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.settings-wallpaper:hover .settings-wallpaper-thumb {
  transform: translateY(-1px);
  box-shadow: 0 6px 14px rgba(31, 25, 64, 0.12);
}

.settings-wallpaper.is-active .settings-wallpaper-thumb {
  border-color: transparent;
  box-shadow:
    0 0 0 2px var(--theme),
    0 3px 8px color-mix(in srgb, var(--theme) 16%, transparent);
}

.settings-wallpaper-name {
  overflow: hidden;
  color: var(--muted-strong);
  font-size: 11.5px;
  font-weight: 560;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-wallpaper.is-active .settings-wallpaper-name {
  color: var(--ink);
  font-weight: 640;
}

/*
 * 删除按钮压在缩略图右上角：手动添加的地址可以删，目录里的由图文件决定。
 * 平时淡到几乎看不见，指针移上来或键盘聚焦时才显形，不跟"选图"这个主操作抢注意力。
 */
.settings-wallpaper-delete {
  position: absolute;
  top: 5px;
  right: 5px;
  display: grid;
  width: 20px;
  height: 20px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 999px;
  color: var(--muted-strong);
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 1px 4px rgba(31, 25, 64, 0.18);
  opacity: 0;
  cursor: pointer;
  transition:
    opacity 0.16s ease,
    color 0.16s ease;
}

.settings-wallpaper:hover .settings-wallpaper-delete,
.settings-wallpaper-delete:focus-visible {
  opacity: 1;
}

.settings-wallpaper-delete:hover {
  color: var(--theme-strong);
}

/* 触屏没有悬停：直接显形，否则这个按钮等于不存在。 */
@media (hover: none) {
  .settings-wallpaper-delete {
    opacity: 1;
  }
}

/* 地址输入框撑满本行，和上面的网格共用同一条右边线。 */
.settings-wallpaper-field {
  width: 100%;
}

/* 目录提示：左边是"放在哪、有几张"，右边是唯一需要的动作"重新扫描"。 */
.settings-wallpaper-note {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  margin: 0;
  gap: 10px;
  color: var(--muted);
  font-size: 11.5px;
}

.settings-wallpaper-note code {
  padding: 1px 5px;
  border-radius: 5px;
  color: var(--muted-strong);
  background: rgba(19, 26, 45, 0.06);
  font-family: ui-monospace, "SFMono-Regular", Menlo, monospace;
  font-size: 11px;
}

.settings-wallpaper-scan {
  height: 26px;
  flex: none;
  padding: 0 10px;
  font-size: 11.5px;
}

/* 三段切换需要比整行窄：宽度按内容走，不跟输入框一起撑满。 */
.settings-wallpaper-mode {
  width: max-content;
  min-width: 224px;
}

/* 切换方式、间隔和"换一张"排在同一行：三件事都是"什么时候换"。 */
.settings-wallpaper-switch {
  display: flex;
  width: 100%;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
}

.settings-wallpaper-interval {
  min-width: 132px;
}

.settings-wallpaper-shuffle {
  height: 28px;
  margin-left: auto;
  flex: none;
  padding: 0 12px;
  font-size: 12px;
}

/* 输入框 + 添加按钮：按钮按内容宽，输入框吃掉剩余空间。 */
.settings-wallpaper-add {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 8px;
}

.settings-wallpaper-add > :first-child {
  min-width: 0;
  flex: 1;
}

.settings-wallpaper-add-button {
  height: 32px;
  flex: none;
  padding: 0 14px;
  font-size: 12px;
}

/* 网络图源做成一排等宽卡片：三项是并列关系，竖着摞会把这一组拉得很长。 */
.settings-provider-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(172px, 1fr));
  gap: 8px;
}

.settings-range {
  width: 100%;
  min-width: 0;
  height: 20px;
  margin: 0;
  padding: 0;
  border: 0;
  background: transparent;
  accent-color: var(--theme);
  cursor: pointer;
  appearance: none;
}

/* 自绘轨道：原生 range 在纸面上是一条黑线，和整套材质对不上。 */
.settings-range::-webkit-slider-runnable-track {
  height: 4px;
  border-radius: 999px;
  /* 已选段用主题色填出来：滑块位置只是辅助，真正读数值的是这条色带。 */
  background: linear-gradient(
    to right,
    var(--theme) 0 var(--fill, 0%),
    rgba(19, 26, 45, 0.1) var(--fill, 0%)
  );
}

.settings-range::-webkit-slider-thumb {
  width: 15px;
  height: 15px;
  margin-top: -5.5px;
  border: 0;
  border-radius: 50%;
  background: #fff;
  box-shadow:
    0 0 0 1px rgba(19, 26, 45, 0.12),
    0 2px 5px rgba(31, 25, 64, 0.18);
  appearance: none;
}

.settings-range::-moz-range-track {
  height: 4px;
  border-radius: 999px;
  background: linear-gradient(
    to right,
    var(--theme) 0 var(--fill, 0%),
    rgba(19, 26, 45, 0.1) var(--fill, 0%)
  );
}

.settings-range::-moz-range-thumb {
  width: 15px;
  height: 15px;
  border: 0;
  border-radius: 50%;
  background: #fff;
  box-shadow:
    0 0 0 1px rgba(19, 26, 45, 0.12),
    0 2px 5px rgba(31, 25, 64, 0.18);
}

.settings-range-value {
  width: 48px;
  flex: 0 0 auto;
  color: var(--ink);
  font-size: 12.5px;
  font-variant-numeric: tabular-nums;
  text-align: right;
}

/* ---------- 数据来源 ---------- */

.settings-source-workspace {
  display: grid;
  grid-template-columns: 268px minmax(0, 1fr);
  align-items: stretch;
}

/* 两栏之间只画一条线：不需要两张卡片来证明它们是两件事。 */
.settings-source-index {
  display: flex;
  padding-right: 20px;
  flex-direction: column;
  gap: 10px;
  border-right: 1px solid var(--hairline);
}

.settings-source-index-head h2 {
  margin: 0;
}

.settings-source-search {
  display: flex !important;
  height: 32px;
  margin: 0 !important;
  padding: 0 9px !important;
  flex-direction: row !important;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--hairline);
  border-radius: 10px;
  color: var(--muted);
  background: #f4f6fb;
}

.settings-source-search input {
  height: auto !important;
  padding: 0 !important;
  border: 0 !important;
  background: transparent !important;
  box-shadow: none !important;
  font-size: 13px;
}

.settings-source-filters {
  width: 100%;
}

.settings-source-list {
  display: flex;
  margin-top: 2px;
  flex-direction: column;
  gap: 2px;
}

.settings-source-list-item {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 4px;
  border-radius: 10px;
  transition: background 0.16s ease;
}

.settings-source-list-item:hover {
  background: rgba(19, 26, 45, 0.035);
}

.settings-source-list-item.is-selected {
  background: color-mix(in srgb, var(--theme) 7%, transparent);
  box-shadow: inset 2px 0 0 var(--theme);
}

.settings-source-list-item.is-disabled {
  opacity: 0.62;
}

.settings-source-select {
  display: flex;
  min-width: 0;
  padding: 8px 4px 8px 10px;
  flex: 1 1 auto;
  align-items: center;
  gap: 9px;
  border: 0;
  border-radius: 10px;
  background: transparent;
  text-align: left;
}

.settings-source-icon {
  display: grid;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 9px;
  color: var(--muted-strong);
  background: rgba(19, 26, 45, 0.055);
  transition:
    color 0.16s ease,
    background 0.16s ease;
}

/* 只有当前选中的数据源用强调色：七个图标同时发粉，等于没有重点。 */
.settings-source-list-item.is-selected .settings-source-icon {
  color: var(--theme-strong);
  background: color-mix(in srgb, var(--theme) 11%, transparent);
}

.settings-source-select-copy {
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 2px;
}

.settings-source-select-copy strong {
  overflow: hidden;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-source-select-copy small {
  overflow: hidden;
  color: var(--muted);
  font-size: 11px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-source-list-status {
  display: inline-flex;
  max-width: 58px;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  color: var(--muted);
}

.settings-source-list-status i,
.settings-status-dot {
  width: 6px;
  height: 6px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--muted);
}

.settings-source-list-status em {
  overflow: hidden;
  font-size: 11px;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-source-list-item.is-selected .settings-source-list-status {
  display: none;
}

.settings-source-list-switch {
  padding-right: 8px;
}

.settings-source-list-empty {
  margin: 18px 0;
  color: var(--muted);
  font-size: 12px;
  text-align: center;
}

.settings-source-detail {
  display: flex;
  min-width: 0;
  padding-left: 24px;
  flex-direction: column;
  gap: 18px;
}

.settings-source-detail-head {
  display: flex;
  min-height: 36px;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}

.settings-source-detail-title {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}

.settings-source-detail-title h2 {
  margin: 0;
  font-size: 16px;
  font-weight: 650;
  letter-spacing: -0.01em;
}

.settings-source-status {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 5px;
  color: var(--muted-strong);
  font-size: 12px;
}

.settings-source-status i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--muted);
}

.settings-source-status small {
  color: var(--muted);
  font-size: 11px;
}

.settings-source-status.is-success i,
.settings-status-dot.is-success {
  background: var(--green);
}

.settings-source-status.is-error i,
.settings-status-dot.is-error {
  background: #df5a70;
}

.settings-source-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 156px;
  gap: 12px;
}

.settings-source-fields .settings-field-wide {
  grid-column: 1 / -1;
}

.settings-source-adapter {
  padding-top: 16px;
  border-top: 1px solid var(--hairline);
}

.settings-source-adapter-head {
  display: flex;
  min-height: 26px;
  margin-bottom: 8px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--ink);
  font-size: 13px;
  font-weight: 640;
}

.settings-adapter-count {
  color: var(--muted);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  font-weight: 520;
}

.settings-content-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.settings-source-scope {
  display: grid;
  margin-top: 14px;
  gap: 8px;
}

.settings-source-scope-label {
  color: var(--muted-strong);
  font-size: 12px;
  font-weight: 560;
}

.settings-source-sort {
  width: 200px;
  max-width: 100%;
}

.settings-source-detail-foot {
  display: flex;
  margin-top: 4px;
  padding-top: 16px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-top: 1px solid var(--hairline);
}

.settings-source-sync {
  min-height: 32px;
  padding: 0 12px;
  font-size: 12.5px;
}

/* ---------- 同步状态 ---------- */

.settings-status-list {
  margin-top: 2px;
}

.settings-status-row {
  display: grid;
  min-height: 42px;
  grid-template-columns: 6px 92px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  border-top: 1px solid var(--hairline-soft);
}

.settings-status-row:first-child {
  border-top: 0;
}

.settings-status-row strong {
  font-size: 13px;
  font-weight: 600;
}

.settings-status-message {
  overflow: hidden;
  color: var(--muted-strong);
  font-size: 12.5px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-status-row small {
  color: var(--muted);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.settings-auto-refresh-interval {
  width: 160px;
}

.settings-foot {
  display: flex;
  margin-top: 26px;
  padding-top: 16px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-top: 1px solid var(--hairline);
}

.settings-foot-actions {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
}

.settings-secondary,
.settings-quiet-action {
  min-height: 32px;
  padding: 0 12px;
  font-size: 12.5px;
  font-weight: 600;
}

/* ---------- 控件在纸上的覆盖 ---------- */

/*
 * MoField / MoCheckbox / MoSegmented 默认是照玻璃写的（半透明白底 + 白色内高光
 * + 外投影）。搬到近白的窗内，底色和背景同色、白边看不见、投影方向还反了，
 * 所以这里按"纸面场景"成套覆盖，组件本体保持原样供玻璃区域使用。
 */
.settings-page :deep(.mo-field) {
  width: 100%;
  gap: 6px;
}

.settings-page :deep(.mo-field-label) {
  color: var(--muted);
  font-size: 11.5px;
  font-weight: 560;
}

.settings-page :deep(.mo-field-control),
.settings-page input,
.settings-page select,
.settings-page textarea {
  width: 100%;
  min-width: 0;
  padding: 0 11px;
  border: 1px solid rgba(19, 26, 45, 0.1);
  border-radius: 10px;
  outline: none;
  color: var(--ink);
  background: #f4f6fb;
  box-shadow: 0 1px 2px rgba(33, 27, 68, 0.05) inset;
  font: inherit;
  font-size: 13px;
}

.settings-page input,
.settings-page select {
  height: 34px;
}

/*
 * MoField 的控件在子组件模板里，父组件的 scoped 选择器命中不了，
 * 高度和 textarea 的行为必须走 :deep 单独声明。
 */
.settings-page :deep(input.mo-field-control) {
  height: 34px;
}

.settings-page :deep(textarea.mo-field-control) {
  min-height: 56px;
  padding: 8px 11px;
  line-height: 1.5;
  resize: none;
}

.settings-page textarea {
  min-height: 58px;
  padding-top: 8px;
  padding-bottom: 8px;
  line-height: 1.5;
  /* 行高由内容决定：允许手动拖拽会把同一列的行高搅乱。 */
  resize: none;
}

.settings-page :deep(.mo-field-control:focus),
.settings-page input:focus,
.settings-page select:focus,
.settings-page textarea:focus {
  border-color: color-mix(in srgb, var(--theme) 50%, transparent);
  background: #fff;
  box-shadow: 0 0 0 3px var(--theme-ring);
}

.settings-page :deep(.mo-checkbox) {
  border-color: rgba(19, 26, 45, 0.08);
  border-radius: 9px;
  background: #fff;
  box-shadow: none;
}

.settings-page :deep(.mo-checkbox:not(.is-disabled):hover) {
  border-color: rgba(19, 26, 45, 0.14);
  background: #fff;
  scale: 1;
}

.settings-page :deep(.mo-checkbox.is-checked) {
  border-color: rgba(19, 26, 45, 0.12);
  /* 选中只由左侧方块表达：整行再染一层粉，四个并排就成了一张粉色网格。 */
  background: #fff;
}

.settings-page :deep(.mo-checkbox-box) {
  border-color: rgba(19, 26, 45, 0.14);
  background: #fff;
  box-shadow: none;
}

.settings-page :deep(.mo-segmented) {
  padding: 3px;
  border: 0;
  border-radius: 10px;
  background: rgba(19, 26, 45, 0.05);
  box-shadow: none;
}

/* 和窗口头部的分类轨同一套语法：灰槽 + 白片，白片就是当前位置。 */
.settings-page :deep(.mo-segmented-indicator) {
  border: 0;
  border-radius: 8px;
  background: #fff;
  box-shadow: 0 1px 3px rgba(31, 25, 64, 0.14);
}

.settings-page :deep(.mo-segmented-item) {
  min-height: 26px;
  color: var(--muted-strong);
  font-size: 12px;
  font-weight: 560;
}

.settings-page :deep(.mo-segmented-item:hover) {
  color: var(--ink);
}

.settings-page :deep(.mo-segmented-item.is-active) {
  color: var(--ink);
  font-weight: 620;
}

.settings-page :deep(.m-btn) {
  border-radius: 9px;
}

/* ---------- 错误弹窗 ---------- */

.settings-modal-backdrop {
  position: fixed;
  z-index: 40;
  inset: 0;
  display: grid;
  padding: 18px;
  place-items: center;
  background: rgba(30, 26, 54, 0.24);
  backdrop-filter: blur(6px);
}

.settings-error-modal {
  width: min(430px, 100%);
  padding: 18px;
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 18px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.9) inset,
    0 26px 60px rgba(31, 25, 64, 0.24),
    0 4px 12px rgba(31, 25, 64, 0.08);
  backdrop-filter: blur(24px) saturate(112%);
}

.settings-error-modal > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}

.settings-error-icon {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 9px;
  color: #bd455b;
  background: rgba(223, 90, 112, 0.12);
}

.settings-icon-button {
  display: grid;
  width: 28px;
  height: 28px;
  padding: 0;
  place-items: center;
  border: 1px solid rgba(19, 26, 45, 0.08);
  border-radius: 9px;
  color: var(--muted-strong);
  background: #fff;
}

.settings-icon-button:hover {
  color: var(--ink);
  border-color: rgba(19, 26, 45, 0.14);
}

.settings-error-modal > div {
  padding: 14px 2px 6px;
}

.settings-error-modal h2 {
  margin: 0 0 8px;
  font-size: 16px;
  font-weight: 650;
}

.settings-error-modal p,
.settings-error-modal small {
  display: block;
  margin: 0;
  color: var(--muted-strong);
  font-size: 13px;
  line-height: 1.55;
  overflow-wrap: anywhere;
}

.settings-error-modal small {
  margin-top: 8px;
  color: var(--muted);
  font-size: 11.5px;
}

.settings-error-modal > footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}

/* ---------- 窄屏 ---------- */

/* 窗口收窄时先让预览让位，设置列保持可读宽度。 */
@media (max-width: 1100px) {
  .settings-group-split {
    grid-template-columns: minmax(0, 1fr) 224px;
    gap: 28px;
  }
}

@media (max-width: 900px) {
  /* 底部导航是浮层，窗口必须给它让出高度，否则最后一行永远被盖住。 */
  .settings-page {
    padding: 14px 14px calc(96px + env(safe-area-inset-bottom, 0px));
  }

  .settings-window-head {
    min-height: 56px;
    padding: 0 12px;
    gap: 10px;
    flex-wrap: wrap;
  }

  .settings-window-title {
    font-size: 16px;
  }

  .settings-nav {
    order: 3;
    width: 100%;
    margin-bottom: 8px;
    justify-content: space-between;
  }

  .settings-nav-item {
    padding: 0 8px;
    flex: 1 1 0;
    justify-content: center;
  }

  .settings-view {
    padding: 18px 14px 26px;
  }

  /* 窄屏改成"标签在上、控件在下"：132px 的标签列会挤掉输入框。 */
  .settings-row {
    grid-template-columns: minmax(0, 1fr);
    gap: 8px;
  }

  /* 预览折到本组设置的下方：仍是"先改后看"，只是改成上下读。 */
  .settings-group-split {
    grid-template-columns: minmax(0, 1fr);
    gap: 14px;
  }

  .settings-group-preview {
    order: 2;
  }

  /*
   * 折成一行之后名片变宽：竖着一列字铺满 560 只会剩下一片白。
   * 让它横过来——图标在左，名字和简介在右，宽度才被用上。
   */
  .settings-card:not(.is-accent) {
    display: grid;
    grid-template-columns: 36px minmax(0, 1fr);
    column-gap: 12px;
  }

  .settings-card-mark {
    grid-column: 1;
    grid-row: span 3;
    align-self: start;
    margin-bottom: 0;
  }

  .settings-card-name,
  .settings-card-handle,
  .settings-card-note {
    grid-column: 2;
  }

  .settings-row.is-top > .settings-row-label {
    padding-top: 0;
  }

  .settings-source-workspace {
    grid-template-columns: minmax(0, 1fr);
  }

  .settings-source-index {
    position: static;
    padding-right: 0;
    padding-bottom: 14px;
    border-right: 0;
    border-bottom: 1px solid var(--hairline);
  }

  .settings-source-detail {
    padding-top: 16px;
    padding-left: 0;
  }

  .settings-source-fields {
    grid-template-columns: minmax(0, 1fr);
  }

  .settings-foot {
    align-items: flex-start;
    flex-direction: column;
  }
}

/* 821–900 之间还是左侧竖栏，窗口要让出它的宽度。 */
@media (min-width: 821px) and (max-width: 900px) {
  .settings-page {
    padding-left: 88px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .settings-view-enter-active,
  .settings-view-leave-active,
  .settings-wallpaper-thumb,
  .settings-nav-item {
    transition: none;
  }
}
</style>
