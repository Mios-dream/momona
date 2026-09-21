import { XMLParser } from "fast-xml-parser";
import { imageOr, slug, sourceLimit } from "../shared";
import { ProviderError, type ProviderSyncData } from "../types";
import type { LibraryItem, LocalConfig } from "../../../data/types";

export interface SteamGameSnapshot {
  appId: string;
  title: string;
  cover: string;
  url: string;
  hoursLastTwoWeeks?: number;
  hoursForever?: number;
  lastPlayed?: string;
}

export interface SteamRawData {
  source: "steam";
  profile: {
    steamId: string;
    name: string;
    avatar: string;
    state: string;
    stateMessage: string;
    privacyState: string;
    hoursLastTwoWeeks: number;
    profileUrl: string;
    libraryCount?: number;
  };
  recentGames: SteamGameSnapshot[];
  libraryGames: SteamGameSnapshot[];
  libraryAvailable: boolean;
}

interface SteamReference {
  kind: "profiles" | "id";
  value: string;
}

const xmlParser = new XMLParser({
  ignoreAttributes: true,
  parseTagValue: false,
  trimValues: true,
});

/**
 * 判断未知值是否为可读取的对象。
 *
 * @param value - 待判断的未知值。
 * @returns 值是非数组对象时返回 true。
 */
function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

/**
 * 将未知值转换为去除首尾空白的文本。
 *
 * @param value - 待转换的未知值。
 * @returns 去除首尾空白的文本；其他类型返回空字符串。
 */
function text(value: unknown): string {
  return typeof value === "string" || typeof value === "number"
    ? String(value).trim()
    : "";
}

/**
 * 将未知值转换为有限数字。
 *
 * @param value - 待转换的未知数值。
 * @returns 有限数字；无法解析时返回 undefined。
 */
