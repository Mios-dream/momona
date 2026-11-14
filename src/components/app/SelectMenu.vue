<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from "vue";
import IconGlyph from "./IconGlyph.vue";

interface SelectOption {
  /** 选项提交值。 */
  value: string;
  /** 选项展示文案。 */
  label: string;
}

interface Props {
  /** 当前选中值。 */
  modelValue: string;
  /** 可选项列表。 */
  options: SelectOption[];
  /** 触发器上方的小标题。 */
  label?: string;
  /** 未选中任何选项时的占位文案。 */
  placeholder?: string;
  /** 触发器的无障碍名称，缺省时由可见 label 表达。 */
  ariaLabel?: string;
  /** 是否禁用交互。 */
  disabled?: boolean;
  /** 菜单最小宽度，默认与触发器同宽。 */
  menuMinWidth?: number;
  /** 菜单最大高度。 */
  menuMaxHeight?: number;
}

const props = withDefaults(defineProps<Props>(), {
  label: "",
  placeholder: "请选择",
  ariaLabel: undefined,
  disabled: false,
  menuMinWidth: 168,
  menuMaxHeight: 232,
});

const emit = defineEmits<{
  "update:modelValue": [value: string];
  change: [value: string];
}>();

const menuId = useId();
const isOpen = ref(false);
const activeIndex = ref(-1);
const triggerRef = ref<HTMLButtonElement | null>(null);
const menuRef = ref<HTMLElement | null>(null);
const menuStyle = ref<Record<string, string>>({});

const selectedOption = computed(
  () => props.options.find((option) => option.value === props.modelValue) ?? null,
);

/**
 * 生成选项元素 id，供 aria-activedescendant 引用。
 *
 * @param index - 选项在列表中的下标。
 * @returns 该选项在页面内的唯一 id。
 */
function optionId(index: number): string {
  return `${menuId}-option-${index}`;
}

/**
 * 把当前高亮项滚动到菜单可视区域内。
 *
 * @returns 无返回值；菜单尚未挂载时不处理。
 */
function scrollActiveIntoView(): void {
  const menu = menuRef.value;
  const option = menu?.children[activeIndex.value];
  if (!(menu instanceof HTMLElement) || !(option instanceof HTMLElement)) return;
  const menuBox = menu.getBoundingClientRect();
  const optionBox = option.getBoundingClientRect();
  if (optionBox.top < menuBox.top) {
    menu.scrollTop -= menuBox.top - optionBox.top;
  } else if (optionBox.bottom > menuBox.bottom) {
    menu.scrollTop += optionBox.bottom - menuBox.bottom;
  }
}

/**
 * 依据触发器位置计算菜单坐标，空间不足时向上弹出并裁剪高度。
 *
 * @returns 无返回值；触发器未挂载时直接结束。
 */
function updateMenuPosition(): void {
  const trigger = triggerRef.value;
  if (!trigger) return;

  const viewportPadding = 8;
  const rect = trigger.getBoundingClientRect();
  const width = Math.max(rect.width, props.menuMinWidth);
  const left = Math.min(
    Math.max(viewportPadding, rect.left),
    Math.max(viewportPadding, window.innerWidth - width - viewportPadding),
  );
  const estimatedHeight = Math.min(
    props.menuMaxHeight,
    props.options.length * 30 + 10,
  );
  const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
  const spaceAbove = rect.top - viewportPadding;
  const openAbove = spaceBelow < estimatedHeight && spaceAbove > spaceBelow;
  const maxHeight = Math.min(
    props.menuMaxHeight,
    Math.max(120, (openAbove ? spaceAbove : spaceBelow) - 6),
  );

  menuStyle.value = openAbove
    ? {
        left: `${left}px`,
        bottom: `${window.innerHeight - rect.top + 6}px`,
        width: `${width}px`,
        maxHeight: `${maxHeight}px`,
      }
    : {
        left: `${left}px`,
        top: `${rect.bottom + 6}px`,
        width: `${width}px`,
        maxHeight: `${maxHeight}px`,
      };
}

/**
 * 展开菜单并定位，同时把高亮项设为当前选中值。
 *
 * @param preferLast - 由 ArrowUp 触发时优先高亮最后一项。
 * @returns 无返回值；禁用或已展开时忽略。
 */
function openMenu(preferLast = false): void {
  if (props.disabled || isOpen.value) return;
  isOpen.value = true;
  const current = props.options.findIndex(
    (option) => option.value === props.modelValue,
  );
  activeIndex.value =
    current >= 0 ? current : preferLast ? props.options.length - 1 : 0;
  void nextTick(() => {
    updateMenuPosition();
    menuRef.value?.focus({ preventScroll: true });
    scrollActiveIntoView();
  });
}

