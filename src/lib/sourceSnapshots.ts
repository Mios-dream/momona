import { resolve } from "node:path";
import { stat, unlink } from "node:fs/promises";
import { dataSourceIds } from "../data/sourceCatalog";
import type {
  DataSourceId,
  LibraryItem,
  MusicCatalog,
  RepositorySummary,
  SourceSnapshotInfo,
  SourceSnapshotState,
} from "../data/types";
import {
  isRecord,
  readJsonFile,
  writeJsonFileAtomically,
} from "./persistence/jsonFile";
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

/**
 * 去除页面不需要公开的原始 metadata 字段。
 *
 * @param projection - 来源的统一公开投影。
 * @returns 去除私有 metadata 后的公开投影。
 */
function publicProjection(projection: SourceProjection): SourceProjection {
  return {
    libraryItems: projection.libraryItems.map(({ metadata: _metadata, ...item }) => item),
    ...(projection.musicCatalog ? { musicCatalog: projection.musicCatalog } : {}),
    repositories: projection.repositories,
  };
}

/**
 * 创建来源状态文件的空结构。
 *
 * @returns 新版本来源状态文件的默认结构。
 */
function statusDefaults(): PersistedStatusFile {
  return { version: 1, sources: {} };
}

/**
 * 返回来源原始快照文件路径。
 *
 * @param sourceId - 数据来源标识。
 * @returns 来源原始快照的绝对路径。
 */
function sourceRawPath(sourceId: DataSourceId): string {
  return `${sourcesDirectory}/${sourceId}.raw.json`;
}

/**
 * 返回来源派生投影文件路径。
 *
 * @param sourceId - 数据来源标识。
 * @returns 来源派生投影的绝对路径。
 */
function sourceDerivedPath(sourceId: DataSourceId): string {
  return `${sourcesDirectory}/${sourceId}.derived.json`;
}

/**
 * 读取来源状态文件，并为旧版本或损坏文件提供空状态。
 *
 * @returns 规范化后的来源状态文件。
 */
