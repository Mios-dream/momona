import type { DataSourceId, SourceConfig } from "../../data/types";
import {
  projectBangumiRaw,
  syncBangumi,
} from "./providers/bangumi";
import {
  projectBilibiliRaw,
  syncBilibili,
} from "./providers/bilibili";
import {
  musicUserId,
  projectMusicCatalog,
  projectMusicRaw,
  syncMusic,
} from "./providers/music";
import {
  projectGithubRaw,
  syncGithub,
} from "./providers/github";
import { projectSfacgRaw, syncSfacg } from "./providers/sfacg";
import { projectSteamRaw, syncSteam } from "./providers/steam";
import { sortRepositories } from "./repositories";
import { sourceValue } from "./shared";
import { selectedSourceContentLabel } from "../../data/sourceCatalog";
import type { ProviderSyncData } from "./types";

/** 来源同步后统一交给站点数据层的投影。 */
export interface SourceProjection {
  libraryItems: ProviderSyncData["libraryItems"];
  musicCatalog?: ProviderSyncData["musicCatalog"];
  repositories: ProviderSyncData["repositories"];
}

/** 一个数据来源必须提供的身份、抓取和投影能力。 */
export interface SourceAdapter {
  /** 从配置中解析远程服务所需的用户身份。 */
  resolveIdentity: (config: SourceConfig) => string;
  /** 读取来源原始数据。 */
  sync: (config: SourceConfig) => Promise<ProviderSyncData>;
  /** 将原始数据投影为当前配置允许公开的统一结构。 */
  project: (rawData: unknown, config: SourceConfig) => SourceProjection;
  /** 生成该来源成功同步后的状态消息。 */
  formatMessage: (
    result: ProviderSyncData,
    config: SourceConfig,
  ) => string;
}

/**
 * 使用通用来源配置读取用户名或链接中的最后一段标识。
 *
 * @param config - 当前来源配置。
 * @returns 适配器需要的用户名或链接末段标识。
 */
function usernameIdentity(config: SourceConfig): string {
  return sourceValue(config.username, /\/([^/]+)\/?$/);
}

/**
 * 读取 Bilibili UID。
 *
 * @param config - 当前来源配置。
 * @returns Bilibili UID；无法解析时返回空字符串。
 */
function bilibiliIdentity(config: SourceConfig): string {
  return sourceValue(config.userId, /\/(\d+)\/?$/);
}

/**
 * 读取 Steam 个人页、自定义地址或 SteamID64。
 *
 * @param config - 当前来源配置。
 * @returns Steam 个人页标识或 SteamID64。
 */
function steamIdentity(config: SourceConfig): string {
  return sourceValue(config.username, /\/(?:profiles|id)\/([^/]+)\/?$/);
}

/**
 * 读取 SFACG 开放书架地址中的书架 ID。
 *
 * @param config - 当前来源配置。
 * @returns SFACG 书架 ID；无法解析时返回空字符串。
 */
function sfacgIdentity(config: SourceConfig): string {
  return sourceValue(config.username, /\/p\/(\d+)(?:\/\d+)?\/?$/);
}

/**
 * 读取音乐平台的数字用户 ID。
 *
 * @param config - 当前来源配置。
 * @returns 音乐平台用户 ID；无法解析时返回空字符串。
 */
function musicIdentity(config: SourceConfig): string {
  return musicUserId(config.username || config.userId);
}

/**
 * 将 Bangumi 原始响应投影为统一资料库条目。
 *
 * @param rawData - Bangumi provider 保存的原始响应。
 * @param _config - 当前来源配置，Bangumi 投影暂不需要额外配置。
 * @returns Bangumi 资料库条目和空仓库列表。
 */
function projectBangumiSource(rawData: unknown, _config: SourceConfig): SourceProjection {
  return {
    libraryItems: projectBangumiRaw(rawData),
    repositories: [],
  };
}

