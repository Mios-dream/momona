<script setup lang="ts">
import FallbackImage from "../app/FallbackImage.vue";

const now = new Date();
const greeting =
  now.getHours() < 6
    ? "夜深了"
    : now.getHours() < 12
      ? "早上好"
      : now.getHours() < 18
        ? "下午好"
        : "晚上好";
const dateLabel = new Intl.DateTimeFormat("zh-CN", {
  month: "long",
  day: "numeric",
  weekday: "long",
}).format(now);
</script>

<template>
  <section class="home-greeting glass-panel" aria-labelledby="greeting-title">
    <FallbackImage
      class="greeting-hand"
      src="/assets/home-welcome.webp"
      alt=""
      fallback-icon="sparkles"
      :icon-size="20"
      object-fit="contain"
    />
    <h1 id="greeting-title">{{ greeting }}</h1>
    <p>{{ dateLabel }}</p>
  </section>
</template>

<style scoped>
.home-greeting {
  position: relative;
  display: flex;
  min-height: 150px;
  padding: 14px 15px 13px;
  flex-direction: column;
  overflow: hidden;
  background: linear-gradient(
    145deg,
    rgba(255, 246, 255, 0.76),
    rgba(240, 231, 255, 0.54)
  );
}

.home-greeting::after {
  position: absolute;
  right: -28px;
  bottom: -40px;
  width: 150px;
  height: 150px;
  border: 1px solid rgba(241, 110, 168, 0.22);
  border-radius: 50%;
  box-shadow:
    0 0 0 18px rgba(241, 110, 168, 0.07),
    0 0 0 36px rgba(117, 100, 222, 0.05);
  content: "";
}

.greeting-hand {
  position: relative;
  z-index: 1;
  width: 34px;
  height: 34px;
  object-fit: contain;
  line-height: 1;
}

.home-greeting h1 {
  position: relative;
  z-index: 1;
  margin: 8px 0 5px;
  color: var(--ink);
  font-size: clamp(2rem, 4vw, 2.35rem);
  font-weight: 780;
  letter-spacing: 0;
  line-height: 0.98;
}

.home-greeting p {
  position: relative;
  z-index: 1;
  margin: 0;
  color: var(--muted);
  font-size: 0.66rem;
}
</style>
