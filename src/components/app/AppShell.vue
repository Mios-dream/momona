<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { appPageTitles, getAppPageFromPath } from "../../data/routes";
import { cloneLocalConfig, normalizeLocalConfig } from "../../data/localConfig";
import { applyLocalConfigToSiteData } from "../../lib/dataSources/index";
import type {
  AppPage,
  LibraryFilter,
  LocalConfig,
  MusicSettings,
  SiteData,
} from "../../data/types";
import BrewPage from "../brew/BrewPage.vue";
import FriendsPage from "../friends/FriendsPage.vue";
import HomePage from "../home/HomePage.vue";
import LibraryPage from "../library/LibraryPage.vue";
import ReportsPage from "../reports/ReportsPage.vue";
import SettingsPage from "../settings/SettingsPage.vue";
import NavigationRail from "./NavigationRail.vue";
import MusicPlayerHost from "../music/MusicPlayerHost.vue";
import AppControlPanel from "./AppControlPanel.vue";

interface Props {
  /** 当前静态路由对应的页面。 */
  page: AppPage;
  /** Astro 在构建阶段生成的公开页面数据。 */
  siteData: SiteData;
  /** Astro 在构建阶段读取的本地配置。 */
  localConfig: LocalConfig;
  /** 本地开发时开启首页编辑器；生产构建不会注入。 */
  editable?: boolean;
}

const props = withDefaults(defineProps<Props>(), { editable: false });

const activeLibraryFilter = ref<LibraryFilter>("all");

/**
 * 应用壳层内的当前页面。Astro 首次渲染提供初始值，之后由地址栏和 History API
 * 驱动，这样所有静态页面仍可直接访问，同时站内切换不会重新加载文档。
 */
const currentPage = ref<AppPage>(props.page);
const runtimeSiteData = ref<SiteData>(props.siteData);
const runtimeConfig = ref<LocalConfig>(cloneLocalConfig(props.localConfig));
let configSaveTimer: number | null = null;
let pendingConfig: LocalConfig | null = null;

/**
 * 当前页面的中文上下文标题。
 */
const pageTitle = computed(() => {
  const titles: Record<AppPage, string> = {
    home: "Love on the page",
    library: "资料库",
    friends: "友联",
    brew: "Brew 阅读",
    reports: "数据报告",
    settings: "本地设置",
  };
  return titles[currentPage.value];
});

const parallaxX = ref(0);
const parallaxY = ref(0);
const backgroundFocus = ref(0);
const backgroundStyle = computed(() => ({
  "--parallax-x": `${parallaxX.value.toFixed(2)}px`,
  "--parallax-y": `${parallaxY.value.toFixed(2)}px`,
  "--background-focus": backgroundFocus.value.toFixed(3),
}));

let animationFrame: number | null = null;
let pointerOffsetX = 0;
let pointerOffsetY = 0;
let scrollOffset = 0;

/**
 * 根据最近一次指针和滚动位置更新背景视差值。
 *
 * @returns 无返回值；更新结果写入响应式背景状态。
 */
function updateParallax(): void {
  animationFrame = null;
  parallaxX.value = pointerOffsetX * 10;
  parallaxY.value = pointerOffsetY * 8 - Math.min(scrollOffset, 720) * 0.025;
  // 鼠标从屏幕底部上移时逐步清晰，进入屏幕上方 1/5 后完全取消模糊。
  backgroundFocus.value = Math.max(
    0,
    Math.min(1, (0.5 - pointerOffsetY) * 0.9),
  );
}

/**
 * 请求下一帧执行背景视差更新，避免高频事件重复排队。
 *
 * @returns 无返回值。
 */
function requestParallaxUpdate(): void {
  if (animationFrame !== null) return;
  animationFrame = window.requestAnimationFrame(updateParallax);
}

/**
 * 通过鼠标位置和页面滚动量轻微移动壁纸，避免内容层跟着晃动。
 *
 * @param event - 鼠标或指针移动事件。
 * @returns 无返回值；触摸指针会被直接忽略。
 */
function handlePointerMove(event: PointerEvent): void {
  if (event.pointerType === "touch") return;
  pointerOffsetX = event.clientX / window.innerWidth - 0.5;
  pointerOffsetY = event.clientY / window.innerHeight - 0.5;
  requestParallaxUpdate();
}

/**
 * 指针离开窗口时恢复背景中心位置。
 *
 * @returns 无返回值。
 */
function handlePointerLeave(): void {
  pointerOffsetX = 0;
  pointerOffsetY = 0;
  requestParallaxUpdate();
}

/**
 * 记录页面滚动量并请求背景视差更新。
 *
 * @returns 无返回值。
 */
function handleScroll(): void {
  scrollOffset = window.scrollY;
  requestParallaxUpdate();
}

/**
 * 更新主体、活动 Tab 和地址栏，而不触发浏览器文档导航。
 *
 * @param url - 目标应用内地址。
 * @param replace - 是否使用 replaceState 替换当前历史记录。
 * @returns 无返回值。
 */
