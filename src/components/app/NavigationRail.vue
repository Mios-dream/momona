<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from "vue";
import { navigationItems } from "../../data/navigation";
import type {
  AppPage,
  BrewSection,
  IconName,
  LibraryFilter,
} from "../../data/types";
import IconGlyph from "./IconGlyph.vue";

interface Props {
  /** 当前正在显示的页面。 */
  page: AppPage;
  /** 资料库筛选栏当前选中的分类。 */
  libraryFilter: LibraryFilter;
  /** Brew 阅读页当前选中的二级内容区域。 */
  brewSection: BrewSection;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  /** 切换资料库筛选分类。 */
  "update:libraryFilter": [filter: LibraryFilter];
  /** 切换 Brew 阅读页的二级内容区域。 */
  "update:brewSection": [section: BrewSection];
}>();

interface FilterItem {
  id: LibraryFilter;
  label: string;
  icon: IconName;
}

const filterItems: FilterItem[] = [
  { id: "all", label: "显示全部内容", icon: "layoutGrid" },
  { id: "game", label: "显示游戏", icon: "game" },
  { id: "video", label: "显示视频", icon: "video" },
  { id: "music", label: "显示音乐", icon: "music" },
  { id: "anime", label: "显示追番", icon: "bookMarked" },
  { id: "book", label: "显示书籍", icon: "book" },
];

/**
 * 判断页面是否拥有二级导航。
 *
 * @param page - 当前应用页面。
 * @returns 页面属于资料库或 Brew 时返回 true。
 */
function isSubmenuPage(page: AppPage): boolean {
  return page === "library" || page === "brew";
}
const isSubmenuOpen = ref(isSubmenuPage(props.page));

const navigationMode = computed<"app" | "library" | "brew">(() => {
  if (isSubmenuOpen.value && props.page === "library") return "library";
  if (isSubmenuOpen.value && props.page === "brew") return "brew";
  return "app";
});

const railLabel = computed(() => {
  if (navigationMode.value === "library") return "资料库筛选";
  if (navigationMode.value === "brew") return "Brew 导航";
  return "主导航";
});

const railElement = ref<HTMLElement | null>(null);
/**
 * 过渡期间临时锁定的导航尺寸（像素）。
 *
 * 移动端的宽度是 max-content，计算值是关键字而不是长度，浏览器认为它
 * 全程没有变化，CSS 过渡不会触发。所以切换导航模式时要先把实测像素宽高
 * 写进样式，再在下一帧改成目标像素值，过渡才有可插值的起终点。
 * 值为 null 表示尺寸交回内容自己决定，同时也代表「当前不在过渡中」。
 */
const railSize = ref<{ width: number; height: number } | null>(null);

let sizeResetTimer: number | null = null;

const railStyle = computed(() =>
  railSize.value === null
    ? undefined
    : {
        width: `${railSize.value.width}px`,
        height: `${railSize.value.height}px`,
      },
);

/**
 * 把计算样式里的尺寸文本转换为像素值。
 *
 * @param value - 浏览器计算样式中的尺寸文本。
 * @returns 解析失败时按 0 处理。
 */
function toPixels(value: string): number {
  return Number.parseFloat(value) || 0;
}

/**
 * 读取元素内边距与边框在宽、高两个方向上占用的尺寸。
 *
 * 不同导航模式的内边距不一样，换算目标宽高时要把它加回去。
 *
 * @param element - 需要读取样式的导航元素。
 * @returns 两个轴上的内边距与边框之和。
 */
function readRailBoxExtra(element: HTMLElement): { x: number; y: number } {
  const styles = window.getComputedStyle(element);
  return {
    x:
      toPixels(styles.paddingLeft) +
      toPixels(styles.paddingRight) +
      toPixels(styles.borderLeftWidth) +
      toPixels(styles.borderRightWidth),
    y:
      toPixels(styles.paddingTop) +
      toPixels(styles.paddingBottom) +
      toPixels(styles.borderTopWidth) +
      toPixels(styles.borderBottomWidth),
  };
}

