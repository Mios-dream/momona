<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import {
  homeWidgetCategories,
  type HomeWidgetCategoryId,
} from "../../data/homeWidgetCategories";
import type { HomeWidget, IconName, LocalConfig, SiteData } from "../../data/types";
import IconGlyph from "../app/IconGlyph.vue";
import HomeWidgetDetail from "./HomeWidgetDetail.vue";
import { homeWidgetComponents } from "./homeWidgetComponents";
import { homeWidgetPreviewProps } from "../../utils/homeWidgetProps";
import {
  CATALOG_STAGE_HEIGHT,
  catalogInCategory,
  catalogMatchesQuery,
  catalogPreviewStyle,
  catalogStatus,
  catalogStatusLabel,
  widgetCatalogEntries,
  type WidgetCatalogEntry,
  type WidgetCatalogStatus,
} from "../../utils/widgetCatalog";

/**
 * 「添加组件」目录。
 *
 * 材质分工：窗口的「边框」是玻璃（标题栏与分类栏，直接透出壁纸），
 * 窗口的「内容」是实白（列表区，预览要判断配色，不能被花色干扰）。
 * 不加暗色遮罩，玻璃才能采到真实页面；层次靠描边、内凹的预览画布和投影
 * 表达，而不是靠压暗背景。全屏只有一块强调色（当前分类 + 添加按钮），
 * 信息只出现一次——不列已启用数量、不写分类说明、不重复卡片描述与标签。
 *
 * 一个组件类型只占一张卡：13 个平台收在「社交卡片」里，3 款游戏收在
 * 「游戏资料」里。点卡片上的「添加」不是当场落地，而是翻到这一类的
 * 详情页——在那里看按真实比例放大的本体、切换变体、填字段，再决定带走。
 * 目录因此只有一层，不会因为变体多就把别的组件挤到第三屏。
 */
interface Props {
  /** 当前是否打开目录。开关动画由目录自身管理，父组件只切状态。 */
  open: boolean;
  /** 编辑器当前的组件列表，用于判断已添加状态。 */
  widgets: HomeWidget[];
  /** 首页已读到的数据；预览要让组件画出它在首页的样子，而不是空壳。 */
  siteData: SiteData;
  /** 编辑中的配置，预览里的排序等设置项要跟首页一致。 */
  localConfig?: LocalConfig | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  close: [];
  add: [payload: { key: string; values: Record<string, string> }];
}>();

/** 左侧导航的一项：只有名称与图标，不携带统计或说明。 */
interface CategoryView {
  id: HomeWidgetCategoryId | "all";
  label: string;
  icon: IconName;
}

const activeCategory = ref<HomeWidgetCategoryId | "all">("all");
const query = ref("");
const cardWidth = ref(0);
/** Teleport 只在客户端挂载后才渲染，避免 SSR 与客户端的水合结果不一致。 */
const mounted = ref(false);
const gridElement = ref<HTMLElement | null>(null);
const searchInput = ref<HTMLInputElement | null>(null);
/** 正在查看详情的那一类组件；非空时目录翻到详情页。 */
const detailEntry = ref<WidgetCatalogEntry | null>(null);
const justAdded = ref<string | null>(null);
let addedTimer: number | null = null;
let gridObserver: ResizeObserver | null = null;

/** 左侧导航数据：第一个是「全部」，其余来自分类表。 */
const categoryViews = computed<CategoryView[]>(() => [
  { id: "all", label: "全部", icon: "layoutGrid" },
  ...homeWidgetCategories.map((category) => ({
    id: category.id,
    label: category.label,
    icon: category.icon,
  })),
]);

/** 当前是否处于搜索状态。 */
const searching = computed(() => query.value.trim().length > 0);

/** 当前分类 + 关键词过滤后的目录条目；搜索时忽略分类，直接全库检索。 */
const visibleEntries = computed(() => {
  const keyword = query.value.trim();
  return widgetCatalogEntries.filter(
    (entry) =>
      (searching.value ||
        catalogInCategory(entry, activeCategory.value)) &&
      catalogMatchesQuery(entry, keyword),
  );
});

