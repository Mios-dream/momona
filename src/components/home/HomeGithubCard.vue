<script setup lang="ts">
import type { GitHubRepositorySort, RepositorySummary } from '../../data/types';
import IconGlyph from '../app/IconGlyph.vue';

interface Props {
  repositories: RepositorySummary[];
  sort?: GitHubRepositorySort;
}

const props = withDefaults(defineProps<Props>(), { sort: 'updated' });

const sortLabel: Record<GitHubRepositorySort, string> = {
  stars: 'Star 优先',
  updated: '最近更新',
  forks: 'Fork 优先',
  name: '名称排序',
};
</script>

<template>
  <section class="home-github-card glass-panel" aria-label="GitHub 活动">
    <header class="github-card-head">
      <div>
        <span class="widget-eyebrow">GITHUB / ACTIVITY</span>
        <h2>项目仓库 <small>{{ sortLabel[props.sort] }}</small></h2>
      </div>
      <IconGlyph name="github" :size="18" />
    </header>
    <div v-if="props.repositories.length" class="github-repository-list">
      <a
        v-for="repository in props.repositories.slice(0, 2)"
        :key="repository.id"
        :href="repository.htmlUrl"
        target="_blank"
        rel="noreferrer"
        class="github-repository"
      >
        <span class="repository-mark"><IconGlyph name="github" :size="13" /></span>
        <span class="repository-copy">
          <strong>{{ repository.name }}</strong>
          <small>{{ repository.description || '公开仓库' }}</small>
        </span>
        <span class="repository-stat">
          <IconGlyph name="star" :size="11" />{{ repository.stars }}
          <i aria-hidden="true">·</i><IconGlyph name="code2" :size="11" />{{ repository.forks }}
        </span>
      </a>
    </div>
    <p v-else class="github-empty">在设置中同步 GitHub 后，这里会自动读取仓库活动。</p>
  </section>
</template>

<style scoped>
.home-github-card {
  display: flex;
  min-height: 148px;
  padding: 13px;
  flex-direction: column;
  gap: 9px;
  overflow: hidden;
  background: linear-gradient(145deg, rgba(240, 246, 252, 0.82), rgba(255, 255, 255, 0.56));
}

.github-card-head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}

.github-card-head > svg {
  color: #29364d;
}

.widget-eyebrow {
  color: var(--purple-deep);
  font-size: 0.5rem;
  font-weight: 800;
  letter-spacing: 0.1em;
}

.github-card-head h2 {
  margin: 4px 0 0;
  font-size: 0.77rem;
}

.github-card-head h2 small {
  margin-left: 4px;
  color: var(--muted);
  font-size: 0.5rem;
  font-weight: 560;
}

.github-repository-list {
  display: grid;
  flex: 1 1 0;
  min-height: 0;
  gap: 5px;
  grid-template-rows: repeat(2, minmax(0, 1fr));
  overflow: hidden;
}

.github-repository {
  display: flex;
  min-width: 0;
  min-height: 0;
  padding: 2px 6px;
  align-items: center;
  gap: 7px;
  border: 1px solid rgba(255, 255, 255, 0.7);
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.46);
  transition: background 0.18s ease, transform 0.18s ease;
}

.github-repository:hover {
  background: rgba(255, 255, 255, 0.84);
  transform: translateX(2px);
}

.repository-mark {
  display: grid;
  width: 18px;
  height: 18px;
  flex: 0 0 auto;
  place-items: center;
  border-radius: 7px;
  color: #34445d;
  background: rgba(216, 228, 239, 0.78);
}

.repository-copy {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 2px;
}

.repository-copy strong,
.repository-copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.repository-copy strong {
  color: var(--ink);
  font-size: 0.58rem;
}

.repository-copy small {
  color: var(--muted);
  font-size: 0.49rem;
}

.repository-stat {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  color: var(--muted-strong);
  font-size: 0.5rem;
}

.repository-stat i {
  margin: 0 1px;
  color: rgba(77, 88, 164, 0.42);
  font-style: normal;
}

.github-empty {
  margin: auto 0;
  color: var(--muted);
  font-size: 0.6rem;
  line-height: 1.45;
}
</style>
