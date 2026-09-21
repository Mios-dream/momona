<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type {
  GameShowcaseItem,
  HomeWidgetSettings,
  HoyoGame,
} from "../../data/types";
import FallbackImage from "../app/FallbackImage.vue";

interface Props {
  settings?: HomeWidgetSettings["game"];
  interactive?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  interactive: true,
});

interface GameMeta {
  icon: string;
  artPosition: string;
  accent: string;
  softBackground: string;
  border: string;
}

const GAME_META: Record<HoyoGame, GameMeta> = {
  genshin: {
    icon: "/assets/game-logos/genshin-icon.webp",
    artPosition: "center center",
    accent: "#C9A227",
    softBackground: "rgba(201, 162, 39, 0.16)",
    border: "rgba(201, 162, 39, 0.28)",
  },
  hsr: {
    icon: "/assets/game-logos/starrail-icon.webp",
    artPosition: "center 25%",
    accent: "#6B5CE7",
    softBackground: "rgba(107, 92, 231, 0.16)",
    border: "rgba(107, 92, 231, 0.28)",
  },
  zzz: {
    icon: "/assets/game-logos/zzz-icon.webp",
    artPosition: "center center",
    accent: "#E8C547",
    softBackground: "rgba(232, 197, 71, 0.16)",
    border: "rgba(232, 197, 71, 0.28)",
  },
};

const account = computed(() => props.settings?.account);
const game = computed<HoyoGame>(
  () => props.settings?.game ?? account.value?.game ?? "hsr",
);
const gameMeta = computed(() => GAME_META[game.value]);
const gameStyle = computed<Record<string, string>>(() => ({
  "--game-accent": gameMeta.value.accent,
  "--game-soft-background": gameMeta.value.softBackground,
  "--game-border": gameMeta.value.border,
}));
const gameName = computed(
  () => ({ genshin: "原神", hsr: "星穹铁道", zzz: "绝区零" })[game.value],
);
const gameLevelLabel = computed(
  () => ({ genshin: "冒险等阶", hsr: "开拓等级", zzz: "绳网等级" })[game.value],
);
const characters = computed<GameShowcaseItem[]>(
  () => account.value?.showcase?.filter((item) => item.name) ?? [],
);
const hasShowcase = computed(() => characters.value.length > 0);
const activeCharacterIndex = ref(0);
const characterQueue = ref<HTMLElement | null>(null);
const activeCharacter = computed(
  () => characters.value[activeCharacterIndex.value] ?? null,
);
const activeCharacterImage = computed(() =>
  resolveGameAsset(activeCharacter.value?.art || activeCharacter.value?.icon),
);

/**
 * 将游戏资源名转换为可直接加载的图片地址。
 *
 * @param value - 游戏资源文件名或已经是 URL 的地址。
 * @returns 可供 img 元素使用的资源地址。
 */
