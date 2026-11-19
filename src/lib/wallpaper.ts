import type { SiteBackground } from "../data/types";
import {
  defaultWallpaperImage,
  wallpaperFolder,
  wallpaperProviders,
} from "../data/wallpapers";

/** 壁纸库里的一个候选项。 */
export interface WallpaperEntry {
  /** 稳定标识，用来判断「当前显示的是不是这一张」。 */
  id: string;
  /** 设置页里展示的名称。 */
  label: string;
  /** 参与绘制的原始值：可以是图片地址、渐变，也可以是网络图源接口。 */
  image: string;
  /** 来源类型：目录扫描、手动添加、网络图源。 */
  kind: "folder" | "pool" | "remote";
  /** 每次请求都可能返回另一张图的接口，切换时需要绕开缓存。 */
  dynamic: boolean;
}

/** 壁纸目录索引的响应结构。 */
interface WallpaperIndexPayload {
  files?: Array<{ file?: string; url?: string; label?: string }>;
}

/**
 * 索引读取失败时的兜底壁纸。
 *
 * 正常情况下目录里至少有默认壁纸；只有构建时索引没生成、或者静态部署漏了
 * `wallpapers/index.json` 才会走到这里，此时至少保证首屏还有一张图。
 */
const fallbackFolder: WallpaperEntry[] = [
  {
    id: "folder:cyrene.webp",
    label: "Cyrene",
    image: defaultWallpaperImage,
    kind: "folder",
    dynamic: false,
  },
];

let libraryPromise: Promise<WallpaperEntry[]> | null = null;

/**
 * 读取壁纸目录索引。
 *
 * 开发服务器优先走 `/__momona/wallpapers`，能实时反映刚放进目录的文件；
 * 该接口不可用时退回构建时生成的 `index.json`，静态部署则直接读它。
 * 两条路径返回同一种结构，前端不需要分支。
 *
 * @returns 壁纸目录里的图片列表。
 */
async function readWallpaperFolder(): Promise<WallpaperEntry[]> {
  const endpoints = import.meta.env.DEV
    ? ["/__momona/wallpapers", `${wallpaperFolder}/index.json`]
    : [`${wallpaperFolder}/index.json`];

  for (const endpoint of endpoints) {
    try {
      const response = await fetch(endpoint, {
        headers: { Accept: "application/json" },
        cache: "no-store",
      });
      if (!response.ok) throw new Error(`壁纸索引返回 ${response.status}`);
      const payload = (await response.json()) as WallpaperIndexPayload;
      const entries = (payload.files ?? []).flatMap((file, index) => {
        const image = typeof file.url === "string" ? file.url.trim() : "";
        if (!image) return [];
        return [
          {
            id: `folder:${file.file || index}`,
            label: (file.label || "").trim() || image,
            image,
            kind: "folder" as const,
            dynamic: false,
          },
        ];
      });
      return entries.length ? entries : fallbackFolder;
    } catch {
      // 换下一个入口；两个都失败才退回兜底壁纸。
    }
  }
  return fallbackFolder;
}

/**
 * 读取壁纸目录，并缓存结果供设置页与壳层共用。
 *
 * @param force - 为 true 时忽略缓存重新扫描，用于设置页的"重新扫描"。
 * @returns 壁纸目录里的图片列表。
 */
export function loadWallpaperLibrary(force = false): Promise<WallpaperEntry[]> {
  if (!libraryPromise || force) libraryPromise = readWallpaperFolder();
  return libraryPromise;
}

/**
 * 从壁纸值里抽一个短名称，用于壁纸列表的标签。
 *
 * 图片地址优先用文件名；`…/1920/1080` 这类没有文件名的随机图接口，
 * 退回"域名/末段"，至少能看出是哪家的图，而不是一个光秃秃的数字。
 *
 * @param image - 配置里的壁纸值。
 * @returns 图片文件名；渐变与空值返回固定的中文标签。
 */
