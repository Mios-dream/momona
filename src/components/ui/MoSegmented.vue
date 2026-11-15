<script setup lang="ts" generic="T extends string | number">
import { computed } from "vue";

interface SegmentedOption<V> {
  /** 选项提交值。 */
  value: V;
  /** 选项展示文案。 */
  label: string;
}

interface Props {
  /** 当前选中值。 */
  modelValue: T;
  /** 互斥选项列表。 */
  options: SegmentedOption<T>[];
  /** 无障碍名称。 */
  ariaLabel?: string;
  /** 是否禁用。 */
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  ariaLabel: undefined,
  disabled: false,
});

const emit = defineEmits<{
  "update:modelValue": [value: T];
  change: [value: T];
}>();

const activeIndex = computed(() => {
  const index = props.options.findIndex(
    (option) => option.value === props.modelValue,
  );
  return index >= 0 ? index : 0;
});

/** 指示条宽度与位移都由等分数算出，选项数量变化时无需改 CSS。 */
const indicatorStyle = computed(() => ({
  width: `${100 / Math.max(1, props.options.length)}%`,
  transform: `translateX(${activeIndex.value * 100}%)`,
}));

/** 选中某个选项。 */
function select(value: T): void {
  if (props.disabled || value === props.modelValue) return;
  emit("update:modelValue", value);
  emit("change", value);
}

/** 方向键在互斥选项之间移动，符合 radiogroup 的键盘习惯。 */
function handleKeydown(event: KeyboardEvent): void {
  if (props.disabled) return;
  const delta =
    event.key === "ArrowRight" || event.key === "ArrowDown"
      ? 1
      : event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? -1
        : 0;
  if (!delta) return;
  event.preventDefault();
  const count = props.options.length;
  const next = (activeIndex.value + delta + count) % count;
  const option = props.options[next];
  if (option) select(option.value);
}
</script>

<template>
  <div
    class="mo-segmented"
    :class="{ 'is-disabled': props.disabled }"
    role="radiogroup"
    :aria-label="props.ariaLabel"
    @keydown="handleKeydown"
  >
    <div class="mo-segmented-track">
      <span
        class="mo-segmented-indicator"
        :style="indicatorStyle"
        aria-hidden="true"
      ></span>
      <button
        v-for="option in props.options"
        :key="String(option.value)"
        type="button"
        class="mo-segmented-item"
        :class="{ 'is-active': option.value === props.modelValue }"
        role="radio"
        :aria-checked="option.value === props.modelValue"
        :tabindex="option.value === props.modelValue ? 0 : -1"
        :disabled="props.disabled"
        @click="select(option.value)"
      >
        {{ option.label }}
      </button>
    </div>
  </div>
</template>

<style scoped>
/* 自建分段选择器：淡主题色指示条在玻璃轨道里滑动，不使用系统原生 radio。 */
.mo-segmented {
  padding: 3px;
  border: 1px solid var(--glass-border);
  border-radius: 10px;
  background: var(--glass-soft);
  box-shadow:
    inset 0 1px 2px rgba(54, 45, 106, 0.07),
    0 1px 0 rgba(255, 255, 255, 0.5);
}
.mo-segmented-track {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 26px;
}
.mo-segmented-indicator {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 0;
  border: 1px solid var(--theme-line);
  border-radius: 7px;
  background: var(--theme-wash);
  box-shadow: 0 2px 6px color-mix(in srgb, var(--theme) 14%, transparent);
  transition: transform 0.24s cubic-bezier(0.22, 1, 0.36, 1);
}
.mo-segmented-item {
  position: relative;
  z-index: 1;
  display: flex;
  min-width: 0;
  flex: 1 1 0;
  padding: 0 5px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 7px;
  color: var(--muted);
  background: transparent;
  font-size: 0.52rem;
  font-weight: 700;
  white-space: nowrap;
  transition: color 0.18s ease;
}
.mo-segmented-item:hover {
  color: var(--theme-strong);
}
.mo-segmented-item.is-active {
  color: var(--theme-strong);
  font-weight: 780;
}
.mo-segmented-item:focus-visible {
  outline: 2px solid var(--theme-line);
  outline-offset: 1px;
}
.mo-segmented.is-disabled {
  opacity: 0.5;
}
.mo-segmented.is-disabled .mo-segmented-item {
  cursor: not-allowed;
}
</style>
