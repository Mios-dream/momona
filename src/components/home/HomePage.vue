<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import type { Component } from "vue";
import {
  HOME_GRID_COLUMNS,
  HOME_GRID_ROWS,
  createHomeWidget,
  homeWidgetDefinitions,
} from "../../data/homeWidgets";
import {
  cloneLocalConfig,
  createEmptyLocalConfig,
  normalizeLocalConfig,
} from "../../data/localConfig";
import type {
  HomeWidget,
  HomeWidgetType,
  LocalConfig,
  SiteData,
  StarRailAccountData,
} from "../../data/types";
import FallbackImage from "../app/FallbackImage.vue";
import IconGlyph from "../app/IconGlyph.vue";
import HomeActivities from "./HomeActivities.vue";
import HomeAgentCard from "./HomeAgentCard.vue";
import HomeBilibiliCard from "./HomeBilibiliCard.vue";
import HomeCollectionCard from "./HomeCollectionCard.vue";
import HomeFeedCard from "./HomeFeedCard.vue";
import HomeFriendCard from "./HomeFriendCard.vue";
import HomeGameCard from "./HomeGameCard.vue";
import HomeGithubCard from "./HomeGithubCard.vue";
import HomeGreeting from "./HomeGreeting.vue";
import HomeLinkCard from "./HomeLinkCard.vue";
import HomeMediaPairCard from "./HomeMediaPairCard.vue";
import HomeMusicCard from "./HomeMusicCard.vue";
import HomeWeatherCard from "./HomeWeatherCard.vue";
import HomeWidgetEditor from "./HomeWidgetEditor.vue";
import {
  findNearestWidgetPosition,
  widgetStyle,
} from "../../utils/homeGrid";

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

const widgetComponents: Record<HomeWidgetType, Component> = {
  greeting: HomeGreeting,
  feed: HomeFeedCard,
  friend: HomeFriendCard,
  agent: HomeAgentCard,
  collection: HomeCollectionCard,
  weather: HomeWeatherCard,
  media: HomeMediaPairCard,
  music: HomeMusicCard,
  game: HomeGameCard,
  activities: HomeActivities,
  link: HomeLinkCard,
  github: HomeGithubCard,
  bilibili: HomeBilibiliCard,
};

const isEditing = ref(false);
const isClient = ref(false);
const widgetCatalogOpen = ref(false);
const selectedWidgetId = ref<string | null>(null);
const editorConfig = ref<LocalConfig>(
  cloneLocalConfig(props.localConfig ?? createEmptyLocalConfig()),
);
const gridElement = ref<HTMLElement | null>(null);
const draggingWidgetId = ref<string | null>(null);
const dragStartPoint = ref<{ x: number; y: number } | null>(null);
const dragMoved = ref(false);
const suppressWidgetClick = ref(false);
let suppressWidgetClickTimer: number | null = null;
const gameBusy = ref(false);
const gameError = ref("");
const editorNotice = ref("");
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

/** 读取当前正在编辑的首页组件。 */
const selectedWidget = computed(() =>
  editorConfig.value.widgets.find(
    (widget) => widget.id === selectedWidgetId.value,
  ),
);

/**
 * 返回组件在编辑提示中使用的显示名称。
 *
 * @param widget - 需要生成名称的首页组件配置。
 * @returns 链接组件的自定义标题或组件默认标签。
 */
function widgetDisplayName(widget: HomeWidget): string {
  return widget.type === "link"
    ? widget.settings?.link?.title?.trim() || widget.label
    : widget.label;
}

/** 暴露首页组件目录供编辑器渲染。 */
const widgetCatalogDefinitions = computed(() => homeWidgetDefinitions);

