<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type {
  DataSourceId,
  HoyoGame,
  IconName,
  LibraryFilter,
  LocalConfig,
  ManualLibraryItem,
  ProviderStatus,
  RepositorySummary,
  SiteData,
  SourceSnapshotInfo,
  SourceContentConfig,
} from "../../data/types";
import { cloneLocalConfig, normalizeLocalConfig } from "../../data/localConfig";
import { sourceLabels } from "../../lib/dataSources/index";
import {
  musicResultToSettings,
  normalizeMusicPlaylist,
  parseMusicPlaylistReference,
  musicPlatformLabel,
} from "../../lib/music";
import IconGlyph from "../app/IconGlyph.vue";

interface Props {
  /** AppShell 提供的构建期配置，避免设置页维护第二份默认状态。 */
  localConfig: LocalConfig;
  /** AppShell 提供的当前公开快照，用于首屏状态和预览。 */
  siteData: SiteData;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  /** 保存完成后同步应用壳层，但不再重复发起一次保存请求。 */
  "config-change": [config: LocalConfig, persist?: boolean];
}>();

interface SourceCard {
  id: DataSourceId;
  title: string;
  description: string;
  hint: string;
  accountLabel: string;
  accountKey: "username" | "userId";
  placeholder: string;
  token: boolean;
  icon: IconName;
  contentHint: string;
  contentOptions: Array<{
    key: keyof SourceContentConfig;
    label: string;
    description: string;
  }>;
}

type SettingsTab = "profile" | "sources" | "components" | "content" | "status";

interface SourcePreview {
  sourceId: DataSourceId;
  status: SourceSnapshotInfo;
  samples: Array<{
    id: string;
    title: string;
    subtitle: string;
    cover: string;
    type: string;
    url?: string;
  }>;
  repositories: RepositorySummary[];
}

const sourceCards: SourceCard[] = [
  {
    id: "bangumi",
    title: "Bangumi",
    description: "追番、游戏、书籍、音乐",
    hint: "只同步勾选的作品类型；未勾选内容不会写入页面。",
    accountLabel: "用户名或用户页 URL",
    accountKey: "username",
    placeholder: "例如：miosdream 或 https://bgm.tv/user/…",
    token: false,
    icon: "bookMarked",
    contentHint: "未勾选类型不会写入页面快照。",
    contentOptions: [
      {
        key: "bangumiAnime",
        label: "追番",
        description: "动画与番剧收藏",
      },
      { key: "bangumiGames", label: "游戏", description: "游戏收藏" },
      { key: "bangumiBooks", label: "书籍", description: "书籍与小说收藏" },
      { key: "bangumiMusic", label: "音乐", description: "音乐收藏" },
    ],
  },
  {
    id: "bilibili",
    title: "Bilibili",
    description: "投稿、收藏、追番",
    hint: "未勾选的类别不会请求对应 API，也不会写入页面快照。",
    accountLabel: "UID 或空间 URL",
    accountKey: "userId",
    placeholder: "例如：205296924 或 https://space.bilibili.com/…",
    token: false,
    icon: "video",
    contentHint: "未勾选类别不会请求对应 API，也不会写入页面快照。",
    contentOptions: [
      {
        key: "bilibiliVideos",
        label: "投稿视频",
        description: "你发布的公开视频",
      },
      {
        key: "bilibiliFavorites",
        label: "收藏夹内容",
        description: "公开收藏夹中的视频",
      },
      {
        key: "bilibiliBangumi",
        label: "追番 / 追剧",
        description: "公开追番与追剧列表",
      },
    ],
  },
  {
    id: "github",
    title: "GitHub",
    description: "仓库与统计",
    hint: "读取公开仓库；同步失败时保留上一次公开快照。",
    accountLabel: "用户名或个人页 URL",
    accountKey: "username",
    placeholder: "例如：Mios-dream 或 https://github.com/…",
    token: true,
    icon: "github",
    contentHint: "关闭后不会请求或展示仓库；范围可在下方选择。",
    contentOptions: [
      {
        key: "githubRepositories",
        label: "公开仓库",
        description: "个人主页中的公开仓库",
      },
    ],
  },
  {
    id: "steam",
    title: "Steam",
    description: "最近游玩、游戏库",
    hint: "公开个人页可以读取最近游戏和近两周时长；完整游戏库需要 Steam Web API Key。",
    accountLabel: "个人页 URL 或 SteamID64",
    accountKey: "username",
    placeholder: "例如：76561198863810095 或 Steam 个人页链接",
    token: true,
    icon: "game",
    contentHint: "无 Key 时使用公开个人页的最近游戏；填写 Key 后可同步完整游戏库。",
    contentOptions: [
      {
        key: "steamRecentGames",
        label: "最近游玩",
        description: "最近游戏、近两周时长和最后游玩日期",
      },
      {
        key: "steamLibrary",
        label: "游戏库",
        description: "Steam 账号拥有的游戏及累计游玩时长",
      },
    ],
  },
  {
    id: "sfacg",
    title: "SFACG",
    description: "菠萝包轻小说开放书架",
    hint: "只读取公开书架页面，不需要登录；请输入 p.sfacg.com 的书架地址。",
    accountLabel: "开放书架地址",
    accountKey: "username",
    placeholder: "例如：https://p.sfacg.com/p/8933368/",
    token: false,
    icon: "bookMarked",
    contentHint: "公开书架中的小说会作为书籍写入资料库。",
    contentOptions: [
      {
        key: "sfacgBooks",
        label: "开放书架作品",
        description: "书架中的小说标题、作者和封面",
      },
    ],
  },
  {
    id: "netease",
    title: "网易云音乐",
    description: "喜欢、创建、收藏歌单",
    hint: "只读取公开歌单列表；未勾选的分类不会写入资料库。",
    accountLabel: "用户 ID 或个人页 URL",
    accountKey: "username",
    placeholder: "例如：32953014 或网易云用户页链接",
    token: false,
    icon: "music",
    contentHint: "公开歌单可按分类选择展示。",
    contentOptions: [
      {
        key: "neteaseLiked",
        label: "喜欢的音乐",
        description: "我喜欢的音乐歌单",
      },
      {
        key: "neteaseCreated",
        label: "创建的歌单",
        description: "自己创建的公开歌单",
      },
      {
        key: "neteaseCollected",
        label: "收藏的歌单",
        description: "收藏的公开歌单",
      },
    ],
  },
  {
    id: "qqmusic",
    title: "QQ 音乐",
    description: "喜欢、创建、收藏歌单",
    hint: "只读取公开歌单列表；平台未公开的收藏不会被写入页面。",
    accountLabel: "QQ 音乐用户 ID",
    accountKey: "username",
    placeholder: "例如：10000 或 QQ 音乐个人页链接",
    token: false,
    icon: "radio",
    contentHint: "公开歌单可按分类选择展示。",
    contentOptions: [
      {
        key: "qqmusicLiked",
        label: "喜欢的音乐",
        description: "平台公开的喜欢歌单",
      },
      {
        key: "qqmusicCreated",
        label: "创建的歌单",
        description: "自己创建的公开歌单",
      },
      {
        key: "qqmusicCollected",
        label: "收藏的歌单",
        description: "收藏的公开歌单",
      },
    ],
  },
];

const settingsTabs: Array<{ id: SettingsTab; label: string; icon: IconName }> =
  [
    { id: "profile", label: "个人资料", icon: "user" },
    { id: "sources", label: "数据来源", icon: "globe" },
    { id: "components", label: "组件设置", icon: "sliders" },
    { id: "content", label: "内容管理", icon: "library" },
    { id: "status", label: "同步状态", icon: "activity" },
  ];

const typeOptions: Array<{
  value: Exclude<LibraryFilter, "all">;
  label: string;
}> = [
  { value: "anime", label: "追番" },
  { value: "game", label: "游戏" },
  { value: "book", label: "书籍" },
  { value: "video", label: "视频" },
  { value: "music", label: "音乐" },
];

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
const manualDraft = ref<ManualLibraryItem>(createManualItem());
const editingManualId = ref<string | null>(null);
const sourceSnapshotStatuses = ref<Record<DataSourceId, SourceSnapshotInfo>>(
  emptySourceSnapshotStatuses(),
);
const selectedSourceId = ref<DataSourceId | null>(null);
const sourcePreview = ref<SourcePreview | null>(null);
const sourcePreviewLoading = ref(false);
const sourceActionBusy = ref<"process" | "clear" | null>(null);
const musicBusy = ref(false);
const musicError = ref("");

