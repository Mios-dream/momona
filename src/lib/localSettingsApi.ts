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
  projectSourceRaw,
  syncDataSource,
} from "./dataSources/index";
import {
  clearSourceDerived,
  markSourceProcessed,
  readSourceRawSnapshot,
  readAllSourceSnapshotInfo,
  readSourceProjection,
  readSourceSnapshotInfo,
  recordSourceStatus,
  saveSourceSnapshot,
} from "./sourceSnapshots";
import { fetchHoyoGameAccount } from "./dataSources/providers/starRail";
import {
  readLocalConfigFile,
  withLocalCredentials,
  writeLocalConfigFile,
} from "./localConfigStore";
import { createSiteSnapshotStore } from "./localSnapshot";

export class LocalSettingsRequestError extends Error {
  constructor(
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = "LocalSettingsRequestError";
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const configFromPayload = (payload: unknown): LocalConfig => {
  if (!isRecord(payload) || !isRecord(payload.config)) {
    throw new LocalSettingsRequestError("缺少本地配置");
  }
  return normalizeLocalConfig(payload.config as Partial<LocalConfig>);
};

const sourceIdFromPayload = (payload: unknown): DataSourceId => {
  if (!isRecord(payload) || typeof payload.sourceId !== "string") {
    throw new LocalSettingsRequestError("缺少数据来源");
  }
  if (!dataSourceIds.includes(payload.sourceId as DataSourceId)) {
    throw new LocalSettingsRequestError("未知数据来源");
  }
  return payload.sourceId as DataSourceId;
};

export const createLocalSettingsApi = () => {
  const snapshot = createSiteSnapshotStore();
  let writeQueue: Promise<void> = Promise.resolve();

  const enqueueWrite = async <T>(task: () => Promise<T>): Promise<T> => {
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
  };

  const writeConfigAndSnapshot = async (
    config: LocalConfig,
    updater: (current: Partial<SiteData>) => SiteData,
  ): Promise<{ config: LocalConfig; siteData: SiteData }> =>
    enqueueWrite(async () => {
      const storedConfig = await writeLocalConfigFile(config);
      const siteData = await snapshot.update(updater);
      return { config: storedConfig, siteData };
    });

  const resultProjection = (result: Awaited<ReturnType<typeof syncDataSource>>) => ({
    libraryItems: result.libraryItems,
    ...(result.musicCatalog ? { musicCatalog: result.musicCatalog } : {}),
    repositories: result.repositories,
  });

  const writeSourceResult = async (
    config: LocalConfig,
    result: Awaited<ReturnType<typeof syncDataSource>>,
  ) =>
    enqueueWrite(async () => {
      const storedConfig = await writeLocalConfigFile(config);
      let sourceInfo = await readSourceSnapshotInfo(result.sourceId);
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

  return {
    readConfig: async () => ({ config: await readLocalConfigFile() }),

    readSnapshot: async () => {
      const config = await readLocalConfigFile();
      return {
        siteData: applyLocalConfigToSiteData(await snapshot.read(), config),
      };
    },

    readSourceStatus: async () => ({
      sources: await readAllSourceSnapshotInfo(),
    }),

    readSourcePreview: async (rawSourceId: unknown) => {
      if (
        typeof rawSourceId !== "string" ||
        !dataSourceIds.includes(rawSourceId as DataSourceId)
      ) {
        throw new LocalSettingsRequestError("未知数据来源");
      }
      const sourceId = rawSourceId as DataSourceId;
      const status = await readSourceSnapshotInfo(sourceId);
      const projection = await readSourceProjection(sourceId);
      return {
        sourceId,
        status,
        samples: (projection?.libraryItems ?? []).slice(0, 6).map((item) => ({
          id: item.id,
          title: item.title,
          subtitle: item.subtitle,
          cover: item.cover,
          type: item.itemType,
          url: item.url,
        })),
        repositories: (projection?.repositories ?? []).slice(0, 6),
      };
    },

    save: async (payload: unknown) => {
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

    syncSource: async (payload: unknown) => {
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

    processSource: async (payload: unknown) => {
      const config = configFromPayload(payload);
      const sourceId = sourceIdFromPayload(payload);
      const rawSnapshot = await readSourceRawSnapshot(sourceId);
      if (!rawSnapshot) {
        throw new LocalSettingsRequestError("没有可处理的原始快照", 409);
      }
      const projection = projectSourceRaw(config, sourceId, rawSnapshot.rawData);
      const result = {
        sourceId,
        rawData: rawSnapshot.rawData,
        libraryItems: projection.libraryItems,
        ...(projection.musicCatalog ? { musicCatalog: projection.musicCatalog } : {}),
        repositories: projection.repositories,
        status: {
          id: sourceId,
          label: sourceId,
          status: "success" as const,
          message: "已根据本地快照重新生成资料库投影",
          count: projection.libraryItems.length + projection.repositories.length,
        },
      };
      const resultData = await enqueueWrite(async () => {
        const storedConfig = await writeLocalConfigFile(config);
        const sourceInfo = await markSourceProcessed(
          sourceId,
          resultProjection(result as Awaited<ReturnType<typeof syncDataSource>>),
        );
        const siteData = await snapshot.update((current) =>
          mergeSourceSiteData(current, config, result),
        );
        return { storedConfig, sourceInfo, siteData };
      });
      return {
        siteData: resultData.siteData,
        config: resultData.storedConfig,
        sourceStatus: result.status,
        sourceInfo: resultData.sourceInfo,
        saved: true,
      };
    },

    clearSourceCache: async (payload: unknown) => {
      const config = configFromPayload(payload);
      const sourceId = sourceIdFromPayload(payload);
      const result = {
        sourceId,
        rawData: null,
        libraryItems: [],
        repositories: [],
        status: {
          id: sourceId,
          label: sourceId,
          status: "skipped" as const,
          message: "资料库派生缓存已清理",
          count: 0,
        },
      };
      const resultData = await enqueueWrite(async () => {
        const storedConfig = await writeLocalConfigFile(config);
        const sourceInfo = await clearSourceDerived(sourceId);
        const siteData = await snapshot.update((current) =>
          mergeSourceSiteData(current, config, result),
        );
        return { storedConfig, sourceInfo, siteData };
      });
      return {
        siteData: resultData.siteData,
        config: resultData.storedConfig,
        sourceStatus: result.status,
        sourceInfo: resultData.sourceInfo,
        saved: true,
      };
    },

    autoRefresh: async () => {
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

    sync: async (payload: unknown) => {
      const config = await withLocalCredentials(configFromPayload(payload));
      return collectSiteData(config);
    },

    saveFriends: async (payload: unknown) => {
      if (!isRecord(payload) || !Array.isArray(payload.friends)) {
        throw new LocalSettingsRequestError("缺少友联数据");
      }
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

    syncGame: async (payload: unknown) => {
      if (!isRecord(payload) || typeof payload.uid !== "string") {
        throw new LocalSettingsRequestError("缺少游戏 UID");
      }
      const game: HoyoGame =
        payload.game === "genshin" || payload.game === "zzz"
          ? payload.game
          : "hsr";
      return { account: await fetchHoyoGameAccount(payload.uid, game) };
    },
  };
};
