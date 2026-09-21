import type { DataSourceId, LocalConfig } from "../../data/types";
import {
  applyLocalConfigToSiteData,
  buildSiteDataFromResults,
  filterLibraryItemsForConfig,
  hasSelectedContent,
  mapManualItem,
  mergeSourceSiteData,
  selectedContentLabel,
  sourceLabel as projectSourceLabel,
  sourceLabels,
} from "./siteData";
import { getSourceAdapter } from "./registry";
import {
  dataSourceIds,
  type DataSyncResult,
  type SourceSyncResult,
} from "./types";

/**
 * 生成来源同步失败结果；失败不会阻塞其他来源和静态页面生成。
 *
 * @param sourceId - 发生错误的来源标识。
 * @param error - 来源同步过程捕获的未知错误。
 * @returns 可继续参与页面合并的失败结果。
 */
function sourceError(
  sourceId: DataSourceId,
  error: unknown,
): SourceSyncResult {
  return {
  sourceId,
  status: {
    id: sourceId,
    label: projectSourceLabel(sourceId),
    status: "error",
    message: String(error instanceof Error ? error.message : error),
    count: 0,
  },
  rawData: null,
  libraryItems: [],
  repositories: [],
  };
}

/**
 * 生成来源被配置跳过时的统一结果。
 *
 * @param sourceId - 被跳过的来源标识。
 * @param message - 说明跳过原因的中文消息。
 * @returns 可继续参与页面合并的跳过结果。
 */
function skippedSource(
  sourceId: DataSourceId,
  message: string,
): SourceSyncResult {
  return {
  sourceId,
  status: {
    id: sourceId,
    label: projectSourceLabel(sourceId),
    status: "skipped",
    message,
    count: 0,
  },
  rawData: null,
  libraryItems: [],
  repositories: [],
  };
}

/**
 * 返回各来源缺少账号标识时使用的中文提示。
 *
 * @param sourceId - 缺少身份信息的来源标识。
 * @returns 面向设置页的缺少身份提示。
 */
function missingIdentityMessage(sourceId: DataSourceId): string {
  if (sourceId === "bilibili") return "未配置 UID";
  if (sourceId === "netease" || sourceId === "qqmusic") {
    return "未配置用户 ID";
  }
  if (sourceId === "steam") return "未配置 Steam 个人页地址或 SteamID64";
  if (sourceId === "sfacg") return "未配置 SFACG 开放书架地址";
  return "未配置用户名";
}

/**
 * 将来源原始响应按当前配置重新生成公开投影。
 *
 * @param config - 当前完整本地配置。
 * @param sourceId - 需要重新投影的来源标识。
 * @param rawData - 来源私有快照中的原始数据。
 * @returns 当前配置允许公开的资料库、音乐和仓库投影。
 */
export function projectSourceRaw(
  config: LocalConfig,
  sourceId: DataSourceId,
  rawData: unknown,
): Pick<SourceSyncResult, "libraryItems" | "musicCatalog" | "repositories"> {
  const adapter = getSourceAdapter(sourceId);
  const projection = adapter.project(rawData, config.sources[sourceId]);
  return {
    libraryItems: filterLibraryItemsForConfig(projection.libraryItems, config),
    ...(projection.musicCatalog ? { musicCatalog: projection.musicCatalog } : {}),
    repositories: projection.repositories,
  };
}

/**
 * 独立抓取一个来源；调用方可以决定是否把结果写入快照。
 *
 * @param config - 当前完整本地配置。
 * @param sourceId - 需要同步的来源标识。
 * @returns 该来源的同步状态、原始数据和统一投影。
 */
export async function syncDataSource(
  config: LocalConfig,
  sourceId: DataSourceId,
): Promise<SourceSyncResult> {
  const sourceConfig = config.sources[sourceId];
  if (!sourceConfig.enabled) return skippedSource(sourceId, "未启用");
  if (!hasSelectedContent(sourceId, config)) {
    return skippedSource(sourceId, "未选择同步内容");
  }

  const adapter = getSourceAdapter(sourceId);
  if (!adapter.resolveIdentity(sourceConfig)) {
    return sourceError(sourceId, missingIdentityMessage(sourceId));
  }

  try {
    const result = await adapter.sync(sourceConfig);
    const projection = projectSourceRaw(config, sourceId, result.rawData);
    return {
      sourceId,
      status: {
        id: sourceId,
        label: projectSourceLabel(sourceId),
        status: "success",
        message: adapter.formatMessage(result, sourceConfig),
        count: projection.libraryItems.length + projection.repositories.length,
      },
      rawData: result.rawData,
      ...projection,
    };
  } catch (error) {
    return sourceError(sourceId, error);
  }
}

/**
 * 并行抓取全部来源并组装成可写入站点快照的完整数据。
 *
 * @param config - 当前完整本地配置。
 * @returns 包含页面快照和每个来源状态的同步结果。
 */
export async function collectSiteData(
  config: LocalConfig,
): Promise<DataSyncResult> {
  const results = await Promise.all(
    dataSourceIds.map((sourceId) => syncDataSource(config, sourceId)),
  );
  const siteData = buildSiteDataFromResults(config, results);
  return { siteData, statuses: siteData.providerStatus };
}

export {
  applyLocalConfigToSiteData,
  hasSelectedContent,
  mapManualItem,
  mergeSourceSiteData,
  selectedContentLabel,
  sourceLabels,
};
export { dataSourceIds, ProviderError } from "./types";
export type { DataSyncResult, SourceSyncResult } from "./types";
