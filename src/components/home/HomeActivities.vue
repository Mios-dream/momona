<script setup lang="ts">
import type { ReportActivity } from '../../data/types';
import IconGlyph from '../app/IconGlyph.vue';

interface Props {
  /** 首页最近活动列表。 */
  activities: ReportActivity[];
}

defineProps<Props>();
</script>

<template>
  <section class="home-activities glass-panel" aria-labelledby="activity-title">
    <div class="activity-heading">
      <div>
        <span class="section-eyebrow">RECENT ACTIVITY</span>
        <h2 id="activity-title">最近活动</h2>
      </div>
      <IconGlyph name="activity" :size="18" />
    </div>
    <div v-if="activities.length" class="activity-list">
      <article v-for="activity in activities" :key="activity.id" class="activity-row">
        <span class="activity-mark">{{ activity.mark }}</span>
        <div>
          <strong>{{ activity.category }}</strong>
          <span>{{ activity.title }}</span>
        </div>
        <small>{{ activity.subtitle }}</small>
      </article>
    </div>
    <p v-else class="activity-empty">暂无活动</p>
    <p v-if="activities.length" class="activity-footnote">只加载最近 8 个</p>
  </section>
</template>

<style scoped>
.home-activities {
  min-height: 150px;
  padding: 12px 13px 10px;
  background: rgba(255, 255, 255, 0.62);
}

.activity-heading {
  display: flex;
  align-items: start;
  justify-content: space-between;
}

.activity-heading > svg {
  color: var(--purple-deep);
}

.section-eyebrow {
  color: var(--purple-deep);
  font-size: 0.54rem;
  font-weight: 800;
  letter-spacing: 0.1em;
}

.activity-heading h2 {
  margin: 4px 0 0;
  font-size: 0.78rem;
}

.activity-list {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 6px;
  margin-top: 9px;
}

.activity-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 7px;
  min-width: 0;
  padding: 6px 7px;
  border: 1px solid rgba(255, 255, 255, 0.68);
  border-radius: 9px;
  background: rgba(255, 255, 255, 0.44);
}

.activity-row:nth-child(n + 3) {
  display: none;
}

.activity-mark {
  display: grid;
  width: 22px;
  height: 22px;
  place-items: center;
  border-radius: 7px;
  color: var(--purple-deep);
  background: rgba(235, 231, 255, 0.72);
  font-size: 0.72rem;
}

.activity-row div {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.activity-row strong,
.activity-row span,
.activity-row small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.activity-row strong {
  font-size: 0.58rem;
}

.activity-row div span,
.activity-row small {
  color: var(--muted);
  font-size: 0.52rem;
}

.activity-footnote {
  margin: 7px 0 0;
  color: var(--muted);
  font-size: 0.53rem;
  text-align: right;
}

.activity-empty {
  display: flex;
  min-height: 72px;
  margin: 0;
  align-items: center;
  justify-content: center;
  color: var(--muted);
  font-size: 0.62rem;
}

@media (max-width: 820px) {
  .home-activities {
    padding-bottom: 15px;
  }

  .activity-list {
    grid-template-columns: 1fr;
  }
}
</style>