/**
 * 将 Bilibili 原始响应按配置投影为统一资料库条目。
 *
 * @param rawData - Bilibili provider 保存的原始响应。
 * @param config - 当前 Bilibili 来源配置。
 * @returns Bilibili 资料库条目和空仓库列表。
 */
function projectBilibiliSource(
  rawData: unknown,
  config: SourceConfig,
): SourceProjection {
  return {
    libraryItems: projectBilibiliRaw(rawData, config),
    repositories: [],
  };
}

/**
 * 将 GitHub 原始响应投影为按配置排序的仓库列表。
 *
 * @param rawData - GitHub provider 保存的原始响应。
 * @param config - 当前 GitHub 来源配置。
 * @returns 空资料库条目和按用户选择排序后的仓库列表。
 */
function projectGithubSource(
  rawData: unknown,
  config: SourceConfig,
): SourceProjection {
  return {
    libraryItems: [],
    repositories: sortRepositories(
      projectGithubRaw(rawData),
      config.content.githubRepositorySort,
    ),
  };
}

/**
 * 将网易云音乐原始响应投影为资料库条目和播放器目录。
 *
 * @param rawData - 网易云音乐 provider 保存的原始响应。
 * @param config - 当前音乐来源配置。
 * @returns 资料库条目、播放器歌单目录和空仓库列表。
 */
function projectNeteaseSource(
  rawData: unknown,
  config: SourceConfig,
): SourceProjection {
  return {
    libraryItems: projectMusicRaw(rawData, "netease", config),
    musicCatalog: projectMusicCatalog(rawData, "netease", config),
    repositories: [],
  };
}

/**
 * 将 QQ 音乐原始响应投影为资料库条目和播放器目录。
 *
 * @param rawData - QQ 音乐 provider 保存的原始响应。
 * @param config - 当前音乐来源配置。
 * @returns 资料库条目、播放器歌单目录和空仓库列表。
 */
function projectQqMusicSource(
  rawData: unknown,
  config: SourceConfig,
): SourceProjection {
  return {
    libraryItems: projectMusicRaw(rawData, "qqmusic", config),
    musicCatalog: projectMusicCatalog(rawData, "qqmusic", config),
    repositories: [],
  };
}

/**
 * 将 Steam 原始响应按配置投影为统一资料库条目。
 *
 * @param rawData - Steam provider 保存的原始响应。
 * @param config - 当前 Steam 来源配置。
 * @returns Steam 资料库条目和空仓库列表。
 */
function projectSteamSource(
  rawData: unknown,
  config: SourceConfig,
): SourceProjection {
  return {
    libraryItems: projectSteamRaw(rawData, config),
    repositories: [],
  };
}

/**
 * 将 SFACG 原始响应按配置投影为统一资料库条目。
 *
 * @param rawData - SFACG provider 保存的原始响应。
 * @param config - 当前 SFACG 来源配置。
 * @returns SFACG 资料库条目和空仓库列表。
 */
function projectSfacgSource(
  rawData: unknown,
  config: SourceConfig,
): SourceProjection {
  return {
    libraryItems: projectSfacgRaw(rawData, config),
    repositories: [],
  };
}

/**
 * 生成按来源配置内容选择生成的成功消息。
 *
 * @param sourceId - 数据来源标识。
 * @param config - 当前来源配置。
 * @returns 设置页和同步状态使用的成功消息。
 */
function formatSelectedContentMessage(
  sourceId: DataSourceId,
  config: SourceConfig,
): string {
  return `已同步${selectedSourceContentLabel(sourceId, config.content)}`;
}

/**
 * 格式化网易云音乐同步成功消息。
 *
 * @param result - 网易云音乐 provider 的同步结果。
 * @param config - 当前来源配置。
 * @returns 包含同步摘要和内容选择的成功消息。
 */
function formatNeteaseMessage(
  result: ProviderSyncData,
  config: SourceConfig,
): string {
  return `${result.message}：${formatSelectedContentMessage("netease", config)}`;
}

