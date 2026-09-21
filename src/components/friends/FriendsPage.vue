<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from 'vue';
import {
  cloneFriendLinks,
  normalizeFriendTags,
  normalizeFriendUrl,
} from '../../data/friends';
import type { FriendLink } from '../../data/types';
import { usePanZoom } from '../../composables/usePanZoom';
import {
  createFriendWallLayout,
  type PositionedFriend,
} from './friendWallLayout';
import FriendAvatar from '../app/FriendAvatar.vue';
import IconGlyph from '../app/IconGlyph.vue';

type FriendTone = FriendLink['tone'];
interface FriendDraft {
  nickname: string;
  href: string;
  avatar: string;
  signature: string;
  feedUrl: string;
  tagsText: string;
  tone: FriendTone;
}

interface Props {
  /** 构建阶段从本地配置文件注入的友联数据。 */
  friends?: FriendLink[];
  /** 仅开发服务器允许修改本地友联文件。 */
  editable?: boolean;
}

const props = withDefaults(defineProps<Props>(), {
  /**
   * 为静态页面提供空友联列表默认值。
   *
   * @returns 空友联数组。
   */
  friends: () => [],
  editable: false,
});

const emit = defineEmits<{
  'friends-change': [friends: FriendLink[]];
}>();

const compactViewport = ref(false);
const pageReady = ref(false);
const friends = ref<FriendLink[]>(cloneFriendLinks(props.friends));
const editorOpen = ref(false);
const editingId = ref<string | null>(null);
const deletePending = ref(false);
const draft = ref<FriendDraft>(createDraft());
const nicknameInput = ref<HTMLInputElement | null>(null);
const toastMessage = ref('');
let toastTimer: number | null = null;

const {
  canvasStyle,
  endPan,
  handleWheel,
  isCentered,
  isPanning,
  movePan,
  resetCanvas,
  scaleLabel,
  startPan,
  zoomIn,
  zoomOut,
} = usePanZoom();

/**
 * 创建友联编辑表单的空白状态。
 *
 * @returns 带默认色调和空字段的友联编辑草稿。
 */
function createDraft(): FriendDraft {
  return {
    nickname: '',
    href: '',
    avatar: '',
    signature: '',
    feedUrl: '',
    tagsText: '',
    tone: 'lilac',
  };
}

/** 读取当前正在编辑的友联。 */
const currentFriend = computed(() =>
  editingId.value
    ? friends.value.find((friend) => friend.id === editingId.value) ?? null
    : null,
);

/** 生成友联编辑器标题。 */
const editorTitle = computed(() =>
  editingId.value ? '编辑这张友联卡' : '添加一位新朋友',
);

/** 生成友联编辑器的辅助标题。 */
const editorEyebrow = computed(() =>
  editingId.value ? 'EDIT FRIEND' : 'NEW FRIEND',
);

/** 生成友联数量统计文案。 */
const statsLabel = computed(() =>
  friends.value.length ? `${friends.value.length} 位朋友在这里` : '暂无友联',
);

/**
 * 从友联地址中提取可读的域名。
 *
 * @param href - 友联站点地址。
 * @returns 去掉 www 前缀的域名；地址无效时返回原文本。
 */
function getFriendHost(href: string): string {
  try {
    return new URL(href).hostname.replace(/^www\./, '');
  } catch {
    return href;
  }
}

/**
 * 根据昵称和当前时间生成新友联的稳定编辑 ID。
 *
 * @param nickname - 新友联昵称。
 * @returns 可用于编辑和持久化的唯一 ID。
 */
function makeId(nickname: string): string {
  const base = nickname
    .toLowerCase()
    .replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-')
    .replace(/^-|-$/g, '') || 'friend';
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * 将友联列表保存到本地开发服务，失败时回滚界面状态。
 *
 * @param nextFriends - 需要保存的最新友联列表。
 * @param previousFriends - 保存失败时恢复的旧友联列表。
 * @returns 保存成功时返回 true，非编辑模式或保存失败时返回 false。
 */
async function persistFriends(
  nextFriends: FriendLink[],
  previousFriends: FriendLink[],
): Promise<boolean> {
  if (!props.editable) return false;
  try {
    const response = await fetch('/__momona/save-friends', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ friends: nextFriends }),
    });
    const payload = (await response.json().catch(() => null)) as {
      message?: string;
    } | null;
    if (!response.ok) throw new Error(payload?.message || '本地友联文件写入失败');
    emit('friends-change', cloneFriendLinks(nextFriends));
    return true;
  } catch (error) {
    friends.value = previousFriends;
    showToast(String(error instanceof Error ? error.message : error));
    return false;
  }
}

/**
 * 显示短暂的友联操作提示，并取消上一次定时器。
 *
 * @param message - 需要显示的提示文本。
 * @returns 无返回值。
 */
function showToast(message: string): void {
  toastMessage.value = message;
  if (toastTimer !== null) window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    toastMessage.value = '';
    toastTimer = null;
  }, 2400);
}

/**
 * 打开新增友联表单。
 *
 * @returns 无返回值；表单会重置为默认草稿。
 */
function openCreate(): void {
  editingId.value = null;
  deletePending.value = false;
  draft.value = createDraft();
  editorOpen.value = true;
}

/**
 * 将已有友联装载到编辑表单。
 *
 * @param friend - 需要编辑的友联。
 * @returns 无返回值。
 */
