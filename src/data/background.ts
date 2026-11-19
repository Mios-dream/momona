import type { AppPage } from "./types";

/**
 * 背景模糊的三种统一模式。
 *
 * - `static`：整体模糊，强度恒定，不随交互变化，适合内容密集的页面。
 * - `pointer`：跟随指针，指针上移时逐步变清晰，适合沉浸式展示页。
 * - `none`：不模糊，壁纸保持原始清晰度，适合以阅读为主的页面。
 */
export type BackgroundBlurMode = "static" | "pointer" | "none";

/**
 * 每个主页面只声明自己使用哪种模糊模式。
 *
 * 强度、色调与过渡都由 `global.css` 统一提供，
 * 页面不再各自覆写 filter，避免同类页面之间出现细微差异。
 */
export const backgroundBlurModeByPage: Record<AppPage, BackgroundBlurMode> = {
  home: "pointer",
  reports: "pointer",
  library: "static",
  friends: "static",
  brew: "static",
  settings: "static",
};

/**
 * 把壁纸值转成合法的 `background-image` 值。
 *
 * 允许三种写法：空串（只用底色）、渐变、以及图片地址。图片地址不强制写
 * `url()`，因为设置页的输入框里让用户敲 `url("…")` 是没必要的负担。
 *
 * 随机与定时轮换最终也走这里：候选池里的每一项都会被翻译成同一个绘制值，
 * 所以壁纸层不需要区分"固定图"和"轮换图"。
 *
 * @param image - 配置文件里保存的壁纸值。
 * @returns 可直接写入 CSS 的 `background-image` 值。
 */
export function backgroundImageValue(image: string): string {
  const value = image.trim();
  if (!value) return "none";
  if (
    value.startsWith("url(") ||
    value.startsWith("linear-gradient") ||
    value.startsWith("radial-gradient") ||
    value.startsWith("conic-gradient")
  ) {
    return value;
  }
  return `url("${value}")`;
}