/**
 * 每张卡当前的目录状态。
 *
 * 卡片代表一整类组件，所以只有每个变体都已在首页上时才算「已添加」；
 * 否则保持可点，由添加窗口去标出哪些变体已经加过。
 */
const cardStatus = computed<Record<string, WidgetCatalogStatus>>(() => {
  const map: Record<string, WidgetCatalogStatus> = {};
  for (const entry of widgetCatalogEntries) {
    map[entry.key] = catalogStatus(props.widgets, entry);
  }
  return map;
});

/**
 * 生成目录条目的预览属性。
 *
 * 走的是首页同一条 `homeWidgetProps` 通路，所以预览里的卡片和落到首页之后
 * 是同一张：读过数据就画数据，没读过才画空态。聚合卡用第一个变体出镜，
 * 标题栏会写明这一组有几种，不必把 13 张卡都铺出来。
 *
 * @param entry - 目录条目。
 * @returns 传给具体组件实例的属性对象。
 */
function previewProps(entry: WidgetCatalogEntry): Record<string, unknown> {
  return homeWidgetPreviewProps(
    entry.definition.type,
    entry.variants[0],
    {},
    { siteData: props.siteData, localConfig: props.localConfig },
  );
}

/**
 * 生成预览内层的等比缩放样式。
 *
 * @param entry - 目录条目。
 * @returns 直接绑定到预览内层的样式对象。
 */
function previewStyle(entry: WidgetCatalogEntry): Record<string, string> {
  return catalogPreviewStyle(entry, cardWidth.value);
}

/**
 * 判断某张卡刚刚是否完成过一次添加（用于播一下确认动画）。
 *
 * 卡片代表一整类，所以命中任意一个变体都算这张卡刚被加过。
 *
 * @param entry - 目录条目。
 * @returns 刚刚添加过时返回 true。
 */
function justAddedEntry(entry: WidgetCatalogEntry): boolean {
  const key = justAdded.value;
  return Boolean(key) && entry.variants.some((variant) => variant.id === key);
}

/**
 * 生成添加按钮的无障碍名称：卡片名 + 当前状态。
 *
 * @param entry - 目录条目。
 * @returns 形如「社交卡片：添加」的文案。
 */
function addAriaLabel(entry: WidgetCatalogEntry): string {
  return `${entry.label}：${catalogStatusLabel(cardStatus.value[entry.key])}`;
}

/**
 * 读取状态对应的按钮图标。
 *
 * @param status - 目录状态。
 * @returns 图标语义名称。
 */
function statusIcon(status: WidgetCatalogStatus): IconName {
  if (status === "added") return "check";
  if (status === "hidden") return "refresh";
  return "plus";
}

/**
 * 切换左侧分类，并把右侧列表滚回顶部。
 *
 * 搜索态下列表是跨分类的全库结果，所以点击分类会先收掉搜索词，
 * 让「选分类」这个动作始终有可见结果。
 *
 * @param id - 目标分类标识。
 * @returns 无返回值；点击当前分类且未搜索时不产生任何变化。
 */
function selectCategory(id: HomeWidgetCategoryId | "all"): void {
  detailEntry.value = null;
  if (searching.value) {
    query.value = "";
  } else if (activeCategory.value === id) {
    return;
  }
  activeCategory.value = id;
  void nextTick(() => {
    gridElement.value?.scrollTo({ top: 0, behavior: "smooth" });
  });
}

/**
 * 测量卡片实际宽度，供预览等比缩放使用。
 *
 * 用 offsetWidth 而不是 getBoundingClientRect：面板入场动画带位移与缩放，
 * 前者是布局尺寸，不受祖先 transform 影响。
 *
 * @returns 无返回值；列表为空时保留上一次的宽度。
 */
