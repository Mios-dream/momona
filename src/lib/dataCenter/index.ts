import { mergeSiteData } from "../../data/site";
import type { FriendLink, LocalConfig, SiteData } from "../../data/types";
import {
  applyLocalConfigToSiteData,
  mergeSourceSiteData,
  projectSourceRaw,
} from "../dataSources/index";
import { readLocalConfigFile } from "../localConfigStore";
import { readSiteSnapshot } from "../localSnapshot";
import { readSourceRawSnapshot } from "../sourceSnapshots";
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

export const getDataCenter = async (): Promise<DataCenter> => {
  const [snapshot, localConfig, bangumiRaw, neteaseRaw] = await Promise.all([
    readSiteSnapshot(),
    readLocalConfigFile(),
    readSourceRawSnapshot("bangumi"),
    readSourceRawSnapshot("netease"),
  ]);
  let siteData = applyLocalConfigToSiteData(mergeSiteData(snapshot), localConfig);

  // Older generated snapshots predate the homepage media summaries. Re-project
  // the private raw snapshots once so ratings and user media data are available
  // without requiring a fresh network sync.
  if (!snapshot.homeMedia) {
    for (const [sourceId, rawSnapshot] of [
      ["bangumi", bangumiRaw],
      ["netease", neteaseRaw],
    ] as const) {
      if (!rawSnapshot) continue;
      const projection = projectSourceRaw(localConfig, sourceId, rawSnapshot.rawData);
      const previousStatus = siteData.providerStatus.find(
        (status) => status.id === sourceId,
      );
      const status: ProviderStatus = {
        id: sourceId as DataSourceId,
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
  }

  return {
    siteData,
    localConfig,
    selectors: {
      friends: () => siteData.friends,
      home: () => siteData,
    },
  };
};
