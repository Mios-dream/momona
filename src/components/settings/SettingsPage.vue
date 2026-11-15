<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type {
  DataSourceId,
  GitHubRepositoryScope,
  GitHubRepositorySort,
  HoyoGame,
  LocalConfig,
  ProviderStatus,
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
}>();

const config = ref<LocalConfig>(cloneLocalConfig(props.localConfig));
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
    <header class="settings-header">
      <div class="settings-heading">
        <span class="settings-eyebrow">MOMONA / CONTROL CENTER</span>
        <h1>设置</h1>
      </div>
      <div class="settings-header-actions">
        <button
          type="button"
          class="m-btn m-btn--primary settings-primary"
          :disabled="anyBusy"
          @click="saveSettings"
        >
          <IconGlyph name="save" :size="15" />{{
            saveBusy ? "保存中" : "保存设置"
          }}
        </button>
      </div>
    </header>

    <div class="settings-shell">
      <nav
        class="settings-sidebar glass-panel"
        role="tablist"
        aria-label="设置分类"
      >
        <span class="settings-sidebar-label">配置</span>
        <button
          v-for="tab in settingsTabs"
          :id="`settings-tab-${tab.id}`"
          :key="tab.id"
          type="button"
          role="tab"
          :aria-selected="activeTab === tab.id"
          :aria-controls="`settings-panel-${tab.id}`"
          :class="['settings-tab', { 'is-active': activeTab === tab.id }]"
          @click="activeTab = tab.id"
        >
          <IconGlyph :name="tab.icon" :size="16" />
          <span>{{ tab.label }}</span>
        </button>
        <div class="settings-sidebar-brand" aria-label="momona">
          <strong>Momona</strong>
        </div>
      </nav>

      <main class="settings-main">
        <section
          v-if="activeTab === 'profile'"
          id="settings-panel-profile"
          class="settings-panel glass-panel"
          role="tabpanel"
          aria-labelledby="settings-tab-profile"
        >
          <header class="settings-panel-head">
            <div>
              <span class="settings-section-index">01 / GENERAL</span>
              <h2>基础设置</h2>
            </div>
            <div class="settings-site-preview">
              <span class="settings-site-favicon"
                ><img
                  v-if="config.site.favicon"
                  :src="config.site.favicon"
                  alt="网站图标预览" /><IconGlyph
                  v-else
                  name="globe"
                  :size="18"
              /></span>
              <span
                ><strong>{{ config.site.title || "未设置标题" }}</strong
                ><small>浏览器标签页</small></span
              >
            </div>
          </header>

          <section class="settings-section-block">
            <div class="settings-section-heading">
              <div>
                <h3>页面信息</h3>
              </div>
              <IconGlyph name="globe" :size="17" />
            </div>
            <div class="settings-form-grid settings-form-grid-wide">
              <MoField
                v-model="config.site.title"
                label="网站标题"
                placeholder="Love on the page"
              />
              <MoField
                v-model="config.site.favicon"
                label="Favicon 地址"
                type="url"
                placeholder="/favicon.svg"
              />
              <MoField
                v-model="config.site.description"
                class="settings-field-wide"
                label="网站描述"
                multiline
                :rows="3"
              />
            </div>
          </section>

          <section
            class="settings-section-block settings-section-block-separated"
          >
            <div class="settings-section-heading">
              <div>
                <h3>主题色</h3>
                <p class="settings-section-hint">选中即可预览，保存后生效。</p>
              </div>
              <IconGlyph name="palette" :size="17" />
            </div>
            <div class="settings-theme">
              <div class="settings-theme-presets">
                <span class="settings-theme-label">预设</span>
                <div
                  class="settings-theme-swatches"
                  role="group"
                  aria-label="主题色预设"
                >
                  <button
                    v-for="preset in themePresets"
                    :key="preset.id"
                    type="button"
                    :aria-pressed="
                      isThemePresetSelected(config.site.theme, preset)
                    "
                    :class="[
                      'settings-theme-swatch',
                      {
                        'is-active': isThemePresetSelected(
                          config.site.theme,
                          preset,
                        ),
                      },
                    ]"
                    @click="selectTheme(preset.value)"
                  >
                    <span
                      class="settings-theme-dot"
                      :style="{ background: preset.value }"
                      aria-hidden="true"
                    ></span>
                    {{ preset.label }}
                  </button>
                </div>
              </div>
              <div class="settings-theme-custom">
                <span class="settings-theme-label">自定义</span>
                <div class="settings-theme-custom-row">
                  <label class="settings-theme-picker" title="打开取色器">
                    <input
                      type="color"
                      :value="config.site.theme"
                      aria-label="选择自定义主题色"
                      @input="
                        selectTheme(($event.target as HTMLInputElement).value)
                      "
                    />
                  </label>
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
            <div class="settings-theme-preview" aria-hidden="true">
              <span class="settings-theme-preview-tag">#主题色</span>
              <span class="settings-theme-preview-link">正文里的链接</span>
              <span class="settings-theme-preview-button">主按钮</span>
            </div>
          </section>

          <section
            class="settings-section-block settings-section-block-separated"
          >
            <div class="settings-section-heading">
              <div>
                <h3>个人资料</h3>
              </div>
              <IconGlyph name="user" :size="17" />
            </div>
            <div class="settings-profile-layout">
              <div class="settings-profile-preview">
                <img
                  :src="config.account.avatar"
                  :alt="config.account.name || '头像预览'"
                /><strong>{{ config.account.name || "未命名" }}</strong
                ><small>{{ config.account.motto || "还没有签名" }}</small>
              </div>
              <div class="settings-form-grid settings-form-grid-wide">
                <MoField
                  v-model="config.account.name"
                  label="显示名称"
                  placeholder="三三 sama"
                />
                <MoField
                  v-model="config.account.latinName"
                  label="英文名 / 用户名"
                  placeholder="@miosdream"
                />
                <MoField
                  v-model="config.account.motto"
                  class="settings-field-wide"
                  label="签名"
                />
                <MoField
                  v-model="config.account.avatar"
                  class="settings-field-wide"
                  label="头像地址"
                  type="url"
                  placeholder="/assets/avatar.jpg"
                />
              </div>
            </div>
          </section>
        </section>

        <section
          v-else-if="activeTab === 'data'"
          id="settings-panel-data"
          class="settings-panel glass-panel"
          role="tabpanel"
          aria-labelledby="settings-tab-data"
        >
          <header class="settings-panel-head">
            <div>
              <span class="settings-section-index">02 / DATA</span>
              <h2>数据管理</h2>
            </div>
          </header>

          <div class="settings-source-workspace">
            <aside class="settings-source-index" aria-label="数据来源列表">
              <header class="settings-source-index-head">
                <div>
                  <span class="settings-section-index">PLATFORMS</span>
                  <h3>数据来源</h3>
                </div>
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
                      ><IconGlyph :name="source.icon" :size="16"
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
                    ><IconGlyph :name="selectedSource.icon" :size="18"
                  /></span>
                  <div>
                    <span class="settings-section-index">ACTIVE SOURCE</span>
                    <h3>{{ selectedSource.title }}</h3>
                  </div>
                </div>
                <div class="settings-source-detail-actions">
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
                </div>
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
              <div class="settings-source-adapter">
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
              </div>
              <footer class="settings-source-detail-foot">
                <button
                  type="button"
                  class="m-btn m-btn--secondary settings-source-sync"
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
          class="settings-panel glass-panel"
          role="tabpanel"
          aria-labelledby="settings-tab-status"
        >
          <header class="settings-panel-head">
            <div>
              <span class="settings-section-index">03 / STATUS</span>
              <h2>同步状态</h2>
            </div>
            <button
              type="button"
              class="m-btn m-btn--secondary settings-secondary"
              @click="exportConfig"
            >
              <IconGlyph name="fileDown" :size="15" />导出配置
            </button>
          </header>
          <div class="settings-status-list">
            <div
              v-for="row in statusRows"
              :key="row.id"
              class="settings-status-row"
            >
              <span
                :class="['settings-status-dot', statusClass(row.status)]"
              ></span
              ><strong>{{ row.label }}</strong
              ><span class="settings-status-message">{{
                row.status?.message || "尚未同步"
              }}</span
              ><small>{{
                row.status
                  ? `${statusText(row.status)} · ${row.status.count} 项`
                  : "等待操作"
              }}</small>
            </div>
          </div>
          <section class="settings-auto-refresh">
            <div>
              <h3>本地自动刷新</h3>
              <p>仅开发服务器运行期间生效</p>
            </div>
            <div class="settings-auto-refresh-control">
              <MoToggle
                v-model="config.autoRefresh.enabled"
                aria-label="启用本地开发自动刷新"
              />
              <SelectMenu
                v-model="config.autoRefresh.intervalHours"
                class="settings-auto-refresh-interval"
                label="间隔"
                :options="refreshIntervalOptions"
                :menu-min-width="124"
              />
            </div>
          </section>
          <div class="settings-snapshot-grid">
            <div>
              <small>本地配置</small><strong>.momona/localConfig.json</strong>
            </div>
            <div>
              <small>公开快照</small><strong>.momona/generated.json</strong>
            </div>
            <div>
              <small>最近写入</small><strong>{{ snapshotTime }}</strong>
            </div>
          </div>
          <footer class="settings-panel-foot">
            <span>Token 保存在本地凭据文件，不会进入公开快照。</span
            ><button
              type="button"
              class="m-btn m-btn--ghost settings-quiet-action"
              @click="activeTab = 'data'"
            >
              管理数据来源 <IconGlyph name="arrowRight" :size="14" />
            </button>
          </footer>
        </section>
      </main>
    </div>

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
            ><IconGlyph name="x" :size="17" /></span
          ><button
            type="button"
            class="settings-icon-button"
            aria-label="关闭错误提示"
            title="关闭错误提示"
            @click="closeSyncError"
          >
            <IconGlyph name="x" :size="15" />
          </button>
        </header>
        <div>
          <span class="settings-section-index">SYNC ERROR</span>
          <h2 id="settings-error-title">{{ syncError.title }}</h2>
          <p>{{ syncError.message }}</p>
          <small>已有页面数据已保留，可以检查设置后再次同步。</small>
        </div>
        <footer>
          <button
            type="button"
            class="m-btn m-btn--primary settings-primary"
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
.settings-page {
  position: relative;
  display: flex;
  height: 100%;
  min-height: 0;
  padding: 44px max(112px, calc(clamp(16px, 6vw, 96px) + 24px)) 72px
    clamp(16px, 6vw, 96px);
  flex-direction: column;
  overflow: hidden;
  color: var(--ink);
}
.settings-header,
.settings-shell {
  width: min(1180px, 100%);
  margin: 0 auto;
}
.settings-header {
  position: relative;
  display: flex;
  min-height: 63px;
  margin-bottom: 26px;
  flex: 0 0 auto;
  align-items: flex-end;
  gap: 20px;
}
.settings-heading {
  min-width: 0;
}
.settings-eyebrow,
.settings-section-index {
  color: var(--theme-strong);
  font-size: 0.56rem;
  font-weight: 800;
  letter-spacing: 0.13em;
}
.settings-heading h1 {
  margin: 4px 0 5px;
  font-size: clamp(1.55rem, 3vw, 2.2rem);
  line-height: 1;
}
.settings-header-actions {
  position: absolute;
  right: 0;
  bottom: 0;
  display: flex;
  min-width: 0;
  margin-left: 0;
  align-items: center;
  gap: 11px;
}
/* 颜色、悬停、按下全部交给通用控件层（.m-btn--*），这里只保留设置页的尺寸。 */
.settings-primary,
.settings-secondary,
.settings-quiet-action,
.settings-source-sync {
  min-height: 35px;
  padding: 0 12px;
  font-size: 0.62rem;
  font-weight: 750;
}
button:disabled {
  cursor: default;
  opacity: 0.48;
}
.settings-shell {
  display: grid;
  min-height: 0;
  flex: 1 1 auto;
  grid-template-columns: 176px minmax(0, 1fr);
  align-items: stretch;
  gap: 18px;
}
/* 侧栏与主内容区的毛玻璃材质统一交给全局 .glass-panel class，
   这里只保留布局，避免两套自定义底色/圆角/投影造成视觉不一致。 */
