<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { airQualityLabel, getWeatherInfo, type WeatherData } from '../../lib/weather';
import IconGlyph from './IconGlyph.vue';

interface Props {
  /** 不同页面使用的天气胶囊文案。 */
  variant?: 'default' | 'brew';
}

const props = withDefaults(defineProps<Props>(), {
  variant: 'default',
});

const isOpen = ref(false);
const weather = ref<WeatherData | null>(null);
const loading = ref(true);

/**
 * 展开或收起右上角的天气信息菜单。
 */
const toggleWeatherMenu = (): void => {
  isOpen.value = !isOpen.value;
};

/**
 * 关闭天气信息菜单。
 */
const closeWeatherMenu = (): void => {
  isOpen.value = false;
};

onMounted(async () => {
  weather.value = await getWeatherInfo();
  loading.value = false;
});
</script>

<template>
  <div class="weather-pill-wrap">
    <button
      class="weather-pill"
      type="button"
      aria-label="查看天气信息"
      :aria-expanded="isOpen"
      @click="toggleWeatherMenu"
    >
      <img v-if="weather" :src="weather.icon" :alt="weather.weather" />
      <IconGlyph v-else :name="loading ? 'refresh' : 'cloud'" :size="20" />
      <span class="weather-pill-copy">
        <strong v-if="weather">{{ weather.city }} {{ weather.temperature }}°</strong>
        <strong v-else>{{ loading ? '读取天气' : '暂无天气' }}</strong>
        <small v-if="weather">{{ weather.weather }} · {{ weather.humidity }}%</small>
        <small v-else>{{ loading ? '正在定位' : '没有可用数据' }}</small>
      </span>
      <IconGlyph name="chevronDown" :size="14" />
    </button>
    <div v-if="isOpen" class="weather-menu glass-panel" @mouseleave="closeWeatherMenu">
      <template v-if="weather">
        <strong>{{ weather.city }} · {{ weather.weather }}</strong>
        <span>体感 {{ weather.feelsLike }}° · 风速 {{ weather.windSpeed }} km/h</span>
        <span>{{ airQualityLabel(weather.aqi) }}</span>
      </template>
      <template v-else>
        <strong>暂无天气数据</strong>
        <span>浏览器定位或天气服务不可用。</span>
      </template>
    </div>
  </div>
</template>

<style scoped>
.weather-pill-wrap {
  position: fixed;
  z-index: 35;
  top: 16px;
  right: 16px;
  flex: 0 0 auto;
}

.weather-pill {
  display: flex;
  min-width: 160px;
  min-height: 48px;
  padding: 7px 10px;
  align-items: center;
  gap: 8px;
  border: 1px solid rgba(255, 255, 255, 0.82);
  border-radius: 24px;
  color: var(--ink);
  background: rgba(255, 255, 255, 0.68);
  box-shadow: 0 10px 24px rgba(54, 45, 106, 0.11);
  backdrop-filter: blur(18px) saturate(145%);
  transition: background 0.18s ease, transform 0.18s ease;
}

.weather-pill:hover {
  background: rgba(255, 255, 255, 0.88);
  transform: translateY(-2px);
}

.weather-pill img {
  width: 21px;
  height: 21px;
  object-fit: contain;
}

.weather-pill > svg {
  margin-left: auto;
  color: var(--muted);
}

.weather-pill-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
  gap: 1px;
}

.weather-pill-copy strong {
  font-size: 0.7rem;
  font-weight: 760;
  white-space: nowrap;
}

.weather-pill-copy small {
  color: var(--muted);
  font-size: 0.57rem;
  white-space: nowrap;
}

.weather-menu {
  position: absolute;
  top: calc(100% + 9px);
  right: 0;
  display: flex;
  width: 174px;
  padding: 13px 14px;
  flex-direction: column;
  gap: 7px;
  color: var(--muted-strong);
  font-size: 0.64rem;
}

.weather-menu strong {
  color: var(--ink);
  font-size: 0.72rem;
}

@media (max-width: 460px) {
  .weather-pill-wrap {
    top: 12px;
    right: 12px;
  }

  .weather-pill {
    min-width: 160px;
  }
}
</style>
