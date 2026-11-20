<script setup lang="ts">
import { computed } from "vue";
import type { HomeWidget, IconName, LinkPlatform } from "../../data/types";
import { widgetDefinition } from "../../data/homeWidgets";
import IconGlyph from "../app/IconGlyph.vue";
import ReportPlatformIcon from "../reports/ReportPlatformIcon.vue";

/**
 * 手机上的 1×1 图标。
 *
 * 桌面 2×2 的组件到了手机上只占一格（约 80px），放进整张卡片就是把一张
 * 308×150 的排版压成邮票。这一层不再渲染组件本体，而是像手机桌面那样
 * 只给一枚图标：一眼认出"这是哪个入口"，点得动就够了。
 *
 * 只有 1×1 的组件走这里；4×2 的组件在手机上占满整行，仍然是真卡片。
 */
interface Props {
  widget: HomeWidget;
}

const props = defineProps<Props>();

/** 品牌平台用自己的图标与颜色，其余走主题色。 */
const brandPlatforms: LinkPlatform[] = [
  "qq",
  "github",
  "steam",
  "bilibili",
  "netease",
  "qqmusic",
  "youtube",
  "x",
  "discord",
];

const fallbackIcons: Record<LinkPlatform, IconName> = {
  generic: "link",
  qq: "user",
  github: "github",
  email: "mail",
  steam: "game",
  blog: "globe",
  bilibili: "video",
  netease: "music",
  qqmusic: "music",
  youtube: "video",
  x: "x",
  discord: "messagesSquare",
  telegram: "send",
};

const brandColors: Record<string, string> = {
  qq: "#147fc0",
  github: "#26354d",
  steam: "#2e5c87",
  bilibili: "#078fb8",
  netease: "#c94d6b",
  qqmusic: "#13a06b",
  youtube: "#d84357",
  x: "#1e2630",
  discord: "#5865c8",
};

/** 链接卡读自定义标题，其余读目录名称；只用于无障碍标签，不再画到卡上。 */
const name = computed(() => {
  if (props.widget.type === "link") {
    return props.widget.settings?.link?.title?.trim() || props.widget.label;
  }
  return props.widget.label;
});

/** 链接卡才带地址；其它组件的 1×1 图标只是展示。 */
const href = computed(() => {
  if (props.widget.type !== "link") return "";
  return props.widget.settings?.link?.href?.trim() || "";
});

const platform = computed(() => props.widget.settings?.link?.platform);
const isBrand = computed(
  () => Boolean(platform.value) && brandPlatforms.includes(platform.value!),
);

const iconName = computed<IconName>(() => {
  if (props.widget.type === "link") {
    const link = props.widget.settings?.link;
    return link?.icon || fallbackIcons[link?.platform ?? "generic"] || "link";
  }
  return widgetDefinition(props.widget.type).icon;
});

const accent = computed(() => {
  const key = platform.value ?? "";
  return brandColors[key] ?? "var(--theme)";
});

const linkTarget = computed(() =>
  props.widget.settings?.link?.openInNewTab ? "_blank" : undefined,
);

const tileStyle = computed<Record<string, string>>(() => ({
  "--tile-accent": accent.value,
}));
</script>

<template>
  <a
    v-if="href"
    class="home-app-tile glass-panel"
    :href="href"
    :target="linkTarget"
    :rel="linkTarget ? 'noreferrer' : undefined"
    :style="tileStyle"
    :aria-label="name"
  >
    <span class="app-tile-icon">
      <ReportPlatformIcon v-if="isBrand" :platform-id="platform" :size="28" />
      <IconGlyph v-else :name="iconName" :size="26" />
    </span>
  </a>
  <div
    v-else
    class="home-app-tile glass-panel"
    :style="tileStyle"
    :aria-label="name"
  >
    <span class="app-tile-icon">
      <ReportPlatformIcon v-if="isBrand" :platform-id="platform" :size="28" />
      <IconGlyph v-else :name="iconName" :size="26" />
    </span>
  </div>
</template>

<style scoped>
/*
 * 社交卡片格：一格 80px 放不下卡片排版，就画成一枚占满整格的毛玻璃
 * 图标——材质走全局 --glass 系列（和其余卡片同一套），图标居中。
 */
.home-app-tile {
  position: relative;
  display: flex;
  height: 100%;
  padding: 8px;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  color: var(--cat-ink, #1a2133);
  text-decoration: none;
  transition:
    transform 0.12s ease-out,
    background-color 0.12s ease-out;
}

.home-app-tile:active {
  transform: scale(0.96);
}

.app-tile-icon {
  display: flex;
  /* 图标片随格子长大：手机一格 80px 时是 44，平板一格 170+ 时封顶 68。 */
  width: clamp(44px, 40%, 68px);
  max-width: 68px;
  aspect-ratio: 1;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 14px;
  background: #fff;
  box-shadow: 0 1px 2px rgba(33, 27, 68, 0.08);
  color: var(--tile-accent, var(--theme));
}

/* 图标跟随图标片缩放，盖过组件里写死的像素尺寸。 */
.app-tile-icon :deep(svg) {
  width: 58%;
  height: 58%;
}

@media (prefers-reduced-motion: reduce) {
  .home-app-tile {
    transition-duration: 0.01ms;
  }
}
</style>
