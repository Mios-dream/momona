<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { IconName } from "../../data/types";
import IconGlyph from "./IconGlyph.vue";

type ImageClass = string | string[] | Record<string, boolean>;
type ObjectFit = "contain" | "cover" | "fill" | "none" | "scale-down";
type ReferrerPolicy =
  | ""
  | "no-referrer"
  | "no-referrer-when-downgrade"
  | "origin"
  | "origin-when-cross-origin"
  | "same-origin"
  | "strict-origin"
  | "strict-origin-when-cross-origin"
  | "unsafe-url";

interface Props {
  /** 原始图片地址；为空时直接展示占位内容。 */
  src?: string | null;
  /** 原始图片和默认图片共用的替代文本。 */
  alt?: string;
  /** 原始图片加载失败时使用的默认图片地址。 */
  fallbackSrc?: string | null;
  /** 没有可用图片时使用的语义图标。 */
  fallbackIcon?: IconName;
  /** 默认图标边长，单位为像素。 */
  iconSize?: number;
  loading?: "eager" | "lazy";
  objectFit?: ObjectFit;
  objectPosition?: string;
  /** 只附加到实际图片元素，适合图片专属动画或滤镜。 */
  imageClass?: ImageClass;
  referrerPolicy?: ReferrerPolicy;
  draggable?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  src: "",
  alt: "",
  fallbackSrc: "",
  fallbackIcon: "imageOff",
  iconSize: 24,
  loading: "lazy",
  objectFit: "cover",
  objectPosition: "center",
  imageClass: undefined,
  referrerPolicy: undefined,
  draggable: false,
});

const imageFailed = ref(false);
const fallbackImageFailed = ref(false);
const imageElement = ref<HTMLImageElement | null>(null);
const fallbackImageElement = ref<HTMLImageElement | null>(null);
let imageCheckTimer: number | null = null;

const source = computed(() => props.src?.trim() ?? "");
const fallbackSource = computed(() => props.fallbackSrc?.trim() ?? "");
const showSource = computed(() => Boolean(source.value) && !imageFailed.value);
const showFallbackSource = computed(
  () => Boolean(fallbackSource.value) && !fallbackImageFailed.value,
);

const checkImage = (): void => {
  const image = imageElement.value;
  if (image?.complete && image.naturalWidth === 0) imageFailed.value = true;

  const fallbackImage = fallbackImageElement.value;
  if (fallbackImage?.complete && fallbackImage.naturalWidth === 0) {
    fallbackImageFailed.value = true;
  }
};

const scheduleImageCheck = (): void => {
  if (typeof window === "undefined") return;
  if (imageCheckTimer !== null) window.clearTimeout(imageCheckTimer);
  imageCheckTimer = window.setTimeout(() => {
    imageCheckTimer = null;
    checkImage();
  }, 0);
};

const handleImageError = (): void => {
  imageFailed.value = true;
  scheduleImageCheck();
};

const handleFallbackImageError = (): void => {
  fallbackImageFailed.value = true;
};

watch([source, fallbackSource], () => {
  imageFailed.value = false;
  fallbackImageFailed.value = false;
  scheduleImageCheck();
});

onMounted(scheduleImageCheck);

onBeforeUnmount(() => {
  if (imageCheckTimer !== null) window.clearTimeout(imageCheckTimer);
});
</script>

<template>
  <span
    class="app-image"
    :style="{
      '--app-image-object-fit': props.objectFit,
      '--app-image-object-position': props.objectPosition,
    }"
  >
    <img
      v-if="showSource"
      ref="imageElement"
      :class="props.imageClass"
      :src="source"
      :alt="props.alt"
      :loading="props.loading"
      :referrerpolicy="props.referrerPolicy"
      :draggable="props.draggable"
      @error="handleImageError"
    />
    <img
      v-else-if="showFallbackSource"
      ref="fallbackImageElement"
      :class="props.imageClass"
      :src="fallbackSource"
      :alt="props.alt"
      :loading="props.loading"
      :referrerpolicy="props.referrerPolicy"
      :draggable="props.draggable"
      @error="handleFallbackImageError"
    />
    <IconGlyph
      v-else
      class="app-image-fallback-icon"
      :name="props.fallbackIcon"
      :size="props.iconSize"
      aria-hidden="true"
    />
  </span>
</template>

<style scoped>
.app-image {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.app-image > img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: var(--app-image-object-fit, cover);
  object-position: var(--app-image-object-position, center);
}

.app-image-fallback-icon {
  position: absolute;
  inset: 0;
  margin: auto;
  color: currentColor;
  opacity: 0.7;
}
</style>