.settings-sidebar {
  display: flex;
  height: 100%;
  min-height: 0;
  align-self: stretch;
  padding: 10px 8px;
  flex-direction: column;
  gap: 6px;
}
.settings-sidebar-label {
  padding: 6px 10px 9px;
  color: var(--muted);
  font-size: 0.53rem;
  font-weight: 800;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}
.settings-tab {
  position: relative;
  display: flex;
  min-height: 42px;
  padding: 0 10px;
  align-items: center;
  gap: 9px;
  border: 0;
  border-radius: 9px;
  color: var(--muted-strong);
  background: transparent;
  font-size: 0.63rem;
  font-weight: 720;
  text-align: left;
  transition:
    color 0.18s ease,
    background 0.18s ease;
}
.settings-tab:hover {
  color: var(--theme-strong);
  background: rgba(255, 255, 255, 0.55);
}
.settings-tab.is-active {
  color: var(--theme-strong);
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 5px 12px rgba(54, 45, 106, 0.06);
}
.settings-tab.is-active::before {
  position: absolute;
  left: -8px;
  width: 3px;
  height: 19px;
  border-radius: 0 3px 3px 0;
  background: var(--theme);
  content: "";
}
.settings-tab span {
  flex: 1;
}

.settings-sidebar-brand {
  display: flex;
  align-self: center;
  justify-content: center;
  margin-top: auto;
  padding: 13px 10px 5px;
  border-top: 1px solid rgba(118, 126, 151, 0.1);
}
.settings-sidebar-brand strong {
  display: block;
  color: rgba(93, 105, 128, 0.72);
  font-size: 2rem;
  font-weight: bold;
  letter-spacing: 0.04em;
  font-family: "Momona Script";
}
.settings-main {
  min-width: 0;
  min-height: 0;
  overflow: visible;
}
.settings-panel {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  padding: 24px;
  overflow-x: hidden;
  overflow-y: auto;
  scrollbar-width: none;
}
.settings-panel-head {
  display: flex;
  min-height: 45px;
  margin-bottom: 24px;
  align-items: flex-start;
  justify-content: space-between;
  gap: 18px;
}
.settings-panel-head h2 {
  margin: 5px 0 0;
  font-size: 1.05rem;
}
.settings-site-preview {
  display: flex;
  min-width: 175px;
  padding: 8px 10px;
  align-items: center;
  gap: 9px;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.44);
}
.settings-site-preview > span:last-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}
.settings-site-preview strong,
.settings-site-preview small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.settings-site-preview strong {
  font-size: 0.62rem;
}
.settings-site-preview small {
  color: var(--muted);
  font-size: 0.5rem;
}
.settings-site-favicon {
  display: grid;
  width: 31px;
  height: 31px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 8px;
  color: var(--theme-strong);
  background: color-mix(in srgb, var(--theme) 10%, transparent);
  overflow: hidden;
}
.settings-site-favicon img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}
.settings-section-block + .settings-section-block-separated {
  margin-top: 26px;
  padding-top: 22px;
  border-top: 1px solid rgba(118, 126, 151, 0.14);
}
.settings-section-heading {
  display: flex;
  margin-bottom: 15px;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
  color: var(--theme-strong);
}
.settings-section-heading h3 {
  margin: 0;
  color: var(--ink);
  font-size: 0.79rem;
}
/* 只给真正需要的行为提示用，避免继承区块标题的强调色与字号。 */
.settings-section-hint {
  margin: 0;
  color: var(--muted);
  font-size: 0.56rem;
  line-height: 1.45;
}
.settings-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 11px;
}
.settings-form-grid-wide {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.settings-field-wide {
  grid-column: 1 / -1;
}
/* 主题色：预设色板、自定义取色与即时预览。 */
.settings-theme {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 210px;
  align-items: start;
  gap: 16px;
}
.settings-theme-presets,
.settings-theme-custom {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 7px;
}
.settings-theme-label {
  color: var(--muted);
  font-size: 0.55rem;
  font-weight: 700;
  letter-spacing: 0.08em;
}
.settings-theme-swatches {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.settings-theme-swatch {
  display: inline-flex;
  padding: 6px 11px 6px 8px;
  align-items: center;
  gap: 7px;
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 999px;
  color: var(--muted-strong);
  background: rgba(255, 255, 255, 0.52);
  font-size: 0.58rem;
  font-weight: 700;
  transition:
    color 0.18s ease,
    background 0.18s ease,
    transform 0.18s ease,
    box-shadow 0.18s ease;
}
.settings-theme-swatch:hover {
  color: var(--theme-strong);
  background: rgba(255, 255, 255, 0.86);
  transform: translateY(-1px);
}
.settings-theme-swatch.is-active {
  border-color: color-mix(in srgb, var(--theme) 42%, #ffffff);
  color: var(--theme-strong);
  background: var(--theme-wash);
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme) 13%, transparent);
}
.settings-theme-dot {
  width: 13px;
  height: 13px;
  border-radius: 50%;
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.72);
}
.settings-theme-custom-row {
  display: flex;
  align-items: center;
  gap: 7px;
}
.settings-page .settings-theme-picker {
  display: block;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.82);
  border-radius: 10px;
  background: #fff;
  box-shadow: 0 4px 10px color-mix(in srgb, var(--theme) 16%, transparent);
  cursor: pointer;
}
.settings-page .settings-theme-picker input[type="color"] {
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  border-radius: 0;
  background: transparent;
  cursor: pointer;
}
.settings-theme-picker input[type="color"]::-webkit-color-swatch-wrapper {
  padding: 0;
}
.settings-theme-picker input[type="color"]::-webkit-color-swatch {
  border: 0;
}
.settings-theme-preview {
  display: flex;
  margin-top: 12px;
  padding: 11px 12px;
  align-items: center;
  flex-wrap: wrap;
  gap: 9px;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.46);
}
.settings-theme-preview-tag {
  padding: 3px 9px;
  border-radius: 999px;
  color: var(--theme-strong);
  background: var(--theme-wash);
  font-size: 0.55rem;
  font-weight: 700;
}
.settings-theme-preview-link {
  color: var(--theme-strong);
  font-size: 0.58rem;
  font-weight: 700;
  text-decoration: underline;
  text-decoration-color: color-mix(in srgb, var(--theme) 45%, transparent);
  text-underline-offset: 3px;
}
/* 主题色卡片里的"主按钮"样例：必须用主色本体，这样换色时预览和真按钮一致。 */
.settings-theme-preview-button {
  margin-left: auto;
  padding: 6px 13px;
  border-radius: 9px;
  color: var(--theme-on);
  background: var(--theme);
  font-size: 0.56rem;
  font-weight: 700;
  box-shadow: 0 6px 12px color-mix(in srgb, var(--theme) 26%, transparent);
}
.settings-page label {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
  color: var(--muted-strong);
  font-size: 0.58rem;
  font-weight: 700;
}
/* 搜索框、取色器、色值输入仍用原生 input，但材质与自建组件保持同一套令牌。 */
.settings-page input,
.settings-page select,
.settings-page textarea {
  width: 100%;
  min-width: 0;
  padding: 0 10px;
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  outline: none;
  color: var(--ink);
  background: var(--glass-strong);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.62),
    0 2px 6px rgba(54, 45, 106, 0.05);
  font: inherit;
  font-size: 0.63rem;
}
.settings-page input,
.settings-page select {
  height: 36px;
}
.settings-page textarea {
  min-height: 70px;
  padding-top: 9px;
  padding-bottom: 9px;
  resize: vertical;
  line-height: 1.45;
}
.settings-page input:focus,
.settings-page select:focus,
.settings-page textarea:focus {
  border-color: color-mix(in srgb, var(--theme) 56%, transparent);
  background: #fff;
  box-shadow: 0 0 0 3px var(--theme-ring);
}
.settings-page input:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.settings-profile-layout {
  display: grid;
  grid-template-columns: 114px minmax(0, 1fr);
  gap: 18px;
  align-items: start;
}
.settings-profile-preview {
  display: flex;
  min-width: 0;
  padding-top: 2px;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  text-align: center;
}
.settings-profile-preview img {
  width: 68px;
  height: 68px;
  border: 3px solid rgba(255, 255, 255, 0.86);
  border-radius: 50%;
  object-fit: cover;
  box-shadow: 0 8px 18px rgba(54, 45, 106, 0.12);
}
.settings-profile-preview strong {
  max-width: 114px;
  overflow: hidden;
  font-size: 0.63rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.settings-profile-preview small {
  max-width: 114px;
  overflow: hidden;
  color: var(--muted);
  font-size: 0.5rem;
  line-height: 1.35;
  text-overflow: ellipsis;
}
/* 数据管理面板改为纵向 flex：工作区吃掉标题栏以外的全部剩余高度，
   两块玻璃卡随网格行拉伸到底，不再写死 560px 造成底部溢出或留白。 */
#settings-panel-data {
  display: flex;
  flex-direction: column;
}
#settings-panel-data .settings-panel-head {
  flex: 0 0 auto;
}
.settings-source-workspace {
  display: grid;
  min-height: 0;
  flex: 1 1 auto;
  grid-template-columns: 252px minmax(0, 1fr);
  grid-template-rows: minmax(0, 1fr);
  gap: 12px;
  align-items: stretch;
}
/* 次级玻璃卡沿用控制栏消息卡的配方：叠在近白的 .glass-panel 上时改用更透的
   --glass-soft，补白色发丝边、内高光/内暗边与紧凑柔光，并再模糊一次，
   靠材质与投影把边界刻出来，而不是靠与底板几乎相同的底色差。
   外阴影半径按面板 24px 内边距收敛，避免被 overflow 裁出硬边。 */
