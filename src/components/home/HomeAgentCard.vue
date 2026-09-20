<script setup lang="ts">
import { computed } from "vue";
import type { SiteProfile } from "../../data/types";
import FallbackImage from "../app/FallbackImage.vue";
import IconGlyph from "../app/IconGlyph.vue";

interface Props {
  /** 统一页面快照中的个人资料；组件不再内置角色内容。 */
  profile: SiteProfile;
}

const props = defineProps<Props>();
const hasProfile = computed(() =>
  Boolean(props.profile.name || props.profile.avatar),
);
</script>

<template>
  <section
    class="home-agent-card glass-panel"
    :class="{ 'is-empty': !hasProfile }"
    aria-label="Agent 人设"
  >
    <template v-if="hasProfile">
      <FallbackImage
        class="agent-image"
        src="/assets/assistant_small.png"
        :alt="'momona'"
        fallback-icon="user"
        :icon-size="26"
        object-position="center 18%"
      />
      <span v-if="props.profile.name" class="agent-name">momona</span>
    </template>
    <div v-else class="agent-empty">
      <IconGlyph name="user" :size="20" />
      <span>暂无 Agent 数据</span>
    </div>
  </section>
</template>

<style scoped>
.home-agent-card {
  position: relative;
  display: flex;
  min-height: 150px;
  overflow: hidden;
  background: rgba(238, 235, 255, 0.74);
}

.home-agent-card::before {
  position: absolute;
  inset: 0;
  background: linear-gradient(
    180deg,
    rgba(255, 255, 255, 0.1),
    rgba(238, 231, 255, 0.45)
  );
  content: "";
}

.home-agent-card > .agent-image {
  position: relative;
  z-index: 1;
  width: 100%;
  height: 100%;
  filter: saturate(1.04);
}

.agent-name {
  position: absolute;
  z-index: 2;
  right: 9px;
  bottom: 10px;
  padding: 5px 8px;
  border-radius: 7px;
  color: var(--ink-soft);
  background: rgba(255, 255, 255, 0.8);
  font-size: 0.56rem;
  font-weight: 760;
}

.agent-empty {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  gap: 7px;
  color: var(--muted);
  font-size: 0.62rem;
}
</style>
