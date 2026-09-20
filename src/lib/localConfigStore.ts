import { dirname, resolve } from "node:path";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import {
  cloneLocalConfig,
  createEmptyLocalConfig,
  normalizeLocalConfig,
} from "../data/localConfig";
import type { DataSourceId, LocalConfig } from "../data/types";

const momonaPath = (...segments: string[]): string =>
  resolve(process.cwd(), ".momona", ...segments);

export const localConfigPath = momonaPath("localConfig.json");

const credentialsPath = momonaPath("credentials.json");

const sourceIds: DataSourceId[] = [
  "bangumi",
  "bilibili",
  "github",
  "netease",
  "qqmusic",
];

type LocalCredentials = Partial<Record<DataSourceId, string>>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

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

const readCredentials = async (): Promise<LocalCredentials> => {
  const raw = await readJson(credentialsPath);
  if (!isRecord(raw)) return {};
  return sourceIds.reduce<LocalCredentials>((credentials, sourceId) => {
    const token = raw[sourceId];
    if (typeof token === "string" && token.trim()) {
      credentials[sourceId] = token.trim();
    }
    return credentials;
  }, {});
};

const withoutCredentials = (config: LocalConfig): LocalConfig => {
  const publicConfig = cloneLocalConfig(config);
  for (const sourceId of sourceIds) publicConfig.sources[sourceId].token = "";
  return publicConfig;
};

/** 读取发布配置；公开配置文件中的意外 token 也会在返回前剥离。 */
export const readLocalConfigFile = async (): Promise<LocalConfig> => {
  const raw = await readJson(localConfigPath);
  return withoutCredentials(
    normalizeLocalConfig(
      isRecord(raw) ? raw : createEmptyLocalConfig(),
    ),
  );
};

/** 将用户输入的 token 与忽略文件中的凭据合并，仅供本地同步使用。 */
export const withLocalCredentials = async (
  config: LocalConfig,
): Promise<LocalConfig> => {
  const credentials = await readCredentials();
  const next = cloneLocalConfig(config);
  for (const sourceId of sourceIds) {
    const token = next.sources[sourceId].token.trim();
    next.sources[sourceId].token = token || credentials[sourceId] || "";
  }
  return next;
};

/** 保存公开配置，并把凭据单独写入被 git 忽略的本地文件。 */
export const writeLocalConfigFile = async (
  config: LocalConfig,
): Promise<LocalConfig> => {
  const normalized = normalizeLocalConfig(config);
  const credentials = await readCredentials();
  for (const sourceId of sourceIds) {
    const token = normalized.sources[sourceId].token.trim();
    if (token) credentials[sourceId] = token;
  }

  const publicConfig = withoutCredentials(normalized);
  await writeJsonAtomically(localConfigPath, publicConfig);
  if (Object.keys(credentials).length) {
    await writeJsonAtomically(credentialsPath, credentials);
  }
  return publicConfig;
};
