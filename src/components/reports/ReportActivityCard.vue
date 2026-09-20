<script setup lang="ts">
import type { ReportActivity } from '../../data/types';
import IconGlyph from '../app/IconGlyph.vue';

interface Props {
  /** 报告页底部活动卡片。 */
  activity: ReportActivity;
}

defineProps<Props>();
</script>

<template>
  <article class="report-activity-card glass-panel">
    <div class="activity-image">
      <img :src="activity.image" :alt="activity.title" />
      <span>{{ activity.mark }}</span>
    </div>
    <div class="activity-card-copy">
      <span>{{ activity.category }}</span>
      <strong>{{ activity.title }}</strong>
      <small>{{ activity.subtitle }}</small>
    </div>
    <IconGlyph name="external" :size="14" />
  </article>
</template>

<style scoped>
.report-activity-card {
  position: relative;
  display: flex;
  min-width: 250px;
  height: 126px;
  padding: 8px;
  align-items: stretch;
  gap: 9px;
  overflow: hidden;
  background: rgba(255, 255, 255, 0.65);
  transition: transform 0.2s ease, box-shadow 0.2s ease;
}

.report-activity-card:hover {
  box-shadow: 0 23px 44px rgba(54, 45, 106, 0.2);
  transform: translateY(-4px);
}

.activity-image {
  position: relative;
  width: 119px;
  overflow: hidden;
  border-radius: 9px;
}

.activity-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  filter: saturate(1.12);
}

.activity-image span {
  position: absolute;
  right: 7px;
  bottom: 6px;
  display: grid;
  width: 22px;
  height: 22px;
  place-items: center;
  border-radius: 7px;
  color: var(--purple-deep);
  background: rgba(255, 255, 255, 0.82);
  font-size: 0.72rem;
}

.activity-card-copy {
  display: flex;
  min-width: 0;
  padding: 7px 3px;
  flex: 1;
  flex-direction: column;
  gap: 4px;
}

.activity-card-copy span {
  color: var(--purple-deep);
  font-size: 0.53rem;
  font-weight: 760;
}

.activity-card-copy strong {
  display: -webkit-box;
  overflow: hidden;
  font-size: 0.73rem;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.activity-card-copy small {
  display: -webkit-box;
  overflow: hidden;
  margin-top: auto;
  color: var(--muted);
  font-size: 0.55rem;
  line-height: 1.35;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.report-activity-card > svg {
  position: absolute;
  top: 12px;
  right: 11px;
  color: var(--muted);
}
</style>