/** 根据编辑状态选择配置组件或公开快照中的可见组件。 */
const activeWidgets = computed(() => {
  const widgets = isEditing.value
    ? editorConfig.value.widgets
    : props.siteData.homeWidgets;
  return widgets.filter(
    (widget) => widget.visible && widgetComponents[widget.type],
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
 * @param widget - 当前要渲染的首页组件配置。
 * @returns 传给具体 Vue 组件的属性对象。
 */
function widgetProps(widget: HomeWidget): Record<string, unknown> {
  switch (widget.type) {
    case "feed":
      return { repositories: props.siteData.repositories };
    case "collection":
      return { stats: props.siteData.homeMedia.bangumi };
    case "activities":
      return { activities: props.siteData.activities };
    case "friend":
      return {
        friends: props.siteData.friends,
        interval: widget.settings?.friend?.interval,
      };
    case "agent":
      return { profile: props.siteData.profile };
    case "media":
      return { stats: props.siteData.homeMedia.netease };
    case "game":
      return {
        settings: widget.settings?.game,
        interactive: !isEditing.value,
      };
    case "music":
      return {
        track: props.siteData.music,
        catalog: props.siteData.musicCatalog,
        editable: props.editable,
      };
    case "link":
      return {
        settings:
          widget.settings?.link ?? createHomeWidget("link").settings?.link,
      };
    case "github":
      return {
        repositories: props.siteData.repositories,
        sort:
          props.localConfig?.sources.github.content.githubRepositorySort ??
          "updated",
      };
    case "bilibili":
      return {
        videos: props.siteData.libraryTiles.filter(
          (tile) =>
            tile.id.startsWith("bilibili-") ||
            tile.subtitle.toLocaleLowerCase().includes("bilibili"),
        ),
      };
    default:
      return {};
  }
}

/**
 * 规范化编辑配置，并通知应用壳层更新运行时页面数据。
 *
 * @param nextConfig - 编辑器产生的下一份本地配置。
 * @param notice - 需要在编辑器中显示的短提示。
 * @param persist - 是否请求应用壳层持久化配置。
 * @returns 无返回值；事件载荷始终使用深拷贝后的规范化配置。
 */
function emitConfigChange(
  nextConfig: LocalConfig,
  notice = "",
  persist = false,
): void {
  const normalized = normalizeLocalConfig(nextConfig);
  editorConfig.value = normalized;
  emit("config-change", cloneLocalConfig(normalized), persist);
  if (notice) editorNotice.value = notice;
}

/**
 * 打开首页编辑器并复制一份可回滚的本地配置。
 *
 * @returns 无返回值。
 */
function startEditing(): void {
  editorConfig.value = cloneLocalConfig(
    props.localConfig ?? createEmptyLocalConfig(),
  );
  isEditing.value = true;
  editorNotice.value = "";
}

/**
 * 结束首页编辑，将编辑结果持久化并清理选择状态。
 *
 * @returns 无返回值；未处于编辑模式时直接结束。
 */
function stopEditing(): void {
  if (!isEditing.value) return;
  emitConfigChange(editorConfig.value, "", true);
  isEditing.value = false;
  widgetCatalogOpen.value = false;
  selectedWidgetId.value = null;
  draggingWidgetId.value = null;
  editorNotice.value = "";
}

/**
 * 选中一个首页组件并打开对应设置面板。
 *
 * @param widget - 用户点击的首页组件配置。
 * @returns 无返回值；非编辑模式下忽略点击。
 */
function openWidgetEditor(widget: HomeWidget): void {
  if (!isEditing.value) return;
  selectedWidgetId.value = widget.id;
  gameError.value = "";
}

/**
 * 用编辑器返回的组件配置替换当前组件。
 *
 * @param widget - 编辑器返回的最新组件配置。
 * @returns 无返回值；变更通过统一配置事件提交。
 */
function updateWidget(widget: HomeWidget): void {
  const next = editorConfig.value.widgets.map((item) =>
    item.id === widget.id ? widget : item,
  );
  emitConfigChange({ ...editorConfig.value, widgets: next });
}

/**
 * 从首页布局中移除一个组件。
 *
 * @param widget - 需要移除的首页组件配置。
 * @returns 无返回值；同时清理当前选中状态。
 */
function removeWidget(widget: HomeWidget): void {
  selectedWidgetId.value = null;
  emitConfigChange(
    {
      ...editorConfig.value,
      widgets: editorConfig.value.widgets.filter(
        (item) => item.id !== widget.id,
      ),
    },
    `${widgetDisplayName(widget)} 已从首页移除`,
  );
}

/**
 * 移除当前选中的组件。
 *
 * @returns 无返回值；没有选中组件时不执行操作。
 */
function removeSelectedWidget(): void {
  if (selectedWidget.value) removeWidget(selectedWidget.value);
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

  suppressWidgetClick.value = true;
  if (suppressWidgetClickTimer !== null) {
    window.clearTimeout(suppressWidgetClickTimer);
  }
  suppressWidgetClickTimer = window.setTimeout(() => {
    suppressWidgetClick.value = false;
    suppressWidgetClickTimer = null;
  }, 450);
  emitConfigChange(editorConfig.value, "组件位置已吸附");
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
 * 处理组件表面点击，区分拖拽结束后的误触发。
 *
 * @param event - 组件表面点击事件。
 * @param widget - 被点击的首页组件配置。
 * @returns 无返回值；拖拽后的短暂窗口内会阻止误点击。
 */
function handleWidgetSurfaceClick(
  event: MouseEvent,
  widget: HomeWidget,
): void {
  if (suppressWidgetClick.value) {
    event.preventDefault();
    event.stopPropagation();
    suppressWidgetClick.value = false;
    if (suppressWidgetClickTimer !== null) {
      window.clearTimeout(suppressWidgetClickTimer);
      suppressWidgetClickTimer = null;
    }
    return;
  }
  openWidgetEditor(widget);
}

/**
 * 返回组件目录中某类组件的当前状态文案。
 *
 * @param type - 组件目录中的组件类型。
 * @returns 添加、已启用或可启用等状态文案。
 */
function widgetCatalogState(type: HomeWidgetType): string {
  if (type === "link") return "新增";
  const current = editorConfig.value.widgets.find(
    (widget) => widget.type === type,
  );
  return current ? (current.visible ? "已启用" : "可启用") : "可添加";
}

/**
 * 判断组件目录中的添加按钮是否应被禁用。
 *
 * @param type - 组件目录中的组件类型。
 * @returns 当前类型已经存在可见组件时返回 true。
 */
function isWidgetCatalogDisabled(type: HomeWidgetType): boolean {
  if (type === "link") return false;
  return editorConfig.value.widgets.some(
    (widget) => widget.type === type && widget.visible,
  );
}

/**
 * 新增或重新启用一个首页组件，并为其寻找可用位置。
 *
 * @param type - 需要新增或重新启用的组件类型。
 * @returns 无返回值；组件位置由公共网格工具统一计算。
 */
function addWidget(type: HomeWidgetType): void {
  const current = editorConfig.value.widgets.find(
    (widget) => widget.type === type,
  );
  let nextWidgets = editorConfig.value.widgets.slice();
  let addedLabel = type === "link" ? "跳转按钮" : widgetCatalogState(type);

  if (current && type !== "link") {
    const position = findNearestWidgetPosition(
      editorConfig.value.widgets,
      current,
      current.col,
      current.row,
    );
    const nextWidget = {
      ...current,
      visible: true,
      col: position.col,
      row: position.row,
    };
    addedLabel = widgetDisplayName(nextWidget);
    nextWidgets = nextWidgets.map((widget) =>
      widget.id === current.id ? nextWidget : widget,
    );
  } else {
    const widget = createHomeWidget(
      type,
      type === "link" ? `link-${Date.now()}` : type,
    );
    const position = findNearestWidgetPosition(
      editorConfig.value.widgets,
      widget,
      widget.col,
      widget.row,
    );
    nextWidgets.push({
      ...widget,
      visible: true,
      col: position.col,
      row: position.row,
    });
    addedLabel = widgetDisplayName(widget);
  }

  widgetCatalogOpen.value = false;
  emitConfigChange(
    { ...editorConfig.value, widgets: nextWidgets },
    `${addedLabel} 已加入首页`,
  );
}

/**
 * 为选中的游戏组件读取 UID 对应的公开账号摘要。
 *
 * @param uid - 游戏账号 UID。
 * @returns 账号请求完成后结束；失败信息写入编辑器状态。
 */
async function fetchGameAccount(uid: string): Promise<void> {
  const widget = selectedWidget.value;
  if (!widget || widget.type !== "game" || !uid) return;
  gameBusy.value = true;
  gameError.value = "";
  try {
    const response = await fetch("/__momona/sync-game", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ uid, game: widget.settings?.game?.game ?? "hsr" }),
    });
    const payload = (await response.json().catch(() => null)) as {
      account?: StarRailAccountData;
      message?: string;
    } | null;
    if (!response.ok || !payload?.account) {
      throw new Error(payload?.message || "账号数据暂时无法读取");
    }
    updateWidget({
      ...widget,
      settings: {
        ...widget.settings,
        game: {
          ...widget.settings?.game,
          uid,
          game: widget.settings?.game?.game ?? "hsr",
          account: payload.account,
        },
      },
    });
  } catch (error) {
    gameError.value = String(error instanceof Error ? error.message : error);
  } finally {
    gameBusy.value = false;
  }
}

/**
 * 响应 Escape 键关闭当前首页组件编辑器。
 *
 * @param event - 浏览器键盘事件。
 * @returns 无返回值；只处理 Escape 键。
 */
function handleKeydown(event: KeyboardEvent): void {
  if (event.key === "Escape" && selectedWidgetId.value) {
    selectedWidgetId.value = null;
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

if (typeof window !== "undefined")
  window.addEventListener("keydown", handleKeydown);

onBeforeUnmount(() => {
  window.removeEventListener("pointermove", updateDragPosition);
  window.removeEventListener("pointerup", finishDrag);
  window.removeEventListener("pointercancel", finishDrag);
  window.removeEventListener("keydown", handleKeydown);
  window.removeEventListener("resize", measureEditToolbar);
  editToolbarResizeObserver?.disconnect();
  if (suppressWidgetClickTimer !== null) {
    window.clearTimeout(suppressWidgetClickTimer);
  }
});
</script>

<template>
  <div class="home-page" :class="{ 'is-editing': isEditing }">
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
                  <IconGlyph name="pencil" :size="14" />
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
                    @click="widgetCatalogOpen = !widgetCatalogOpen"
                  >
                    <IconGlyph name="plus" :size="14" />添加组件
                  </button>
                  <button
                    type="button"
                    class="home-edit-action is-quiet"
                    :tabindex="isEditing ? 0 : -1"
                    title="退出编辑"
                    @click="stopEditing"
                  >
                    <IconGlyph name="check" :size="14" />完成
                  </button>
                </div>
              </div>
              <Transition name="home-widget-catalog">
                <div
                  v-if="widgetCatalogOpen"
                  class="home-widget-catalog"
                  @click.stop
                >
                  <div class="home-widget-catalog-head">
                    <div>
                      <strong>添加组件</strong>
                      <small>选择后会直接放入首页网格。</small>
                    </div>
                    <button
                      type="button"
                      class="home-widget-catalog-close"
                      aria-label="关闭组件目录"
                      title="关闭组件目录"
                      @click="widgetCatalogOpen = false"
                    >
                      <IconGlyph name="x" :size="14" />
                    </button>
                  </div>
                  <div class="home-widget-catalog-grid">
                    <article
                      v-for="definition in widgetCatalogDefinitions"
                      :key="definition.type"
                      class="home-widget-catalog-item"
                    >
                      <div>
                        <strong>{{ definition.label }}</strong>
                        <small>{{ definition.description }}</small>
                      </div>
                      <button
                        type="button"
                        :disabled="isWidgetCatalogDisabled(definition.type)"
                        @click="addWidget(definition.type)"
                      >
                        <IconGlyph
                          :name="
                            isWidgetCatalogDisabled(definition.type)
                              ? 'check'
                              : 'plus'
                          "
                          :size="13"
                        />{{ widgetCatalogState(definition.type) }}
                      </button>
                    </article>
                  </div>
                </div>
              </Transition>
              <Transition name="home-edit-notice">
                <small v-if="editorNotice" class="home-edit-notice">{{
                  editorNotice
                }}</small>
              </Transition>
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
              :class="{
                'is-selected': selectedWidgetId === widget.id,
                'is-dragging': draggingWidgetId === widget.id,
              }"
              :data-widget="widget.type"
              :style="widgetStyle(widget, index)"
            >
              <component
                :is="widgetComponents[widget.type]"
                v-bind="widgetProps(widget)"
              />
              <div
                v-if="isEditing"
                class="home-widget-editor-surface"
                :class="{
                  'is-compact': widget.colSpan === 1 && widget.rowSpan === 1,
                }"
                @click="handleWidgetSurfaceClick($event, widget)"
              >
                <div class="home-widget-editor-label">
                  {{ widgetDisplayName(widget) }}
                </div>
                <div class="home-widget-editor-actions">
                  <button
                    class="home-widget-handle"
                    type="button"
                    :aria-label="`拖动${widgetDisplayName(widget)}`"
                    :title="`拖动${widgetDisplayName(widget)}`"
                    @pointerdown.stop="startDrag($event, widget)"
                    @click.stop
                  >
                    <IconGlyph name="gripVertical" :size="15" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <Transition name="home-editor-panel">
      <HomeWidgetEditor
        v-if="isEditing && selectedWidget"
        :widget="selectedWidget"
        :game-busy="gameBusy"
        :game-error="gameError"
        @close="selectedWidgetId = null"
        @remove="removeSelectedWidget"
        @update:widget="updateWidget"
        @fetch-game="fetchGameAccount"
      />
    </Transition>
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
  color: rgba(70, 72, 139, 0.8);
  font-family: "Momona Script", "Momona Flourish", cursive;
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
  background: rgba(255, 255, 255, 0.76);
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
}