function openEdit(friend: FriendLink): void {
  editingId.value = friend.id;
  deletePending.value = false;
  draft.value = {
    nickname: friend.nickname,
    href: friend.href,
    avatar: friend.avatar,
    signature: friend.signature,
    feedUrl: friend.feedUrl ?? '',
    tagsText: friend.tags.join(', '),
    tone: friend.tone,
  };
  editorOpen.value = true;
}

/**
 * 关闭友联编辑器并清理删除确认状态。
 *
 * @returns 无返回值。
 */
function closeEditor(): void {
  editorOpen.value = false;
  deletePending.value = false;
}

/**
 * 校验并保存新增或编辑后的友联。
 *
 * @returns 保存流程完成后结束；字段不完整或非编辑模式时直接结束。
 */
async function saveFriend(): Promise<void> {
  if (!props.editable) return;
  const nickname = draft.value.nickname.trim();
  const signature = draft.value.signature.trim();
  const href = normalizeFriendUrl(draft.value.href);
  const feedUrl = normalizeFriendUrl(draft.value.feedUrl);

  if (!nickname || !signature || !href) {
    showToast('请补全昵称、签名和有效网址');
    return;
  }

  const nextFriend: FriendLink = {
    id: editingId.value ?? makeId(nickname),
    nickname,
    href,
    avatar: draft.value.avatar.trim(),
    signature,
    tags: normalizeFriendTags(draft.value.tagsText).length
      ? normalizeFriendTags(draft.value.tagsText)
      : ['友联'],
    ...(feedUrl ? { feedUrl } : {}),
    tone: draft.value.tone,
  };

  const previousFriends = cloneFriendLinks(friends.value);
  const nextFriends = editingId.value
    ? friends.value.map((friend) =>
      friend.id === editingId.value ? nextFriend : friend,
      )
    : [nextFriend, ...friends.value];
  friends.value = nextFriends;
  if (!(await persistFriends(nextFriends, previousFriends))) return;
  showToast(editingId.value ? '友联卡片已更新' : '新的友联已加入');
  closeEditor();
}

/**
 * 进入删除确认状态。
 *
 * @returns 无返回值。
 */
function requestDelete(): void {
  deletePending.value = true;
}

/**
 * 删除当前友联，并在保存失败时恢复原列表。
 *
 * @returns 删除保存流程完成后结束。
 */
async function confirmDelete(): Promise<void> {
  if (!editingId.value || !props.editable) return;
  const previousFriends = cloneFriendLinks(friends.value);
  const nextFriends = friends.value.filter(
    (friend) => friend.id !== editingId.value,
  );
  friends.value = nextFriends;
  if (!(await persistFriends(nextFriends, previousFriends))) return;
  closeEditor();
  showToast('友联已移除');
}

/**
 * 根据窗口宽度切换友联墙的桌面或移动排版。
 *
 * @returns 无返回值；布局计算会从响应式视口模式重新派生。
 */
function updateViewportMode(): void {
  compactViewport.value = window.innerWidth <= 820;
}

/** 响应友联数据和视口模式变化重新计算墙面布局。 */
const displayedLayout = computed(() =>
  createFriendWallLayout(friends.value, compactViewport.value),
);

/** 组合画布缩放样式和排版后的固定尺寸。 */
const canvasFrameStyle = computed(() => ({
  ...canvasStyle.value,
  width: `${displayedLayout.value.canvasWidth}px`,
  height: `${displayedLayout.value.canvasHeight}px`,
}));

/**
 * 将排版卡片转换为绝对定位所需的 CSS 样式。
 *
 * @param item - 已完成排版的友联卡片。
 * @returns 供模板 style 绑定使用的 CSS 属性对象。
 */
function getFriendStyle(item: PositionedFriend): Record<string, string> {
  return {
    left: `${item.left}px`,
    top: `${item.top}px`,
    width: `${item.width}px`,
    height: `${item.height}px`,
    '--friend-tilt': `${item.tilt}deg`,
    '--friend-delay': `${item.delay}ms`,
  };
}

/**
 * 在可编辑模式下通过点击卡片打开编辑器。
 *
 * @param friend - 用户点击的友联。
 * @returns 无返回值；公开模式下保持卡片浏览行为。
 */
function openCard(friend: FriendLink): void {
  if (props.editable) openEdit(friend);
}

watch(
  () => props.friends,
  (value) => {
    if (!editorOpen.value) friends.value = cloneFriendLinks(value);
  },
  { deep: true },
);

watch(editorOpen, async (open) => {
  if (!open) return;
  await nextTick();
  nicknameInput.value?.focus();
});

onMounted(() => {
  updateViewportMode();
  pageReady.value = true;
  window.addEventListener('resize', updateViewportMode);
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', updateViewportMode);
  if (toastTimer !== null) window.clearTimeout(toastTimer);
});
</script>