function createManualItem(): ManualLibraryItem {
  return { id: "", title: "", type: "anime", subtitle: "", cover: "", url: "" };
}

function emptySourceSnapshotInfo(sourceId: DataSourceId): SourceSnapshotInfo {
  return {
    sourceId,
    state: "never",
    message: "尚未同步",
    rawExists: false,
    rawBytes: 0,
    rawUpdatedAt: null,
    derivedExists: false,
    derivedBytes: 0,
    derivedUpdatedAt: null,
    itemCount: 0,
    fetchedAt: null,
    processedAt: null,
  };
}

function emptySourceSnapshotStatuses(): Record<
  DataSourceId,
  SourceSnapshotInfo
> {
  return {
    bangumi: emptySourceSnapshotInfo("bangumi"),
    bilibili: emptySourceSnapshotInfo("bilibili"),
    github: emptySourceSnapshotInfo("github"),
    netease: emptySourceSnapshotInfo("netease"),
    qqmusic: emptySourceSnapshotInfo("qqmusic"),
    steam: emptySourceSnapshotInfo("steam"),
    sfacg: emptySourceSnapshotInfo("sfacg"),
  };
}

const providerStatuses = computed(
  () => previewData.value?.providerStatus ?? [],
);
const anySourceBusy = computed(() =>
  Object.values(sourceBusy.value).some(Boolean),
);
const anyBusy = computed(
  () =>
    anySourceBusy.value || saveBusy.value || sourceActionBusy.value !== null,
);
const editingManual = computed(() => editingManualId.value !== null);
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
const manualActionLabel = computed(() =>
  editingManual.value ? "更新条目" : "添加条目",
);
const selectedSource = computed(() =>
  selectedSourceId.value
    ? sourceCards.find((source) => source.id === selectedSourceId.value)
    : undefined,
);
const selectedSourceStatus = computed(() =>
  selectedSourceId.value
    ? sourceSnapshotStatuses.value[selectedSourceId.value]
    : undefined,
);

const statusRows = computed(() =>
  [
    ...sourceCards.map((source) => ({
      id: source.id as DataSourceId | "manual",
      label: source.title,
    })),
    { id: "manual" as const, label: "手动内容" },
  ].map((row) => ({ ...row, status: statusFor(row.id) })),
);

const snapshotTime = computed(() => {
  const value = previewData.value?.generatedAt;
  if (!value) return "尚未写入页面快照";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("zh-CN", { hour12: false });
});

const refreshSourceStatus = async (): Promise<void> => {
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
};

const loadSourcePreview = async (sourceId: DataSourceId): Promise<void> => {
  sourcePreviewLoading.value = true;
  try {
    sourcePreview.value = await requestJson<SourcePreview>(
      `/__momona/source-preview?sourceId=${encodeURIComponent(sourceId)}`,
    );
  } catch {
    sourcePreview.value = null;
  } finally {
    sourcePreviewLoading.value = false;
  }
};

const openSourceManager = async (sourceId: DataSourceId): Promise<void> => {
  selectedSourceId.value = sourceId;
  await loadSourcePreview(sourceId);
};

const syncSelectedSource = (): void => {
  if (selectedSourceId.value) void syncSource(selectedSourceId.value);
};

const closeSourceManager = (): void => {
  selectedSourceId.value = null;
  sourcePreview.value = null;
};

const sourceSnapshotText = (status: SourceSnapshotInfo): string => {
  if (status.state === "success") return "已就绪";
  if (status.state === "error") return "同步失败";
  if (status.state === "cleared") return "已清理派生数据";
  return "暂无快照";
};

const sourceSnapshotClass = (status: SourceSnapshotInfo): string =>
  `is-${status.state}`;

