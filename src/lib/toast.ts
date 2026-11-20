import { reactive } from "vue";

export type ToastTone = "success" | "error" | "neutral";

/** 通知来源，类似手机通知中的 App 类别。 */
export type NotificationCategory =
  | "system"
  | "home"
  | "weather"
  | "music"
  | "game"
  | "sync"
  | "friends";

export interface NotificationItem {
  id: number;
  message: string;
  tone: ToastTone;
  category: NotificationCategory;
  /** 通知到达时间戳（毫秒）。 */
  time: number;
}

/** 通知中心最多保留的条数，更早的通知会被丢弃。 */
const MAX_NOTIFICATIONS = 20;

/**
 * 全站通知中心：任何组件都用 showToast() 发通知。
 *
 * - items 是最近通知的历史列表（新的在前），供控制栏「通知」Tab 展示；
 * - unread 是未读数量，打开通知 Tab 时清零；
 * - latest 是最新到达的一条，控制栏收起时用它顶替一言/天气做横幅展示，
 *   横幅展示 duration 毫秒后自动让位给常规轮换内容。
 */
export const notificationState = reactive<{
  items: NotificationItem[];
  unread: number;
  latest: NotificationItem | null;
}>({
  items: [],
  unread: 0,
  latest: null,
});

let seq = 0;
let bannerTimer: number | null = null;

/** 横幅展示时长；错误信息可以传更久。 */
const DEFAULT_DURATION = 4000;

/**
 * 发出一条通知：进入历史列表、累加未读，并把收起状态的控制栏横幅切到这条。
 *
 * @param message - 通知正文。
 * @param tone - 通知级别，决定状态颜色。
 * @param duration - 横幅展示时长，毫秒。
 * @param category - 通知来源类别，决定图标与来源名称。
 * @returns 新通知的 id。
 */
export function showToast(
  message: string,
  tone: ToastTone = "neutral",
  duration = DEFAULT_DURATION,
  category: NotificationCategory = "system",
): number {
  const visibleDuration = Math.max(duration, 1200);
  const item: NotificationItem = {
    id: ++seq,
    message,
    tone,
    category,
    time: Date.now(),
  };
  notificationState.items.unshift(item);
  if (notificationState.items.length > MAX_NOTIFICATIONS) {
    notificationState.items.length = MAX_NOTIFICATIONS;
  }
  notificationState.unread += 1;
  notificationState.latest = item;

  if (bannerTimer !== null) window.clearTimeout(bannerTimer);
  bannerTimer = window.setTimeout(() => {
    if (notificationState.latest?.id === item.id) {
      notificationState.latest = null;
    }
    bannerTimer = null;
  }, visibleDuration);

  return item.id;
}

/** 全部通知标记为已读（打开通知 Tab 时调用）。 */
export function markNotificationsRead(): void {
  notificationState.unread = 0;
}

/** 清空通知历史。 */
export function clearNotifications(): void {
  notificationState.items = [];
  notificationState.unread = 0;
}