<template>
  <div
    class="friends-page"
    :class="{ 'is-panning': isPanning }"
    @keydown.esc="closeEditor"
  >
    <section class="friends-intro" aria-labelledby="friends-title">
      <div class="friends-intro-heading">
        <span class="friends-eyebrow"><IconGlyph name="link" :size="13" /> FRIEND LINKS</span>
        <span class="friends-count">{{ statsLabel }}</span>
      </div>
      <h1 id="friends-title">在互联网上相遇</h1>
      <p>一些温柔的站点，一些正在发光的人。</p>
      <button
        v-if="props.editable"
        class="friends-add-button"
        type="button"
        @click="openCreate"
      >
        <IconGlyph name="plus" :size="16" />
        <span>添加友联</span>
      </button>
    </section>

    <section
      class="friends-viewport"
      :class="{ 'is-panning': isPanning }"
      aria-label="友联无限画布"
      tabindex="0"
      @pointerdown="startPan"
      @pointermove="movePan"
      @pointerup="endPan"
      @pointercancel="endPan"
      @pointerleave="endPan"
      @wheel="handleWheel"
    >
      <div v-if="!friends.length" class="friends-empty-state">
        <IconGlyph name="link" :size="22" />
        <strong>暂无友联</strong>
        <span>添加友联后，它们会从本地配置文件读取。</span>
      </div>
      <div
        class="friends-canvas"
        :style="canvasFrameStyle"
      >
        <div
          v-for="(item, index) in displayedLayout.friends"
          :key="item.friend.id"
          class="packed-layout-item friend-layout-item"
          :style="getFriendStyle(item)"
        >
          <div class="packed-layout-content">
            <article
              class="friend-card"
              :class="[
                `tone-${item.friend.tone}`,
                `shape-${item.shape}`,
                { 'is-featured': index === 0 },
              ]"
            >
              <a
                class="friend-card-link"
                :href="item.friend.href"
                target="_blank"
                rel="noreferrer"
                :aria-label="`访问 ${item.friend.nickname}`"
                @pointerdown.stop
              >
                <header class="friend-card-header">
                  <div class="friend-avatar">
                    <FriendAvatar
                      :src="item.friend.avatar"
                      :alt="`${item.friend.nickname} 的头像`"
                      :icon-size="18"
                      loading="lazy"
                    />
                  </div>
                  <div class="friend-card-identity">
                    <h2>{{ item.friend.nickname }}</h2>
                    <div class="friend-card-subline">
                      <span class="friend-card-type"><IconGlyph name="link" :size="10" /> LINK</span>
                      <span class="friend-card-number">#{{ String(index + 1).padStart(2, '0') }}</span>
                    </div>
                  </div>
                  <div v-if="item.friend.tags.length" class="friend-tags" aria-label="友联标签">
                    <span v-for="tag in item.friend.tags" :key="tag">#{{ tag }}</span>
                  </div>
                </header>

                <section class="friend-card-feature">
                  <div class="friend-card-feature-line">
                    <span class="friend-dot" aria-hidden="true"></span>
                    <strong>友联站点</strong>
                    <span class="friend-card-host">{{ getFriendHost(item.friend.href) }}</span>
                  </div>
                  <p class="friend-signature">{{ item.friend.signature }}</p>
                </section>

                <footer class="friend-card-footer">
                  <span>OPEN SITE</span>
                  <IconGlyph name="external" :size="13" />
                </footer>
              </a>

              <button
                v-if="props.editable"
                class="friend-card-edit"
                type="button"
                :aria-label="`编辑 ${item.friend.nickname}`"
                title="编辑友联"
                @pointerdown.stop
                @click.stop="openCard(item.friend)"
              >
                <IconGlyph name="pencil" :size="14" />
              </button>
            </article>
          </div>
        </div>
      </div>
    </section>

    <div class="friends-toolbar" role="toolbar" aria-label="友联画布控制">
      <button type="button" aria-label="缩小画布" title="缩小画布" @click="zoomOut">
        <IconGlyph name="zoomOut" :size="17" />
      </button>
      <output aria-live="polite">{{ scaleLabel }}</output>
      <button type="button" aria-label="放大画布" title="放大画布" @click="zoomIn">
        <IconGlyph name="zoomIn" :size="17" />
      </button>
      <span class="friends-toolbar-divider" aria-hidden="true"></span>
      <button
        type="button"
        aria-label="回到中心"
        title="回到中心"
        :disabled="!pageReady || isCentered"
        @click="resetCanvas"
      >
        <IconGlyph name="refresh" :size="15" />
      </button>
    </div>

    <Transition name="toast">
      <div v-if="toastMessage" class="friends-toast" role="status">
        <IconGlyph name="check" :size="15" />
        {{ toastMessage }}
      </div>
    </Transition>

    <Transition name="modal">
      <div
        v-if="editorOpen"
        class="friend-modal-backdrop"
        role="presentation"
        @click.self="closeEditor"
      >
        <section
          class="friend-editor"
          role="dialog"
          aria-modal="true"
          aria-labelledby="friend-editor-title"
        >
          <header class="friend-editor-header">
            <div>
              <span class="friends-eyebrow">{{ editorEyebrow }}</span>
              <h2 id="friend-editor-title">{{ editorTitle }}</h2>
            </div>
            <button
              class="friend-icon-button"
              type="button"
              aria-label="关闭编辑窗口"
              title="关闭"
              @click="closeEditor"
            >
              <IconGlyph name="x" :size="17" />
            </button>
          </header>

          <form class="friend-form" @submit.prevent="saveFriend">
            <div class="friend-form-preview">
              <div class="friend-avatar friend-avatar-large" :class="`tone-${draft.tone}`">
                <FriendAvatar
                  :src="draft.avatar"
                  alt="头像预览"
                  :icon-size="25"
                  loading="eager"
                />
              </div>
              <div>
                <strong>{{ draft.nickname || '你的朋友' }}</strong>
                <span>{{ draft.signature || '写下一句签名，让大家认识你。' }}</span>
              </div>
            </div>

            <div class="friend-form-grid">
              <label>
                <span>昵称</span>
                <input
                  ref="nicknameInput"
                  v-model="draft.nickname"
                  name="nickname"
                  type="text"
                  maxlength="28"
                  placeholder="例如：Kiseki"
                  required
                />
              </label>
              <label>
                <span>主页地址</span>
                <input
                  v-model="draft.href"
                  name="href"
                  type="url"
                  placeholder="https://example.com"
                  required
                />
              </label>
              <label class="friend-form-wide">
                <span>RSS / Atom 订阅地址 <small>可选</small></span>
                <input
                  v-model="draft.feedUrl"
                  name="feedUrl"
                  type="url"
                  placeholder="https://example.com/feed.xml"
                />
              </label>
              <label class="friend-form-wide">
                <span>签名</span>
                <textarea
                  v-model="draft.signature"
                  name="signature"
                  maxlength="72"
                  rows="2"
                  placeholder="一句话介绍这个站点或正在书写的人。"
                  required
                ></textarea>
              </label>
              <label>
                <span>头像地址 <small>可选</small></span>
                <input
                  v-model="draft.avatar"
                  name="avatar"
                  type="url"
                  placeholder="https://.../avatar.jpg"
                />
              </label>
              <label>
                <span>标签 <small>用逗号分隔</small></span>
                <input
                  v-model="draft.tagsText"
                  name="tags"
                  type="text"
                  placeholder="博客, 摄影, 随笔"
                />
              </label>
            </div>

            <fieldset class="friend-tone-fieldset">
              <legend>卡片色调</legend>
              <div class="friend-tone-options">
                <button
                  v-for="tone in ['lilac', 'peach', 'mint', 'sky', 'butter', 'rose']"
                  :key="tone"
                  class="friend-tone-button"
                  :class="[`tone-${tone}`, { 'is-active': draft.tone === tone }]"
                  type="button"
                  :aria-label="`选择 ${tone} 色调`"
                  :aria-pressed="draft.tone === tone"
                  @click="draft.tone = tone as FriendTone"
                ></button>
              </div>
            </fieldset>

            <div v-if="deletePending" class="friend-delete-confirm">
              <div>
                <strong>确定移除这张卡片？</strong>
                <span>操作会写入本地友联配置文件。</span>
              </div>
              <div class="friend-delete-actions">
                <button type="button" @click="deletePending = false">保留</button>
                <button class="is-danger" type="button" @click="confirmDelete">确认移除</button>
              </div>
            </div>

            <footer class="friend-form-actions">
              <button
                v-if="currentFriend"
                class="friend-delete-button"
                type="button"
                @click="requestDelete"
              >
                <IconGlyph name="trash" :size="15" />
                删除友联
              </button>
              <span v-else></span>
              <div>
                <button class="friend-cancel-button" type="button" @click="closeEditor">取消</button>
                <button class="friend-save-button" type="submit">
                  <IconGlyph name="save" :size="15" />
                  保存友联
                </button>
              </div>
            </footer>
          </form>
        </section>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.friends-page {
  position: fixed;
  z-index: 2;
  inset: 0;
  overflow: hidden;
  color: var(--ink);
  pointer-events: none;
  user-select: none;
  -webkit-user-select: none;
}

