import type { AppPage } from "./types";

/**
 * 应用内页面的静态路径映射。
 *
 * 页面依旧由 Astro 生成独立的静态 HTML；映射只负责在已经打开的应用壳层中
 * 解析地址栏，从而让站内 Tab 切换不必重新请求文档。
 */
const appPageByPath: Record<string, AppPage> = {
  "/": "home",
  "/library": "library",
  "/friends": "friends",
  "/brew": "brew",
  "/reports": "reports",
  "/settings": "settings",
};

/** 根据浏览器路径解析当前应用页面。 */
export const getAppPageFromPath = (
  pathname: string,
  fallback: AppPage = "home",
): AppPage => {
  const normalizedPath =
    pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
  return appPageByPath[normalizedPath] ?? fallback;
};

/** 页面切换后同步浏览器标签页标题。 */
export const appPageTitles: Record<AppPage, string> = {
  home: "Love on the page · Momona",
  library: "资料库 · Love on the page",
  friends: "友联 · Love on the page",
  brew: "Brew 阅读 · Love on the page",
  reports: "数据报告 · Love on the page",
  settings: "本地设置 · Momona",
};