const formatBytes = (bytes: number): string => {
  if (!bytes) return "未生成";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const formatSnapshotDate = (value: string | null): string => {
  if (!value) return "暂无";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleString("zh-CN", { hour12: false });
};

onMounted(async () => {
  try {
    const payload = await requestJson<{ config?: LocalConfig }>(
      "/__momona/config",
    );
    if (payload.config) config.value = normalizeLocalConfig(payload.config);
  } catch {
    // 静态构建中没有本地配置接口，页面继续使用构建时文件数据。
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
});

const closeSyncError = (): void => {
  syncError.value = null;
};

const showSyncError = (title: string, error: unknown): void => {
  syncError.value = {
    title,
    message: String(error instanceof Error ? error.message : error),
  };
};

const cachePreview = (siteData: SiteData): SiteData => {
  previewData.value = siteData;
  return siteData;
};

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

const loadMusicPlaylist = async (): Promise<void> => {
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
};

const updateGameWidget = (patch: {
  uid?: string;
  game?: HoyoGame;
  account?: NonNullable<
    NonNullable<LocalConfig["widgets"][number]["settings"]>["game"]
  >["account"];
}): void => {
  const widget = gameWidget.value;
  if (!widget) return;
  const current = widget.settings?.game;
  if (!current) return;
  config.value.widgets = config.value.widgets.map((item) =>
    item.id === widget.id
      ? {
          ...item,
          settings: {
            ...item.settings,
            game: { ...current, ...patch },
          },
        }
      : item,
  );
};

const syncGameAccount = async (): Promise<void> => {
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
};

const saveSiteSnapshot = async (): Promise<SiteData> => {
  const result = await requestJson<{ siteData: SiteData }>("/__momona/save", {
    config: config.value,
  });
  return cachePreview(result.siteData);
};

const saveSettings = async (): Promise<void> => {
  saveBusy.value = true;
  closeSyncError();
  messageTone.value = "neutral";
  message.value = "正在保存本地设置";
  try {
    const data = await saveSiteSnapshot();
    emit("config-change", cloneLocalConfig(config.value), false);
    messageTone.value = "success";
    message.value = `页面设置已保存 · ${data.libraryTiles.length} 个资料项`;
  } catch (error) {
    messageTone.value = "error";
    message.value = `本地配置文件写入失败：${String(error instanceof Error ? error.message : error)}`;
    showSyncError("保存设置失败", error);
  } finally {
    saveBusy.value = false;
  }
};

const syncSource = async (sourceId: DataSourceId): Promise<void> => {
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
        : `${source?.title ?? sourceLabels[sourceId]} 已同步并保存 · ${status.count} 项`;
    if (status.status === "error") {
      showSyncError(
        `${source?.title ?? sourceLabels[sourceId]} 同步失败`,
        status.message,
      );
    }
  } catch (error) {
    messageTone.value = "error";
    message.value = `${source?.title ?? sourceLabels[sourceId]} 请求失败；设置已保留：${String(error instanceof Error ? error.message : error)}`;
    showSyncError(`${source?.title ?? sourceLabels[sourceId]} 同步失败`, error);
  } finally {
    sourceBusy.value[sourceId] = false;
    await refreshSourceStatus();
    if (selectedSourceId.value === sourceId) await loadSourcePreview(sourceId);
  }
};

const processSelectedSource = async (): Promise<void> => {
  const sourceId = selectedSourceId.value;
  if (!sourceId || sourceActionBusy.value) return;
  sourceActionBusy.value = "process";
  closeSyncError();
  const source = sourceCards.find((item) => item.id === sourceId);
  messageTone.value = "neutral";
  message.value = `正在重新生成 ${source?.title ?? sourceLabels[sourceId]} 资料库`;
  try {
    const result = await requestJson<{
      siteData: SiteData;
      sourceStatus: ProviderStatus;
    }>("/__momona/process-source", { config: config.value, sourceId });
    cachePreview(result.siteData);
    messageTone.value = "success";
    message.value = `${source?.title ?? sourceLabels[sourceId]} 资料库已重新生成`;
  } catch (error) {
    messageTone.value = "error";
    message.value = `${source?.title ?? sourceLabels[sourceId]} 没有可处理的原始快照`;
    showSyncError(`${source?.title ?? sourceLabels[sourceId]} 处理失败`, error);
  } finally {
    sourceActionBusy.value = null;
    await refreshSourceStatus();
    await loadSourcePreview(sourceId);
  }
};

const clearSelectedSourceCache = async (): Promise<void> => {
  const sourceId = selectedSourceId.value;
  if (!sourceId || sourceActionBusy.value) return;
  sourceActionBusy.value = "clear";
  closeSyncError();
  const source = sourceCards.find((item) => item.id === sourceId);
  messageTone.value = "neutral";
  message.value = `正在清理 ${source?.title ?? sourceLabels[sourceId]} 派生缓存`;
  try {
    const result = await requestJson<{ siteData: SiteData }>(
      "/__momona/clear-source-cache",
      { config: config.value, sourceId },
    );
    cachePreview(result.siteData);
    messageTone.value = "success";
    message.value = `${source?.title ?? sourceLabels[sourceId]} 派生缓存已清理，原始快照仍保留`;
  } catch (error) {
    messageTone.value = "error";
    message.value = "派生缓存清理失败";
    showSyncError("清理数据失败", error);
  } finally {
    sourceActionBusy.value = null;
    await refreshSourceStatus();
    await loadSourcePreview(sourceId);
  }
};

const downloadJson = (filename: string, value: unknown): void => {
  const blob = new Blob([JSON.stringify(value, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
};

const exportConfig = (): void => {
  const exportedConfig = cloneLocalConfig(config.value);
  for (const source of Object.values(exportedConfig.sources)) source.token = "";
  downloadJson("momona.config.json", {
    ...exportedConfig,
    siteData: previewData.value,
  });
  messageTone.value = "success";
  message.value = "配置文件已导出";
};

const addOrUpdateManualItem = (): void => {
  if (!manualDraft.value.title.trim()) {
    messageTone.value = "error";
    message.value = "请先填写手动条目标题";
    return;
  }

  const id =
    editingManualId.value ||
    manualDraft.value.id.trim() ||
    `manual-${Date.now()}`;
  const item = {
    ...manualDraft.value,
    id,
    title: manualDraft.value.title.trim(),
    subtitle: manualDraft.value.subtitle.trim(),
    cover: manualDraft.value.cover.trim(),
    url: manualDraft.value.url.trim(),
  };
  if (editingManualId.value) {
    config.value.manualItems = config.value.manualItems.map((entry) =>
      entry.id === editingManualId.value ? item : entry,
    );
    message.value = "手动条目已更新";
  } else {
    config.value.manualItems.push(item);
    message.value = "手动条目已添加";
  }
  editingManualId.value = null;
  manualDraft.value = createManualItem();
  messageTone.value = "success";
};

const editManualItem = (item: ManualLibraryItem): void => {
  editingManualId.value = item.id;
  manualDraft.value = { ...item };
  activeTab.value = "content";
};

const cancelManualEdit = (): void => {
  editingManualId.value = null;
  manualDraft.value = createManualItem();
};

const removeManualItem = (id: string): void => {
  config.value.manualItems = config.value.manualItems.filter(
    (item) => item.id !== id,
  );
  if (editingManualId.value === id) cancelManualEdit();
  messageTone.value = "success";
  message.value = "手动条目已删除";
};

const statusFor = (id: DataSourceId | "manual"): ProviderStatus | undefined =>
  providerStatuses.value.find((status) => status.id === id);

const statusText = (status?: ProviderStatus): string => {
  if (!status) return "尚未同步";
  return {
    success: "已同步",
    skipped: "未启用",
    error: "同步失败",
  }[status.status];
};

const statusClass = (status?: ProviderStatus): string =>
  `is-${status?.status ?? "unknown"}`;
</script>

<template>
  <div class="settings-page">
    <header class="settings-header">
      <div class="settings-heading">
        <span class="settings-eyebrow">MOMONA / LOCAL</span>
        <h1>本地设置</h1>
        <p>配置数据来源，组合首页内容</p>
      </div>
      <div class="settings-actions">
        <button
          type="button"
          class="settings-primary"
          :disabled="anyBusy"
          @click="saveSettings"
        >
          <IconGlyph name="save" :size="15" />
          {{ saveBusy ? "保存中" : "保存设置" }}
        </button>
      </div>
    </header>

    <nav class="settings-tabs" role="tablist" aria-label="设置分类">
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
        <IconGlyph :name="tab.icon" :size="15" />
        <span>{{ tab.label }}</span>
        <small v-if="tab.id === 'sources'">{{ sourceCards.length }}</small>
        <small v-else-if="tab.id === 'content'">{{
          config.manualItems.length
        }}</small>
      </button>
    </nav>

    <div class="settings-layout">
      <section
        v-if="activeTab === 'profile'"
        id="settings-panel-profile"
        class="settings-panel"
        role="tabpanel"
        aria-labelledby="settings-tab-profile"
      >
        <header class="settings-panel-head">
          <div>
            <span class="settings-section-index">01 / PROFILE</span>
            <h2>个人资料</h2>
            <p>首页的状态栏和个人信息会从这里读取。</p>
          </div>
          <div class="settings-profile-preview">
            <img
              :src="config.account.avatar"
              :alt="config.account.name || '头像预览'"
            />
            <span
              ><strong>{{ config.account.name || "未命名" }}</strong
              ><small>{{ config.account.motto || "还没有签名" }}</small></span
            >
          </div>
        </header>
        <div class="settings-form-grid settings-profile-grid">
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
            >头像 URL<input
              v-model="config.account.avatar"
              type="url"
              placeholder="/assets/avatar.jpg"
          /></label>
        </div>
        <footer class="settings-panel-foot">
          <span>修改后点击右上角“保存设置”写入页面快照。</span
          ><strong>{{ config.account.name || "未命名账号" }}</strong>
        </footer>
      </section>

      <section
        v-else-if="activeTab === 'sources'"
        id="settings-panel-sources"
        class="settings-panel"
        role="tabpanel"
        aria-labelledby="settings-tab-sources"
      >
        <header class="settings-panel-head">
          <div>
            <span class="settings-section-index">02 / SOURCES</span>
            <h2>数据来源</h2>
            <p>每个来源独立请求、独立写入；单个网络失败不会覆盖其他来源。</p>
          </div>
          <button
            type="button"
            class="settings-quiet-action"
            @click="activeTab = 'status'"
          >
            <IconGlyph name="activity" :size="14" />查看状态
          </button>
        </header>
        <div class="settings-source-grid">
          <article
            v-for="source in sourceCards"
            :key="source.id"
            :class="[
              'settings-source-card',
              { 'is-disabled': !config.sources[source.id].enabled },
            ]"
          >
            <header class="settings-source-head">
              <div class="settings-source-title">
                <span class="settings-source-icon"
                  ><IconGlyph :name="source.icon" :size="17"
                /></span>
                <span
                  ><strong>{{ source.title }}</strong
                  ><small>{{ source.description }}</small></span
                >
              </div>
              <label
                class="settings-switch"
                :aria-label="`启用 ${source.title}`"
              >
                <input
                  v-model="config.sources[source.id].enabled"
                  type="checkbox"
                />
                <span></span>
              </label>
            </header>
            <p class="settings-source-hint">{{ source.hint }}</p>
            <div
              :class="[
                'settings-source-snapshot',
                sourceSnapshotClass(sourceSnapshotStatuses[source.id]),
              ]"
            >
              <span>
                <small>原始快照</small>
                <strong>{{
                  sourceSnapshotStatuses[source.id].rawExists
                    ? formatBytes(sourceSnapshotStatuses[source.id].rawBytes)
                    : "未生成"
                }}</strong>
              </span>
              <span>
                <small>资料库投影</small>
                <strong>{{
                  sourceSnapshotStatuses[source.id].derivedExists
                    ? formatBytes(
                        sourceSnapshotStatuses[source.id].derivedBytes,
                      )
                    : "未生成"
                }}</strong>
              </span>
              <span class="settings-source-snapshot-state">
                <small>状态</small>
                <strong>{{
                  sourceSnapshotText(sourceSnapshotStatuses[source.id])
                }}</strong>
              </span>
            </div>
            <div class="settings-source-fields">
              <label class="settings-field-wide"
                >{{ source.accountLabel
                }}<input
                  v-model="config.sources[source.id][source.accountKey]"
                  type="text"
                  :placeholder="source.placeholder"
              /></label>
              <label
                >数量<input
                  v-model.number="config.sources[source.id].limit"
                  type="number"
                  min="1"
                  max="120"
              /></label>
              <label
                >API 地址<input
                  v-model="config.sources[source.id].endpoint"
                  type="url"
                  :placeholder="
                    source.id === 'bangumi'
                      ? 'https://api.bgm.tv'
                      : source.id === 'github'
                        ? 'https://api.github.com'
                        : source.id === 'netease'
                            ? 'https://music.163.com/api'
                            : source.id === 'qqmusic'
                              ? 'https://c.y.qq.com'
                            : source.id === 'steam'
                                ? 'https://steamcommunity.com'
                                : source.id === 'sfacg'
                                  ? 'https://p.sfacg.com'
                                : 'https://api.bilibili.com'
                  "
              /></label>
              <label v-if="source.token" class="settings-field-wide"
                >Token（仅本地）<input
                  v-model="config.sources[source.id].token"
                  type="password"
                  autocomplete="off"
                  :placeholder="
                    source.id === 'steam'
                      ? '可选，Steam Web API Key，用于完整游戏库'
                      : '可选，用于提高 GitHub 限额'
                  "
              /></label>
            </div>
            <div class="settings-content-options">
              <div class="settings-content-options-head">
                <strong>同步内容</strong>
                <small>{{ source.contentHint }}</small>
              </div>
              <label
                v-for="option in source.contentOptions"
                :key="option.key"
                class="settings-content-option"
              >
                <input
                  v-model="config.sources[source.id].content[option.key]"
                  type="checkbox"
                />
                <span>
                  <strong>{{ option.label }}</strong>
                  <small>{{ option.description }}</small>
                </span>
              </label>
            </div>
            <div
              v-if="
                source.id === 'github' &&
                config.sources.github.content.githubRepositories
              "
              class="settings-source-scope"
            >
              <span class="settings-source-scope-label">仓库范围</span>
              <div
                class="settings-source-scope-control"
                role="radiogroup"
                aria-label="GitHub 仓库范围"
              >
                <label>
                  <input
                    v-model="
                      config.sources.github.content.githubRepositoryScope
                    "
                    type="radio"
                    value="all"
                  />
                  <span>全部公开仓库</span>
                </label>
                <label>
                  <input
                    v-model="
                      config.sources.github.content.githubRepositoryScope
                    "
                    type="radio"
                    value="pinned"
                  />
                  <span>Pinned 仓库</span>
                </label>
              </div>
              <small>Pinned 使用 GitHub GraphQL，需要填写本地 Token。</small>
              <label class="settings-source-sort"
                >仓库展示顺序<select
                  v-model="config.sources.github.content.githubRepositorySort"
                >
                  <option value="updated">最近更新</option>
                  <option value="stars">Star 优先</option>
                  <option value="forks">Fork 优先</option>
                  <option value="name">名称排序</option>
                </select></label
              >
            </div>
            <footer class="settings-source-foot">
              <div>
                <span
                  :class="[
                    'settings-source-status',
                    statusClass(statusFor(source.id)),
                  ]"
                  ><i></i>{{ statusText(statusFor(source.id))
                  }}<small v-if="statusFor(source.id)"
                    >· {{ statusFor(source.id)?.count }} 项</small
                  ></span
                >
                <button
                  type="button"
                  class="settings-source-manage"
                  :disabled="saveBusy || anySourceBusy"
                  @click="openSourceManager(source.id)"
                >
                  <IconGlyph name="settings" :size="14" />数据管理
                </button>
                <button
                  type="button"
                  class="settings-source-sync"
                  :disabled="saveBusy || sourceBusy[source.id]"
                  @click="syncSource(source.id)"
                >
                  <IconGlyph name="refresh" :size="14" />
                  {{ sourceBusy[source.id] ? "同步中" : "同步并保存" }}
                </button>
              </div>
            </footer>
          </article>
        </div>
        <section
          v-if="selectedSourceId && selectedSource"
          class="settings-source-management"
        >
          <header class="settings-source-management-head">
            <div>
              <span class="settings-section-index">DATA MANAGEMENT</span>
              <h3>{{ selectedSource.title }} 数据管理</h3>
              <p>
                原始响应和资料库投影分开保存；这里不会展示
                Token，也不会把原始响应发送到页面。
              </p>
            </div>
            <button
              type="button"
              class="settings-icon-button"
              aria-label="关闭数据管理"
              title="关闭数据管理"
              @click="closeSourceManager"
            >
              <IconGlyph name="x" :size="15" />
            </button>
          </header>

          <div
            v-if="sourcePreviewLoading"
            class="settings-source-preview-empty"
          >
            正在读取本地快照状态…
          </div>
          <template v-else-if="sourcePreview">
            <div class="settings-source-management-metrics">
              <div>
                <small>原始快照</small>
                <strong>{{
                  sourcePreview.status.rawExists
                    ? formatBytes(sourcePreview.status.rawBytes)
                    : "未生成"
                }}</strong>
                <span>{{
                  formatSnapshotDate(sourcePreview.status.fetchedAt)
                }}</span>
              </div>
              <div>
                <small>资料库投影</small>
                <strong>{{
                  sourcePreview.status.derivedExists
                    ? formatBytes(sourcePreview.status.derivedBytes)
                    : "未生成"
                }}</strong>
                <span>{{
                  formatSnapshotDate(sourcePreview.status.processedAt)
                }}</span>
              </div>
              <div>
                <small>公开条目</small>
                <strong>{{ sourcePreview.status.itemCount }}</strong>
                <span>{{ sourcePreview.status.message }}</span>
              </div>
            </div>

            <div
              v-if="
                sourcePreview.samples.length ||
                sourcePreview.repositories.length
              "
              class="settings-source-preview-grid"
            >
              <div
                v-if="sourcePreview.samples.length"
                class="settings-source-preview-group"
              >
                <div class="settings-source-preview-label">
                  <strong>资料库样例</strong><small>最多显示 6 项</small>
                </div>
                <ul class="settings-source-sample-list">
                  <li v-for="sample in sourcePreview.samples" :key="sample.id">
                    <img
                      v-if="sample.cover"
                      :src="sample.cover"
                      :alt="sample.title"
                    />
                    <span v-else class="settings-source-sample-placeholder">
                      <IconGlyph name="library" :size="14" />
                    </span>
                    <span class="settings-source-sample-copy">
                      <strong>{{ sample.title }}</strong>
                      <small>{{ sample.type }} · {{ sample.subtitle }}</small>
                    </span>
                    <a
                      v-if="sample.url"
                      :href="sample.url"
                      target="_blank"
                      rel="noreferrer"
                      aria-label="打开来源条目"
                      title="打开来源条目"
                    >
                      <IconGlyph name="external" :size="13" />
                    </a>
                  </li>
                </ul>
              </div>
              <div
                v-if="sourcePreview.repositories.length"
                class="settings-source-preview-group"
              >
                <div class="settings-source-preview-label">
                  <strong>仓库样例</strong><small>最多显示 6 项</small>
                </div>
                <ul class="settings-source-sample-list">
                  <li
                    v-for="repository in sourcePreview.repositories"
                    :key="repository.id"
                  >
                    <span class="settings-source-sample-placeholder">
                      <IconGlyph name="github" :size="14" />
                    </span>
                    <span class="settings-source-sample-copy">
                      <strong>{{ repository.name }}</strong>
                      <small
                        >{{ repository.language || "未标注" }} ·
                        {{ repository.stars }} stars</small
                      >
                    </span>
                    <a
                      v-if="repository.htmlUrl"
                      :href="repository.htmlUrl"
                      target="_blank"
                      rel="noreferrer"
                      aria-label="打开仓库"
                      title="打开仓库"
                    >
                      <IconGlyph name="external" :size="13" />
                    </a>
                  </li>
                </ul>
              </div>
            </div>
            <p v-else class="settings-source-preview-empty">
              还没有可展示的资料库样例。先同步该来源，或确认至少勾选了一类同步内容。
            </p>
          </template>
          <p v-else class="settings-source-preview-empty">
            本地开发服务没有返回快照预览；静态发布环境不会启用数据管理接口。
          </p>

          <footer class="settings-source-management-foot">
            <span>清理只删除派生投影，原始快照仍可用于下次重新生成。</span>
            <div>
              <button
                type="button"
                class="settings-secondary"
                :disabled="anyBusy"
                @click="syncSelectedSource"
              >
                <IconGlyph name="refresh" :size="14" />刷新原始数据
              </button>
              <button
                type="button"
                class="settings-secondary"
                :disabled="anyBusy || !selectedSourceStatus?.rawExists"
                @click="processSelectedSource"
              >
                <IconGlyph name="sparkles" :size="14" />
                {{
                  sourceActionBusy === "process" ? "生成中" : "重新生成资料库"
                }}
              </button>
              <button
                type="button"
                class="settings-danger-action"
                :disabled="anyBusy || !selectedSourceStatus?.derivedExists"
                @click="clearSelectedSourceCache"
              >
                <IconGlyph name="trash" :size="14" />
                {{ sourceActionBusy === "clear" ? "清理中" : "清理派生缓存" }}
              </button>
            </div>
          </footer>
        </section>
        <footer class="settings-panel-foot">
          <span
            >修改来源参数后，点击对应卡片的“同步并保存”。不需要网络时可只点击右上角“保存设置”。</span
          ><strong>本地 Token 不进入静态页面</strong>
        </footer>
      </section>

      <section
        v-else-if="activeTab === 'components'"
        id="settings-panel-components"
        class="settings-panel"
        role="tabpanel"
        aria-labelledby="settings-tab-components"
      >
        <header class="settings-panel-head">
          <div>
            <span class="settings-section-index">03 / COMPONENTS</span>
            <h2>组件设置</h2>
            <p>把参考站的游戏 Presence、音乐播放器和报告卡统一接入本地快照。</p>
          </div>
          <span class="settings-count-badge"
            >首页组件
            {{ config.widgets.filter((item) => item.visible).length }}</span
          >
        </header>

        <div class="settings-component-grid">
          <section class="settings-subpanel">
            <header class="settings-subpanel-head">
              <div>
                <span class="settings-section-index">GAME PRESENCE</span>
                <h3>游戏资料卡</h3>
                <p>读取公开展柜摘要，不需要登录凭据。</p>
              </div>
              <IconGlyph name="game" :size="18" />
            </header>
            <div v-if="gameSettings" class="settings-form-grid">
              <label
                >游戏<select
                  :value="gameSettings.game ?? 'hsr'"
                  @change="
                    updateGameWidget({
                      game: ($event.target as HTMLSelectElement)
                        .value as HoyoGame,
                      account: null,
                    })
                  "
                >
                  <option value="genshin">原神</option>
                  <option value="hsr">崩坏：星穹铁道</option>
                  <option value="zzz">绝区零</option>
                </select></label
              >
              <label
                >UID<input
                  :value="gameSettings.uid"
                  inputmode="numeric"
                  placeholder="6-12 位数字"
                  @input="
                    updateGameWidget({
                      uid: ($event.target as HTMLInputElement).value,
                      account: null,
                    })
                  "
              /></label>
            </div>
            <div class="settings-inline-actions">
              <button
                type="button"
                class="settings-secondary"
                :disabled="gameBusy || !gameSettings?.uid.trim()"
                @click="syncGameAccount"
              >
                <IconGlyph :name="gameBusy ? 'refresh' : 'cloud'" :size="14" />
                {{ gameBusy ? "读取中" : `读取${gameName}账号` }}
              </button>
              <span v-if="gameSettings?.account" class="settings-inline-status">
                {{ gameSettings.account.nickname }} · 等级
                {{
                  gameSettings.account.score?.value ||
                  gameSettings.account.level
                }}
              </span>
            </div>
            <p v-if="gameError" class="settings-inline-error">
              {{ gameError }}
            </p>
            <p v-else class="settings-subpanel-note">
              成功读取后，展柜头像、等级和成就会同步到首页与平台报告。
            </p>
          </section>

          <section class="settings-subpanel">
            <header class="settings-subpanel-head">
              <div>
                <span class="settings-section-index">MUSIC PLAYER</span>
                <h3>音乐卡片</h3>
                <p>支持手动曲目，也兼容参考站发布的播放器状态事件。</p>
              </div>
              <IconGlyph name="music" :size="18" />
            </header>
            <div class="settings-form-grid">
              <label class="settings-field-wide"
                >曲目<input
                  v-model="config.music.title"
                  type="text"
                  placeholder="例如：魚"
              /></label>
              <label
                >歌手<input
                  v-model="config.music.artist"
                  type="text"
                  placeholder="例如：あたらよ"
              /></label>
              <label
                >专辑<input
                  v-model="config.music.album"
                  type="text"
                  placeholder="可选"
              /></label>
              <label class="settings-field-wide"
                >封面 URL<input
                  v-model="config.music.cover"
                  type="url"
                  placeholder="/assets/home-music.jpg"
              /></label>
              <label class="settings-field-wide"
                >音频 URL<input
                  v-model="config.music.audioUrl"
                  type="url"
                  placeholder="可选；留空时只同步播放状态"
              /></label>
              <label
                >来源<select v-model="config.music.source">
                  <option value="manual">手动</option>
                  <option value="netease">NetEase</option>
                  <option value="qq">QQ 音乐</option>
                </select></label
              >
              <label
                >歌单 ID / URL<input
                  v-model="config.music.playlistId"
                  type="text"
                  placeholder="输入 ID 或歌单链接"
              /></label>
            </div>
            <div class="settings-inline-actions">
              <button
                type="button"
                class="settings-secondary"
                :disabled="musicBusy || !config.music.playlistId.trim()"
                @click="loadMusicPlaylist"
              >
                <IconGlyph
                  :name="musicBusy ? 'refresh' : 'search'"
                  :size="14"
                />
                {{ musicBusy ? "读取中" : "读取歌单" }}
              </button>
              <span v-if="config.music.title" class="settings-inline-status">
                当前曲目：{{ config.music.title }}
              </span>
            </div>
            <p v-if="musicError" class="settings-inline-error">
              {{ musicError }}
            </p>
            <label class="settings-inline-toggle">
              <input v-model="config.music.enabled" type="checkbox" />
              <span>在首页显示音乐卡片</span>
            </label>
          </section>

          <section class="settings-subpanel settings-subpanel-wide">
            <header class="settings-subpanel-head">
              <div>
                <span class="settings-section-index">REPORTS</span>
                <h3>平台报告</h3>
                <p>报告卡片从已同步的数据源、游戏摘要和当前曲目实时生成。</p>
              </div>
              <IconGlyph name="report" :size="18" />
            </header>
            <div class="settings-report-summary">
              <span
                ><strong>{{ previewData?.reportPlatforms.length ?? 0 }}</strong>
                张报告卡片</span
              >
              <span
                ><strong>{{ previewData?.repositories.length ?? 0 }}</strong>
                个仓库</span
              >
              <span
                ><strong>{{ previewData?.libraryTiles.length ?? 0 }}</strong>
                个资料项</span
              >
            </div>
            <p class="settings-subpanel-note">
              保存设置后，Reports
              会优先显示最新同步的平台数据；来源不可用时继续保留上一次快照。
            </p>
          </section>
        </div>

        <footer class="settings-panel-foot">
          <span
            >修改组件字段后点击右上角“保存设置”，游戏账号读取需要开发服务器可用。</span
          >
          <strong>不会把 Token 写入页面快照</strong>
        </footer>
      </section>

      <section
        v-else-if="activeTab === 'content'"
        id="settings-panel-content"
        class="settings-panel"
        role="tabpanel"
        aria-labelledby="settings-tab-content"
      >
        <header class="settings-panel-head">
          <div>
            <span class="settings-section-index">04 / CONTENT</span>
            <h2>内容管理</h2>
            <p>补充 API 没有覆盖的作品、视频或音乐，也可以随时编辑。</p>
          </div>
          <span class="settings-count-badge"
            >{{ config.manualItems.length }} 条手动内容</span
          >
        </header>
        <form
          class="settings-manual-form"
          @submit.prevent="addOrUpdateManualItem"
        >
          <label
            >标题<input
              v-model="manualDraft.title"
              type="text"
              placeholder="例如：夏日重现"
          /></label>
          <label
            >类型<select v-model="manualDraft.type">
              <option
                v-for="item in typeOptions"
                :key="item.value"
                :value="item.value"
              >
                {{ item.label }}
              </option>
            </select></label
          >
          <label
            >标识（可选）<input
              v-model="manualDraft.id"
              type="text"
              :disabled="editingManual"
              placeholder="留空自动生成"
          /></label>
          <label
            >副标题<input
              v-model="manualDraft.subtitle"
              type="text"
              placeholder="来源或状态"
          /></label>
          <label
            >封面 URL<input
              v-model="manualDraft.cover"
              type="url"
              placeholder="https://…"
          /></label>
          <label
            >链接<input
              v-model="manualDraft.url"
              type="url"
              placeholder="https://…"
          /></label>
          <div class="settings-form-actions">
            <button type="submit" class="settings-primary">
              <IconGlyph
                :name="editingManual ? 'save' : 'sparkles'"
                :size="15"
              />{{ manualActionLabel }}
            </button>
            <button
              v-if="editingManual"
              type="button"
              class="settings-secondary"
              @click="cancelManualEdit"
            >
              取消编辑
            </button>
          </div>
        </form>
        <div v-if="config.manualItems.length" class="settings-manual-list">
          <article
            v-for="item in config.manualItems"
            :key="item.id"
            class="settings-manual-item"
          >
            <img v-if="item.cover" :src="item.cover" :alt="item.title" />
            <span v-else class="settings-manual-placeholder"
              ><IconGlyph name="library" :size="16"
            /></span>
            <div class="settings-manual-copy">
              <strong>{{ item.title }}</strong
              ><small
                >{{
                  item.subtitle ||
                  typeOptions.find((option) => option.value === item.type)
                    ?.label
                }}
                · {{ item.id }}</small
              >
            </div>
            <a
              v-if="item.url"
              class="settings-icon-button"
              :href="item.url"
              target="_blank"
              rel="noreferrer"
              aria-label="打开条目链接"
              title="打开条目链接"
              ><IconGlyph name="external" :size="14"
            /></a>
            <button
              type="button"
              class="settings-icon-button"
              aria-label="编辑条目"
              title="编辑条目"
              @click="editManualItem(item)"
            >
              <IconGlyph name="sliders" :size="14" />
            </button>
            <button
              type="button"
              class="settings-icon-button"
              aria-label="删除条目"
              title="删除条目"
              @click="removeManualItem(item.id)"
            >
              <IconGlyph name="x" :size="14" />
            </button>
          </article>
        </div>
        <p v-else class="settings-empty-state">
          还没有手动内容。添加后点击右上角“保存设置”即可写入页面快照。
        </p>
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
            <span class="settings-section-index">05 / STATUS</span>
            <h2>同步状态</h2>
            <p>查看每个来源最近一次结果；失败来源不会清空已有快照。</p>
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
        <section class="settings-auto-refresh">
          <div>
            <span class="settings-section-index">LOCAL AUTOMATION</span>
            <h3>本地开发自动刷新</h3>
            <p>
              开启后，开发服务器会按间隔重新同步已启用来源；静态发布站点仍需重新构建才会更新。
            </p>
          </div>
          <div class="settings-auto-refresh-control">
            <label class="settings-switch" aria-label="启用本地开发自动刷新">
              <input v-model="config.autoRefresh.enabled" type="checkbox" />
              <span></span>
            </label>
            <label>
              间隔
              <select v-model.number="config.autoRefresh.intervalHours">
                <option :value="6">每 6 小时</option>
                <option :value="12">每 12 小时</option>
                <option :value="24">每天</option>
              </select>
            </label>
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
          <span
            >页面配置写入项目文件；本地 Token
            单独保存在被忽略的凭据文件中。</span
          ><button
            type="button"
            class="settings-quiet-action"
            @click="activeTab = 'sources'"
          >
            管理数据来源 <IconGlyph name="arrowRight" :size="14" />
          </button>
        </footer>
      </section>
    </div>

    <footer
      class="settings-footer"
      :class="`is-${messageTone}`"
      aria-live="polite"
    >
      {{ message }}
    </footer>

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
            ><IconGlyph name="x" :size="17"
          /></span>
          <button
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
          <small>已有页面数据已保留。检查设置后可以再次同步。</small>
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
  overflow-x: clip;
  min-height: 100vh;
  padding: 48px max(112px, calc(clamp(16px, 6vw, 96px) + 24px)) 76px
    clamp(16px, 6vw, 96px);
  color: var(--ink);
}

