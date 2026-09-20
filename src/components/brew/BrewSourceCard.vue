<script setup lang="ts">
import type { BrewSource } from '../../data/types';
import FriendAvatar from '../app/FriendAvatar.vue';
import IconGlyph from '../app/IconGlyph.vue';

interface Props {
  /** 当前信息源卡片。 */
  source: BrewSource;
}

const props = defineProps<Props>();

const emit = defineEmits<{
  /** 点击卡片时打开静态详情面板。 */
  open: [source: BrewSource];
}>();

/**
 * 将卡片点击事件转发给 Brew 页面。
 */
const handleOpen = (): void => {
  emit('open', props.source);
};
</script>

<template>
  <article
    class="brew-source-card"
    :class="['source-' + props.source.id, 'layout-' + props.source.layout, 'tone-' + props.source.tone]"
    tabindex="0"
    :aria-label="props.source.name"
    @click="handleOpen"
    @keydown.enter="handleOpen"
  >
    <header class="source-header">
      <div class="source-avatar">
        <FriendAvatar
          :src="props.source.image"
          :alt="`${props.source.name} 的头像`"
          :icon-size="18"
          loading="lazy"
        />
      </div>
      <div class="source-identity">
        <a
          class="source-title-link"
          :href="props.source.href"
          target="_blank"
          rel="noreferrer"
          @click.stop
          @keydown.enter.stop
        >
          <h3>{{ props.source.name }}</h3>
        </a>
        <div class="source-subline">
          <span class="source-type" :title="props.source.type === 'Brewlia' ? 'AI 增强订阅' : props.source.type">
            <IconGlyph v-if="props.source.type === 'Brewlia'" name="sparkles" :size="11" />
            {{ props.source.type }}
          </span>
          <span v-if="props.source.articleCount" class="source-count">{{ props.source.articleCount }} 篇</span>
        </div>
      </div>
      <div v-if="props.source.tags.length" class="source-tags" aria-label="信息源标签">
        <span v-for="tag in props.source.tags" :key="tag">{{ tag }}</span>
      </div>
    </header>

    <template v-if="props.source.layout !== 'link'">
      <section class="source-feature">
        <div class="source-feature-line">
          <span class="source-dot"></span>
          <a
            v-if="props.source.articles[0]?.href"
            class="source-article-link"
            :href="props.source.articles[0].href"
            target="_blank"
            rel="noreferrer"
            :title="props.source.latestTitle"
            @click.stop
            @keydown.enter.stop
          >
            {{ props.source.latestTitle }}
          </a>
          <strong v-else :title="props.source.latestTitle">{{ props.source.latestTitle }}</strong>
          <time v-if="props.source.layout === 'featured'">{{ props.source.date }}</time>
        </div>
        <p v-if="props.source.summary">{{ props.source.summary }}</p>
      </section>

      <div v-if="props.source.layout === 'featured'" class="source-history">
        <template v-for="item in props.source.articles.slice(1, 3)" :key="item.id">
          <a
            v-if="item.href"
            class="source-history-row"
            :href="item.href"
            target="_blank"
            rel="noreferrer"
            @click.stop
            @keydown.enter.stop
          >
            <span class="source-dot"></span>
            <span :title="item.title">{{ item.title }}</span>
            <time>{{ item.date }}</time>
          </a>
          <div v-else class="source-history-row">
            <span class="source-dot"></span>
            <span :title="item.title">{{ item.title }}</span>
            <time>{{ item.date }}</time>
          </div>
        </template>
      </div>
    </template>
  </article>
</template>

<style scoped>
.brew-source-card {
  position: relative;
  display: flex;
  min-width: 0;
  height: 100%;
  padding: 17px 15px 16px;
  flex-direction: column;
  overflow: hidden;
  outline: none;
  border: 1px solid rgba(255, 255, 255, 0.78);
  border-radius: 15px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 10px 25px rgba(72, 56, 135, 0.08);
  backdrop-filter: blur(18px) saturate(132%);
  transition: transform 0.18s ease, background 0.18s ease, box-shadow 0.18s ease;
}

.brew-source-card:hover,
.brew-source-card:focus-visible {
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 18px 35px rgba(72, 56, 135, 0.14);
  transform: translateY(-2px);
}

.layout-link {
  padding: 14px 15px 17px;
}

.layout-featured {
  padding: 20px 19px;
}

.source-header {
  display: flex;
  min-width: 0;
  height: 33px;
  align-items: center;
  gap: 16px;
}

.layout-featured .source-header {
  height: 44px;
}

.layout-link .source-header {
  gap: 12px;
}

.source-avatar {
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  overflow: hidden;
  border: 2px solid rgba(255, 255, 255, 0.84);
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.65);
  box-shadow: 0 4px 8px rgba(68, 52, 118, 0.08);
}

.layout-featured .source-avatar,
.layout-link .source-avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
}

.source-identity {
  display: flex;
  min-width: 0;
  flex: 1;
  height: 100%;
  justify-content: center;
  flex-direction: column;
  gap: 2px;
}

.source-title-link {
  display: block;
  min-width: 0;
  color: inherit;
  text-decoration: none;
}

