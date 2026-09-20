<script setup lang="ts">
import { computed } from "vue";
import {
  friendIntervalOptions,
  homeWidgetDefinitions,
  linkPlatformOptions,
  widgetIconOptions,
  widgetToneOptions,
} from "../../data/homeWidgets";
import type {
  HoyoGame,
  HomeWidget,
  IconName,
  LinkPlatform,
  LinkWidgetSettings,
} from "../../data/types";
import IconGlyph from "../app/IconGlyph.vue";

interface Props {
  widget: HomeWidget;
  gameBusy?: boolean;
  gameError?: string;
}

const props = withDefaults(defineProps<Props>(), {
  gameBusy: false,
  gameError: "",
});

const emit = defineEmits<{
  close: [];
  remove: [];
  "update:widget": [widget: HomeWidget];
  "fetch-game": [uid: string];
}>();

const desktopWidthOptions = [1, 2, 3, 4, 6, 8, 12, 16];
const desktopHeightOptions = [1, 2, 3, 4, 5, 6];
const mobileWidthOptions = [1, 2];
const mobileHeightOptions = [1, 2, 3, 4];

const definition = computed(
  () =>
    homeWidgetDefinitions.find((item) => item.type === props.widget.type) ??
    homeWidgetDefinitions[0],
);
const canResize = computed(() => definition.value.resizable === true);
const linkSettings = computed(() => props.widget.settings?.link);
const gameSettings = computed(() => props.widget.settings?.game);
const friendSettings = computed(() => props.widget.settings?.friend);
const gameId = computed<HoyoGame>(() => gameSettings.value?.game ?? "hsr");
const gameName = computed(
  () => ({ genshin: "原神", hsr: "星穹铁道", zzz: "绝区零" })[gameId.value],
);
const gameLevelLabel = computed(
  () => ({ genshin: "冒险等阶", hsr: "开拓等级", zzz: "绳网等级" })[gameId.value],
);
const widgetDisplayName = computed(
  () => linkSettings.value?.title?.trim() || props.widget.label,
);

const updateWidget = (patch: Partial<HomeWidget>): void => {
  emit("update:widget", { ...props.widget, ...patch });
};

const updateLink = (key: keyof LinkWidgetSettings, value: unknown): void => {
  if (!linkSettings.value) return;
  emit("update:widget", {
    ...props.widget,
    settings: {
      ...props.widget.settings,
      link: { ...linkSettings.value, [key]: value },
    },
  });
};

const updateGameUid = (value: string): void => {
  if (!gameSettings.value) return;
  emit("update:widget", {
    ...props.widget,
    settings: {
      ...props.widget.settings,
      game: { ...gameSettings.value, uid: value, account: null },
    },
  });
};

const updateGame = (value: HoyoGame): void => {
  if (!gameSettings.value) return;
  emit("update:widget", {
    ...props.widget,
    settings: {
      ...props.widget.settings,
      game: { ...gameSettings.value, game: value, account: null },
    },
  });
};

const updateFriendInterval = (value: number): void => {
  if (!friendSettings.value) return;
  emit("update:widget", {
    ...props.widget,
    settings: {
      ...props.widget.settings,
      friend: { ...friendSettings.value, interval: value },
    },
  });
};

const iconLabel = (icon: IconName): string =>
  ({
    external: "外部链接",
    link: "链接",
    github: "GitHub",
    game: "游戏",
    video: "视频",
    music: "音乐",
    mail: "邮件",
    at: "@",
    user: "用户",
    globe: "网页",
    star: "星标",
    sparkles: "闪光",
    messageCircle: "消息",
    messagesSquare: "群聊",
    send: "发送",
    camera: "相机",
    code2: "代码",
    cloud: "云朵",
    cloudFog: "雾",
    cloudLightning: "雷电",
    cloudRain: "降雨",
    cloudSnow: "降雪",
    headphones: "耳机",
    radio: "电台",
    bot: "机器人",
    palette: "调色板",
    shoppingBag: "商店",
    mapPin: "位置",
    circleUser: "用户",
    disc3: "唱片",
    droplets: "水滴",
  })[icon] ?? icon;

