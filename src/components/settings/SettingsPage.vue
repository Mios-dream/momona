<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import type {
  DataSourceId,
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
import IconGlyph from "../app/IconGlyph.vue";

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
const message = ref("");
const messageTone = ref<"success" | "error" | "neutral">("neutral");
const syncError = ref<{ title: string; message: string } | null>(null);
const sourceSnapshotStatuses = ref<Record<DataSourceId, SourceSnapshotInfo>>(
  emptySourceSnapshotStatuses(),
);
type SourceFilter = "all" | "enabled" | "disabled";

const selectedSourceId = ref<DataSourceId>(sourceCards[0]?.id ?? "bangumi");
const sourceFilter = ref<SourceFilter>("all");
const sourceQuery = ref("");
const musicBusy = ref(false);
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
    messageTone.value = "success";
    message.value = `${musicPlatformLabel(result.platform)}歌单已读取：${result.track.title}`;
  } catch (error) {
    musicError.value = String(error instanceof Error ? error.message : error);
    messageTone.value = "error";
    message.value = "音乐歌单读取失败";
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
    messageTone.value = "success";
    message.value = `${gameName.value}账号已读取：${result.account.nickname}`;
  } catch (error) {
    gameError.value = String(error instanceof Error ? error.message : error);
    messageTone.value = "error";
    message.value = "游戏账号读取失败";
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
  messageTone.value = "neutral";
  message.value = "正在保存本地设置";
  try {
    const data = await saveSiteSnapshot();
    emit("config-change", cloneLocalConfig(config.value), false);
    messageTone.value = "success";
    message.value = `已保存 · ${data.libraryTiles.length} 个资料项`;
  } catch (error) {
    messageTone.value = "error";
    message.value = `保存失败：${String(error instanceof Error ? error.message : error)}`;
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
  messageTone.value = "neutral";
  message.value = `正在同步 ${source?.title ?? sourceLabels[sourceId]}`;
  try {
    const result = await requestJson<{
      siteData: SiteData;
      sourceStatus: ProviderStatus;
    }>("/__momona/sync-source", { config: config.value, sourceId });
    const status = result.sourceStatus;
    cachePreview(result.siteData);
    messageTone.value = status.status === "error" ? "error" : "success";
    message.value =
      status.status === "error"
        ? `${source?.title ?? sourceLabels[sourceId]} 同步失败；旧数据已保留`
        : `${source?.title ?? sourceLabels[sourceId]} 已同步 · ${status.count} 项`;
    if (status.status === "error") {
      showSyncError(
        `${source?.title ?? sourceLabels[sourceId]} 同步失败`,
        status.message,
      );
    }
  } catch (error) {
    messageTone.value = "error";
    message.value = `${source?.title ?? sourceLabels[sourceId]} 请求失败`;
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
  messageTone.value = "success";
  message.value = "配置文件已导出";
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
        <p>站点身份、数据管理与同步状态</p>
      </div>
      <div class="settings-header-actions">
        <span
          v-if="message"
          :class="['settings-notice', `is-${messageTone}`]"
          aria-live="polite"
          >{{ message }}</span
        >
        <button
          type="button"
          class="settings-primary"
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
      <nav class="settings-sidebar" role="tablist" aria-label="设置分类">
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
          class="settings-panel"
          role="tabpanel"
          aria-labelledby="settings-tab-profile"
        >
          <header class="settings-panel-head">
            <div>
              <span class="settings-section-index">01 / GENERAL</span>
              <h2>基础设置</h2>
              <p>页面标题与个人资料会成为所有页面的统一身份。</p>
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
                <p>这些内容只负责网站身份，不影响数据同步。</p>
              </div>
              <IconGlyph name="globe" :size="17" />
            </div>
            <div class="settings-form-grid settings-form-grid-wide">
              <label
                >网站标题<input
                  v-model="config.site.title"
                  type="text"
                  placeholder="Love on the page"
              /></label>
              <label
                >Favicon 地址<input
                  v-model="config.site.favicon"
                  type="url"
                  placeholder="/favicon.svg"
              /></label>
              <label class="settings-field-wide"
                >网站描述<textarea
                  v-model="config.site.description"
                  rows="3"
                  placeholder="一个静态的个人数字生活展示入口。"
                ></textarea>
              </label>
            </div>
          </section>

          <section
            class="settings-section-block settings-section-block-separated"
          >
            <div class="settings-section-heading">
              <div>
                <h3>个人资料</h3>
                <p>显示在首页状态栏、问候和个人相关卡片中。</p>
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
                <label
                  >显示名称<input
                    v-model="config.account.name"
                    type="text"
                    placeholder="例如：三三 sama"
                /></label>
                <label
                  >英文名 / 用户名<input
                    v-model="config.account.latinName"
                    type="text"
                    placeholder="例如：@miosdream"
                /></label>
                <label class="settings-field-wide"
                  >签名<input
                    v-model="config.account.motto"
                    type="text"
                    placeholder="一句想展示在首页的话"
                /></label>
                <label class="settings-field-wide"
                  >头像地址<input
                    v-model="config.account.avatar"
                    type="url"
                    placeholder="/assets/avatar.jpg"
                /></label>
              </div>
            </div>
          </section>
        </section>

        <section
          v-else-if="activeTab === 'data'"
          id="settings-panel-data"
          class="settings-panel"
          role="tabpanel"
          aria-labelledby="settings-tab-data"
        >
          <header class="settings-panel-head">
            <div>
              <span class="settings-section-index">02 / DATA</span>
              <h2>数据管理</h2>
              <p>统一管理来源与同步内容，组件会自动读取统一快照。</p>
            </div>
          </header>

          <div class="settings-source-workspace">
            <aside class="settings-source-index" aria-label="数据来源列表">
              <header class="settings-source-index-head">
                <div>
                  <span class="settings-section-index">PLATFORMS</span>
                  <h3>数据来源</h3>
                  <p>选择平台后编辑同步范围。</p>
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
              <div
                class="settings-source-filters"
                role="tablist"
                aria-label="来源筛选"
              >
                <button
                  type="button"
                  role="tab"
                  :aria-selected="sourceFilter === 'all'"
                  :class="{ 'is-active': sourceFilter === 'all' }"
                  @click="sourceFilter = 'all'"
                >
                  全部
                </button>
                <button
                  type="button"
                  role="tab"
                  :aria-selected="sourceFilter === 'enabled'"
                  :class="{ 'is-active': sourceFilter === 'enabled' }"
                  @click="sourceFilter = 'enabled'"
                >
                  已启用
                </button>
                <button
                  type="button"
                  role="tab"
                  :aria-selected="sourceFilter === 'disabled'"
                  :class="{ 'is-active': sourceFilter === 'disabled' }"
                  @click="sourceFilter = 'disabled'"
                >
                  未启用
                </button>
              </div>
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
                  <label
                    class="settings-source-list-switch"
                    :aria-label="`启用 ${source.title}`"
                    @click.stop
                  >
                    <input
                      v-model="config.sources[source.id].enabled"
                      type="checkbox"
                    />
                    <span></span>
                  </label>
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
                    <p>{{ selectedSource.description }}</p>
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
              <div class="settings-source-summary">
                <span
                  ><small>同步内容</small
                  ><strong>{{
                    adapterLabel(selectedSource.id) || "未选择内容"
                  }}</strong></span
                ><span
                  ><small>来源状态</small
                  ><strong>{{
                    sourceSnapshotText(
                      sourceSnapshotStatuses[selectedSource.id],
                    )
                  }}</strong></span
                ><span
                  ><small>同步上限</small
                  ><strong
                    >{{ config.sources[selectedSource.id].limit }} 项</strong
                  ></span
                >
              </div>
              <div class="settings-source-fields">
                <label
                  >{{ selectedSource.accountLabel
                  }}<input
                    v-model="
                      config.sources[selectedSource.id][
                        selectedSource.accountKey
                      ]
                    "
                    type="text"
                    :placeholder="selectedSource.placeholder"
                /></label>
                <label
                  >同步数量上限<input
                    v-model.number="config.sources[selectedSource.id].limit"
                    type="number"
                    min="1"
                    max="120"
                /></label>
                <label v-if="selectedSource.token" class="settings-field-wide"
                  >Token（仅本地）<input
                    v-model="config.sources[selectedSource.id].token"
                    type="password"
                    autocomplete="off"
                    :placeholder="
                      selectedSource.id === 'steam'
                        ? '可选，Steam Web API Key'
                        : '可选，用于提高 GitHub 限额'
                    "
                /></label>
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
                  <label
                    v-for="option in selectedSource.contentOptions"
                    :key="option.key"
                    class="settings-content-option"
                    ><input
                      v-model="
                        config.sources[selectedSource.id].content[option.key]
                      "
                      type="checkbox"
                    /><span
                      ><strong>{{ option.label }}</strong
                      ><small>{{ option.description }}</small></span
                    ></label
                  >
                </div>
                <div
                  v-if="selectedSource.id === 'github'"
                  class="settings-source-scope"
                >
                  <span class="settings-source-scope-label">仓库适配</span>
                  <div
                    class="settings-source-scope-control"
                    role="radiogroup"
                    aria-label="GitHub 仓库范围"
                  >
                    <label
                      ><input
                        v-model="
                          config.sources.github.content.githubRepositoryScope
                        "
                        type="radio"
                        value="all"
                      /><span>全部公开仓库</span></label
                    ><label
                      ><input
                        v-model="
                          config.sources.github.content.githubRepositoryScope
                        "
                        type="radio"
                        value="pinned"
                      /><span>Pinned 仓库</span></label
                    >
                  </div>
                  <label class="settings-source-sort"
                    >仓库展示顺序<select
                      v-model="
                        config.sources.github.content.githubRepositorySort
                      "
                    >
                      <option value="updated">最近更新</option>
                      <option value="stars">Star 优先</option>
                      <option value="forks">Fork 优先</option>
                      <option value="name">名称排序</option>
                    </select></label
                  >
                </div>
              </div>
              <footer class="settings-source-detail-foot">
                <button
                  type="button"
                  class="settings-source-sync"
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
          class="settings-panel"
          role="tabpanel"
          aria-labelledby="settings-tab-status"
        >
          <header class="settings-panel-head">
            <div>
              <span class="settings-section-index">03 / STATUS</span>
              <h2>同步状态</h2>
              <p>查看来源最近一次结果；失败不会清空已有快照。</p>
            </div>
            <button
              type="button"
              class="settings-secondary"
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
              <span class="settings-section-index">LOCAL AUTOMATION</span>
              <h3>本地自动刷新</h3>
              <p>只在开发服务器运行期间按间隔重新同步已启用来源。</p>
            </div>
            <div class="settings-auto-refresh-control">
              <label class="settings-switch" aria-label="启用本地开发自动刷新"
                ><input
                  v-model="config.autoRefresh.enabled"
                  type="checkbox" /><span></span></label
              ><label
                >间隔<select v-model.number="config.autoRefresh.intervalHours">
                  <option :value="6">每 6 小时</option>
                  <option :value="12">每 12 小时</option>
                  <option :value="24">每天</option>
                </select></label
              >
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
              class="settings-quiet-action"
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
            class="settings-primary"
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
  color: var(--purple-deep);
  font-size: 0.56rem;
  font-weight: 800;
  letter-spacing: 0.13em;
}
.settings-heading h1 {
  margin: 4px 0 5px;
  font-size: clamp(1.55rem, 3vw, 2.2rem);
  line-height: 1;
}
.settings-heading p {
  margin: 0;
  color: var(--muted-strong);
  font-size: 0.68rem;
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
.settings-notice {
  max-width: 340px;
  overflow: hidden;
  color: var(--muted-strong);
  font-size: 0.58rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.settings-notice.is-success {
  color: #26825e;
}
.settings-notice.is-error {
  color: #bd455b;
}
.settings-primary,
.settings-secondary,
.settings-quiet-action,
.settings-source-sync {
  display: inline-flex;
  min-height: 35px;
  padding: 0 12px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid rgba(255, 255, 255, 0.82);
  border-radius: 9px;
  font-size: 0.62rem;
  font-weight: 750;
  white-space: nowrap;
}
.settings-primary {
  border: 0;
  color: #fff;
  background: var(--purple-deep);
  box-shadow: 0 9px 18px rgba(85, 65, 181, 0.2);
}
.settings-primary:hover:not(:disabled) {
  background: #47349d;
}
.settings-secondary,
.settings-quiet-action {
  color: var(--purple-deep);
  background: rgba(255, 255, 255, 0.64);
}
.settings-secondary:hover:not(:disabled),
.settings-quiet-action:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.94);
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
.settings-sidebar {
  display: flex;
  height: 100%;
  min-height: 0;
  align-self: stretch;
  padding: 10px 8px;
  flex-direction: column;
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.38);
  box-shadow: 0 14px 32px rgba(54, 45, 106, 0.08);
  backdrop-filter: blur(18px) saturate(132%);
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
  color: var(--purple-deep);
  background: rgba(255, 255, 255, 0.55);
}
.settings-tab.is-active {
  color: var(--purple-deep);
  background: rgba(255, 255, 255, 0.82);
  box-shadow: 0 5px 12px rgba(54, 45, 106, 0.06);
}
.settings-tab.is-active::before {
  position: absolute;
  left: -8px;
  width: 3px;
  height: 19px;
  border-radius: 0 3px 3px 0;
  background: var(--pink);
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
  border: 1px solid var(--glass-border);
  border-radius: 16px;
  background: var(--glass);
  box-shadow: var(--glass-shadow);
  backdrop-filter: blur(18px) saturate(132%);
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
  margin: 5px 0 5px;
  font-size: 1.05rem;
}
.settings-panel-head p {
  margin: 0;
  color: var(--muted-strong);
  font-size: 0.62rem;
  line-height: 1.45;
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
  color: var(--purple-deep);
  background: rgba(117, 100, 222, 0.1);
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
  color: var(--purple-deep);
}
.settings-section-heading h3,
.settings-extra-head h3 {
  margin: 0 0 4px;
  color: var(--ink);
  font-size: 0.79rem;
}
.settings-section-heading p,
.settings-extra-head p {
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
.settings-page label {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
  color: var(--muted-strong);
  font-size: 0.58rem;
  font-weight: 700;
}
.settings-page input,
.settings-page select,
.settings-page textarea {
  width: 100%;
  min-width: 0;
  padding: 0 10px;
  border: 1px solid rgba(125, 132, 163, 0.18);
  border-radius: 8px;
  outline: none;
  color: var(--ink);
  background: rgba(255, 255, 255, 0.65);
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
  border-color: rgba(117, 100, 222, 0.56);
  box-shadow: 0 0 0 3px rgba(117, 100, 222, 0.1);
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
.settings-source-workspace {
  display: grid;
  grid-template-columns: 252px minmax(0, 1fr);
  gap: 12px;
  align-items: stretch;
}
.settings-source-index,
.settings-source-detail,
.settings-extra-card {
  min-width: 0;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.4);
}
.settings-source-index,
.settings-source-detail {
  height: 560px;
  box-sizing: border-box;
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
  margin: 4px 0 3px;
  font-size: 0.76rem;
}
.settings-source-index-head p {
  margin: 0;
  color: var(--muted);
  font-size: 0.52rem;
  line-height: 1.4;
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
.settings-source-filters {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 4px;
  margin-top: 8px;
}
.settings-source-filters button {
  display: flex;
  min-width: 0;
  min-height: 28px;
  padding: 0 5px;
  align-items: center;
  justify-content: center;
  gap: 3px;
  border: 0;
  border-radius: 7px;
  color: var(--muted);
  background: transparent;
  font-size: 0.49rem;
  font-weight: 700;
}
.settings-source-filters button:hover,
.settings-source-filters button.is-active {
  color: var(--purple-deep);
  background: rgba(117, 100, 222, 0.1);
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
  border: 1px solid transparent;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.42);
  transition:
    border-color 0.18s ease,
    background 0.18s ease;
}
.settings-source-list-item:hover {
  border-color: rgba(117, 100, 222, 0.2);
  background: rgba(255, 255, 255, 0.7);
}
.settings-source-list-item.is-selected {
  border-color: rgba(117, 100, 222, 0.36);
  background: rgba(117, 100, 222, 0.09);
  box-shadow: inset 3px 0 0 var(--purple);
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
  color: var(--purple-deep);
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
  background: var(--purple);
}
.settings-source-list-switch {
  position: relative;
  display: inline-flex !important;
  width: 30px;
  height: 18px;
  margin: auto 8px auto 0;
  flex: 0 0 auto;
  flex-direction: row !important;
  cursor: pointer;
}
.settings-source-list-switch input {
  position: absolute;
  z-index: 2;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}
.settings-source-list-switch > span {
  position: relative;
  display: block;
  width: 30px;
  height: 18px;
  border-radius: 12px;
  background: rgba(118, 126, 151, 0.25);
  pointer-events: none;
  transition: background 0.18s ease;
}
.settings-source-list-switch > span::after {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 4px rgba(38, 39, 72, 0.16);
  content: "";
  transition: transform 0.18s ease;
}
.settings-source-list-switch input:checked + span {
  background: var(--purple);
}
.settings-source-list-switch input:checked + span::after {
  transform: translateX(12px);
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
}
.settings-source-detail-head {
  display: flex;
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
  margin: 4px 0 3px;
  font-size: 0.88rem;
}
.settings-source-detail-title p {
  margin: 0;
  color: var(--muted);
  font-size: 0.54rem;
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
  color: var(--purple-deep);
  background: rgba(117, 100, 222, 0.11);
}
.settings-source-summary {
  display: grid;
  grid-template-columns: 1.5fr 0.9fr 0.8fr;
  gap: 7px;
  margin-bottom: 14px;
  padding: 8px 0;
  border-top: 1px solid rgba(118, 126, 151, 0.13);
  border-bottom: 1px solid rgba(118, 126, 151, 0.13);
}
.settings-source-summary span {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}
.settings-source-summary small {
  color: var(--muted);
  font-size: 0.48rem;
}
.settings-source-summary strong {
  overflow: hidden;
  color: var(--muted-strong);
  font-size: 0.55rem;
  text-overflow: ellipsis;
  white-space: nowrap;
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
.settings-switch {
  position: relative;
  display: inline-flex !important;
  width: 34px;
  height: 20px;
  flex-direction: row !important;
  cursor: pointer;
}
.settings-switch input {
  position: absolute;
  z-index: 2;
  inset: 0;
  width: 100%;
  height: 100%;
  margin: 0;
  opacity: 0;
  cursor: pointer;
}
.settings-switch > span {
  position: relative;
  display: block;
  width: 34px;
  height: 20px;
  border-radius: 12px;
  background: rgba(118, 126, 151, 0.25);
  pointer-events: none;
  transition: background 0.18s ease;
}
.settings-switch > span::after {
  position: absolute;
  top: 3px;
  left: 3px;
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 4px rgba(38, 39, 72, 0.16);
  content: "";
  transition: transform 0.18s ease;
}
.settings-switch input:checked + span {
  background: var(--purple);
}
.settings-switch input:checked + span::after {
  transform: translateX(14px);
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
.settings-source-sync {
  color: var(--purple-deep);
  background: rgba(255, 255, 255, 0.72);
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
  color: var(--purple-deep);
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
  color: var(--purple-deep);
  background: rgba(117, 100, 222, 0.1);
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
.settings-content-option {
  display: flex !important;
  min-height: 38px;
  padding: 6px 7px;
  flex-direction: row !important;
  align-items: center;
  gap: 7px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.46);
  cursor: pointer;
}
.settings-content-option > input {
  width: 15px !important;
  height: 15px;
  flex: 0 0 auto;
  accent-color: var(--purple);
}
.settings-content-option > span {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}
.settings-content-option strong,
.settings-content-option small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.settings-content-option strong {
  color: var(--ink-soft);
  font-size: 0.55rem;
}
.settings-content-option small {
  color: var(--muted);
  font-size: 0.48rem;
  font-weight: 500;
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
.settings-source-scope-control {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 5px;
}
.settings-source-scope-control label {
  position: relative;
  display: flex !important;
  min-height: 31px;
  padding: 0 8px;
  flex-direction: row !important;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(125, 132, 163, 0.16);
  border-radius: 8px;
  color: var(--muted-strong);
  background: rgba(255, 255, 255, 0.42);
  cursor: pointer;
  font-size: 0.53rem;
}
.settings-source-scope-control label:has(input:checked) {
  border-color: rgba(117, 100, 222, 0.42);
  color: var(--purple-deep);
  background: rgba(117, 100, 222, 0.1);
}
.settings-source-scope-control input {
  position: absolute;
  width: 1px !important;
  height: 1px !important;
  opacity: 0;
  pointer-events: none;
}
.settings-source-sort {
  max-width: 190px;
  margin-top: 5px;
}
.settings-source-sort select {
  height: 31px;
  font-size: 0.55rem;
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
  color: var(--purple-deep);
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
  accent-color: var(--purple);
}
.settings-inline-toggle span {
  color: var(--muted-strong);
  font-size: 0.55rem;
}
.settings-status-list {
  display: grid;
  gap: 6px;
}
.settings-status-row {
  display: grid;
  grid-template-columns: 8px 82px minmax(0, 1fr) auto;
  min-height: 39px;
  padding: 0 10px;
  align-items: center;
  gap: 9px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.46);
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
  border: 1px solid rgba(117, 100, 222, 0.14);
  border-radius: 10px;
  background: rgba(249, 248, 255, 0.52);
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
.settings-auto-refresh-control > label:last-child {
  min-width: 106px;
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
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.42);
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
  .settings-notice {
    min-width: 0;
    max-width: none;
    flex: 1 1 auto;
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
  .settings-source-workspace {
    grid-template-columns: 1fr;
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
  .settings-auto-refresh-control {
    width: 100%;
    justify-content: flex-start;
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