async function readStatusFile(): Promise<PersistedStatusFile> {
  const value = await readJsonFile(statusPath);
  if (!isRecord(value)) {
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
}

/**
 * 写入来源状态文件。
 *
 * @param value - 需要持久化的来源状态文件。
 * @returns 文件写入完成后结束的异步任务。
 */
async function writeStatusFile(value: PersistedStatusFile): Promise<void> {
  await writeJsonFileAtomically(statusPath, value);
}

/**
 * 读取文件是否存在、大小和修改时间。
 *
 * @param path - 需要检查的文件绝对路径。
 * @returns 文件存在状态、字节数和更新时间。
 */
async function fileInfo(
  path: string,
): Promise<{ exists: boolean; bytes: number; updatedAt: string | null }> {
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
}

/**
 * 创建单个来源的初始同步状态。
 *
 * @returns 尚未同步的来源状态。
 */
function defaultStatus(): PersistedSourceStatus {
  return {
    state: "never",
    message: "尚未同步",
    itemCount: 0,
    fetchedAt: null,
    processedAt: null,
  };
}

/**
 * 读取来源的公开派生投影。
 *
 * @param sourceId - 数据来源标识。
 * @returns 公开派生投影；文件不存在或结构无效时返回 null。
 */
export async function readSourceProjection(
  sourceId: DataSourceId,
): Promise<SourceProjection | null> {
  const value = await readJsonFile(sourceDerivedPath(sourceId));
  if (!isRecord(value)) return null;
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
}

/**
 * 读取来源的私有原始响应快照。
 *
 * @param sourceId - 数据来源标识。
 * @returns 私有原始快照；文件不存在或结构无效时返回 null。
 */
export async function readSourceRawSnapshot(
  sourceId: DataSourceId,
): Promise<SourceRawSnapshot | null> {
  const value = await readJsonFile(sourceRawPath(sourceId));
  if (!isRecord(value)) return null;
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
}

/**
 * 保存来源原始响应、公开投影和成功状态。
 *
 * @param input - 来源 ID、原始数据、公开投影和状态消息。
 * @returns 写入完成后的来源快照状态。
 */
export async function saveSourceSnapshot(input: {
  sourceId: DataSourceId;
  rawData: unknown;
  projection: SourceProjection;
  message: string;
  fetchedAt?: string;
}): Promise<SourceSnapshotInfo> {
  const fetchedAt = input.fetchedAt ?? new Date().toISOString();
  const processedAt = new Date().toISOString();
  const projection = publicProjection(input.projection);
  await writeJsonFileAtomically(sourceRawPath(input.sourceId), {
    version: 1,
    sourceId: input.sourceId,
    fetchedAt,
    rawData: input.rawData,
  });
  await writeJsonFileAtomically(sourceDerivedPath(input.sourceId), {
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
}

/**
 * 更新来源状态文件，并保留未覆盖的历史字段。
 *
 * @param sourceId - 数据来源标识。
 * @param status - 需要更新的状态字段。
 * @returns 更新完成后的来源快照状态。
 */
export async function recordSourceStatus(
  sourceId: DataSourceId,
  status: Pick<PersistedSourceStatus, "state" | "message"> &
    Partial<Pick<PersistedSourceStatus, "itemCount" | "fetchedAt" | "processedAt">>,
): Promise<SourceSnapshotInfo> {
  const statuses = await readStatusFile();
  const previous = statuses.sources[sourceId] ?? defaultStatus();
  statuses.sources[sourceId] = {
    ...previous,
    ...status,
  };
  await writeStatusFile(statuses);
  return readSourceSnapshotInfo(sourceId);
}

/**
 * 汇总来源状态和两类快照文件的实际磁盘信息。
 *
 * @param sourceId - 数据来源标识。
 * @returns 来源状态和原始、派生快照文件信息。
 */
export async function readSourceSnapshotInfo(
  sourceId: DataSourceId,
): Promise<SourceSnapshotInfo> {
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
}

/**
 * 读取所有来源的快照状态，顺序与来源目录保持一致。
 *
 * @returns 按来源目录顺序排列的快照状态列表。
 */
export async function readAllSourceSnapshotInfo(): Promise<SourceSnapshotInfo[]> {
  return Promise.all(dataSourceIds.map((sourceId) => readSourceSnapshotInfo(sourceId)));
}

/**
 * 使用已保存的原始快照重新生成公开派生投影。
 *
 * @param sourceId - 数据来源标识。
 * @param projection - 重新生成的公开投影。
 * @param message - 处理完成后写入状态的消息。
 * @returns 更新完成后的来源快照状态。
 */
export async function markSourceProcessed(
  sourceId: DataSourceId,
  projection: SourceProjection,
  message = "资料库投影已更新",
): Promise<SourceSnapshotInfo> {
  const existing = await readSourceRawSnapshot(sourceId);
  if (!existing) {
    return recordSourceStatus(sourceId, {
      state: "error",
      message: "没有可处理的原始快照",
    });
  }
  const processedAt = new Date().toISOString();
  const publicData = publicProjection(projection);
  await writeJsonFileAtomically(sourceDerivedPath(sourceId), {
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
}

/**
 * 清除来源公开派生缓存，但保留可重新处理的原始快照。
 *
 * @param sourceId - 数据来源标识。
 * @returns 清理完成后的来源快照状态。
 */
export async function clearSourceDerived(
  sourceId: DataSourceId,
): Promise<SourceSnapshotInfo> {
  try {
    await unlink(sourceDerivedPath(sourceId));
  } catch {
    // 缓存可能已经不存在，但状态仍需要明确记录为已清理。
  }
  return recordSourceStatus(sourceId, {
    state: "cleared",
    message: "资料库派生缓存已清理，原始快照仍保留",
    itemCount: 0,
    processedAt: null,
  });
}