.settings-source-index,
.settings-source-detail {
  min-width: 0;
  min-height: 0;
  border: 1px solid var(--glass-border);
  border-radius: 15px;
  background: var(--glass-soft);
  box-shadow:
    /* inset 0 1px 0 rgba(255, 255, 255, 0.72),
    inset 0 -1px 0 rgba(54, 45, 106, 0.045), */ 0
    4px 12px rgba(54, 45, 106, 0.13);
  backdrop-filter: var(--glass-blur);
}
.settings-source-index {
  display: flex;
  padding: 13px;
  flex-direction: column;
  overflow: hidden;
}
.settings-source-index-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}
.settings-source-index-head h3 {
  margin: 4px 0 0;
  font-size: 0.76rem;
}
.settings-source-search {
  display: flex !important;
  height: 32px;
  margin-top: 12px;
  padding: 0 8px !important;
  flex-direction: row !important;
  align-items: center;
  gap: 6px;
  border: 1px solid rgba(125, 132, 163, 0.16);
  border-radius: 8px;
  color: var(--muted);
  background: rgba(255, 255, 255, 0.55);
}
.settings-source-search input {
  height: 100% !important;
  padding: 0 !important;
  border: 0 !important;
  box-shadow: none !important;
  background: transparent !important;
}
/* 筛选、开关、勾选框、下拉全部改用自建组件，这里只保留布局定位。 */
.settings-source-filters {
  margin-top: 8px;
}
.settings-source-list {
  display: grid;
  min-height: 0;
  margin-top: 9px;
  flex: 1;
  gap: 4px;
  overflow: auto;
  scrollbar-width: none;
}
.settings-source-list-item {
  display: flex;
  min-width: 0;
  min-height: 54px;
  align-items: stretch;
  /* 卡片已换成 --glass-soft，行要比容器更实一档才不会糊在一起。 */
  border: 1px solid rgba(255, 255, 255, 0.58);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.55);
  transition:
    border-color 0.18s ease,
    background 0.18s ease;
}
.settings-source-list-item:hover {
  border-color: color-mix(in srgb, var(--theme) 20%, transparent);
  background: rgba(255, 255, 255, 0.78);
}
.settings-source-list-item.is-selected {
  border-color: color-mix(in srgb, var(--theme) 36%, transparent);
  background: color-mix(in srgb, var(--theme) 9%, transparent);
  box-shadow: inset 3px 0 0 var(--theme);
}
.settings-source-list-item.is-disabled {
  opacity: 0.68;
}
.settings-source-select {
  display: flex;
  min-width: 0;
  flex: 1;
  padding: 7px 3px 7px 8px;
  align-items: center;
  gap: 7px;
  border: 0;
  color: var(--ink);
  background: transparent;
  text-align: left;
}
.settings-source-select:hover {
  color: var(--theme-strong);
}
.settings-source-select-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 3px;
}
.settings-source-select-copy strong,
.settings-source-select-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.settings-source-select-copy strong {
  font-size: 0.59rem;
}
.settings-source-select-copy small {
  color: var(--muted);
  font-size: 0.46rem;
}
.settings-source-list-status {
  display: inline-flex;
  max-width: 47px;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  color: var(--muted);
}
.settings-source-list-status i {
  width: 6px;
  height: 6px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--muted);
}
.settings-source-list-status em {
  overflow: hidden;
  font-size: 0.44rem;
  font-style: normal;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.settings-source-list-status.is-success i {
  background: var(--green);
}
.settings-source-list-status.is-error i {
  background: #df5a70;
}
.settings-source-list-status.is-cleared i {
  background: var(--theme);
}
/* 外层 span 负责拦住点击冒泡，避免切换启用状态时顺带选中该来源。 */
.settings-source-list-switch {
  display: inline-flex;
  margin: auto 8px auto 0;
  flex: 0 0 auto;
}
.settings-source-list-empty {
  margin: 16px 3px;
  color: var(--muted);
  font-size: 0.55rem;
  text-align: center;
}
.settings-source-detail {
  display: flex;
  padding: 18px;
  flex-direction: column;
  /* 极矮视口下工作区会被压短，让详情区自己滚动而不是溢出卡片外。 */
  overflow-y: auto;
  scrollbar-width: none;
}
.settings-source-detail-head {
  display: flex;
  margin-bottom: 14px;
  align-items: flex-start;
  justify-content: space-between;
  gap: 14px;
}
.settings-source-detail-title {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 10px;
}
.settings-source-detail-title > div {
  min-width: 0;
}
.settings-source-detail-title h3 {
  margin: 4px 0 0;
  font-size: 0.88rem;
}
.settings-source-detail-actions {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.settings-source-detail-actions .settings-source-status {
  white-space: nowrap;
}
.settings-source-detail-foot {
  display: flex;
  margin-top: auto;
  padding-top: 12px;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  border-top: 1px solid rgba(118, 126, 151, 0.13);
}
.settings-source-icon {
  display: grid;
  width: 31px;
  height: 31px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 9px;
  color: var(--theme-strong);
  background: color-mix(in srgb, var(--theme) 11%, transparent);
}
.settings-source-fields {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 150px;
  gap: 9px;
}
.settings-source-fields .settings-field-wide {
  grid-column: 1 / -1;
}
.settings-source-adapter {
  margin-top: 13px;
  padding-top: 12px;
  border-top: 1px solid rgba(118, 126, 151, 0.13);
}
.settings-source-adapter-head {
  display: flex;
  min-height: 26px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--muted-strong);
  font-size: 0.56rem;
  font-weight: 750;
}
.settings-source-status {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 5px;
  color: var(--muted-strong);
  font-size: 0.54rem;
}
.settings-source-status i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--muted);
}
.settings-source-status small {
  color: var(--muted);
  font-size: 0.5rem;
}
.settings-source-status.is-success i {
  background: var(--green);
}
.settings-source-status.is-error i {
  background: #df5a70;
}
.settings-source-sync {
  min-height: 30px;
  padding: 0 8px;
  font-size: 0.54rem;
}
.settings-icon-button {
  display: grid;
  width: 30px;
  height: 30px;
  padding: 0;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.82);
  border-radius: 8px;
  color: var(--muted-strong);
  background: rgba(255, 255, 255, 0.62);
}
.settings-icon-button:hover {
  border-color: var(--theme-line);
  color: var(--theme-strong);
  background: #fff;
}
.settings-panel-foot {
  display: flex;
  margin-top: 15px;
  padding-top: 12px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-top: 1px solid rgba(118, 126, 151, 0.13);
  color: var(--muted);
  font-size: 0.54rem;
}
.settings-adapter-count {
  min-width: 30px;
  padding: 5px 7px;
  border-radius: 7px;
  color: var(--theme-strong);
  background: color-mix(in srgb, var(--theme) 10%, transparent);
  font-size: 0.52rem;
  text-align: center;
}
.settings-content-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin-top: 13px;
  padding-top: 11px;
  border-top: 1px solid rgba(118, 126, 151, 0.13);
}
.settings-source-scope {
  display: grid;
  gap: 7px;
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(118, 126, 151, 0.13);
}
.settings-source-scope-label {
  color: var(--muted-strong);
  font-size: 0.56rem;
  font-weight: 700;
}
.settings-source-sort {
  width: 190px;
  max-width: 100%;
  margin-top: 5px;
}
.settings-extra-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 11px;
  margin-top: 13px;
}
.settings-extra-head {
  margin-bottom: 14px;
}
.settings-extra-head > svg {
  color: var(--theme-strong);
}
.settings-inline-actions {
  display: flex;
  min-height: 31px;
  margin-top: 12px;
  align-items: center;
  flex-wrap: wrap;
  gap: 9px;
}
.settings-inline-status {
  min-width: 0;
  overflow: hidden;
  color: var(--muted-strong);
  font-size: 0.55rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.settings-inline-error {
  margin: 9px 0 0;
  color: #bd455b;
  font-size: 0.55rem;
  overflow-wrap: anywhere;
}
.settings-inline-toggle {
  display: inline-flex !important;
  margin: 0 !important;
  flex-direction: row !important;
  align-items: center;
  gap: 6px;
  cursor: pointer;
}
.settings-inline-toggle input {
  width: 15px !important;
  height: 15px;
  accent-color: var(--theme);
}
.settings-inline-toggle span {
  color: var(--muted-strong);
  font-size: 0.55rem;
}
/* 与数据管理同理：状态页改为纵向 flex，状态列表吃掉剩余高度，
   行卡用 1fr 均匀铺满，页脚落到面板底部，不再整体溢出被裁。 */
#settings-panel-status {
  display: flex;
  flex-direction: column;
}
#settings-panel-status .settings-panel-head {
  flex: 0 0 auto;
}
.settings-status-list {
  display: grid;
  min-height: 0;
  flex: 1 1 auto;
  grid-auto-rows: minmax(34px, 1fr);
  gap: 6px;
}
/* 次级卡统一沿用控制栏消息卡配方：更透的玻璃底 + 白色发丝边 +
   内高光 / 内暗边 + 紧凑柔光 + 二次模糊，靠材质把边界从近白面板里刻出来。 */
