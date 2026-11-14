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
