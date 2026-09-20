import { dirname, resolve } from "node:path";
import {
  mkdir,
  readFile,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import type {
  DataSourceId,
  LibraryItem,
  MusicCatalog,
  RepositorySummary,
  SourceSnapshotInfo,
  SourceSnapshotState,
} from "../data/types";

const sourceIds: DataSourceId[] = [
  "bangumi",
  "bilibili",
  "github",
  "netease",
  "qqmusic",
];
const sourcesDirectory = resolve(process.cwd(), ".momona", "sources");
const statusPath = resolve(process.cwd(), ".momona", "source-status.json");

interface PersistedSourceStatus {
  state: SourceSnapshotState;
  message: string;
  itemCount: number;
  fetchedAt: string | null;
  processedAt: string | null;
}

interface PersistedStatusFile {
  version: 1;
  sources: Partial<Record<DataSourceId, PersistedSourceStatus>>;
}

export interface SourceProjection {
  libraryItems: LibraryItem[];
  musicCatalog?: MusicCatalog;
  repositories: RepositorySummary[];
}

export interface SourceRawSnapshot {
  sourceId: DataSourceId;
  fetchedAt: string | null;
  rawData: unknown;
}

const publicProjection = (projection: SourceProjection): SourceProjection => ({
  libraryItems: projection.libraryItems.map(({ metadata: _metadata, ...item }) => item),
  ...(projection.musicCatalog ? { musicCatalog: projection.musicCatalog } : {}),
  repositories: projection.repositories,
});

const statusDefaults = (): PersistedStatusFile => ({
  version: 1,
  sources: {},
});

const sourceRawPath = (sourceId: DataSourceId): string =>
  `${sourcesDirectory}/${sourceId}.raw.json`;

const sourceDerivedPath = (sourceId: DataSourceId): string =>
  `${sourcesDirectory}/${sourceId}.derived.json`;

const readJson = async (path: string): Promise<unknown> => {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    return null;
  }
};

const writeJsonAtomically = async (path: string, value: unknown): Promise<void> => {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, path);
};

const readStatusFile = async (): Promise<PersistedStatusFile> => {
  const value = await readJson(statusPath);
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return statusDefaults();
  }
  const record = value as Partial<PersistedStatusFile>;
  return {
    version: 1,
    sources:
      record.sources && typeof record.sources === "object"
        ? record.sources
        : {},
  };
};

const writeStatusFile = async (value: PersistedStatusFile): Promise<void> =>
  writeJsonAtomically(statusPath, value);

const fileInfo = async (
  path: string,
): Promise<{ exists: boolean; bytes: number; updatedAt: string | null }> => {
  try {
    const details = await stat(path);
    return {
      exists: true,
      bytes: details.size,
      updatedAt: details.mtime.toISOString(),
    };
  } catch {
    return { exists: false, bytes: 0, updatedAt: null };
  }
};

const defaultStatus = (): PersistedSourceStatus => ({
  state: "never",
  message: "尚未同步",
  itemCount: 0,
  fetchedAt: null,
  processedAt: null,
});

export const readSourceProjection = async (
  sourceId: DataSourceId,
): Promise<SourceProjection | null> => {
  const value = await readJson(sourceDerivedPath(sourceId));
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Partial<SourceProjection>;
  return {
    libraryItems: Array.isArray(record.libraryItems)
      ? (record.libraryItems as LibraryItem[])
      : [],
    musicCatalog:
      record.musicCatalog && typeof record.musicCatalog === "object"
        ? (record.musicCatalog as MusicCatalog)
        : undefined,
    repositories: Array.isArray(record.repositories)
      ? (record.repositories as RepositorySummary[])
      : [],
  };
};

export const readSourceRawSnapshot = async (
  sourceId: DataSourceId,
): Promise<SourceRawSnapshot | null> => {
  const value = await readJson(sourceRawPath(sourceId));
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as {
    sourceId?: unknown;
    fetchedAt?: unknown;
    rawData?: unknown;
  };
  return {
    sourceId,
    fetchedAt: typeof record.fetchedAt === "string" ? record.fetchedAt : null,
    rawData: record.rawData,
  };
};

