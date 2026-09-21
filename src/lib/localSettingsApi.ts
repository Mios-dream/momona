import { normalizeLocalConfig } from "../data/localConfig";
import { normalizeFriendLink } from "../data/friends";
import type {
  DataSourceId,
  HoyoGame,
  LocalConfig,
  SiteData,
} from "../data/types";
import {
  applyLocalConfigToSiteData,
  collectSiteData,
  dataSourceIds,
  hasSelectedContent,
  mergeSourceSiteData,
  syncDataSource,
} from "./dataSources/index";
import {
  readAllSourceSnapshotInfo,
  readSourceSnapshotInfo,
  recordSourceStatus,
  saveSourceSnapshot,
} from "./sourceSnapshots";
import { fetchPublicGameAccount } from "./dataSources/gameAccount";
import {
  readLocalConfigFile,
  withLocalCredentials,
  writeLocalConfigFile,
} from "./localConfigStore";
import { createSiteSnapshotStore } from "./localSnapshot";
import {
  readBrewFeedCache,
  syncBrewFeeds,
  writeBrewFeedCache,
} from "./brewFeedCache";

/** 表示本地设置接口可以直接返回给浏览器的请求错误。 */
export class LocalSettingsRequestError extends Error {
  /**
   * 创建带 HTTP 状态码的设置接口错误。
   *
   * @param message - 面向设置页显示的错误信息。
   * @param statusCode - 接口需要返回的 HTTP 状态码。
   * @returns 无返回值；错误对象会携带标准 Error 信息和状态码。
   */
  constructor(
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = "LocalSettingsRequestError";
  }
}

/**
 * 判断请求载荷是否为可读取的普通对象。
 *
 * @param value - 需要判断的未知请求值。
 * @returns 值为非数组普通对象时返回 true。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * 从请求载荷读取并规范化本地配置。
 *
 * @param payload - 设置接口收到的未知请求载荷。
 * @returns 经过默认值补全和字段规范化的本地配置。
 * @throws 当载荷缺少 config 对象时抛出请求错误。
 */
function configFromPayload(payload: unknown): LocalConfig {
  if (!isRecord(payload) || !isRecord(payload.config)) {
    throw new LocalSettingsRequestError("缺少本地配置");
  }
  return normalizeLocalConfig(payload.config as Partial<LocalConfig>);
}

/**
 * 从请求载荷读取并校验来源 ID。
 *
 * @param payload - 设置接口收到的未知请求载荷。
 * @returns 注册表中存在的数据来源标识。
 * @throws 当载荷缺少来源或来源未注册时抛出请求错误。
 */
function sourceIdFromPayload(payload: unknown): DataSourceId {
  if (!isRecord(payload) || typeof payload.sourceId !== "string") {
    throw new LocalSettingsRequestError("缺少数据来源");
  }
  if (!dataSourceIds.includes(payload.sourceId as DataSourceId)) {
    throw new LocalSettingsRequestError("未知数据来源");
  }
  return payload.sourceId as DataSourceId;
}

/**
 * 创建开发服务器使用的本地设置 API；所有写操作共用一个串行队列。
 *
 * @returns 提供配置读取、来源同步和快照处理能力的 API 对象。
 */
