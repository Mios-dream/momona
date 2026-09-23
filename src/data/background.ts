import type { AppPage } from "./types";

/** 背景模糊的响应方式。 */
export type BackgroundBlurMode = "fixed" | "pointer";

/** 每个主页面选择自己的背景模糊方式。 */
export const backgroundBlurModeByPage: Record<AppPage, BackgroundBlurMode> = {
  home: "pointer",
  library: "fixed",
  friends: "fixed",
  brew: "fixed",
  reports: "pointer",
  settings: "fixed",
};
