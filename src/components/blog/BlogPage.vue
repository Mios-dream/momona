<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import type { BlogArticleSummary } from "../../data/blog";
import { blogArticlePath } from "../../data/blog";
import IconGlyph from "../app/IconGlyph.vue";

type BlogSortMode = "latest" | "oldest" | "title";
type BlogPanel = "search" | "category" | "sort" | null;
type BlogCardLayout = "featured" | "standard";
type BlogCardTone = "violet" | "sky" | "mint" | "coral" | "amber";

interface BlogCategoryOption {
  value: string;
  label: string;
  count: number;
}

interface Props {
  articles: BlogArticleSummary[];
  loading?: boolean;
  error?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  error: false,
});

const blogCardTones: BlogCardTone[] = [
  "violet",
  "sky",
  "mint",
  "coral",
  "amber",
];

const emit = defineEmits<{
  retry: [];
}>();

const query = ref("");
const activeCategory = ref("all");
const sortMode = ref<BlogSortMode>("latest");
const openPanel = ref<BlogPanel>(null);
const searchInput = ref<HTMLInputElement | null>(null);

const categoryOptions = computed<BlogCategoryOption[]>(() => {
  const counts = new Map<string, number>();

  for (const article of props.articles) {
    counts.set(article.category, (counts.get(article.category) ?? 0) + 1);
  }

  return [
    { value: "all", label: "全部", count: props.articles.length },
    ...Array.from(counts.entries()).map(([label, count]) => ({
      value: label,
      label,
      count,
    })),
  ];
});

const filteredArticles = computed(() => {
  const normalizedQuery = query.value.trim().toLocaleLowerCase();
  const result = props.articles.filter((article) => {
    const matchesCategory =
      activeCategory.value === "all" ||
      article.category === activeCategory.value;
    const searchable = [
      article.title,
      article.description,
      article.category,
      ...article.tags,
    ]
      .join(" ")
      .toLocaleLowerCase();

    return (
      matchesCategory &&
      (!normalizedQuery || searchable.includes(normalizedQuery))
    );
  });

  return [...result].sort((first, second) => {
    if (sortMode.value === "oldest") {
      return first.isoDate.localeCompare(second.isoDate);
    }
    if (sortMode.value === "title") {
      return first.title.localeCompare(second.title, "zh-CN");
    }
    return second.isoDate.localeCompare(first.isoDate);
  });
});

const latestVisibleArticle = computed(() =>
  filteredArticles.value.reduce<BlogArticleSummary | null>(
    (latest, article) =>
      !latest || article.isoDate > latest.isoDate ? article : latest,
    null,
  ),
);

function articleLayout(article: BlogArticleSummary): BlogCardLayout {
  return article.slug === latestVisibleArticle.value?.slug
    ? "featured"
    : "standard";
}

function articleTone(index: number): BlogCardTone {
  return blogCardTones[index % blogCardTones.length];
}

function togglePanel(panel: Exclude<BlogPanel, null>): void {
  openPanel.value = openPanel.value === panel ? null : panel;
}

function closePanel(): void {
  openPanel.value = null;
}

function selectCategory(category: string): void {
  activeCategory.value = category;
  closePanel();
}

function selectSort(mode: BlogSortMode): void {
  sortMode.value = mode;
  closePanel();
}

function resetFilters(): void {
  query.value = "";
  activeCategory.value = "all";
  sortMode.value = "latest";
}

function handleSearchShortcut(event: KeyboardEvent): void {
  if (event.key === "Escape") {
    closePanel();
    return;
  }

  if (
    event.key !== "/" ||
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.shiftKey
  ) {
    return;
  }

  const target = event.target;
  if (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement
  ) {
    return;
  }

  event.preventDefault();
  openPanel.value = "search";
  void nextTick(() => searchInput.value?.focus());
}

onMounted(() => {
  window.addEventListener("keydown", handleSearchShortcut);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleSearchShortcut);
});
</script>