function numberValue(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

/**
 * 将 Steam 接口中的单项或数组字段统一成数组。
 *
 * @param value - Steam 响应中的单项或数组字段。
 * @returns 统一格式的数组。
 */
function toArray(value: unknown): unknown[] {
  return value === undefined || value === null
    ? []
    : Array.isArray(value)
      ? value
      : [value];
}

/**
 * 将小时数格式化为适合卡片展示的文本。
 *
 * @param value - 游玩小时数。
 * @returns 整数不带小数，否则保留一位小数的文本。
 */
function formatHours(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/**
 * 将 Steam 时间戳转换为 ISO 日期文本。
 *
 * @param value - Steam 返回的秒级时间戳。
 * @returns ISO 日期文本；时间戳无效时返回 undefined。
 */
function formatLastPlayed(value: unknown): string | undefined {
  const timestamp = numberValue(value);
  if (timestamp === undefined || timestamp <= 0) return undefined;
  const date = new Date(timestamp * 1000);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

/**
 * 从 Steam 详情地址中提取应用编号。
 *
 * @param value - Steam 游戏详情地址。
 * @returns 应用编号；无法提取时返回空字符串。
 */
function appIdFromUrl(value: string): string {
  return value.match(/\/app\/(\d+)/i)?.[1] ?? "";
}

/**
 * 根据应用编号生成 Steam 商店地址。
 *
 * @param appId - Steam 应用编号。
 * @returns Steam 商店游戏地址。
 */
function gameUrl(appId: string): string {
  return `https://store.steampowered.com/app/${encodeURIComponent(appId)}/`;
}

/**
 * 根据应用编号生成 Steam 游戏封面地址。
 *
 * @param appId - Steam 应用编号。
 * @returns Steam 游戏封面地址；没有应用编号时返回空字符串。
 */
function gameCover(appId: string): string {
  return appId
    ? `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${encodeURIComponent(appId)}/header.jpg`
    : "";
}

/**
 * 将 Steam 个人页 URL、个性化地址或 SteamID64 解析为统一引用。
 *
 * @param value - 用户填写的 Steam 地址或标识。
 * @returns 统一 Steam 引用；输入为空时返回 null。
 */
function steamReference(value: string): SteamReference | null {
  const input = value.trim();
  if (!input) return null;

  try {
    const url = new URL(input);
    const segments = url.pathname
      .split("/")
      .map((segment) => decodeURIComponent(segment).trim())
      .filter(Boolean);
    const profileIndex = segments.findIndex((segment) => segment.toLowerCase() === "profiles");
    if (profileIndex >= 0 && segments[profileIndex + 1]) {
      return { kind: "profiles", value: segments[profileIndex + 1] };
    }
    const customIndex = segments.findIndex((segment) => segment.toLowerCase() === "id");
    if (customIndex >= 0 && segments[customIndex + 1]) {
      return { kind: "id", value: segments[customIndex + 1] };
    }
  } catch {
    // 输入值也可能本身就是 SteamID64 或个性化名称，此时继续按纯文本解析。
  }

  const bare = input.replace(/^\/+|\/+$/g, "");
  if (/^\d{10,20}$/.test(bare)) return { kind: "profiles", value: bare };
  return bare ? { kind: "id", value: bare.split("/").pop() || bare } : null;
}

/**
 * 根据 Steam 引用生成公开个人页路径。
 *
 * @param reference - 统一 Steam 引用。
 * @returns 公开个人页路径。
 */
function profilePath(reference: SteamReference): string {
  return `/${reference.kind}/${encodeURIComponent(reference.value)}`;
}

/**
 * 请求 Steam 文本接口并检查响应状态和内容。
 *
 * @param url - Steam 文本接口地址。
 * @returns 非空响应文本。
 * @throws HTTP 状态失败或响应为空时抛出 ProviderError。
 */
async function readSteamText(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/xml, text/xml, text/html;q=0.9, */*;q=0.8",
      "User-Agent": "Momona Steam Sync/1.0",
    },
  });
  if (!response.ok) {
    throw new ProviderError(
      `Steam 返回 ${response.status} ${response.statusText || "请求失败"}`,
      response.status,
    );
  }
  const body = await response.text();
  if (!body.trim()) throw new ProviderError("Steam 返回了空响应");
  return body;
}

/**
 * 请求 Steam JSON 接口并转换响应格式错误。
 *
 * @param url - Steam JSON 接口地址。
 * @returns 解析后的未知 JSON 值。
 * @throws HTTP 状态失败或 JSON 无法解析时抛出 ProviderError。
 */
async function readSteamJson(url: string): Promise<unknown> {
  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "Momona Steam Sync/1.0",
    },
  });
  if (!response.ok) {
    throw new ProviderError(
      `Steam Web API 返回 ${response.status} ${response.statusText || "请求失败"}`,
      response.status,
    );
  }
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new ProviderError("Steam Web API 返回格式不正确");
  }
}

/**
 * 将 Steam persona 状态编号转换为接口状态文本。
 *
 * @param value - Steam persona 状态编号。
 * @returns 对应的状态文本；未知值返回 unknown。
 */
function steamPersonaStateLabel(value: unknown): string {
  return ({
    0: "offline",
    1: "online",
    2: "busy",
    3: "away",
    4: "snooze",
    5: "looking_to_trade",
    6: "looking_to_play",
  } as Record<number, string>)[numberValue(value) ?? 0] ?? "unknown";
}

/**
 * 将 Steam Web API 的玩家摘要转换为统一个人资料。
 *
 * @param payload - Steam Web API 原始响应。
 * @returns 统一个人资料及空的最近游戏列表；没有玩家时返回 null。
 */