.friends-page::before,
.friends-page::after {
  position: absolute;
  z-index: 0;
  inset: 0;
  pointer-events: none;
  content: '';
}

.friends-page::before {
  background-image: radial-gradient(circle, rgba(91, 109, 151, 0.22) 1px, transparent 1.1px);
  background-position: 1px 1px;
  background-size: 25px 25px;
  mask-image: linear-gradient(180deg, transparent 0%, rgba(0, 0, 0, 0.28) 24%, #000 80%);
  opacity: 0.55;
}

.friends-page::after {
  background: linear-gradient(180deg, rgba(250, 251, 255, 0.03), rgba(250, 251, 255, 0.18));
}

.friends-intro {
  position: absolute;
  z-index: 15;
  top: 30px;
  left: 110px;
  display: grid;
  width: min(370px, calc(100vw - 150px));
  padding: 18px 19px 17px;
  border: 1px solid rgba(255, 255, 255, 0.82);
  border-radius: 15px;
  background: rgba(255, 255, 255, 0.67);
  box-shadow: 0 18px 38px rgba(54, 45, 106, 0.13);
  backdrop-filter: blur(20px) saturate(140%);
  pointer-events: auto;
  animation: friends-intro-in 0.7s cubic-bezier(0.22, 1, 0.36, 1) both;
}

.friends-intro-heading,
.friend-card-topline,
.friend-card-footer,
.friend-form-actions,
.friend-editor-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.friends-eyebrow {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--purple-deep);
  font-size: 0.57rem;
  font-weight: 780;
  letter-spacing: 0.11em;
}

.friends-count {
  color: var(--muted);
  font-size: 0.59rem;
}

.friends-intro h1 {
  margin: 12px 0 5px;
  color: var(--ink);
  font-size: clamp(1.2rem, 2vw, 1.65rem);
  font-weight: 820;
  letter-spacing: 0;
}

.friends-intro p {
  margin: 0;
  color: var(--muted-strong);
  font-size: 0.67rem;
}