function measureCardWidth(): void {
  const card = gridElement.value?.querySelector<HTMLElement>(".catalog-card");
  const width = card?.offsetWidth ?? 0;
  if (width && width !== cardWidth.value) cardWidth.value = width;
}

/**
 * 点击「添加」：翻到这一类的详情页。
 *
 * 详情页要承担三件事——看预览、切变体、填字段。没有变体也没有字段的
 * 组件同样进这一页：右列整列不渲染，预览占满，那是"看一眼实物"，
 * 不是为了一个选项开一扇门。
 *
 * @param entry - 用户点击的目录条目。
 * @returns 无返回值；已添加的组件不会重复加入。
 */
function openAdd(entry: WidgetCatalogEntry): void {
  if (cardStatus.value[entry.key] === "added") return;
  detailEntry.value = entry;
}

/**
 * 把一次添加交给父组件，并给卡片一次确认反馈。
 *
 * @param key - 变体 id。
 * @param values - 用户补填的字段值。
 * @returns 无返回值；提交后回到列表，方便接着加下一个。
 */
function commit(key: string, values: Record<string, string>): void {
  justAdded.value = key;
  detailEntry.value = null;
  if (addedTimer !== null) window.clearTimeout(addedTimer);
  addedTimer = window.setTimeout(() => {
    justAdded.value = null;
    addedTimer = null;
  }, 520);
  emit("add", { key, values });
}

/** 清空搜索与分类筛选，回到「全部」视图。 */
function resetFilters(): void {
  detailEntry.value = null;
  query.value = "";
  activeCategory.value = "all";
  searchInput.value?.focus();
}

/**
 * Escape 一次退一层：先退回列表，再关目录。
 *
 * @param event - 浏览器键盘事件。
 * @returns 无返回值。
 */
function handleKeydown(event: KeyboardEvent): void {
  if (!props.open || event.key !== "Escape") return;
  if (detailEntry.value) {
    detailEntry.value = null;
    return;
  }
  emit("close");
}

/**
 * 目录打开后重新测量卡片宽度，并把焦点交给搜索框。
 *
 * 卡片宽度依赖真实布局，必须等 Teleport 内容挂载后再测；
 * 触屏设备不抢焦点，避免一打开就弹出软键盘。
 *
 * @returns 无返回值。
 */
function syncAfterOpen(): void {
  const grid = gridElement.value;
  if (!grid) return;
  measureCardWidth();
  gridObserver?.disconnect();
  if (typeof ResizeObserver !== "undefined") {
    gridObserver = new ResizeObserver(measureCardWidth);
    gridObserver.observe(grid);
  }
  if (window.matchMedia("(pointer: fine)").matches) searchInput.value?.focus();
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    // 每次打开都回到「全部 + 空搜索」，避免上次的筛选状态让人以为组件丢失。
    activeCategory.value = "all";
    query.value = "";
    detailEntry.value = null;
    void nextTick(syncAfterOpen);
  },
);

onMounted(() => {
  mounted.value = true;
  window.addEventListener("keydown", handleKeydown);
  if (props.open) void nextTick(syncAfterOpen);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown);
  gridObserver?.disconnect();
  if (addedTimer !== null) window.clearTimeout(addedTimer);
});
</script>

