<script setup lang="ts">
interface Props {
  /** 当前开关状态。 */
  modelValue: boolean;
  /** 无可见文字时的无障碍名称。 */
  ariaLabel?: string;
  /** 开关右侧的可见文字，可省略。 */
  label?: string;
  /** 尺寸：sm 用于列表行内，md 用于表单区。 */
  size?: "sm" | "md";
  /** 是否禁用。 */
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  ariaLabel: undefined,
  label: "",
  size: "md",
  disabled: false,
});

const emit = defineEmits<{
  "update:modelValue": [value: boolean];
  change: [value: boolean];
}>();

/** 切换开关；按钮本身已原生支持 Space / Enter 与焦点。 */
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
    class="mo-toggle"
    :class="[
      `mo-toggle--${props.size}`,
      { 'is-checked': props.modelValue, 'is-disabled': props.disabled },
    ]"
    role="switch"
    :aria-checked="props.modelValue"
    :aria-label="props.ariaLabel || undefined"
    :disabled="props.disabled"
    @click="toggle"
  >
    <span class="mo-toggle-track" aria-hidden="true">
      <span class="mo-toggle-thumb"></span>
    </span>
    <span v-if="props.label" class="mo-toggle-text">{{ props.label }}</span>
  </button>
</template>

<style scoped>
/*
 * 自建滑块开关：保持「灰玻璃轨道 + 主题色实底 + 白色圆片」的简约结构。
 *
 * 阴影只有一层外阴影，任何状态都不叠加光晕：
 *   - 未启用：中性普通阴影；hover 也只是普通阴影略强一点；
 *   - 已启用：投影换成主题色系，但仍是带偏移的阴影，不是四周辉光；
 *   - 已启用 + hover：才出现一层很轻的四周辉光，同时轨道提亮。
 * 四种状态的 box-shadow 层数与位置保持一致，切换时可平滑插值。
 * 滑块始终只有普通投影，不发光，中心也不放图标。
 *
 * 尺寸全部由 --mo-toggle-* 派生，位移 = 宽 - 高，任意尺寸都贴住右端。
 */
.mo-toggle {
  --mo-toggle-width: 38px;
  --mo-toggle-height: 22px;
  --mo-toggle-pad: 3px;
  /* 悬停提亮：混白得到更亮的同色相纯色，而不是压暗。 */
  --mo-toggle-bright: color-mix(in srgb, var(--theme) 82%, #fff);
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border: 0;
  color: var(--muted-strong);
  background: transparent;
  font-size: 0.58rem;
  font-weight: 700;
  cursor: pointer;
}
.mo-toggle--sm {
  --mo-toggle-width: 32px;
  --mo-toggle-height: 18px;
  --mo-toggle-pad: 2.5px;
}
.mo-toggle-track {
  position: relative;
  display: block;
  width: var(--mo-toggle-width);
  height: var(--mo-toggle-height);
  flex: 0 0 auto;
  border-radius: 999px;
  background: rgba(118, 126, 151, 0.24);
  /* box-shadow:
    inset 0 1px 3px rgba(54, 45, 106, 0.14),
    0 1px 0 rgba(255, 255, 255, 0.55),
    0 2px 6px rgba(54, 45, 106, 0.12); */
  transition:
    background 0.2s ease,
    box-shadow 0.24s ease;
}
.mo-toggle-thumb {
  position: absolute;
  top: var(--mo-toggle-pad);
  left: var(--mo-toggle-pad);
  display: block;
  width: calc(var(--mo-toggle-height) - 2 * var(--mo-toggle-pad));
  height: calc(var(--mo-toggle-height) - 2 * var(--mo-toggle-pad));
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 2px 5px rgba(38, 39, 72, 0.2);
  transition: transform 0.24s cubic-bezier(0.22, 1, 0.36, 1);
}
/* 开启：轨道换主题色，投影跟随主题色，但依旧是一层普通投影。 */
.mo-toggle.is-checked .mo-toggle-track {
  background: var(--theme);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.28),
    0 1px 0 rgba(255, 255, 255, 0.38),
    0 2px 7px color-mix(in srgb, var(--theme) 30%, transparent);
}
.mo-toggle.is-checked .mo-toggle-thumb {
  transform: translateX(calc(var(--mo-toggle-width) - var(--mo-toggle-height)));
}
/* 未启用 hover：只把轨道变浅、普通阴影略强，不发光。 */
.mo-toggle:not(.is-disabled):hover .mo-toggle-track {
  background: rgba(118, 126, 151, 0.16);
  /* box-shadow:
    inset 0 1px 3px rgba(54, 45, 106, 0.14),
    0 1px 0 rgba(255, 255, 255, 0.55),
    0 2px 7px rgba(54, 45, 106, 0.16); */
}
/* 已启用 hover：唯一出现辉光的状态，单层、轻微，并把轨道提亮。 */
.mo-toggle.is-checked:not(.is-disabled):hover .mo-toggle-track {
  background: var(--mo-toggle-bright);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.34),
    0 1px 0 rgba(255, 255, 255, 0.44),
    0 0 8px 1px color-mix(in srgb, var(--theme) 34%, transparent);
}
.mo-toggle:focus-visible {
  outline: none;
}
.mo-toggle:focus-visible .mo-toggle-track {
  outline: 3px solid var(--theme-ring);
  outline-offset: 3px;
}
.mo-toggle-text {
  white-space: nowrap;
}
.mo-toggle.is-disabled {
  cursor: not-allowed;
  opacity: 0.48;
}
@media (prefers-reduced-motion: reduce) {
  .mo-toggle-track,
  .mo-toggle-thumb {
    transition: none;
  }
}
</style>
