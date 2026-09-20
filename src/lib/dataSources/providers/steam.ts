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

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const text = (value: unknown): string =>
  typeof value === "string" || typeof value === "number" ? String(value).trim() : "";

const numberValue = (value: unknown): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
};

const toArray = (value: unknown): unknown[] =>
  value === undefined || value === null ? [] : Array.isArray(value) ? value : [value];

const formatHours = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

const formatLastPlayed = (value: unknown): string | undefined => {
  const timestamp = numberValue(value);
  if (timestamp === undefined || timestamp <= 0) return undefined;
  const date = new Date(timestamp * 1000);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
};

const appIdFromUrl = (value: string): string =>
  value.match(/\/app\/(\d+)/i)?.[1] ?? "";

const gameUrl = (appId: string): string =>
  `https://store.steampowered.com/app/${encodeURIComponent(appId)}/`;

const gameCover = (appId: string): string =>
  appId
    ? `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${encodeURIComponent(appId)}/header.jpg`
    : "";

const steamReference = (value: string): SteamReference | null => {
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
    // The setting may already be a SteamID64 or a vanity name.
  }

  const bare = input.replace(/^\/+|\/+$/g, "");
  if (/^\d{10,20}$/.test(bare)) return { kind: "profiles", value: bare };
  return bare ? { kind: "id", value: bare.split("/").pop() || bare } : null;
};

const profilePath = (reference: SteamReference): string =>
  `/${reference.kind}/${encodeURIComponent(reference.value)}`;

const readSteamText = async (url: string): Promise<string> => {
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
};

const readSteamJson = async (url: string): Promise<unknown> => {
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
};

const steamPersonaStateLabel = (value: unknown): string =>
  ({
    0: "offline",
    1: "online",
    2: "busy",
    3: "away",
    4: "snooze",
    5: "looking_to_trade",
    6: "looking_to_play",
  } as Record<number, string>)[numberValue(value) ?? 0] ?? "unknown";

const parseSteamApiProfile = (
  payload: unknown,
): (SteamRawData["profile"] & { recentGames: SteamGameSnapshot[] }) | null => {
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
};

const readApiProfile = async (
  endpoint: string,
  steamId: string,
  token: string,
): Promise<SteamRawData["profile"] & { recentGames: SteamGameSnapshot[] }> => {
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
};

const resolveSteamVanityUrl = async (
  endpoint: string,
  vanityName: string,
  token: string,
): Promise<string> => {
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
};

const parseSteamGameFromXml = (value: unknown): SteamGameSnapshot | null => {
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
};

const parseSteamProfileXml = (xml: string): SteamRawData["profile"] & {
  recentGames: SteamGameSnapshot[];
} => {
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
};

const parseSteamGameFromApi = (value: unknown): SteamGameSnapshot | null => {
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
};

const sortRecentGames = (games: SteamGameSnapshot[]): SteamGameSnapshot[] =>
  [...games].sort((left, right) => {
    const leftTime = left.lastPlayed ? Date.parse(left.lastPlayed) : 0;
    const rightTime = right.lastPlayed ? Date.parse(right.lastPlayed) : 0;
    if (leftTime !== rightTime) return rightTime - leftTime;
    return (right.hoursLastTwoWeeks ?? 0) - (left.hoursLastTwoWeeks ?? 0);
  });

const sortLibraryGames = (games: SteamGameSnapshot[]): SteamGameSnapshot[] =>
  [...games].sort((left, right) => {
    const hours = (right.hoursForever ?? 0) - (left.hoursForever ?? 0);
    return hours || left.title.localeCompare(right.title);
  });

const recentGameScore = (game: SteamGameSnapshot): number =>
  (game.lastPlayed ? Date.parse(game.lastPlayed) : 0) * 1000 +
  (game.hoursLastTwoWeeks ?? 0);

const mergeGame = (
  current: SteamGameSnapshot,
  next: SteamGameSnapshot,
): SteamGameSnapshot => ({
  ...current,
  ...next,
  title: next.title || current.title,
  cover: current.cover || next.cover,
  url: current.url || next.url,
  hoursLastTwoWeeks: next.hoursLastTwoWeeks ?? current.hoursLastTwoWeeks,
  hoursForever: next.hoursForever ?? current.hoursForever,
  lastPlayed: next.lastPlayed ?? current.lastPlayed,
});

const normalizeGames = (value: unknown): SteamGameSnapshot[] => {
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
};

const steamGamesFromRaw = (rawData: unknown): {
  profile: SteamRawData["profile"];
  recentGames: SteamGameSnapshot[];
  libraryGames: SteamGameSnapshot[];
  libraryAvailable: boolean;
} | null => {
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
};