/**
 * 取消尺寸过渡的兜底定时器。
 *
 * @returns 无返回值。
 */
function clearSizeTimer(): void {
  if (sizeResetTimer === null) return;
  window.clearTimeout(sizeResetTimer);
  sizeResetTimer = null;
}

/**
 * 释放导航尺寸锁定，恢复由内容自然决定的宽高。
 *
 * @returns 无返回值。
 */
function releaseRailSize(): void {
  railSize.value = null;
  clearSizeTimer();
}

/**
 * 在导航内容切换前锁定当前尺寸，供过渡动画使用。
 *
 * @returns 无返回值；没有挂载导航元素时直接结束。
 */
function lockRailSize(): void {
  const rail = railElement.value;
  if (!rail) return;

  clearSizeTimer();

  const rect = rail.getBoundingClientRect();
  railSize.value = {
    width: Math.ceil(rect.width),
    height: Math.ceil(rect.height),
  };
}

watch(
  () => props.page,
  (page, previousPage) => {
    if (page !== previousPage) isSubmenuOpen.value = isSubmenuPage(page);
  },
  { flush: "sync" },
);

watch(
  navigationMode,
  () => {
    lockRailSize();
  },
  { flush: "sync" },
);

/**
 * 用进入中的按钮组测量目标尺寸，并让常驻胶囊平滑过渡到新的宽高。
 *
 * @param enteringElement - 正在进入导航的按钮组元素。
 * @returns 无返回值。
 */
async function animateRailSize(enteringElement: Element): Promise<void> {
  const rail = railElement.value;
  if (!(enteringElement instanceof HTMLElement) || !rail) return;

  clearSizeTimer();

  const currentRect = rail.getBoundingClientRect();
  /*
   * 资料库按钮组自带 max-width: 100%，胶囊还窄的时候它会被压成旧宽度，
   * 目标值等于当前值，宽度过渡就整个跳过了（切到资料库时胶囊直接变宽）。
   * 测量前临时放开上限、量完立刻还原，两个动作在同一帧内完成，不会产生
   * 中间态的绘制帧。
   */
  const constrainedMaxWidth = enteringElement.style.maxWidth;
  enteringElement.style.maxWidth = "none";
  const targetRect = enteringElement.getBoundingClientRect();
  enteringElement.style.maxWidth = constrainedMaxWidth;
  const extra = readRailBoxExtra(rail);

  const currentWidth = Math.ceil(currentRect.width);
  const currentHeight = Math.ceil(currentRect.height);
  const targetWidth = Math.ceil(targetRect.width + extra.x);
  const targetHeight = Math.ceil(targetRect.height + extra.y);

  const widthChanged = Math.abs(currentWidth - targetWidth) >= 1;
  const heightChanged = Math.abs(currentHeight - targetHeight) >= 1;

  if (!widthChanged && !heightChanged) {
    releaseRailSize();
    return;
  }

  /*
   * 先把当前像素尺寸落进样式并强制回流，让浏览器记住过渡起点，
   * 再换成目标尺寸，宽高才会真的从旧值插值过去。
   *
   * 这里不用 requestAnimationFrame：标签页在后台或帧率被压低时，它可能
   * 被推迟到兜底定时器之后才执行，目标值等于没写进去，动画整个丢失。
   * nextTick 只是等 Vue 打完补丁，不受帧率影响。
   */
  railSize.value = { width: currentWidth, height: currentHeight };
  await nextTick();
  if (railElement.value !== rail) return;
  void rail.offsetWidth;

  railSize.value = { width: targetWidth, height: targetHeight };
  sizeResetTimer = window.setTimeout(releaseRailSize, 800);
}

/**
 * 在导航尺寸过渡结束后清理临时宽高。
 *
 * @param event - CSS 过渡结束事件。
 * @returns 无返回值。
 */
