<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import {
  HOME_GRID_COLUMNS,
  HOME_GRID_ROWS,
  createHomeWidget,
} from "../../data/homeWidgets";
import {
  cloneLocalConfig,
  createEmptyLocalConfig,
  normalizeLocalConfig,
} from "../../data/localConfig";
import type {
  HomeWidget,
  HoyoGame,
  LocalConfig,
  SiteData,
  StarRailAccountData,
} from "../../data/types";
import { hoyoGameLabels, normalizeHref } from "../../data/widgetVariants";
import FallbackImage from "../app/FallbackImage.vue";
import HomeBuildInfo from "../app/HomeBuildInfo.vue";
import IconGlyph from "../app/IconGlyph.vue";
import HomeWidgetCatalog from "./HomeWidgetCatalog.vue";
import { homeWidgetComponents } from "./homeWidgetComponents";
import { homeWidgetProps } from "../../utils/homeWidgetProps";
import { findNearestWidgetPosition, widgetStyle } from "../../utils/homeGrid";
import {
  findCatalogVariant,
  variantStatus,
  variantWidget,
} from "../../utils/widgetCatalog";
import { showToast } from "../../lib/toast";

interface Props {
  siteData: SiteData;
  /** 只有本地开发服务器传入 true，生产静态站点不会显示编辑器。 */
  editable?: boolean;
  localConfig?: LocalConfig | null;
}

const props = withDefaults(defineProps<Props>(), {
  editable: false,
  localConfig: null,
});

const emit = defineEmits<{
  "config-change": [config: LocalConfig, persist?: boolean];
}>();

const isEditing = ref(false);
const isClient = ref(false);
const widgetCatalogOpen = ref(false);
const editorConfig = ref<LocalConfig>(
  cloneLocalConfig(props.localConfig ?? createEmptyLocalConfig()),
);
const gridElement = ref<HTMLElement | null>(null);
const draggingWidgetId = ref<string | null>(null);
const dragStartPoint = ref<{ x: number; y: number } | null>(null);
const dragMoved = ref(false);
const editToolbarContent = ref<HTMLElement | null>(null);
const editToolbarLeading = ref<HTMLElement | null>(null);
const editToolbarActions = ref<HTMLElement | null>(null);
const editToolbarWidth = ref<number | null>(null);
const editToolbarActionsWidth = ref(0);
let editToolbarResizeObserver: ResizeObserver | null = null;

/** 计算编辑工具栏所需的动态宽度样式。 */
const editToolbarStyle = computed<Record<string, string>>(() => {
  const style: Record<string, string> = {
    "--home-edit-actions-width": `${editToolbarActionsWidth.value}px`,
  };
  if (editToolbarWidth.value !== null) {
    style.width = `${editToolbarWidth.value}px`;
  }
  return style;
});

/**
 * 根据工具栏内容测量编辑操作区，避免展开时布局跳动。
 *
 * @returns 无返回值；元素未挂载时跳过测量。
 */
function measureEditToolbar(): void {
  const content = editToolbarContent.value;
  const leading = editToolbarLeading.value;
  const actions = editToolbarActions.value;
  if (!content || !leading || !actions) return;

  const actionsWidth = Math.ceil(actions.scrollWidth);
  if (actionsWidth !== editToolbarActionsWidth.value) {
    editToolbarActionsWidth.value = actionsWidth;
  }
  const leadingWidth = leading.getBoundingClientRect().width;
  const visibleActionsWidth = isEditing.value ? actionsWidth + 4 : 0;
  editToolbarWidth.value = Math.ceil(leadingWidth + visibleActionsWidth + 10);
}

/**
 * 返回组件在提示与操作中的显示名称。
 *
 * 跳转按钮读自定义标题、游戏资料读游戏名，其余用目录名称——
 * 详情页取消之后，这是唯一还会念出"这是哪张卡"的地方。
 *
 * @param widget - 需要生成名称的首页组件配置。
 * @returns 用于提示的显示名称。
 */
function widgetDisplayName(widget: HomeWidget): string {
  if (widget.type === "link") {
    return widget.settings?.link?.title?.trim() || widget.label;
  }
  if (widget.type === "game") {
    return hoyoGameLabels[widget.settings?.game?.game ?? "hsr"];
  }
  return widget.label;
}

/** 根据编辑状态选择配置组件或公开快照中的可见组件。 */
const activeWidgets = computed(() => {
  const widgets = isEditing.value
    ? editorConfig.value.widgets
    : props.siteData.homeWidgets;
  return widgets.filter(
    (widget) => widget.visible && homeWidgetComponents[widget.type],
  );
});