<template>
  <!--
    目录必须挂到 body 上：首页内容位于 .app-shell（z-index: 1）的层叠上下文里，
    留在原地会被导航栏、控制栏盖住，移动端尤其明显。
  -->
  <Teleport v-if="mounted" to="body">
    <Transition name="catalog">
      <div
        v-if="props.open"
        class="catalog-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="catalog-title"
      >
        <button
          class="catalog-backdrop"
          type="button"
          tabindex="-1"
          aria-label="关闭组件目录"
          @click="emit('close')"
        ></button>

        <section class="catalog-panel">
          <header class="catalog-head" :inert="detailEntry ? '' : undefined">
            <h2 id="catalog-title" class="catalog-title">添加组件</h2>

            <label class="catalog-search">
              <IconGlyph name="search" :size="14" />
              <input
                id="catalog-search-input"
                ref="searchInput"
                v-model="query"
                type="search"
                name="widget-search"
                placeholder="搜索组件"
                aria-label="搜索组件"
              />
              <button
                v-if="query"
                type="button"
                class="catalog-search-clear"
                aria-label="清空搜索"
                @click="query = ''"
              >
                <IconGlyph name="x" :size="11" />
              </button>
            </label>

            <button
              type="button"
              class="catalog-close"
              aria-label="关闭组件目录"
              @click="emit('close')"
            >
              <IconGlyph name="x" :size="14" />
            </button>
          </header>

          <div class="catalog-body" :inert="detailEntry ? '' : undefined">
            <nav class="catalog-nav" aria-label="组件分类">
              <button
                v-for="view in categoryViews"
                :key="view.id"
                type="button"
                class="catalog-nav-item"
                :class="{ 'is-active': activeCategory === view.id }"
                :aria-current="activeCategory === view.id ? 'true' : undefined"
                @click="selectCategory(view.id)"
              >
                <IconGlyph :name="view.icon" :size="14" />
                <span>{{ view.label }}</span>
              </button>
            </nav>

            <section class="catalog-main">
              <div
                ref="gridElement"
                class="catalog-grid"
                :style="{
                  '--catalog-stage-height': `${CATALOG_STAGE_HEIGHT}px`,
                }"
              >
                <TransitionGroup name="catalog-card" appear>
                  <article
                    v-for="(entry, index) in visibleEntries"
                    :key="entry.key"
                    class="catalog-card"
                    :class="{
                      'is-added': cardStatus[entry.key] === 'added',
                      'is-just-added': justAddedEntry(entry),
                    }"
                    :style="{ '--card-index': String(Math.min(index, 10)) }"
                  >
                    <div class="catalog-card-stage">
                      <div
                        class="catalog-card-frame"
                        :style="previewStyle(entry)"
                        aria-hidden="true"
                        inert
                      >
                        <component
                          :is="homeWidgetComponents[entry.definition.type]"
                          v-bind="previewProps(entry)"
                        />
                      </div>
                    </div>

                    <div class="catalog-card-foot">
                      <div class="catalog-card-copy">
                        <strong>{{ entry.label }}</strong>
                        <span class="catalog-card-meta">
                          {{ entry.sizeLabel
                          }}<template v-if="entry.variants.length > 1">
                            · {{ entry.variants.length }} 种</template>
                        </span>
                      </div>
                      <button
                        type="button"
                        class="catalog-card-add"
                        :class="`is-${cardStatus[entry.key]}`"
                        :disabled="cardStatus[entry.key] === 'added'"
                        :aria-label="addAriaLabel(entry)"
                        @click="openAdd(entry)"
                      >
                        <IconGlyph
                          :name="statusIcon(cardStatus[entry.key])"
                          :size="12"
                        />{{ catalogStatusLabel(cardStatus[entry.key]) }}
                      </button>
                    </div>
                  </article>
                </TransitionGroup>

                <Transition name="catalog-empty">
                  <div v-if="!visibleEntries.length" class="catalog-empty">
                    <strong>没有匹配的组件</strong>
                    <button type="button" @click="resetFilters">
                      清除筛选
                    </button>
                  </div>
                </Transition>
              </div>
            </section>
          </div>

          <!--
            详情页盖在整块面板上：同一扇窗翻到第二页，而不是再叠一个浮层。
            列表留在底下（inert），从右边推进来，退回去时原路返回。
          -->
          <Transition name="catalog-detail">
            <HomeWidgetDetail
              v-if="detailEntry"
              :entry="detailEntry"
              :widgets="props.widgets"
              :site-data="props.siteData"
              :local-config="props.localConfig"
              @back="detailEntry = null"
              @add="commit($event.key, $event.values)"
            />
          </Transition>
        </section>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.catalog-dialog {
  position: fixed;
  z-index: 82;
  inset: 0;
  display: grid;
  place-items: center;
  /**
   * 层级靠「明度台阶 + 描边 + 投影」表达：
   * 壁纸（最远）→ 玻璃标题栏/分类栏 → 白色内容区（最近）。
   * 越靠近内容的越实，越靠后的越透，眼睛才有前后关系。
   */
  --cat-line: rgba(19, 26, 45, 0.078);
  --cat-ink: #1a2133;
  --cat-ink-soft: #545d72;
  --cat-muted: #8c93a7;
}

