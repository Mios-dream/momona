import type { WallpaperMode } from "./types";

/**
 * 壁纸目录与默认壁纸。
 *
 * 壁纸统一放在 `public/wallpapers`：构建时由 `wallpaperIndexPlugin` 扫成
 * `index.json`，所以「把图片放进文件夹」就是新增壁纸的唯一动作。
 */
export const wallpaperFolder = "/wallpapers";

/** 站点首次启动、以及壁纸库为空时使用的壁纸。 */
export const defaultWallpaperImage = "/wallpapers/cyrene.webp";

/**
 * 旧版壁纸路径迁移表。
 *
 * 壁纸搬进独立目录后，老配置文件里仍然是 `/assets/cyrene-wallpaper.webp`；
 * 读配置时顺手改写，用户不需要手工改文件，旧地址也不会变成一张破图。
 */
export const legacyWallpaperImages: Record<string, string> = {
  "/assets/cyrene-wallpaper.webp": defaultWallpaperImage,
};

/** 切换方式在设置页里的文案；顺序即分段控件的顺序。 */
export const wallpaperModeOptions: Array<{
  value: WallpaperMode;
  label: string;
  description: string;
}> = [
  {
    value: "fixed",
    label: "固定",
    description: "始终显示选中的这一张。",
  },
  {
    value: "random",
    label: "每次随机",
    description: "每次打开页面时从壁纸库里随机挑一张。",
  },
  {
    value: "rotate",
    label: "定时轮换",
    description: "页面开着时，按设定的间隔自动换图。",
  },
];

/** 定时轮换的间隔档位。 */
export const wallpaperRotateOptions: Array<{ value: number; label: string }> = [
  { value: 5, label: "每 5 分钟" },
  { value: 15, label: "每 15 分钟" },
  { value: 30, label: "每半小时" },
  { value: 60, label: "每小时" },
  { value: 180, label: "每 3 小时" },
];

/**
 * 一个网络图源。
 *
 * 这些接口都直接返回图片（302 到图片或直接输出二进制），因此可以原样塞进
 * `background-image`，既不需要 CORS，也不需要后端代理。`dynamic` 表示每次
 * 请求都可能是另一张图，切换时要在地址上追加时间戳绕开浏览器缓存。
 */
export interface WallpaperProvider {
  id: string;
  label: string;
  description: string;
  url: string;
  dynamic: boolean;
}

/**
 * 内置网络图源。
 *
 * 只收录「URL 直接返回图片」的接口：静态站点没有后端，任何需要 JSON +
 * 二次请求的方案都会卡在跨域上。第三方服务的可用性不受我们控制，
 * 所以客户端会把加载失败的图源跳过去，不至于让壁纸整块变空。
 */
export const wallpaperProviders: WallpaperProvider[] = [
  {
    id: "picsum",
    label: "随机摄影",
    description: "Lorem Picsum 摄影图库",
    url: "https://picsum.photos/1920/1080",
    dynamic: true,
  },
  {
    id: "alcy",
    label: "二次元插画",
    description: "t.alcy.cc 动漫插画",
    url: "https://t.alcy.cc/moe",
    dynamic: true,
  },
  {
    id: "loliapi",
    label: "动漫图片",
    description: "loliapi 动漫图",
    url: "https://www.loliapi.com/acg/",
    dynamic: true,
  },
];

/**
 * 判断未知值是否为合法的壁纸切换策略。
 *
 * @param value - 待判断的未知值。
 * @returns 值为三种策略之一时返回 true。
 */
export function isWallpaperMode(value: unknown): value is WallpaperMode {
  return value === "fixed" || value === "random" || value === "rotate";
}

/**
 * 按 ID 查找内置网络图源。
 *
 * @param id - 图源标识。
 * @returns 命中的图源；未注册时返回 undefined。
 */
export function wallpaperProviderById(
  id: string,
): WallpaperProvider | undefined {
  return wallpaperProviders.find((provider) => provider.id === id);
}
