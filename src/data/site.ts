import { normalizeHomeWidgets } from './homeWidgets';
import type { SiteData } from './types';

/** 没有页面快照时使用的空数据结构；这里不包含任何站点示例内容。 */
export const emptySiteData: SiteData = {
  profile: {
    name: '',
    latinName: '',
    motto: '',
    avatar: '',
  },
  socialLinks: [],
  friends: [],
  feedCards: [],
  collections: [],
  activities: [],
  libraryTiles: [],
  brewSources: [],
  reportPlatforms: [],
  repositories: [],
  music: {
    enabled: false,
    source: 'manual',
    playlistId: '',
    id: '',
    title: '',
    artist: '',
    album: '',
    cover: '',
    audioUrl: '',
  },
  musicCatalog: {
    playlists: [],
  },
  homeMedia: {
    bangumi: {
      total: 0,
      statusCounts: { done: 0, doing: 0, wish: 0 },
      typeCounts: {},
      tasteProfile: "",
      items: [],
    },
    netease: {
      followerCount: 0,
      playlistCount: 0,
      level: 0,
      moodKeywords: [],
      items: [],
    },
  },
  homeWidgets: [],
  providerStatus: [],
  generatedAt: '',
};

/**
 * 合并公开页面快照；缺失字段保持为空，不生成替代站点内容。
 *
 * @param overrides - 需要覆盖空快照的部分页面数据。
 * @returns 具有完整字段的页面数据快照。
 */
export function mergeSiteData(overrides: Partial<SiteData> = {}): SiteData {
  return {
    profile: { ...emptySiteData.profile, ...(overrides.profile ?? {}) },
    socialLinks: overrides.socialLinks ?? [],
    friends: overrides.friends ?? [],
    feedCards: overrides.feedCards ?? [],
    collections: overrides.collections ?? [],
    activities: overrides.activities ?? [],
    libraryTiles: overrides.libraryTiles ?? [],
    brewSources: overrides.brewSources ?? [],
    reportPlatforms: overrides.reportPlatforms ?? [],
    repositories: overrides.repositories ?? [],
    music: { ...emptySiteData.music, ...(overrides.music ?? {}) },
    musicCatalog: overrides.musicCatalog ?? { playlists: [] },
    homeMedia: {
      bangumi: {
        ...emptySiteData.homeMedia.bangumi,
        ...(overrides.homeMedia?.bangumi ?? {}),
        statusCounts: {
          ...emptySiteData.homeMedia.bangumi.statusCounts,
          ...(overrides.homeMedia?.bangumi?.statusCounts ?? {}),
        },
        typeCounts: overrides.homeMedia?.bangumi?.typeCounts ?? {},
        items: overrides.homeMedia?.bangumi?.items ?? [],
      },
      netease: {
        ...emptySiteData.homeMedia.netease,
        ...(overrides.homeMedia?.netease ?? {}),
        moodKeywords: overrides.homeMedia?.netease?.moodKeywords ?? [],
        items: overrides.homeMedia?.netease?.items ?? [],
      },
    },
    homeWidgets: normalizeHomeWidgets(overrides.homeWidgets, []),
    providerStatus: overrides.providerStatus ?? [],
    generatedAt: overrides.generatedAt ?? "",
  };
}

/** 没有本地快照时的构建起点；真实快照由构建期数据中心按需读取。 */
export const siteData = mergeSiteData();