.source-identity h3 {
  overflow: hidden;
  margin: 0;
  color: var(--ink);
  font-size: 0.88rem;
  font-weight: 780;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-subline {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 7px;
  color: var(--muted);
  font-size: 0.57rem;
  line-height: 1;
}

.source-type {
  display: inline-flex;
  min-width: 31px;
  min-height: 18px;
  padding: 2px 6px;
  align-items: center;
  justify-content: center;
  gap: 3px;
  border-radius: 5px;
  color: var(--purple-deep);
  background: rgba(224, 219, 255, 0.66);
  font-weight: 720;
  white-space: nowrap;
}

.tone-blue .source-type {
  color: #3b77bc;
  background: rgba(222, 235, 255, 0.72);
}

.tone-green .source-type {
  color: #3aaf73;
  background: rgba(213, 245, 226, 0.72);
}

.tone-orange .source-type {
  color: #e98c5c;
  background: rgba(255, 232, 218, 0.8);
}

.tone-pink .source-type {
  color: #e95498;
  background: rgba(255, 222, 239, 0.8);
}

.tone-purple .source-type {
  color: #7844aa;
  background: rgba(235, 222, 255, 0.78);
}

.layout-link .source-type {
  min-width: 32px;
  min-height: 17px;
  color: #ef6d47;
  background: rgba(255, 226, 213, 0.8);
}

.source-count {
  white-space: nowrap;
}

.source-tags {
  display: flex;
  min-width: 0;
  margin-left: auto;
  align-items: center;
  gap: 4px;
}

.source-tags span {
  max-width: 80px;
  padding: 4px 8px;
  overflow: hidden;
  border-radius: 5px;
  color: var(--purple-deep);
  background: rgba(224, 219, 255, 0.58);
  font-size: 0.56rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tone-green .source-tags span {
  color: #38a66f;
  background: rgba(213, 245, 226, 0.72);
}

.tone-purple .source-tags span {
  color: #70419e;
  background: rgba(235, 222, 255, 0.76);
}

.source-feature {
  min-width: 0;
  margin-top: 9px;
  padding: 10px 12px;
  flex: 0 0 auto;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 12px;
  background: rgba(225, 224, 235, 0.42);
}

.layout-standard .source-feature {
  height: 68px;
}

.layout-featured .source-feature {
  height: 117px;
  margin-top: 8px;
  padding: 16px 18px;
  background: rgba(229, 227, 236, 0.48);
}

.source-feature-line,
.source-history-row {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
}

.source-feature-line {
  height: 19px;
}

.source-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--blue);
  box-shadow: 0 0 0 4px rgba(17, 157, 217, 0.1);
}

.tone-green .source-dot {
  background: #2da478;
  box-shadow: 0 0 0 4px rgba(45, 164, 120, 0.1);
}

.tone-orange .source-dot {
  background: #f09b74;
  box-shadow: 0 0 0 4px rgba(240, 155, 116, 0.1);
}

.tone-pink .source-dot {
  background: #ee5f9f;
  box-shadow: 0 0 0 4px rgba(238, 95, 159, 0.1);
}

.tone-purple .source-dot {
  background: #8055b0;
  box-shadow: 0 0 0 4px rgba(128, 85, 176, 0.1);
}

.source-feature-line strong,
.source-feature-line a,
.source-history-row > span:not(.source-dot) {
  min-width: 0;
  overflow: hidden;
  color: var(--ink-soft);
  font-size: 0.73rem;
  font-weight: 760;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.source-feature-line strong {
  flex: 1;
}

.source-article-link {
  flex: 1;
  color: var(--ink-soft);
  text-decoration: none;
}

.source-article-link:hover,
.source-article-link:focus-visible,
.source-title-link:hover,
.source-title-link:focus-visible {
  color: var(--purple-deep);
  text-decoration: underline;
  text-decoration-thickness: 1px;
  text-underline-offset: 3px;
}

.source-feature-line time,
.source-history-row time {
  flex: 0 0 auto;
  color: #8d98aa;
  font-size: 0.58rem;
  white-space: nowrap;
}

.source-feature p {
  display: -webkit-box;
  overflow: hidden;
  margin: 5px 0 0 14px;
  color: var(--muted-strong);
  font-size: 0.65rem;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.layout-featured .source-feature p {
  margin-top: 5px;
  font-size: 0.67rem;
  line-height: 1.6;
}

.source-history {
  display: flex;
  min-width: 0;
  height: 85px;
  margin-top: 10px;
  flex-direction: column;
  gap: 7px;
}

.source-history-row {
  height: 37px;
  padding: 0 13px;
}

.source-history-row[href] {
  color: inherit;
  text-decoration: none;
}

.source-history-row > span:not(.source-dot) {
  flex: 1;
  color: var(--muted-strong);
  font-size: 0.72rem;
  font-weight: 500;
}

@media (max-width: 640px) {
  .brew-source-card {
    height: auto;
  }

  .layout-standard {
    height: 132px;
  }

  .layout-featured {
    height: 276px;
    padding: 20px;
  }

  .layout-link {
    height: 60px;
    padding: 14px 15px 13px;
  }

  .layout-featured .source-header {
    height: 47px;
  }

  .layout-standard .source-feature {
    height: 56px;
  }

  .layout-featured .source-feature {
    height: 102px;
  }

  .layout-featured .source-history {
    height: 74px;
  }

  .source-history-row {
    height: 37px;
  }

  .source-tags span {
    max-width: 68px;
    padding-inline: 7px;
  }
}
</style>