.catalog-backdrop {
  position: absolute;
  inset: 0;
  padding: 0;
  border: 0;
  /* 不加遮罩：压暗会把壁纸的颜色和亮度一起吞掉，玻璃就失去可采样的底。
     这里只保留一块透明热区用来点击关闭。 */
  background: transparent;
  cursor: default;
  touch-action: none;
}

/* ---- 面板：一块更厚、更亮的玻璃，靠边框高光与投影立起来 ---- */

.catalog-panel {
  position: relative;
  z-index: 1;
  display: flex;
  width: min(1040px, calc(100vw - 48px));
  height: min(680px, calc(100svh - 56px));
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.68);
  border-radius: 22px;
  /**
   * 面板压到 0.78 左右是刻意的：卡片要能在这个底上再亮一档，
   * 否则两块白色只差几个明度值，浮起来的东西看着像贴上去的。
   * 左上角那一小块主题色晕染只是"光从左上进来"，不铺满整块玻璃。
   */
  background:
    radial-gradient(
      70% 40% at 12% -16%,
      color-mix(in srgb, var(--theme) 6%, transparent),
      transparent 62%
    ),
    linear-gradient(
      158deg,
      rgba(255, 255, 255, 0.72),
      rgba(255, 255, 255, 0.62) 56%,
      rgba(255, 255, 255, 0.68)
    );
  backdrop-filter: blur(34px) saturate(64%) brightness(1.04);
  -webkit-backdrop-filter: blur(34px) saturate(64%) brightness(1.04);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.78) inset,
    0 0 0 1px rgba(52, 42, 96, 0.06),
    0 42px 104px rgba(31, 25, 64, 0.28),
    0 12px 32px rgba(31, 25, 64, 0.12),
    0 2px 6px rgba(31, 25, 64, 0.06);
  transform-origin: 50% 46%;
  transition:
    opacity 0.22s ease,
    transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}

.catalog-dialog.catalog-enter-from,
.catalog-dialog.catalog-leave-to {
  opacity: 0;
}

.catalog-dialog.catalog-enter-from .catalog-panel,
.catalog-dialog.catalog-leave-to .catalog-panel {
  transform: translateY(12px) scale(0.986);
}

/* 详情页从右边推进来：方向说明"更深一层"，返回时原路退回。 */
.catalog-detail-enter-active,
.catalog-detail-leave-active {
  transition:
    opacity 0.22s ease,
    transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}

.catalog-detail-enter-from,
.catalog-detail-leave-to {
  opacity: 0;
  transform: translateX(26px);
}

/* ---- 头部：标题 + 搜索 + 关闭，只有这三个元素 ---- */

.catalog-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 18px 20px 16px 24px;
  border-bottom: 1px solid var(--cat-line);
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.26),
    rgba(255, 255, 255, 0.02)
  );
}

.catalog-title {
  margin: 0;
  color: var(--cat-ink);
  font-size: 1.5rem;
  font-weight: 760;
  letter-spacing: -0.01em;
  line-height: 1.2;
}

/* 搜索框做成内凹的小井，和卡片（凸起）形成方向相反的两种深度。 */
.catalog-search {
  display: flex;
  width: 232px;
  height: 34px;
  margin-left: auto;
  align-items: center;
  gap: 7px;
  padding: 0 10px;
  border: 1px solid rgba(19, 26, 45, 0.05);
  border-radius: 10px;
  background: rgba(19, 26, 45, 0.045);
  box-shadow: 0 1px 3px rgba(33, 27, 68, 0.06) inset;
  color: var(--cat-muted);
  transition:
    background 0.16s ease,
    border-color 0.16s ease,
    box-shadow 0.16s ease;
}