function parseSteamApiProfile(
  payload: unknown,
): (SteamRawData["profile"] & { recentGames: SteamGameSnapshot[] }) | null {
  if (!isRecord(payload) || !isRecord(payload.response)) {
    throw new ProviderError("Steam 用户接口返回格式不正确");
  }
  const players = Array.isArray(payload.response.players)
    ? payload.response.players
    : [];
  const player = players.find(isRecord);
  if (!player) return null;
  const steamId = text(player.steamid);
  if (!steamId) return null;
  const personastate = numberValue(player.personastate) ?? 0;
  return {
    steamId,
    name: text(player.personaname) || steamId,
    avatar: imageOr(player.avatarfull) || imageOr(player.avatarmedium) || imageOr(player.avatar),
    state: String(personastate),
    stateMessage: steamPersonaStateLabel(personastate),
    privacyState: text(player.communityvisibilitystate),
    hoursLastTwoWeeks: 0,
    profileUrl: text(player.profileurl) || `https://steamcommunity.com/profiles/${steamId}/`,
    recentGames: [],
  };
}

/**
 * 读取 Steam Web API 的玩家摘要。
 *
 * @param endpoint - Steam Web API 基础地址。
 * @param steamId - SteamID64。
 * @param token - Steam Web API Key。
 * @returns 统一个人资料及空的最近游戏列表。
 * @throws 用户不存在或资料不可见时抛出 ProviderError。
 */
async function readApiProfile(
  endpoint: string,
  steamId: string,
  token: string,
): Promise<SteamRawData["profile"] & { recentGames: SteamGameSnapshot[] }> {
  const params = new URLSearchParams({
    key: token,
    steamids: steamId,
    format: "json",
  });
  const profile = parseSteamApiProfile(
    await readSteamJson(`${endpoint}/ISteamUser/GetPlayerSummaries/v0002/?${params.toString()}`),
  );
  if (!profile) throw new ProviderError("Steam 用户不存在或资料不可见");
  return profile;
}

/**
 * 使用 Web API 将个性化 Steam 地址解析为 SteamID64。
 *
 * @param endpoint - Steam Web API 基础地址。
 * @param vanityName - Steam 个性化地址名称。
 * @param token - Steam Web API Key。
 * @returns 解析出的 SteamID64。
 * @throws 地址解析失败或账号不存在时抛出 ProviderError。
 */
async function resolveSteamVanityUrl(
  endpoint: string,
  vanityName: string,
  token: string,
): Promise<string> {
  const params = new URLSearchParams({
    key: token,
    vanityurl: vanityName,
    format: "json",
  });
  const payload = await readSteamJson(
    `${endpoint}/ISteamUser/ResolveVanityURL/v0001/?${params.toString()}`,
  );
  if (!isRecord(payload) || !isRecord(payload.response)) {
    throw new ProviderError("Steam 自定义地址解析失败");
  }
  const steamId = text(payload.response.steamid);
  if (numberValue(payload.response.success) !== 1 || !steamId) {
    throw new ProviderError("Steam 自定义地址没有对应账号");
  }
  return steamId;
}

/**
 * 将公开 XML 中的游戏节点转换为统一游戏快照。
 *
 * @param value - XML 解析后的游戏节点。
 * @returns 统一游戏快照；节点不完整时返回 null。
 */
function parseSteamGameFromXml(value: unknown): SteamGameSnapshot | null {
  if (!isRecord(value)) return null;
  const title = text(value.gameName);
  if (!title) return null;
  const appId = appIdFromUrl(text(value.gameLink)) || text(value.statsName);
  const cover = imageOr(value.gameLogo) || imageOr(value.gameIcon) || gameCover(appId);
  const hoursLastTwoWeeks = numberValue(value.hoursPlayed);
  const hoursForever = numberValue(value.hoursOnRecord);
  return {
    appId: appId || slug(title),
    title,
    cover,
    url: appId ? `https://steamcommunity.com/app/${encodeURIComponent(appId)}` : gameUrl(slug(title)),
    ...(hoursLastTwoWeeks === undefined ? {} : { hoursLastTwoWeeks }),
    ...(hoursForever === undefined ? {} : { hoursForever }),
  };
}

/**
 * 将 Steam 公开 XML 个人页转换为资料和最近游戏快照。
 *
 * @param xml - Steam 公开个人页 XML 文本。
 * @returns 统一个人资料和最近游戏列表。
 * @throws XML 无法解析或资料不可见时抛出 ProviderError。
 */