.settings-header,
.settings-tabs,
.settings-layout {
  width: min(1160px, 100%);
  margin: 0 auto;
}

.settings-header {
  position: relative;
  display: flex;
  align-items: flex-end;
  gap: 15px;
}

.settings-back,
.settings-icon-button {
  display: grid;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.82);
  color: var(--muted-strong);
  background: rgba(255, 255, 255, 0.62);
  box-shadow: 0 8px 18px rgba(54, 45, 106, 0.08);
  transition:
    color 0.18s ease,
    background 0.18s ease,
    transform 0.18s ease;
}

.settings-back {
  width: 38px;
  height: 38px;
  flex: 0 0 auto;
  border-radius: 12px;
}

.settings-back:hover,
.settings-icon-button:hover:not(:disabled) {
  color: var(--purple-deep);
  background: rgba(255, 255, 255, 0.92);
  transform: translateY(-1px);
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
  margin: 3px 0 4px;
  font-size: clamp(1.5rem, 3vw, 2.2rem);
  line-height: 1;
}
.settings-heading p {
  margin: 0;
  color: var(--muted-strong);
  font-size: 0.68rem;
}

.settings-actions {
  align-self: flex-end;
  display: flex;
  margin-left: auto;
  gap: 8px;
}
.settings-primary,
.settings-secondary,
.settings-quiet-action,
.settings-source-sync {
  display: inline-flex;
  min-height: 36px;
  padding: 0 12px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid rgba(255, 255, 255, 0.82);
  border-radius: 10px;
  font-size: 0.63rem;
  font-weight: 760;
  white-space: nowrap;
}