<template>
  <div class="blog-page">
    <main class="blog-content">
      <section class="blog-stage" aria-label="文章列表">
        <div
          v-if="props.loading"
          class="blog-loading-state"
          role="status"
          aria-label="加载中"
        >
          <span class="momona-page-loader__spinner" aria-hidden="true"></span>
        </div>

        <div v-else-if="props.error" class="blog-error-state" role="alert">
          <IconGlyph name="refresh" :size="23" />
          <strong>文章列表暂时无法读取</strong>
          <span>请稍后重试。</span>
          <button type="button" class="blog-retry" @click="emit('retry')">
            <IconGlyph name="refresh" :size="14" />
            重新加载
          </button>
        </div>

        <div v-else-if="!props.articles.length" class="blog-empty">
          <IconGlyph name="book" :size="23" />
          <strong>还没有发布文章</strong>
          <span>将第一篇 Markdown 文章放入文章目录后重新构建。</span>
        </div>

        <div v-else-if="!filteredArticles.length" class="blog-empty">
          <IconGlyph name="search" :size="23" />
          <strong>没有找到匹配文章</strong>
          <span>换个关键词，或者清除当前筛选条件。</span>
          <button type="button" class="blog-retry" @click="resetFilters">
            <IconGlyph name="refresh" :size="14" />
            清除筛选
          </button>
        </div>

        <div v-else class="blog-pages" aria-live="polite">
          <div class="blog-card-grid">
            <article
              v-for="(article, index) in filteredArticles"
              :key="article.slug"
              class="blog-card"
              :style="{
                '--blog-card-enter-delay': `${Math.min(index, 8) * 28}ms`,
              }"
              :class="[
                `blog-card--${articleLayout(article)}`,
                `blog-card--tone-${articleTone(index)}`,
                { 'blog-card--has-cover': Boolean(article.cover) },
              ]"
            >
              <a
                :href="blogArticlePath(article.slug)"
                class="blog-card-link"
                :class="{ 'blog-card-link--no-cover': !article.cover }"
              >
                <div class="blog-card-body">
                  <h2>{{ article.title }}</h2>
                  <div class="blog-card-taxonomy">
                    <span
                      v-if="articleLayout(article) === 'featured'"
                      class="blog-card-latest"
                    >
                      <IconGlyph name="sparkles" :size="13" />
                      最新
                    </span>
                    <span class="blog-card-topic">
                      <IconGlyph name="bookMarked" :size="15" />
                      {{ article.category }}
                    </span>
                    <span v-if="article.tags.length" class="blog-card-tags">
                      <span v-for="tag in article.tags.slice(0, 3)" :key="tag">
                        #{{ tag }}
                      </span>
                    </span>
                  </div>
                  <p v-if="article.description">{{ article.description }}</p>
                  <div class="blog-card-footer">
                    <div class="blog-card-stats" aria-label="文章统计">
                      <time :datetime="article.isoDate">
                        <IconGlyph name="calendar" :size="14" />
                        {{ article.date }}
                      </time>
                      <span>
                        <IconGlyph name="listOrdered" :size="14" />
                        {{ article.wordCount }} 字
                      </span>
                      <span>
                        <IconGlyph name="clock" :size="14" />
                        {{ article.readingMinutes }} 分钟
                      </span>
                    </div>
                  </div>
                </div>
                <div v-if="article.cover" class="blog-card-media">
                  <img
                    class="blog-card-cover"
                    :src="article.cover"
                    :alt="article.title"
                    loading="lazy"
                  />
                </div>
                <span v-else class="blog-card-read" aria-hidden="true">
                  <IconGlyph name="arrowRight" :size="18" />
                </span>
              </a>
            </article>
          </div>
        </div>
      </section>
    </main>

    <nav class="blog-floating-toolbar glass-panel" aria-label="文章工具栏">
      <button
        class="blog-toolbar-action"
        :class="{ 'is-active': openPanel === 'search' }"
        type="button"
        aria-label="搜索文章"
        title="搜索文章"
        @click="togglePanel('search')"
      >
        <IconGlyph name="search" :size="15" />
        <span>搜索</span>
      </button>
      <button
        class="blog-toolbar-action"
        :class="{ 'is-active': openPanel === 'category' }"
        type="button"
        aria-label="文章分类"
        title="文章分类"
        @click="togglePanel('category')"
      >
        <IconGlyph name="layoutGrid" :size="15" />
        <span>分类</span>
      </button>
      <button
        class="blog-toolbar-action"
        :class="{ 'is-active': openPanel === 'sort' }"
        type="button"
        aria-label="文章排序"
        title="文章排序"
        @click="togglePanel('sort')"
      >
        <IconGlyph name="arrowUpDown" :size="15" />
        <span>排序</span>
      </button>
    </nav>

    <Transition name="blog-panel">
      <div v-if="openPanel === 'search'" class="blog-search-panel glass-panel">
        <IconGlyph name="search" :size="15" />
        <label class="sr-only" for="blog-search-input">搜索文章</label>
        <input
          id="blog-search-input"
          ref="searchInput"
          v-model="query"
          autofocus
          type="search"
          placeholder="搜索标题、摘要或标签"
          aria-label="搜索文章"
        />
        <button
          v-if="query"
          type="button"
          aria-label="清除搜索"
          title="清除搜索"
          @click="query = ''"
        >
          <IconGlyph name="x" :size="15" />
        </button>
      </div>
    </Transition>

    <Transition name="blog-panel">
      <div
        v-if="openPanel === 'category'"
        class="blog-category-panel glass-panel"
        aria-label="文章分类"
      >
        <strong>文章分类</strong>
        <div class="blog-category-options" role="group" aria-label="文章分类">
          <button
            v-for="category in categoryOptions"
            :key="category.value"
            type="button"
            :class="{ 'is-active': activeCategory === category.value }"
            :aria-pressed="activeCategory === category.value"
            @click="selectCategory(category.value)"
          >
            <span>{{ category.label }}</span>
            <small>{{ category.count }}</small>
          </button>
        </div>
      </div>
    </Transition>

    <Transition name="blog-panel">
      <div
        v-if="openPanel === 'sort'"
        class="blog-sort-panel glass-panel"
        aria-label="文章排序"
      >
        <strong>排序方式</strong>
        <button
          :class="{ 'is-active': sortMode === 'latest' }"
          type="button"
          @click="selectSort('latest')"
        >
          <span>最新发布</span>
          <IconGlyph v-if="sortMode === 'latest'" name="sparkles" :size="13" />
        </button>
        <button
          :class="{ 'is-active': sortMode === 'oldest' }"
          type="button"
          @click="selectSort('oldest')"
        >
          <span>最早发布</span>
          <IconGlyph v-if="sortMode === 'oldest'" name="sparkles" :size="13" />
        </button>
        <button
          :class="{ 'is-active': sortMode === 'title' }"
          type="button"
          @click="selectSort('title')"
        >
          <span>按标题</span>
          <IconGlyph v-if="sortMode === 'title'" name="sparkles" :size="13" />
        </button>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.blog-page {
  position: relative;
  display: flow-root;
  width: 100vw;
  min-height: 100vh;
  min-height: 100svh;
  padding: 0 0 180px;
}

