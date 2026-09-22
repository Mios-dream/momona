<script setup lang="ts">
import type { BlogArticleSummary } from "../../data/blog";
import { blogArticlePath } from "../../data/blog";
import IconGlyph from "../app/IconGlyph.vue";

interface Props {
  articles: BlogArticleSummary[];
  loading?: boolean;
  error?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  loading: false,
  error: false,
});

const emit = defineEmits<{
  retry: [];
}>();
</script>

<template>
  <div class="blog-page">
    <main class="blog-content">
      <header class="blog-header">
        <div class="blog-heading">
          <span class="blog-eyebrow">PERSONAL NOTES</span>
          <h1>我的文章</h1>
          <p>记录正在思考、学习和留下来的事情。</p>
        </div>
        <div class="blog-count" aria-label="文章数量">
          <strong>{{ props.loading ? '...' : props.articles.length }}</strong>
          <span>篇文章</span>
        </div>
      </header>

      <section class="blog-list" aria-label="文章列表">
        <div v-if="props.loading" class="blog-empty glass-panel" aria-live="polite">
          <IconGlyph name="refresh" :size="23" class="blog-status-icon" />
          <strong>正在读取文章</strong>
        </div>

        <div v-else-if="props.error" class="blog-empty glass-panel" aria-live="polite">
          <IconGlyph name="refresh" :size="23" />
          <strong>文章列表暂时无法读取</strong>
          <span>请稍后重试。</span>
          <button type="button" class="blog-retry" @click="emit('retry')">
            <IconGlyph name="refresh" :size="14" />
            重新加载
          </button>
        </div>

        <div v-else-if="!props.articles.length" class="blog-empty glass-panel">
          <IconGlyph name="book" :size="23" />
          <strong>还没有发布文章</strong>
          <span>将第一篇 Markdown 文章放入文章目录后重新构建。</span>
        </div>

        <article v-for="article in props.articles" :key="article.slug" class="blog-card glass-panel">
          <a :href="blogArticlePath(article.slug)" class="blog-card-link">
            <img v-if="article.cover" class="blog-card-cover" :src="article.cover" :alt="article.title" loading="lazy" />
            <div class="blog-card-body">
              <div class="blog-card-meta">
                <time :datetime="article.isoDate">{{ article.date }}</time>
                <span v-if="article.tags.length" class="blog-card-tags">
                  <span v-for="tag in article.tags.slice(0, 3)" :key="tag">{{ tag }}</span>
                </span>
              </div>
              <h2>{{ article.title }}</h2>
              <p v-if="article.description">{{ article.description }}</p>
              <span class="blog-card-action">阅读文章 <IconGlyph name="arrowRight" :size="15" /></span>
            </div>
          </a>
        </article>
      </section>
    </main>
  </div>
</template>

<style scoped>
.blog-page {
  min-height: 100vh;
  padding: 78px 0 128px;
}

.blog-content {
  width: min(1060px, calc(100% - 48px));
  margin: 0 auto;
}

.blog-header {
  display: flex;
  align-items: end;
  justify-content: space-between;
  margin-bottom: 34px;
  gap: 24px;
}

.blog-heading {
  min-width: 0;
}

.blog-eyebrow {
  display: block;
  margin-bottom: 8px;
  color: var(--pink);
  font-size: 0.65rem;
  font-weight: 760;
  letter-spacing: 0.16em;
}

.blog-heading h1 {
  margin: 0;
  color: var(--ink);
  font-size: clamp(2.1rem, 4vw, 3.35rem);
  font-weight: 780;
  line-height: 1.04;
}

.blog-heading p {
  margin: 12px 0 0;
  color: var(--muted-strong);
  font-size: 0.82rem;
}

.blog-count {
  display: flex;
  align-items: baseline;
  gap: 7px;
  padding-bottom: 4px;
  color: var(--muted);
  white-space: nowrap;
}

.blog-count strong {
  color: var(--purple-deep);
  font-size: 1.7rem;
  font-weight: 780;
}

.blog-count span {
  font-size: 0.72rem;
}

.blog-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  align-items: stretch;
  gap: 16px;
}

.blog-card {
  overflow: hidden;
  border-radius: 13px;
  transition: transform 0.24s ease, box-shadow 0.24s ease, background 0.24s ease;
}

.blog-card:hover {
  background: var(--glass-strong);
  box-shadow: 0 22px 46px rgba(54, 45, 106, 0.18);
  transform: translateY(-4px);
}

.blog-card-link {
  display: flex;
  min-height: 236px;
  flex-direction: column;
}

.blog-card-cover {
  width: 100%;
  height: 150px;
  flex: 0 0 150px;
  object-fit: cover;
}

.blog-card-body {
  display: flex;
  min-width: 0;
  min-height: 236px;
  padding: 22px 23px 20px;
  flex: 1;
  flex-direction: column;
}

.blog-card-meta {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  color: var(--muted);
  font-size: 0.66rem;
}

.blog-card-meta time {
  flex: 0 0 auto;
}

.blog-card-tags {
  display: flex;
  min-width: 0;
  justify-content: flex-end;
  gap: 5px;
  overflow: hidden;
}

.blog-card-tags span {
  max-width: 110px;
  overflow: hidden;
  padding: 4px 7px;
  border: 1px solid rgba(117, 100, 222, 0.14);
  border-radius: 999px;
  color: var(--purple-deep);
  background: rgba(242, 239, 255, 0.66);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.blog-card h2 {
  margin: 20px 0 0;
  color: var(--ink);
  font-size: 1.17rem;
  font-weight: 760;
  line-height: 1.45;
}

.blog-card p {
  display: -webkit-box;
  margin: 10px 0 0;
  overflow: hidden;
  color: var(--muted-strong);
  font-size: 0.77rem;
  line-height: 1.75;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.blog-card-action {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  margin-top: auto;
  padding-top: 20px;
  color: var(--purple-deep);
  font-size: 0.7rem;
  font-weight: 700;
}

.blog-empty {
  display: flex;
  min-height: 260px;
  grid-column: 1 / -1;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 9px;
  color: var(--muted);
  text-align: center;
}

.blog-empty strong {
  color: var(--ink);
  font-size: 0.9rem;
}

.blog-empty span {
  font-size: 0.7rem;
}

.blog-status-icon {
  animation: blog-spin 1.1s linear infinite;
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
  background: var(--purple);
  font-size: 0.68rem;
  font-weight: 700;
}

@keyframes blog-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (max-width: 820px) {
  .blog-page {
    padding: 46px 0 138px;
  }

  .blog-content {
    width: min(100% - 28px, 560px);
  }

  .blog-header {
    align-items: flex-start;
    flex-direction: column;
    gap: 18px;
  }

  .blog-count {
    padding-bottom: 0;
  }

  .blog-list {
    grid-template-columns: 1fr;
  }

  .blog-card-body {
    min-height: 220px;
    padding: 19px 18px 18px;
  }
}
</style>