.catalog-search:focus-within {
  border-color: color-mix(in srgb, var(--theme) 44%, #fff);
  background: rgba(255, 255, 255, 0.95);
  box-shadow:
    0 0 0 3px color-mix(in srgb, var(--theme) 12%, transparent),
    0 1px 2px rgba(33, 27, 68, 0.04) inset;
}

.catalog-search input {
  width: 100%;
  min-width: 0;
  border: 0;
  background: none;
  outline: none;
  color: var(--cat-ink);
  font-size: 0.78rem;
}

.catalog-search input::placeholder {
  color: var(--cat-muted);
}

.catalog-search input::-webkit-search-cancel-button {
  display: none;
}

.catalog-search-clear {
  display: grid;
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 50%;
  background: rgba(19, 26, 45, 0.08);
  color: var(--cat-ink-soft);
  cursor: pointer;
}

.catalog-close {
  display: grid;
  width: 34px;
  height: 34px;
  flex: 0 0 auto;
  padding: 0;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 10px;
  background: transparent;
  color: var(--cat-ink-soft);
  cursor: pointer;
  transition:
    background 0.16s ease,
    border-color 0.16s ease,
    color 0.16s ease;
}

.catalog-close:hover {
  border-color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.62);
  color: var(--cat-ink);
}

/* ---- 主体：分类栏（略暗的侧区） + 组件网格（亮区） ---- */

.catalog-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

.catalog-nav {
  display: flex;
  width: 168px;
  flex: 0 0 auto;
  padding: 14px 12px;
  flex-direction: column;
  gap: 2px;
  border-right: 1px solid var(--cat-line);
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.34),
    rgba(255, 255, 255, 0.46)
  );
}

.catalog-nav-item {
  display: flex;
  height: 36px;
  padding: 0 10px;
  align-items: center;
  gap: 9px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--cat-ink-soft);
  font-size: 0.8rem;
  font-weight: 560;
  text-align: left;
  cursor: pointer;
  transition:
    background 0.16s ease,
    color 0.16s ease,
    box-shadow 0.16s ease;
}

.catalog-nav-item:hover {
  background: rgba(255, 255, 255, 0.56);
  color: var(--cat-ink);
}

/* 全屏唯一的强强调面：当前分类，实色压在玻璃上，视线第一个落点。 */
.catalog-nav-item.is-active {
  background: var(--theme);
  color: #fff;
  font-weight: 650;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.24) inset,
    0 4px 12px color-mix(in srgb, var(--theme) 26%, transparent);
}

.catalog-main {
  display: flex;
  flex: 1;
  min-width: 0;
  padding: 16px 20px 18px;
  /* 内容区用实白：预览要判断配色，不能被壁纸的花色干扰。 */
  background: #fff;
}

.catalog-grid {
  display: grid;
  width: 100%;
  flex: 1;
  min-height: 0;
  align-content: start;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  /* 卡片带 overflow:hidden，auto 行高会塌成 min-content，必须显式取 max-content。 */
  grid-auto-rows: max-content;
  gap: 14px;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
  scrollbar-color: rgba(19, 26, 45, 0.16) transparent;
}

/* ---- 卡片：白底描边的小方卡，预览是主角，文字只留名称与尺寸 ---- */

.catalog-card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid rgba(19, 26, 45, 0.07);
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(33, 27, 68, 0.035);
  transition:
    background 0.2s ease,
    border-color 0.2s ease,
    box-shadow 0.2s ease,
    transform 0.2s ease;
}

.catalog-card:hover {
  border-color: color-mix(in srgb, var(--theme) 30%, rgba(19, 26, 45, 0.09));
  box-shadow:
    0 2px 4px rgba(33, 27, 68, 0.04),
    0 16px 32px rgba(33, 27, 68, 0.13);
  transform: translateY(-2px);
}