function parseSteamProfileXml(xml: string): SteamRawData["profile"] & {
  recentGames: SteamGameSnapshot[];
} {
  let parsed: unknown;
  try {
    parsed = xmlParser.parse(xml) as unknown;
  } catch {
    throw new ProviderError("Steam 个人页 XML 无法解析");
  }
  const profile = isRecord(parsed) && isRecord(parsed.profile) ? parsed.profile : null;
  if (!profile) throw new ProviderError("Steam 个人页返回格式不正确");

  const steamId = text(profile.steamID64);
  if (!steamId) throw new ProviderError("Steam 个人页不可见或地址无效");
  const mostPlayed = isRecord(profile.mostPlayedGames) ? profile.mostPlayedGames : {};
  const recentGames = toArray(mostPlayed.mostPlayedGame).flatMap((game) => {
    const parsedGame = parseSteamGameFromXml(game);
    return parsedGame ? [parsedGame] : [];
  });
  const profileUrl = `https://steamcommunity.com/profiles/${encodeURIComponent(steamId)}/`;
  return {
    steamId,
    name: text(profile.steamID) || steamId,
    avatar: imageOr(profile.avatarFull) || imageOr(profile.avatarMedium) || imageOr(profile.avatarIcon),
    state: text(profile.onlineState),
    stateMessage: text(profile.stateMessage),
    privacyState: text(profile.privacyState),
    hoursLastTwoWeeks: numberValue(profile.hoursPlayed2Wk) ?? 0,
    profileUrl,
    recentGames,
  };
}

/**
 * 将 Steam Web API 游戏对象转换为统一游戏快照。
 *
 * @param value - Steam Web API 游戏对象。
 * @returns 统一游戏快照；缺少应用编号时返回 null。
 */
function parseSteamGameFromApi(value: unknown): SteamGameSnapshot | null {
  if (!isRecord(value)) return null;
  const appId = text(value.appid);
  if (!appId) return null;
  const title = text(value.name) || `Steam 游戏 ${appId}`;
  const hoursLastTwoWeeks = numberValue(value.playtime_2weeks);
  const hoursForever = numberValue(value.playtime_forever);
  return {
    appId,
    title,
    cover: gameCover(appId),
    url: gameUrl(appId),
    ...(hoursLastTwoWeeks === undefined
      ? {}
      : { hoursLastTwoWeeks: hoursLastTwoWeeks / 60 }),
    ...(hoursForever === undefined ? {} : { hoursForever: hoursForever / 60 }),
    ...(formatLastPlayed(value.rtime_last_played)
      ? { lastPlayed: formatLastPlayed(value.rtime_last_played) }
      : {}),
  };
}

/**
 * 按最后游玩日期和近两周时长对游戏排序。
 *
 * @param games - 待排序的游戏快照。
 * @returns 不修改原数组的排序结果。
 */
function sortRecentGames(games: SteamGameSnapshot[]): SteamGameSnapshot[] {
  return [...games].sort((left, right) => {
    const leftTime = left.lastPlayed ? Date.parse(left.lastPlayed) : 0;
    const rightTime = right.lastPlayed ? Date.parse(right.lastPlayed) : 0;
    if (leftTime !== rightTime) return rightTime - leftTime;
    return (right.hoursLastTwoWeeks ?? 0) - (left.hoursLastTwoWeeks ?? 0);
  });
}

/**
 * 按累计游玩时长和名称对游戏库排序。
 *
 * @param games - 待排序的游戏快照。
 * @returns 不修改原数组的排序结果。
 */
function sortLibraryGames(games: SteamGameSnapshot[]): SteamGameSnapshot[] {
  return [...games].sort((left, right) => {
    const hours = (right.hoursForever ?? 0) - (left.hoursForever ?? 0);
    return hours || left.title.localeCompare(right.title);
  });
}