export function wallpaperLabelOf(image: string): string {
  const value = image.trim();
  if (!value) return "无图";
  if (/gradient\(/.test(value)) return "渐变底色";
  const segment = value.split(/[?#]/)[0].split("/").pop() || "";
  const name = (() => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  })();
  if (/\.[a-z0-9]{2,5}$/i.test(name)) return name;
  try {
    const host = new URL(value).hostname.replace(/^www\./, "");
    return segment ? `${host}/${name}` : host;
  } catch {
    return name || value;
  }
}

/**
 * 组装当前配置下的壁纸库。
 *
 * 顺序即优先级：目录里的图片 → 手动添加的地址 → 网络图源 → 当前固定壁纸。
 * 固定壁纸放在最后，是为了让"选了一张渐变"也能参与随机，同时又不会挤掉
 * 目录里的图片。
 *
 * @param background - 当前壁纸配置。
 * @param folder - 壁纸目录扫描结果。
 * @returns 去重后的候选列表。
 */
export function wallpaperCandidates(
  background: SiteBackground,
  folder: WallpaperEntry[],
): WallpaperEntry[] {
  const entries: WallpaperEntry[] = [...folder];
  background.pool.forEach((image, index) => {
    const value = image.trim();
    if (!value) return;
    entries.push({
      id: `pool:${index}:${value}`,
      label: wallpaperLabelOf(value),
      image: value,
      kind: "pool",
      dynamic: false,
    });
  });
  for (const provider of wallpaperProviders) {
    if (!background.remoteSources.includes(provider.id)) continue;
    entries.push({
      id: `remote:${provider.id}`,
      label: provider.label,
      image: provider.url,
      kind: "remote",
      dynamic: provider.dynamic,
    });
  }
  const custom = background.remoteCustom.trim();
  if (custom) {
    entries.push({
      id: `remote:custom:${custom}`,
      label: "自定义图源",
      image: custom,
      kind: "remote",
      dynamic: true,
    });
  }
  const fixed = background.image.trim();
  if (fixed) {
    entries.push({
      id: "fixed",
      label: wallpaperLabelOf(fixed),
      image: fixed,
      kind: "pool",
      dynamic: false,
    });
  }

  const seen = new Set<string>();
  return entries.filter((entry) => {
    if (!entry.image || seen.has(entry.image)) return false;
    seen.add(entry.image);
    return true;
  });
}

/**
 * 把动图源的地址装饰成一次性地址。
 *
 * 网络图源大多按请求返回随机图，浏览器缓存会让"换一张"变成"再显示同一张"，
 * 所以每次切换追加一个时间戳参数；静态地址保持原样，避免无谓的重复下载。
 *
 * @param entry - 待绘制的壁纸项。
 * @returns 可直接写入 `background-image` 的地址或渐变。
 */
export function wallpaperPaintUrl(entry: WallpaperEntry): string {
  if (!entry.dynamic) return entry.image;
  const separator = entry.image.includes("?") ? "&" : "?";
  return `${entry.image}${separator}momona=${Date.now().toString(36)}`;
}

/**
 * 预加载一张壁纸，成功后再做淡入，避免切换时先闪一帧空白。
 *
 * 渐变和空值不需要网络，直接视为可用；图片超过 6 秒仍然没有结果时按失败
 * 处理，交给上层换下一张，而不是让壁纸一直卡在上一张。
 *
 * @param image - 待加载的壁纸值。
 * @returns 壁纸可以安全显示时为 true。
 */
export function preloadWallpaper(image: string): Promise<boolean> {
  const value = image.trim();
  if (!value || value.startsWith("url(") || /gradient\(/.test(value)) {
    return Promise.resolve(true);
  }
  return new Promise((resolve) => {
    const probe = new Image();
    let settled = false;
    const finish = (loaded: boolean) => {
      if (settled) return;
      settled = true;
      probe.onload = null;
      probe.onerror = null;
      resolve(loaded);
    };
    const timer = window.setTimeout(() => finish(false), 6000);
    probe.onload = () => {
      window.clearTimeout(timer);
      finish(true);
    };
    probe.onerror = () => {
      window.clearTimeout(timer);
      finish(false);
    };
    probe.src = value;
  });
}
