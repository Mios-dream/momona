import type {
  GameHighlight,
  GameShowcaseItem,
  HoyoGame,
  StarRailAccountData,
} from "../../../data/types";
import { readJson, sourceValue } from "../shared";
import { ProviderError } from "../types";

/**
 * 将未知值收窄为可读取的对象，避免直接访问远程响应字段。
 *
 * @param value - 待读取的未知接口值。
 * @returns 可读取属性的对象；不匹配时返回空对象。
 */
function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

/**
 * 将未知数组值转换为空数组，统一处理不同游戏接口的字段差异。
 *
 * @param value - 待读取的未知数组值。
 * @returns 输入本身是数组时返回该数组，否则返回空数组。
 */
function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/**
 * 读取非空字符串，否则返回指定回退值。
 *
 * @param value - 待读取的未知文本。
 * @param fallback - 输入无效时使用的回退文本。
 * @returns 去除首尾空白后的文本。
 */
function stringValue(value: unknown, fallback = ""): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

/**
 * 将远程响应中的数字转换为非负整数。
 *
 * @param value - 待转换的未知数值。
 * @returns 非负整数；无法解析时返回 undefined。
 */
function numberValue(value: unknown): number | undefined {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : undefined;
}

type GenshinCharacterData = {
  characters: Record<string, unknown>;
  names: Record<string, string>;
};

const genshinCharacterDataUrl =
  "https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/characters.json";
const genshinCharacterNamesUrl =
  "https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/loc.json";
let genshinCharacterDataPromise: Promise<GenshinCharacterData> | null = null;

/**
 * 缓存读取原神角色定义和中文名称，避免每次同步重复请求静态字典。
 *
 * @returns 原神角色定义和中文名称的异步结果。
 */
function loadGenshinCharacterData(): Promise<GenshinCharacterData> {
  if (!genshinCharacterDataPromise) {
    genshinCharacterDataPromise = Promise.all([
      readJson(genshinCharacterDataUrl, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Momona/0.0.1",
        },
      }),
      readJson(genshinCharacterNamesUrl, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Momona/0.0.1",
        },
      }),
    ])
      .then(([charactersPayload, namesPayload]) => {
        const names = Object.entries(
          asRecord(asRecord(namesPayload)["zh-cn"]),
        ).reduce<Record<string, string>>((result, [key, value]) => {
          if (typeof value === "string" && value.trim()) result[key] = value;
          return result;
        }, {});
        return { characters: asRecord(charactersPayload), names };
      })
      .catch(() => ({ characters: {}, names: {} }));
  }
  return genshinCharacterDataPromise;
}

/**
 * 从候选值中读取第一个有效数字。
 *
 * @param values - 按优先级排列的候选值。
 * @param fallback - 没有有效候选值时的回退数值。
 * @returns 第一个有效的非负整数或回退值。
 */
function firstNumber(values: unknown[], fallback = 0): number {
  for (const value of values) {
    const parsed = numberValue(value);
    if (parsed !== undefined) return parsed;
  }
  return fallback;
}

/**
 * 沿着多个字段读取嵌套对象，字段不存在时返回空对象。
 *
 * @param value - 根对象。
 * @param keys - 依次读取的字段名。
 * @returns 最终定位到的对象；路径不存在时返回空对象。
 */
function nested(value: unknown, ...keys: string[]): Record<string, unknown> {
  let current: unknown = value;
  for (const key of keys) current = asRecord(current)[key];
  return asRecord(current);
}

/**
 * 根据游戏类型生成 Enka 公开接口地址。
 *
 * @param game - HoYoverse 游戏标识。
 * @param uid - 已编码的用户 UID。
 * @returns 对应游戏的公开接口地址。
 */
function gameEndpoint(game: HoyoGame, uid: string): string {
  if (game === "genshin") return `https://enka.network/api/uid/${uid}?info`;
  if (game === "zzz") return `https://enka.network/api/zzz/uid/${uid}`;
  return `https://enka.network/api/hsr/uid/${uid}`;
}

/**
 * 返回不同游戏使用的等级指标名称。
 *
 * @param game - HoYoverse 游戏标识。
 * @returns 面向用户的等级指标名称。
 */
function gameLabel(game: HoyoGame): string {
  return { genshin: "冒险等阶", hsr: "开拓等级", zzz: "绳网等级" }[game];
}

/**
 * 根据 Enka 资源名称生成公开图片地址。
 *
 * @param assetName - Enka 资源名称。
 * @returns 对应资源的公开图片地址。
 */
function enkaAssetUrl(assetName: string): string {
  return `https://enka.network/ui/${encodeURIComponent(assetName)}.png`;
}

/**
 * 结合原神角色字典补齐角色名称、立绘和稀有度。
 *
 * @param entry - Enka 返回的原神角色展柜条目。
 * @param data - 已加载的原神角色字典。
 * @returns 可展示的角色名称、图片和稀有度字段。
 */
