import type {
  DataSourceId,
  LibraryItem,
  MusicCatalog,
  ProviderStatus,
  RepositorySummary,
  SiteData,
} from "../../data/types";

/** 可供设置页单独同步的数据来源。 */
export const dataSourceIds = [
  "bangumi",
  "bilibili",
  "github",
  "netease",
  "qqmusic",
] as const satisfies readonly DataSourceId[];

export interface DataSyncResult {
  siteData: SiteData;
  statuses: ProviderStatus[];
}

export interface SourceSyncResult {
  sourceId: DataSourceId;
  status: ProviderStatus;
  /** 适配器抓取到的原始响应，写入本地私有快照，不进入 generated.json。 */
  rawData: unknown;
  /** 与 UI 卡片无关的统一资料库投影。 */
  libraryItems: LibraryItem[];
  /** 音乐来源的歌单与曲目目录，供全局播放器使用。 */
  musicCatalog?: MusicCatalog;
  repositories: RepositorySummary[];
  fetchedAt?: string;
}

export type LibraryItemSeed = Pick<
  LibraryItem,
  | "id"
  | "title"
  | "subtitle"
  | "itemType"
  | "cover"
  | "platform"
  | "sourceId"
  | "sourceKind"
  | "url"
  | "metadata"
>;

export interface ProviderSyncData {
  rawData: unknown;
  libraryItems: LibraryItem[];
  musicCatalog?: MusicCatalog;
  repositories: RepositorySummary[];
  message: string;
}

export class ProviderError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
