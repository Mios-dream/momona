import type { HoyoGame, StarRailAccountData } from "../../data/types";
import { fetchHoyoGameAccount } from "./providers/starRail";

/**
 * 读取公开游戏账号摘要。
 *
 * 设置 API 只依赖这个来源门面，不直接依赖具体游戏 provider；以后更换
 * 公开接口或组合多个来源时，调用方仍然只需要使用统一的账号读取协议。
 *
 * @param value - 用户输入的 UID 或包含 UID 的文本。
 * @param game - 需要读取的 HoYoverse 游戏，默认是星穹铁道。
 * @returns 统一的公开游戏账号摘要。
 */
export function fetchPublicGameAccount(
  value: string,
  game: HoyoGame = "hsr",
): Promise<StarRailAccountData> {
  return fetchHoyoGameAccount(value, game);
}