.settings-primary {
  color: #fff;
  background: var(--purple-deep);
  box-shadow: 0 9px 18px rgba(85, 65, 181, 0.2);
  border: none;
}
.settings-primary:hover:not(:disabled) {
  background: #47349d;
}
.settings-secondary,
.settings-quiet-action {
  color: var(--purple-deep);
  background: rgba(255, 255, 255, 0.62);
}
.settings-secondary:hover:not(:disabled),
.settings-quiet-action:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.92);
}
button:disabled {
  cursor: default;
  opacity: 0.48;
}

.settings-tabs {
  display: flex;
  min-height: 52px;
  align-items: stretch;
  gap: 5px;
  overflow-x: auto;
  border-bottom: 1px solid rgba(255, 255, 255, 0.65);
  scrollbar-width: none;
}
.settings-tabs::-webkit-scrollbar {
  display: none;
}
.settings-tab {
  position: relative;
  display: inline-flex;
  min-width: 112px;
  padding: 0 13px;
  align-items: center;
  justify-content: center;
  gap: 7px;
  border: 0;
  color: var(--muted-strong);
  background: transparent;
  font-size: 0.65rem;
  font-weight: 720;
}
.settings-tab::after {
  position: absolute;
  right: 12px;
  bottom: -1px;
  left: 12px;
  height: 2px;
  background: transparent;
  content: "";
}
.settings-tab:hover {
  color: var(--purple-deep);
}
.settings-tab.is-active {
  color: var(--purple-deep);
}
.settings-tab.is-active::after {
  background: var(--purple-deep);
}
.settings-tab small {
  display: inline-grid;
  min-width: 19px;
  height: 19px;
  padding: 0 4px;
  place-items: center;
  border-radius: 10px;
  color: var(--purple-deep);
  background: rgba(117, 100, 222, 0.1);
  font-size: 0.52rem;
}

