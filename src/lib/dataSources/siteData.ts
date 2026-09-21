import { mergeSiteData } from "../../data/site";
import { createBrewSources } from "../../data/brew";
import type {
  LibraryItem,
  LibraryTile,
  LocalConfig,
  MusicCatalog,
  ProviderStatus,
  RepositorySummary,
  SiteData,
} from "../../data/types";
import { tileFor } from "./shared";
import { sortRepositories } from "./repositories";
import type { SourceSyncResult } from "./types";
import {
  activitiesFromSources,
  collectionsFromTiles,
  feedCardsWithRepos,
  reportPlatformsWithData,
} from "./siteData/presentation";
import {
  homeMediaFromData,
  mergeMusicCatalog,
  musicCatalogForConfig,
} from "./siteData/media";
import {
  filterLibraryItemsForConfig,
  removeHiddenTiles,
  statusList,
} from "./siteData/visibility";

export {
  filterLibraryItemsForConfig,
  hasSelectedContent,
  selectedContentLabel,
  sourceLabel,
  sourceLabels,
} from "./siteData/visibility";

/**
 * 将统一资料条目转换为画布和首页共用的展示卡片。
 *
 * @param items - 来源适配器生成的统一资料条目。
 * @returns 带有布局信息和展示样式的资料库卡片。
 */
function tilesFromItems(items: LibraryItem[]): LibraryTile[] {
  return items.map((item, index) => tileFor(index, item));
}

/**
 * 组合基础快照、配置和来源投影，生成完整的页面数据。
 *
 * @param base - 当前已有的页面快照。
 * @param config - 当前本地配置。
 * @param libraryTiles - 经过可见性过滤的资料库卡片。
 * @param repositories - 当前来源投影出的仓库列表。
 * @param statuses - 当前来源同步状态列表。
 * @param musicCatalog - 当前音乐目录；省略时使用基础快照中的目录。
 * @returns 重新派生后的完整页面数据。
 */
function deriveSiteData(
  base: SiteData,
  config: LocalConfig,
  libraryTiles: LibraryTile[],
  repositories: RepositorySummary[],
  statuses: ProviderStatus[],
  musicCatalog = base.musicCatalog,
): SiteData {
  const orderedRepositories = sortRepositories(
    repositories,
    config.sources.github.content.githubRepositorySort,
  );
  const collections = libraryTiles.length
    ? libraryTiles.some((tile) => tile.sourceId)
      ? collectionsFromTiles(libraryTiles)
      : base.collections
    : [];
  const activities = orderedRepositories.length
    ? activitiesFromSources(orderedRepositories)
    : base.activities.filter(
        (activity) =>
          !activity.id.startsWith("status-") &&
        !activity.id.startsWith("github-activity-"),
      );
  const nextMusicCatalog = musicCatalogForConfig(musicCatalog, config);
  return mergeSiteData({
    ...base,
    profile: { ...base.profile, ...config.account },
    socialLinks: config.socialLinks,
    friends: config.friends,
    libraryTiles: libraryTiles,
    brewSources: createBrewSources(config.friends, base.brewSources),
    collections,
    feedCards: feedCardsWithRepos(base.feedCards, orderedRepositories),
    activities,
    reportPlatforms: reportPlatformsWithData(
      base.reportPlatforms,
      orderedRepositories,
      libraryTiles,
      config,
    ),
    music: { ...base.music, ...config.music },
    musicCatalog: nextMusicCatalog,
    homeMedia: homeMediaFromData(
      base.homeMedia,
      libraryTiles,
      nextMusicCatalog,
    ),
    repositories: orderedRepositories,
    homeWidgets: config.widgets,
    providerStatus: statuses,
    generatedAt: new Date().toISOString(),
  });
}

/**
 * 只应用本地设置，不访问任何远程来源。
 *
 * @param current - 当前页面快照，可为空。
 * @param config - 当前本地配置。
 * @returns 应用设置后的页面数据。
 */
