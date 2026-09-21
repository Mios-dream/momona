import type {
  DataSourceId,
  LibraryItem,
  MusicCatalog,
  ProviderStatus,
  RepositorySummary,
  SiteData,
} from "../../data/types";
import { dataSourceIds as sourceCatalogIds } from "../../data/sourceCatalog";

/** 可供设置页单独同步的数据来源。 */
export const dataSourceIds = sourceCatalogIds;

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
  /**
   * 创建带可选 HTTP 状态码的来源同步错误。
   *
   * @param message - 来源同步失败的可读错误信息。
   * @param status - 上游 HTTP 状态码，没有状态码时留空。
   * @returns 无返回值；错误对象会携带 ProviderError 类型标识。
   */
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = "ProviderError";
  }
}
