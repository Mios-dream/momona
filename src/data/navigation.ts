import type { NavigationItem } from "./types";

/**
 * 目标站点左侧 Tab 的静态配置。
 */
const developmentNavigationItems: NavigationItem[] = import.meta.env.DEV
  ? [
      {
        id: "settings",
        label: "设置",
        description: "本地配置与同步",
        path: "/settings",
        icon: "settings",
      },
    ]
  : [];

export const navigationItems: NavigationItem[] = [
  {
    id: "home",
    label: "主页",
    description: "Love on the page",
    path: "/",
    icon: "home",
  },
  {
    id: "library",
    label: "资料库",
    description: "收藏与媒体画布",
    path: "/library",
    icon: "library",
  },
  {
    id: "friends",
    label: "友联",
    description: "我的朋友们",
    path: "/friends",
    icon: "link",
  },
  {
    id: "brew",
    label: "Brew 阅读",
    description: "订阅源与文章",
    path: "/brew",
    icon: "brew",
  },
  {
    id: "reports",
    label: "数据报告",
    description: "个人数据报告",
    path: "/reports",
    icon: "report",
  },
  ...developmentNavigationItems,
];