export function applyLocalConfigToSiteData(
  current: Partial<SiteData> | null | undefined,
  config: LocalConfig,
): SiteData {
  const base = mergeSiteData(current ?? {});
  const withoutHidden = removeHiddenTiles(base.libraryTiles, config);
  const repositories =
    config.sources.github.enabled &&
    config.sources.github.content.githubRepositories
      ? base.repositories
      : [];
  return deriveSiteData(
    base,
    config,
    withoutHidden,
    repositories,
    statusList(base.providerStatus, config),
    musicCatalogForConfig(base.musicCatalog, config),
  );
}

/**
 * 合并一个来源的结果；网络失败时保留该来源已有数据。
 *
 * @param current - 当前页面快照，可为空。
 * @param config - 当前本地配置。
 * @param result - 一个来源的同步结果。
 * @returns 合并来源结果后的页面数据。
 */
export function mergeSourceSiteData(
  current: Partial<SiteData> | null | undefined,
  config: LocalConfig,
  result: SourceSyncResult,
): SiteData {
  const base = applyLocalConfigToSiteData(current, config);
  const sourcePrefix = `${result.sourceId}-`;
  const sourceTiles = base.libraryTiles.filter(
    (tile) =>
      tile.sourceId === result.sourceId || tile.id.startsWith(sourcePrefix),
  );
  // 网络失败时保留旧来源内容，避免一次临时故障把页面清空。
  const retainedSourceTiles =
    result.status.status === "error"
      ? sourceTiles
      : tilesFromItems(filterLibraryItemsForConfig(result.libraryItems, config));
  const retainedTiles = removeHiddenTiles(base.libraryTiles, config)
    .filter(
      (tile) =>
        tile.sourceId !== result.sourceId && !tile.id.startsWith(sourcePrefix),
    );
  const libraryTiles = [...retainedTiles, ...retainedSourceTiles];
  // 仓库只由 GitHub 结果更新；其他来源以及 GitHub 失败都沿用现有数据。
  const repositories =
    result.sourceId === "github" && result.status.status !== "error"
      ? result.repositories
      : base.repositories;
  // 音乐目录按来源增量合并；失败时保留全部旧目录，避免删除另一平台的数据。
  const musicCatalog =
    result.status.status === "error"
      ? base.musicCatalog
      : mergeMusicCatalog(
          base.musicCatalog,
          result.sourceId === "netease"
            ? "netease"
            : result.sourceId === "qqmusic"
              ? "qq"
              : undefined,
          result.musicCatalog,
        );
  const statuses = statusList(
    [
      ...base.providerStatus.filter((status) => status.id !== result.sourceId),
      result.status,
    ],
    config,
  );

  return deriveSiteData(
    base,
    config,
    libraryTiles,
    repositories,
    statuses,
    musicCatalog,
  );
}

/**
 * 将多个来源同步结果组装为全新的页面数据快照。
 *
 * @param config - 当前本地配置。
 * @param results - 各来源独立同步结果。
 * @returns 由所有来源结果派生出的完整页面快照。
 */
export function buildSiteDataFromResults(
  config: LocalConfig,
  results: SourceSyncResult[],
): SiteData {
  const statuses = statusList(
    results.map((result) => result.status),
    config,
  );
  const remoteTiles = tilesFromItems(
    filterLibraryItemsForConfig(
      results.flatMap((result) => result.libraryItems),
      config,
    ),
  );
  const libraryTiles = remoteTiles;
  const musicCatalog = results.reduce(
    (catalog, result) =>
      mergeMusicCatalog(
        catalog,
        result.sourceId === "netease"
          ? "netease"
          : result.sourceId === "qqmusic"
            ? "qq"
            : undefined,
        result.musicCatalog,
      ),
    { playlists: [] } as MusicCatalog,
  );
  const github = results.find((result) => result.sourceId === "github");
  const repositories = github?.repositories ?? [];
  return deriveSiteData(
    mergeSiteData(),
    config,
    libraryTiles,
    repositories,
    statuses,
    musicCatalog,
  );
}