function genshinShowcasePresentation(
  entry: Record<string, unknown>,
  data: GenshinCharacterData,
): { name?: string; icon?: string; art?: string; rarity?: number } {
  const avatarId = numberValue(entry.avatarId ?? entry.avatarID);
  if (avatarId === undefined) return {};

  const definition = asRecord(data.characters[String(avatarId)]);
  const costumes = asRecord(definition.Costumes);
  const costumeId =
    entry.costumeId === undefined ? "" : String(entry.costumeId);
  const costume = asRecord(costumes[costumeId]);
  const sideIconName = stringValue(
    costume.sideIconName ?? definition.SideIconName,
  );
  const sideName = sideIconName.replace(/^UI_AvatarIcon_Side_/, "");
  const iconName = stringValue(
    costume.icon,
    sideName ? `UI_AvatarIcon_${sideName}` : "",
  );
  const artName = stringValue(
    costume.art,
    sideName ? `UI_Gacha_AvatarImg_${sideName}` : "",
  );
  const nameHash = String(
    costume.nameTextMapHash ?? definition.NameTextMapHash ?? "",
  );
  const quality = stringValue(definition.QualityType);

  return {
    name: data.names[nameHash],
    icon: sideIconName ? enkaAssetUrl(sideIconName) : undefined,
    art: artName
      ? enkaAssetUrl(artName)
      : iconName
        ? enkaAssetUrl(iconName)
        : undefined,
    rarity:
      quality === "QUALITY_ORANGE"
        ? 5
        : quality === "QUALITY_PURPLE"
          ? 4
          : undefined,
  };
}

/**
 * 从不同游戏接口的根节点读取昵称。
 *
 * @param payload - 游戏接口原始响应。
 * @returns 根节点中的昵称；没有昵称时返回空字符串。
 */
function rootName(payload: unknown): string {
  const root = asRecord(payload);
  return stringValue(root.nickname ?? root.name);
}

/**
 * 按游戏类型定位玩家资料节点。
 *
 * @param payload - 游戏接口原始响应。
 * @param game - HoYoverse 游戏标识。
 * @returns 对应游戏的玩家资料对象。
 */
function playerRecord(
  payload: unknown,
  game: HoyoGame,
): Record<string, unknown> {
  const root = asRecord(payload);
  if (game === "genshin") return asRecord(root.playerInfo);
  if (game === "zzz") return asRecord(root.PlayerInfo);
  return asRecord(root.detailInfo ?? root.detail ?? root.data ?? root);
}

/**
 * 按游戏类型读取角色展柜列表。
 *
 * @param player - 已定位的玩家资料对象。
 * @param game - HoYoverse 游戏标识。
 * @returns 角色展柜原始条目列表。
 */
function showcaseEntries(
  player: Record<string, unknown>,
  game: HoyoGame,
): unknown[] {
  if (game === "genshin") return asArray(player.showAvatarInfoList);
  if (game === "zzz") return asArray(nested(player, "ShowcaseDetail").AvatarList);
  return asArray(
    player.avatarDetailList ?? player.avatarDetail ?? player.avatarList,
  );
}

/**
 * 将角色展柜条目转换为首页卡片使用的统一角色模型。
 *
 * @param player - 已定位的玩家资料对象。
 * @param game - HoYoverse 游戏标识。
 * @param genshinData - 可选的原神角色字典。
 * @returns 最多六个统一角色展柜条目。
 */
function mapShowcase(
  player: Record<string, unknown>,
  game: HoyoGame,
  genshinData?: GenshinCharacterData,
): GameShowcaseItem[] {
  return showcaseEntries(player, game).slice(0, 6).flatMap((entry) => {
    const record = asRecord(entry);
    const character = asRecord(record.character ?? record.avatar ?? record);
    const genshinPresentation =
      game === "genshin" && genshinData
        ? genshinShowcasePresentation(record, genshinData)
        : {};
    const name = stringValue(
      record.name ??
        record.displayName ??
        character.name ??
        genshinPresentation.name,
    );
    if (!name) return [];
    const level = numberValue(
      record.level ?? record.Level ?? character.level,
    );
    const rarity = numberValue(
      record.rarity ??
        record.Rarity ??
        character.rarity ??
        record.rank ??
        genshinPresentation.rarity,
    );
    const icon = stringValue(
      record.icon ??
        record.avatarIcon ??
        character.icon ??
        character.iconUrl ??
        genshinPresentation.icon,
    );
    const art = stringValue(
      record.art ??
        record.preview ??
        record.avatarImage ??
        character.art ??
        genshinPresentation.art,
    );
    return [{ name, level, rarity, icon: icon || undefined, art: art || undefined }];
  });
}

/**
 * 将不同游戏的玩家响应归一化为统一账号摘要。
 *
 * @param payload - 游戏接口原始响应。
 * @param uid - 用户 UID。
 * @param game - HoYoverse 游戏标识。
 * @param genshinData - 可选的原神角色字典。
 * @returns 统一的游戏账号摘要。
 */
