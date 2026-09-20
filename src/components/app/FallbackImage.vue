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
  /** 为图片加载过程显示轻量骨架，并在加载完成后渐显图片。 */
  showLoadingSkeleton?: boolean;
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
  showLoadingSkeleton: false,
  referrerPolicy: undefined,
  draggable: false,
});

const imageFailed = ref(false);
const fallbackImageFailed = ref(false);
const imageLoaded = ref(false);
const fallbackImageLoaded = ref(false);
const imageElement = ref<HTMLImageElement | null>(null);
const fallbackImageElement = ref<HTMLImageElement | null>(null);
let imageCheckTimer: number | null = null;

const source = computed(() => props.src?.trim() ?? "");
const fallbackSource = computed(() => props.fallbackSrc?.trim() ?? "");
const showSource = computed(() => Boolean(source.value) && !imageFailed.value);
const showFallbackSource = computed(
  () => Boolean(fallbackSource.value) && !fallbackImageFailed.value,
);
const imageLoading = computed(() => {
  if (showSource.value) return !imageLoaded.value;
  if (showFallbackSource.value) return !fallbackImageLoaded.value;
  return false;
});

const checkImage = (): void => {
  const image = imageElement.value;
  if (image?.complete) {
    if (image.naturalWidth === 0) imageFailed.value = true;
    else imageLoaded.value = true;
  }

  const fallbackImage = fallbackImageElement.value;
  if (fallbackImage?.complete) {
    if (fallbackImage.naturalWidth === 0) fallbackImageFailed.value = true;
    else fallbackImageLoaded.value = true;
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
  imageLoaded.value = false;
  imageFailed.value = true;
  scheduleImageCheck();
};

const handleFallbackImageError = (): void => {
  fallbackImageLoaded.value = false;
  fallbackImageFailed.value = true;
};

const handleImageLoad = (): void => {
  imageLoaded.value = true;
};

const handleFallbackImageLoad = (): void => {
  fallbackImageLoaded.value = true;
};

watch([source, fallbackSource], () => {
  imageFailed.value = false;
  fallbackImageFailed.value = false;
  imageLoaded.value = false;
  fallbackImageLoaded.value = false;
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
    :class="{ 'has-loading-skeleton': props.showLoadingSkeleton }"
    :style="{
      '--app-image-object-fit': props.objectFit,
      '--app-image-object-position': props.objectPosition,
    }"
  >
    <span
      v-if="props.showLoadingSkeleton"
      class="app-image-skeleton"
      :class="{ 'is-hidden': !imageLoading }"
      aria-hidden="true"
    ></span>
    <img
      v-if="showSource"
      ref="imageElement"
      :class="[props.imageClass, { 'is-loaded': imageLoaded }]"
      :src="source"
      :alt="props.alt"
      :loading="props.loading"
      :referrerpolicy="props.referrerPolicy"
      :draggable="props.draggable"
      @load="handleImageLoad"
      @error="handleImageError"
    />
    <img
      v-else-if="showFallbackSource"
      ref="fallbackImageElement"
      :class="[props.imageClass, { 'is-loaded': fallbackImageLoaded }]"
      :src="fallbackSource"
      :alt="props.alt"
      :loading="props.loading"
      :referrerpolicy="props.referrerPolicy"
      :draggable="props.draggable"
      @load="handleFallbackImageLoad"
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

.app-image.has-loading-skeleton > img {
  opacity: 0;
  transition:
    opacity 0.36s ease,
    transform var(--app-image-transform-duration, 0s)
      var(--app-image-transform-timing, ease);
}

.app-image.has-loading-skeleton > img.is-loaded {
  opacity: 1;
}

.app-image-skeleton {
  position: absolute;
  z-index: 1;
  inset: 0;
  overflow: hidden;
  background: rgba(219, 226, 239, 0.78);
  pointer-events: none;
  transition: opacity 0.32s ease;
}

.app-image-skeleton::after {
  position: absolute;
  z-index: 1;
  top: -60%;
  bottom: -60%;
  left: -50%;
  width: 44%;
  background: linear-gradient(
    90deg,
    rgba(248, 250, 255, 0) 0%,
    rgba(248, 250, 255, 0.1) 25%,
    rgba(248, 250, 255, 0.9) 50%,
    rgba(248, 250, 255, 0.1) 75%,
    rgba(248, 250, 255, 0) 100%
  );
  content: "";
  transform: translate3d(-300%, 0, 0) skewX(-18deg);
  will-change: transform;
  animation: app-image-skeleton-shimmer 1.5s linear infinite;
}

.app-image-skeleton.is-hidden {
  opacity: 0;
}

@keyframes app-image-skeleton-shimmer {
  from {
    transform: translate3d(-300%, 0, 0) skewX(-18deg);
  }

  to {
    transform: translate3d(500%, 0, 0) skewX(-18deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .app-image-skeleton::after {
    animation: none;
  }
}

.app-image-fallback-icon {
  position: absolute;
  inset: 0;
  margin: auto;
  color: currentColor;
  opacity: 0.7;
}
</style>