/**
 * 计算最近游戏的排序分值。
 *
 * @param game - 需要计算的游戏快照。
 * @returns 综合最后游玩时间和近两周时长的排序分值。
 */
function recentGameScore(game: SteamGameSnapshot): number {
  return (
    (game.lastPlayed ? Date.parse(game.lastPlayed) : 0) * 1000 +
    (game.hoursLastTwoWeeks ?? 0)
  );
}

/**
 * 合并同一游戏来自最近游玩和游戏库的字段。
 *
 * @param current - 已有的游戏快照。
 * @param next - 新同步的游戏快照。
 * @returns 合并后的游戏快照。
 */
function mergeGame(
  current: SteamGameSnapshot,
  next: SteamGameSnapshot,
): SteamGameSnapshot {
  return {
    ...current,
    ...next,
    title: next.title || current.title,
    cover: current.cover || next.cover,
    url: current.url || next.url,
    hoursLastTwoWeeks: next.hoursLastTwoWeeks ?? current.hoursLastTwoWeeks,
    hoursForever: next.hoursForever ?? current.hoursForever,
    lastPlayed: next.lastPlayed ?? current.lastPlayed,
  };
}

/**
 * 从历史原始快照中读取结构完整的游戏数组。
 *
 * @param value - 本地快照中的未知游戏列表。
 * @returns 规范化后的游戏快照列表。
 */
function normalizeGames(value: unknown): SteamGameSnapshot[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (!isRecord(entry)) return [];
    const appId = text(entry.appId ?? entry.appid);
    const title = text(entry.title ?? entry.name);
    if (!appId || !title) return [];
    return [
      {
        appId,
        title,
        cover: imageOr(entry.cover) || gameCover(appId),
        url: text(entry.url) || gameUrl(appId),
        ...(numberValue(entry.hoursLastTwoWeeks) === undefined
          ? {}
          : { hoursLastTwoWeeks: numberValue(entry.hoursLastTwoWeeks) }),
        ...(numberValue(entry.hoursForever) === undefined
          ? {}
          : { hoursForever: numberValue(entry.hoursForever) }),
        ...(text(entry.lastPlayed) ? { lastPlayed: text(entry.lastPlayed) } : {}),
      },
    ];
  });
}

/**
 * 从本地 Steam 原始快照读取并规范化资料和游戏列表。
 *
 * @param rawData - Steam 本地原始快照。
 * @returns 规范化后的资料和游戏列表；快照结构无效时返回 null。
 */
function steamGamesFromRaw(rawData: unknown): {
  profile: SteamRawData["profile"];
  recentGames: SteamGameSnapshot[];
  libraryGames: SteamGameSnapshot[];
  libraryAvailable: boolean;
} | null {
  if (!isRecord(rawData) || !isRecord(rawData.profile)) return null;
  const profile = rawData.profile;
  const steamId = text(profile.steamId);
  if (!steamId) return null;
  const normalizedProfile: SteamRawData["profile"] = {
    steamId,
    name: text(profile.name) || steamId,
    avatar: imageOr(profile.avatar),
    state: text(profile.state),
    stateMessage: text(profile.stateMessage),
    privacyState: text(profile.privacyState),
    hoursLastTwoWeeks: numberValue(profile.hoursLastTwoWeeks) ?? 0,
    profileUrl: text(profile.profileUrl) || `https://steamcommunity.com/profiles/${steamId}/`,
    ...(numberValue(profile.libraryCount) === undefined
      ? {}
      : { libraryCount: numberValue(profile.libraryCount) }),
  };
  return {
    profile: normalizedProfile,
    recentGames: normalizeGames(rawData.recentGames),
    libraryGames: normalizeGames(rawData.libraryGames),
    libraryAvailable: rawData.libraryAvailable === true,
  };
}

/**
 * 根据 Steam 内容类别生成资料库条目的副标题。
 *
 * @param kind - 条目所属的 Steam 内容类别。
 * @param game - 游戏快照。
 * @returns 资料库卡片副标题。
 */