function navigateWithinApp(url: URL, replace = false): void {
  const nextPage = getAppPageFromPath(url.pathname, currentPage.value);
  const nextAddress = `${url.pathname}${url.search}${url.hash}`;
  const currentAddress = `${window.location.pathname}${window.location.search}${window.location.hash}`;

  if (nextAddress !== currentAddress) {
    const method = replace ? "replaceState" : "pushState";
    window.history[method]({}, "", nextAddress);
  }

  currentPage.value = nextPage;
  document.title = appPageTitles[nextPage];
  window.scrollTo({ top: 0, behavior: "auto" });
}

/**
 * 捕获应用内链接，外部链接、修饰键和新窗口行为保持浏览器默认逻辑。
 *
 * @param event - 页面点击事件。
 * @returns 无返回值。
 */
function handleAppClick(event: MouseEvent): void {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  ) {
    return;
  }

  const target = event.target;
  if (!(target instanceof Element)) return;

  const anchor = target.closest<HTMLAnchorElement>("a[href]");
  if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download"))
    return;

  const url = new URL(anchor.href, window.location.href);
  if (url.origin !== window.location.origin) return;
  if (
    !["/", "/library", "/friends", "/brew", "/reports", "/settings"].includes(
      url.pathname.replace(/\/+$/, "") || "/",
    )
  )
    return;

  event.preventDefault();
  navigateWithinApp(url);
}

/**
 * 根据浏览器历史记录变化刷新当前页面和文档标题。
 *
 * @returns 无返回值。
 */
function handlePopState(): void {
  currentPage.value = getAppPageFromPath(
    window.location.pathname,
    currentPage.value,
  );
  document.title = appPageTitles[currentPage.value];
  window.scrollTo({ top: 0, behavior: "auto" });
}

/**
 * 在常驻导航外壳和资料库画布之间同步筛选分类。
 *
 * @param filter - 当前资料库筛选类型。
 * @returns 无返回值。
 */
function updateLibraryFilter(filter: LibraryFilter): void {
  activeLibraryFilter.value = filter;
}

/**
 * 延迟保存编辑后的本地配置，合并短时间内连续变更。
 *
 * @param config - 需要保存的规范化本地配置。
 * @returns 无返回值；保存任务在定时器中异步执行。
 */
function scheduleConfigSave(config: LocalConfig): void {
  if (!props.editable) return;
  pendingConfig = cloneLocalConfig(config);
  if (configSaveTimer !== null) window.clearTimeout(configSaveTimer);
  configSaveTimer = window.setTimeout(async () => {
    const nextConfig = pendingConfig;
    pendingConfig = null;
    configSaveTimer = null;
    if (!nextConfig) return;
    try {
      const response = await fetch("/__momona/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config: nextConfig }),
      });
      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as {
          message?: string;
        } | null;
        throw new Error(payload?.message || "本地配置文件写入失败");
      }
    } catch (error) {
      console.error("Momona 本地配置保存失败", error);
    }
  }, 240);
}

/**
 * 接收首页编辑器的配置变更，并刷新应用壳层运行时数据。
 *
 * @param nextConfig - 首页编辑器返回的本地配置。
 * @param persist - 是否将配置延迟写入本地开发接口。
 * @returns 无返回值；非编辑模式下忽略变更。
 */
function handleHomeConfigChange(
  nextConfig: LocalConfig,
  persist = true,
): void {
  if (!props.editable) return;
  const config = normalizeLocalConfig(cloneLocalConfig(nextConfig));
  runtimeConfig.value = config;
  runtimeSiteData.value = applyLocalConfigToSiteData(
    runtimeSiteData.value,
    config,
  );
  if (persist) scheduleConfigSave(config);
}

/**
 * 将友联编辑结果合并到运行时配置和页面快照。
 *
 * @param friends - 最新友联列表。
 * @returns 无返回值。
 */
function handleFriendsChange(friends: SiteData["friends"]): void {
  const config = normalizeLocalConfig({
    ...runtimeConfig.value,
    friends,
  });
  runtimeConfig.value = config;
  runtimeSiteData.value = applyLocalConfigToSiteData(
    runtimeSiteData.value,
    config,
  );
}

/**
 * 接收播放器选曲后的配置变更，并刷新运行时音乐投影。
 *
 * @param event - 携带音乐设置的自定义事件。
 * @returns 无返回值；无效事件会被忽略。
 */
function handleMusicConfigChange(event: Event): void {
  if (!props.editable) return;
  const music = (event as CustomEvent<MusicSettings>).detail;
  if (!music || typeof music !== "object") return;
  const config = normalizeLocalConfig({
    ...runtimeConfig.value,
    music: {
      ...runtimeConfig.value.music,
      ...music,
      enabled: true,
    },
  });
  runtimeConfig.value = config;
  runtimeSiteData.value = applyLocalConfigToSiteData(runtimeSiteData.value, config);
  scheduleConfigSave(config);
}