function resolveGameAsset(value?: string): string {
  const source = value?.trim();
  if (!source) return "";
  if (source.startsWith("//")) return `https:${source}`;
  if (/^https?:\/\//i.test(source) || source.startsWith("/")) return source;
  if (game.value === "hsr")
    return `https://api.mihomo.me/${source.replace(/^\/+/, "")}`;
  return source;
}

/**
 * 读取角色缩略图地址，并在缺少图标时使用立绘。
 *
 * @param character - 游戏账号中的角色信息。
 * @returns 角色缩略图或立绘资源地址。
 */
function characterThumbnail(character: GameShowcaseItem): string {
  return resolveGameAsset(character.icon || character.art);
}

/**
 * 根据角色稀有度返回角色环颜色。
 *
 * @param rarity - 角色稀有度。
 * @returns 与稀有度对应的 CSS 颜色值。
 */
function rarityRing(rarity?: number): string {
  if (rarity === 5) return "#e8b33b";
  if (rarity === 4) return "#a47ce0";
  return gameMeta.value.border;
}

/**
 * 根据角色是否选中和稀有度返回角色环颜色。
 *
 * @param character - 需要渲染的角色。
 * @param index - 角色在当前列表中的索引。
 * @returns 选中态或普通态的 CSS 颜色值。
 */
function characterRing(character: Character, index: number): string {
  return index === activeCharacterIndex.value
    ? gameMeta.value.accent
    : rarityRing(character.rarity);
}
watch([game, characters], () => {
  activeCharacterIndex.value = 0;
});

watch(
  [activeCharacterIndex, characters],
  () => {
    const queue = characterQueue.value;
    const button = queue?.children[activeCharacterIndex.value] as
      | HTMLElement
      | undefined;
    if (!queue || !button) return;
    queue.scrollTo({
      left: button.offsetLeft - (queue.clientWidth - button.offsetWidth) / 2,
      behavior: "smooth",
    });
  },
  { flush: "post" },
);

const accountName = computed(() => account.value?.nickname || "暂无账号名称");
const accountUid = computed(
  () => props.settings?.uid || account.value?.uid || "",
);
const accountLevel = computed(
  () => account.value?.score?.value ?? account.value?.level ?? 0,
);
const accountAchievements = computed(() => account.value?.achievements ?? 0);
const accountCharacters = computed(() => account.value?.characters ?? 0);
const activeCharacterLevel = computed(() => activeCharacter.value?.level);
const activeCharacterRarity = computed(() => {
  const rarity = activeCharacter.value?.rarity;
  return rarity == null ? undefined : Math.min(5, Math.max(1, rarity));
});
const profileUrl = computed(() => {
  const configuredUrl = account.value?.profileUrl?.trim();
  if (configuredUrl) return configuredUrl;

  const uid = accountUid.value.trim();
  if (!uid) return "";
  return game.value === "genshin"
    ? `https://enka.network/u/${encodeURIComponent(uid)}`
    : `https://enka.network/${game.value}/${encodeURIComponent(uid)}`;
});
const canOpenProfile = computed(() =>
  Boolean(props.interactive && account.value && profileUrl.value),
);

/**
 * 在新窗口打开当前游戏账号的公开资料页。
 *
 * @returns 无返回值；缺少账号地址时不会打开窗口。
 */
function openProfile(): void {
  if (!canOpenProfile.value) return;
  window.open(profileUrl.value, "_blank", "noopener,noreferrer");
}

/**
 * 处理游戏卡片的键盘打开操作。
 *
 * @param event - 游戏卡片收到的键盘事件。
 * @returns 无返回值；仅处理 Enter 和空格键。
 */
function handleCardKeydown(event: KeyboardEvent): void {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  openProfile();
}

/** 选择游戏角色。 */
/**
 * 选择要展示详情的角色索引。
 *
 * @param index - 角色在可展示角色列表中的索引。
 * @returns 无返回值；非法索引会被忽略。
 */
function selectCharacter(index: number): void {
  activeCharacterIndex.value = index;
}
</script>

<template>
  <section
    class="home-game-card glass-panel"
    :class="[
      `game-${game}`,
      {
        'has-account': Boolean(account),
        'has-showcase': hasShowcase,
        'is-clickable': canOpenProfile,
      },
    ]"
    :style="gameStyle"
    :data-game="game"
    :role="canOpenProfile ? 'link' : undefined"
    :tabindex="canOpenProfile ? 0 : undefined"
    :aria-label="account ? `${gameName}游戏资料` : '暂无游戏资料'"
    @click="openProfile"
    @keydown="handleCardKeydown"
  >
    <div class="game-layout">
      <div v-if="hasShowcase" class="game-art">
        <Transition name="game-art" mode="out-in">
          <FallbackImage
            :key="`${activeCharacter.name}-${activeCharacterIndex}`"
            :src="activeCharacterImage"
            :alt="activeCharacter.name"
            fallback-icon="game"
            :icon-size="42"
            :object-position="gameMeta.artPosition"
            :class="{ 'game-art-image': Boolean(activeCharacter?.art) }"
            referrer-policy="no-referrer"
          />
        </Transition>
        <div class="game-art-caption">
          <strong>{{ activeCharacter.name }}</strong>
          <span>
            <span v-if="activeCharacterLevel != null"
              >Lv.{{ activeCharacterLevel }}</span
            >
            <span
              v-if="
                activeCharacterLevel != null && activeCharacterRarity != null
              "
            >
              ·
            </span>
            <span
              v-if="activeCharacterRarity != null"
              :style="{ color: rarityRing(activeCharacterRarity) }"
            >
              {{ "★".repeat(activeCharacterRarity) }}
            </span>
          </span>
        </div>
      </div>

      <div class="game-details">
        <span
          class="game-wordmark"
          :class="`game-wordmark-${game}`"
          aria-hidden="true"
        />

        <div
          v-if="hasShowcase"
          ref="characterQueue"
          class="game-characters"
          aria-label="公开展柜"
        >
          <button
            v-for="(character, index) in characters"
            :key="`${character.name}-${index}`"
            type="button"
            :class="{ 'is-active': index === activeCharacterIndex }"
            :style="{ '--character-ring': characterRing(character, index) }"
            :aria-label="`选择${character.name}`"
            :aria-pressed="index === activeCharacterIndex"
            :title="
              character.level != null
                ? `${character.name} · Lv.${character.level}`
                : character.name
            "
            @click.stop="selectCharacter(index)"
            @keydown.stop
          >
            <FallbackImage
              class="game-character-image"
              :src="characterThumbnail(character)"
              :alt="character.name"
              fallback-icon="game"
              :icon-size="16"
              loading="lazy"
              referrer-policy="no-referrer"
            />
          </button>
        </div>

        <div v-if="hasShowcase" class="game-stats">
          <span>
            <small>{{ account?.score?.label || gameLevelLabel }}</small>
            <strong>{{ accountLevel }}</strong>
          </span>
          <span>
            <small>成就</small>
            <strong>{{ accountAchievements }}</strong>
          </span>
          <span>
            <small>角色</small>
            <strong>{{ accountCharacters }}</strong>
          </span>
        </div>

        <div v-else class="game-empty">
          <span>{{ account ? "暂无公开展柜" : "暂无游戏数据" }}</span>
        </div>

        <div v-if="account" class="game-footer">
          <FallbackImage
            class="game-app-icon"
            :src="gameMeta.icon"
            :alt="gameName"
            fallback-icon="game"
            :icon-size="18"
            loading="lazy"
          />
          <span class="game-account">
            <strong>{{ accountName }}</strong>
            <small v-if="accountUid">UID {{ accountUid }}</small>
          </span>
        </div>
      </div>
    </div>
  </section>
