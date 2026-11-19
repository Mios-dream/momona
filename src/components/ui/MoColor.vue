<script setup lang="ts">
import { computed } from "vue";
import IconGlyph from "../app/IconGlyph.vue";

interface Props {
  /** 当前颜色，#rrggbb。 */
  modelValue: string;
  /** 无可见文字时的无障碍名称。 */
  ariaLabel?: string;
  disabled?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  ariaLabel: "选择颜色",
  disabled: false,
});

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();

/**
 * 图标画在颜色上面，所以它的颜色必须由底下那块色决定——
 * 浅色片用墨，深色片用白，否则总有一半情况是看不见的。
 */
const glyphColor = computed(() => {
  const hex = (props.modelValue || "").replace("#", "");
  if (hex.length !== 6) return "rgba(19, 26, 45, 0.55)";
  const channel = (start: number) => {
    const value = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return value <= 0.03928
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  };
  const luminance =
    0.2126 * channel(0) + 0.7152 * channel(2) + 0.0722 * channel(4);
  return luminance > 0.5 ? "rgba(19, 26, 45, 0.6)" : "rgba(255, 255, 255, 0.94)";
});

function handleInput(event: Event): void {
  emit("update:modelValue", (event.target as HTMLInputElement).value);
}
</script>

<template>
  <!--
    原生取色框在系统外观里是一块硬边方块，和这套材质接不上，所以把它藏进
    自绘的色点里：点它仍然打开系统调色板，看到的是颜色本身。

    它不是一个"选项"，是当前值的可视化：所以它比左边那排预设小一圈、
    紧贴着色值——它和色值是一件事，不是第六个色片。
  -->
  <label class="mo-color" :style="{ '--mo-color': props.modelValue }">
    <input
      class="mo-color-input"
      type="color"
      :value="props.modelValue"
      :aria-label="props.ariaLabel"
      :disabled="props.disabled"
      @input="handleInput"
    />
    <span class="mo-color-glyph" aria-hidden="true" :style="{ color: glyphColor }">
      <IconGlyph name="palette" :size="12" :stroke-width="1.9" />
    </span>
  </label>
</template>

<style scoped>
/*
 * 色点：一块平涂的颜色，紧跟在色值左边。
 *
 * 没有高光、没有内白环、没有彩色投影——它不浮起来，所以不需要光照。
 * 它的边界只有一条 1px 的墨线（纸上用墨，不用白），
 * 它的"可编辑"交给旁边那个输入框和指针反馈，不靠体积去暗示。
 */
.mo-color {
  position: relative;
  display: grid;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 8px;
  background: var(--mo-color);
  box-shadow: inset 0 0 0 1px rgba(19, 26, 45, 0.12);
  cursor: pointer;
  transition: box-shadow 0.16s ease;
}

.mo-color:hover {
  box-shadow: inset 0 0 0 1px rgba(19, 26, 45, 0.26);
}

.mo-color:focus-within {
  box-shadow:
    inset 0 0 0 1px rgba(19, 26, 45, 0.26),
    0 0 0 3px var(--theme-ring);
}

/* 图标平时不出现：28px 的色点里塞一个小图标，任何底色上都是一团糊。
   指上来才浮出——它是"确认这里能改"，不是"装饰这里"。 */
.mo-color-glyph {
  display: grid;
  place-items: center;
  opacity: 0;
  filter: drop-shadow(0 1px 1.5px rgba(19, 26, 45, 0.45));
  transform: scale(0.88);
  pointer-events: none;
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
}

.mo-color:hover .mo-color-glyph,
.mo-color:focus-within .mo-color-glyph {
  opacity: 1;
  transform: scale(1);
}

/* 原生控件铺满色点但不显示，只负责把系统调色板叫出来。 */
.mo-color-input {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  padding: 0;
  border: 0;
  border-radius: 8px;
  opacity: 0;
  cursor: pointer;
  appearance: none;
}

.mo-color-input:disabled {
  cursor: default;
}

@media (prefers-reduced-motion: reduce) {
  .mo-color-glyph {
    transition: none;
  }
}
</style>