function itemSubtitle(
  kind: "steamRecentGames" | "steamLibrary",
  game: SteamGameSnapshot,
): string {
  const parts = ["Steam", kind === "steamRecentGames" ? "最近游玩" : "游戏库"];
  if ((game.hoursLastTwoWeeks ?? 0) > 0) {
    parts.push(`近两周 ${formatHours(game.hoursLastTwoWeeks ?? 0)} 小时`);
  }
  if ((game.hoursForever ?? 0) > 0) {
    parts.push(`总计 ${formatHours(game.hoursForever ?? 0)} 小时`);
  }
  if (game.lastPlayed) parts.push(`最后游玩 ${game.lastPlayed.slice(0, 10)}`);
  return parts.join(" · ");
}

/**
 * 将 Steam 原始快照投影为当前配置允许公开的资料库条目。
 *
 * @param rawData - Steam 本地原始快照。
 * @param config - Steam 来源配置。
 * @returns 当前内容开关允许公开的游戏条目。
 */
export function projectSteamRaw(
  rawData: unknown,
  config: LocalConfig["sources"]["steam"],
): LibraryItem[] {
  const snapshot = steamGamesFromRaw(rawData);
  if (!snapshot) return [];
  const recentEnabled = config.content.steamRecentGames;
  const libraryEnabled = config.content.steamLibrary;
  const libraryGames = snapshot.libraryAvailable
    ? snapshot.libraryGames
    : snapshot.libraryGames.length
      ? snapshot.libraryGames
      : snapshot.recentGames;
  const merged = new Map<string, SteamGameSnapshot>();
  const kinds = new Map<string, "steamRecentGames" | "steamLibrary">();

  if (libraryEnabled) {
    for (const game of libraryGames) {
      merged.set(game.appId, game);
      kinds.set(game.appId, "steamLibrary");
    }
  }
  if (recentEnabled) {
    for (const game of snapshot.recentGames) {
      const previous = merged.get(game.appId);
      merged.set(game.appId, previous ? mergeGame(previous, game) : game);
      if (!kinds.has(game.appId)) kinds.set(game.appId, "steamRecentGames");
    }
  }

  const entries = [...merged.entries()].sort(([, left], [, right]) => {
    const leftRecent = (left.hoursLastTwoWeeks ?? 0) > 0 || Boolean(left.lastPlayed);
    const rightRecent = (right.hoursLastTwoWeeks ?? 0) > 0 || Boolean(right.lastPlayed);
    if (recentEnabled && leftRecent !== rightRecent) return leftRecent ? -1 : 1;
    if (recentEnabled) return recentGameScore(right) - recentGameScore(left);
    const hours = (right.hoursForever ?? 0) - (left.hoursForever ?? 0);
    return hours || left.title.localeCompare(right.title);
  });

  return entries.slice(0, sourceLimit(config.limit)).map(([appId, game]) => {
    const kind = kinds.get(appId) ?? "steamLibrary";
    return {
      id: `steam-${appId}`,
      itemType: "game",
      title: game.title,
      subtitle: itemSubtitle(kind, game),
      cover: game.cover || gameCover(appId),
      platform: "Steam",
      url: game.url || gameUrl(appId),
      sourceId: "steam",
      sourceKind: kind,
    };
  });
}

/**
 * 校验 Steam Web API 游戏列表响应并读取总数。
 *
 * @param payload - Steam Web API 游戏列表原始响应。
 * @returns 解析出的游戏列表和可选总数。
 * @throws 响应结构不正确时抛出 ProviderError。
 */
function gamesFromApiResponse(payload: unknown): {
  games: SteamGameSnapshot[];
  count?: number;
} {
  if (!isRecord(payload) || !isRecord(payload.response)) {
    throw new ProviderError("Steam Web API 返回格式不正确");
  }
  const response = payload.response;
  const games = Array.isArray(response.games)
    ? response.games.flatMap((entry) => {
        const game = parseSteamGameFromApi(entry);
        return game ? [game] : [];
      })
    : [];
  return {
    games,
    ...(numberValue(response.game_count) === undefined
      ? {}
      : { count: numberValue(response.game_count) }),
  };
}

