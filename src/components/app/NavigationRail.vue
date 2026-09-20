<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { navigationItems } from '../../data/navigation';
import type { AppPage, IconName, LibraryFilter } from '../../data/types';
import IconGlyph from './IconGlyph.vue';

interface Props {
  /** 当前正在显示的页面。 */
  page: AppPage;
  /** 资料库筛选栏当前选中的分类。 */
  libraryFilter: LibraryFilter;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  /** 切换资料库筛选分类。 */
  'update:libraryFilter': [filter: LibraryFilter];
}>();

interface FilterItem {
  id: LibraryFilter;
  label: string;
  icon: IconName;
}

const filterItems: FilterItem[] = [
  { id: 'all', label: '显示全部内容', icon: 'layoutGrid' },
  { id: 'game', label: '显示游戏', icon: 'game' },
  { id: 'video', label: '显示视频', icon: 'video' },
  { id: 'music', label: '显示音乐', icon: 'music' },
  { id: 'anime', label: '显示追番', icon: 'bookMarked' },
  { id: 'book', label: '显示书籍', icon: 'book' },
];

const isSubmenuPage = (page: AppPage): boolean => page === 'library' || page === 'brew';
const isSubmenuOpen = ref(isSubmenuPage(props.page));

const navigationMode = computed<'app' | 'library' | 'brew'>(() => {
  if (isSubmenuOpen.value && props.page === 'library') return 'library';
  if (isSubmenuOpen.value && props.page === 'brew') return 'brew';
  return 'app';
});

const railLabel = computed(() => {
  if (navigationMode.value === 'library') return '资料库筛选';
  if (navigationMode.value === 'brew') return 'Brew 导航';
  return '主导航';
});

const railElement = ref<HTMLElement | null>(null);
const railHeight = ref<number | null>(null);
const isRailHeightAnimating = ref(false);

let heightAnimationFrame: number | null = null;
let heightResetTimer: number | null = null;

const railStyle = computed(() =>
  railHeight.value === null ? undefined : { height: `${railHeight.value}px` },
);

const getRailBoxExtraHeight = (element: HTMLElement): number => {
  const styles = window.getComputedStyle(element);
  const parseSize = (value: string): number => Number.parseFloat(value) || 0;

  return (
    parseSize(styles.paddingTop) +
    parseSize(styles.paddingBottom) +
    parseSize(styles.borderTopWidth) +
    parseSize(styles.borderBottomWidth)
  );
};

const getTargetRailBoxExtraHeight = (element: HTMLElement): number => {
  const probe = element.cloneNode(false) as HTMLElement;
  probe.style.position = 'absolute';
  probe.style.visibility = 'hidden';
  probe.style.pointerEvents = 'none';
  probe.style.height = 'auto';
  probe.style.transition = 'none';
  document.body.appendChild(probe);
  const extraHeight = getRailBoxExtraHeight(probe);
  probe.remove();
  return extraHeight;
};

const releaseRailHeight = (): void => {
  railHeight.value = null;
  isRailHeightAnimating.value = false;
  if (heightResetTimer !== null) {
    window.clearTimeout(heightResetTimer);
    heightResetTimer = null;
  }
};

const lockRailHeight = (): void => {
  const rail = railElement.value;
  if (!rail) return;

  if (heightAnimationFrame !== null) {
    window.cancelAnimationFrame(heightAnimationFrame);
    heightAnimationFrame = null;
  }
  if (heightResetTimer !== null) {
    window.clearTimeout(heightResetTimer);
    heightResetTimer = null;
  }

  isRailHeightAnimating.value = true;
  railHeight.value = Math.ceil(rail.getBoundingClientRect().height);
};

watch(() => props.page, (page, previousPage) => {
  if (page !== previousPage) isSubmenuOpen.value = isSubmenuPage(page);
}, { flush: 'sync' });

watch(navigationMode, () => {
  lockRailHeight();
}, { flush: 'sync' });

