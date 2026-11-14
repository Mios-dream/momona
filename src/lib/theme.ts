import { normalizeThemeColor } from "../data/theme";

/**
 * 把主题色写入文档根节点。
 *
 * 全站强调色都通过 `--theme` 派生的变量取值，因此这里只改一个变量，
 * 导航、按钮、链接、进度条会在同一帧内一起换色。
 *
 * @param color - 配置文件或颜色输入框中的主题色。
 * @returns 无返回值；非浏览器环境直接跳过。
 */
export function applyThemeColor(color: string): void {
  if (typeof document === "undefined") return;
  document.documentElement.style.setProperty(
    "--theme",
    normalizeThemeColor(color),
  );
}