/** 计算当前首页网格需要的行数。 */
const gridRowCount = computed(() =>
  Math.max(
    HOME_GRID_ROWS,
    ...activeWidgets.value.map((widget) => widget.row + widget.rowSpan - 1),
  ),
);

/**
 * 将统一组件配置映射为具体首页组件所需的 props。
 *
 * 具体映射逻辑在共享工具 homeWidgetProps 中，与「添加组件」弹窗的
 * 实时预览共用，保证预览与实际渲染结果一致。
 *
 * @param widget - 当前要渲染的首页组件配置。
 * @returns 传给具体 Vue 组件的属性对象。
 */
function widgetProps(widget: HomeWidget): Record<string, unknown> {
  return homeWidgetProps(widget, {
    siteData: props.siteData,
    localConfig: props.localConfig,
    editable: props.editable,
    interactive: !isEditing.value,
  });
}

/**
 * 规范化编辑配置，并通知应用壳层更新运行时页面数据。
 *
 * @param nextConfig - 编辑器产生的下一份本地配置。
 * @param persist - 是否请求应用壳层持久化配置。
 * @returns 无返回值；事件载荷始终使用深拷贝后的规范化配置。
 */
function emitConfigChange(nextConfig: LocalConfig, persist = false): void {
  const normalized = normalizeLocalConfig(nextConfig);
  editorConfig.value = normalized;
  emit("config-change", cloneLocalConfig(normalized), persist);
}

/**
 * 打开首页编辑器并复制一份可回滚的本地配置。
 *
 * 顺带补齐"有 UID 但还没读到账号"的游戏卡：详情页取消之后，读取账号
 * 这件事只能自动发生，否则用户会看到一张空的游戏卡却无处可点。
 *
 * @returns 无返回值。
 */
function startEditing(): void {
  editorConfig.value = cloneLocalConfig(
    props.localConfig ?? createEmptyLocalConfig(),
  );
  isEditing.value = true;
  for (const widget of editorConfig.value.widgets) {
    if (widget.type !== "game") continue;
    if (!widget.settings?.game?.uid || widget.settings.game.account) continue;
    void syncGameAccount(widget.id);
  }
}

/**
 * 结束首页编辑，将编辑结果持久化并清理拖拽状态。
 *
 * @returns 无返回值；未处于编辑模式时直接结束。
 */
function stopEditing(): void {
  if (!isEditing.value) return;
  emitConfigChange(editorConfig.value, true);
  isEditing.value = false;
  widgetCatalogOpen.value = false;
  draggingWidgetId.value = null;
  showToast("首页布局已保存", "success", 2600, "home");
}

/**
 * 从首页布局中移除一个组件。
 *
 * @param widget - 需要移除的首页组件配置。
 * @returns 无返回值。
 */
function removeWidget(widget: HomeWidget): void {
  emitConfigChange({
    ...editorConfig.value,
    widgets: editorConfig.value.widgets.filter((item) => item.id !== widget.id),
  });
  showToast(
    `${widgetDisplayName(widget)} 已从首页移除`,
    "neutral",
    4000,
    "home",
  );
}

/**
 * 根据指针位置更新被拖拽组件的吸附网格位置。
 *
 * @param event - 当前指针移动事件。
 * @returns 无返回值；指针尚未超过拖拽阈值时不改变布局。
 */
function updateDragPosition(event: PointerEvent): void {
  const id = draggingWidgetId.value;
  const grid = gridElement.value;
  const widget = editorConfig.value.widgets.find((item) => item.id === id);
  if (!id || !grid || !widget || !dragStartPoint.value) return;
  const distance = Math.hypot(
    event.clientX - dragStartPoint.value.x,
    event.clientY - dragStartPoint.value.y,
  );
  if (!dragMoved.value && distance < 6) return;
  dragMoved.value = true;
  event.preventDefault();
  const rect = grid.getBoundingClientRect();
  const columns = HOME_GRID_COLUMNS;
  const rows = gridRowCount.value;
  const col =
    Math.floor(((event.clientX - rect.left) / rect.width) * columns) + 1;
  const row = Math.floor(((event.clientY - rect.top) / rect.height) * rows) + 1;
  const position = findNearestWidgetPosition(
    editorConfig.value.widgets,
    widget,
    col,
    row,
  );
  widget.col = position.col;
  widget.row = position.row;
}

/**
 * 结束拖拽并在组件确实移动后提交布局变更。
 *
 * @returns 无返回值；未发生实际移动时不会产生配置事件。
 */
function finishDrag(): void {
  if (!draggingWidgetId.value) return;
  const wasMoved = dragMoved.value;
  draggingWidgetId.value = null;
  dragStartPoint.value = null;
  dragMoved.value = false;
  window.removeEventListener("pointermove", updateDragPosition);
  window.removeEventListener("pointerup", finishDrag);
  window.removeEventListener("pointercancel", finishDrag);
  if (!wasMoved) return;
  emitConfigChange(editorConfig.value);
}