function handleRailTransitionEnd(event: TransitionEvent): void {
  if (event.target !== event.currentTarget) return;
  if (event.propertyName !== "height" && event.propertyName !== "width")
    return;
  releaseRailSize();
}

onBeforeUnmount(() => {
  clearSizeTimer();
});

/**
 * 切换资料库的静态分类筛选。
 *
 * @param filter - 需要切换到的资料库分类。
 * @returns 无返回值；分类由父组件统一维护。
 */
function selectLibraryFilter(filter: LibraryFilter): void {
  emit("update:libraryFilter", filter);
}

/** 切换 Brew 阅读页的二级内容区域。 */
function selectBrewSection(section: BrewSection): void {
  emit("update:brewSection", section);
}

/**
 * 返回当前页面的一级导航，同时保留页面地址和主体内容。
 *
 * @returns 无返回值；只关闭二级导航视图。
 */
function showPrimaryNavigation(): void {
  isSubmenuOpen.value = false;
}

/**
 * 从一级导航重新打开资料库或 Brew 的二级菜单。
 *
 * @param page - 需要打开二级导航的目标页面。
 * @returns 无返回值；非二级导航页面会被忽略。
 */
function openSubmenuFor(page: AppPage): void {
  if (isSubmenuPage(page)) isSubmenuOpen.value = true;
}
</script>

<template>
  <aside
    ref="railElement"
    class="navigation-rail"
    :class="[
      `navigation-rail--${navigationMode}`,
      navigationMode === 'app' && !isSubmenuPage(props.page)
        ? `navigation-rail--${props.page}`
        : '',
      { 'is-resizing': railSize !== null },
    ]"
    :style="railStyle"
    :aria-label="railLabel"
    @transitionend="handleRailTransitionEnd"
  >
    <div class="rail-content-stage">
      <Transition name="rail-content" @enter="animateRailSize">
        <div
          v-if="navigationMode === 'library'"
          key="library"
          class="rail-content rail-content-library"
        >
          <button
            class="rail-button rail-filter-back"
            type="button"
            aria-label="返回一级导航"
            @click="showPrimaryNavigation"
          >
            <IconGlyph name="arrowLeft" :size="21" />
          </button>
          <span class="rail-filter-divider" aria-hidden="true"></span>
          <button
            v-for="item in filterItems"
            :key="item.id"
            class="rail-button rail-filter-button"
            :class="{ 'is-active': props.libraryFilter === item.id }"
            type="button"
            :aria-label="item.label"
            :aria-pressed="props.libraryFilter === item.id"
            @click="selectLibraryFilter(item.id)"
          >
            <IconGlyph :name="item.icon" :size="20" />
          </button>
        </div>

        <div
          v-else-if="navigationMode === 'brew'"
          key="brew"
          class="rail-content rail-content-brew"
        >
          <button
            class="rail-button brew-nav-button brew-nav-back"
            type="button"
            aria-label="返回一级导航"
            title="返回一级导航"
            @click="showPrimaryNavigation"
          >
            <IconGlyph name="arrowLeft" :size="18" />
          </button>
          <div class="rail-brew-submenu">
            <button
              class="rail-button brew-nav-button"
              :class="{ 'is-active': props.brewSection === 'articles' }"
              type="button"
              aria-label="我的文章"
              title="我的文章"
              @click="selectBrewSection('articles')"
            >
              <IconGlyph name="bookMarked" :size="17" />
            </button>
            <button
              class="rail-button brew-nav-button"
              :class="{ 'is-active': props.brewSection === 'feeds' }"
              type="button"
              aria-label="全部订阅源"
              title="全部订阅源"
              @click="selectBrewSection('feeds')"
            >
              <IconGlyph name="rss" :size="17" />
            </button>
            <button
              class="rail-button brew-nav-button"
              :class="{ 'is-active': props.brewSection === 'favorites' }"
              type="button"
              aria-label="收藏"
              title="收藏"
              @click="selectBrewSection('favorites')"
            >
              <IconGlyph name="star" :size="17" />
            </button>
          </div>
        </div>

        <nav
          v-else
          key="app"
          class="rail-content rail-content-app"
          aria-label="主导航"
        >
          <a
            v-for="item in navigationItems"
            :key="item.id"
            class="rail-button rail-link"
            :class="{ 'is-active': props.page === item.id }"
            :href="item.path"
            data-app-route
            :aria-current="props.page === item.id ? 'page' : undefined"
            :aria-label="`${item.label}，${item.description}`"
            @click="openSubmenuFor(item.id)"
          >
            <span class="rail-link-icon"
              ><IconGlyph :name="item.icon" :size="19"
            /></span>
            <span class="rail-link-copy">
              <strong>{{ item.label }}</strong>
              <small>{{ item.description }}</small>
            </span>
          </a>
        </nav>
      </Transition>
    </div>
  </aside>
