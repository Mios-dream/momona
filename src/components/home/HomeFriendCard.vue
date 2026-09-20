<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import type { FriendLink } from "../../data/types";
import { cloneFriendLinks } from "../../data/friends";
import { FRIEND_ROTATION_INTERVAL } from "../../data/homeWidgets";
import FriendAvatar from "../app/FriendAvatar.vue";

interface Props {
  friends?: FriendLink[];
  interval?: number;
}

const props = withDefaults(defineProps<Props>(), {
  friends: () => [],
  interval: FRIEND_ROTATION_INTERVAL,
});

const friends = ref<FriendLink[]>(cloneFriendLinks(props.friends));
const activeIndex = ref(0);
const isPaused = ref(false);
let rotationTimer: number | null = null;

const currentFriend = computed(() => friends.value[activeIndex.value] ?? null);

const clearRotation = (): void => {
  if (rotationTimer !== null) {
    window.clearInterval(rotationTimer);
    rotationTimer = null;
  }
};

const advance = (offset = 1): void => {
  if (friends.value.length < 2) return;
  activeIndex.value =
    (activeIndex.value + offset + friends.value.length) % friends.value.length;
};

const startRotation = (): void => {
  clearRotation();
  if (typeof window === "undefined" || friends.value.length < 2) return;
  const interval = Math.min(
    30000,
    Math.max(2000, Number(props.interval) || FRIEND_ROTATION_INTERVAL),
  );
  rotationTimer = window.setInterval(() => {
    if (!isPaused.value) advance();
  }, interval);
};

watch(
  () => props.friends,
  (value) => {
    friends.value = cloneFriendLinks(value);
    activeIndex.value = 0;
    startRotation();
  },
  { deep: true },
);

watch(() => props.interval, startRotation);

onMounted(() => {
  startRotation();
});

onBeforeUnmount(clearRotation);
</script>

<template>
  <section
    class="home-friend-card-shell"
    aria-label="友联轮播"
    @mouseenter="isPaused = true"
    @mouseleave="isPaused = false"
    @focusin="isPaused = true"
    @focusout="isPaused = false"
    @keydown.left.prevent="advance(-1)"
    @keydown.right.prevent="advance(1)"
  >
    <Transition name="friend-slide" mode="out-in">
      <article
        v-if="currentFriend"
        :key="currentFriend.id"
        class="home-friend-card"
        :class="`tone-${currentFriend.tone}`"
      >
        <a
          class="home-friend-card-link"
          :href="currentFriend.href"
          target="_blank"
          rel="noreferrer"
          :aria-label="`访问 ${currentFriend.nickname}`"
        >
          <FriendAvatar
            class="home-friend-avatar"
            :src="currentFriend.avatar"
            :alt="`${currentFriend.nickname} 的头像`"
            :icon-size="22"
            loading="eager"
          />
          <strong class="home-friend-name">{{ currentFriend.nickname }}</strong>
          <p class="home-friend-signature">{{ currentFriend.signature }}</p>
        </a>
      </article>
      <div v-else class="home-friend-empty">
        <span>暂无友联</span>
      </div>
    </Transition>
  </section>
</template>

<style scoped>
.home-friend-card-shell {
  position: relative;
  display: block;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.9);
  border-radius: 15px;
  background: linear-gradient(
    160deg,
    rgba(255, 238, 250, 0.98) 0%,
    rgba(250, 247, 255, 0.97) 56%,
    rgba(237, 246, 255, 0.98) 100%
  );
  box-shadow:
    0 14px 28px rgba(63, 72, 133, 0.14),
    inset 0 1px 0 rgba(255, 255, 255, 0.76);
  transition:
    transform 0.2s ease,
    box-shadow 0.2s ease;
}

.home-friend-card-shell:hover,
.home-friend-card-shell:focus-within {
  box-shadow:
    0 17px 32px rgba(63, 72, 133, 0.18),
    inset 0 1px 0 rgba(255, 255, 255, 0.82);
  transform: translateY(-1px);
}

.home-friend-card {
  display: flex;
  width: 100%;
  height: 100%;
  color: var(--ink);
  outline: none;
}

.home-friend-empty {
  display: grid;
  width: 100%;
  height: 100%;
  min-height: 0;
  place-items: center;
  color: var(--muted);
  font-size: 0.62rem;
}

.home-friend-card-link {
  display: flex;
  width: 100%;
  height: 100%;
  min-height: 0;
  padding: 14px 10px 13px;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 6px;
  color: inherit;
  text-align: center;
  outline: none;
}

.home-friend-card-link:focus-visible {
  border-radius: 14px;
  outline: 2px solid rgba(117, 100, 222, 0.7);
  outline-offset: -4px;
}

.home-friend-avatar {
  width: clamp(62px, 52%, 78px);
  aspect-ratio: 1;
  height: auto;
  flex: 0 0 auto;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.96);
  border-radius: 10px;
  color: var(--friend-tone);
  background: rgba(255, 255, 255, 0.92);
  box-shadow: 0 5px 12px rgba(74, 73, 122, 0.1);
}

.home-friend-name,
.home-friend-signature {
  display: block;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.home-friend-name {
  min-height: 1.2em;
  color: #202b40;
  font-size: 0.9rem;
  font-weight: 780;
  line-height: 1.2;
}

.home-friend-signature {
  display: -webkit-box;
  min-height: 2.4em;
  margin: 0;
  color: var(--muted);
  font-size: 0.58rem;
  line-height: 1.2;
  overflow-wrap: anywhere;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.home-friend-card.tone-lilac {
  --friend-tone: #7844aa;
}

.home-friend-card.tone-peach {
  --friend-tone: #e98c5c;
}

.home-friend-card.tone-mint {
  --friend-tone: #3aaf73;
}

.home-friend-card.tone-sky {
  --friend-tone: #3b77bc;
}

.home-friend-card.tone-butter {
  --friend-tone: #c28b40;
}

.home-friend-card.tone-rose {
  --friend-tone: #e95498;
}

.friend-slide-enter-active {
  animation: home-friend-enter 0.52s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.friend-slide-leave-active {
  animation: home-friend-exit 0.21s cubic-bezier(0.55, 0, 1, 0.45) both;
}

@keyframes home-friend-enter {
  0% {
    opacity: 0;
    transform: translateY(62%) scale(0.94);
  }
  66% {
    opacity: 1;
    transform: translateY(-5%) scale(1.018);
  }
  84% {
    opacity: 1;
    transform: translateY(1%) scale(0.995);
  }
  100% {
    opacity: 1;
    transform: none;
  }
}

@keyframes home-friend-exit {
  0% {
    opacity: 1;
    transform: none;
  }
  100% {
    opacity: 0;
    transform: translateY(-45%) scale(0.97);
  }
}

@media (prefers-reduced-motion: reduce) {
  .friend-slide-enter-active,
  .friend-slide-leave-active,
  .home-friend-card-shell {
    animation: none;
    transition: none;
  }
}
</style>