/**
 * 开始记录组件拖拽，并注册全局指针跟踪事件。
 *
 * @param event - 指针按下事件。
 * @param widget - 被拖拽的首页组件配置。
 * @returns 无返回值；非编辑模式下忽略操作。
 */
function startDrag(event: PointerEvent, widget: HomeWidget): void {
  if (!isEditing.value) return;
  event.preventDefault();
  draggingWidgetId.value = widget.id;
  dragStartPoint.value = { x: event.clientX, y: event.clientY };
  dragMoved.value = false;
  (event.currentTarget as HTMLElement).setPointerCapture?.(event.pointerId);
  window.addEventListener("pointermove", updateDragPosition);
  window.addEventListener("pointerup", finishDrag);
  window.addEventListener("pointercancel", finishDrag);
}

/**
 * 把添加窗口选中的变体落到首页网格上。
 *
 * 目录里一个类型只有一张卡，具体是哪个平台、哪款游戏由添加窗口决定，
 * 所以这里先按变体找回已有实例：隐藏过的卡走「重新启用」并把新填的内容
 * 写回去，没有实例就新建一张；两条路径共用同一套网格寻位算法。
 *
 * @param payload - 添加窗口给出的变体键与用户补填的字段值。
 * @returns 无返回值；组件位置由公共网格工具统一计算。
 */
function addWidget(payload: {
  key: string;
  values: Record<string, string>;
}): void {
  const match = findCatalogVariant(payload.key);
  if (!match) return;
  const { entry, variant } = match;
  if (variantStatus(editorConfig.value.widgets, entry, variant) === "added") {
    return;
  }

  const current = variantWidget(editorConfig.value.widgets, entry, variant);
  const base: HomeWidget =
    current ??
    createHomeWidget(
      variant.type,
      entry.definition.multi ? `${variant.id}-${Date.now()}` : variant.id,
    );
  const settings = variantSettings(base, payload.key, payload.values);
  const position = findNearestWidgetPosition(
    editorConfig.value.widgets,
    { ...base, settings },
    current?.col ?? base.col,
    current?.row ?? base.row,
  );
  const nextWidget: HomeWidget = {
    ...base,
    visible: true,
    col: position.col,
    row: position.row,
    settings,
  };

  // 目录保持打开，方便连续添加；卡片自身会切到「已添加」状态。
  emitConfigChange({
    ...editorConfig.value,
    widgets: current
      ? editorConfig.value.widgets.map((widget) =>
          widget.id === current.id ? nextWidget : widget,
        )
      : [...editorConfig.value.widgets, nextWidget],
  });
  showToast(
    `${widgetDisplayName(nextWidget)} 已加入首页`,
    "success",
    3200,
    "home",
  );

  // 游戏资料的账号数据只能自动读取：加完立刻拉一次，卡片随后自己长出来。
  if (nextWidget.type === "game") void syncGameAccount(nextWidget.id);
}

/**
 * 把变体预设和用户填写的内容合成一份组件设置。
 *
 * 变体决定平台、图标、色调和游戏；字段决定这一张的具体内容。重新启用
 * 一张隐藏的卡时以新填的为准，没填的沿用旧值，避免把已有内容抹成默认。
 *
 * @param widget - 目标组件骨架（新建或已有实例）。
 * @param key - 变体 id。
 * @param values - 用户补填的字段值。
 * @returns 该组件的设置对象；没有设置的组件返回 undefined。
 */
function variantSettings(
  widget: HomeWidget,
  key: string,
  values: Record<string, string>,
): HomeWidget["settings"] {
  const match = findCatalogVariant(key);
  if (!match) return widget.settings;
  const { variant } = match;

  if (variant.type === "link" && variant.link) {
    const previous = widget.settings?.link;
    const title = (values.title ?? previous?.title ?? variant.link.title).trim();
    return {
      link: {
        title: title || variant.link.title,
        subtitle: previous?.subtitle ?? "",
        href: normalizeHref(values.href ?? previous?.href ?? ""),
        platform: variant.link.platform,
        icon: variant.link.icon,
        tone: variant.link.tone,
        openInNewTab: previous?.openInNewTab ?? true,
      },
    };
  }

  if (variant.type === "game" && variant.game) {
    const previous = widget.settings?.game;
    const uid = (values.uid ?? previous?.uid ?? "").trim();
    return {
      game: {
        uid,
        game: variant.game,
        // 换了 UID 就别再挂着上一个账号的昵称，等新的读完再显示。
        account: previous?.uid === uid ? (previous?.account ?? null) : null,
      },
    };
  }

  return widget.settings;
}

