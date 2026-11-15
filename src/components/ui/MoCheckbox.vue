<script setup lang="ts">
import IconGlyph from "../app/IconGlyph.vue";

interface Props {
  /** 当前勾选状态。 */
  modelValue: boolean;
  /** 主标题；省略时应通过 ariaLabel 提供名称。 */
  label?: string;
  /** 副说明文字。 */
  description?: string;
  /** 无可见文字时的无障碍名称。 */
  ariaLabel?: string;
  /** 是否禁用。 */
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  label: "",
  description: "",
  ariaLabel: undefined,
  disabled: false,
});

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  change: [value: boolean];
}>();

/** 切换勾选状态。 */
function toggle(): void {
  if (props.disabled) return;
  const next = !props.modelValue;
  emit("update:modelValue", next);
  emit("change", next);
}
</script>

<template>
  <button
    type="button"
    class="mo-checkbox"
    :class="{ 'is-checked': props.modelValue, 'is-disabled': props.disabled }"
    role="checkbox"
    :aria-checked="props.modelValue"
    :aria-label="props.ariaLabel || undefined"
    :disabled="props.disabled"
    @click="toggle"
  >
    <span class="mo-checkbox-box" aria-hidden="true">
      <IconGlyph name="check" :size="11" :stroke-width="3" />
    </span>
    <span v-if="props.label || props.description" class="mo-checkbox-copy">
      <strong v-if="props.label">{{ props.label }}</strong>
      <small v-if="props.description">{{ props.description }}</small>
    </span>
  </button>
</template>

<style scoped>
/*
 * 自建勾选框：整行是玻璃卡片，左侧方块才是状态指示器。
 * 选中时用主题色实底 + 白色粗勾，和通知卡片、主按钮的强调语言一致。
 */
.mo-checkbox {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: 38px;
  padding: 6px 7px;
  align-items: center;
  gap: 7px;
  border: 1px solid transparent;
  border-radius: 8px;
  color: var(--ink-soft);
  background: var(--glass-soft);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.42);
  text-align: left;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease,
    scale 0.18s ease;
}
.mo-checkbox:not(.is-disabled):hover {
  border-color: var(--theme-line);
  background: var(--glass-strong);
  scale: 1.01;
}
/* 选中态只留一层极淡的主题色，避免整片卡片被染成实色、丢掉玻璃通透感。 */
.mo-checkbox.is-checked {
  border-color: color-mix(in srgb, var(--theme) 30%, transparent);
  background: color-mix(in srgb, var(--theme) 4%, var(--glass-soft));
}
.mo-checkbox-box {
  display: grid;
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid var(--glass-border);
  border-radius: 5px;
  color: transparent;
  background: var(--glass-strong);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.72);
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease,
    box-shadow 0.18s ease;
}
.mo-checkbox-box :deep(svg) {
  transform: scale(0.6);
  transition: transform 0.18s cubic-bezier(0.22, 1, 0.36, 1);
}
.mo-checkbox.is-checked .mo-checkbox-box {
  border-color: var(--theme);
  color: var(--theme-on);
  background: var(--theme);
  box-shadow: 0 3px 8px color-mix(in srgb, var(--theme) 32%, transparent);
}
.mo-checkbox.is-checked .mo-checkbox-box :deep(svg) {
  transform: scale(1);
}
.mo-checkbox-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}
.mo-checkbox-copy strong,
.mo-checkbox-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.mo-checkbox-copy strong {
  font-size: 0.55rem;
  font-weight: 700;
}
.mo-checkbox-copy small {
  color: var(--muted);
  font-size: 0.48rem;
  font-weight: 500;
}
.mo-checkbox.is-checked .mo-checkbox-copy strong {
  color: var(--theme-strong);
}
.mo-checkbox:focus-visible {
  outline: none;
  box-shadow: 0 0 0 3px var(--theme-ring);
}
.mo-checkbox.is-disabled {
  cursor: not-allowed;
  opacity: 0.48;
}
</style>
