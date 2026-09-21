import { resolve } from "node:path";
import type { SiteData } from "../data/types";
import {
  isRecord,
  readJsonFile,
  writeJsonFileAtomically,
} from "./persistence/jsonFile";

/** 本机缓存的公开页面快照；它不包含 LocalConfig 或 token。 */
export const siteSnapshotPath = resolve(
  process.cwd(),
  ".momona",
  "generated.json",
);

/**
 * 读取公开页面快照；缺失或损坏的快照按空快照处理。
 *
 * @returns 公开页面快照片段；文件不可用时返回空对象。
 */
export async function readSiteSnapshot(): Promise<Partial<SiteData>> {
  const parsed = await readJsonFile(siteSnapshotPath);
  return isRecord(parsed) ? (parsed as Partial<SiteData>) : {};
}

/**
 * 原子写入公开页面快照。
 *
 * @param siteData - 需要写入的完整页面数据。
 * @returns 文件写入完成后结束的异步任务。
 */
export async function writeSiteSnapshot(siteData: SiteData): Promise<void> {
  await writeJsonFileAtomically(siteSnapshotPath, siteData);
}

/**
 * 串行化设置页的写入，避免两个请求互相覆盖快照。
 *
 * @returns 提供读取和串行更新能力的快照存储对象。
 */
export function createSiteSnapshotStore(): {
  read: typeof readSiteSnapshot;
  update: (
    updater: (
      current: Partial<SiteData>,
    ) => SiteData | Promise<SiteData>,
  ) => Promise<SiteData>;
} {
  let writeQueue: Promise<void> = Promise.resolve();

  /**
   * 在前一个写操作完成后读取最新快照并提交下一份快照。
   *
   * @param updater - 基于最新快照生成下一份页面数据的函数。
   * @returns 已经写入磁盘的页面数据。
   */
  async function update(
    updater: (
      current: Partial<SiteData>,
    ) => SiteData | Promise<SiteData>,
  ): Promise<SiteData> {
    let release!: () => void;
    const previous = writeQueue;
    writeQueue = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      const current = await readSiteSnapshot();
      const next = await updater(current);
      await writeSiteSnapshot(next);
      return next;
    } finally {
      release();
    }
  }

  return { read: readSiteSnapshot, update };
};