.blog-content {
  width: min(1280px, calc(100% - 220px));
  height: auto;
  margin: 80px auto 0;
  padding: 0;
}

.blog-stage {
  height: auto;
  min-height: 0;
  overflow: visible;
}

.blog-list-heading {
  display: flex;
  width: 100%;
  min-width: 0;
  margin-bottom: 18px;
  padding: 0 2px 0 12px;
  flex-direction: row;
  align-items: baseline;
  justify-content: space-between;
  gap: 14px;
  border: 0;
  border-left: 3px solid var(--purple);
  border-radius: 0;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
}

.blog-list-heading strong {
  margin: 0;
  color: var(--ink);
  font-size: 1.22rem;
  font-weight: 800;
  line-height: 1.2;
}

.blog-list-count {
  color: var(--muted);
  font-size: 0.66rem;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.blog-pages {
  width: 100%;
}

.blog-card-grid {
  display: grid;
  width: 100%;
  grid-auto-rows: 74px;
  grid-auto-flow: dense;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
  align-items: stretch;
}

.blog-card {
  position: relative;
  display: flex;
  --blog-card-enter-delay: 0ms;
  --blog-card-accent: #7564de;
  --blog-card-soft: rgba(233, 229, 255, 0.72);
  --blog-card-surface: rgba(251, 250, 255, 0.86);
  --blog-card-hover: rgba(255, 255, 255, 0.94);
  min-width: 0;
  height: 100%;
  min-height: 142px;
  padding: 18px;
  flex-direction: column;
  overflow: hidden;
  outline: none;
  border: 1px solid rgba(255, 255, 255, 0.86);
  border-radius: 15px;
  background: var(--blog-card-surface);
  box-shadow: 0 10px 25px rgba(72, 56, 135, 0.08);
  backdrop-filter: blur(18px) saturate(132%);
  transition:
    transform 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease,
    padding 0.52s cubic-bezier(0.22, 1, 0.36, 1);
  animation: blog-card-in 0.52s var(--blog-card-enter-delay)
    cubic-bezier(0.22, 1, 0.36, 1) both;
  will-change: opacity;
}

.blog-card--featured {
  grid-column: span 2;
  grid-row: span 3;
}

.blog-card--standard {
  grid-row: span 2;
}

.blog-card--tone-violet {
  --blog-card-accent: #7564de;
  --blog-card-soft: rgba(233, 229, 255, 0.76);
  --blog-card-surface: rgba(251, 250, 255, 0.68);
}

.blog-card--tone-sky {
  --blog-card-accent: #278cb9;
  --blog-card-soft: rgba(220, 242, 250, 0.84);
  --blog-card-surface: rgba(248, 253, 255, 0.68);
}

.blog-card--tone-mint {
  --blog-card-accent: #3f9b7d;
  --blog-card-soft: rgba(220, 244, 234, 0.84);
  --blog-card-surface: rgba(248, 254, 251, 0.68);
}

.blog-card--tone-coral {
  --blog-card-accent: #c96d72;
  --blog-card-soft: rgba(255, 232, 229, 0.84);
  --blog-card-surface: rgba(255, 251, 250, 0.69);
}

.blog-card--tone-amber {
  --blog-card-accent: #aa7c35;
  --blog-card-soft: rgba(250, 239, 211, 0.82);
  --blog-card-surface: rgba(255, 253, 247, 0.69);
}

.blog-card:hover,
.blog-card:focus-within {
  background: var(--blog-card-hover);
  box-shadow: 0 18px 35px rgba(72, 56, 135, 0.14);
  transform: translateY(-2px);
}

.blog-card-link {
  position: relative;
  z-index: 1;
  display: grid;
  width: 100%;
  height: 100%;
  min-height: 0;
  grid-template-columns: minmax(0, 1fr) minmax(138px, 34%);
}

.blog-card-link--no-cover {
  grid-template-columns: minmax(0, 1fr) 40px;
}

.blog-card-media {
  position: relative;
  height: 100%;
  min-width: 0;
  margin: 0 0 0 14px;
  align-self: stretch;
  overflow: hidden;
  border-radius: 11px;
  background: var(--blog-card-soft);
}

.blog-card-cover {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: cover;
  transition: transform 0.5s cubic-bezier(0.22, 1, 0.36, 1);
}

.blog-card:hover .blog-card-cover {
  transform: scale(1.035);
}

.blog-card-body {
  display: flex;
  min-width: 0;
  min-height: 0;
  padding: 0;
  flex-direction: column;
  overflow: hidden;
}

.blog-card-taxonomy {
  display: flex;
  flex: 0 0 auto;
  min-width: 0;
  align-items: center;
  flex-wrap: wrap;
  gap: 6px 10px;
  margin-top: 8px;
}

.blog-card-topic {
  display: inline-flex;
  padding: 4px 7px;
  align-items: center;
  gap: 6px;
  border-radius: 5px;
  color: var(--blog-card-accent);
  background: var(--blog-card-soft);
  font-size: 0.6rem;
  white-space: nowrap;
}

.blog-card-latest {
  display: inline-flex;
  padding: 4px 7px;
  align-items: center;
  gap: 5px;
  border-radius: 5px;
  color: #b74e78;
  background: rgba(255, 225, 237, 0.86);
  font-size: 0.6rem;
  font-weight: 750;
  white-space: nowrap;
}

.blog-card-latest svg {
  width: 13px;
  height: 13px;
}

.blog-card-topic svg {
  width: 13px;
  height: 13px;
  color: var(--blog-card-accent);
}

.blog-card h2 {
  display: -webkit-box;
  flex: 0 0 auto;
  margin: 0;
  overflow: hidden;
  color: var(--ink);
  font-size: 0.94rem;
  font-weight: 760;
  line-height: 1.25;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.blog-card p {
  display: -webkit-box;
  margin: 7px 0 0;
  overflow: hidden;
  color: var(--muted-strong);
  font-size: 0.67rem;
  line-height: 1.48;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.blog-card-footer {
  display: inline-flex;
  width: 100%;
  min-width: 0;
  flex: 0 0 auto;
  margin-top: auto;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding-top: 7px;
}

.blog-card-stats {
  display: flex;
  min-width: 0;
  align-items: center;
  flex-wrap: wrap;
  gap: 5px 0;
  color: var(--muted);
  font-size: 0.56rem;
  line-height: 1.2;
}

.blog-card-stats > * {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  white-space: nowrap;
}

.blog-card-stats > * + * {
  margin-left: 8px;
  padding-left: 8px;
  border-left: 1px solid rgba(111, 120, 145, 0.2);
}

.blog-card-stats svg {
  width: 13px;
  height: 13px;
  color: var(--blog-card-accent);
}

.blog-card-tags {
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  gap: 4px;
}

.blog-card-tags span {
  max-width: 110px;
  overflow: hidden;
  padding: 3px 6px;
  border-radius: 5px;
  color: var(--blog-card-accent);
  background: var(--blog-card-soft);
  font-size: 0.56rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (min-width: 821px) {
  .blog-card--featured {
    padding: 22px;
  }

  .blog-card--featured .blog-card-taxonomy {
    gap: 8px 12px;
    margin-top: 10px;
  }

  .blog-card--featured .blog-card-topic {
    padding: 5px 9px;
    gap: 7px;
    font-size: 0.76rem;
  }

  .blog-card--featured .blog-card-latest {
    padding: 5px 9px;
    gap: 6px;
    font-size: 0.76rem;
  }

  .blog-card--featured .blog-card-latest svg {
    width: 15px;
    height: 15px;
  }

  .blog-card--featured .blog-card-topic svg {
    width: 15px;
    height: 15px;
  }

  .blog-card--featured h2 {
    margin-top: 0;
    font-size: 1.6rem;
    line-height: 1.2;
  }

  .blog-card--featured p {
    margin-top: 10px;
    font-size: 0.85rem;
    line-height: 1.55;
    -webkit-line-clamp: 3;
  }

  .blog-card--featured .blog-card-footer {
    padding-top: 10px;
  }

  .blog-card--featured .blog-card-stats {
    gap: 7px 0;
    font-size: 0.68rem;
  }

  .blog-card--featured .blog-card-stats svg {
    width: 14px;
    height: 14px;
  }

  .blog-card--featured .blog-card-tags span {
    max-width: 160px;
    padding: 4px 8px;
    font-size: 0.64rem;
  }
}

.blog-card-read {
  display: grid;
  width: 32px;
  height: 32px;
  align-self: center;
  justify-self: end;
  place-items: center;
  border-radius: 50%;
  color: var(--blog-card-accent);
  background: var(--blog-card-soft);
  transition:
    background 0.2s ease,
    color 0.2s ease,
    transform 0.2s ease;
}

.blog-card:hover .blog-card-read {
  color: var(--blog-card-accent);
  background: var(--blog-card-soft);
  transform: translateX(2px);
}

.blog-empty {
  display: flex;
  min-height: 180px;
  margin: 6px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 9px;
  border: 1px solid var(--content-border);
  border-radius: 15px;
  background: var(--content-surface);
  box-shadow: var(--content-shadow);
  color: var(--muted);
  text-align: center;
}

.blog-loading-state {
  position: fixed;
  z-index: 20;
  inset: 0;
  display: grid;
  place-items: center;
  pointer-events: none;
}

.blog-error-state {
  position: fixed;
  z-index: 20;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;
  color: var(--muted);
  text-align: center;
  pointer-events: none;
}

.blog-error-state strong {
  color: var(--ink);
  font-size: 0.9rem;
}

.blog-error-state span {
  font-size: 0.7rem;
}

.blog-empty strong {
  color: var(--ink);
  font-size: 0.9rem;
}

.blog-empty span {
  font-size: 0.7rem;
}

.blog-retry {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: 5px;
  padding: 8px 12px;
  border: 0;
  border-radius: 8px;
  color: #fff;
  background: var(--purple-deep);
  font-size: 0.68rem;
  font-weight: 700;
  pointer-events: auto;
}

@keyframes blog-card-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@media (prefers-reduced-motion: reduce) {
  .blog-card {
    animation: none;
    will-change: auto;
  }
}

/* Keep article controls available while the list remains in view. */
.blog-floating-toolbar {
  position: fixed;
  z-index: 30;
  bottom: 32px;
  left: 50vw;
  display: flex;
  width: clamp(340px, 31vw, 430px);
  height: 54px;
  padding: 8px 11px;
  align-items: center;
  gap: 5px;
  border-radius: 16px;
  opacity: 1;
  pointer-events: auto;
  transform: translate(-50%, 0);
  visibility: visible;
}

.blog-toolbar-action {
  display: inline-flex;
  min-width: 0;
  height: 36px;
  padding: 0 8px;
  flex: 1 1 auto;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 0;
  border-radius: 9px;
  color: var(--muted-strong);
  background: transparent;
  font-size: 0.59rem;
  white-space: nowrap;
}

.blog-toolbar-action:hover,
.blog-toolbar-action:focus-visible,
.blog-toolbar-action.is-active {
  color: var(--purple-deep);
  background: rgba(234, 231, 255, 0.64);
}

.blog-search-panel,
.blog-category-panel,
.blog-sort-panel {
  position: fixed;
  z-index: 32;
  bottom: 96px;
  left: 50vw;
  border-radius: 12px;
  transform: translateX(-50%);
}

.blog-panel-enter-active,
.blog-panel-leave-active {
  transition:
    opacity 0.18s ease,
    transform 0.24s cubic-bezier(0.22, 1, 0.36, 1);
}

.blog-panel-enter-from {
  opacity: 0;
  transform: translate(-50%, 10px) scale(0.96);
}

.blog-panel-leave-to {
  opacity: 0;
  transform: translate(-50%, 6px) scale(0.98);
}

.blog-search-panel {
  display: flex;
  width: min(360px, calc(100vw - 32px));
  height: 43px;
  padding: 0 11px;
  align-items: center;
  gap: 7px;
  color: var(--muted);
}

.blog-search-panel input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  color: var(--ink);
  background: transparent;
  font-size: 0.66rem;
}

.blog-search-panel input::-webkit-search-cancel-button {
  appearance: none;
  -webkit-appearance: none;
}

.blog-search-panel button {
  display: grid;
  width: 25px;
  height: 25px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 50%;
  color: var(--muted);
  background: transparent;
}

.blog-search-panel button:hover,
.blog-search-panel button:focus-visible {
  color: var(--purple-deep);
  background: rgba(229, 225, 255, 0.72);
}

.blog-category-panel,
.blog-sort-panel {
  display: flex;
  width: min(270px, calc(100vw - 32px));
  padding: 10px;
  flex-direction: column;
  gap: 4px;
}

.blog-category-panel > strong,
.blog-sort-panel > strong {
  padding: 3px 6px 6px;
  color: var(--ink);
  font-size: 0.66rem;
}

.blog-category-options {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  padding: 6px 3px 2px;
  border-top: 1px solid rgba(111, 120, 145, 0.12);
}

.blog-category-options button,
.blog-sort-panel button {
  display: flex;
  min-height: 31px;
  padding: 0 7px;
  align-items: center;
  justify-content: space-between;
  border: 0;
  border-radius: 7px;
  color: var(--muted-strong);
  background: transparent;
  font-size: 0.62rem;
  text-align: left;
}

.blog-category-options button {
  min-height: 28px;
  gap: 5px;
  background: rgba(255, 255, 255, 0.34);
}

.blog-category-options small {
  color: var(--muted);
  font-size: 0.54rem;
}

.blog-category-options button:hover,
.blog-category-options button.is-active,
.blog-sort-panel button:hover,
.blog-sort-panel button.is-active {
  color: var(--purple-deep);
  background: rgba(229, 225, 255, 0.72);
}

@media (max-width: 1199px) and (min-width: 821px) {
  .blog-card-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 820px) {
  .blog-page {
    min-height: 100svh;
    padding: 0 0 190px;
  }

  .blog-content {
    width: min(calc(100% - 24px), 560px);
    height: auto;
    margin: 80px auto 0;
    padding: 0;
  }

  .blog-list-heading {
    margin-bottom: 12px;
    padding-left: 10px;
  }

  .blog-list-heading strong {
    font-size: 1.08rem;
  }

  .blog-list-count {
    font-size: 0.6rem;
  }

  .blog-card-grid {
    grid-auto-rows: auto;
    grid-template-columns: minmax(0, 1fr);
    gap: 11px;
  }

  .blog-card {
    height: auto;
    min-height: 128px;
  }

  .blog-card--featured,
  .blog-card--standard {
    grid-column: auto;
    grid-row: auto;
  }

  .blog-card-link {
    height: auto;
    min-height: 108px;
    grid-template-columns: minmax(0, 1fr) 96px;
  }

  .blog-card-link--no-cover {
    grid-template-columns: minmax(0, 1fr) 40px;
  }

  .blog-card-media {
    margin-left: 10px;
  }

  .blog-card h2 {
    font-size: 1rem;
  }

  .blog-card p {
    margin-top: 6px;
    font-size: 0.64rem;
    line-height: 1.42;
  }

  .blog-floating-toolbar {
    top: 70%;
    right: 12px;
    bottom: auto;
    left: auto;
    width: 48px;
    height: auto;
    padding: 7px 6px;
    flex-direction: column;
    gap: 4px;
    border-radius: 16px;
    transform: translateY(-50%);
  }

  .blog-toolbar-action {
    width: 36px;
    height: 36px;
    padding: 0;
    flex: 0 0 36px;
    gap: 0;
    font-size: 0.53rem;
  }

  .blog-toolbar-action span {
    display: none;
  }

  .blog-search-panel,
  .blog-category-panel,
  .blog-sort-panel {
    top: 50%;
    right: 70px;
    bottom: auto;
    left: auto;
    transform: translateY(-50%);
  }

  .blog-search-panel {
    width: min(300px, calc(100vw - 88px));
  }

  .blog-category-panel,
  .blog-sort-panel {
    width: min(270px, calc(100vw - 88px));
  }

  .blog-panel-enter-from {
    transform: translate(8px, -50%) scale(0.96);
  }

  .blog-panel-leave-to {
    transform: translate(4px, -50%) scale(0.98);
  }
}

@media (max-width: 820px) and (max-height: 720px) {
  .blog-card-taxonomy {
    gap: 5px 8px;
  }

  .blog-card h2 {
    margin-top: 0;
    font-size: 0.92rem;
    line-height: 1.2;
    -webkit-line-clamp: 1;
  }

  .blog-card-footer {
    padding-top: 4px;
  }

  .blog-card-stats {
    font-size: 0.52rem;
  }

  .blog-card-tags span {
    padding: 3px 6px;
    font-size: 0.54rem;
  }
}
</style>
