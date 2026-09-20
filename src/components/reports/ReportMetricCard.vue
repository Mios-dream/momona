<script setup lang="ts">
import type { ReportMetric } from '../../data/types';

interface Props {
  /** 单项报告指标。 */
  metric: ReportMetric;
}

defineProps<Props>();
</script>

<template>
  <article class="report-metric glass-panel">
    <span>{{ metric.label }}</span>
    <strong>{{ metric.value }}</strong>
    <small :class="`trend-${metric.trend}`">{{ metric.change }}</small>
  </article>
</template>

<style scoped>
.report-metric {
  display: flex;
  min-height: 108px;
  padding: 14px 15px;
  flex-direction: column;
  gap: 5px;
  background: rgba(255, 255, 255, 0.64);
}

.report-metric > span {
  color: var(--muted);
  font-size: 0.59rem;
}

.report-metric strong {
  font-size: 1.35rem;
  font-weight: 780;
}

.report-metric small {
  width: max-content;
  padding: 3px 6px;
  border-radius: 5px;
  color: var(--muted-strong);
  background: rgba(220, 221, 230, 0.4);
  font-size: 0.52rem;
}

.report-metric small.trend-up {
  color: var(--green);
  background: rgba(53, 165, 123, 0.1);
}

.report-metric small.trend-down {
  color: var(--pink);
  background: rgba(241, 110, 168, 0.1);
}
</style>
