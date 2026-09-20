import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  applyLocalConfigToSiteData,
  dataSourceIds,
  hasSelectedContent,
  mergeSourceSiteData,
  syncDataSource,
} from "../src/lib/dataSources/index";
import type { LocalConfig } from "../src/data/types";
import {
  createEmptyLocalConfig,
  normalizeLocalConfig,
} from "../src/data/localConfig";
import {
  readLocalConfigFile,
  withLocalCredentials,
  writeLocalConfigFile,
} from "../src/lib/localConfigStore";
import {
  recordSourceStatus,
  saveSourceSnapshot,
} from "../src/lib/sourceSnapshots";
import { createSiteSnapshotStore } from "../src/lib/localSnapshot";

const configPath = resolve(process.cwd(), ".momona", "localConfig.json");

const readJsonFile = async (path: string): Promise<unknown | null> => {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    return null;
  }
};

const readConfigInput = async (): Promise<Partial<LocalConfig>> => {
  const fromEnvironment = process.env.MOMONA_CONFIG_JSON?.trim();
  if (fromEnvironment) {
    try {
      const parsed: unknown = JSON.parse(fromEnvironment);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed)
        ? (parsed as Partial<LocalConfig>)
        : {};
    } catch (error) {
      throw new Error(
        `MOMONA_CONFIG_JSON 不是有效 JSON：${String(error instanceof Error ? error.message : error)}`,
      );
    }
  }

  const fromFile = await readJsonFile(configPath);
  return fromFile && typeof fromFile === "object" && !Array.isArray(fromFile)
    ? (fromFile as Partial<LocalConfig>)
    : {};
};

const resultProjection = (
  result: Awaited<ReturnType<typeof syncDataSource>>,
) => ({
  libraryItems: result.libraryItems,
  ...(result.musicCatalog ? { musicCatalog: result.musicCatalog } : {}),
  repositories: result.repositories,
});

const sync = async (): Promise<void> => {
  const input = await readConfigInput();
  if (
    process.env.CI === "true" &&
    !process.env.MOMONA_CONFIG_JSON?.trim() &&
    !Object.keys(input).length
  ) {
    throw new Error(
      "GitHub Actions 缺少 .momona/localConfig.json，请提交不含 token 的公开配置",
    );
  }

  const configured = normalizeLocalConfig(
    Object.keys(input).length ? input : createEmptyLocalConfig(),
  );

  if (process.env.MOMONA_DRY_RUN === "1") {
    console.log("[momona:sync] dry run，仅校验配置，不请求远程数据");
    return;
  }

  await writeLocalConfigFile(configured);

  const config = await readLocalConfigFile();
  const syncConfig = await withLocalCredentials(config);
  const snapshot = createSiteSnapshotStore();

  await snapshot.update((current) =>
    applyLocalConfigToSiteData(current, config),
  );

  for (const sourceId of dataSourceIds) {
    if (
      !config.sources[sourceId].enabled ||
      !hasSelectedContent(sourceId, config)
    ) {
      console.log(`[momona:sync] ${sourceId}: skipped`);
      continue;
    }

    const result = await syncDataSource(syncConfig, sourceId);
    if (result.status.status === "success") {
      await saveSourceSnapshot({
        sourceId,
        rawData: result.rawData,
        projection: resultProjection(result),
        message: result.status.message,
      });
    } else if (result.status.status === "error") {
      await recordSourceStatus(sourceId, {
        state: "error",
        message: result.status.message,
      });
    }

    await snapshot.update((current) =>
      mergeSourceSiteData(current, config, result),
    );
    console.log(
      `[momona:sync] ${sourceId}: ${result.status.status} - ${result.status.message}`,
    );
  }

  console.log("[momona:sync] 已写入 .momona/generated.json");
};

sync().catch((error: unknown) => {
  console.error(
    `[momona:sync] 失败：${String(error instanceof Error ? error.message : error)}`,
  );
  process.exitCode = 1;
});
