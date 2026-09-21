import { resolve } from "node:path";
import {
  cloneLocalConfig,
  createEmptyLocalConfig,
  normalizeLocalConfig,
} from "../data/localConfig";
import { dataSourceIds } from "../data/sourceCatalog";
import type { DataSourceId, LocalConfig } from "../data/types";
import {
  isRecord,
  readJsonFile,
  writeJsonFileAtomically,
} from "./persistence/jsonFile";

/**
 * 将路径解析到当前项目的本地数据目录。
 *
 * @param segments - 本地数据目录下的路径片段。
 * @returns 解析后的绝对路径。
 */
function momonaPath(...segments: string[]): string {
  return resolve(process.cwd(), ".momona", ...segments);
}

export const localConfigPath = momonaPath("localConfig.json");

const credentialsPath = momonaPath("credentials.json");
const configEnvironmentVariable = "MOMONA_CONFIG_JSON";

type LocalCredentials = Partial<Record<DataSourceId, string>>;

/**
 * 读取 CI/构建环境提供的完整 JSON 配置；环境配置优先于本地文件。
 *
 * @returns 环境中的部分本地配置；未设置环境变量时返回 null。
 * @throws 环境变量不是 JSON 对象时抛出错误。
 */
function readEnvironmentConfig(): Partial<LocalConfig> | null {
  const raw = process.env[configEnvironmentVariable]?.trim();
  if (!raw) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) {
      throw new Error("配置必须是 JSON 对象");
    }
    return parsed as Partial<LocalConfig>;
  } catch (error) {
    throw new Error(
      `${configEnvironmentVariable} 不是有效 JSON：${String(
        error instanceof Error ? error.message : error,
      )}`,
    );
  }
}

/**
 * 读取被 Git 忽略的来源凭据文件。
 *
 * @returns 按来源 ID 索引的本地凭据。
 */
async function readCredentials(): Promise<LocalCredentials> {
  const raw = await readJsonFile(credentialsPath);
  if (!isRecord(raw)) return {};
  return dataSourceIds.reduce<LocalCredentials>((credentials, sourceId) => {
    const token = raw[sourceId];
    if (typeof token === "string" && token.trim()) {
      credentials[sourceId] = token.trim();
    }
    return credentials;
  }, {});
}

/**
 * 复制配置并移除所有来源凭据，得到可以写入公开配置的版本。
 *
 * @param config - 包含本地凭据的配置。
 * @returns 不含 token 的公开配置副本。
 */
function withoutCredentials(config: LocalConfig): LocalConfig {
  const publicConfig = cloneLocalConfig(config);
  for (const sourceId of dataSourceIds) publicConfig.sources[sourceId].token = "";
  return publicConfig;
}

/**
 * 读取发布配置；环境或公开配置中的 token 都会在返回前剥离。
 *
 * @returns 规范化且不含凭据的本地配置。
 */
export async function readLocalConfigFile(): Promise<LocalConfig> {
  const raw = readEnvironmentConfig() ?? (await readJsonFile(localConfigPath));
  return withoutCredentials(
    normalizeLocalConfig(
      isRecord(raw) ? raw : createEmptyLocalConfig(),
    ),
  );
}

/**
 * 将用户输入、环境变量和忽略文件中的 token 合并，仅供同步使用。
 *
 * @param config - 不含或可能含公开配置 token 的本地配置。
 * @returns 仅供同步流程使用的凭据配置副本。
 */
export async function withLocalCredentials(
  config: LocalConfig,
): Promise<LocalConfig> {
  const environmentConfig = readEnvironmentConfig();
  const credentials = await readCredentials();
  const next = cloneLocalConfig(config);
  for (const sourceId of dataSourceIds) {
    const token = next.sources[sourceId].token.trim();
    const environmentToken =
      isRecord(environmentConfig?.sources) &&
      isRecord(environmentConfig.sources[sourceId]) &&
      typeof environmentConfig.sources[sourceId].token === "string"
        ? environmentConfig.sources[sourceId].token.trim()
        : "";
    next.sources[sourceId].token =
      token || environmentToken || credentials[sourceId] || "";
  }
  return next;
}

/**
 * 保存公开配置，并把凭据单独写入被 git 忽略的本地文件。
 *
 * @param config - 需要保存的本地配置。
 * @returns 已保存且已移除凭据的公开配置。
 */
export async function writeLocalConfigFile(
  config: LocalConfig,
): Promise<LocalConfig> {
  const normalized = normalizeLocalConfig(config);
  const credentials = await readCredentials();
  for (const sourceId of dataSourceIds) {
    const token = normalized.sources[sourceId].token.trim();
    if (token) credentials[sourceId] = token;
  }

  const publicConfig = withoutCredentials(normalized);
  await writeJsonFileAtomically(localConfigPath, publicConfig);
  if (Object.keys(credentials).length) {
    await writeJsonFileAtomically(credentialsPath, credentials);
  }
  return publicConfig;
}
