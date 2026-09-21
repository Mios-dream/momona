import {
  dataSourceIds,
  hasSelectedSourceContent,
  selectedSourceContentLabel,
  sourceContentKeys,
  sourceLabels,
} from "../../../data/sourceCatalog";
import type {
  DataSourceId,
  LibraryItem,
  LibraryTile,
  LocalConfig,
  ProviderStatus,
  SourceContentKey,
} from "../../../data/types";

/**
 * 返回来源展示名称。
 *
 * @param sourceId - 数据来源标识。
 * @returns 面向用户的来源名称。
 */
export function sourceLabel(sourceId: DataSourceId): string {
  return sourceLabels[sourceId];
}

/**
 * 判断来源是否选择了至少一种需要同步的内容。
 *
 * @param sourceId - 数据来源标识。
 * @param config - 当前完整本地配置。
 * @returns 至少启用一个内容开关时返回 true。
 */
export function hasSelectedContent(
  sourceId: DataSourceId,
  config: LocalConfig,
): boolean {
  return hasSelectedSourceContent(sourceId, config.sources[sourceId].content);
}

/**
 * 生成设置页和同步状态使用的已选内容摘要。
 *
 * @param sourceId - 数据来源标识。
 * @param config - 当前完整本地配置。
 * @returns 面向用户的已选内容名称。
 */
export function selectedContentLabel(
  sourceId: DataSourceId,
  config: LocalConfig,
): string {
  return selectedSourceContentLabel(sourceId, config.sources[sourceId].content);
}

/**
 * 判断一个来源内容键是否属于该来源，避免不同来源的同名配置被误用。
 *
 * @param sourceId - 数据来源标识。
 * @param sourceKind - 待判断的内容配置键。
 * @returns 内容键属于来源时返回 true。
 */
function isSourceContentKey(
  sourceId: DataSourceId,
  sourceKind: SourceContentKey | undefined,
): boolean {
  if (!sourceKind) return false;
  return sourceContentKeys[sourceId].some((key) => key === sourceKind);
}

/**
 * 判断来源开关和内容开关是否同时允许一个条目显示。
 *
 * @param config - 当前完整本地配置。
 * @param sourceId - 数据来源标识。
 * @param sourceKind - 条目对应的来源内容键。
 * @returns 来源和内容均允许时返回 true。
 */
function sourceContentEnabled(
  config: LocalConfig,
  sourceId: DataSourceId,
  sourceKind?: SourceContentKey,
): boolean {
  const source = config.sources[sourceId];
  if (!source.enabled) return false;
  if (!isSourceContentKey(sourceId, sourceKind)) return true;
  return source.content[sourceKind as keyof typeof source.content] === true;
}

/**
 * 根据旧快照中的 ID 和标签推断 Bangumi 条目的内容类别。
 *
 * @param tile - 需要判断的 Bangumi 资料库卡片。
 * @returns 对应的内容配置键；无法判断时返回 undefined。
 */
function bangumiTileKind(tile: LibraryTile): SourceContentKey | undefined {
  if (
    tile.sourceKind === "bangumiAnime" ||
    tile.sourceKind === "bangumiGames" ||
    tile.sourceKind === "bangumiBooks" ||
    tile.sourceKind === "bangumiMusic"
  ) {
    return tile.sourceKind;
  }
  if (tile.tag === "anime") return "bangumiAnime";
  if (tile.tag === "game") return "bangumiGames";
  if (tile.tag === "book") return "bangumiBooks";
  if (tile.tag === "music") return "bangumiMusic";
  return undefined;
}

/**
 * 根据旧快照中的 ID 推断 Bilibili 条目的内容类别。
 *
 * @param tile - 需要判断的 Bilibili 资料库卡片。
 * @returns 对应的内容配置键；无法判断时返回 undefined。
 */
function bilibiliTileKind(tile: LibraryTile): SourceContentKey | undefined {
  if (
    tile.sourceKind === "bilibiliVideos" ||
    tile.sourceKind === "bilibiliFavorites" ||
    tile.sourceKind === "bilibiliBangumi"
  ) {
    return tile.sourceKind;
  }
  if (tile.id.startsWith("bilibili-favorite-")) return "bilibiliFavorites";
  if (tile.id.startsWith("bilibili-bangumi-")) return "bilibiliBangumi";
  if (tile.id.startsWith("bilibili-")) return "bilibiliVideos";
  return undefined;
}

