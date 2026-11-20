<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { variantFieldValid } from "../../data/widgetVariants";
import type { HomeWidget, IconName, LocalConfig, SiteData } from "../../data/types";
import { homeWidgetPreviewProps } from "../../utils/homeWidgetProps";
import {
  variantFields,
  variantStatus,
  type WidgetCatalogEntry,
  type WidgetCatalogStatus,
} from "../../utils/widgetCatalog";
import IconGlyph from "../app/IconGlyph.vue";
import MoField from "../ui/MoField.vue";
import { homeWidgetComponents } from "./homeWidgetComponents";

/**
 * 组件详情页：目录里点「添加」之后翻到的这一页。
 *
 * 目录卡只有一张缩略图，判断"要不要、长什么样、选哪一种"在这里完成：
 * 左边是这一页的主角——按真实网格比例缩放的组件本体，右列是变体与字段，
 * 改任何一项预览立刻跟着变。选哪一个和填什么是同一屏里的两件事，
 * 所以不分步、不再叠一层窗口。
 *
 * 没有变体、没有字段的组件也进这一页：右列整列不渲染，预览占满整页——
 * 那不是空页，是"看一眼再带走"。
 */
interface Props {
  /** 正在查看的目录条目。 */
  entry: WidgetCatalogEntry;
  /** 编辑器当前的组件列表，用来标出哪些变体已经加过。 */
  widgets: HomeWidget[];
  /** 首页已读到的数据；预览要画的是"装到首页的样子"。 */
  siteData: SiteData;
  /** 编辑中的配置，预览里的排序等设置项要跟首页一致。 */
  localConfig?: LocalConfig | null;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  back: [];
  add: [payload: { key: string; values: Record<string, string> }];
}>();

/** 预览放大的上限：再大就不是"看一眼实物"，而是把一张卡糊到墙上。 */
const PREVIEW_MAX_SCALE = 1.6;

/** 没有设置列时，画布上只剩这一张卡，可以再放大一档。 */
const PREVIEW_SOLO_SCALE = 1.95;

const stageRef = ref<HTMLElement | null>(null);
const pageRef = ref<HTMLElement | null>(null);
/** 预览画布的实际尺寸，用来算等比缩放；随窗口变化重新测量。 */
const stageBox = ref({ width: 0, height: 0, inset: 28 });
/** 当前选中的变体 id。 */
const selectedKey = ref(props.entry.variants[0]?.id ?? "");
/** 字段草稿，按字段键存值。 */
const draft = ref<Record<string, string>>({});
let stageObserver: ResizeObserver | null = null;

/** 当前选中的变体。 */
const selectedVariant = computed(
  () => props.entry.variants.find((item) => item.id === selectedKey.value) ?? null,
);

/** 选中变体需要补填的字段。 */
const fields = computed(() =>
  selectedVariant.value ? variantFields(selectedVariant.value) : [],
);

/** 这一页有没有可调项；没有就整列不渲染，预览占满。 */
const hasSettings = computed(
  () => props.entry.variants.length > 1 || fields.value.length > 0,
);

/** 每个变体是否已经加过；已加过的选项不能再点。 */
const variantStates = computed<Record<string, WidgetCatalogStatus>>(() => {
  const map: Record<string, WidgetCatalogStatus> = {};
  for (const variant of props.entry.variants) {
    map[variant.id] = variantStatus(props.widgets, props.entry, variant);
  }
  return map;
});

/** 预览用的属性：变体预设 + 用户正在填的内容 + 页面已读到的数据。 */
const previewProps = computed(() =>
  homeWidgetPreviewProps(
    props.entry.definition.type,
    selectedVariant.value ?? undefined,
    draft.value,
    { siteData: props.siteData, localConfig: props.localConfig },
  ),
);

/**
 * 计算预览的等比缩放样式。
 *
 * 组件按真实网格尺寸排版，再整体缩放到画布内，所以预览里的间距、
 * 字号、圆角都和落到首页之后一致——它不是在"模拟"这张卡，它就是这张卡。
 * 没有设置列的页面上，预览是唯一的内容，可以再放大一档。
 *
 * @returns 直接绑定到预览内层的样式对象。
 */
const previewStyle = computed<Record<string, string>>(() => {
  const { width, height, inset } = stageBox.value;
  const frame = props.entry.frame;
  const fit = Math.min(
    (width - inset * 2) / frame.width,
    (height - inset * 2) / frame.height,
    hasSettings.value ? PREVIEW_MAX_SCALE : PREVIEW_SOLO_SCALE,
  );
  const scale = Number.isFinite(fit) && fit > 0 ? fit : 0.6;
  return {
    width: `${frame.width}px`,
    height: `${frame.height}px`,
    "--detail-scale": scale.toFixed(4),
  };
});