/**
 * 格式化 QQ 音乐同步成功消息。
 *
 * @param result - QQ 音乐 provider 的同步结果。
 * @param config - 当前来源配置。
 * @returns 包含同步摘要和内容选择的成功消息。
 */
function formatQqMusicMessage(
  result: ProviderSyncData,
  config: SourceConfig,
): string {
  return `${result.message}：${formatSelectedContentMessage("qqmusic", config)}`;
}

/**
 * 格式化 Bangumi 同步成功消息。
 *
 * @param _result - Bangumi provider 的同步结果，消息由配置选择生成。
 * @param config - 当前来源配置。
 * @returns 描述已同步内容类型的成功消息。
 */
function formatBangumiMessage(
  _result: ProviderSyncData,
  config: SourceConfig,
): string {
  return formatSelectedContentMessage("bangumi", config);
}

/**
 * 格式化 Bilibili 同步成功消息。
 *
 * @param _result - Bilibili provider 的同步结果，消息由配置选择生成。
 * @param config - 当前来源配置。
 * @returns 描述已同步内容类型的成功消息。
 */
function formatBilibiliMessage(
  _result: ProviderSyncData,
  config: SourceConfig,
): string {
  return formatSelectedContentMessage("bilibili", config);
}

/**
 * 返回 provider 已经生成的同步消息。
 *
 * @param result - provider 的同步结果。
 * @returns provider 生成的状态消息。
 */
function formatResultMessage(result: ProviderSyncData): string {
  return result.message;
}

/**
 * 读取网易云音乐来源的原始响应。
 *
 * @param config - 当前网易云音乐来源配置。
 * @returns provider 原始同步结果的 Promise。
 */
function syncNeteaseSource(config: SourceConfig): Promise<ProviderSyncData> {
  return syncMusic("netease", config);
}

/**
 * 读取 QQ 音乐来源的原始响应。
 *
 * @param config - 当前 QQ 音乐来源配置。
 * @returns provider 原始同步结果的 Promise。
 */
function syncQqMusicSource(config: SourceConfig): Promise<ProviderSyncData> {
  return syncMusic("qqmusic", config);
}

/**
 * 所有来源的适配器注册表。
 *
 * 页面和快照层只依赖这个统一协议，不需要知道某个来源使用 REST、GraphQL、
 * XML 还是多个远程请求组合而成。
 */
export const sourceAdapters: Record<DataSourceId, SourceAdapter> = {
  bangumi: {
    resolveIdentity: usernameIdentity,
    sync: syncBangumi,
    project: projectBangumiSource,
    formatMessage: formatBangumiMessage,
  },
  bilibili: {
    resolveIdentity: bilibiliIdentity,
    sync: syncBilibili,
    project: projectBilibiliSource,
    formatMessage: formatBilibiliMessage,
  },
  github: {
    resolveIdentity: usernameIdentity,
    sync: syncGithub,
    project: projectGithubSource,
    formatMessage: formatResultMessage,
  },
  netease: {
    resolveIdentity: musicIdentity,
    sync: syncNeteaseSource,
    project: projectNeteaseSource,
    formatMessage: formatNeteaseMessage,
  },
  qqmusic: {
    resolveIdentity: musicIdentity,
    sync: syncQqMusicSource,
    project: projectQqMusicSource,
    formatMessage: formatQqMusicMessage,
  },
  steam: {
    resolveIdentity: steamIdentity,
    sync: syncSteam,
    project: projectSteamSource,
    formatMessage: formatResultMessage,
  },
  sfacg: {
    resolveIdentity: sfacgIdentity,
    sync: syncSfacg,
    project: projectSfacgSource,
    formatMessage: formatResultMessage,
  },
};

/**
 * 返回已注册的来源适配器；集中处理类型索引，调用方无需重复判断来源是否存在。
 *
 * @param sourceId - 需要读取的来源标识。
 * @returns 与来源标识对应的适配器；`DataSourceId` 类型保证调用方只能传入已注册来源。
 */
export function getSourceAdapter(sourceId: DataSourceId): SourceAdapter {
  return sourceAdapters[sourceId];
}