/**
 * 请求 Steam Web API 的拥有游戏或最近游戏列表。
 *
 * @param endpoint - Steam Web API 基础地址。
 * @param steamId - SteamID64。
 * @param token - Steam Web API Key。
 * @param method - 请求拥有游戏还是最近游戏。
 * @returns 游戏快照列表和可选总数。
 */
async function readApiGames(
  endpoint: string,
  steamId: string,
  token: string,
  method: "owned" | "recent",
): Promise<{ games: SteamGameSnapshot[]; count?: number }> {
  const path =
    method === "owned"
      ? "IPlayerService/GetOwnedGames/v0001/"
      : "IPlayerService/GetRecentlyPlayedGames/v0001/";
  const params = new URLSearchParams({
    key: token,
    steamid: steamId,
    format: "json",
  });
  if (method === "owned") {
    params.set("include_appinfo", "1");
    params.set("include_played_free_games", "1");
  }
  return gamesFromApiResponse(
    await readSteamJson(`${endpoint}/${path}?${params.toString()}`),
  );
}

/**
 * 从 Steam 公开 HTML 中读取游戏库总数。
 *
 * @param html - Steam 公开个人页 HTML。
 * @returns 读取到的游戏总数；页面没有该信息时返回 undefined。
 */
function libraryCountFromHtml(html: string): number | undefined {
  const match = html.match(/([\d,]+)\s+games\s+in\s+library/i);
  if (!match) return undefined;
  const count = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(count) ? count : undefined;
}

/**
 * 汇总最近游戏的近两周游玩时长。
 *
 * @param games - 最近游玩游戏列表。
 * @returns 近两周累计游玩小时数。
 */
function totalRecentHours(games: SteamGameSnapshot[]): number {
  return games.reduce((total, game) => total + (game.hoursLastTwoWeeks ?? 0), 0);
}

/**
 * 读取 Steam 公开资料，并按配置选择最近游戏和完整游戏库。
 *
 * @param config - Steam 来源配置。
 * @returns 包含原始资料和统一游戏条目的同步数据。
 * @throws 公开资料无法读取且没有可用回退时抛出 ProviderError。
 */
