<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  backgroundBlurModeByPage,
  backgroundImageValue,
} from "../../data/background";
import { useWallpaper, type WallpaperLayer } from "../../composables/useWallpaper";
import { getAppPageFromPath } from "../../data/routes";
import {
  cloneLocalConfig,
  defaultSiteBackground,
  normalizeLocalConfig,
} from "../../data/localConfig";
import { applyThemeColor } from "../../lib/theme";
import { applyLocalConfigToSiteData } from "../../lib/dataSources/index";
import type {
  AppPage,
  BrewSection,
  LibraryFilter,
  LocalConfig,
  MusicSettings,
  SiteBackground,
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

const props = withDefaults(defineProps<Props>(), {
  editable: false,
});

const activeLibraryFilter = ref<LibraryFilter>("all");
const activeBrewSection = ref<BrewSection>("articles");

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
    friends: "友链",
    brew: "Brew 阅读",
    reports: "数据报告",
    settings: "本地设置",
  };
  return titles[currentPage.value];
});

/** 当前站点用于浏览器标题和页面图标的统一身份。 */
const siteTitle = computed(
  () => runtimeConfig.value.site.title.trim() || "Love on the page",
);

/** 将当前页面和站点标题组合为浏览器标题。 */
const browserTitle = computed(() =>
  currentPage.value === "home"
    ? siteTitle.value
    : `${pageTitle.value} · ${siteTitle.value}`,
);

/** 把本地配置中的页面身份同步到浏览器文档。 */
function syncDocumentHead(): void {
  document.title = browserTitle.value;
  const faviconUrl = runtimeConfig.value.site.favicon.trim() || "/favicon.svg";
  let favicon = document.querySelector<HTMLLinkElement>(
    "link[data-momona-favicon]",
  );
  if (!favicon) {
    favicon = document.createElement("link");
    favicon.rel = "icon";
    favicon.dataset.momonaFavicon = "true";
    document.head.appendChild(favicon);
  }
  favicon.href = faviconUrl;
}

/** 锁定设置页的文档滚动，让设置内容使用自己的滚动容器。 */
function syncSettingsViewportLock(): void {
  const isSettings = currentPage.value === "settings";
  document.documentElement.classList.toggle("is-settings-view", isSettings);
  document.body.classList.toggle("is-settings-view", isSettings);
}

const parallaxX = ref(0);
const parallaxY = ref(0);
const backgroundFocus = ref(0);
/**
 * 设置页里尚未保存的背景草稿。
 *
 * 背景是"调一下就能看到"的参数，走保存再预览会让人失去判断依据，
 * 所以由设置页把草稿推上来即时生效；离开设置页或保存后自动退回配置值。
 */
const previewBackground = ref<SiteBackground | null>(null);
const activeBackground = computed<SiteBackground>(
  () =>
    previewBackground.value ??
    runtimeConfig.value.site.background ??
    defaultSiteBackground(),
);
const backgroundBlurMode = computed(
  () => backgroundBlurModeByPage[currentPage.value],
);
/**
 * 壁纸切换引擎：随机、定时轮换与网络图源都走这里。
 *
 * 壳层只拿 `layers` 做渲染，两层交替淡入淡出，因此换图不会出现黑屏或重排。
 */
const wallpaper = useWallpaper(activeBackground);
const wallpaperLayers = wallpaper.layers;

/**
 * 生成某一层壁纸的行内样式。
 *
 * 视差、模糊、饱和度是全局参数，两层一致；只有绘制值跟着层走。
 *
 * @param layer - 待渲染的壁纸层。
 * @returns 可直接绑定的 CSS 变量集合。
 */