/**
 * 判断资料库条目是否允许进入当前公开页面。
 *
 * @param item - 统一资料库条目。
 * @param config - 当前完整本地配置。
 * @returns 条目允许公开展示时返回 true。
 */
export function libraryItemVisibleForConfig(
  item: LibraryItem,
  config: LocalConfig,
): boolean {
  const sourceId = item.sourceId;
  if (!sourceId || (sourceId as string) === "manual") return true;
  return sourceContentEnabled(config, sourceId, item.sourceKind);
}

/**
 * 批量过滤当前配置不允许公开的统一资料条目。
 *
 * @param items - 待过滤的统一资料库条目。
 * @param config - 当前完整本地配置。
 * @returns 当前配置允许公开的条目列表。
 */
export function filterLibraryItemsForConfig(
  items: LibraryItem[],
  config: LocalConfig,
): LibraryItem[] {
  return items.filter((item) => libraryItemVisibleForConfig(item, config));
}

/**
 * 判断旧版或新版资料库卡片是否允许保留。
 *
 * @param tile - 页面快照中的资料库卡片。
 * @param config - 当前完整本地配置。
 * @returns 卡片允许保留时返回 true。
 */
export function tileVisibleForConfig(
  tile: LibraryTile,
  config: LocalConfig,
): boolean {
  if (tile.sourceId === "bangumi" || tile.id.startsWith("bangumi-")) {
    return sourceContentEnabled(config, "bangumi", bangumiTileKind(tile));
  }

  if (tile.sourceId === "bilibili") {
    return sourceContentEnabled(config, "bilibili", bilibiliTileKind(tile));
  }

  if (tile.sourceId === "netease" || tile.sourceId === "qqmusic") {
    return sourceContentEnabled(config, tile.sourceId, tile.sourceKind);
  }

  if (tile.sourceId === "steam") {
    return sourceContentEnabled(config, "steam", tile.sourceKind);
  }

  if (tile.sourceId === "sfacg") {
    return sourceContentEnabled(config, "sfacg", tile.sourceKind);
  }

  return true;
}

/**
 * 移除旧版手动卡片和当前配置已隐藏的远程卡片。
 *
 * @param tiles - 当前页面快照中的资料库卡片。
 * @param config - 当前完整本地配置。
 * @returns 可以继续进入公开页面的卡片列表。
 */
export function removeHiddenTiles(
  tiles: LibraryTile[],
  config: LocalConfig,
): LibraryTile[] {
  return tiles.filter(
    (tile) =>
      String(tile.sourceId) !== "manual" &&
      !tile.id.startsWith("manual-") &&
      tileVisibleForConfig(tile, config),
  );
}

/**
 * 将同步结果补齐为固定顺序的来源状态列表。
 *
 * @param sourceStatuses - 已完成同步的来源状态列表。
 * @param config - 当前完整本地配置。
 * @returns 按来源目录顺序排列并补齐缺省状态的列表。
 */
export function statusList(
  sourceStatuses: ProviderStatus[],
  config: LocalConfig,
): ProviderStatus[] {
  return [
    ...dataSourceIds.map((sourceId) => {
    if (!config.sources[sourceId].enabled) {
      return {
        id: sourceId,
        label: sourceLabel(sourceId),
        status: "skipped" as const,
        message: "未启用",
        count: 0,
      };
    }
    if (!hasSelectedContent(sourceId, config)) {
      return {
        id: sourceId,
        label: sourceLabel(sourceId),
        status: "skipped" as const,
        message: "未选择显示内容",
        count: 0,
      };
    }
    return (
      sourceStatuses.find((status) => status.id === sourceId) ?? {
        id: sourceId,
        label: sourceLabel(sourceId),
        status: "skipped" as const,
        message: "尚未同步",
        count: 0,
      }
    );
  }),
  ];
}

export { sourceLabels };