const itemSubtitle = (
  kind: "steamRecentGames" | "steamLibrary",
  game: SteamGameSnapshot,
): string => {
  const parts = ["Steam", kind === "steamRecentGames" ? "最近游玩" : "游戏库"];
  if ((game.hoursLastTwoWeeks ?? 0) > 0) {
    parts.push(`近两周 ${formatHours(game.hoursLastTwoWeeks ?? 0)} 小时`);
  }
  if ((game.hoursForever ?? 0) > 0) {
    parts.push(`总计 ${formatHours(game.hoursForever ?? 0)} 小时`);
  }
  if (game.lastPlayed) parts.push(`最后游玩 ${game.lastPlayed.slice(0, 10)}`);
  return parts.join(" · ");
};

export const projectSteamRaw = (
  rawData: unknown,
  config: LocalConfig["sources"]["steam"],
): LibraryItem[] => {
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
};

const gamesFromApiResponse = (payload: unknown): {
  games: SteamGameSnapshot[];
  count?: number;
} => {
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
};

const readApiGames = async (
  endpoint: string,
  steamId: string,
  token: string,
  method: "owned" | "recent",
): Promise<{ games: SteamGameSnapshot[]; count?: number }> => {
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
};

const libraryCountFromHtml = (html: string): number | undefined => {
  const match = html.match(/([\d,]+)\s+games\s+in\s+library/i);
  if (!match) return undefined;
  const count = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(count) ? count : undefined;
};

const totalRecentHours = (games: SteamGameSnapshot[]): number =>
  games.reduce((total, game) => total + (game.hoursLastTwoWeeks ?? 0), 0);

export const syncSteam = async (
  config: LocalConfig["sources"]["steam"],
): Promise<ProviderSyncData> => {
  const reference = steamReference(config.username);
  if (!config.enabled || !reference) {
    return {
      rawData: null,
      libraryItems: [],
      repositories: [],
      message: "未配置 Steam 个人页地址或 SteamID64",
    };
  }

  const communityBase = (config.endpoint.trim() || "https://steamcommunity.com").replace(
    /\/$/,
    "",
  );
  const token = config.token.trim();
  const apiEndpoint = "https://api.steampowered.com";
  let publicProfile: (SteamRawData["profile"] & {
    recentGames: SteamGameSnapshot[];
  }) | null = null;
  let steamId = reference.kind === "profiles" ? reference.value : "";
  let apiProfile: (SteamRawData["profile"] & {
    recentGames: SteamGameSnapshot[];
  }) | null = null;

  if (token && reference.kind === "id") {
    try {
      steamId = await resolveSteamVanityUrl(apiEndpoint, reference.value, token);
    } catch {
      // The public custom URL may still resolve without the Web API.
    }
  }
  if (token && steamId) {
    try {
      apiProfile = await readApiProfile(apiEndpoint, steamId, token);
    } catch {
      // Fall back to the public profile XML below.
    }
  }

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
  if (!profile) throw new ProviderError("Steam 用户资料暂时无法读取");
  const { recentGames: _profileRecentGames, ...profileData } = profile;
  steamId = profileData.steamId;
  let recentGames = publicProfile?.recentGames ?? [];
  let libraryGames: SteamGameSnapshot[] = [];
  let libraryAvailable = false;
  let libraryCount: number | undefined;

  if (config.content.steamLibrary && !token) {
    const path = profilePath({ kind: "profiles", value: steamId });
    try {
      const profileHtml = await readSteamText(`${communityBase}${path}?l=english`);
      libraryCount = libraryCountFromHtml(profileHtml);
    } catch {
      // The XML profile remains sufficient for the public recent-game fallback.
    }
  }

  if (token) {
    if (config.content.steamLibrary) {
      try {
        const owned = await readApiGames(apiEndpoint, profileData.steamId, token, "owned");
        libraryGames = sortLibraryGames(owned.games).slice(0, sourceLimit(config.limit));
        libraryCount = owned.count ?? libraryGames.length;
        libraryAvailable = true;
      } catch {
        // A private library or invalid key should not discard public profile data.
      }
    }
    if (config.content.steamRecentGames) {
      try {
        const recent = await readApiGames(apiEndpoint, profileData.steamId, token, "recent");
        if (recent.games.length) recentGames = sortRecentGames(recent.games).slice(0, sourceLimit(config.limit));
      } catch {
        // Fall back to the public profile XML when the optional API is unavailable.
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
};
