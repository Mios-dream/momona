import { mergeSiteData } from "../../data/site";
import type { FriendLink, LocalConfig, SiteData } from "../../data/types";
import {
  applyLocalConfigToSiteData,
  mergeSourceSiteData,
  projectSourceRaw,
} from "../dataSources/index";
import { readLocalConfigFile } from "../localConfigStore";
import { readSiteSnapshot } from "../localSnapshot";
import {
  readSourceRawSnapshot,
  type SourceRawSnapshot,
} from "../sourceSnapshots";
import type { DataSourceId, ProviderStatus } from "../../data/types";

/**
 * 构建期统一数据入口。
 *
 * 这个模块只在 Astro frontmatter 中使用。Vue 组件接收它生成的可序列化
 * 数据，不直接读取文件、Content API 或本地凭据。
 */
export interface DataCenter {
  siteData: SiteData;
  localConfig: LocalConfig;
  selectors: {
    friends: () => FriendLink[];
    home: () => SiteData;
  };
}

/**
 * 从旧版来源原始快照恢复首页媒体摘要。
 *
 * 这是针对旧快照格式的兼容路径，只处理历史上会贡献首页媒体的 Bangumi
 * 和网易云来源；正常同步仍由来源注册表负责，不在这里复制来源适配逻辑。
 *
 * @param initialSiteData - 已应用当前配置的页面数据。
 * @param localConfig - 当前本地配置。
 * @param snapshots - 需要尝试恢复的来源原始快照。
 * @returns 补齐旧首页媒体字段后的页面数据。
 */
function restoreLegacyHomeMedia(
  initialSiteData: SiteData,
  localConfig: LocalConfig,
  snapshots: ReadonlyArray<
    readonly [DataSourceId, SourceRawSnapshot | null]
  >,
): SiteData {
  let siteData = initialSiteData;
  for (const [sourceId, rawSnapshot] of snapshots) {
    if (!rawSnapshot) continue;
    const projection = projectSourceRaw(localConfig, sourceId, rawSnapshot.rawData);
    const previousStatus = siteData.providerStatus.find(
      (status) => status.id === sourceId,
    );
    const status: ProviderStatus = {
      id: sourceId,
      label: previousStatus?.label ?? sourceId,
      status: "success",
      message: previousStatus?.message ?? "已从本地原始快照恢复",
      count: projection.libraryItems.length,
    };
    siteData = mergeSourceSiteData(siteData, localConfig, {
      sourceId,
      rawData: rawSnapshot.rawData,
      libraryItems: projection.libraryItems,
      ...(projection.musicCatalog
        ? { musicCatalog: projection.musicCatalog }
        : {}),
      repositories: projection.repositories,
      status,
    });
  }
  return siteData;
}

/**
 * 读取快照、配置和必要的原始数据，构建 Astro 页面统一数据入口。
 *
 * @returns 构建期页面数据、配置和选择器。
 */
export async function getDataCenter(): Promise<DataCenter> {
  const [snapshot, localConfig, bangumiRaw, neteaseRaw] = await Promise.all([
    readSiteSnapshot(),
    readLocalConfigFile(),
    readSourceRawSnapshot("bangumi"),
    readSourceRawSnapshot("netease"),
  ]);
  let siteData = applyLocalConfigToSiteData(mergeSiteData(snapshot), localConfig);

  // 旧快照可能没有首页媒体摘要；这里仅用本地原始快照重新投影一次，避免
  // 为了补齐页面字段而强制发起新的网络同步。
  if (!snapshot.homeMedia) {
    siteData = restoreLegacyHomeMedia(siteData, localConfig, [
      ["bangumi", bangumiRaw],
      ["netease", neteaseRaw],
    ]);
  }

  /**
   * 返回当前页面快照中的友联数据。
   *
   * @returns 当前页面的友联列表。
   */
  function selectFriends(): FriendLink[] {
    return siteData.friends;
  }

  /**
   * 返回当前页面完整快照，供 Astro 页面按需选择数据。
   *
   * @returns 当前页面完整公开数据。
   */
  function selectHome(): SiteData {
    return siteData;
  }

  return {
    siteData,
    localConfig,
    selectors: {
      friends: selectFriends,
      home: selectHome,
    },
  };
}