</template>

<style scoped>
.navigation-rail {
  position: fixed;
  z-index: 20;
  top: 50%;
  left: 24px;
  display: flex;
  width: 65px;
  padding: 9px;
  align-items: flex-start;
  border: 1px solid var(--glass-border);
  border-radius: 26px;
  background: var(--glass);
  box-shadow: var(--glass-shadow);
  backdrop-filter: var(--glass-blur);
  transform: translateY(-50%);
  /*
   * 宽度和高度同一曲线、同一时长，移动端切换导航模式时胶囊整体均匀伸缩，
   * 不会出现「高度先到位、宽度还在追」的错位感。
   *
   * 内边距刻意不参与过渡：它只差 2~3px，看不出来；但一旦让它渐变，
   * 切换瞬间读到的 padding 就是插值中间值，目标宽高会算错，只能再挂一个
   * 隐藏探针去取真实值。去掉过渡后直接读计算样式即可。
   */
  transition:
    height 0.46s cubic-bezier(0.22, 1, 0.36, 1),
    width 0.46s cubic-bezier(0.22, 1, 0.36, 1),
    border-radius 0.34s ease;
}

/* 尺寸过渡期间裁掉溢出的内容，避免新旧按钮组同时露在胶囊外面。 */
.navigation-rail.is-resizing {
  overflow: hidden;
}

.navigation-rail--library,
.navigation-rail--brew {
  padding-block: 11px;
}

.rail-content-stage {
  position: relative;
  display: flex;
  width: 100%;
  align-items: flex-start;
  justify-content: center;
}

/*
 * 只有进场的那一组参与舞台尺寸计算；退场的一组在下面改成绝对定位叠上来，
 * 所以这里保持自身宽度（max-content / 100%），不让它被拉伸或压缩。
 *
 * 这一点很重要：以前两组都按容器宽度排版，切换时旧的一组会把这一行撑得
 * 比胶囊还宽，新内容在「旧宽度」里居中于是整体右移，最右一格被 overflow
 * 裁掉，动画结束才跳回原位。
 */
.rail-content-stage > * {
  flex: 0 0 auto;
}

.rail-content {
  display: flex;
  width: 100%;
  align-items: center;
  flex-direction: column;
}

.rail-content-app,
.rail-content-library {
  gap: 12px;
}

.rail-content-brew {
  gap: 0;
}

.rail-button {
  position: relative;
  display: flex;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  padding: 0;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 14px;
  color: rgba(43, 50, 79, 0.65);
  background: transparent;
  transition:
    color 0.34s ease,
    background 0.34s ease,
    opacity 0.4s ease,
    transform 0.46s cubic-bezier(0.22, 1, 0.36, 1);
}

.rail-button:hover,
.rail-button.is-active {
  color: var(--theme);
  background: rgba(255, 255, 255, 0.72);
  transform: translateY(-2px);
}

.rail-filter-divider {
  width: 34px;
  height: 1px;
  flex: 0 0 1px;
  margin: 1px 0;
  background: rgba(111, 121, 146, 0.16);
}

