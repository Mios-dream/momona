import { imageOr, readJson, slug, sourceLimit, sourceValue } from "../shared";
import type { LibraryFilter, LibraryItem, LocalConfig } from "../../../data/types";
import type { ProviderSyncData } from "../types";

/**
 * 将 Bangumi 类型编号映射为统一资料库类别。
 *
 * @param value - Bangumi 返回的类型编号。
 * @returns 统一资料库类别；不支持的类型返回 null。
 */
function mapBangumiType(
  value: unknown,
): Exclude<LibraryFilter, "all"> | null {
  const type = Number(value);
  if (type === 1 || type === 8) return "book";
  if (type === 2) return "anime";
  if (type === 4) return "game";
  if (type === 3) return "music";
  return null;
}

/**
 * 将 Bangumi 收藏状态编号转换为中文状态。
 *
 * @param value - Bangumi 返回的收藏状态编号。
 * @returns 面向用户的收藏状态文本。
 */
function collectionStatus(value: unknown): string {
  const status = Number(value);
  return (
    (
      { 1: "想看", 2: "看过", 3: "在看", 4: "搁置", 5: "抛弃" } as Record<
        number,
        string
      >
    )[status] ?? "收藏"
  );
}

/**
 * 从 Bangumi 响应中提取收藏条目数组。
 *
 * @param payload - Bangumi 接口返回的未知响应。
 * @returns 响应中的收藏条目数组。
 */
function bangumiEntries(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== "object") return [];
  const record = payload as { data?: unknown[]; collections?: unknown[] };
  return record.data ?? record.collections ?? [];
}

/**
 * 将 Bangumi 原始收藏响应投影为统一资料库条目。
 *
 * @param payload - Bangumi 接口返回的原始响应。
 * @returns 统一资料库条目列表。
 */
export function projectBangumiRaw(payload: unknown): LibraryItem[] {
  return bangumiEntries(payload).flatMap((entry): LibraryItem[] => {
    if (!entry || typeof entry !== "object") return [];
    const record = entry as Record<string, unknown>;
    const subject = (
      record.subject && typeof record.subject === "object"
        ? record.subject
        : record
    ) as Record<string, unknown>;
    const title = String(
      subject.name_cn || subject.name || record.title || "",
    ).trim();
    if (!title) return [];
    const type = mapBangumiType(subject.type ?? record.subject_type);
    if (!type) return [];
    const images = (
      subject.images && typeof subject.images === "object" ? subject.images : {}
    ) as Record<string, unknown>;
    const subjectId = String(subject.id ?? record.subject_id ?? "").trim();
    const ratingValue = Number(record.rate);
    const rating = Number.isFinite(ratingValue) && ratingValue > 0
      ? ratingValue
      : undefined;
    const status = collectionStatus(record.type);
    return [
      {
        id: `bangumi-${subjectId || slug(title)}`,
        itemType: type,
        title,
        subtitle: `Bangumi · ${collectionStatus(record.type)}`,
        cover: imageOr(images.large ?? images.common ?? images.medium),
        platform: "Bangumi",
        collectionStatus: status,
        ...(rating === undefined ? {} : { rating }),
        url: subjectId ? `https://bgm.tv/subject/${subjectId}` : undefined,
        sourceId: "bangumi",
        sourceKind:
          type === "anime"
            ? "bangumiAnime"
            : type === "game"
              ? "bangumiGames"
              : type === "book"
                ? "bangumiBooks"
                : "bangumiMusic",
        metadata: record,
      },
    ];
  });
}

/**
 * 请求 Bangumi 收藏数据并保留来源原始响应。
 *
 * @param config - Bangumi 来源配置。
 * @returns 包含原始响应和统一条目的同步数据。
 */
async function mapBangumi(
  config: LocalConfig["sources"]["bangumi"],
): Promise<ProviderSyncData> {
  const username = sourceValue(config.username, /\/user\/([^/]+)/);
  if (!config.enabled || !username) {
    return {
      rawData: null,
      libraryItems: [],
      repositories: [],
      message: "未配置用户名",
    };
  }
  const base = "https://api.bgm.tv";
  const payload = await readJson(
    `${base}/v0/users/${encodeURIComponent(username)}/collections?limit=${sourceLimit(config.limit)}`,
    { headers: { Accept: "application/json" } },
  );
  const libraryItems = projectBangumiRaw(payload);

  return {
    rawData: payload,
    libraryItems,
    repositories: [],
    message: `Bangumi 已同步 ${libraryItems.length} 项内容`,
  };
}

export const syncBangumi = mapBangumi;
