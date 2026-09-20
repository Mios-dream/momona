import { dirname, resolve } from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import type { SiteData } from "../data/types";

/** 本机缓存的公开页面快照；它不包含 LocalConfig 或 token。 */
export const siteSnapshotPath = resolve(
  process.cwd(),
  ".momona",
  "generated.json",
);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

export const readSiteSnapshot = async (): Promise<Partial<SiteData>> => {
  try {
    const raw = await readFile(siteSnapshotPath, "utf8");
    const parsed: unknown = JSON.parse(raw);
    return isRecord(parsed) ? (parsed as Partial<SiteData>) : {};
  } catch {
    return {};
  }
};

export const writeSiteSnapshot = async (siteData: SiteData): Promise<void> => {
  await mkdir(dirname(siteSnapshotPath), { recursive: true });
  const temporaryPath = `${siteSnapshotPath}.${process.pid}.tmp`;
  await writeFile(
    temporaryPath,
    `${JSON.stringify(siteData, null, 2)}\n`,
    "utf8",
  );
  await rename(temporaryPath, siteSnapshotPath);
};

/** 串行化设置页的写入，避免两个请求互相覆盖快照。 */
export const createSiteSnapshotStore = () => {
  let writeQueue: Promise<void> = Promise.resolve();

  const update = async (
    updater: (
      current: Partial<SiteData>,
    ) => SiteData | Promise<SiteData>,
  ): Promise<SiteData> => {
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
  };

  return { read: readSiteSnapshot, update };
};