.settings-status-row,
.settings-auto-refresh,
.settings-snapshot-grid > div {
  border: 1px solid var(--glass-border);
  background: var(--glass-soft);
  box-shadow:
    /* inset 0 1px 0 rgba(255, 255, 255, 0.72),
    inset 0 -1px 0 rgba(54, 45, 106, 0.045), */ 0
    3px 8px rgba(54, 45, 106, 0.11);
  backdrop-filter: var(--glass-blur);
}
.settings-status-row {
  display: grid;
  grid-template-columns: 8px 82px minmax(0, 1fr) auto;
  min-height: 34px;
  padding: 0 10px;
  align-items: center;
  gap: 9px;
  border-radius: 9px;
  font-size: 0.57rem;
}
.settings-status-row strong {
  font-size: 0.59rem;
}
.settings-status-message {
  overflow: hidden;
  color: var(--muted-strong);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.settings-status-row small {
  color: var(--muted);
  font-size: 0.52rem;
  white-space: nowrap;
}
.settings-status-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--muted);
}
.settings-status-dot.is-success {
  background: var(--green);
}
.settings-status-dot.is-error {
  background: #df5a70;
}
.settings-auto-refresh {
  display: flex;
  margin-top: 16px;
  padding: 13px 14px;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  border-radius: 15px;
}
.settings-auto-refresh h3 {
  margin: 4px 0;
  font-size: 0.72rem;
}
.settings-auto-refresh p {
  max-width: 680px;
  margin: 0;
  color: var(--muted-strong);
  font-size: 0.55rem;
  line-height: 1.45;
}
.settings-auto-refresh-control {
  display: flex;
  min-width: 154px;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
}
.settings-auto-refresh-interval {
  width: 112px;
  flex: 0 0 auto;
}
.settings-snapshot-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
  margin-top: 16px;
}
.settings-snapshot-grid div {
  display: flex;
  min-height: 58px;
  padding: 10px;
  flex-direction: column;
  justify-content: center;
  gap: 5px;
  border-radius: 12px;
}
.settings-snapshot-grid small {
  color: var(--muted);
  font-size: 0.51rem;
}
.settings-snapshot-grid strong {
  overflow: hidden;
  font-size: 0.59rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.settings-modal-backdrop {
  position: fixed;
  z-index: 40;
  inset: 0;
  display: grid;
  padding: 18px;
  place-items: center;
  background: rgba(38, 39, 72, 0.22);
  backdrop-filter: blur(5px);
}
.settings-error-modal {
  width: min(420px, 100%);
  padding: 18px;
  border: 1px solid rgba(255, 255, 255, 0.9);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 22px 60px rgba(42, 39, 89, 0.24);
}
.settings-error-modal > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.settings-error-icon {
  display: grid;
  width: 31px;
  height: 31px;
  place-items: center;
  border-radius: 9px;
  color: #bd455b;
  background: rgba(223, 90, 112, 0.12);
}
.settings-error-modal > div {
  padding: 17px 3px 7px;
}
.settings-error-modal h2 {
  margin: 5px 0 8px;
  font-size: 1rem;
}
.settings-error-modal p,
.settings-error-modal small {
  display: block;
  margin: 0;
  color: var(--muted-strong);
  font-size: 0.62rem;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
.settings-error-modal small {
  margin-top: 9px;
  color: var(--muted);
  font-size: 0.54rem;
}
.settings-error-modal > footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}
@media (max-width: 1199px) and (min-width: 821px) {
  .settings-source-workspace {
    grid-template-columns: 220px minmax(0, 1fr);
  }
}
@media (max-width: 820px) {
  .settings-page {
    padding: 76px 14px 96px;
  }
  .settings-header {
    flex-direction: column;
    align-items: flex-start;
  }
  .settings-header-actions {
    right: 0;
    bottom: 0;
    width: 100%;
    margin-left: 0;
    flex-direction: row;
    align-items: center;
    justify-content: flex-end;
    gap: 6px;
  }
  .settings-shell {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }
  .settings-sidebar {
    display: grid;
    height: auto;
    flex: 0 0 auto;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 3px;
    padding: 6px;
  }
  .settings-sidebar-label,
  .settings-sidebar-brand {
    display: none;
  }
  .settings-tab {
    min-height: 42px;
    padding: 0 4px;
    flex-direction: column;
    justify-content: center;
    gap: 3px;
    font-size: 0.5rem;
    text-align: center;
  }
  .settings-tab span {
    flex: 0 0 auto;
  }
  .settings-tab.is-active::before {
    top: auto;
    right: 22%;
    bottom: -6px;
    left: 22%;
    width: auto;
    height: 3px;
    border-radius: 3px 3px 0 0;
  }
  .settings-panel {
    padding: 15px;
  }
  .settings-panel-head {
    flex-direction: column;
  }
  .settings-site-preview {
    align-self: flex-start;
  }
  /* 小屏回到自然高度的内容流：两块卡上下排列，由面板整体滚动，
     不再强行拉伸工作区。 */
  #settings-panel-data {
    display: block;
  }
  .settings-source-workspace {
    flex: 0 0 auto;
    grid-template-columns: 1fr;
    grid-template-rows: auto auto;
  }
  .settings-source-index,
  .settings-source-detail {
    height: auto;
    min-height: 0;
  }
  .settings-source-index {
    max-height: min(360px, 42dvh);
  }
  .settings-source-list {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    overflow: auto;
  }
  .settings-source-detail-head {
    flex-direction: column;
  }
  .settings-source-detail-actions {
    width: 100%;
    justify-content: space-between;
  }
  .settings-profile-layout,
  .settings-extra-grid {
    grid-template-columns: 1fr;
  }
  .settings-profile-preview {
    flex-direction: row;
    text-align: left;
  }
  .settings-profile-preview img {
    width: 52px;
    height: 52px;
  }
  .settings-profile-preview strong,
  .settings-profile-preview small {
    max-width: none;
  }
  .settings-form-grid,
  .settings-form-grid-wide {
    grid-template-columns: 1fr;
  }
  .settings-field-wide {
    grid-column: auto;
  }
  .settings-source-fields {
    grid-template-columns: minmax(0, 1fr);
  }
  .settings-source-fields .settings-field-wide {
    grid-column: 1 / -1;
  }
  .settings-panel-foot,
  .settings-auto-refresh {
    align-items: flex-start;
    flex-direction: column;
  }
  .settings-snapshot-grid {
    grid-template-columns: 1fr;
  }
  .settings-theme {
    grid-template-columns: 1fr;
  }
  .settings-auto-refresh-control {
    width: 100%;
    justify-content: flex-start;
  }
  /* 小屏恢复自然高度的内容流，状态列表不再纵向拉伸。 */
  #settings-panel-status {
    display: block;
  }
  .settings-status-list {
    flex: 0 0 auto;
    grid-auto-rows: auto;
  }
  .settings-status-row {
    grid-template-columns: 8px 1fr auto;
    gap: 7px;
    padding: 7px 9px;
  }
  .settings-status-message {
    grid-column: 2 / -1;
  }

  .settings-header {
    gap: 8px;
  }
  .settings-heading h1 {
    font-size: 1.45rem;
  }
  .settings-header-actions .settings-primary {
    padding-inline: 9px;
  }
  .settings-source-list {
    grid-template-columns: 1fr;
  }
  .settings-source-fields,
  .settings-content-options {
    grid-template-columns: 1fr;
  }
  .settings-source-detail {
    padding: 13px;
  }
  .settings-source-detail-actions {
    align-items: flex-start;
    flex-direction: column;
  }
  .settings-source-detail-foot {
    align-items: flex-start;
    flex-direction: column;
  }
  .settings-source-detail-foot .settings-source-sync {
    width: 100%;
  }
}
</style>