/** 用进入中的按钮组测量目标高度，并让常驻边框平滑过渡到新高度。 */
const animateRailHeight = (enteringElement: Element): void => {
  const rail = railElement.value;
  if (!(enteringElement instanceof HTMLElement) || !rail) return;

  if (heightAnimationFrame !== null) {
    window.cancelAnimationFrame(heightAnimationFrame);
    heightAnimationFrame = null;
  }
  if (heightResetTimer !== null) {
    window.clearTimeout(heightResetTimer);
    heightResetTimer = null;
  }

  const currentHeight = rail.getBoundingClientRect().height;
  const targetHeight = Math.ceil(
    enteringElement.getBoundingClientRect().height + getTargetRailBoxExtraHeight(rail),
  );

  if (Math.abs(currentHeight - targetHeight) < 1) {
    releaseRailHeight();
    return;
  }

  isRailHeightAnimating.value = true;
  railHeight.value = Math.ceil(currentHeight);

  heightAnimationFrame = window.requestAnimationFrame(() => {
    heightAnimationFrame = null;
    railHeight.value = targetHeight;
  });

  heightResetTimer = window.setTimeout(releaseRailHeight, 620);
};

const handleRailTransitionEnd = (event: TransitionEvent): void => {
  if (event.target !== event.currentTarget || event.propertyName !== 'height') return;
  releaseRailHeight();
};

onBeforeUnmount(() => {
  if (heightAnimationFrame !== null) window.cancelAnimationFrame(heightAnimationFrame);
  if (heightResetTimer !== null) window.clearTimeout(heightResetTimer);
});

/** 切换资料库的静态分类筛选。 */
const selectLibraryFilter = (filter: LibraryFilter): void => {
  emit('update:libraryFilter', filter);
};

/** 返回当前页面的一级导航，同时保留页面地址和主体内容。 */
const showPrimaryNavigation = (): void => {
  isSubmenuOpen.value = false;
};

/** 从一级导航重新打开资料库或 Brew 的二级菜单。 */
const openSubmenuFor = (page: AppPage): void => {
  if (isSubmenuPage(page)) isSubmenuOpen.value = true;
};
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
      { 'is-height-animating': isRailHeightAnimating },
    ]"
    :style="railStyle"
    :aria-label="railLabel"
    @transitionend="handleRailTransitionEnd"
  >
    <div class="rail-content-stage">
      <Transition
        name="rail-content"
        @enter="animateRailHeight"
      >
        <div v-if="navigationMode === 'library'" key="library" class="rail-content rail-content-library">
          <button class="rail-button rail-filter-back" type="button" aria-label="返回一级导航" @click="showPrimaryNavigation">
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

        <div v-else-if="navigationMode === 'brew'" key="brew" class="rail-content rail-content-brew">
          <button class="rail-button brew-nav-button brew-nav-back" type="button" aria-label="返回一级导航" title="返回一级导航" @click="showPrimaryNavigation">
            <IconGlyph name="arrowLeft" :size="18" />
          </button>
          <div class="rail-brew-submenu">
            <button class="rail-button brew-nav-button is-active" type="button" aria-label="全部订阅源" title="全部订阅源">
              <IconGlyph name="rss" :size="17" />
            </button>
            <button class="rail-button brew-nav-button" type="button" aria-label="我" title="我">
              <IconGlyph name="user" :size="17" />
            </button>
            <button class="rail-button brew-nav-button" type="button" aria-label="收藏" title="收藏">
              <IconGlyph name="star" :size="17" />
            </button>
          </div>
        </div>

        <nav v-else key="app" class="rail-content rail-content-app" aria-label="主导航">
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
            <span class="rail-link-icon"><IconGlyph :name="item.icon" :size="19" /></span>
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
  display: grid;
  width: 65px;
  padding: 9px;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.84);
  border-radius: 26px;
  background: rgba(255, 255, 255, 0.68);
  box-shadow: 0 1px 0 rgba(255, 255, 255, 0.52) inset, 0 13px 34px rgba(54, 45, 106, 0.13);
  backdrop-filter: blur(21px) saturate(148%);
  transform: translateY(-50%);
  transition: height 0.52s cubic-bezier(0.22, 1, 0.36, 1), width 0.34s ease,
    padding 0.34s ease, border-radius 0.34s ease;
}