const platformLabel = (platform: LinkPlatform): string =>
  ({
    generic: "通用链接",
    qq: "QQ",
    github: "GitHub",
    email: "Email",
    steam: "Steam",
    blog: "博客",
    bilibili: "Bilibili",
    netease: "网易云音乐",
    qqmusic: "QQ 音乐",
    youtube: "YouTube",
    x: "X",
    discord: "Discord",
    telegram: "Telegram",
  })[platform];

const toneLabel = (tone: LinkWidgetSettings["tone"]): string =>
  ({ blue: "晴蓝", indigo: "靛青", ink: "墨色", violet: "紫罗兰" })[tone];

const requestGame = (): void => {
  const uid = gameSettings.value?.uid.trim();
  if (uid) emit("fetch-game", uid);
};
</script>

<template>
  <aside
    class="home-editor-panel glass-panel"
    role="dialog"
    aria-labelledby="home-editor-title"
    aria-label="组件配置"
  >
    <header class="editor-panel-head">
      <div class="editor-panel-heading">
        <span class="editor-panel-eyebrow"
          ><IconGlyph name="sliders" :size="12" />WIDGET / SETTINGS</span
        >
        <h2 id="home-editor-title">{{ widgetDisplayName }}</h2>
        <p>{{ definition.description }}</p>
      </div>
    </header>

    <div class="editor-panel-scroll">
      <section v-if="canResize" class="editor-section">
        <div class="editor-section-title">
          <span>卡片尺寸</span><small>{{ props.widget.type }}</small>
        </div>
        <div class="editor-size-grid">
          <label class="editor-field">
            <span>桌面宽</span>
            <select
              :value="props.widget.colSpan"
              @change="
                updateWidget({
                  colSpan: Number(($event.target as HTMLSelectElement).value),
                })
              "
            >
              <option
                v-for="size in desktopWidthOptions"
                :key="size"
                :value="size"
              >
                {{ size }} 格
              </option>
            </select>
          </label>
          <label class="editor-field">
            <span>桌面高</span>
            <select
              :value="props.widget.rowSpan"
              @change="
                updateWidget({
                  rowSpan: Number(($event.target as HTMLSelectElement).value),
                })
              "
            >
              <option
                v-for="size in desktopHeightOptions"
                :key="size"
                :value="size"
              >
                {{ size }} 格
              </option>
            </select>
          </label>
          <label class="editor-field">
            <span>移动宽</span>
            <select
              :value="props.widget.mobileColSpan"
              @change="
                updateWidget({
                  mobileColSpan: Number(
                    ($event.target as HTMLSelectElement).value,
                  ),
                })
              "
            >
              <option
                v-for="size in mobileWidthOptions"
                :key="size"
                :value="size"
              >
                {{ size }} 格
              </option>
            </select>
          </label>
          <label class="editor-field">
            <span>移动高</span>
            <select
              :value="props.widget.mobileRowSpan"
              @change="
                updateWidget({
                  mobileRowSpan: Number(
                    ($event.target as HTMLSelectElement).value,
                  ),
                })
              "
            >
              <option
                v-for="size in mobileHeightOptions"
                :key="size"
                :value="size"
              >
                {{ size }} 格
              </option>
            </select>
          </label>
        </div>
      </section>

      <section
        v-if="props.widget.type === 'link' && linkSettings"
        class="editor-section"
      >
        <div class="editor-section-title">
          <span>跳转卡片</span><IconGlyph name="link" :size="14" />
        </div>
        <label class="editor-field"
          ><span>对应平台</span
          ><select
            :value="linkSettings.platform"
            @change="
              updateLink(
                'platform',
                ($event.target as HTMLSelectElement).value as LinkPlatform,
              )
            "
          >
            <option
              v-for="platform in linkPlatformOptions"
              :key="platform"
              :value="platform"
            >
              {{ platformLabel(platform) }}
            </option>
          </select></label
        >
        <label class="editor-field"
          ><span>Title</span
          ><input
            :value="linkSettings.title"
            type="text"
            @input="
              updateLink('title', ($event.target as HTMLInputElement).value)
            "
        /></label>
        <label class="editor-field"
          ><span>副标题</span
          ><input
            :value="linkSettings.subtitle"
            type="text"
            @input="
              updateLink('subtitle', ($event.target as HTMLInputElement).value)
            "
        /></label>
        <label class="editor-field"
          ><span>跳转地址</span
          ><input
            :value="linkSettings.href"
            type="url"
            placeholder="https://"
            @input="
              updateLink('href', ($event.target as HTMLInputElement).value)
            "
        /></label>
        <div class="editor-size-grid">
          <label class="editor-field"
            ><span>图标</span
            ><select
              :value="linkSettings.icon"
              @change="
                updateLink('icon', ($event.target as HTMLSelectElement).value)
              "
            >
              <option
                v-for="icon in widgetIconOptions"
                :key="icon"
                :value="icon"
              >
                {{ iconLabel(icon) }}
              </option>
            </select></label
          >
          <label class="editor-field"
            ><span>色调</span
            ><select
              :value="linkSettings.tone"
              @change="
                updateLink('tone', ($event.target as HTMLSelectElement).value)
              "
            >
              <option
                v-for="tone in widgetToneOptions"
                :key="tone"
                :value="tone"
              >
                {{ toneLabel(tone) }}
              </option>
            </select></label
          >
        </div>
        <label class="editor-check"
          ><input
            :checked="linkSettings.openInNewTab"
            type="checkbox"
            @change="
              updateLink(
                'openInNewTab',
                ($event.target as HTMLInputElement).checked,
              )
            "
          /><span>在新标签页打开</span></label
        >
      </section>

      <section
        v-else-if="props.widget.type === 'game' && gameSettings"
        class="editor-section"
      >
        <div class="editor-section-title">
          <span>{{ gameName }}账号</span><IconGlyph name="game" :size="14" />
        </div>
        <label class="editor-field"
          ><span>游戏</span
          ><select
            :value="gameId"
            @change="
              updateGame(($event.target as HTMLSelectElement).value as HoyoGame)
            "
          >
            <option value="genshin">原神</option>
            <option value="hsr">崩坏：星穹铁道</option>
            <option value="zzz">绝区零</option>
          </select></label
        >
        <label class="editor-field"
          ><span>UID</span
          ><input
            :value="gameSettings.uid"
            inputmode="numeric"
            placeholder="6-12 位数字"
            @input="updateGameUid(($event.target as HTMLInputElement).value)"
        /></label>
        <button
          class="editor-fetch-button"
          type="button"
          :disabled="props.gameBusy"
          @click="requestGame"
        >
          <IconGlyph
            :name="props.gameBusy ? 'refresh' : 'cloud'"
            :size="14"
          />{{ props.gameBusy ? "读取中" : "读取账号数据" }}
        </button>
        <p v-if="props.gameError" class="editor-error">{{ props.gameError }}</p>
        <div v-if="gameSettings.account" class="game-account-preview">
          <strong>{{ gameSettings.account.nickname }}</strong>
          <span
            >{{ gameLevelLabel }} {{ gameSettings.account.level }} ·
            {{ gameSettings.account.achievements }} 成就 ·
            {{ gameSettings.account.characters }} 角色</span
          >
          <small v-if="gameSettings.account.updatedAt"
            >最近读取
            {{
              new Date(gameSettings.account.updatedAt).toLocaleString("zh-CN", {
                hour12: false,
              })
            }}</small
          >
        </div>
        <p class="editor-hint">只保存公开展示所需的摘要，不保存登录凭据。</p>
      </section>

      <section
        v-else-if="props.widget.type === 'friend' && friendSettings"
        class="editor-section"
      >
        <div class="editor-section-title">
          <span>友联轮播</span><IconGlyph name="rss" :size="14" />
        </div>
        <label class="editor-field">
          <span>切换频率</span>
          <select
            :value="friendSettings.interval"
            @change="
              updateFriendInterval(
                Number(($event.target as HTMLSelectElement).value),
              )
            "
          >
            <option
              v-for="option in friendIntervalOptions"
              :key="option.value"
              :value="option.value"
            >
              {{ option.label }}
            </option>
          </select>
        </label>
        <p class="editor-hint">鼠标悬停或键盘聚焦友联卡时会暂时暂停轮播。</p>
      </section>

      <section v-else class="editor-section editor-data-note">
        <div class="editor-section-title">
          <span>全局数据</span><IconGlyph name="sparkles" :size="14" />
        </div>
        <p v-if="props.widget.type === 'github'">
          这个组件直接读取设置页同步的 GitHub
          仓库数据，修改来源后会随页面快照更新。
        </p>
        <p v-else-if="props.widget.type === 'bilibili'">
          这个组件直接读取设置页同步的 Bilibili
          投稿数据，修改来源后会随页面快照更新。
        </p>
        <p v-else>这个组件没有额外设置。</p>
      </section>
    </div>

    <footer class="editor-panel-foot">
      <div class="editor-panel-actions">
        <button
          class="editor-remove-widget"
          type="button"
          aria-label="从首页移除组件"
          title="从首页移除组件"
          @click="emit('remove')"
        >
          <IconGlyph name="trash" :size="15" />移除组件
        </button>
        <button
          class="editor-close-bottom glass-panel"
          type="button"
          aria-label="关闭组件配置"
          title="关闭组件配置"
          @click="emit('close')"
        >
          <IconGlyph name="x" :size="13" />关闭设置
        </button>
      </div>
    </footer>
  </aside>