export const saveSourceSnapshot = async (input: {
  sourceId: DataSourceId;
  rawData: unknown;
  projection: SourceProjection;
  message: string;
  fetchedAt?: string;
}): Promise<SourceSnapshotInfo> => {
  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const processedAt = new Date().toISOString();
  const projection = publicProjection(input.projection);
  await writeJsonAtomically(sourceRawPath(input.sourceId), {
    version: 1,
    sourceId: input.sourceId,
    fetchedAt,
    rawData: input.rawData,
  });
  await writeJsonAtomically(sourceDerivedPath(input.sourceId), {
    version: 1,
    sourceId: input.sourceId,
    processedAt,
    ...projection,
  });
  const statuses = await readStatusFile();
  statuses.sources[input.sourceId] = {
    state: "success",
    message: input.message,
    itemCount:
      projection.libraryItems.length + projection.repositories.length,
    fetchedAt,
    processedAt,
  };
  await writeStatusFile(statuses);
  return readSourceSnapshotInfo(input.sourceId);
};

export const recordSourceStatus = async (
  sourceId: DataSourceId,
  status: Pick<PersistedSourceStatus, "state" | "message"> &
    Partial<Pick<PersistedSourceStatus, "itemCount" | "fetchedAt" | "processedAt">>,
): Promise<SourceSnapshotInfo> => {
  const statuses = await readStatusFile();
  const previous = statuses.sources[sourceId] ?? defaultStatus();
  statuses.sources[sourceId] = {
    ...previous,
    ...status,
  };
  await writeStatusFile(statuses);
  return readSourceSnapshotInfo(sourceId);
};

export const readSourceSnapshotInfo = async (
  sourceId: DataSourceId,
): Promise<SourceSnapshotInfo> => {
  const [statuses, raw, derived] = await Promise.all([
    readStatusFile(),
    fileInfo(sourceRawPath(sourceId)),
    fileInfo(sourceDerivedPath(sourceId)),
  ]);
  const saved = statuses.sources[sourceId] ?? defaultStatus();
  return {
    sourceId,
    state: saved.state,
    message: saved.message,
    rawExists: raw.exists,
    rawBytes: raw.bytes,
    rawUpdatedAt: raw.updatedAt,
    derivedExists: derived.exists,
    derivedBytes: derived.bytes,
    derivedUpdatedAt: derived.updatedAt,
    itemCount: saved.itemCount,
    fetchedAt: saved.fetchedAt,
    processedAt: saved.processedAt,
  };
};

export const readAllSourceSnapshotInfo = async (): Promise<SourceSnapshotInfo[]> =>
  Promise.all(sourceIds.map((sourceId) => readSourceSnapshotInfo(sourceId)));

export const markSourceProcessed = async (
  sourceId: DataSourceId,
  projection: SourceProjection,
  message = "资料库投影已更新",
): Promise<SourceSnapshotInfo> => {
  const existing = await readSourceRawSnapshot(sourceId);
  if (!existing) {
    return recordSourceStatus(sourceId, {
      state: "error",
      message: "没有可处理的原始快照",
    });
  }
  const processedAt = new Date().toISOString();
  const publicData = publicProjection(projection);
  await writeJsonAtomically(sourceDerivedPath(sourceId), {
    version: 1,
    sourceId,
    processedAt,
    ...publicData,
  });
  return recordSourceStatus(sourceId, {
    state: "success",
    message,
    itemCount: publicData.libraryItems.length + publicData.repositories.length,
    processedAt,
  });
};

export const clearSourceDerived = async (
  sourceId: DataSourceId,
): Promise<SourceSnapshotInfo> => {
  try {
    await unlink(sourceDerivedPath(sourceId));
  } catch {
    // The cache may already be absent; status still becomes explicit.
  }
  return recordSourceStatus(sourceId, {
    state: "cleared",
    message: "资料库派生缓存已清理，原始快照仍保留",
    itemCount: 0,
    processedAt: null,
  });
};