/** 已填字段里第一个不合格的提示；空串表示没有问题可报。 */
const problem = computed(() => {
  for (const spec of fields.value) {
    const value = (draft.value[spec.key] ?? "").trim();
    if (!value || variantFieldValid(spec.key, value)) continue;
    if (spec.key === "uid") return "UID 是 6-12 位数字";
    if (spec.key === "href") return "地址看起来不完整";
    return "名称太长";
  }
  return "";
});

/** 全部必填字段都合格时才允许提交。 */
const canSubmit = computed(
  () =>
    Boolean(selectedVariant.value) &&
    fields.value.every((spec) =>
      variantFieldValid(spec.key, draft.value[spec.key] ?? ""),
    ),
);

/** 当前变体已经加过时，按钮说的是"重新启用"而不是"添加"。 */
const submitLabel = computed(() => {
  const key = selectedVariant.value?.id;
  return key && variantStates.value[key] === "hidden" ? "重新启用" : "添加";
});

/**
 * 读取变体的图标：跳转按钮用平台自己的图标，其余回落到组件图标。
 *
 * @param variant - 当前变体。
 * @returns 图标语义名称。
 */
function variantIcon(variant: { link?: { icon: IconName } }): IconName {
  return variant.link?.icon ?? props.entry.definition.icon;
}

/**
 * 测量预览画布，并把 CSS 里的留白读回来。
 *
 * 留白写在样式表里（窄屏更小），测量时读一次，两处就不会各写一个数字。
 *
 * @returns 无返回值；画布未挂载时跳过。
 */
function measureStage(): void {
  const stage = stageRef.value;
  if (!stage) return;
  const inset = Number.parseFloat(
    getComputedStyle(stage).getPropertyValue("--stage-inset"),
  );
  stageBox.value = {
    width: stage.clientWidth,
    height: stage.clientHeight,
    inset: Number.isFinite(inset) ? inset : 28,
  };
}

/**
 * 切换变体：清空草稿，因为不同变体要填的东西不是一回事。
 *
 * @param id - 目标变体 id。
 * @returns 无返回值；目标已经加过时忽略。
 */
function selectVariant(id: string): void {
  if (variantStates.value[id] === "added") return;
  selectedKey.value = id;
  draft.value = {};
}

/**
 * 提交添加：把变体键与字段值交给目录，由目录再交给首页。
 *
 * @returns 无返回值；校验未通过时不提交。
 */
function submit(): void {
  if (!canSubmit.value || !selectedVariant.value) return;
  emit("add", { key: selectedVariant.value.id, values: { ...draft.value } });
}

watch(
  () => props.entry,
  (entry) => {
    // 默认落在第一个"还没加过"的变体上，连续添加时少点一次。
    const open =
      entry.variants.find(
        (variant) => variantStatus(props.widgets, entry, variant) === "available",
      ) ?? entry.variants[0];
    selectedKey.value = open?.id ?? "";
    draft.value = {};
    void nextTick(measureStage);
  },
  { immediate: true },
);

onMounted(() => {
  void nextTick(() => {
    measureStage();
    // 翻页之后焦点要从"卡片上的添加按钮"（已 inert）挪进这一页，
    // 否则键盘用户按 Tab 会从文档开头重新走一遍。这一页只有一个字段时
    // 直接落在它上面，用户不用先找一遍输入框；触屏不抢焦点，
    // 免得一打开就弹软键盘把预览顶掉一半。
    const input = pageRef.value?.querySelector<HTMLInputElement>(
      ".detail-fields input",
    );
    if (input && window.matchMedia("(pointer: fine)").matches) {
      input.focus({ preventScroll: true });
      return;
    }
    pageRef.value?.focus({ preventScroll: true });
  });
  if (typeof ResizeObserver !== "undefined") {
    stageObserver = new ResizeObserver(measureStage);
    if (stageRef.value) stageObserver.observe(stageRef.value);
  }
});

onBeforeUnmount(() => {
  stageObserver?.disconnect();
  stageObserver = null;
});
</script>