</template>

<style scoped>
.home-editor-panel {
  position: fixed;
  z-index: 45;
  top: auto;
  right: 18px;
  bottom: 18px;
  display: flex;
  min-height: min(300px, calc(100svh - 94px));
  width: min(378px, calc(100vw - 36px));
  max-height: min(690px, calc(100svh - 94px));
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--glass-border);
  border-radius: 15px;
  background: var(--glass);
  box-shadow: var(--glass-shadow);
  backdrop-filter: blur(18px) saturate(132%);
  isolation: isolate;
}

.editor-panel-head {
  position: relative;
  display: flex;
  padding: 21px 20px 17px;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
  border-bottom: 1px solid rgba(118, 126, 151, 0.14);
  background: var(--glass-soft);
}

.editor-panel-heading {
  min-width: 0;
  flex: 1;
}

.editor-panel-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--purple-deep);
  font-size: 0.53rem;
  font-weight: 800;
  letter-spacing: 0.11em;
  line-height: 1;
}

.editor-panel-head h2 {
  margin: 9px 0 4px;
  color: var(--ink);
  font-size: 1.16rem;
  line-height: 1.15;
}

.editor-panel-head p {
  max-width: 260px;
  margin: 0;
  color: var(--muted);
  font-size: 0.61rem;
  line-height: 1.4;
}