.home-slot > *:first-child {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.home-slot.is-selected {
  z-index: 4;
}

.home-slot.is-selected > *:first-child,
.home-slot.is-dragging > *:first-child {
  outline: 2px solid rgba(117, 100, 222, 0.72);
  outline-offset: 2px;
}

:deep(.home-editor-panel-enter-active),
:deep(.home-editor-panel-leave-active) {
  will-change: opacity, transform;
  transition:
    opacity 0.24s ease,
    transform 0.3s cubic-bezier(0.22, 1, 0.36, 1);
}

:deep(.home-editor-panel-enter-from),
:deep(.home-editor-panel-leave-to) {
  opacity: 0;
  transform: translate3d(28px, 0, 0) scale(0.985);
}

@media (prefers-reduced-motion: reduce) {
  :deep(.home-editor-panel-enter-active),
  :deep(.home-editor-panel-leave-active) {
    transition-duration: 0.01ms;
  }

  .home-edit-toolbar,
  .home-edit-state,
  .home-widget-catalog-enter-active,
  .home-widget-catalog-leave-active,
  .home-edit-notice-enter-active,
  .home-edit-notice-leave-active {
    transition-duration: 0.01ms;
  }
}

.home-widget-editor-surface {
  position: absolute;
  z-index: 5;
  inset: 4px;
  display: flex;
  padding: 7px;
  align-items: flex-start;
  justify-content: space-between;
  gap: 6px;
  border: 1px dashed rgba(85, 65, 181, 0.52);
  border-radius: 10px;
  color: var(--purple-deep);
  background: rgba(255, 255, 255, 0.1);
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background 0.18s ease;
}

.home-widget-editor-surface:hover {
  border-color: rgba(85, 65, 181, 0.85);
  background: rgba(255, 255, 255, 0.18);
}

.home-widget-editor-surface.is-compact {
  padding: 3px;
  align-items: flex-start;
  justify-content: flex-end;
}

.home-widget-editor-surface.is-compact .home-widget-editor-label {
  display: none;
}

.home-widget-editor-surface.is-compact .home-widget-editor-actions {
  justify-content: flex-end;
}

.home-widget-editor-label {
  max-width: calc(100% - 72px);
  overflow: hidden;
  padding: 3px 6px;
  border-radius: 6px;
  color: var(--purple-deep);
  background: rgba(255, 255, 255, 0.83);
  font-size: 0.52rem;
  font-weight: 780;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-widget-editor-actions {
  display: inline-flex;
  flex: 0 0 auto;
  gap: 4px;
}

.home-widget-handle {
  display: grid;
  width: 25px;
  height: 25px;
  padding: 0;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.86);
  border-radius: 7px;
  color: var(--purple-deep);
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 5px 12px rgba(54, 45, 106, 0.1);
}

.home-widget-editor-surface.is-compact .home-widget-handle {
  width: 22px;
  height: 22px;
}

.home-widget-handle {
  cursor: grab;
}

.home-widget-handle:active {
  cursor: grabbing;
}

.home-widget-handle:hover {
  background: #fff;
}

.home-edit-toolbar {
  position: absolute;
  z-index: 32;
  top: auto;
  right: 4px;
  bottom: 4px;
  display: flex;
  min-height: 38px;
  padding: 4px;
  align-items: center;
  gap: 4px;
  border: 1px solid rgba(255, 255, 255, 0.9);
  border-radius: 11px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 13px 28px rgba(54, 45, 106, 0.14);
  backdrop-filter: blur(18px) saturate(135%);
  transition:
    width 0.32s cubic-bezier(0.22, 1, 0.36, 1),
    border-color 0.24s ease,
    box-shadow 0.24s ease,
    background 0.24s ease;
  will-change: width;
}

.home-edit-toolbar.is-editing {
  top: auto;
  right: 4px;
  bottom: 4px;
  box-shadow: 0 16px 32px rgba(54, 45, 106, 0.16);
}

.home-edit-state {
  display: inline-flex;
  flex: 0 0 auto;
  min-height: 29px;
  align-items: center;
}

.home-edit-leading {
  display: inline-flex;
  min-height: 29px;
  padding: 0 5px;
  align-items: center;
  gap: 5px;
  border: 0;
  border-radius: 7px;
  color: var(--purple-deep);
  background: transparent;
  font-size: 0.57rem;
  white-space: nowrap;
  transition:
    color 0.18s ease,
    background 0.18s ease;
}

.home-edit-leading:hover:not(:disabled) {
  background: rgba(117, 100, 222, 0.1);
}

.home-edit-leading:disabled {
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

.home-widget-catalog {
  position: absolute;
  z-index: 40;
  top: calc(100% + 8px);
  right: 0;
  width: min(330px, calc(100vw - 32px));
  max-height: min(430px, calc(100svh - 100px));
  padding: 12px;
  overflow: auto;
  border: 1px solid rgba(255, 255, 255, 0.92);
  border-radius: 12px;
  background: rgba(252, 253, 255, 0.94);
  box-shadow: 0 22px 48px rgba(47, 45, 91, 0.2);
  backdrop-filter: blur(22px) saturate(135%);
}

.home-widget-catalog-enter-active,
.home-widget-catalog-leave-active {
  transform-origin: top right;
  will-change: opacity, transform;
  transition:
    opacity 0.18s ease,
    transform 0.24s cubic-bezier(0.22, 1, 0.36, 1);
}

.home-widget-catalog-enter-from,
.home-widget-catalog-leave-to {
  opacity: 0;
  transform: translate3d(0, -8px, 0) scale(0.97);
}

.home-widget-catalog-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.home-widget-catalog-head > div {
  display: grid;
  gap: 3px;
}

.home-widget-catalog-head strong {
  font-size: 0.64rem;
}

.home-widget-catalog-head small {
  color: var(--muted);
  font-size: 0.54rem;
}

.home-widget-catalog-close {
  display: grid;
  width: 27px;
  height: 27px;
  padding: 0;
  place-items: center;
  border: 1px solid rgba(118, 126, 151, 0.18);
  border-radius: 7px;
  color: var(--muted-strong);
  background: rgba(255, 255, 255, 0.7);
}

.home-widget-catalog-close:hover {
  color: var(--purple-deep);
  background: #fff;
}

.home-widget-catalog-grid {
  display: grid;
  margin-top: 10px;
  gap: 6px;
}

.home-widget-catalog-item {
  display: flex;
  min-width: 0;
  padding: 8px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-radius: 8px;
  background: rgba(245, 246, 252, 0.72);
}

.home-widget-catalog-item > div {
  display: grid;
  min-width: 0;
  gap: 3px;
}

.home-widget-catalog-item strong,
.home-widget-catalog-item small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-widget-catalog-item strong {
  font-size: 0.58rem;
}

.home-widget-catalog-item small {
  color: var(--muted);
  font-size: 0.5rem;
}

.home-widget-catalog-item > button {
  display: inline-flex;
  min-height: 27px;
  padding: 0 7px;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  border: 1px solid rgba(117, 100, 222, 0.18);
  border-radius: 7px;
  color: var(--purple-deep);
  background: rgba(117, 100, 222, 0.08);
  font-size: 0.52rem;
}

.home-widget-catalog-item > button:disabled {
  cursor: default;
  color: var(--green);
  background: rgba(53, 165, 123, 0.08);
}

.home-edit-action {
  display: inline-flex;
  min-height: 29px;
  padding: 0 8px;
  align-items: center;
  gap: 5px;
  border: 1px solid transparent;
  border-radius: 7px;
  color: var(--muted-strong);
  background: transparent;
  font-size: 0.57rem;
  white-space: nowrap;
}

.home-edit-action:hover,
.home-edit-action.is-quiet:hover {
  color: var(--purple-deep);
  background: rgba(117, 100, 222, 0.1);
}

.home-edit-action.is-primary {
  color: var(--purple-deep);
  background: rgba(117, 100, 222, 0.1);
}

.home-edit-notice {
  position: absolute;
  top: calc(100% + 7px);
  right: 0;
  padding: 6px 8px;
  border-radius: 7px;
  color: #27815f;
  background: rgba(247, 255, 251, 0.9);
  box-shadow: 0 8px 18px rgba(54, 45, 106, 0.1);
  font-size: 0.55rem;
  white-space: nowrap;
}

.home-edit-notice-enter-active,
.home-edit-notice-leave-active {
  will-change: opacity, transform;
  transition:
    opacity 0.16s ease,
    transform 0.2s ease;
}

.home-edit-notice-enter-from,
.home-edit-notice-leave-to {
  opacity: 0;
  transform: translateY(-4px) scale(0.98);
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

@media (max-width: 980px) and (min-width: 821px) {
  .home-page {
    padding-right: 24px;
    padding-left: 24px;
  }

  .home-stage {
    width: 100%;
  }
}

@media (max-width: 820px) {
  .home-page {
    display: block;
    min-height: 0;
    padding: 28px 28px 28px;
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

  .home-widget-editor-surface {
    inset: 0;
  }

  :deep(.home-editor-panel-enter-from),
  :deep(.home-editor-panel-leave-to) {
    transform: translate3d(0, 24px, 0) scale(0.985);
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