/* 预览画布内凹：卡片凸、画布凹，一块卡片内就有两次深度变化。 */
.catalog-card-stage {
  position: relative;
  height: var(--catalog-stage-height, 148px);
  flex: 0 0 auto;
  overflow: hidden;
  border-bottom: 1px solid var(--cat-line);
  background: linear-gradient(180deg, #e5ebf6, #dbe3f1);
  box-shadow:
    0 3px 7px rgba(31, 26, 64, 0.09) inset,
    0 -1px 0 rgba(255, 255, 255, 0.5) inset;
  transition: background 0.24s ease;
}

.catalog-card:hover .catalog-card-stage {
  background: linear-gradient(180deg, #ecf1fa, #e2eaf6);
}

.catalog-card-frame {
  position: absolute;
  top: 50%;
  left: 50%;
  overflow: hidden;
  border-radius: 12px;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.5),
    0 8px 20px rgba(31, 26, 64, 0.15);
  transform: translate(-50%, -50%) scale(var(--frame-scale, 0.6));
  transition:
    transform 0.34s cubic-bezier(0.22, 1, 0.36, 1),
    box-shadow 0.24s ease;
  pointer-events: none;
}

/*
 * 和首页一样撑满画布。
 *
 * 不撑满时卡片按内容自己长高，4×2 的格子只能装 152px，内容 163px 就会被
 * 裁掉一截；撑满之后缩略图和首页那张卡是同构的——同样的宽高比、同样的
 * 截断位置，用户看到的就是装上去的那个尺寸。
 */
.catalog-card-frame > :first-child {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.catalog-card:hover .catalog-card-frame {
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.6),
    0 14px 28px rgba(31, 26, 64, 0.19);
  transform: translate(-50%, -50%) scale(calc(var(--frame-scale, 0.6) * 1.025));
}

.catalog-card-foot {
  display: flex;
  align-items: center;
  gap: 10px;
  justify-content: space-between;
  padding: 9px 10px 9px 13px;
}

.catalog-card-copy {
  display: flex;
  min-width: 0;
  align-items: baseline;
  gap: 8px;
}

.catalog-card-copy strong {
  overflow: hidden;
  color: var(--cat-ink);
  font-size: 0.82rem;
  font-weight: 680;
  letter-spacing: -0.005em;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* 尺寸与「几种」共用一行：数字用等宽字形，切换分类时不会左右跳。 */
.catalog-card-meta {
  flex: 0 0 auto;
  color: var(--cat-muted);
  font-size: 0.65rem;
  font-variant-numeric: tabular-nums;
}

/* ---- 添加按钮：页面上唯一的行动色 ---- */

.catalog-card-add {
  display: inline-flex;
  height: 28px;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  padding: 0 11px;
  border: 0;
  border-radius: 8px;
  background: var(--theme);
  color: #fff;
  font-size: 0.7rem;
  font-weight: 640;
  cursor: pointer;
  transition:
    background 0.16s ease,
    color 0.16s ease,
    transform 0.16s ease;
}

.catalog-card-add:hover:not(:disabled) {
  background: var(--theme-hover);
}

.catalog-card-add:active:not(:disabled) {
  background: var(--theme-active);
  transform: scale(0.97);
}

.catalog-card-add:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme) 26%, transparent);
}

/* 已添加是「中性状态」，不是第二个主按钮，所以退成半透明灰底。 */
.catalog-card-add.is-added,
.catalog-card-add:disabled {
  background: rgba(19, 26, 45, 0.07);
  color: var(--cat-muted);
  cursor: default;
}

.catalog-card-add.is-hidden {
  background: color-mix(in srgb, var(--theme) 12%, rgba(255, 255, 255, 0.7));
  color: var(--theme-strong);
}

.catalog-card.is-just-added {
  animation: catalog-card-confirm 0.52s ease;
}