.editor-remove-widget {
  display: grid;
  /* width: 32px;
  height: 32px; */
  padding: 0;
  place-items: center;
  border-radius: 9px !important;
}

.editor-panel-scroll {
  flex: 1 1 auto;
  min-height: 0;
  padding: 14px 20px 18px;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-color: rgba(117, 100, 222, 0.32) transparent;
  scrollbar-width: thin;
}

.editor-section {
  display: grid;
  gap: 10px;
  padding: 16px 0;
  border-bottom: 1px solid rgba(118, 126, 151, 0.13);
}

.editor-section:first-child {
  padding-top: 3px;
}

.editor-section:last-child {
  border-bottom: 0;
  padding-bottom: 4px;
}

.editor-section-title {
  display: flex;
  min-height: 24px;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.editor-section-title > span {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--ink-soft);
  font-size: 0.67rem;
  font-weight: 800;
}

.editor-section-title > span::before {
  width: 3px;
  height: 14px;
  border-radius: 3px;
  background: rgba(117, 100, 222, 0.72);
  content: "";
}

.editor-section-title > small {
  padding: 4px 7px;
  border: 1px solid rgba(117, 100, 222, 0.14);
  border-radius: 7px;
  color: var(--muted);
  background: rgba(117, 100, 222, 0.06);
  font-size: 0.53rem;
}

.editor-section-title > svg {
  color: var(--purple-deep);
}

.editor-field {
  display: grid;
  min-width: 0;
  gap: 6px;
  color: var(--muted-strong);
  font-size: 0.57rem;
}

.editor-field input,
.editor-field select {
  width: 100%;
  min-height: 36px;
  padding: 0 10px;
  border: 1px solid rgba(118, 126, 151, 0.2);
  border-radius: 9px;
  outline: 0;
  color: var(--ink);
  background: rgba(255, 255, 255, 0.76);
  font-size: 0.62rem;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    box-shadow 0.18s ease;
}

.editor-field input:hover,
.editor-field select:hover {
  border-color: rgba(117, 100, 222, 0.32);
  background: rgba(255, 255, 255, 0.92);
}

.editor-field input:focus,
.editor-field select:focus {
  border-color: rgba(117, 100, 222, 0.58);
  background: #fff;
  box-shadow: 0 0 0 3px rgba(117, 100, 222, 0.1);
}

