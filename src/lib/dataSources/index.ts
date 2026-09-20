import { projectBangumiRaw, syncBangumi } from "./providers/bangumi";
import { projectBilibiliRaw, syncBilibili } from "./providers/bilibili";
import {
  musicUserId,
  projectMusicCatalog,
  projectMusicRaw,
  syncMusic,
} from "./providers/music";
import {
  projectGithubRaw,
  sortGithubRepositories,
  syncGithub,
} from "./providers/github";
import { sourceValue } from "./shared";
import {
  buildSiteDataFromResults,
  filterLibraryItemsForConfig,
  hasSelectedContent,
  sourceLabel,
  selectedContentLabel,
} from "./siteData";
import {
  dataSourceIds,
  type DataSyncResult,
  type SourceSyncResult,
} from "./types";
import type { DataSourceId, LocalConfig } from "../../data/types";

const sourceIdentity = (sourceId: DataSourceId, config: LocalConfig): string =>
  sourceId === "bilibili"
    ? sourceValue(config.sources.bilibili.userId, /\/(\d+)\/?$/)
    : sourceId === "netease" || sourceId === "qqmusic"
      ? musicUserId(
          config.sources[sourceId].username || config.sources[sourceId].userId,
        )
      : sourceValue(config.sources[sourceId].username, /\/([^/]+)\/?$/);

const sourceError = (
  sourceId: DataSourceId,
  error: unknown,
): SourceSyncResult => ({
  sourceId,
  status: {
    id: sourceId,
    label: sourceLabel(sourceId),
    status: "error",
    message: String(error instanceof Error ? error.message : error),
    count: 0,
  },
  rawData: null,
  libraryItems: [],
  musicCatalog: undefined,
  repositories: [],
});

const skippedSource = (
  sourceId: DataSourceId,
  message: string,
): SourceSyncResult => ({
  sourceId,
  status: {
    id: sourceId,
    label: sourceLabel(sourceId),
    status: "skipped",
    message,
    count: 0,
  },
  rawData: null,
  libraryItems: [],
  musicCatalog: undefined,
  repositories: [],
});

/** 将本地原始快照重新投影为当前配置允许进入页面的数据。 */
export const projectSourceRaw = (
  config: LocalConfig,
  sourceId: DataSourceId,
  rawData: unknown,
): Pick<SourceSyncResult, "libraryItems" | "musicCatalog" | "repositories"> => {
  const sourceConfig = config.sources[sourceId];
  const libraryItems =
    sourceId === "bangumi"
      ? projectBangumiRaw(rawData)
      : sourceId === "bilibili"
        ? projectBilibiliRaw(rawData, sourceConfig)
        : sourceId === "netease" || sourceId === "qqmusic"
          ? projectMusicRaw(rawData, sourceId, sourceConfig)
        : [];
  const repositories =
    sourceId === "github"
      ? sortGithubRepositories(
          projectGithubRaw(rawData),
          sourceConfig.content.githubRepositorySort,
        )
      : [];
  const musicCatalog =
    sourceId === "netease" || sourceId === "qqmusic"
      ? projectMusicCatalog(rawData, sourceId, sourceConfig)
      : undefined;
  return {
    libraryItems: filterLibraryItemsForConfig(libraryItems, config),
    ...(musicCatalog ? { musicCatalog } : {}),
    repositories,
  };
};

/** 独立抓取一个来源，调用方可以决定是否把结果写入快照。 */
export const syncDataSource = async (
  config: LocalConfig,
  sourceId: DataSourceId,
): Promise<SourceSyncResult> => {
  const sourceConfig = config.sources[sourceId];
  if (!sourceConfig.enabled) return skippedSource(sourceId, "未启用");
  if (!hasSelectedContent(sourceId, config))
    return skippedSource(sourceId, "未选择同步内容");

  if (!sourceIdentity(sourceId, config)) {
    return sourceError(
      sourceId,
      sourceId === "bilibili"
        ? "未配置 UID"
        : sourceId === "netease" || sourceId === "qqmusic"
          ? "未配置用户 ID"
          : "未配置用户名",
    );
  }

  try {
    if (sourceId === "bangumi") {
      const result = await syncBangumi(sourceConfig);
      const projection = projectSourceRaw(config, sourceId, result.rawData);
      return {
        sourceId,
        status: {
          id: sourceId,
          label: sourceLabel(sourceId),
          status: "success",
          message: `已同步${selectedContentLabel(sourceId, config)}`,
          count: projection.libraryItems.length,
        },
        rawData: result.rawData,
        ...projection,
      };
    }

    if (sourceId === "bilibili") {
      const result = await syncBilibili(sourceConfig);
      const projection = projectSourceRaw(config, sourceId, result.rawData);
      return {
        sourceId,
        status: {
          id: sourceId,
          label: sourceLabel(sourceId),
          status: "success",
          message: `已同步${selectedContentLabel(sourceId, config)}`,
          count: projection.libraryItems.length,
        },
        rawData: result.rawData,
        ...projection,
      };
    }

    if (sourceId === "netease" || sourceId === "qqmusic") {
      const result = await syncMusic(sourceId, sourceConfig);
      const projection = projectSourceRaw(config, sourceId, result.rawData);
      return {
        sourceId,
        status: {
          id: sourceId,
          label: sourceLabel(sourceId),
          status: "success",
          message: `${result.message}：${selectedContentLabel(sourceId, config)}`,
          count: projection.libraryItems.length,
        },
        rawData: result.rawData,
        ...(result.musicCatalog ? { musicCatalog: result.musicCatalog } : {}),
        ...projection,
      };
    }

    const github = await syncGithub(sourceConfig);
    const projection = projectSourceRaw(config, sourceId, github.rawData);
    return {
      sourceId,
      status: {
        id: sourceId,
        label: sourceLabel(sourceId),
        status: "success",
        message: github.message,
        count: projection.repositories.length,
      },
      rawData: github.rawData,
      ...projection,
    };
  } catch (error) {
    return sourceError(sourceId, error);
  }
};

/** 按配置抓取并转换所有来源，任何单个来源失败都不会阻塞静态生成。 */
export const collectSiteData = async (
  config: LocalConfig,
): Promise<DataSyncResult> => {
  const results = await Promise.all(
    dataSourceIds.map((sourceId) => syncDataSource(config, sourceId)),
  );
  const siteData = buildSiteDataFromResults(config, results);
  return { siteData, statuses: siteData.providerStatus };
};

export {
  applyLocalConfigToSiteData,
  hasSelectedContent,
  mapManualItem,
  mergeSourceSiteData,
  sourceLabels,
} from "./siteData";
export { dataSourceIds, ProviderError } from "./types";
export type { DataSyncResult, SourceSyncResult } from "./types";
