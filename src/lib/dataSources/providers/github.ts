import { readJson, sourceLimit, sourceValue } from "../shared";
import { ProviderError } from "../types";
import type {
  LocalConfig,
  RepositorySummary,
} from "../../../data/types";
import type { ProviderSyncData } from "../types";

/**
 * 将 GitHub API 仓库对象转换为统一仓库摘要。
 *
 * @param record - GitHub API 返回的仓库对象。
 * @param index - 仓库在响应数组中的索引。
 * @returns 统一仓库摘要；缺少名称时返回 null。
 */
function repositoryFromGithubRecord(
  record: Record<string, unknown>,
  index: number,
): RepositorySummary | null {
  const name = typeof record.name === "string" ? record.name.trim() : "";
  if (!name) return null;
  const primaryLanguage =
    record.primaryLanguage && typeof record.primaryLanguage === "object"
      ? (record.primaryLanguage as Record<string, unknown>).name
      : undefined;
  const image =
    record.owner && typeof record.owner === "object"
      ? (record.owner as Record<string, unknown>).avatar_url
      : undefined;
  return {
    id: String(record.id ?? `github-${index}`),
    name,
    description: String(record.description ?? ""),
    htmlUrl: String(record.html_url ?? record.url ?? ""),
    language: String(record.language ?? primaryLanguage ?? ""),
    stars: Number(record.stargazers_count ?? record.stargazerCount ?? 0),
    forks: Number(record.forks_count ?? record.forkCount ?? 0),
    updatedAt: String(record.updated_at ?? record.updatedAt ?? ""),
    ...(typeof image === "string" && image.trim() ? { image: image.trim() } : {}),
  };
}

/**
 * 兼容 REST 数组和 GraphQL Pinned 响应并投影仓库摘要。
 *
 * @param rawData - GitHub REST 或 GraphQL 原始响应。
 * @returns 统一仓库摘要列表。
 */
export function projectGithubRaw(rawData: unknown): RepositorySummary[] {
  if (Array.isArray(rawData)) {
    return rawData.flatMap((item, index) =>
      item && typeof item === "object"
        ? (() => {
            const repository = repositoryFromGithubRecord(
              item as Record<string, unknown>,
              index,
            );
            return repository ? [repository] : [];
          })()
        : [],
    );
  }
  if (!rawData || typeof rawData !== "object") return [];
  const record = rawData as {
    data?: { user?: { pinnedItems?: { nodes?: unknown[] } | null } | null };
  };
  const nodes = record.data?.user?.pinnedItems?.nodes;
  return Array.isArray(nodes)
    ? nodes.flatMap((item, index) =>
        item && typeof item === "object"
          ? (() => {
              const repository = repositoryFromGithubRecord(
                item as Record<string, unknown>,
                index,
              );
              return repository ? [repository] : [];
            })()
          : [],
      )
    : [];
}

/**
 * 请求 GitHub 用户的公开仓库列表。
 *
 * @param base - GitHub API 基础地址。
 * @param username - GitHub 用户名。
 * @param limit - 最大读取数量。
 * @param headers - 请求头。
 * @returns 原始响应及统一仓库摘要。
 */
async function mapGithubAll(
  base: string,
  username: string,
  limit: number,
  headers: HeadersInit,
): Promise<{ repositories: RepositorySummary[]; rawData: unknown }> {
  const payload = await readJson(
    `${base}/users/${encodeURIComponent(username)}/repos?sort=updated&per_page=${sourceLimit(limit)}`,
    { headers },
  );
  if (!Array.isArray(payload)) throw new ProviderError("GitHub 返回格式不正确");
  return { rawData: payload, repositories: projectGithubRaw(payload) };
}

/**
 * 请求 GitHub 用户的 Pinned 仓库列表。
 *
 * @param base - GitHub API 基础地址。
 * @param username - GitHub 用户名。
 * @param limit - 最大读取数量。
 * @param headers - 请求头，必须包含授权信息。
 * @returns 原始响应及统一仓库摘要。
 */
async function mapGithubPinned(
  base: string,
  username: string,
  limit: number,
  headers: HeadersInit,
): Promise<{ repositories: RepositorySummary[]; rawData: unknown }> {
  if (!("Authorization" in headers)) {
    throw new ProviderError("读取 GitHub Pinned 仓库需要填写 Token");
  }
  const payload = (await readJson(`${base}/graphql`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({
      query: `
        query($login: String!, $first: Int!) {
          user(login: $login) {
            pinnedItems(first: $first, types: REPOSITORY) {
              nodes {
                ... on Repository {
                  id
                  name
                  description
                  url
                  primaryLanguage { name }
                  stargazerCount
                  forkCount
                  updatedAt
                }
              }
            }
          }
        }
      `,
      variables: { login: username, first: sourceLimit(limit) },
    }),
  })) as {
    data?: {
      user?: { pinnedItems?: { nodes?: unknown[] } | null } | null;
    };
    errors?: Array<{ message?: string }>;
  };
  if (payload.errors?.length) {
    throw new ProviderError(
      payload.errors
        .map((error) => error.message || "GraphQL 请求失败")
        .join("；"),
    );
  }
  const nodes = payload.data?.user?.pinnedItems?.nodes;
  if (!Array.isArray(nodes))
    throw new ProviderError("GitHub Pinned 返回格式不正确");
  return { rawData: payload, repositories: projectGithubRaw(payload) };
}

/**
 * 根据仓库范围配置选择 REST 或 GraphQL 同步方式。
 *
 * @param config - GitHub 来源配置。
 * @returns 包含原始响应和统一仓库摘要的同步数据。
 */
async function mapGithub(
  config: LocalConfig["sources"]["github"],
): Promise<ProviderSyncData> {
  const username = sourceValue(config.username, /\/([^/]+)\/?$/);
  if (!config.enabled || !username)
    return {
      rawData: null,
      libraryItems: [],
      repositories: [],
      message: "未配置用户名",
    };
  const base = "https://api.github.com";
  const isPinned = config.content.githubRepositoryScope === "pinned";
  const headers: HeadersInit = { Accept: "application/vnd.github+json" };
  if (config.token.trim()) headers.Authorization = `Bearer ${config.token.trim()}`;
  const result = isPinned
    ? await mapGithubPinned(base, username, config.limit, headers)
    : await mapGithubAll(base, username, config.limit, headers);
  return {
    rawData: result.rawData,
    libraryItems: [],
    repositories: result.repositories,
    message: isPinned ? "GitHub Pinned 仓库已同步" : "GitHub 已同步",
  };
}

export const syncGithub = mapGithub;