.friends-add-button {
  display: inline-flex;
  width: max-content;
  min-height: 34px;
  margin-top: 15px;
  padding: 0 12px;
  align-items: center;
  gap: 7px;
  border: 1px solid rgba(255, 255, 255, 0.86);
  border-radius: 10px;
  color: #fff;
  background: var(--purple-deep);
  box-shadow: 0 8px 18px rgba(85, 65, 181, 0.2);
  font-size: 0.64rem;
  font-weight: 720;
  transition: transform 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
}

.friends-add-button:hover {
  background: #624ec6;
  box-shadow: 0 12px 22px rgba(85, 65, 181, 0.26);
  transform: translateY(-2px);
}

.friends-viewport {
  position: absolute;
  z-index: 1;
  inset: 0;
  overflow: hidden;
  outline: none;
  cursor: grab;
  pointer-events: auto;
  touch-action: none;
}

.friends-viewport.is-panning {
  cursor: grabbing;
}

.friends-empty-state {
  position: absolute;
  z-index: 2;
  top: 50%;
  left: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--muted);
  font-size: 0.65rem;
  pointer-events: none;
  transform: translate(-50%, -50%);
}

.friends-empty-state strong {
  color: var(--ink-soft);
}

.friends-canvas {
  position: absolute;
  z-index: 1;
  top: 50%;
  left: 50%;
  min-height: 720px;
  margin: 0;
  transform-origin: center;
  transition: transform 0.22s ease, width 0.42s ease, height 0.42s ease;
}

.friends-viewport.is-panning .friends-canvas {
  transition: none;
}

.friend-layout-item {
  position: absolute;
  z-index: 1;
  display: block;
  pointer-events: auto;
  transition: transform 0.48s cubic-bezier(0.22, 1, 0.36, 1);
  will-change: transform;
}

.friend-layout-item:hover,
.friend-layout-item:focus-within {
  z-index: 8;
}

.packed-layout-content {
  position: relative;
  width: 100%;
  height: 100%;
}

.friend-card {
  position: relative;
  width: 100%;
  height: 100%;
  display: flex;
  padding: 0;
  overflow: hidden;
  flex-direction: column;
  border: 1px solid rgba(255, 255, 255, 0.78);
  border-radius: 15px;
  background: rgba(255, 255, 255, 0.72);
  box-shadow: 0 10px 25px rgba(72, 56, 135, 0.08);
  pointer-events: auto;
  transform: rotate(var(--friend-tilt));
  transition: transform 0.18s ease, background 0.18s ease, box-shadow 0.18s ease,
    opacity 0.24s ease;
  animation: friend-card-in 0.72s var(--friend-delay) cubic-bezier(0.22, 1, 0.36, 1) both;
  backdrop-filter: blur(18px) saturate(132%);
  will-change: transform;
}

.friend-card:hover,
.friend-card:focus-within {
  z-index: 8;
  background: rgba(255, 255, 255, 0.84);
  box-shadow: 0 18px 35px rgba(72, 56, 135, 0.14);
  transform: translateY(-2px) rotate(0deg) scale(1.01);
}

.friend-card.tone-lilac {
  --friend-tone: #7844aa;
  --friend-tone-surface: rgba(235, 222, 255, 0.78);
  --friend-dot: #8055b0;
}

.friend-card.tone-peach {
  --friend-tone: #e98c5c;
  --friend-tone-surface: rgba(255, 232, 218, 0.8);
  --friend-dot: #f09b74;
}

.friend-card.tone-mint {
  --friend-tone: #3aaf73;
  --friend-tone-surface: rgba(213, 245, 226, 0.72);
  --friend-dot: #2da478;
}

.friend-card.tone-sky {
  --friend-tone: #3b77bc;
  --friend-tone-surface: rgba(222, 235, 255, 0.72);
  --friend-dot: #119dd9;
}

.friend-card.tone-butter {
  --friend-tone: #d8864f;
  --friend-tone-surface: rgba(255, 232, 218, 0.8);
  --friend-dot: #f09b74;
}

.friend-card.tone-rose {
  --friend-tone: #e95498;
  --friend-tone-surface: rgba(255, 222, 239, 0.8);
  --friend-dot: #ee5f9f;
}

.friend-card-number {
  color: var(--muted);
  font-size: 0.57rem;
  white-space: nowrap;
}

.friend-card-edit,
.friend-icon-button {
  display: grid;
  width: 28px;
  height: 28px;
  padding: 0;
  place-items: center;
  border: 1px solid transparent;
  border-radius: 9px;
  color: var(--muted);
  background: transparent;
  transition: color 0.18s ease, background 0.18s ease, opacity 0.18s ease, transform 0.18s ease;
}

.friend-card-edit {
  position: absolute;
  z-index: 3;
  top: 9px;
  right: 9px;
  opacity: 0;
}

.friend-card:hover .friend-card-edit,
.friend-card:focus-within .friend-card-edit,
.friend-card-edit:focus-visible {
  opacity: 1;
}

.friend-card-edit:hover,
.friend-icon-button:hover {
  color: var(--purple-deep);
  border-color: rgba(117, 100, 222, 0.14);
  background: rgba(244, 241, 255, 0.88);
  transform: translateY(-1px);
}

.friend-card-link {
  display: flex;
  min-height: 0;
  flex: 1;
  flex-direction: column;
  padding: 17px 15px 16px;
  color: inherit;
  text-decoration: none;
}

