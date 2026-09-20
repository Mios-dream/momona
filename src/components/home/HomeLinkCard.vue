<script setup lang="ts">
import { computed } from 'vue';
import type { IconName, LinkPlatform, LinkWidgetSettings } from '../../data/types';
import IconGlyph from '../app/IconGlyph.vue';
import ReportPlatformIcon from '../reports/ReportPlatformIcon.vue';

interface Props {
  settings: LinkWidgetSettings;
}

const props = defineProps<Props>();
const isConfigured = computed(() => Boolean(props.settings.title.trim() && props.settings.href.trim()));
const brandPlatforms: LinkPlatform[] = [
  'qq', 'github', 'steam', 'bilibili', 'netease', 'qqmusic', 'youtube', 'x', 'discord',
];
const platformNames: Record<LinkPlatform, string> = {
  generic: '链接', qq: 'QQ', github: 'GitHub', email: 'Email', steam: 'Steam',
  blog: 'Blog', bilibili: 'Bilibili', netease: '网易云音乐', qqmusic: 'QQ 音乐',
  youtube: 'YouTube', x: 'X', discord: 'Discord', telegram: 'Telegram',
};
const fallbackIcons: Record<LinkPlatform, IconName> = {
  generic: 'link', qq: 'user', github: 'github', email: 'mail', steam: 'game',
  blog: 'globe', bilibili: 'video', netease: 'music', qqmusic: 'music',
  youtube: 'video', x: 'x', discord: 'messagesSquare', telegram: 'send',
};
const platformName = computed(() => platformNames[props.settings.platform] ?? '链接');
const isBrandPlatform = computed(() => brandPlatforms.includes(props.settings.platform));
</script>

<template>
  <a
    v-if="isConfigured"
    class="home-link-card glass-panel"
    :class="[`tone-${props.settings.tone}`, `platform-${props.settings.platform}`]"
    :href="props.settings.href"
    :target="props.settings.openInNewTab ? '_blank' : undefined"
    :rel="props.settings.openInNewTab ? 'noreferrer' : undefined"
    :aria-label="`${props.settings.title}：${props.settings.subtitle}`"
  >
    <span class="link-card-icon">
      <ReportPlatformIcon
        v-if="isBrandPlatform"
        :platform-id="props.settings.platform"
        :size="24"
      />
      <IconGlyph
        v-else
        :name="props.settings.icon || fallbackIcons[props.settings.platform]"
        :size="23"
      />
    </span>
    <span class="link-card-copy">
      <strong>{{ props.settings.title }}</strong>
      <small>{{ props.settings.subtitle || platformName }}</small>
    </span>
    <IconGlyph class="link-card-arrow" name="external" :size="14" />
  </a>
  <div v-else class="home-link-card glass-panel is-empty" aria-label="暂无链接">
    <IconGlyph name="link" :size="20" />
    <span>暂无链接</span>
  </div>
</template>

<style scoped>
.home-link-card {
  position: relative;
  display: flex;
  min-height: 118px;
  padding: 13px;
  align-items: center;
  gap: 10px;
  overflow: hidden;
  color: var(--ink);
  background: rgba(255, 255, 255, 0.66);
  transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
  animation: link-card-in 0.48s cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: calc(var(--widget-index, 0) * 35ms);
}

.home-link-card:hover {
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 22px 38px rgba(54, 45, 106, 0.18);
  transform: translateY(-4px);
}

.home-link-card.is-empty {
  align-items: center;
  justify-content: center;
  gap: 7px;
  color: var(--muted);
  font-size: 0.62rem;
}

.home-link-card.tone-blue {
  color: #087fb5;
  background: linear-gradient(145deg, rgba(224, 248, 255, 0.82), rgba(255, 255, 255, 0.58));
}

.home-link-card.tone-indigo {
  color: #4d58a4;
  background: linear-gradient(145deg, rgba(237, 239, 255, 0.88), rgba(255, 255, 255, 0.58));
}

.home-link-card.tone-ink {
  color: #26354d;
  background: linear-gradient(145deg, rgba(232, 241, 248, 0.86), rgba(255, 255, 255, 0.58));
}

.home-link-card.tone-violet {
  color: var(--purple-deep);
  background: linear-gradient(145deg, rgba(239, 234, 255, 0.88), rgba(255, 255, 255, 0.58));
}

.home-link-card.platform-qq { color: #147fc0; }
.home-link-card.platform-github { color: #26354d; }
.home-link-card.platform-steam { color: #2e5c87; }
.home-link-card.platform-bilibili { color: #078fb8; }
.home-link-card.platform-netease { color: #c94d6b; }
.home-link-card.platform-qqmusic { color: #13a06b; }
.home-link-card.platform-youtube { color: #d84357; }
.home-link-card.platform-x { color: #1e2630; }
.home-link-card.platform-discord { color: #5865c8; }

.link-card-icon {
  display: grid;
  width: 47px;
  height: 47px;
  flex: 0 0 auto;
  place-items: center;
  border: 1px solid rgba(255, 255, 255, 0.82);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.58);
  box-shadow: 0 8px 17px rgba(54, 45, 106, 0.1);
  transition: transform 0.22s ease, background 0.22s ease;
}

.home-link-card:hover .link-card-icon {
  transform: rotate(-4deg) scale(1.06);
}

.link-card-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 4px;
}

.link-card-copy strong,
.link-card-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.link-card-copy strong {
  color: var(--ink);
  font-size: 0.75rem;
}

.link-card-copy small {
  color: var(--muted);
  font-size: 0.56rem;
}

.link-card-arrow {
  align-self: flex-start;
  color: currentColor;
  opacity: 0.72;
}

@media (max-width: 820px) {
  .home-link-card {
    min-height: 104px;
  }
}

@keyframes link-card-in {
  from {
    opacity: 0;
    transform: translateY(8px) scale(0.98);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .home-link-card {
    animation: none;
  }
}
</style>
