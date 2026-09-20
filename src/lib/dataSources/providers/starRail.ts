import type {
  GameHighlight,
  GameShowcaseItem,
  HoyoGame,
  StarRailAccountData,
} from "../../../data/types";
import { readJson, sourceValue } from "../shared";
import { ProviderError } from "../types";

const asRecord = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" ? (value as Record<string, unknown>) : {};

const asArray = (value: unknown): unknown[] =>
  Array.isArray(value) ? value : [];

const stringValue = (value: unknown, fallback = ""): string =>
  typeof value === "string" && value.trim() ? value.trim() : fallback;

const numberValue = (value: unknown): number | undefined => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.round(parsed)) : undefined;
};

type GenshinCharacterData = {
  characters: Record<string, unknown>;
  names: Record<string, string>;
};

const genshinCharacterDataUrl =
  "https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/characters.json";
const genshinCharacterNamesUrl =
  "https://raw.githubusercontent.com/EnkaNetwork/API-docs/master/store/loc.json";
let genshinCharacterDataPromise: Promise<GenshinCharacterData> | null = null;

const loadGenshinCharacterData = (): Promise<GenshinCharacterData> => {
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
};

const firstNumber = (values: unknown[], fallback = 0): number => {
  for (const value of values) {
    const parsed = numberValue(value);
    if (parsed !== undefined) return parsed;
  }
  return fallback;
};

const nested = (value: unknown, ...keys: string[]): Record<string, unknown> => {
  let current: unknown = value;
  for (const key of keys) current = asRecord(current)[key];
  return asRecord(current);
};

const gameEndpoint = (game: HoyoGame, uid: string): string => {
  if (game === "genshin") return `https://enka.network/api/uid/${uid}?info`;
  if (game === "zzz") return `https://enka.network/api/zzz/uid/${uid}`;
  return `https://enka.network/api/hsr/uid/${uid}`;
};

const gameLabel = (game: HoyoGame): string =>
  ({ genshin: "冒险等阶", hsr: "开拓等级", zzz: "绳网等级" })[game];

const enkaAssetUrl = (assetName: string): string =>
  `https://enka.network/ui/${encodeURIComponent(assetName)}.png`;

const genshinShowcasePresentation = (
  entry: Record<string, unknown>,
  data: GenshinCharacterData,
): { name?: string; icon?: string; art?: string; rarity?: number } => {
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
};

const rootName = (payload: unknown): string => {
  const root = asRecord(payload);
  return stringValue(root.nickname ?? root.name);
};

const playerRecord = (
  payload: unknown,
  game: HoyoGame,
): Record<string, unknown> => {
  const root = asRecord(payload);
  if (game === "genshin") return asRecord(root.playerInfo);
  if (game === "zzz") return asRecord(root.PlayerInfo);
  return asRecord(root.detailInfo ?? root.detail ?? root.data ?? root);
};

const showcaseEntries = (
  player: Record<string, unknown>,
  game: HoyoGame,
): unknown[] => {
  if (game === "genshin") return asArray(player.showAvatarInfoList);
  if (game === "zzz") return asArray(nested(player, "ShowcaseDetail").AvatarList);
  return asArray(
    player.avatarDetailList ?? player.avatarDetail ?? player.avatarList,
  );
};

const mapShowcase = (
  player: Record<string, unknown>,
  game: HoyoGame,
  genshinData?: GenshinCharacterData,
): GameShowcaseItem[] =>
  showcaseEntries(player, game).slice(0, 6).flatMap((entry) => {
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

const parseAccount = (
  payload: unknown,
  uid: string,
  game: HoyoGame,
  genshinData?: GenshinCharacterData,
): StarRailAccountData => {
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
};

/** 从公开 Enka / MiHoMo 服务读取参考站同款的游戏 Presence 摘要。 */
export const fetchHoyoGameAccount = async (
  value: string,
  game: HoyoGame = "hsr",
): Promise<StarRailAccountData> => {
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
};

/** 兼容旧设置接口名称。 */
export const fetchStarRailAccount = (
  value: string,
): Promise<StarRailAccountData> => fetchHoyoGameAccount(value, "hsr");