/**
 * 读取某张游戏卡 UID 对应的公开账号摘要。
 *
 * 详情页取消之后，"读账号"没有按钮可点了，所以改由添加成功与进入编辑
 * 这两处自动触发；失败只发通知，不再阻塞编辑。
 *
 * @param widgetId - 需要刷新的游戏组件 id。
 * @returns 账号请求完成后结束。
 */
async function syncGameAccount(widgetId: string): Promise<void> {
  const widget = editorConfig.value.widgets.find(
    (item) => item.id === widgetId,
  );
  const uid = widget?.settings?.game?.uid?.trim();
  const game = (widget?.settings?.game?.game ?? "hsr") as HoyoGame;
  if (!widget || widget.type !== "game" || !uid) return;

  try {
    const response = await fetch("/__momona/sync-game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, game }),
    });
    const payload = (await response.json().catch(() => null)) as {
      account?: StarRailAccountData;
      message?: string;
    } | null;
    if (!response.ok || !payload?.account) {
      throw new Error(payload?.message || "账号数据暂时无法读取");
    }
    const account = payload.account;
    const nextWidgets = editorConfig.value.widgets.map((item) =>
      item.id === widgetId
        ? {
            ...item,
            settings: {
              ...item.settings,
              game: { ...item.settings?.game, uid, game, account },
            },
          }
        : item,
    );
    emitConfigChange({ ...editorConfig.value, widgets: nextWidgets });
    showToast(`${hoyoGameLabels[game]} 资料已读取`, "success", 3200, "game");
  } catch (error) {
    showToast(
      `${hoyoGameLabels[game]} 资料暂时读不到：${String(
        error instanceof Error ? error.message : error,
      )}`,
      "error",
      5000,
      "game",
    );
  }
}

watch(
  () => props.localConfig,
  (next) => {
    if (!isEditing.value && next) editorConfig.value = cloneLocalConfig(next);
  },
  { deep: true },
);

watch(isEditing, () => {
  void nextTick(measureEditToolbar);
});

onMounted(() => {
  isClient.value = true;
  void nextTick(() => {
    measureEditToolbar();
    if (typeof ResizeObserver === "undefined") return;
    editToolbarResizeObserver = new ResizeObserver(measureEditToolbar);
    if (editToolbarContent.value)
      editToolbarResizeObserver.observe(editToolbarContent.value);
    if (editToolbarLeading.value)
      editToolbarResizeObserver.observe(editToolbarLeading.value);
    if (editToolbarActions.value)
      editToolbarResizeObserver.observe(editToolbarActions.value);
  });
  window.addEventListener("resize", measureEditToolbar);
});

onBeforeUnmount(() => {
  window.removeEventListener("pointermove", updateDragPosition);
  window.removeEventListener("pointerup", finishDrag);
  window.removeEventListener("pointercancel", finishDrag);
  window.removeEventListener("resize", measureEditToolbar);
  editToolbarResizeObserver?.disconnect();
});
</script>