.settings-layout {
  display: grid;
  gap: 14px;
  padding-top: 14px;
}
.settings-component-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.settings-subpanel {
  min-width: 0;
  padding: 16px;
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.38);
}
.settings-subpanel-wide {
  grid-column: 1 / -1;
}
.settings-subpanel-head {
  display: flex;
  min-height: 39px;
  margin-bottom: 16px;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  color: var(--purple-deep);
}
.settings-subpanel-head h3 {
  margin: 4px 0 4px;
  color: var(--ink);
  font-size: 0.88rem;
}
.settings-subpanel-head p {
  margin: 0;
  color: var(--muted-strong);
  font-size: 0.58rem;
}
.settings-inline-actions {
  display: flex;
  min-height: 36px;
  margin-top: 13px;
  align-items: center;
  flex-wrap: wrap;
  gap: 9px;
}
.settings-inline-status {
  min-width: 0;
  overflow: hidden;
  color: var(--muted-strong);
  font-size: 0.58rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.settings-inline-error {
  margin: 9px 0 0;
  color: #bd455b;
  font-size: 0.57rem;
  overflow-wrap: anywhere;
}
.settings-subpanel-note {
  margin: 12px 0 0;
  color: var(--muted);
  font-size: 0.56rem;
  line-height: 1.45;
}
.settings-inline-toggle {
  display: inline-flex !important;
  margin-top: 13px;
  flex-direction: row !important;
  align-items: center;
  gap: 7px;
  cursor: pointer;
}
.settings-inline-toggle input {
  width: 15px !important;
  height: 15px !important;
  accent-color: var(--purple);
}
.settings-report-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.settings-report-summary span {
  display: flex;
  min-height: 49px;
  padding: 8px 10px;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
  border-radius: 8px;
  color: var(--muted);
  background: rgba(255, 255, 255, 0.42);
  font-size: 0.55rem;
}
.settings-report-summary strong {
  color: var(--purple-deep);
  font-size: 0.9rem;
}
.settings-panel {
  padding: 22px;
  border: 1px solid var(--glass-border);
  border-radius: 16px;
  background: var(--glass);
  box-shadow: var(--glass-shadow);
  backdrop-filter: blur(18px) saturate(132%);
}
.settings-panel-head {
  display: flex;
  min-height: 44px;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 20px;
}
.settings-panel-head h2 {
  margin: 4px 0 4px;
  font-size: 1rem;
}
.settings-panel-head p {
  margin: 0;
  color: var(--muted-strong);
  font-size: 0.62rem;
}
.settings-profile-preview {
  display: flex;
  max-width: 250px;
  align-items: center;
  gap: 9px;
}
.settings-profile-preview img {
  width: 42px;
  height: 42px;
  border: 2px solid rgba(255, 255, 255, 0.88);
  border-radius: 50%;
  object-fit: cover;
}
.settings-profile-preview span {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}
.settings-profile-preview strong,
.settings-profile-preview small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.settings-profile-preview strong {
  font-size: 0.68rem;
}
.settings-profile-preview small {
  color: var(--muted);
  font-size: 0.55rem;
}

.settings-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 11px;
}
.settings-profile-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.settings-field-wide {
  grid-column: span 2;
}
.settings-profile-grid .settings-field-wide {
  grid-column: span 2;
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
.settings-page select {
  width: 100%;
  height: 36px;
  min-width: 0;
  padding: 0 10px;
  border: 1px solid rgba(125, 132, 163, 0.18);
  border-radius: 9px;
  outline: none;
  color: var(--ink);
  background: rgba(255, 255, 255, 0.65);
  font-size: 0.64rem;
}
.settings-page input:focus,
.settings-page select:focus {
  border-color: rgba(117, 100, 222, 0.56);
  box-shadow: 0 0 0 3px rgba(117, 100, 222, 0.1);
}
.settings-page input:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
.settings-panel-foot {
  display: flex;
  min-height: 31px;
  margin-top: 19px;
  padding-top: 12px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-top: 1px solid rgba(118, 126, 151, 0.13);
  color: var(--muted);
  font-size: 0.57rem;
}
.settings-panel-foot strong {
  color: var(--muted-strong);
  font-size: 0.57rem;
  font-weight: 700;
}

.settings-source-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 11px;
}
.settings-source-card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  padding: 15px;
  border: 1px solid rgba(255, 255, 255, 0.72);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.43);
  transition:
    opacity 0.18s ease,
    border-color 0.18s ease;
}
.settings-source-card.is-disabled {
  opacity: 0.72;
}
.settings-source-head {
  display: flex;
  min-height: 38px;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.settings-source-title {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 9px;
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
.settings-source-title > span:last-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}
.settings-source-title strong {
  font-size: 0.72rem;
}
.settings-source-title small {
  color: var(--muted);
  font-size: 0.55rem;
}
.settings-source-hint {
  min-height: 31px;
  margin: 12px 0 13px;
  color: var(--muted-strong);
  font-size: 0.57rem;
  line-height: 1.45;
}
.settings-source-snapshot {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 5px;
  margin-bottom: 13px;
  padding: 7px 0;
  border-top: 1px solid rgba(118, 126, 151, 0.13);
  border-bottom: 1px solid rgba(118, 126, 151, 0.13);
}
.settings-source-snapshot span {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}
.settings-source-snapshot small {
  color: var(--muted);
  font-size: 0.48rem;
}
.settings-source-snapshot strong {
  overflow: hidden;
  color: var(--muted-strong);
  font-size: 0.56rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.settings-source-snapshot-state strong {
  color: var(--purple-deep);
}
.settings-source-snapshot.is-error .settings-source-snapshot-state strong {
  color: #bd455b;
}
.settings-source-snapshot.is-cleared .settings-source-snapshot-state strong {
  color: var(--muted-strong);
}
.settings-source-fields {
  display: grid;
  grid-template-columns: 74px minmax(0, 1fr);
  gap: 9px;
}
.settings-source-fields .settings-field-wide {
  grid-column: 1 / -1;
}
.settings-content-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
  margin-top: 13px;
  padding-top: 11px;
  border-top: 1px solid rgba(118, 126, 151, 0.13);
}
.settings-content-options-head {
  display: flex;
  grid-column: 1 / -1;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.settings-content-options-head strong {
  color: var(--muted-strong);
  font-size: 0.57rem;
}
.settings-content-options-head small {
  color: var(--muted);
  font-size: 0.5rem;
  font-weight: 500;
  text-align: right;
}
.settings-content-option {
  display: flex !important;
  min-height: 37px;
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
  height: 15px !important;
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
  font-size: 0.56rem;
}
.settings-content-option small {
  color: var(--muted);
  font-size: 0.49rem;
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
  font-size: 0.57rem;
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
  font-size: 0.55rem;
  transition:
    color 0.18s ease,
    border-color 0.18s ease,
    background 0.18s ease;
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
.settings-source-scope > small {
  color: var(--muted);
  font-size: 0.5rem;
}
.settings-source-sort {
  max-width: 190px;
  margin-top: 5px;
}
.settings-source-sort select {
  height: 31px;
  font-size: 0.56rem;
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
.settings-source-foot {
  display: flex;
  flex: 1;
  align-items: end;
}

.settings-source-foot > div {
  display: flex;
  align-items: center;
  min-height: 36px;
  margin-top: 14px;
  justify-content: space-between;
  gap: 8px;
  flex: 1;
}

.settings-source-status {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 5px;
  color: var(--muted-strong);
  font-size: 0.56rem;
}
.settings-source-status i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--muted);
}
.settings-source-status small {
  color: var(--muted);
  font-size: 0.53rem;
}
.settings-source-status.is-success i {
  background: var(--green);
}
.settings-source-status.is-error i {
  background: #df5a70;
}
.settings-source-sync {
  min-height: 31px;
  padding: 0 9px;
  color: var(--purple-deep);
  background: rgba(255, 255, 255, 0.72);
  font-size: 0.57rem;
}
.settings-source-sync:hover:not(:disabled) {
  background: #fff;
}
.settings-source-manage {
  min-height: 31px;
  padding: 0 8px;
  color: var(--muted-strong);
  background: rgba(255, 255, 255, 0.42);
  font-size: 0.57rem;
}
.settings-source-manage:hover:not(:disabled) {
  color: var(--purple-deep);
  background: rgba(255, 255, 255, 0.82);
}

.settings-source-management {
  margin-top: 14px;
  padding: 16px;
  border: 1px solid rgba(117, 100, 222, 0.18);
  border-radius: 12px;
  background: rgba(249, 248, 255, 0.58);
}
.settings-source-management-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.settings-source-management-head h3 {
  margin: 4px 0;
  font-size: 0.85rem;
}
.settings-source-management-head p {
  max-width: 640px;
  margin: 0;
  color: var(--muted-strong);
  font-size: 0.57rem;
  line-height: 1.45;
}
.settings-source-management-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 7px;
  margin-top: 14px;
}
.settings-source-management-metrics > div {
  display: flex;
  min-width: 0;
  min-height: 65px;
  padding: 9px 10px;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.56);
}
.settings-source-management-metrics small,
.settings-source-management-metrics span {
  color: var(--muted);
  font-size: 0.5rem;
}
.settings-source-management-metrics strong {
  color: var(--purple-deep);
  font-size: 0.72rem;
}
.settings-source-management-metrics span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.settings-source-preview-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}
.settings-source-preview-group {
  min-width: 0;
}
.settings-source-preview-label {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 7px;
}
.settings-source-preview-label strong {
  color: var(--muted-strong);
  font-size: 0.58rem;
}
.settings-source-preview-label small {
  color: var(--muted);
  font-size: 0.5rem;
}
.settings-source-sample-list {
  display: grid;
  gap: 5px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.settings-source-sample-list li {
  display: flex;
  min-width: 0;
  min-height: 39px;
  padding: 5px 7px;
  align-items: center;
  gap: 7px;
  border-radius: 7px;
  background: rgba(255, 255, 255, 0.5);
}
.settings-source-sample-list img,
.settings-source-sample-placeholder {
  display: grid;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 6px;
  color: var(--purple-deep);
  background: rgba(117, 100, 222, 0.1);
  object-fit: cover;
}
.settings-source-sample-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}
.settings-source-sample-copy strong,
.settings-source-sample-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.settings-source-sample-copy strong {
  color: var(--ink-soft);
  font-size: 0.56rem;
}
.settings-source-sample-copy small {
  color: var(--muted);
  font-size: 0.49rem;
}
.settings-source-sample-list a {
  display: grid;
  width: 25px;
  height: 25px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 6px;
  color: var(--muted-strong);
}
.settings-source-sample-list a:hover {
  color: var(--purple-deep);
  background: rgba(117, 100, 222, 0.1);
}
.settings-source-preview-empty {
  margin: 14px 0 0;
  padding: 14px;
  border: 1px dashed rgba(118, 126, 151, 0.26);
  border-radius: 8px;
  color: var(--muted);
  font-size: 0.57rem;
  line-height: 1.5;
}
.settings-source-management-foot {
  display: flex;
  margin-top: 14px;
  padding-top: 12px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-top: 1px solid rgba(118, 126, 151, 0.13);
  color: var(--muted);
  font-size: 0.54rem;
}
.settings-source-management-foot > div {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 6px;
}
.settings-danger-action {
  display: inline-flex;
  min-height: 31px;
  padding: 0 9px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 1px solid rgba(189, 69, 91, 0.18);
  border-radius: 9px;
  color: #a83f55;
  background: rgba(255, 243, 246, 0.78);
  font-size: 0.56rem;
  font-weight: 720;
}
.settings-danger-action:hover:not(:disabled) {
  background: rgba(255, 232, 237, 0.96);
}