</template>

<style scoped>
.home-game-card {
  --game-accent: #6b5ce7;
  --game-soft-background: rgba(107, 92, 231, 0.16);
  --game-border: rgba(107, 92, 231, 0.28);
  --game-wordmark: none;
  position: relative;
  display: flex;
  height: 100%;
  min-height: 0;
  padding: 12px 13px;
  overflow: hidden;
  border-color: var(--game-border);
  background: var(--glass);
  box-shadow:
    var(--glass-shadow),
    0 10px 28px color-mix(in srgb, var(--game-accent) 12%, transparent);
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease;
}

.home-game-card.is-clickable {
  cursor: pointer;
}

.home-game-card.is-clickable:hover,
.home-game-card.is-clickable:focus-visible {
  box-shadow:
    var(--glass-shadow),
    0 16px 34px color-mix(in srgb, var(--game-accent) 18%, transparent);
  transform: translateY(-2px);
}

.home-game-card.is-clickable:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--game-accent) 58%, white);
  outline-offset: 3px;
}

.home-game-card.game-genshin {
  font-family: "Momona Inter", "Segoe UI", sans-serif;
}

.home-game-card.game-hsr {
  font-weight: 700;
}

.home-game-card.game-zzz {
  font-style: italic;
  font-weight: 800;
  letter-spacing: 0.01em;
}

.game-layout {
  display: flex;
  width: 100%;
  min-width: 0;
  min-height: 0;
  flex: 1;
  gap: 12px;
}

.game-art {
  position: relative;
  width: 34%;
  min-width: 78px;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--game-border);
  border-radius: 8px;
  background: var(--game-soft-background);
}

.game-art > .app-image {
  display: block;
  width: 100%;
  height: 100%;
}

.game-art-image {
  transform: scale(1.04);
  transform-origin: center center;
  animation: game-art-zoom 4.5s ease-out forwards;
}

@keyframes game-art-zoom {
  from {
    transform: scale(1.04);
  }

  to {
    transform: scale(1.08);
  }
}

.game-art-caption {
  position: absolute;
  right: 0;
  bottom: 0;
  left: 0;
  display: flex;
  padding: 28px 8px 6px;
  flex-direction: column;
  gap: 2px;
  color: #fff;
  background: linear-gradient(to top, rgba(0, 0, 0, 0.78), rgba(0, 0, 0, 0));
  pointer-events: none;
}