.editor-size-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.editor-check {
  display: inline-flex;
  min-height: 27px;
  align-items: center;
  gap: 7px;
  color: var(--muted-strong);
  font-size: 0.58rem;
}

.editor-check input {
  accent-color: var(--purple);
}

.editor-inline-button,
.editor-fetch-button {
  display: inline-flex;
  min-height: 34px;
  padding: 0 10px;
  align-items: center;
  gap: 5px;
  border: 1px solid rgba(117, 100, 222, 0.18);
  border-radius: 9px;
  color: var(--purple-deep);
  background: rgba(117, 100, 222, 0.08);
  font-size: 0.56rem;
  transition:
    background 0.18s ease,
    border-color 0.18s ease,
    transform 0.18s ease;
}

.editor-inline-button:hover,
.editor-fetch-button:hover:not(:disabled) {
  border-color: rgba(117, 100, 222, 0.3);
  background: rgba(117, 100, 222, 0.14);
  transform: translateY(-1px);
}

.editor-inline-button:active,
.editor-fetch-button:active:not(:disabled) {
  transform: translateY(0);
}

.editor-fetch-button {
  justify-content: center;
  border-color: rgba(53, 165, 123, 0.24);
  color: #27815f;
  background: rgba(53, 165, 123, 0.08);
}

.editor-fetch-button:disabled {
  cursor: wait;
  opacity: 0.58;
}

.game-account-preview {
  display: grid;
  gap: 4px;
  padding: 11px 12px;
  border: 1px solid rgba(53, 165, 123, 0.2);
  border-radius: 10px;
  background: rgba(232, 250, 241, 0.64);
}

.game-account-preview strong {
  font-size: 0.64rem;
}

.game-account-preview span,
.game-account-preview small,
.editor-hint,
.editor-error,
.editor-data-note p {
  margin: 0;
  color: var(--muted);
  font-size: 0.55rem;
  line-height: 1.45;
}

.editor-error {
  color: #bd455b;
}

.editor-panel-foot {
  display: flex;
  min-height: 58px;
  padding: 10px 20px;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  border-top: 1px solid rgba(118, 126, 151, 0.13);
  background: var(--glass-soft);
  font-size: 0.55rem;
}

.editor-panel-actions {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.editor-remove-widget,
.editor-close-bottom {
  transition:
    color 0.18s ease,
    background 0.18s ease,
    border-color 0.18s ease,
    box-shadow 0.18s ease,
    transform 0.18s ease;
}

.editor-remove-widget {
  color: #bb4e6d;
  background: rgba(255, 255, 255, 0.88);
  border: 1px solid rgba(214, 111, 136, 0.19);
  display: inline-flex;
  width: max-content;
  padding: 8px 10px;
  align-items: center;
  gap: 6px;
}

.editor-remove-widget:hover {
  background: #fff;
  box-shadow: 0 6px 14px rgba(187, 78, 109, 0.12);
  transform: translateY(-1px);
}

.editor-remove-widget:active {
  transform: translateY(0);
}

.editor-close-bottom {
  display: inline-flex;
  width: max-content;
  padding: 8px 10px;
  align-items: center;
  gap: 6px;
  border: 0;
  border-radius: 8px !important;
  color: #fff;
  background: var(--purple);
  font-size: 0.63rem;
  white-space: nowrap;
}

.editor-close-bottom:hover {
  color: #fff;
  background: var(--purple-deep);
}

.editor-close-bottom:active {
  transform: translateY(0);
}

@media (max-width: 820px) {
  .home-editor-panel {
    top: auto;
    right: 12px;
    bottom: 96px;
    left: 12px;
    width: auto;
    min-height: min(300px, calc(100svh - 116px));
    max-height: min(680px, calc(100svh - 116px));
    border-radius: 13px;
  }

  .editor-panel-head {
    padding: 19px 16px 15px;
  }

  .editor-panel-scroll {
    padding: 13px 16px 16px;
  }

  .editor-panel-foot {
    min-height: auto;
    padding: 10px 16px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .editor-close-bottom,
  .editor-remove-widget,
  .editor-field input,
  .editor-field select,
  .editor-inline-button,
  .editor-fetch-button {
    transition: none;
  }
}
</style>