.rail-filter-back {
  color: rgba(61, 75, 98, 0.68);
}

.rail-filter-button.is-active {
  color: var(--theme);
  background: color-mix(in srgb, var(--theme) 9%, rgba(255, 255, 255, 0.82));
}

.rail-link::before,
.brew-nav-button.is-active::before {
  position: absolute;
  left: -9px;
  width: 3px;
  height: 20px;
  border-radius: 0 4px 4px 0;
  background: var(--theme);
  content: "";
  opacity: 0;
  transform: translateX(-5px) scaleY(0.6);
  transition:
    opacity 0.38s ease,
    transform 0.42s cubic-bezier(0.22, 1, 0.36, 1);
}

.rail-link.is-active::before,
.brew-nav-button.is-active::before {
  opacity: 1;
  transform: translateX(0) scaleY(1);
}

.rail-link-icon {
  display: flex;
  align-items: center;
  justify-content: center;
}

.rail-link-copy {
  position: absolute;
  left: calc(100% + 13px);
  display: flex;
  width: max-content;
  max-width: 180px;
  padding: 8px 11px;
  flex-direction: column;
  gap: 2px;
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.8);
  box-shadow: 0 12px 25px rgba(54, 45, 106, 0.1);
  opacity: 0;
  pointer-events: none;
  transform: translateX(-6px);
  transition:
    opacity 0.28s ease,
    transform 0.32s ease;
  backdrop-filter: blur(15px);
}

.rail-link:hover .rail-link-copy,
.rail-link:focus-visible .rail-link-copy {
  opacity: 1;
  transform: translateX(0);
}

.rail-link-copy strong {
  color: var(--ink);
  font-size: 0.7rem;
  white-space: nowrap;
}

.rail-link-copy small {
  color: var(--muted);
  font-size: 0.58rem;
  white-space: nowrap;
}

.rail-brew-submenu {
  display: flex;
  margin-top: 12px;
  flex-direction: column;
  gap: 12px;
}

.brew-nav-button:hover,
.brew-nav-button.is-active {
  color: var(--theme);
  background: rgba(255, 255, 255, 0.7);
}

.rail-content-enter-active,
.rail-content-leave-active {
  transition:
    opacity 0.32s ease,
    transform 0.42s cubic-bezier(0.22, 1, 0.36, 1);
}

/*
 * 退场的一组脱离文档流叠在进场的那组上面，舞台的宽高只由留下的一组决定。
 * 铺满整行（而不是用它自己的内容宽度 + left: 0）是为了和进场的一组对齐：
 * 进场的一组由舞台居中，退场的一组若贴左就会在胶囊伸缩时左右乱跑。
 */
.rail-content-stage > .rail-content-leave-active {
  position: absolute;
  top: 0;
  left: 0;
  width: 100%;
  z-index: 1;
}

/* 进场的一组要压在上面：绝对定位的退场组默认画在流内元素之后。 */
.rail-content-enter-active {
  z-index: 2;
}

.rail-content-enter-from {
  opacity: 0;
  transform: translateY(-8px);
}

.rail-content-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