function backgroundStyleFor(layer: WallpaperLayer): Record<string, string> {
  const background = activeBackground.value;
  const style: Record<string, string> = {
    "--parallax-x": `${parallaxX.value.toFixed(2)}px`,
    "--parallax-y": `${parallaxY.value.toFixed(2)}px`,
    "--background-paint": backgroundImageValue(layer.image),
    "--background-blur": `${background.blur}px`,
    "--background-saturate": String(background.saturate),
  };

  // 只有跟随指针的模式需要行内焦点值；其余模式交由样式表里的统一取值决定。
  if (backgroundBlurMode.value === "pointer") {
    style["--background-focus"] = backgroundFocus.value.toFixed(3);
  }

  return style;
}
/** 遮罩写在覆盖层上，和壁纸分开，避免它跟着视差一起移动。 */
const overlayStyle = computed<Record<string, string>>(() => ({
  "--background-overlay": String(activeBackground.value.overlay),
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
  if (!activeBackground.value.parallax) {
    parallaxX.value = 0;
    parallaxY.value = 0;
    backgroundFocus.value = 0;
    return;
  }
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
  syncDocumentHead();
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
  syncDocumentHead();
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

/** 在 Brew 阅读页的二级内容区域之间切换。 */
function updateBrewSection(section: BrewSection): void {
  activeBrewSection.value = section;
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
function handleHomeConfigChange(nextConfig: LocalConfig, persist = true): void {
  if (!props.editable) return;
  const config = normalizeLocalConfig(cloneLocalConfig(nextConfig));
  runtimeConfig.value = config;
  runtimeSiteData.value = applyLocalConfigToSiteData(
    runtimeSiteData.value,
    config,
  );
  syncDocumentHead();
  if (persist) scheduleConfigSave(config);
}

/**
 * 将友链编辑结果合并到运行时配置和页面快照。
 *
 * @param friends - 最新友链列表。
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
  runtimeSiteData.value = applyLocalConfigToSiteData(
    runtimeSiteData.value,
    config,
  );
  syncDocumentHead();
  scheduleConfigSave(config);
}

watch(
  () => [
    currentPage.value,
    runtimeConfig.value.site.title,
    runtimeConfig.value.site.favicon,
  ],
  syncDocumentHead,
);

watch(currentPage, syncSettingsViewportLock);

/** 主题色变化时同步文档变量，静态首屏之外的客户端换色走这里。 */
watch(() => runtimeConfig.value.site.theme, applyThemeColor);

watch(currentPage, (page, previousPage) => {
  if (page === "brew" && previousPage !== "brew") {
    activeBrewSection.value = "articles";
  }
  // 离开设置页就撤掉背景草稿，避免未保存的观感被带到其他页面。
  if (page !== "settings") previewBackground.value = null;
});

/**
 * 接收设置页推上来的背景草稿。
 *
 * @param background - 待预览的背景参数；null 表示退回已保存的配置。
 * @returns 无返回值。
 */
function handleBackgroundPreview(background: SiteBackground | null): void {
  previewBackground.value = background;
}

/**
 * 设置页的"换一张"：立刻切一张壁纸，不需要保存配置。
 *
 * 用自定义事件而不是把引擎暴露给设置页，是因为设置页只拿到配置草稿、
 * 拿不到壁纸层；事件是最小的一根线。
 *
 * @returns 无返回值。
 */
function handleWallpaperShuffle(): void {
  void wallpaper.advance();
}

/**
 * 设置页重新扫描目录后，让切换引擎换成新的壁纸库。
 *
 * 否则新图片能出现在设置页的网格里，却不会参与随机与轮换，
 * 要刷新整页才"生效"——那种延迟很难被理解为缓存。
 *
 * @returns 无返回值。
 */
function handleWallpaperRefresh(): void {
  void wallpaper.refreshLibrary();
}

onMounted(() => {
  currentPage.value = getAppPageFromPath(window.location.pathname, props.page);
  syncDocumentHead();
  syncSettingsViewportLock();
  applyThemeColor(runtimeConfig.value.site.theme);

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
  window.addEventListener(
    "music-player-config-change",
    handleMusicConfigChange,
  );
  window.addEventListener("momona-wallpaper-shuffle", handleWallpaperShuffle);
  window.addEventListener("momona-wallpaper-refresh", handleWallpaperRefresh);
});

onBeforeUnmount(() => {
  document.documentElement.classList.remove("is-settings-view");
  document.body.classList.remove("is-settings-view");
  window.removeEventListener("pointermove", handlePointerMove);
  window.removeEventListener("pointerleave", handlePointerLeave);
  window.removeEventListener("scroll", handleScroll);
  window.removeEventListener("popstate", handlePopState);
  window.removeEventListener(
    "music-player-config-change",
    handleMusicConfigChange,
  );
  window.removeEventListener("momona-wallpaper-shuffle", handleWallpaperShuffle);
  window.removeEventListener("momona-wallpaper-refresh", handleWallpaperRefresh);
  if (animationFrame !== null) window.cancelAnimationFrame(animationFrame);
  if (configSaveTimer !== null) window.clearTimeout(configSaveTimer);
});
</script>

<template>
  <div
    class="app-frame"
    :data-page="currentPage"
    :data-background-blur-mode="backgroundBlurMode"
    :data-brew-section="currentPage === 'brew' ? activeBrewSection : undefined"
    @click.capture="handleAppClick"
  >
    <div
      v-for="layer in wallpaperLayers"
      :key="layer.key"
      class="app-background"
      :class="{ 'is-visible': layer.visible }"
      :style="backgroundStyleFor(layer)"
      aria-hidden="true"
    ></div>
    <div class="app-background-overlay" :style="overlayStyle" aria-hidden="true"></div>
    <NavigationRail
      :page="currentPage"
      :library-filter="activeLibraryFilter"
      :brew-section="activeBrewSection"
      @update:library-filter="updateLibraryFilter"
      @update:brew-section="updateBrewSection"
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
            :section="activeBrewSection"
            :editable="props.editable"
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
            @background-preview="handleBackgroundPreview"
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
  backdrop-filter: var(--glass-blur);
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
  color: var(--theme-strong);
}

@media (max-width: 820px) {
  .page-guide {
    right: 12px;
    bottom: 96px;
    width: min(282px, calc(100vw - 24px));
  }
}
</style>
