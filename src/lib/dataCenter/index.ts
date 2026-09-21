import { mergeSiteData } from "../../data/site";
import { createBrewSources } from "../../data/brew";
import type { FriendLink, LocalConfig, SiteData } from "../../data/types";
import { applyLocalConfigToSiteData } from "../dataSources/index";
import { readLocalConfigFile } from "../localConfigStore";
import { readSiteSnapshot } from "../localSnapshot";
import { readBrewFeedCache } from "../brewFeedCache";
import { readSourceRawSnapshot } from "../sourceSnapshots";
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
 * 读取快照、配置和必要的原始数据，构建 Astro 页面统一数据入口。
 *
 * @returns 构建期页面数据、配置和选择器。
 */
export async function getDataCenter(): Promise<DataCenter> {
  const [snapshot, localConfig, bangumiRaw, neteaseRaw, brewCache] =
    await Promise.all([
      readSiteSnapshot(),
      readLocalConfigFile(),
      readSourceRawSnapshot("bangumi"),
      readSourceRawSnapshot("netease"),
      readBrewFeedCache(),
    ]);
  const snapshotWithBrewCache =
    brewCache === null
      ? snapshot
      : {
          ...snapshot,
          brewSources: createBrewSources(localConfig.friends, brewCache),
        };
  let siteData = applyLocalConfigToSiteData(
    mergeSiteData(snapshotWithBrewCache),
    localConfig,
  );

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
