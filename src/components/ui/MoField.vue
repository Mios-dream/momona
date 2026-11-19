<script setup lang="ts" generic="T extends string | number">
interface Props {
  /** 当前值；字符串或数字由传入类型自动推断。 */
  modelValue: T;
  /** 字段上方的标签。 */
  label?: string;
  /** 字段的无障碍名称；标签由外部版式渲染时用它补上。 */
  ariaLabel?: string;
  /** 输入类型，仅覆盖设置页用到的几种。 */
  type?: "text" | "url" | "password" | "number";
  /** 占位文案。 */
  placeholder?: string;
  /** 是否渲染为多行文本域。 */
  multiline?: boolean;
  /** 文本域行数。 */
  rows?: number;
  /** number 类型的最小值。 */
  min?: number;
  /** number 类型的最大值。 */
  max?: number;
  /** 浏览器自动填充策略。 */
  autocomplete?: string;
  /** 是否禁用。 */
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  label: "",
  ariaLabel: undefined,
  type: "text",
  placeholder: "",
  multiline: false,
  rows: 3,
  min: undefined,
  max: undefined,
  autocomplete: undefined,
  disabled: false,
});

const emit = defineEmits<{
  "update:modelValue": [value: T];
}>();

/**
 * 把输入同步回父组件。
 *
 * 数字字段沿用原生的 `.number` 行为：空串保持空串，其余转成数字，
 * 避免用户清空输入框时立刻被写成 0。
 */
function handleInput(event: Event): void {
  const raw = (event.target as HTMLInputElement | HTMLTextAreaElement).value;
  const next =
    typeof props.modelValue === "number" && raw !== ""
      ? Number(raw)
      : (raw as T);
  emit("update:modelValue", next as T);
}
</script>

<template>
  <label class="mo-field">
    <span v-if="props.label" class="mo-field-label">{{ props.label }}</span>
    <textarea
      v-if="props.multiline"
      class="mo-field-control"
      :value="props.modelValue"
      :rows="props.rows"
      :aria-label="props.ariaLabel"
      :placeholder="props.placeholder"
      :disabled="props.disabled"
      spellcheck="false"
      @input="handleInput"
    ></textarea>
    <input
      v-else
      class="mo-field-control"
      :value="props.modelValue"
      :type="props.type"
      :aria-label="props.ariaLabel"
      :placeholder="props.placeholder"
      :min="props.min"
      :max="props.max"
      :autocomplete="props.autocomplete"
      :disabled="props.disabled"
      spellcheck="false"
      @input="handleInput"
    />
  </label>
</template>

<style scoped>
/* 自建输入字段：玻璃底 + 主题色聚焦光圈，和开关 / 勾选框同一套材质语言。 */
.mo-field {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
  color: var(--muted-strong);
  font-size: 0.58rem;
  font-weight: 700;
}
.mo-field-label {
  min-width: 0;
}
.mo-field-control {
  width: 100%;
  min-width: 0;
  padding: 0 10px;
  border: 1px solid var(--glass-border);
  border-radius: 8px;
  outline: none;
  color: var(--ink);
  background: var(--glass-strong);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.62),
    0 2px 6px rgba(54, 45, 106, 0.05);
  font: inherit;
  font-size: 0.63rem;
  font-weight: 500;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease;
}
.mo-field-control::placeholder {
  color: var(--muted);
  opacity: 0.72;
}
input.mo-field-control {
  height: 36px;
}
textarea.mo-field-control {
  min-height: 70px;
  padding-top: 9px;
  padding-bottom: 9px;
  resize: vertical;
  line-height: 1.45;
}
.mo-field-control:hover:not(:disabled) {
  border-color: color-mix(in srgb, var(--theme) 28%, transparent);
}
.mo-field-control:focus {
  border-color: color-mix(in srgb, var(--theme) 56%, transparent);
  background: #fff;
  box-shadow: 0 0 0 3px var(--theme-ring);
}
.mo-field-control:disabled {
  cursor: not-allowed;
  opacity: 0.6;
}
</style>
