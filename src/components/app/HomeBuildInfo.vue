<script setup lang="ts">
const projectUrl = "https://github.com/Mios-dream/momona";
const version = __MOMONA_VERSION__;
const revision = __MOMONA_REVISION__;
</script>

<template>
  <aside class="home-build-info" aria-label="博客框架与版本信息">
    <a
      class="home-build-version"
      :href="projectUrl"
      target="_blank"
      rel="noreferrer"
      :aria-label="`Momona ${version}，提交 ${revision}`"
      role="tooltip"
    >
      <span>{{ version }}</span>
      <span aria-hidden="true">·</span>
      <span>{{ revision }}</span>
    </a>
    <a
      class="home-build-template"
      :href="projectUrl"
      target="_blank"
      rel="noreferrer"
      aria-label="查看 Momona 博客框架"
    >
      Momona
    </a>
  </aside>
</template>

<style scoped>
.home-build-info {
  position: fixed;
  z-index: 8;
  right: max(16px, env(safe-area-inset-right));
  bottom: max(12px, env(safe-area-inset-bottom));
  display: none;
  align-items: flex-end;
  pointer-events: none;
}

.home-build-info a {
  pointer-events: auto;
  text-decoration: none;
  transition:
    color 0.18s ease,
    border-color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease;
}

.home-build-version,
.home-build-template {
  white-space: nowrap;
}

.home-build-version {
  position: absolute;
  right: 0;
  bottom: calc(100% + 4px);
  display: inline-flex;
  padding: 5px 9px;
  align-items: center;
  gap: 5px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.9);
  background: rgba(43, 45, 57, 0.86);
  box-shadow: 0 8px 18px rgba(54, 45, 106, 0.12);
  opacity: 0;
  backdrop-filter: blur(12px) saturate(115%);
  font-size: 0.54rem;
  font-weight: 720;
  line-height: 1;
  pointer-events: none;
  transition:
    opacity 0.18s ease,
    transform 0.18s ease;
  transform: translateY(4px);
  visibility: hidden;
}

.home-build-template {
  margin-right: 2px;
  padding: 4px 9px;
  border: 1px solid rgba(255, 255, 255, 0.52);
  border-radius: 9px;
  color: rgba(74, 76, 97, 0.47);
  background: rgba(255, 255, 255, 0.32);
  font-size: 0.55rem;
  line-height: 1;
  backdrop-filter: blur(10px) saturate(110%);
}

.home-build-info:hover .home-build-version,
.home-build-info:focus-within .home-build-version {
  opacity: 1;
  transform: translateY(0);
  visibility: visible;
}

.home-build-info:hover .home-build-template,
.home-build-template:focus-visible {
  color: rgba(74, 76, 97, 0.78);
  border-color: rgba(255, 255, 255, 0.8);
  background: rgba(255, 255, 255, 0.58);
}

@media (min-width: 821px) {
  .home-build-info {
    display: flex;
  }
}

@media (prefers-reduced-motion: reduce) {
  .home-build-info a,
  .home-build-version {
    transition-duration: 0.01ms;
  }
}
</style>