<template>
  <section
    ref="pageRef"
    class="detail-page"
    tabindex="-1"
    :aria-label="`${props.entry.label}详情`"
  >
    <header class="detail-head">
      <button
        type="button"
        class="detail-back"
        aria-label="返回组件列表"
        title="返回组件列表"
        @click="emit('back')"
      >
        <IconGlyph name="arrowLeft" :size="15" />
      </button>
      <h2 class="detail-title">{{ props.entry.label }}</h2>
      <button
        type="button"
        class="m-btn m-btn--primary detail-submit"
        :disabled="!canSubmit"
        @click="submit"
      >
        {{ submitLabel }}
      </button>
    </header>

    <div class="detail-body" :class="{ 'is-solo': !hasSettings }">
      <div ref="stageRef" class="detail-stage">
        <div
          class="detail-frame"
          :style="previewStyle"
          aria-hidden="true"
          inert
        >
          <component
            :is="homeWidgetComponents[props.entry.definition.type]"
            v-bind="previewProps"
          />
        </div>
      </div>

      <aside v-if="hasSettings" class="detail-side">
        <div v-if="props.entry.variants.length > 1" class="detail-group">
          <p v-if="props.entry.variantGroup" class="detail-caption">
            {{ props.entry.variantGroup }}
          </p>
          <div class="detail-chips">
            <button
              v-for="variant in props.entry.variants"
              :key="variant.id"
              type="button"
              class="detail-chip"
              :class="{
                'is-active': variant.id === selectedKey,
                'is-taken': variantStates[variant.id] === 'added',
              }"
              :disabled="variantStates[variant.id] === 'added'"
              :aria-pressed="variant.id === selectedKey"
              @click="selectVariant(variant.id)"
            >
              <IconGlyph
                :name="
                  variantStates[variant.id] === 'added'
                    ? 'check'
                    : variantIcon(variant)
                "
                :size="13"
              />{{ variant.label }}
            </button>
          </div>
        </div>

        <div v-if="fields.length" class="detail-fields" @keydown.enter="submit">
          <MoField
            v-for="spec in fields"
            :key="spec.key"
            v-model="draft[spec.key]"
            :label="spec.label"
            :placeholder="spec.placeholder"
            :input-mode="spec.inputMode"
            :max-length="spec.maxLength"
            autocomplete="off"
          />
        </div>

        <p v-if="problem" class="detail-problem">{{ problem }}</p>
      </aside>
    </div>
  </section>
</template>

<style scoped>
/*
 * 这一层是"另一张纸"：整体实白，盖住身后还在的列表。
 * 半透会让底下的卡片标题、搜索框透上来，页面就不成立了。
 */