<template>
  <div class="home-page" :class="{ 'is-editing': isEditing }">
    <HomeBuildInfo />
    <div class="home-stage">
      <div class="home-content">
        <div class="home-grid-area">
          <header class="home-intro">
            <h1>Love on the page</h1>
            <div class="home-status glass-panel">
              <FallbackImage
                v-if="siteData.profile.name || siteData.profile.avatar"
                class="home-profile-image"
                :src="siteData.profile.avatar"
                :alt="siteData.profile.name || '个人头像'"
                fallback-icon="user"
                :icon-size="18"
              />
              <span v-if="siteData.profile.name">
                <strong>{{ siteData.profile.name }}</strong>
                <small v-if="siteData.profile.motto">{{
                  siteData.profile.motto
                }}</small>
              </span>
              <span v-else class="home-status-empty">暂无个人资料</span>
            </div>
            <div
              v-if="isClient && props.editable"
              class="home-edit-toolbar"
              :class="{ 'is-editing': isEditing }"
              :style="editToolbarStyle"
            >
              <div ref="editToolbarContent" class="home-edit-state">
                <button
                  ref="editToolbarLeading"
                  type="button"
                  class="home-edit-leading"
                  :aria-label="isEditing ? '编辑中' : '编辑首页'"
                  :disabled="isEditing"
                  :title="isEditing ? '编辑中' : '编辑首页'"
                  @click="startEditing"
                >
                  <IconGlyph name="pencil" :size="13" />
                  <span v-if="isEditing">编辑</span>
                </button>
                <div
                  ref="editToolbarActions"
                  class="home-edit-actions"
                  :class="{ 'is-visible': isEditing }"
                  :aria-hidden="!isEditing"
                >
                  <button
                    type="button"
                    class="home-edit-action"
                    :tabindex="isEditing ? 0 : -1"
                    title="添加组件"
                    @click="widgetCatalogOpen = true"
                  >
                    <IconGlyph name="plus" :size="13" />添加组件
                  </button>
                  <button
                    type="button"
                    class="home-edit-action is-primary"
                    :tabindex="isEditing ? 0 : -1"
                    title="退出编辑"
                    @click="stopEditing"
                  >
                    <IconGlyph name="check" :size="13" />完成
                  </button>
                </div>
              </div>
            </div>
          </header>

          <div
            ref="gridElement"
            class="home-grid"
            :style="{ '--home-grid-rows': String(gridRowCount) }"
          >
            <div
              v-for="(widget, index) in activeWidgets"
              :key="widget.id"
              class="home-slot"
              :class="{ 'is-dragging': draggingWidgetId === widget.id }"
              :data-widget="widget.type"
              :style="widgetStyle(widget, index)"
            >
              <component
                :is="homeWidgetComponents[widget.type]"
                v-bind="widgetProps(widget)"
              />
              <!--
                编辑态只加两样东西：一张盖住整卡的拖拽面（顺带拦住卡片内的
                链接，免得拖动时跳走），和右上角那一枚移除。卡片名不再显示——
                自己认得出来的卡不需要再报一遍名字。
              -->
              <div
                v-if="isEditing"
                class="home-slot-surface"
                :aria-label="`拖动${widgetDisplayName(widget)}`"
                @pointerdown="startDrag($event, widget)"
              ></div>
              <button
                v-if="isEditing"
                class="home-slot-remove"
                :class="{
                  'is-compact': widget.colSpan === 1 && widget.rowSpan === 1,
                }"
                type="button"
                :aria-label="`移除${widgetDisplayName(widget)}`"
                :title="`移除${widgetDisplayName(widget)}`"
                @pointerdown.stop
                @click.stop="removeWidget(widget)"
              >
                <IconGlyph name="x" :size="13" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>

    <HomeWidgetCatalog
      :open="isEditing && widgetCatalogOpen"
      :widgets="editorConfig.widgets"
      :site-data="props.siteData"
      :local-config="editorConfig"
      @close="widgetCatalogOpen = false"
      @add="addWidget"
    />
  </div>
</template>

<style scoped>
.home-page {
  display: flex;
  min-height: 100vh;
  min-height: 100svh;
  padding: 0 0 24px;
  align-items: flex-end;
}

.home-stage {
  width: min(1280px, calc(100vw - 160px));
  height: min(800px, calc(100svh - 48px));
  margin: 0 auto;
  padding: 8px;
}

.home-content {
  display: flex;
  height: 100%;
  flex-direction: column;
  justify-content: flex-start;
}

.home-intro {
  position: relative;
  display: flex;
  height: 60px;
  flex: 0 0 60px;
  align-items: end;
  padding: 0 4px 4px;
}

.home-intro h1 {
  position: absolute;
  top: -90px;
  bottom: auto;
  left: 4px;
  z-index: 0;
  margin: 0;
  /* 手写标题直接用主题色本体，不加暗、不叠透明度。 */
  color: var(--theme);
  font-family: "Momona Script", cursive;
  font-size: 6rem;
  font-weight: 700;
  line-height: 1.5;
  white-space: nowrap;
}

.home-grid-area {
  display: flex;
  width: 100%;
  flex: 0 0 auto;
  flex-direction: column;
  align-items: stretch;
  gap: 8px;
  margin-top: auto;
}

.home-status {
  z-index: 2;
  display: flex;
  width: 223px;
  height: 52px;
  margin-left: 0;
  padding: 8px 12px;
  align-items: center;
  gap: 9px;
}

.home-status > .home-profile-image {
  width: 30px;
  height: 30px;
  border: 1px solid rgba(255, 255, 255, 0.92);
  border-radius: 50%;
}