function parseAccount(
  payload: unknown,
  uid: string,
  game: HoyoGame,
  genshinData?: GenshinCharacterData,
): StarRailAccountData {
  const player = playerRecord(payload, game);
  const profile =
    game === "zzz"
      ? nested(player, "SocialDetail", "ProfileDetail")
      : player;
  const recordInfo = asRecord(player.recordInfo);
  const showcase = mapShowcase(player, game, genshinData);
  const characterEntries =
    game === "genshin"
      ? player.showAvatarInfoList
      : game === "zzz"
      ? nested(player, "ShowcaseDetail").AvatarList
      : player.avatarDetailList ?? player.avatarDetail ?? player.avatarList;
  const characterCount = firstNumber(
    [
      recordInfo.avatarCount,
      recordInfo.characterCount,
      profile.characterCount,
      asArray(characterEntries).length,
    ],
    showcase.length,
  );
  const achievements = firstNumber([
    recordInfo.achievementCount,
    recordInfo.achievements,
    player.finishAchievementNum,
    asArray(nested(player, "SocialDetail").MedalList).length,
    profile.achievementCount,
  ]);
  const level = firstNumber([
    profile.level,
    profile.Level,
    player.level,
    player.avatarLevel,
  ]);
  const nickname = stringValue(
    profile.nickname ?? profile.Nickname ?? player.nickname ?? rootName(payload),
    uid,
  );
  const signature = stringValue(
    profile.signature ?? player.signature ?? nested(player, "SocialDetail").Desc,
  );
  const highlights: GameHighlight[] = [];
  if (achievements > 0) {
    highlights.push({ label: "成就", value: String(achievements) });
  }
  if (characterCount > 0) {
    highlights.push({ label: "角色", value: String(characterCount) });
  }
  if (game === "genshin") {
    const floor = numberValue(player.towerFloorIndex);
    const chamber = numberValue(player.towerLevelIndex);
    if (floor && chamber) {
      highlights.push({ label: "深渊", value: `${floor}-${chamber}` });
    }
  }
  if (game === "zzz") {
    const medals = asArray(nested(player, "SocialDetail").MedalList).length;
    if (medals > 0) highlights.push({ label: "勋章", value: String(medals) });
  }

  return {
    uid,
    nickname,
    level,
    worldLevel: firstNumber([profile.worldLevel, player.worldLevel]),
    achievements,
    characters: characterCount,
    avatar: stringValue(
      profile.avatar ?? profile.headIcon ?? player.avatar ?? player.headIcon,
    ) || undefined,
    game,
    signature: signature || undefined,
    score: { label: gameLabel(game), value: String(level) },
    highlights,
    showcase,
    profileUrl:
      game === "genshin"
        ? `https://enka.network/u/${uid}`
        : `https://enka.network/${game}/${uid}`,
    degraded: false,
    updatedAt: new Date().toISOString(),
  };
}

/**
 * 从公开 Enka / MiHoMo 服务读取参考站同款的游戏 Presence 摘要。
 *
 * @param value - 用户输入的 UID 或包含 UID 的文本。
 * @param game - 需要读取的 HoYoverse 游戏，默认是星穹铁道。
 * @returns 统一的游戏账号摘要。
 * @throws UID 格式无效或所有公开接口都读取失败时抛出 ProviderError。
 */
export async function fetchHoyoGameAccount(
  value: string,
  game: HoyoGame = "hsr",
): Promise<StarRailAccountData> {
  const uid = sourceValue(value, /^(\d+)$/);
  if (!/^\d{6,12}$/.test(uid)) {
    throw new ProviderError("请输入 6-12 位数字 UID");
  }

  const endpoints = [gameEndpoint(game, encodeURIComponent(uid))];
  if (game === "hsr") {
    endpoints.push(
      `https://api.mihomo.me/sr_info_parsed/${encodeURIComponent(uid)}?lang=cn`,
    );
  }

  let lastError: unknown;
  for (const endpoint of endpoints) {
    try {
      const payload = await readJson(endpoint, {
        headers: {
          Accept: "application/json",
          "User-Agent": "Momona/0.0.1",
        },
      });
      const genshinData =
        game === "genshin" ? await loadGenshinCharacterData() : undefined;
      return parseAccount(payload, uid, game, genshinData);
    } catch (error) {
      lastError = error;
    }
  }

  throw new ProviderError(
    `${game === "hsr" ? "星铁" : game === "genshin" ? "原神" : "绝区零"}账号暂时无法读取：${String(
      lastError instanceof Error ? lastError.message : lastError,
    )}`,
  );
}

/**
 * 兼容旧设置接口名称。
 *
 * @param value - 用户输入的星穹铁道 UID。
 * @returns 星穹铁道账号摘要的异步结果。
 */
export function fetchStarRailAccount(
  value: string,
): Promise<StarRailAccountData> {
  return fetchHoyoGameAccount(value, "hsr");
}