.game-art-caption strong {
  overflow: hidden;
  font-size: 0.68rem;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.game-art-caption span {
  font-size: 0.52rem;
  line-height: 1;
}

.game-art-enter-active,
.game-art-leave-active {
  transition:
    opacity 0.28s ease,
    transform 0.28s ease;
}

.game-art-enter-from {
  opacity: 0;
  transform: scale(1.06);
}

.game-art-leave-to {
  opacity: 0;
  transform: scale(0.98);
}

.game-details {
  position: relative;
  display: flex;
  min-width: 0;
  min-height: 0;
  flex: 1;
  flex-direction: column;
}

.game-wordmark {
  position: absolute;
  display: block;
  right: 8px;
  bottom: 4px;
  width: auto;
  height: 42%;
  background: currentColor;
  color: var(--game-accent);
  mask-position: left center;
  mask-repeat: no-repeat;
  mask-size: contain;
  opacity: 0.06;
  pointer-events: none;
}

.home-game-card:not(.has-account) .game-wordmark {
  display: none;
}

.game-wordmark-genshin {
  aspect-ratio: 391.8 / 121.6;
  mask-image: url("/assets/game-logos/genshin.svg");
}

.game-wordmark-hsr {
  aspect-ratio: 443 / 225;
  mask-image: url("/assets/game-logos/starrail.webp");
}

.game-wordmark-zzz {
  aspect-ratio: 98.7 / 31.2;
  mask-image: url("/assets/game-logos/zzz.svg");
}

.game-characters {
  position: relative;
  display: flex;
  width: 100%;
  min-width: 0;
  height: 38px;
  min-height: 38px;
  flex: 0 0 38px;
  align-items: center;
  gap: 8px;
  overflow-x: auto;
  overflow-y: hidden;
  padding: 4px 6px;
  overscroll-behavior-inline: contain;
  scrollbar-width: none;
  scroll-behavior: smooth;
  touch-action: pan-x;
}

.game-characters::-webkit-scrollbar {
  display: none;
}

.game-characters button {
  display: grid;
  width: 30px;
  height: 30px;
  padding: 0;
  flex: 0 0 auto;
  place-items: center;
  border: 0;
  border-radius: 50%;
  outline: 0 solid transparent;
  background: transparent;
  opacity: 0.45;
  box-shadow: 0 0 0 1.5px var(--character-ring);
  transition:
    transform 0.22s ease,
    opacity 0.22s ease,
    box-shadow 0.22s ease;
}

.game-characters button.is-active,
.game-characters button:hover,
.game-characters button:focus-visible {
  opacity: 1;
  transform: scale(1.05);
  box-shadow: 0 0 0 2px var(--character-ring);
}

.game-characters button:focus-visible {
  outline: 2px solid color-mix(in srgb, var(--game-accent) 52%, white);
  outline-offset: 3px;
}

.game-character-image {
  width: 100%;
  height: 100%;
  border-radius: 50%;
}

.game-stats {
  position: relative;
  display: flex;
  margin-top: 8px;
  align-items: center;
  gap: 18px;
  overflow: hidden;
}

.game-stats span {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.game-stats small {
  overflow: hidden;
  color: var(--muted);
  font-size: 0.5rem;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.game-stats strong {
  color: var(--game-accent);
  font-size: 1.2rem;
  line-height: 1;
}

.game-empty {
  position: relative;
  display: flex;
  min-height: 70px;
  align-items: center;
  justify-content: center;
  gap: 9px;
  color: var(--muted);
  font-size: 0.62rem;
  text-align: center;
}

.game-footer {
  position: relative;
  display: flex;
  min-width: 0;
  margin-top: auto;
  padding-top: 3px;
  align-items: center;
  gap: 8px;
}

.game-app-icon {
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  border-radius: 8px;
  object-fit: cover;
  box-shadow: 0 4px 10px color-mix(in srgb, var(--game-accent) 15%, transparent);
}

.game-account {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 3px;
}

.game-account strong,
.game-account small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.game-account strong {
  color: var(--ink);
  font-size: 0.68rem;
  line-height: 1;
}

.game-account small {
  color: var(--muted);
  font-size: 0.52rem;
  line-height: 1;
}

@media (prefers-reduced-motion: reduce) {
  .game-art-image {
    animation: none;
  }

  .game-art-enter-active,
  .game-art-leave-active,
  .game-characters button {
    transition: none;
  }
}
</style>