.friend-card-header {
  display: flex;
  min-width: 0;
  min-height: 33px;
  align-items: center;
  gap: 12px;
}

.friend-card.shape-portrait .friend-card-header {
  min-height: 44px;
}

.friend-card.shape-portrait .friend-card-header,
.friend-card.shape-square .friend-card-header {
  gap: 14px;
}

.friend-avatar {
  position: relative;
  display: grid;
  width: 32px;
  height: 32px;
  flex: 0 0 32px;
  overflow: hidden;
  place-items: center;
  border: 2px solid rgba(255, 255, 255, 0.84);
  border-radius: 10px;
  color: var(--friend-tone, var(--purple-deep));
  background: rgba(255, 255, 255, 0.65);
  box-shadow: 0 4px 8px rgba(68, 52, 118, 0.08);
  font-size: 0.58rem;
  font-weight: 780;
}

.friend-card.shape-portrait .friend-avatar,
.friend-card.shape-square .friend-avatar {
  width: 40px;
  height: 40px;
  flex-basis: 40px;
  border-radius: 50%;
}

.friend-avatar img {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.friend-card-identity {
  min-width: 0;
}

.friend-card-identity h2 {
  overflow: hidden;
  margin: 0;
  color: var(--ink);
  font-size: 0.88rem;
  font-weight: 780;
  line-height: 1.1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.friend-card-subline {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 7px;
  color: var(--muted);
  font-size: 0.57rem;
  line-height: 1;
}

.friend-card-type {
  display: inline-flex;
  min-width: 31px;
  min-height: 18px;
  padding: 2px 6px;
  align-items: center;
  justify-content: center;
  gap: 3px;
  border-radius: 5px;
  color: var(--friend-tone, var(--purple-deep));
  background: var(--friend-tone-surface, rgba(224, 219, 255, 0.66));
  font-weight: 720;
  white-space: nowrap;
}

.friend-tags {
  display: flex;
  min-width: 0;
  margin-left: auto;
  padding-right: 25px;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
}

.friend-tags span {
  max-width: 80px;
  overflow: hidden;
  padding: 4px 8px;
  border-radius: 5px;
  color: var(--friend-tone, var(--purple-deep));
  background: var(--friend-tone-surface, rgba(224, 219, 255, 0.58));
  font-size: 0.56rem;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.friend-card-feature {
  min-width: 0;
  margin-top: 9px;
  padding: 10px 12px;
  flex: 0 0 auto;
  border: 1px solid rgba(255, 255, 255, 0.4);
  border-radius: 12px;
  background: rgba(225, 224, 235, 0.42);
}

.friend-card.shape-wide .friend-card-feature {
  height: 68px;
}

.friend-card.shape-square .friend-card-feature {
  height: 83px;
}

.friend-card.shape-portrait .friend-card-link {
  padding: 20px 19px;
}

.friend-card.shape-portrait .friend-card-feature {
  height: 102px;
  margin-top: 10px;
  padding: 16px 18px;
}

.friend-card-feature-line,
.friend-card-footer {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 6px;
}

.friend-card-feature-line {
  height: 19px;
}

.friend-dot {
  width: 7px;
  height: 7px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--friend-dot, var(--blue));
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--friend-dot, var(--blue)) 10%, transparent);
}