/**
 * 收起菜单。
 *
 * @param returnFocus - 是否需要把焦点交还触发器。
 * @returns 无返回值；未展开时不处理。
 */
function closeMenu(returnFocus = false): void {
  if (!isOpen.value) return;
  isOpen.value = false;
  activeIndex.value = -1;
  if (returnFocus) {
    void nextTick(() => triggerRef.value?.focus({ preventScroll: true }));
  }
}

/**
 * 切换菜单展开状态。
 *
 * @returns 无返回值。
 */
function toggleMenu(): void {
  if (isOpen.value) closeMenu();
  else openMenu();
}

/**
 * 选中选项并向父组件同步值。
 *
 * @param option - 被点击或回车确认的选项。
 * @returns 无返回值；值未变化时只收起菜单。
 */
function selectOption(option: SelectOption): void {
  const changed = option.value !== props.modelValue;
  closeMenu(true);
  if (!changed) return;
  emit("update:modelValue", option.value);
  emit("change", option.value);
}

/**
 * 处理触发器键盘操作：方向键直接展开菜单并聚焦。
 *
 * @param event - 触发器的键盘事件。
 * @returns 无返回值。
 */
function handleTriggerKeydown(event: KeyboardEvent): void {
  if (props.disabled) return;
  if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
  event.preventDefault();
  openMenu(event.key === "ArrowUp");
}

/**
 * 处理菜单内键盘导航。
 *
 * @param event - 菜单容器的键盘事件。
 * @returns 无返回值。
 */
function handleMenuKeydown(event: KeyboardEvent): void {
  const lastIndex = props.options.length - 1;
  switch (event.key) {
    case "ArrowDown":
      event.preventDefault();
      activeIndex.value = Math.min(activeIndex.value + 1, lastIndex);
      scrollActiveIntoView();
      break;
    case "ArrowUp":
      event.preventDefault();
      activeIndex.value = Math.max(activeIndex.value - 1, 0);
      scrollActiveIntoView();
      break;
    case "Home":
      event.preventDefault();
      activeIndex.value = 0;
      scrollActiveIntoView();
      break;
    case "End":
      event.preventDefault();
      activeIndex.value = lastIndex;
      scrollActiveIntoView();
      break;
    case "Enter":
    case " ": {
      event.preventDefault();
      const option = props.options[activeIndex.value];
      if (option) selectOption(option);
      break;
    }
    case "Escape":
      /* 拦住冒泡，避免宿主面板把 Esc 当成"收起自己"的指令。 */
      event.preventDefault();
      event.stopPropagation();
      closeMenu(true);
      break;
    case "Tab":
      closeMenu();
      break;
    default:
      break;
  }
}

/**
 * 点击菜单与触发器之外的区域时收起菜单。
 *
 * @param event - 文档级指针按下事件。
 * @returns 无返回值。
 */
function handleDocumentPointerDown(event: PointerEvent): void {
  const target = event.target;
  if (!(target instanceof Node)) return;
  if (triggerRef.value?.contains(target) || menuRef.value?.contains(target)) {
    return;
  }
  closeMenu();
}

/**
 * 页面滚动或尺寸变化时重新对齐菜单，避免菜单与触发器脱节。
 *
 * @param event - 文档级滚动事件。
 * @returns 无返回值；滚动来源在菜单内部时不处理。
 */
function handleViewportChange(event: Event): void {
  const target = event.target;
  if (target instanceof Node && menuRef.value?.contains(target)) return;
  updateMenuPosition();
}

/**
 * 绑定或解绑全局监听，只在菜单展开期间生效。
 *
 * @param open - 菜单是否处于展开状态。
 * @returns 无返回值。
 */
function syncGlobalListeners(open: boolean): void {
  if (open) {
    document.addEventListener("pointerdown", handleDocumentPointerDown);
    window.addEventListener("resize", updateMenuPosition);
    document.addEventListener("scroll", handleViewportChange, true);
    return;
  }
  document.removeEventListener("pointerdown", handleDocumentPointerDown);
  window.removeEventListener("resize", updateMenuPosition);
  document.removeEventListener("scroll", handleViewportChange, true);
}

watch(isOpen, syncGlobalListeners);

onBeforeUnmount(() => syncGlobalListeners(false));
</script>