.settings-count-badge {
  display: inline-flex;
  min-height: 27px;
  padding: 0 9px;
  align-items: center;
  border-radius: 8px;
  color: var(--purple-deep);
  background: rgba(117, 100, 222, 0.1);
  font-size: 0.56rem;
  font-weight: 750;
}
.settings-manual-form {
  display: grid;
  grid-template-columns: 2fr 1fr 1.2fr 1.5fr;
  gap: 11px;
  align-items: end;
}
.settings-manual-form label:nth-child(5) {
  grid-column: span 2;
}
.settings-form-actions {
  display: flex;
  align-items: center;
  gap: 7px;
}
.settings-form-actions button {
  min-height: 36px;
}
.settings-manual-list {
  display: grid;
  margin-top: 16px;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 7px;
}
.settings-manual-item {
  display: flex;
  min-width: 0;
  min-height: 55px;
  padding: 6px;
  align-items: center;
  gap: 8px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.52);
}
.settings-manual-item img,
.settings-manual-placeholder {
  display: grid;
  width: 42px;
  height: 42px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 7px;
  object-fit: cover;
  color: var(--purple-deep);
  background: rgba(231, 228, 247, 0.7);
}
.settings-manual-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 3px;
}
.settings-manual-copy strong,
.settings-manual-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.settings-manual-copy strong {
  font-size: 0.63rem;
}
.settings-manual-copy small {
  color: var(--muted);
  font-size: 0.53rem;
}
.settings-manual-item .settings-icon-button {
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  padding: 0;
  border-radius: 8px;
}
.settings-empty-state {
  margin: 18px 0 0;
  padding: 18px;
  border: 1px dashed rgba(118, 126, 151, 0.26);
  border-radius: 10px;
  color: var(--muted);
  font-size: 0.62rem;
  text-align: center;
}