.detail-page {
  position: absolute;
  z-index: 2;
  inset: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #fff;
  color: var(--cat-ink, #1a2133);
}

/* 这一层只作为焦点落点，本身不是一个可点的东西，所以不画光圈。 */
.detail-page:focus {
  outline: none;
}

/* ---- 页头：返回 + 名称 + 唯一的行动色 ---- */

.detail-head {
  display: flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 8px;
  padding: 13px 16px 13px 12px;
  border-bottom: 1px solid var(--cat-line, rgba(19, 26, 45, 0.078));
  background: linear-gradient(180deg, #f6f8fd, #ffffff);
}

.detail-back {
  display: grid;
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  padding: 0;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 9px;
  background: transparent;
  color: var(--cat-ink-soft, #545d72);
  cursor: pointer;
  transition:
    background 0.16s ease,
    border-color 0.16s ease,
    color 0.16s ease;
}

.detail-back:hover {
  border-color: rgba(19, 26, 45, 0.08);
  background: #eef2f9;
  color: var(--cat-ink, #1a2133);
}

.detail-back:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme) 22%, transparent);
}

.detail-title {
  margin: 0;
  flex: 1;
  min-width: 0;
  color: var(--cat-ink, #1a2133);
  font-size: 1.05rem;
  font-weight: 720;
  letter-spacing: -0.008em;
  line-height: 1.25;
}

.detail-submit {
  height: 32px;
  flex: 0 0 auto;
  padding: 0 15px;
  border-radius: 9px;
  font-size: 0.76rem;
}

/* 还不能提交时退成中性块：半透明的主色只会变成一块脏粉色，读不出"没轮到它"。 */
.detail-submit:disabled {
  opacity: 1;
  background: rgba(19, 26, 45, 0.07);
  color: var(--cat-muted, #8c93a7);
  box-shadow: none;
}

/* ---- 主体：画布 + 设置列 ---- */

.detail-body {
  display: flex;
  flex: 1;
  min-height: 0;
}

/* 画布沿用目录卡的内凹浅蓝：同一块"看实物"的地方，只是放大了。 */
.detail-stage {
  --stage-inset: 28px;
  position: relative;
  display: grid;
  flex: 1;
  min-width: 0;
  place-items: center;
  overflow: hidden;
  background: linear-gradient(180deg, #e8edf7, #dde5f2);
  box-shadow:
    0 3px 9px rgba(31, 26, 64, 0.07) inset,
    0 -1px 0 rgba(255, 255, 255, 0.5) inset;
}

.detail-frame {
  position: absolute;
  top: 50%;
  left: 50%;
  overflow: hidden;
  border-radius: 14px;
  box-shadow:
    0 1px 0 rgba(255, 255, 255, 0.6),
    0 18px 40px rgba(31, 26, 64, 0.2);
  transform: translate(-50%, -50%) scale(var(--detail-scale, 0.6));
  pointer-events: none;
}

/*
 * 组件在首页是撑满格子渲染的（见 .home-slot > *:first-child），
 * 预览要跟着撑满，否则卡片只按 min-height 出图，下面空出一条——
 * 那条空隙在首页并不存在，预览就不该凭空造出来。
 */
.detail-frame > :first-child {
  width: 100%;
  height: 100%;
  min-height: 0;
}

.detail-side {
  display: flex;
  width: 340px;
  flex: 0 0 auto;
  padding: 20px 20px 24px;
  flex-direction: column;
  gap: 18px;
  overflow-y: auto;
  overscroll-behavior: contain;
  border-left: 1px solid var(--cat-line, rgba(19, 26, 45, 0.078));
  background: #fff;
  scrollbar-width: thin;
  scrollbar-color: rgba(19, 26, 45, 0.16) transparent;
}

.detail-caption {
  margin: 0 0 9px;
  color: var(--cat-muted, #8c93a7);
  font-size: 0.68rem;
  font-weight: 620;
}

.detail-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* 变体是一组并列的选项，不是一排按钮：小圆角、图标贴字，选中才实色。 */
.detail-chip {
  display: inline-flex;
  height: 32px;
  align-items: center;
  gap: 6px;
  padding: 0 11px;
  border: 1px solid var(--cat-line, rgba(19, 26, 45, 0.078));
  border-radius: 9px;
  background: #fff;
  color: var(--cat-ink, #1a2133);
  font-size: 0.76rem;
  font-weight: 560;
  cursor: pointer;
  transition:
    background 0.16s ease,
    border-color 0.16s ease,
    color 0.16s ease,
    box-shadow 0.16s ease;
}

.detail-chip:hover:not(:disabled):not(.is-active) {
  border-color: rgba(19, 26, 45, 0.16);
  background: #f6f8fc;
}

.detail-chip.is-active {
  border-color: transparent;
  color: var(--theme-on, #fff);
  background: var(--theme);
  font-weight: 640;
  box-shadow: 0 4px 10px color-mix(in srgb, var(--theme) 26%, transparent);
}

.detail-chip.is-taken {
  color: var(--cat-muted, #8c93a7);
  background: rgba(19, 26, 45, 0.035);
  cursor: default;
}

.detail-chip:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme) 22%, transparent);
}

.detail-fields {
  display: grid;
  gap: 12px;
}

/* 输入框按"纸面"重绘：凹槽 + 墨线 + 内阴影，和设置页的字段同一套语言。 */
.detail-fields :deep(.mo-field) {
  gap: 6px;
  color: var(--cat-ink-soft, #545d72);
  font-size: 0.7rem;
  font-weight: 640;
}

.detail-fields :deep(.mo-field-control) {
  height: 38px;
  padding: 0 11px;
  border: 1px solid var(--cat-line, rgba(19, 26, 45, 0.078));
  border-radius: 9px;
  background: #f4f6fb;
  box-shadow: 0 1px 2px rgba(33, 27, 68, 0.05) inset;
  color: var(--cat-ink, #1a2133);
  font-size: 0.8rem;
  font-weight: 500;
}

.detail-fields :deep(.mo-field-control:hover:not(:disabled)) {
  border-color: rgba(19, 26, 45, 0.14);
}

.detail-fields :deep(.mo-field-control:focus) {
  border-color: color-mix(in srgb, var(--theme) 55%, #fff);
  background: #fff;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--theme) 12%, transparent);
}

.detail-problem {
  margin: -6px 0 0;
  color: #bd455b;
  font-size: 0.7rem;
}

/* ---- 窄屏：先看预览，再往下走设置 ---- */

@media (max-width: 900px) {
  .detail-stage {
    --stage-inset: 18px;
    flex: 0 0 40%;
    border-bottom: 1px solid var(--cat-line, rgba(19, 26, 45, 0.078));
  }

  .detail-body {
    flex-direction: column;
  }

  /* 没有设置列时，下半屏没有别的内容可放，画布占满整页就不会留一块白板。 */
  .detail-body.is-solo .detail-stage {
    flex: 1;
    border-bottom: 0;
  }

  .detail-side {
    width: 100%;
    flex: 1;
    min-height: 0;
    padding: 16px 16px 22px;
    border-left: 0;
  }

  .detail-title {
    font-size: 0.95rem;
  }
}

@media (prefers-reduced-motion: reduce) {
  .detail-chip,
  .detail-back {
    transition-duration: 0.01ms;
  }
}
</style>