<template>
  <div class="select-menu" :class="{ 'is-open': isOpen, 'is-disabled': props.disabled }">
    <span v-if="props.label" class="select-menu-label">{{ props.label }}</span>

    <button
      ref="triggerRef"
      type="button"
      class="select-menu-trigger"
      role="combobox"
      aria-haspopup="listbox"
      :aria-expanded="isOpen"
      :aria-controls="menuId"
      :aria-label="props.ariaLabel"
      :disabled="props.disabled"
      @click="toggleMenu"
      @keydown="handleTriggerKeydown"
    >
      <span class="select-menu-value" :class="{ 'is-placeholder': !selectedOption }">
        {{ selectedOption?.label ?? props.placeholder }}
      </span>
      <IconGlyph name="chevronDown" :size="12" class="select-menu-chevron" />
    </button>

    <Teleport to="body">
      <Transition name="select-menu-pop">
        <div
          v-if="isOpen"
          :id="menuId"
          ref="menuRef"
          class="select-menu-list"
          role="listbox"
          tabindex="-1"
          :style="menuStyle"
          :aria-activedescendant="
            activeIndex >= 0 ? optionId(activeIndex) : undefined
          "
          @keydown="handleMenuKeydown"
          @pointerdown.stop
        >
          <button
            v-for="(option, index) in props.options"
            :id="optionId(index)"
            :key="option.value"
            type="button"
            class="select-menu-option"
            :class="{
              'is-selected': option.value === props.modelValue,
              'is-active': index === activeIndex,
            }"
            role="option"
            :aria-selected="option.value === props.modelValue"
            tabindex="-1"
            @pointerenter="activeIndex = index"
            @click="selectOption(option)"
          >
            <span class="select-menu-option-label">{{ option.label }}</span>
            <IconGlyph
              v-if="option.value === props.modelValue"
              name="check"
              :size="12"
              class="select-menu-check"
            />
          </button>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>

<style scoped>
.select-menu {
  display: grid;
  min-width: 0;
  gap: 4px;
}

.select-menu-label {
  color: var(--muted);
  font-size: 0.52rem;
}

.select-menu-trigger {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: 31px;
  padding: 0 8px;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  border: 1px solid rgba(118, 126, 151, 0.18);
  border-radius: 8px;
  color: var(--ink-soft);
  background: rgba(255, 255, 255, 0.76);
  text-align: left;
  transition:
    border-color 0.16s ease,
    background 0.16s ease,
    box-shadow 0.16s ease;
}

.select-menu-trigger:hover {
  border-color: rgba(117, 100, 222, 0.28);
  background: rgba(255, 255, 255, 0.92);
}

.select-menu-trigger:focus-visible,
.select-menu.is-open .select-menu-trigger {
  border-color: rgba(117, 100, 222, 0.42);
  background: rgba(255, 255, 255, 0.96);
  box-shadow: 0 0 0 3px rgba(117, 100, 222, 0.12);
  outline: none;
}

.select-menu-value {
  overflow: hidden;
  font-size: 0.55rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.select-menu-value.is-placeholder {
  color: var(--muted);
}

.select-menu-chevron {
  flex: 0 0 auto;
  color: var(--muted);
  transition: transform 0.18s ease;
}

.select-menu.is-open .select-menu-chevron {
  color: var(--purple-deep);
  transform: rotate(180deg);
}

.select-menu.is-disabled {
  opacity: 0.55;
}

.select-menu.is-disabled .select-menu-trigger {
  cursor: not-allowed;
}
</style>

<style>
/* 菜单通过 Teleport 挂到 body，需要非 scoped 样式才能命中。 */
.select-menu-list {
  position: fixed;
  z-index: 90;
  display: grid;
  padding: 5px;
  gap: 2px;
  overflow-y: auto;
  overscroll-behavior: contain;
  border: 1px solid rgba(255, 255, 255, 0.92);
  border-radius: 11px;
  background: rgba(253, 254, 255, 0.96);
  box-shadow: 0 18px 38px rgba(54, 45, 106, 0.2);
  backdrop-filter: var(--glass-blur);
  outline: none;
}

.select-menu-option {
  display: flex;
  width: 100%;
  min-width: 0;
  padding: 6px 8px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border: 0;
  border-radius: 7px;
  color: var(--ink-soft);
  background: transparent;
  font-size: 0.55rem;
  text-align: left;
}

.select-menu-option.is-active {
  color: var(--purple-deep);
  background: rgba(117, 100, 222, 0.1);
}

.select-menu-option.is-selected {
  color: var(--purple-deep);
  font-weight: 760;
}

.select-menu-option-label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.select-menu-check {
  flex: 0 0 auto;
  color: var(--purple);
}

.select-menu-pop-enter-active,
.select-menu-pop-leave-active {
  transition:
    opacity 0.16s ease,
    transform 0.18s cubic-bezier(0.22, 1, 0.36, 1);
}

.select-menu-pop-enter-from,
.select-menu-pop-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