.navigation-rail.is-height-animating {
  overflow: hidden;
}

.navigation-rail--library,
.navigation-rail--brew {
  padding-block: 11px;
}

.rail-content-stage {
  display: grid;
  width: 100%;
}

.rail-content-stage > * {
  grid-area: 1 / 1;
  align-self: start;
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
  display: grid;
  width: 44px;
  height: 44px;
  flex: 0 0 44px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 14px;
  color: rgba(43, 50, 79, 0.65);
  background: transparent;
  transition: color 0.34s ease, background 0.34s ease, opacity 0.4s ease,
    transform 0.46s cubic-bezier(0.22, 1, 0.36, 1);
}

.rail-button:hover,
.rail-button.is-active {
  color: var(--purple-deep);
  background: rgba(255, 255, 255, 0.72);
  transform: translateY(-2px);
}

.rail-filter-divider {
  display: block;
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
  color: var(--purple-deep);
  background: rgba(242, 239, 255, 0.82);
}

.rail-link::before,
.brew-nav-button.is-active::before {
  position: absolute;
  left: -9px;
  width: 3px;
  height: 20px;
  border-radius: 0 4px 4px 0;
  background: var(--pink);
  content: '';
  opacity: 0;
  transform: translateX(-5px) scaleY(0.6);
  transition: opacity 0.38s ease, transform 0.42s cubic-bezier(0.22, 1, 0.36, 1);
}

.rail-link.is-active::before,
.brew-nav-button.is-active::before {
  opacity: 1;
  transform: translateX(0) scaleY(1);
}

.rail-link-icon {
  display: grid;
  place-items: center;
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
  transition: opacity 0.28s ease, transform 0.32s ease;
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
  margin-top: 25px;
  flex-direction: column;
  gap: 12px;
}

.brew-nav-button:hover,
.brew-nav-button.is-active {
  color: var(--purple-deep);
  background: rgba(255, 255, 255, 0.7);
}

.rail-content-enter-active,
.rail-content-leave-active {
  z-index: 1;
  transition: opacity 0.32s ease, transform 0.42s cubic-bezier(0.22, 1, 0.36, 1);
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
  .navigation-rail {
    top: auto;
    bottom: -4px;
    left: 50%;
    width: min(344px, calc(100vw - 16px));
    min-height: 72px;
    padding: 13px 10px;
    border-radius: 30px;
    transform: translateX(-50%);
  }

  .navigation-rail--reports {
    bottom: 16px;
  }

  .navigation-rail--brew {
    bottom: 16px;
    width: 301px;
  }

  .rail-content-app,
  .rail-content-brew {
    width: max-content;
    flex-direction: row;
    gap: 4px;
  }

  .rail-content-app .rail-button {
    width: 40px;
    height: 40px;
    flex-basis: 40px;
    border-radius: 12px;
  }

  .rail-content-app,
  .rail-content-brew {
    justify-self: center;
  }

  .rail-brew-submenu {
    display: flex;
    margin-top: 0;
    margin-left: 9px;
    flex-direction: row;
    gap: 8px;
  }

  .rail-link-copy {
    display: none;
  }

  .rail-link::before,
  .brew-nav-button.is-active::before {
    top: -9px;
    left: 50%;
    width: 20px;
    height: 3px;
    border-radius: 3px 3px 0 0;
    transform: translateX(-50%) scaleX(0.6);
  }

  .rail-link.is-active::before,
  .brew-nav-button.is-active::before {
    transform: translateX(-50%) scaleX(1);
  }

  .navigation-rail--library {
    right: 16px;
    left: 16px;
    width: auto;
    padding: 17px 12px;
    transform: none;
  }

  .rail-content-library {
    width: max-content;
    max-width: 100%;
    flex-direction: row;
    gap: 5px;
    justify-self: center;
  }

  .rail-content-library .rail-button {
    width: 36px;
    height: 36px;
    flex-basis: 36px;
    border-radius: 12px;
  }

  .rail-content-library .rail-filter-divider {
    width: 1px;
    height: 28px;
    flex-basis: 1px;
    margin: 0 1px;
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