.settings-icon-button {
  width: 30px;
  height: 30px;
  padding: 0;
  border-radius: 9px;
}
.settings-status-list {
  display: grid;
  gap: 6px;
}
.settings-status-row {
  display: grid;
  grid-template-columns: 8px 78px minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  min-height: 38px;
  padding: 0 10px;
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.46);
  font-size: 0.58rem;
}
.settings-status-row strong {
  font-size: 0.6rem;
}
.settings-status-message {
  overflow: hidden;
  color: var(--muted-strong);
  text-overflow: ellipsis;
  white-space: nowrap;
}
.settings-status-row small {
  color: var(--muted);
  font-size: 0.54rem;
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
  margin-top: 16px;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.settings-snapshot-grid div {
  display: flex;
  min-width: 0;
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
  font-size: 0.52rem;
}
.settings-snapshot-grid strong {
  overflow: hidden;
  font-size: 0.6rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.settings-footer {
  position: fixed;
  right: 18px;
  bottom: 18px;
  z-index: 20;
  min-height: 32px;
  max-width: min(540px, calc(100vw - 36px));
  padding: 8px 12px;
  border: 1px solid rgba(255, 255, 255, 0.78);
  border-radius: 9px;
  color: var(--muted-strong);
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 10px 24px rgba(54, 45, 106, 0.12);
  font-size: 0.58rem;
  text-align: right;
  backdrop-filter: blur(14px);
}
.settings-footer.is-success {
  color: #26825e;
}
.settings-footer.is-error {
  color: #bd455b;
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
  font-size: 0.63rem;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
.settings-error-modal small {
  margin-top: 9px;
  color: var(--muted);
  font-size: 0.55rem;
}
.settings-error-modal > footer {
  display: flex;
  justify-content: flex-end;
  margin-top: 8px;
}

@media (max-width: 1040px) {
  .settings-source-grid {
    grid-template-columns: 1fr;
  }
  .settings-source-card {
    display: grid;
    grid-template-columns: minmax(0, 0.8fr) minmax(0, 1.2fr) auto;
    column-gap: 16px;
  }
  .settings-source-head {
    grid-row: span 2;
  }
  .settings-source-hint {
    min-height: 0;
    margin: 0;
  }
  .settings-source-snapshot,
  .settings-source-management {
    grid-column: 2 / -1;
  }
  .settings-source-fields {
    grid-column: 2 / -1;
  }
  .settings-content-options {
    grid-column: 2 / -1;
  }
  .settings-source-scope {
    grid-column: 2 / -1;
  }
  .settings-source-foot {
    grid-column: 2 / -1;
  }
}

@media (max-width: 820px) {
  .settings-page {
    padding: 76px 14px 96px;
  }
  .settings-header {
    flex-wrap: nowrap;
  }
  .settings-heading {
    flex: 1 1 auto;
    max-width: calc(100% - 100px);
  }
  .settings-actions {
    position: static;
    width: auto;
    margin: 0 0 0 auto;
    flex: 0 0 auto;
  }

  .settings-panel {
    padding: 15px;
  }
  .settings-component-grid {
    grid-template-columns: 1fr;
  }
  .settings-subpanel-wide {
    grid-column: auto;
  }
  .settings-panel-head {
    flex-direction: column;
  }
  .settings-profile-preview {
    max-width: 100%;
  }
  .settings-profile-grid,
  .settings-form-grid {
    grid-template-columns: 1fr;
  }
  .settings-field-wide,
  .settings-profile-grid .settings-field-wide {
    grid-column: auto;
  }
  .settings-source-card {
    display: flex;
  }
  .settings-source-fields {
    grid-template-columns: 70px minmax(0, 1fr);
  }
  .settings-source-fields .settings-field-wide {
    grid-column: 1 / -1;
  }
  .settings-content-options {
    grid-column: auto;
  }
  .settings-source-scope {
    grid-column: auto;
  }
  .settings-source-foot {
    margin-top: 12px;
  }
  .settings-source-management {
    grid-column: auto;
  }
  .settings-source-management-metrics,
  .settings-source-preview-grid {
    grid-template-columns: 1fr;
  }
  .settings-source-management-foot,
  .settings-auto-refresh {
    align-items: flex-start;
    flex-direction: column;
  }
  .settings-source-management-foot > div,
  .settings-auto-refresh-control {
    width: 100%;
    justify-content: flex-start;
  }
  .settings-manual-form {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .settings-manual-form label:nth-child(5) {
    grid-column: span 2;
  }
  .settings-form-actions {
    grid-column: 1 / -1;
  }
  .settings-manual-list {
    grid-template-columns: 1fr;
  }
  .settings-snapshot-grid {
    grid-template-columns: 1fr;
  }
  .settings-report-summary {
    grid-template-columns: 1fr;
  }
  .settings-panel-foot {
    align-items: flex-start;
    flex-direction: column;
  }
  .settings-footer {
    right: 14px;
    bottom: 12px;
    left: 14px;
    max-width: none;
    text-align: center;
  }
}

@media (max-width: 520px) {
  .settings-tabs {
    margin-right: -14px;
    margin-left: -14px;
    padding: 0 8px;
  }
  .settings-tab {
    min-width: 88px;
    padding: 0 6px;
    gap: 5px;
    white-space: nowrap;
  }
  .settings-source-fields,
  .settings-manual-form,
  .settings-content-options {
    grid-template-columns: 1fr;
  }
  .settings-source-snapshot {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .settings-source-fields .settings-field-wide,
  .settings-manual-form label:nth-child(5),
  .settings-form-actions {
    grid-column: auto;
  }
  .settings-form-actions {
    flex-wrap: wrap;
  }
  .settings-form-actions button {
    flex: 1;
  }
  .settings-status-row {
    grid-template-columns: 8px 1fr auto;
    gap: 7px;
    padding: 7px 9px;
  }
  .settings-status-message {
    grid-column: 2 / -1;
  }
}
</style>