.rail-content-enter-active .rail-button {
  animation: rail-button-enter 0.42s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.rail-content-leave-active .rail-button {
  animation: rail-button-leave 0.34s ease both;
}

.rail-content-enter-active .rail-button:nth-child(2),
.rail-content-enter-active .rail-brew-submenu .rail-button:nth-child(2) {
  animation-delay: 0.04s;
}

.rail-content-enter-active .rail-button:nth-child(3),
.rail-content-enter-active .rail-brew-submenu .rail-button:nth-child(3) {
  animation-delay: 0.08s;
}

.rail-content-enter-active .rail-button:nth-child(4),
.rail-content-enter-active .rail-brew-submenu .rail-button:nth-child(4) {
  animation-delay: 0.12s;
}

@keyframes rail-button-enter {
  from {
    opacity: 0;
    transform: translateY(-6px) scale(0.96);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@keyframes rail-button-leave {
  from {
    opacity: 1;
    transform: translateY(0) scale(1);
  }

  to {
    opacity: 0;
    transform: translateY(6px) scale(0.96);
  }
}

@media (max-width: 820px) {
  /*
   * 移动端：底部居中胶囊，宽度交给内容自己决定。
   *
   * 以前写死 min(344px, 100vw - 16px)：一级导航 6 个 40px 图标只占 260px，
   * 两侧各空出 40 多像素；换到 360px 小屏又几乎铺满整行，看着又大又松。
   * 现在有几项就多宽，切换导航模式时宽度会平滑过渡（width 已在 transition 里）。
   */
  .navigation-rail {
    top: auto;
    bottom: calc(14px + env(safe-area-inset-bottom, 0px));
    left: 50%;
    width: max-content;
    max-width: calc(100vw - 24px);
    padding: 8px;
    border-radius: 24px;
    transform: translateX(-50%);
  }

  /*
   * 移动端按钮组按内容取宽，居中交给舞台的 justify-content；内容比胶囊宽
   * 时舞台居中会让两端同时溢出，过渡期间由胶囊裁掉。
   *
   * 退场的那组被铺成整行宽，内容还要靠 justify-content 自己居中，否则会贴左。
   */
  .rail-content-app,
  .rail-content-brew {
    width: max-content;
    flex-direction: row;
    justify-content: center;
    gap: 4px;
  }

  /* Brew 的按钮原来是桌面的 44px，比其他模式大一圈，这里统一到 40px。 */
  .rail-content-app .rail-button,
  .rail-content-brew .rail-button {
    width: 40px;
    height: 40px;
    flex-basis: 40px;
    border-radius: 12px;
  }

  .rail-brew-submenu {
    display: flex;
    margin-top: 0;
    margin-left: 2px;
    flex-direction: row;
    gap: 4px;
  }

  .rail-link-copy {
    display: none;
  }

  /* 指示条贴在 8px 内边距里，距圆角边留 2px。 */
  .rail-link::before,
  .brew-nav-button.is-active::before {
    top: -6px;
    left: 50%;
    width: 18px;
    height: 3px;
    border-radius: 3px 3px 0 0;
    transform: translateX(-50%) scaleX(0.6);
  }

  .rail-link.is-active::before,
  .brew-nav-button.is-active::before {
    transform: translateX(-50%) scaleX(1);
  }

  /*
   * 资料库二级导航有 7 个按钮，原来用 left/right 各 16px 铺满整行，
   * 按钮被拉得很散。改成 max-content 居中，垂直内边距略微加大，
   * 让高度和一级导航（40 + 16 = 56）持平，切换时不出高度台阶。
   *
   * 只补垂直方向：左右内边距、圆角都和上面的 .navigation-rail 一样。
   */
  .navigation-rail--library {
    padding-block: 11px;
  }

  .rail-content-library {
    width: max-content;
    max-width: 100%;
    flex-direction: row;
    justify-content: center;
    gap: 4px;
  }

  /*
   * 尺寸过渡期间放开按钮组的宽度上限：胶囊还在变宽的时候它会先被压成
   * 当前宽度、内容靠左溢出，最右边那个筛选按钮被切掉一半。放开后它按
   * 自然宽度居中，两端对称地裁，看起来就是胶囊自己在展开。过渡一结束
   * 上限立刻恢复，窄屏下仍然不会露到胶囊外面。
   */
  .navigation-rail.is-resizing .rail-content-library {
    max-width: none;
  }

  .rail-content-library .rail-button {
    width: 36px;
    height: 36px;
    flex-basis: 36px;
    border-radius: 11px;
  }

  .rail-content-library .rail-filter-divider {
    width: 1px;
    height: 24px;
    flex-basis: 1px;
    margin: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .rail-content-enter-active,
  .rail-content-leave-active,
  .rail-button {
    animation: none !important;
    transition: none !important;
  }
}
</style>