export function createLocalSettingsApi() {
  const snapshot = createSiteSnapshotStore();
  let writeQueue: Promise<void> = Promise.resolve();

  /**
   * 将文件配置、来源快照和页面快照写入串行队列，避免并发覆盖。
   *
   * @param task - 需要在队列中执行的异步写入任务。
   * @returns 任务完成后返回其结果。
   */
  async function enqueueWrite<T>(task: () => Promise<T>): Promise<T> {
    // 先把新的占位 Promise 放到队列尾部，再等待旧任务完成，保证文件写入严格串行。
    let release!: () => void;
    const previous = writeQueue;
    writeQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await task();
    } finally {
      release();
    }
  }

  /**
   * 在同一次排队写入中保存配置并重新生成页面快照。
   *
   * @param config - 即将落盘的本地配置。
   * @param updater - 基于当前页面快照生成新快照的转换函数。
   * @returns 已保存配置和最新页面快照。
   */
  async function writeConfigAndSnapshot(
    config: LocalConfig,
    updater: (current: Partial<SiteData>) => SiteData,
  ): Promise<{ config: LocalConfig; siteData: SiteData }> {
    return enqueueWrite(async () => {
      const storedConfig = await writeLocalConfigFile(config);
      const siteData = await snapshot.update(updater);
      return { config: storedConfig, siteData };
    });
  }

  /**
   * 提取来源同步结果中允许写入公开派生快照的字段。
   *
   * 原始响应只进入来源私有快照；这里显式挑选公开投影，避免把令牌或
   * 供应商内部字段意外写入页面数据。
   *
   * @param result - 单个来源的同步结果。
   * @returns 可安全保存为来源公开派生数据的字段集合。
   */
  function resultProjection(
    result: Awaited<ReturnType<typeof syncDataSource>>,
  ) {
    return {
      libraryItems: result.libraryItems,
      ...(result.musicCatalog ? { musicCatalog: result.musicCatalog } : {}),
      repositories: result.repositories,
    };
  }

  /**
   * 保存来源同步结果，并用结果更新页面快照和来源状态。
   *
   * @param config - 不含本地凭据的公开配置。
   * @param result - 来源同步产生的原始数据、投影和状态。
   * @returns 保存后的配置、页面快照和来源快照状态。
   */
  async function writeSourceResult(
    config: LocalConfig,
    result: Awaited<ReturnType<typeof syncDataSource>>,
  ) {
    return enqueueWrite(async () => {
      const storedConfig = await writeLocalConfigFile(config);
      let sourceInfo = await readSourceSnapshotInfo(result.sourceId);
      // 成功才替换原始和公开投影；失败只记录状态，以保留最近一次可用来源数据。
      if (result.status.status === "success") {
        sourceInfo = await saveSourceSnapshot({
          sourceId: result.sourceId,
          rawData: result.rawData,
          projection: resultProjection(result),
          message: result.status.message,
        });
      } else if (result.status.status === "error") {
        sourceInfo = await recordSourceStatus(result.sourceId, {
          state: "error",
          message: result.status.message,
        });
      }
      const siteData = await snapshot.update((current) =>
        mergeSourceSiteData(current, config, result),
      );
      return { config: storedConfig, siteData, sourceInfo };
    });
  }

  return {
    /**
     * 读取当前公开配置。
     *
     * @returns 当前配置对象；其中的来源凭据不会从公开配置接口返回。
     */
    async readConfig() {
      return { config: await readLocalConfigFile() };
    },

    /**
     * 读取应用当前公开页面快照，并应用最新配置过滤。
     *
     * @returns 根据当前配置重新计算可见内容后的页面数据。
     */
    async readSnapshot() {
      const config = await readLocalConfigFile();
      return {
        siteData: applyLocalConfigToSiteData(await snapshot.read(), config),
      };
    },

    /**
     * 读取所有来源的原始和派生快照状态。
     *
     * @returns 每个已注册来源的抓取、处理和文件状态。
     */
    async readSourceStatus() {
      return { sources: await readAllSourceSnapshotInfo() };
    },

    /**
     * 保存配置并根据配置重新投影当前页面数据。
     *
     * @param payload - 包含本地配置的未知请求载荷。
     * @returns 保存后的配置、页面快照和来源状态。
     */
    async save(payload: unknown) {
      const config = configFromPayload(payload);
      const { siteData, config: storedConfig } = await writeConfigAndSnapshot(
        config,
        (current) => applyLocalConfigToSiteData(current, config),
      );
      return {
        siteData,
        config: storedConfig,
        statuses: siteData.providerStatus,
        saved: true,
      };
    },

    /**
     * 抓取单个来源并保存原始快照和公开投影。
     *
     * @param payload - 包含配置和来源标识的未知请求载荷。
     * @returns 来源同步状态、来源快照信息和最新页面数据。
     */
    async syncSource(payload: unknown) {
      const config = configFromPayload(payload);
      const sourceId = sourceIdFromPayload(payload);
      const syncConfig = await withLocalCredentials(config);
      const result = await syncDataSource(syncConfig, sourceId);
      const { siteData, config: storedConfig, sourceInfo } =
        await writeSourceResult(config, result);
      return {
        siteData,
        config: storedConfig,
        statuses: siteData.providerStatus,
        sourceStatus: result.status,
        sourceInfo,
        saved: true,
      };
    },

    /**
     * 抓取全部友联文章并保存 Brew 公开缓存。
     *
     * @returns 保存后的页面快照和本轮订阅源同步摘要。
     */
    async syncBrew() {
      const config = await readLocalConfigFile();
      const current = await snapshot.read();
      const cached = await readBrewFeedCache();
      const previousSources = cached ?? current.brewSources ?? [];
      const result = await syncBrewFeeds(config.friends, previousSources);

      return enqueueWrite(async () => {
        await writeBrewFeedCache(result.sources);
        const siteData = await snapshot.update((latest) =>
          applyLocalConfigToSiteData(
            { ...latest, brewSources: result.sources },
            config,
          ),
        );
        return {
          siteData,
          updated: result.results.filter((item) => item.status === "available")
            .length,
          unavailable: result.results.filter(
            (item) => item.status === "unavailable",
          ).length,
        };
      });
    },

    /**
     * 按配置的时间间隔顺序刷新需要更新的来源。
     *
     * @returns 自动刷新是否启用以及本次实际同步的来源列表。
     */
    async autoRefresh() {
      const config = await readLocalConfigFile();
      if (!config.autoRefresh.enabled) return { enabled: false, synced: [] };
      const sourceStatuses = await readAllSourceSnapshotInfo();
      const statusBySource = new Map(
        sourceStatuses.map((status) => [status.sourceId, status]),
      );
      const intervalMs = config.autoRefresh.intervalHours * 60 * 60 * 1000;
      const now = Date.now();
      const syncConfig = await withLocalCredentials(config);
      const synced: Array<{
        sourceId: DataSourceId;
        status: Awaited<ReturnType<typeof syncDataSource>>["status"];
      }> = [];

      for (const sourceId of dataSourceIds) {
        if (
          !config.sources[sourceId].enabled ||
          !hasSelectedContent(sourceId, config)
        ) {
          continue;
        }
        const previous = statusBySource.get(sourceId);
        // fetchedAt 表示上次真实抓取时间；未到间隔时跳过，避免自动刷新重复请求。
        const lastFetched = previous?.fetchedAt
          ? Date.parse(previous.fetchedAt)
          : Number.NaN;
        if (Number.isFinite(lastFetched) && now - lastFetched < intervalMs) {
          continue;
        }
        const result = await syncDataSource(syncConfig, sourceId);
        await writeSourceResult(config, result);
        synced.push({ sourceId, status: result.status });
      }
      return { enabled: true, synced };
    },

    /**
     * 并行收集全部来源，但不写入本地文件。
     *
     * @param payload - 包含配置的未知请求载荷。
     * @returns 所有来源合并后的临时页面数据。
     */
    async sync(payload: unknown) {
      const config = await withLocalCredentials(configFromPayload(payload));
      return collectSiteData(config);
    },

    /**
     * 校验、规范化并保存友联配置。
     *
     * @param payload - 包含友联数组的未知请求载荷。
     * @returns 保存后的配置、友联列表和页面快照。
     */
    async saveFriends(payload: unknown) {
      if (!isRecord(payload) || !Array.isArray(payload.friends)) {
        throw new LocalSettingsRequestError("缺少友联数据");
      }
      // 先完整规范化并校验数组，再进入统一写队列，避免只写入部分合法友联。
      const friends = payload.friends.flatMap((entry, index) => {
        const friend = normalizeFriendLink(entry, index);
        return friend ? [friend] : [];
      });
      if (friends.length !== payload.friends.length) {
        throw new LocalSettingsRequestError("友联数据格式不正确");
      }
      const currentConfig = await readLocalConfigFile();
      const config = normalizeLocalConfig({ ...currentConfig, friends });
      const { siteData, config: storedConfig } = await writeConfigAndSnapshot(
        config,
        (current) => applyLocalConfigToSiteData(current, config),
      );
      return {
        siteData,
        config: storedConfig,
        friends: config.friends,
        saved: true,
      };
    },

    /**
     * 读取指定游戏 UID 的公开账号摘要。
     *
     * @param payload - 包含 UID 和可选游戏标识的未知请求载荷。
     * @returns 由游戏来源返回的公开账号摘要。
     */
    async syncGame(payload: unknown) {
      if (!isRecord(payload) || typeof payload.uid !== "string") {
        throw new LocalSettingsRequestError("缺少游戏 UID");
      }
      const game: HoyoGame =
        payload.game === "genshin" || payload.game === "zzz"
          ? payload.game
          : "hsr";
      return { account: await fetchPublicGameAccount(payload.uid, game) };
    },
  };
}