export async function syncSteam(
  config: LocalConfig["sources"]["steam"],
): Promise<ProviderSyncData> {
  const reference = steamReference(config.username);
  if (!config.enabled || !reference) {
    return {
      rawData: null,
      libraryItems: [],
      repositories: [],
      message: "未配置 Steam 个人页地址或 SteamID64",
    };
  }

  const communityBase = "https://steamcommunity.com";
  const token = config.token.trim();
  const apiEndpoint = "https://api.steampowered.com";
  let publicProfile: (SteamRawData["profile"] & {
    recentGames: SteamGameSnapshot[];
  }) | null = null;
  let steamId = reference.kind === "profiles" ? reference.value : "";
  let apiProfile: (SteamRawData["profile"] & {
    recentGames: SteamGameSnapshot[];
  }) | null = null;

  // 自定义地址必须先解析为 SteamID64，之后才能复用 Web API 的资料和游戏库接口。
  if (token && reference.kind === "id") {
    try {
      steamId = await resolveSteamVanityUrl(apiEndpoint, reference.value, token);
    } catch {
      // 即使 Web API 无法解析，公开个人页仍可能直接提供资料。
    }
  }

  // Web API 能提供结构化资料；但它依赖 Key 和可访问权限，因此始终保留公开 XML 回退路径。
  if (token && steamId) {
    try {
      apiProfile = await readApiProfile(apiEndpoint, steamId, token);
    } catch {
      // Web API 失败时，后续流程会回退到公开个人页 XML。
    }
  }

  // 没有 API 资料，或用户要求最近游戏时，读取公开 XML 以补齐资料和公开最近游戏样本。
  if (!apiProfile || config.content.steamRecentGames) {
    try {
      const path = profilePath(
        steamId ? { kind: "profiles", value: steamId } : reference,
      );
      publicProfile = parseSteamProfileXml(
        await readSteamText(`${communityBase}${path}?xml=1`),
      );
    } catch (error) {
      if (!apiProfile) throw error;
    }
  }

  const profile = apiProfile ?? publicProfile;
  // API 失败但 XML 成功时继续使用公开资料；只有两条路径都失败才终止本次来源同步。
  if (!profile) throw new ProviderError("Steam 用户资料暂时无法读取");
  const { recentGames: _profileRecentGames, ...profileData } = profile;
  steamId = profileData.steamId;
  let recentGames = publicProfile?.recentGames ?? [];
  let libraryGames: SteamGameSnapshot[] = [];
  let libraryAvailable = false;
  let libraryCount: number | undefined;

  if (config.content.steamLibrary && !token) {
    // 没有 Web API Key 时不能读取完整库，只尝试读取公开页展示的游戏总数。
    const path = profilePath({ kind: "profiles", value: steamId });
    try {
      const profileHtml = await readSteamText(`${communityBase}${path}?l=english`);
      libraryCount = libraryCountFromHtml(profileHtml);
    } catch {
      // XML 个人页仍足以提供最近游玩的公开回退数据。
    }
  }

  if (token) {
    // 完整游戏库和最近游戏分别按开关请求；单项失败不会丢弃已取得的公开资料。
    if (config.content.steamLibrary) {
      try {
        const owned = await readApiGames(apiEndpoint, profileData.steamId, token, "owned");
        libraryGames = sortLibraryGames(owned.games).slice(0, sourceLimit(config.limit));
        libraryCount = owned.count ?? libraryGames.length;
        libraryAvailable = true;
      } catch {
        // 私有游戏库或无效 Key 不应丢弃已经读取到的公开个人资料。
      }
    }
    if (config.content.steamRecentGames) {
      try {
        const recent = await readApiGames(apiEndpoint, profileData.steamId, token, "recent");
        if (recent.games.length) recentGames = sortRecentGames(recent.games).slice(0, sourceLimit(config.limit));
      } catch {
        // 可选 API 不可用时保留公开 XML 中的最近游玩数据。
      }
    }
  }

  const recentHours = totalRecentHours(recentGames);
  const profileSnapshot = {
    ...profileData,
    hoursLastTwoWeeks:
      recentGames.length > 0 ? recentHours : profile.hoursLastTwoWeeks,
    ...(libraryCount === undefined ? {} : { libraryCount }),
  };

  const rawData: SteamRawData = {
    source: "steam",
    profile: profileSnapshot,
    recentGames: sortRecentGames(recentGames).slice(0, sourceLimit(config.limit)),
    libraryGames,
    libraryAvailable,
  };
  const libraryItems = projectSteamRaw(rawData, config);
  const messages: string[] = [];
  // 只为用户实际选择的内容生成摘要，避免状态消息暗示未请求的数据已经同步。
  if (config.content.steamRecentGames) {
    messages.push(
      `最近游戏 ${rawData.recentGames.length} 项，近两周 ${formatHours(totalRecentHours(rawData.recentGames))} 小时`,
    );
  }
  if (config.content.steamLibrary) {
    if (libraryAvailable) {
      messages.push(`游戏库 ${libraryItems.filter((item) => item.sourceKind === "steamLibrary").length} 项${libraryCount === undefined ? "" : `（共 ${libraryCount} 项）`}`);
    } else {
      messages.push(
        `公开页仅提供最近游戏样本${libraryCount === undefined ? "" : `（Steam 显示共 ${libraryCount} 项）`}；完整游戏库需要 Steam Web API Key`,
      );
    }
  }
  return {
    rawData,
    libraryItems,
    repositories: [],
    message: `Steam 已同步${messages.length ? `：${messages.join("；")}` : "公开资料"}`,
  };
}
