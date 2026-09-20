<script setup lang="ts">
import FallbackImage from "./FallbackImage.vue";

interface Props {
  src?: string;
  alt: string;
  iconSize?: number;
  loading?: "eager" | "lazy";
}

const props = withDefaults(defineProps<Props>(), {
  src: "",
  iconSize: 19,
  loading: "lazy",
});
</script>

<template>
  <span class="friend-avatar-media">
    <FallbackImage
      :src="props.src"
      :alt="props.alt"
      fallback-icon="user"
      :icon-size="props.iconSize"
      :loading="props.loading"
      :draggable="false"
    />
  </span>
</template>

<style scoped>
.friend-avatar-media {
  position: relative;
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  color: currentColor;
}

.friend-avatar-media :deep(.app-image) {
  position: absolute;
  inset: 0;
}
</style>