onMounted(() => {
  currentPage.value = getAppPageFromPath(window.location.pathname, props.page);

  const prefersReducedMotion = window.matchMedia(
    "(prefers-reduced-motion: reduce)",
  ).matches;
  if (!prefersReducedMotion) {
    window.addEventListener("pointermove", handlePointerMove, {
      passive: true,
    });
    window.addEventListener("pointerleave", handlePointerLeave, {
      passive: true,
    });
    window.addEventListener("scroll", handleScroll, { passive: true });
  }
  window.addEventListener("popstate", handlePopState);
  window.addEventListener("music-player-config-change", handleMusicConfigChange);
});

onBeforeUnmount(() => {
  window.removeEventListener("pointermove", handlePointerMove);
  window.removeEventListener("pointerleave", handlePointerLeave);
  window.removeEventListener("scroll", handleScroll);
  window.removeEventListener("popstate", handlePopState);
  window.removeEventListener("music-player-config-change", handleMusicConfigChange);
  if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
  if (configSaveTimer !== null) window.clearTimeout(configSaveTimer);
});
</script>

<template>
  <div
    class="app-frame"
    :data-page="currentPage"
    @click.capture="handleAppClick"
  >
    <div
      class="app-background"
      :style="backgroundStyle"
      aria-hidden="true"
    ></div>
    <div class="app-background-overlay" aria-hidden="true"></div>
    <NavigationRail
      :page="currentPage"
      :library-filter="activeLibraryFilter"
      @update:library-filter="updateLibraryFilter"
    />
    <MusicPlayerHost
      :track="runtimeSiteData.music"
      :catalog="runtimeSiteData.musicCatalog"
      :editable="props.editable"
    />
    <AppControlPanel
      :track="runtimeSiteData.music"
      :catalog="runtimeSiteData.musicCatalog"
      :editable="props.editable"
    />

    <div class="app-shell">
      <main class="page-view" :aria-label="pageTitle">
        <Transition name="page-transition" mode="out-in">
          <HomePage
            v-if="currentPage === 'home'"
            key="home"
            :site-data="runtimeSiteData"
            :editable="props.editable"
            :local-config="runtimeConfig"
            @config-change="handleHomeConfigChange"
          />
          <LibraryPage
            v-else-if="currentPage === 'library'"
            key="library"
            :active-filter="activeLibraryFilter"
            :tiles="runtimeSiteData.libraryTiles"
          />
          <FriendsPage
            v-else-if="currentPage === 'friends'"
            key="friends"
            :friends="runtimeSiteData.friends"
            :editable="props.editable"
            @friends-change="handleFriendsChange"
          />
          <BrewPage
            v-else-if="currentPage === 'brew'"
            key="brew"
            :sources="runtimeSiteData.brewSources"
          />
          <ReportsPage
            v-else-if="currentPage === 'reports'"
            key="reports"
            :platforms="runtimeSiteData.reportPlatforms"
          />
          <SettingsPage
            v-else-if="currentPage === 'settings'"
            key="settings"
            :site-data="runtimeSiteData"
            :local-config="runtimeConfig"
            @config-change="handleHomeConfigChange"
          />
        </Transition>
      </main>
    </div>
  </div>
</template>

<style scoped>
.page-guide {
  position: fixed;
  z-index: 50;
  right: 12px;
  bottom: 36px;
  display: grid;
  width: 284px;
  min-height: 129px;
  padding: 13px 14px 13px 14px;
  grid-template-columns: 48px 1fr 46px;
  align-items: center;
  gap: 10px;
  border: 1px solid rgba(255, 255, 255, 0.9);
  border-radius: 17px;
  background: rgba(255, 255, 255, 0.76);
  box-shadow: 0 20px 42px rgba(54, 45, 106, 0.18);
  backdrop-filter: blur(22px) saturate(145%);
}

.page-guide > img {
  align-self: start;
  width: 44px;
  height: 44px;
  margin-top: 4px;
  border: 2px solid rgba(255, 255, 255, 0.86);
  border-radius: 14px;
  object-fit: cover;
}

.page-guide-copy {
  min-width: 0;
}

.page-guide-copy h2 {
  overflow: hidden;
  margin: 0 0 3px;
  color: var(--ink);
  font-size: 0.79rem;
  font-weight: 780;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.page-guide-copy p {
  margin: 0;
  color: var(--muted-strong);
  font-size: 0.62rem;
  line-height: 1.4;
}

.page-guide-close {
  position: absolute;
  top: 10px;
  right: 9px;
  display: grid;
  width: 24px;
  height: 24px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 50%;
  color: var(--muted-strong);
  background: transparent;
}

.page-guide-start {
  display: flex;
  width: 46px;
  height: 46px;
  padding: 0;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.84);
  border-radius: 50%;
  color: #65738c;
  background: rgba(239, 243, 251, 0.8);
  box-shadow: 0 8px 15px rgba(54, 45, 106, 0.08);
}

.page-guide-start:hover,
.page-guide-close:hover {
  color: var(--purple-deep);
}

@media (max-width: 820px) {
  .page-guide {
    right: 12px;
    bottom: 96px;
    width: min(282px, calc(100vw - 24px));
  }
}
</style>