.home-status span {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.home-status-empty {
  color: var(--muted);
  font-size: 0.62rem;
}

.home-status strong,
.home-status small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-status strong {
  font-size: 0.72rem;
}

.home-status small {
  color: var(--muted);
  font-size: 0.55rem;
}

.home-grid {
  display: grid;
  width: 100%;
  min-height: 0;
  flex: 0 0 auto;
  aspect-ratio: 16 / var(--home-grid-rows);
  grid-template-columns: repeat(16, minmax(0, 1fr));
  grid-template-rows: repeat(var(--home-grid-rows), minmax(0, 1fr));
  grid-auto-rows: minmax(0, 1fr);
  grid-auto-flow: none;
}

.home-slot {
  position: relative;
  z-index: 1;
  grid-column: var(--widget-col-start) / span var(--widget-col-span);
  grid-row: var(--widget-row-start) / span var(--widget-row-span);
  min-width: 0;
  min-height: 0;
  padding: 4px;
  /*
   * 入场动画千万别写在这一层。
   *
   * 这是卡片的"祖先"。祖先一旦有 opacity < 1 / transform，就会成为 backdrop root，
   * 把后代 backdrop-filter 的采样范围切断到它自己内部 —— 卡片采不到背后的壁纸，
   * 磨砂会彻底消失（不是动画期间消失，是永远消失，因为 fill-mode 会把终态冻住）。
   * 实测：动画挂在这一层时，开关卡片 backdrop-filter 的像素差是 0.00。
   *
   * 所以第一段动画下沉到卡片自身（见下一条规则）。元素自己的 opacity 动画
   * 只是让模糊被自己的透明度稀释，不会切断采样（实测 opacity 0.625 时差值 0.97，
   * 静态时 2.92），动画结束自动恢复，全程没有跳变。
   */
}

.home-slot > *:first-child {
  width: 100%;
  height: 100%;
  min-height: 0;
}

/*
 * 入场动画直接挂在卡片上，和友链页 .friend-card 完全同构。
 *
 * 为什么这样就"模糊正常"：backdrop-filter 采样的是元素背后的内容，
 * 元素自己是合成层/半透明都不影响这件事，只有**祖先**加了这些才会切断。
 * 于是淡入、上浮、磨砂三者可以同时在场，不需要再补一段模糊动画。
 *
 * 只挑真的带毛玻璃的卡片：给普通元素临时塞动画本身无害，但没必要让
 * 不透明元素参与合成。
 */
.home-slot > .glass-panel,
.home-slot :deep(.home-friend-card-shell) {
  animation: home-widget-enter 0.56s cubic-bezier(0.22, 1, 0.36, 1) backwards;
  animation-delay: var(--widget-enter-delay, 0ms);
}

.home-slot.is-dragging {
  z-index: 4;
}

@keyframes home-widget-enter {
  from {
    opacity: 0;
    transform: translate3d(0, 10px, 0);
  }
  to {
    opacity: 1;
    transform: translate3d(0, 0, 0);
  }
}

@media (prefers-reduced-motion: reduce) {
  .home-slot > .glass-panel,
  .home-slot :deep(.home-friend-card-shell) {
    animation: none;
  }

  .home-edit-toolbar,
  .home-edit-state {
    transition-duration: 0.01ms;
  }
}

/*
 * 拖拽面：整张卡就是把手，所以没有可见手柄——它是一层透明的抓取层，
 * 顺带拦住卡片内部的链接，免得拖动时把页面带走。
 */
.home-slot-surface {
  position: absolute;
  z-index: 5;
  inset: 4px;
  border-radius: 14px;
  cursor: grab;
  touch-action: none;
}

.home-slot.is-dragging .home-slot-surface {
  cursor: grabbing;
}

/*
 * "可拖"用卡片自身的外描边表达，而不是在卡上再画一圈：outline 会跟着
 * 卡片自己的圆角走，13px 的小方卡和 20px 的横卡都不会出现"框和卡打架"。
 */
.home-page.is-editing .home-slot > *:first-child {
  outline: 1px dashed color-mix(in srgb, var(--theme-strong) 32%, transparent);
  outline-offset: 3px;
}

.home-page.is-editing .home-slot:hover > *:first-child {
  outline: 1px solid color-mix(in srgb, var(--theme) 58%, transparent);
}

.home-page.is-editing .home-slot.is-dragging > *:first-child {
  outline: 2px solid color-mix(in srgb, var(--theme) 78%, transparent);
}

/*
 * 移除：hover 才浮出来的一枚小圆片，压在卡片右上角。
 * 触屏没有 hover，`(hover: none)` 下常驻显示，否则根本没法删。
 */
/*
 * 移除：编辑态里唯一的实色圆片。底色直接用主题色、图标反白，
 * 在任何一张卡（浅色、深色、图片）上都读得出来；白色描边是它和卡片之间
 * 那道缝，投影则说明它浮在卡上而不是卡的一部分。
 */
.home-slot-remove {
  position: absolute;
  z-index: 6;
  top: 8px;
  right: 8px;
  display: grid;
  width: 24px;
  height: 24px;
  padding: 0;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.92);
  border-radius: 50%;
  color: var(--theme-on);
  background: var(--theme);
  box-shadow:
    0 1px 2px rgba(31, 25, 64, 0.22),
    0 5px 14px color-mix(in srgb, var(--theme) 42%, transparent);
  cursor: pointer;
  opacity: 0;
  transform: scale(0.9);
  transition:
    opacity 0.16s ease,
    transform 0.16s ease,
    background 0.16s ease,
    box-shadow 0.16s ease;
}