@keyframes catalog-card-confirm {
  0% {
    border-color: color-mix(in srgb, var(--theme) 58%, #fff);
    box-shadow:
      0 0 0 3px color-mix(in srgb, var(--theme) 14%, transparent),
      0 10px 24px rgba(33, 27, 68, 0.12);
  }

  100% {
    border-color: rgba(19, 26, 45, 0.07);
    box-shadow: 0 1px 2px rgba(33, 27, 68, 0.035);
  }
}

/* ---- 空态 ---- */

.catalog-empty {
  display: grid;
  grid-column: 1 / -1;
  padding: 48px 0 60px;
  place-items: center;
  gap: 8px;
  text-align: center;
}

.catalog-empty strong {
  color: var(--cat-ink);
  font-size: 0.86rem;
  font-weight: 640;
}

.catalog-empty button {
  padding: 0;
  border: 0;
  background: none;
  color: var(--theme-strong);
  font-size: 0.76rem;
  cursor: pointer;
}

.catalog-empty button:hover {
  text-decoration: underline;
}

/* ---- 入场与列表切换 ---- */

.catalog-card {
  animation: catalog-card-in 0.34s cubic-bezier(0.22, 1, 0.36, 1) backwards;
  animation-delay: calc(var(--card-index, 0) * 22ms);
}

@keyframes catalog-card-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }

  to {
    opacity: 1;
    transform: none;
  }
}

.catalog-card-move {
  transition: transform 0.28s cubic-bezier(0.22, 1, 0.36, 1);
}

.catalog-card-leave-active {
  position: absolute;
  width: calc(50% - 7px);
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}

.catalog-card-leave-to {
  opacity: 0;
  transform: scale(0.97);
}

.catalog-empty-enter-active,
.catalog-empty-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}

.catalog-empty-enter-from,
.catalog-empty-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

/* ---- 移动端：分类变横向胶囊，卡片单列 ---- */

@media (max-width: 900px) {
  .catalog-panel {
    width: calc(100vw - 20px);
    height: calc(100svh - 24px);
    border-radius: 18px;
  }

  .catalog-head {
    padding: 14px 14px 12px 16px;
    flex-wrap: wrap;
    gap: 10px;
  }

  .catalog-title {
    font-size: 1.12rem;
  }

  .catalog-close {
    margin-left: auto;
    order: 2;
  }

  .catalog-search {
    width: 100%;
    margin-left: 0;
    order: 3;
  }

  .catalog-body {
    flex-direction: column;
  }

  .catalog-nav {
    width: 100%;
    padding: 10px 12px;
    flex-direction: row;
    gap: 6px;
    overflow-x: auto;
    border-right: 0;
    border-bottom: 1px solid var(--cat-line);
    background: linear-gradient(
      180deg,
      rgba(255, 255, 255, 0.3),
      rgba(255, 255, 255, 0.06)
    );
    scrollbar-width: none;
  }

  .catalog-nav::-webkit-scrollbar {
    display: none;
  }

  .catalog-nav-item {
    height: 32px;
    flex: 0 0 auto;
    gap: 6px;
    padding: 0 12px;
    font-size: 0.74rem;
  }

  .catalog-nav-item.is-active {
    box-shadow: 0 3px 10px color-mix(in srgb, var(--theme) 24%, transparent);
  }

  .catalog-main {
    padding: 12px 12px 14px;
    overflow-y: auto;
  }

  .catalog-grid {
    overflow: visible;
    grid-template-columns: minmax(0, 1fr);
    gap: 12px;
  }

  .catalog-card-leave-active {
    width: 100%;
  }
}

@media (prefers-reduced-motion: reduce) {
  .catalog-panel,
  .catalog-card,
  .catalog-card-frame,
  .catalog-card-add,
  .catalog-nav-item,
  .catalog-detail-enter-active,
  .catalog-detail-leave-active {
    transition-duration: 0.01ms;
  }

  .catalog-card,
  .catalog-card.is-just-added {
    animation: none;
  }
}
</style>
