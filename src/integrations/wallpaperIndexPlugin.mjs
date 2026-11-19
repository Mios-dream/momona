import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const wallpaperDirectory = new URL("../../public/wallpapers/", import.meta.url);
const wallpaperIndexPath = new URL("index.json", wallpaperDirectory);
const wallpaperExtensions = new Set([
  ".avif",
  ".gif",
  ".jpeg",
  ".jpg",
  ".png",
  ".webp",
]);

/**
 * 把文件名转成展示用的名称。
 *
 * 壁纸目录里常见的写法是 `cyrene-wallpaper.webp`，直接拿文件名当标签会带出
 * 连字符和扩展名；这里只做「去扩展名 + 分隔符换空格 + 首字母大写」，
 * 中文名保持原样，不做音译或缩写。
 *
 * @param {string} file - 壁纸目录中的文件名。
 * @returns {string} 设置页里展示的壁纸名称。
 */
function wallpaperLabel(file) {
  const base = file
    .replace(/\.[^.]+$/, "")
    .replace(/[-_]+/g, " ")
    .trim();
  if (!base) return file;
  return base.charAt(0).toUpperCase() + base.slice(1);
}

/**
 * 扫描壁纸目录，生成可以直接被前端消费的索引。
 *
 * 只认图片扩展名，`index.json` 自身会被忽略，因此重复执行是安全的；
 * 返回的 `url` 已经是站点根路径，前端不需要再拼前缀。
 *
 * @returns {{folder: string, files: Array<{file: string, url: string, label: string}>}} 壁纸索引。
 */
export function scanWallpaperFolder() {
  let entries = [];
  try {
    entries = readdirSync(fileURLToPath(wallpaperDirectory), {
      withFileTypes: true,
    });
  } catch {
    // 目录被删掉时返回空索引，让站点退回默认壁纸而不是启动失败。
    return { folder: "/wallpapers", files: [] };
  }

  const files = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((file) => {
      const dotIndex = file.lastIndexOf(".");
      return (
        dotIndex > 0 &&
        wallpaperExtensions.has(file.slice(dotIndex).toLowerCase())
      );
    })
    .sort((left, right) => left.localeCompare(right, "zh-Hans-CN", { numeric: true }))
    .map((file) => ({
      file,
      url: `/wallpapers/${encodeURIComponent(file)}`,
      label: wallpaperLabel(file),
    }));

  return { folder: "/wallpapers", files };
}

/**
 * 壁纸目录索引集成。
 *
 * 开发服务器和构建开始前都会把 `public/wallpapers` 扫一遍写成 `index.json`，
 * 于是「把图片丢进文件夹」就是唯一的维护动作；内容没变化时不写盘，
 * 避免 Vite 监视到无意义的重载。
 */
export const wallpaperIndexPlugin = {
  name: "momona-wallpaper-index",
  hooks: {
    /**
     * 在配置阶段生成壁纸索引。
     *
     * @param {{logger: import('astro').AstroIntegrationLogger}} options - Astro 配置钩子的上下文。
     * @returns {void} 无返回值。
     */
    "astro:config:setup"({ logger }) {
      const serialized = `${JSON.stringify(scanWallpaperFolder(), null, 2)}\n`;
      let previous = "";
      try {
        previous = readFileSync(wallpaperIndexPath, "utf8");
      } catch {
        // 首次生成时没有旧文件，按内容不同处理即可。
      }
      if (previous === serialized) return;
      writeFileSync(wallpaperIndexPath, serialized);
      logger.info("已更新 public/wallpapers/index.json");
    },
  },
};