.home-slot:hover .home-slot-remove,
.home-slot-remove:focus-visible {
  opacity: 1;
  transform: scale(1);
}

.home-slot-remove:hover {
  background: var(--theme-hover);
  box-shadow:
    0 1px 2px rgba(31, 25, 64, 0.24),
    0 7px 18px color-mix(in srgb, var(--theme) 52%, transparent);
}

.home-slot-remove:active {
  background: var(--theme-active);
  transform: scale(0.94);
}

/* 1×1 的小方卡只有 70 上下，24 的圆片会盖掉右上角一大块，缩一档。 */
.home-slot-remove.is-compact {
  top: 5px;
  right: 5px;
  width: 20px;
  height: 20px;
}

.home-slot-remove:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--theme) 60%, transparent);
  outline-offset: 2px;
}

@media (hover: none) {
  .home-slot-remove {
    opacity: 1;
    transform: none;
  }
}

/**
 * 编辑工具条：玻璃材质的小窗框，浮在首页右下角。
 *
 * 这里是一次「光与墨」的分工演示——工具条自己浮在壁纸上，所以外沿用白光
 * 和投影立住；里面的按钮坐在玻璃上，用半透明底和墨色字区分，不再各自加白边。
 * 强调色只给「完成」（结束编辑这个会话终结动作），添加组件保持中性，
 * 这样工具条里只有一个实色点。
 */
.home-edit-toolbar {
  position: absolute;
  z-index: 32;
  top: auto;
  right: 4px;
  bottom: 4px;
  display: flex;
  min-height: 40px;
  padding: 4px;
  align-items: center;
  gap: 4px;
  border: 1px solid rgba(255, 255, 255, 0.86);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.74);
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.7) inset,
    0 0 0 1px rgba(52, 42, 96, 0.05),
    0 12px 32px rgba(54, 45, 106, 0.16),
    0 2px 6px rgba(54, 45, 106, 0.06);
  backdrop-filter: var(--glass-blur);
  transition:
    width 0.32s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    background 0.16s ease;
  will-change: width;
}

.home-edit-toolbar.is-editing {
  top: auto;
  right: 4px;
  bottom: 4px;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.7) inset,
    0 0 0 1px rgba(52, 42, 96, 0.05),
    0 16px 40px rgba(54, 45, 106, 0.18),
    0 2px 6px rgba(54, 45, 106, 0.06);
}

.home-edit-state {
  display: inline-flex;
  flex: 0 0 auto;
  min-height: 30px;
  align-items: center;
}

.home-edit-leading {
  display: inline-flex;
  min-width: 30px;
  min-height: 30px;
  padding: 0 6px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 0;
  border-radius: 10px;
  /* 可点击时才有颜色：未进入编辑是入口，进入后变成灰色状态指示。 */
  color: var(--theme-strong);
  background: transparent;
  font-size: 0.6875rem;
  font-weight: 640;
  white-space: nowrap;
  transition:
    color 0.16s ease,
    background 0.16s ease;
}

.home-edit-leading:hover:not(:disabled) {
  background: color-mix(in srgb, var(--theme) 10%, transparent);
}

/* 编辑态下它是状态而不是动作，撤掉强调色。 */
.home-edit-leading:disabled {
  color: var(--muted);
  cursor: default;
}

.home-edit-actions {
  display: inline-flex;
  max-width: 0;
  margin-left: 0;
  overflow: hidden;
  align-items: center;
  gap: 4px;
  flex: 0 0 auto;
  opacity: 0;
  transform: translate3d(10px, 0, 0) scale(0.96);
  pointer-events: none;
  visibility: hidden;
  will-change: max-width, opacity, transform;
  transition:
    max-width 0.32s cubic-bezier(0.22, 1, 0.36, 1),
    margin-left 0.32s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.2s ease,
    transform 0.28s cubic-bezier(0.22, 1, 0.36, 1),
    visibility 0s linear 0s;
}

.home-edit-actions.is-visible {
  max-width: var(--home-edit-actions-width, 180px);
  margin-left: 4px;
  opacity: 1;
  transform: translate3d(0, 0, 0) scale(1);
  pointer-events: auto;
  visibility: visible;
  transition:
    max-width 0.32s cubic-bezier(0.22, 1, 0.36, 1),
    margin-left 0.32s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.22s ease,
    transform 0.28s cubic-bezier(0.22, 1, 0.36, 1),
    visibility 0s linear 0s;
}