.friend-card-feature-line strong {
  min-width: 0;
  overflow: hidden;
  flex: 1;
  color: var(--ink-soft);
  font-size: 0.73rem;
  font-weight: 760;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.friend-card-host {
  max-width: 44%;
  overflow: hidden;
  flex: 0 0 auto;
  color: #8d98aa;
  font-size: 0.58rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.friend-signature {
  display: -webkit-box;
  overflow: hidden;
  margin: 5px 0 0 14px;
  color: var(--muted-strong);
  font-size: 0.65rem;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.friend-card.shape-portrait .friend-signature {
  margin-top: 5px;
  font-size: 0.67rem;
  line-height: 1.6;
  -webkit-line-clamp: 3;
}

.friend-card-footer {
  margin-top: auto;
  padding-top: 10px;
  color: var(--muted);
  font-size: 0.57rem;
  font-weight: 720;
  letter-spacing: 0.08em;
}

.friend-card-footer > svg {
  flex: 0 0 auto;
  color: var(--friend-tone, var(--purple-deep));
  transition: transform 0.2s ease;
}

.friend-card:hover .friend-card-footer > svg {
  transform: translateX(3px);
}

.friends-toolbar {
  position: absolute;
  z-index: 14;
  bottom: 15px;
  left: 50%;
  display: flex;
  height: 42px;
  padding: 4px;
  align-items: center;
  gap: 1px;
  border: 1px solid rgba(255, 255, 255, 0.84);
  border-radius: 13px;
  background: rgba(255, 255, 255, 0.78);
  box-shadow: 0 13px 28px rgba(54, 45, 106, 0.15);
  backdrop-filter: blur(19px) saturate(140%);
  pointer-events: auto;
  transform: translateX(-50%);
}

.friends-toolbar button,
.friends-toolbar output {
  display: inline-flex;
  width: 32px;
  height: 32px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 9px;
  color: rgba(47, 60, 82, 0.72);
  background: transparent;
}

.friends-toolbar button:hover:not(:disabled) {
  color: var(--purple-deep);
  background: rgba(241, 239, 255, 0.9);
}

.friends-toolbar button:disabled {
  cursor: default;
  opacity: 0.4;
}

.friends-toolbar output {
  width: 44px;
  color: rgba(47, 60, 82, 0.84);
  font-size: 0.64rem;
}

.friends-toolbar-divider {
  width: 1px;
  height: 22px;
  margin: 0 3px;
  background: rgba(111, 121, 146, 0.18);
}

.friends-toast {
  position: fixed;
  z-index: 60;
  right: 19px;
  bottom: 18px;
  display: inline-flex;
  min-height: 36px;
  padding: 0 12px;
  align-items: center;
  gap: 7px;
  border: 1px solid rgba(255, 255, 255, 0.84);
  border-radius: 10px;
  color: #276f58;
  background: rgba(232, 250, 241, 0.88);
  box-shadow: 0 14px 26px rgba(54, 45, 106, 0.14);
  backdrop-filter: blur(16px);
  font-size: 0.62rem;
  pointer-events: auto;
}

.friend-modal-backdrop {
  position: fixed;
  z-index: 80;
  inset: 0;
  display: grid;
  padding: 20px;
  place-items: center;
  background: rgba(53, 53, 87, 0.21);
  pointer-events: auto;
  backdrop-filter: blur(7px) saturate(105%);
}

.friend-editor {
  width: min(580px, 100%);
  max-height: min(720px, calc(100vh - 40px));
  overflow: auto;
  padding: 21px;
  border: 1px solid rgba(255, 255, 255, 0.9);
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 26px 66px rgba(39, 37, 78, 0.26);
  backdrop-filter: blur(24px) saturate(138%);
  user-select: text;
}

.friend-editor-header {
  align-items: flex-start;
  margin-bottom: 17px;
}

.friend-editor-header h2 {
  margin: 7px 0 0;
  color: var(--ink);
  font-size: 1.15rem;
  font-weight: 820;
}

.friend-icon-button {
  opacity: 1;
}

.friend-form {
  display: flex;
  flex-direction: column;
  gap: 17px;
}

.friend-form-preview {
  display: flex;
  min-height: 78px;
  padding: 10px 12px;
  align-items: center;
  gap: 12px;
  border: 1px solid rgba(117, 100, 222, 0.1);
  border-radius: 11px;
  background: rgba(245, 244, 255, 0.72);
}

.friend-avatar-large {
  width: 55px;
  height: 55px;
  flex-basis: 55px;
}

.friend-avatar-large.tone-peach {
  --friend-accent: #ea956a;
  --friend-soft: rgba(255, 240, 232, 0.92);
}

.friend-avatar-large.tone-mint {
  --friend-accent: #53ad92;
  --friend-soft: rgba(229, 247, 240, 0.92);
}

.friend-avatar-large.tone-sky {
  --friend-accent: #4e9fd2;
  --friend-soft: rgba(229, 243, 252, 0.92);
}

.friend-avatar-large.tone-butter {
  --friend-accent: #c9a849;
  --friend-soft: rgba(255, 249, 218, 0.92);
}

.friend-avatar-large.tone-rose {
  --friend-accent: #d77598;
  --friend-soft: rgba(255, 232, 240, 0.92);
}

.friend-form-preview > div:last-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.friend-form-preview strong {
  overflow: hidden;
  color: var(--ink);
  font-size: 0.76rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.friend-form-preview span:last-child {
  overflow: hidden;
  color: var(--muted);
  font-size: 0.63rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.friend-form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 13px;
}

.friend-form-grid label {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 6px;
}

.friend-form-grid label.friend-form-wide {
  grid-column: 1 / -1;
}

.friend-form-grid label > span,
.friend-tone-fieldset legend {
  color: var(--ink-soft);
  font-size: 0.62rem;
  font-weight: 760;
}

.friend-form-grid label small {
  color: var(--muted);
  font-size: 0.55rem;
  font-weight: 500;
}

.friend-form-grid input,
.friend-form-grid textarea {
  width: 100%;
  padding: 9px 10px;
  border: 1px solid rgba(119, 128, 153, 0.2);
  border-radius: 8px;
  outline: none;
  color: var(--ink);
  background: rgba(255, 255, 255, 0.68);
  font-size: 0.67rem;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
}

.friend-form-grid textarea {
  min-height: 58px;
  resize: vertical;
}

.friend-form-grid input::placeholder,
.friend-form-grid textarea::placeholder {
  color: #a3aabd;
}

.friend-form-grid input:focus,
.friend-form-grid textarea:focus {
  border-color: rgba(117, 100, 222, 0.62);
  background: #fff;
  box-shadow: 0 0 0 3px rgba(117, 100, 222, 0.1);
}

.friend-tone-fieldset {
  display: flex;
  padding: 0;
  align-items: center;
  gap: 13px;
  border: 0;
}

.friend-tone-options {
  display: flex;
  align-items: center;
  gap: 8px;
}

.friend-tone-button {
  width: 23px;
  height: 23px;
  padding: 0;
  border: 3px solid rgba(255, 255, 255, 0.92);
  border-radius: 50%;
  box-shadow: 0 2px 7px rgba(54, 45, 106, 0.13);
  transition: transform 0.18s ease, box-shadow 0.18s ease;
}

.friend-tone-button.tone-lilac {
  background: #b7adef;
}

.friend-tone-button.tone-peach {
  background: #f2b391;
}

.friend-tone-button.tone-mint {
  background: #8ed0bc;
}

.friend-tone-button.tone-sky {
  background: #91c8e7;
}

.friend-tone-button.tone-butter {
  background: #e8d27a;
}

.friend-tone-button.tone-rose {
  background: #e5a3b8;
}

.friend-tone-button:hover,
.friend-tone-button.is-active {
  box-shadow: 0 0 0 3px rgba(117, 100, 222, 0.18);
  transform: scale(1.13);
}

.friend-delete-confirm {
  display: flex;
  padding: 11px 12px;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  border: 1px solid rgba(214, 111, 136, 0.25);
  border-radius: 9px;
  color: #7d4a58;
  background: rgba(255, 239, 243, 0.88);
}

.friend-delete-confirm > div:first-child {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 4px;
}

.friend-delete-confirm strong {
  font-size: 0.64rem;
}

.friend-delete-confirm span {
  font-size: 0.57rem;
}

.friend-delete-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 6px;
}

.friend-delete-actions button,
.friend-cancel-button,
.friend-delete-button,
.friend-save-button {
  display: inline-flex;
  min-height: 33px;
  padding: 0 11px;
  align-items: center;
  justify-content: center;
  gap: 6px;
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 0.62rem;
  font-weight: 720;
}

.friend-delete-actions button {
  min-height: 28px;
  padding-inline: 8px;
  color: #7d4a58;
  background: rgba(255, 255, 255, 0.7);
}

.friend-delete-actions .is-danger,
.friend-delete-button {
  color: #bb4e6d;
  background: rgba(255, 255, 255, 0.88);
}

.friend-delete-actions .is-danger:hover,
.friend-delete-button:hover {
  background: #fff;
  box-shadow: 0 6px 14px rgba(187, 78, 109, 0.12);
}

.friend-form-actions {
  padding-top: 1px;
}

.friend-form-actions > div {
  display: flex;
  gap: 7px;
}

.friend-delete-button {
  border-color: rgba(214, 111, 136, 0.19);
}

.friend-cancel-button {
  color: var(--muted-strong);
  background: rgba(240, 242, 249, 0.8);
}

.friend-cancel-button:hover {
  color: var(--ink);
  background: rgba(233, 236, 246, 0.96);
}

.friend-save-button {
  color: #fff;
  background: var(--purple-deep);
  box-shadow: 0 7px 15px rgba(85, 65, 181, 0.18);
}

.friend-save-button:hover {
  background: #624ec6;
  box-shadow: 0 10px 19px rgba(85, 65, 181, 0.24);
}

.modal-enter-active,
.modal-leave-active,
.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.24s ease;
}

.modal-enter-active .friend-editor,
.modal-leave-active .friend-editor {
  transition: transform 0.3s cubic-bezier(0.22, 1, 0.36, 1), opacity 0.24s ease;
}

.modal-enter-from,
.modal-leave-to,
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
}

.modal-enter-from .friend-editor,
.modal-leave-to .friend-editor {
  opacity: 0;
  transform: translateY(15px) scale(0.98);
}

.toast-enter-from,
.toast-leave-to {
  transform: translateY(8px);
}

@keyframes friends-intro-in {
  from {
    opacity: 0;
    transform: translateY(-10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes friend-card-in {
  from {
    opacity: 0;
    transform: translateY(20px) rotate(var(--friend-tilt)) scale(0.97);
  }
  to {
    opacity: 1;
    transform: rotate(var(--friend-tilt));
  }
}

@media (max-width: 820px) {
  .friends-intro {
    top: 72px;
    right: 12px;
    left: 12px;
    width: auto;
    padding: 15px 16px 14px;
  }

  .friends-intro h1 {
    margin-top: 9px;
    font-size: 1.18rem;
  }

  .friends-intro p {
    font-size: 0.63rem;
  }

  .friends-add-button {
    min-height: 32px;
    margin-top: 12px;
  }

  .friends-canvas {
    width: 430px;
    min-height: 900px;
    margin: 0;
  }

  .friend-card-link {
    padding: 15px 16px 14px;
  }

  .friend-card-edit {
    opacity: 1;
  }

  .friends-toolbar {
    right: 10px;
    bottom: 86px;
    left: auto;
    flex-direction: column;
    width: 42px;
    height: auto;
    transform: none;
  }

  .friends-toolbar output {
    width: 32px;
    height: 25px;
    font-size: 0.57rem;
  }

  .friends-toolbar-divider {
    width: 22px;
    height: 1px;
    margin: 3px 0;
  }

  .friends-toast {
    right: 62px;
    bottom: 18px;
  }
}

@media (max-width: 560px) {
  .friend-form-grid {
    grid-template-columns: 1fr;
  }

  .friend-form-grid label.friend-form-wide {
    grid-column: auto;
  }

  .friend-tone-fieldset {
    align-items: flex-start;
    flex-direction: column;
    gap: 8px;
  }

  .friend-delete-confirm {
    align-items: flex-start;
    flex-direction: column;
  }

  .friend-form-actions {
    align-items: flex-end;
    gap: 12px;
  }

  .friend-form-actions > span {
    display: none;
  }
}

@media (prefers-reduced-motion: reduce) {
  .friends-intro,
  .friend-card,
  .modal-enter-active .friend-editor,
  .modal-leave-active .friend-editor {
    animation: none;
    transition: none;
  }
}
</style>
