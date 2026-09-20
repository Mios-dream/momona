<script setup lang="ts">
import { onMounted, ref } from 'vue';
import { airQualityLabel, getWeatherInfo, type WeatherData } from '../../lib/weather';
import IconGlyph from '../app/IconGlyph.vue';

const weather = ref<WeatherData | null>(null);
const loading = ref(true);

onMounted(async () => {
  weather.value = await getWeatherInfo();
  loading.value = false;
});
</script>

<template>
  <section class="home-weather-card glass-panel" aria-label="天气信息">
    <template v-if="weather">
      <div class="weather-main">
        <img :src="weather.icon" :alt="weather.weather" />
        <div>
          <strong>{{ weather.temperature }}°</strong>
          <span>{{ weather.weather }}</span>
        </div>
        <small class="weather-city"><IconGlyph name="mapPin" :size="11" />{{ weather.city }}</small>
      </div>
      <div class="weather-metrics">
        <span><IconGlyph name="droplets" :size="13" />{{ weather.humidity }}%</span>
        <span><IconGlyph name="wind" :size="13" />{{ weather.windSpeed }} km/h</span>
        <span v-if="weather.aqi !== undefined"><IconGlyph name="cloud" :size="13" />AQI {{ weather.aqi }}</span>
      </div>
      <small class="weather-air">{{ airQualityLabel(weather.aqi) }}</small>
    </template>
    <div v-else class="weather-empty">
      <IconGlyph :name="loading ? 'refresh' : 'cloud'" :size="21" />
      <span>{{ loading ? '正在读取天气' : '天气暂不可用' }}</span>
    </div>
  </section>
</template>

<style scoped>
.home-weather-card {
  display: flex;
  min-height: 150px;
  padding: 12px 15px 12px;
  flex-direction: column;
  justify-content: space-between;
  background: linear-gradient(145deg, rgba(255, 255, 252, 0.78), rgba(232, 242, 255, 0.62));
}

.weather-main {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 4px;
}

.weather-main img {
  width: 36px;
  height: 36px;
  object-fit: contain;
}

.weather-main div {
  display: flex;
  align-items: baseline;
  gap: 7px;
}

.weather-main strong {
  font-size: 2.18rem;
  font-weight: 780;
  line-height: 0.92;
}

.weather-main span {
  color: var(--muted);
  font-size: 0.6rem;
}

.weather-city {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--muted);
  font-size: 0.54rem;
}

.weather-metrics {
  display: flex;
  align-items: center;
  gap: 11px;
}

.weather-metrics span {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  color: var(--muted-strong);
  font-size: 0.56rem;
}

.weather-air {
  color: var(--muted);
  font-size: 0.5rem;
}

.weather-empty {
  display: flex;
  width: 100%;
  height: 100%;
  align-items: center;
  justify-content: center;
  gap: 7px;
  color: var(--muted);
  font-size: 0.62rem;
}
</style>