.home-edit-action {
  display: inline-flex;
  min-height: 30px;
  padding: 0 10px;
  align-items: center;
  gap: 5px;
  border: 1px solid transparent;
  border-radius: 10px;
  color: var(--muted-strong);
  background: transparent;
  font-size: 0.6875rem;
  font-weight: 600;
  white-space: nowrap;
  transition:
    color 0.16s ease,
    background 0.16s ease,
    box-shadow 0.16s ease;
}

.home-edit-action:hover,
.home-edit-action.is-quiet:hover {
  color: var(--theme-strong);
  background: rgba(255, 255, 255, 0.72);
}

/* 工具条里唯一的实色：结束编辑。它前面所有动作都保持中性。 */
.home-edit-action.is-primary {
  color: var(--theme-on);
  background: var(--theme);
  box-shadow: 0 4px 12px color-mix(in srgb, var(--theme) 26%, transparent);
}

.home-edit-action.is-primary:hover {
  color: var(--theme-on);
  background: var(--theme-hover);
  box-shadow: 0 6px 16px color-mix(in srgb, var(--theme) 30%, transparent);
}

.home-edit-action.is-primary:active {
  background: var(--theme-active);
  transform: scale(0.97);
}

.home-masthead,
.home-heading,
.home-kicker,
.home-profile-pill {
  display: none;
}

.home-page :deep(.home-greeting),
.home-page :deep(.home-weather-card),
.home-page :deep(.home-feed-card),
.home-page :deep(.home-collection-card),
.home-page :deep(.home-friend-card),
.home-page :deep(.home-agent-card),
.home-page :deep(.home-music-card),
.home-page :deep(.home-game-card),
.home-page :deep(.home-activities),
.home-page :deep(.home-media-pair-card),
.home-page :deep(.home-link-card),
.home-page :deep(.home-github-card),
.home-page :deep(.home-bilibili-card) {
  min-height: 0;
}

.home-page :deep(.home-kicker),
.home-page :deep(.home-profile-pill) {
  display: none;
}

.home-page :deep(.home-activities) {
  overflow: hidden;
}

.home-page :deep(.glass-panel) {
  border-radius: 13px;
}

@media (max-width: 1199px) and (min-width: 821px) {
  .home-page {
    padding-right: 24px;
    padding-left: 24px;
  }

  .home-stage {
    width: min(1280px, calc(100vw - 160px));
  }
}

@media (max-width: 820px) {
  .home-page {
    display: block;
    min-height: 0;
    /*
     * 底部留白 = 导航栏高度 58 + 距底 14 + 视觉间距 16。
     * 主导航是 fixed 的，原来只留 28px，滚到最底时最后一张卡会被它压住。
     */
    padding: 28px 28px calc(88px + env(safe-area-inset-bottom, 0px));
    align-items: initial;
  }

  .home-stage {
    width: 100%;
    height: auto;
    min-height: 0;
    margin: 0;
    padding: 0;
  }

  .home-content {
    height: auto;
    gap: 0;
  }

  .home-intro {
    height: 184px;
    flex: 0 0 184px;
    padding: 0;
  }

  .home-intro h1 {
    top: -7px;
    right: auto;
    bottom: auto;
    left: 0;
    max-width: 100%;
    font-size: clamp(3.2rem, 15vw, 4rem);
    line-height: 0.9;
  }

  .home-status {
    position: relative;
    margin-left: 4px;
  }

  .home-grid-area {
    gap: 12px;
    margin-top: 0;
  }

  .home-grid {
    min-height: 0;
    aspect-ratio: auto;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-template-rows: none;
    grid-auto-rows: 164px;
    grid-auto-flow: row;
    gap: 8px;
  }

  .home-slot {
    grid-column: span var(--widget-mobile-col-span);
    grid-row: auto / span var(--widget-mobile-row-span);
    padding: 0;
  }

  .home-slot-surface {
    inset: 0;
  }

  .home-slot-remove {
    top: 6px;
    right: 6px;
  }

  .home-edit-toolbar {
    top: auto;
    right: 4px;
    bottom: 4px;
  }

  .home-edit-toolbar.is-editing {
    top: auto;
    right: 4px;
    bottom: 4px;
  }

  .home-edit-toolbar.is-editing {
    max-width: calc(100vw - 24px);
    overflow-x: auto;
  }

  .home-edit-status {
    display: none;
  }

  .home-edit-action {
    flex: 0 0 auto;
  }
}

@media (prefers-reduced-motion: reduce) {
  .home-edit-toolbar,
  .home-edit-leading,
  .home-edit-actions,
  .home-edit-actions.is-visible {
    transition-duration: 0.01ms;
    transition-delay: 0s;
  }
}
</style>
