<script setup lang="ts">
import { computed, ref } from 'vue';
import type { BrewSource } from '../../data/types';
import FriendAvatar from '../app/FriendAvatar.vue';
import IconGlyph from '../app/IconGlyph.vue';
import BrewSourceCard from './BrewSourceCard.vue';

type SortMode = 'latest' | 'name';
type SourceFilter = 'all' | BrewSource['type'];

const query = ref('');
const activeFilter = ref<SourceFilter>('all');
const sortMode = ref<SortMode>('latest');
const selectedSource = ref<BrewSource | null>(null);
const searchOpen = ref(false);
const sortOpen = ref(false);
const shortcutOpen = ref(false);

interface Props {
  sources: BrewSource[];
}

const props = defineProps<Props>();
const sources = ref<BrewSource[]>(props.sources);
const feedsLoading = ref(false);

/**
 * 根据搜索词、信息源类型和排序方式计算当前列表。
 */
const filteredSources = computed(() => {
  const normalizedQuery = query.value.trim().toLocaleLowerCase();
  const result = sources.value.filter((source) => {
    const matchesType = activeFilter.value === 'all' || source.type === activeFilter.value;
    const searchable = [
      source.name,
      source.author,
      source.type,
      source.latestTitle,
      source.summary,
      ...source.tags,
      ...source.articles.map((item) => item.title),
    ]
      .join(' ')
      .toLocaleLowerCase();

    return matchesType && (!normalizedQuery || searchable.includes(normalizedQuery));
  });

  return sortMode.value === 'name'
    ? [...result].sort((first, second) => first.name.localeCompare(second.name, 'zh-CN'))
    : result;
});

const latestSource = computed(
  () => sources.value.find((source) => source.latestTitle) ?? sources.value[0] ?? null,
);

/**
 * 打开信息源详情面板。
 */
/**
 * 打开指定 Brew 来源的详情面板。
 *
 * @param source - 需要查看的 Brew 来源。
 * @returns 无返回值。
 */
function openSource(source: BrewSource): void {
  selectedSource.value = source;
  searchOpen.value = false;
  sortOpen.value = false;
  shortcutOpen.value = false;
}

/**
 * 关闭信息源详情面板。
 */
/**
 * 关闭 Brew 来源详情面板。
 *
 * @returns 无返回值。
 */
function closeSource(): void {
  selectedSource.value = null;
}

/**
 * 切换底部搜索入口。
 */
/**
 * 切换 Brew 搜索框的显示状态。
 *
 * @returns 无返回值。
 */
function toggleSearch(): void {
  searchOpen.value = !searchOpen.value;
  sortOpen.value = false;
  shortcutOpen.value = false;
}

/**
 * 切换排序菜单。
 */
/**
 * 在最新和原始顺序之间切换 Brew 来源排序。
 *
 * @returns 无返回值。
 */
function toggleSort(): void {
  sortOpen.value = !sortOpen.value;
  searchOpen.value = false;
  shortcutOpen.value = false;
}

/**
 * 切换快捷键提示。
 */
/**
 * 切换键盘快捷键提示区域。
 *
 * @returns 无返回值。
 */
function toggleShortcuts(): void {
  shortcutOpen.value = !shortcutOpen.value;
  searchOpen.value = false;
  sortOpen.value = false;
}

/**
 * 清除当前搜索条件。
 */
/**
 * 清空 Brew 搜索关键词并收起搜索框。
 *
 * @returns 无返回值。
 */
function clearSearch(): void {
  query.value = '';
  searchOpen.value = false;
}
</script>

<template>
  <div class="brew-page" @keydown.esc="closeSource">
    <main class="brew-content" aria-label="Brew 阅读">
      <header v-if="latestSource" class="brew-mobile-controls">
        <FriendAvatar
          class="brew-mobile-avatar"
          :src="latestSource.image"
          :alt="`${latestSource.name} 的头像`"
          :icon-size="20"
          loading="eager"
        />
        <div>
          <strong>午后时光</strong>
          <small>适合轻松阅读</small>
        </div>
        <button type="button" aria-label="排序方式" title="排序方式" @click="toggleSort">
          <IconGlyph name="arrowUpDown" :size="18" />
        </button>
      </header>

      <section class="brew-grid" aria-live="polite">
        <div
          v-if="!feedsLoading && !sources.length && activeFilter === 'all' && !query"
          class="brew-feed-empty"
        >
          <IconGlyph name="rss" :size="20" />
          <strong>{{ sources.length ? '暂无可用订阅源' : '暂无订阅源' }}</strong>
          <span>为友联设置有效的 RSS / Atom 地址后，这里会显示文章。</span>
        </div>
        <BrewSourceCard
          v-for="source in filteredSources"
          :key="source.id"
          :source="source"
          @open="openSource"
        />
        <div v-if="sources.length > 0 && filteredSources.length === 0" class="brew-empty">
          <IconGlyph name="search" :size="23" />
          <strong>没有找到匹配内容</strong>
          <span>换个关键词，或者清除筛选条件。</span>
          <button type="button" @click="clearSearch">清除搜索</button>
        </div>
      </section>
    </main>

    <div v-if="searchOpen" class="brew-search-panel glass-panel">
      <IconGlyph name="search" :size="15" />
      <input v-model="query" autofocus type="search" placeholder="搜索订阅源或文章" aria-label="搜索订阅源或文章" />
      <button v-if="query" type="button" aria-label="清除搜索" title="清除搜索" @click="clearSearch">
        <IconGlyph name="x" :size="15" />
      </button>
    </div>

    <div v-if="sortOpen" class="brew-sort-menu glass-panel" aria-label="排序和筛选">
      <strong>排序方式</strong>
      <button :class="{ 'is-active': sortMode === 'latest' }" type="button" @click="sortMode = 'latest'; sortOpen = false">
        <span>自由排序</span>
        <IconGlyph v-if="sortMode === 'latest'" name="sparkles" :size="13" />
      </button>
      <button :class="{ 'is-active': sortMode === 'name' }" type="button" @click="sortMode = 'name'; sortOpen = false">
        <span>按名称</span>
        <IconGlyph v-if="sortMode === 'name'" name="sparkles" :size="13" />
      </button>
      <div class="brew-type-filters">
        <button :class="{ 'is-active': activeFilter === 'all' }" type="button" @click="activeFilter = 'all'">全部</button>
        <button :class="{ 'is-active': activeFilter === 'Brewlia' }" type="button" @click="activeFilter = 'Brewlia'">Brewlia</button>
        <button :class="{ 'is-active': activeFilter === 'Atom' }" type="button" @click="activeFilter = 'Atom'">Atom</button>
        <button :class="{ 'is-active': activeFilter === 'RSS' }" type="button" @click="activeFilter = 'RSS'">RSS</button>
        <button :class="{ 'is-active': activeFilter === '链接' }" type="button" @click="activeFilter = '链接'">链接</button>
      </div>
    </div>

    <div v-if="shortcutOpen" class="brew-shortcut-panel glass-panel">
      <strong>快捷键</strong>
      <span><kbd>/</kbd> 搜索</span>
      <span><kbd>Esc</kbd> 关闭面板</span>
    </div>

    <div v-if="latestSource" class="brew-bottom-bar glass-panel">
      <button class="brew-current-update" type="button" :aria-label="latestSource.name" @click="openSource(latestSource)">
        <FriendAvatar
          class="brew-current-avatar"
          :src="latestSource.image"
          :alt="`${latestSource.name} 的头像`"
          :icon-size="15"
          loading="eager"
        />
        <span>
          <strong>{{ latestSource.latestTitle || '暂无最新文章' }}</strong>
          <small>来自 {{ latestSource.name }}</small>
        </span>
      </button>
      <div class="brew-toolbar-actions">
        <button type="button" aria-label="排序方式" title="排序方式" @click="toggleSort">
          <IconGlyph name="arrowUpDown" :size="15" />
          <span>自由排序</span>
          <IconGlyph name="chevronDown" :size="12" />
        </button>
        <button type="button" aria-label="搜索" title="搜索" @click="toggleSearch">
          <IconGlyph name="search" :size="15" />
          <span>搜索</span>
        </button>
        <button type="button" aria-label="快捷键" title="快捷键" @click="toggleShortcuts">
          <IconGlyph name="keyboard" :size="15" />
          <span>快捷键</span>
        </button>
      </div>
    </div>

    <Transition name="brew-detail" appear>
      <aside
        v-if="selectedSource"
        class="brew-detail-backdrop"
        tabindex="-1"
        @click.self="closeSource"
        @keydown.esc="closeSource"
      >
        <section
          class="brew-detail glass-panel"
          role="dialog"
          aria-modal="true"
          :aria-labelledby="`brew-detail-title-${selectedSource.id}`"
        >
          <header class="brew-detail-header">
            <div class="brew-detail-source">
              <FriendAvatar
                class="brew-detail-avatar"
                :src="selectedSource.image"
                :alt="`${selectedSource.name} 的头像`"
                :icon-size="29"
                loading="eager"
              />
              <div class="detail-source-copy">
                <div class="detail-meta">
                  <span class="detail-type" :class="{ 'is-link': selectedSource.type === '链接' }">
                    <IconGlyph :name="selectedSource.type === '链接' ? 'link' : 'rss'" :size="12" />
                    {{ selectedSource.type }}
                  </span>
                  <span v-if="selectedSource.feedStatus === 'available'" class="detail-status">已更新</span>
                  <span v-if="selectedSource.articleCount" class="detail-count">
                    {{ selectedSource.articleCount }} 篇文章
                  </span>
                </div>
                <h2 :id="`brew-detail-title-${selectedSource.id}`">{{ selectedSource.name }}</h2>
                <span class="detail-author">{{ selectedSource.author }}</span>
              </div>
            </div>
            <button class="brew-detail-close" type="button" aria-label="关闭详情" title="关闭详情" @click="closeSource">
              <IconGlyph name="x" :size="17" />
            </button>
          </header>

          <div class="brew-detail-scroll">
            <div v-if="selectedSource.tags.length" class="detail-tags" aria-label="信息源标签">
              <span v-for="tag in selectedSource.tags" :key="tag">{{ tag }}</span>
            </div>

            <template v-if="selectedSource.articles.length">
              <section class="detail-section detail-latest" aria-labelledby="brew-detail-latest-title">
                <div class="detail-section-heading">
                  <h3 id="brew-detail-latest-title">最新文章</h3>
                  <time v-if="selectedSource.date">{{ selectedSource.date }}</time>
                </div>
                <a
                  class="detail-latest-card"
                  :href="selectedSource.articles[0].href || selectedSource.href"
                  target="_blank"
                  rel="noreferrer"
                  @click.stop
                >
                  <span class="detail-latest-mark"><span></span>LATEST</span>
                  <strong>{{ selectedSource.articles[0].title }}</strong>
                  <p v-if="selectedSource.articles[0].summary || selectedSource.summary">
                    {{ selectedSource.articles[0].summary || selectedSource.summary }}
                  </p>
                  <span class="detail-read-link">
                    阅读全文 <IconGlyph name="external" :size="14" />
                  </span>
                </a>
              </section>

              <section class="detail-section detail-recent" aria-labelledby="brew-detail-recent-title">
                <div class="detail-section-heading">
                  <h3 id="brew-detail-recent-title">近期文章</h3>
                  <span>{{ Math.max(selectedSource.articles.length - 1, 0) }} 篇</span>
                </div>
                <div v-if="selectedSource.articles.length > 1" class="detail-article-list">
                  <template v-for="(item, index) in selectedSource.articles.slice(1)" :key="item.id">
                    <a
                      v-if="item.href"
                      class="detail-article-row"
                      :href="item.href"
                      target="_blank"
                      rel="noreferrer"
                      @click.stop
                    >
                      <span class="detail-article-index">{{ String(index + 2).padStart(2, '0') }}</span>
                      <span class="detail-article-copy">
                        <strong>{{ item.title }}</strong>
                        <time v-if="item.date">{{ item.date }}</time>
                      </span>
                      <IconGlyph name="external" :size="14" />
                    </a>
                    <div v-else class="detail-article-row">
                      <span class="detail-article-index">{{ String(index + 2).padStart(2, '0') }}</span>
                      <span class="detail-article-copy">
                        <strong>{{ item.title }}</strong>
                        <time v-if="item.date">{{ item.date }}</time>
                      </span>
                    </div>
                  </template>
                </div>
                <p v-else class="detail-list-empty">订阅源暂时只有这一篇文章。</p>
              </section>
            </template>

            <section v-else class="detail-no-feed" aria-live="polite">
              <span class="detail-no-feed-icon">
                <IconGlyph :name="selectedSource.type === '链接' ? 'link' : 'rss'" :size="20" />
              </span>
              <strong>
                {{
                  selectedSource.feedStatus === 'unset'
                    ? '未设置订阅源'
                    : selectedSource.feedStatus === 'unavailable'
                      ? '订阅源暂时不可用'
                      : '暂无文章'
                }}
              </strong>
              <p>
                {{
                  selectedSource.feedStatus === 'unset'
                    ? '这是一个友联入口，可以访问站点查看内容。'
                    : selectedSource.feedStatus === 'unavailable'
                      ? '当前无法读取 RSS / Atom 内容，请稍后再试。'
                      : '订阅源已连接，暂时还没有可展示的文章。'
                }}
              </p>
            </section>
          </div>

          <footer class="detail-footer">
            <span class="detail-footer-state">
              <span class="detail-footer-dot" :class="{ 'is-live': selectedSource.feedStatus === 'available' }"></span>
              {{ selectedSource.feedStatus === 'available' ? '实时订阅' : '友联站点' }}
            </span>
            <a class="detail-action" :href="selectedSource.href" target="_blank" rel="noreferrer" @click.stop>
              访问站点 <IconGlyph name="external" :size="14" />
            </a>
          </footer>
        </section>
      </aside>
    </Transition>
  </div>
</template>

<style scoped>
.brew-page {
  position: relative;
  display: flow-root;
  min-height: 100vh;
  padding-bottom: 120px;
}

.brew-content {
  width: min(1280px, calc(100% - 48px));
  margin: 80px auto 0;
}

.brew-grid {
  display: grid;
  grid-auto-rows: 64px;
  grid-auto-flow: dense;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  align-items: stretch;
}

:deep(.layout-featured) {
  grid-row: span 4;
}

:deep(.layout-standard) {
  grid-row: span 2;
}

:deep(.layout-link) {
  grid-row: span 1;
}

.brew-mobile-controls {
  display: none;
}

.brew-empty {
  display: flex;
  min-height: 240px;
  grid-column: 1 / -1;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;
  color: var(--muted);
}

.brew-feed-empty {
  position: absolute;
  top: 50%;
  left: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 7px;
  color: var(--muted);
  text-align: center;
  transform: translate(-50%, -50%);
}

.brew-feed-empty strong {
  color: var(--ink);
  font-size: 0.86rem;
}

.brew-feed-empty span {
  font-size: 0.63rem;
}

.brew-empty strong {
  color: var(--ink);
  font-size: 0.86rem;
}

.brew-empty span {
  font-size: 0.63rem;
}

.brew-empty button {
  padding: 7px 11px;
  border: 0;
  border-radius: 8px;
  color: #fff;
  background: var(--purple);
  font-size: 0.62rem;
}

.brew-bottom-bar {
  position: fixed;
  z-index: 30;
  bottom: 32px;
  left: 50%;
  display: flex;
  width: clamp(461px, 35vw, 502px);
  height: 54px;
  padding: 8px 11px 8px 20px;
  align-items: center;
  gap: 10px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.8);
  transform: translateX(-50%);
}

.brew-current-update {
  display: flex;
  min-width: 0;
  width: 184px;
  height: 36px;
  padding: 0;
  align-items: center;
  gap: 7px;
  border: 0;
  color: var(--ink);
  background: transparent;
  text-align: left;
}

.brew-current-avatar {
  width: 25px;
  height: 25px;
  flex: 0 0 auto;
  border: 1px solid rgba(255, 255, 255, 0.8);
  border-radius: 7px;
  object-fit: cover;
}

.brew-current-update span {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 2px;
}

.brew-current-update strong,
.brew-current-update small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.brew-current-update strong {
  font-size: 0.66rem;
  font-weight: 760;
}

.brew-current-update small {
  color: var(--muted);
  font-size: 0.54rem;
}

.brew-toolbar-actions {
  display: flex;
  min-width: 0;
  flex: 1;
  align-items: center;
  justify-content: flex-start;
  gap: 6px;
}

.brew-toolbar-actions button {
  display: inline-flex;
  min-width: 0;
  height: 36px;
  padding: 0 7px;
  align-items: center;
  gap: 5px;
  border: 0;
  border-radius: 9px;
  color: var(--muted-strong);
  background: transparent;
  font-size: 0.59rem;
  white-space: nowrap;
}

.brew-toolbar-actions button:nth-child(1) {
  width: 112px;
}

.brew-toolbar-actions button:nth-child(2) {
  width: 70px;
}

.brew-toolbar-actions button:nth-child(3) {
  width: 82px;
}

.brew-toolbar-actions button:hover {
  color: var(--purple-deep);
  background: rgba(234, 231, 255, 0.64);
}

.brew-search-panel,
.brew-sort-menu,
.brew-shortcut-panel {
  position: fixed;
  z-index: 32;
  bottom: 96px;
}

.brew-search-panel {
  left: 50%;
  display: flex;
  width: min(340px, calc(100vw - 32px));
  height: 43px;
  padding: 0 11px;
  align-items: center;
  gap: 7px;
  border-radius: 12px;
  color: var(--muted);
  transform: translateX(-50%);
}

.brew-search-panel input {
  min-width: 0;
  flex: 1;
  border: 0;
  outline: 0;
  color: var(--ink);
  background: transparent;
  font-size: 0.66rem;
}

.brew-search-panel button {
  display: grid;
  width: 25px;
  height: 25px;
  padding: 0;
  place-items: center;
  border: 0;
  border-radius: 50%;
  color: var(--muted);
  background: transparent;
}

.brew-sort-menu {
  left: calc(50% + 140px);
  display: flex;
  width: 170px;
  padding: 10px;
  flex-direction: column;
  gap: 4px;
  border-radius: 12px;
}

.brew-sort-menu strong,
.brew-shortcut-panel strong {
  padding: 3px 6px 6px;
  color: var(--ink);
  font-size: 0.66rem;
}

.brew-sort-menu > button {
  display: flex;
  min-height: 31px;
  padding: 0 7px;
  align-items: center;
  justify-content: space-between;
  border: 0;
  border-radius: 7px;
  color: var(--muted-strong);
  background: transparent;
  font-size: 0.62rem;
  text-align: left;
}

.brew-sort-menu > button:hover,
.brew-sort-menu > button.is-active {
  color: var(--purple-deep);
  background: rgba(229, 225, 255, 0.72);
}

.brew-type-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  padding: 6px 3px 2px;
  border-top: 1px solid rgba(111, 120, 145, 0.12);
}

.brew-type-filters button {
  padding: 4px 6px;
  border: 0;
  border-radius: 5px;
  color: var(--muted);
  background: transparent;
  font-size: 0.54rem;
}

.brew-type-filters button.is-active {
  color: var(--purple-deep);
  background: rgba(229, 225, 255, 0.72);
}

.brew-shortcut-panel {
  left: calc(50% + 155px);
  display: flex;
  width: 142px;
  padding: 10px;
  flex-direction: column;
  gap: 6px;
  border-radius: 12px;
  color: var(--muted-strong);
  font-size: 0.61rem;
}

.brew-shortcut-panel span {
  padding-inline: 6px;
}

kbd {
  display: inline-grid;
  min-width: 22px;
  height: 19px;
  margin-right: 4px;
  padding-inline: 3px;
  place-items: center;
  border: 1px solid rgba(118, 122, 150, 0.2);
  border-radius: 4px;
  color: var(--purple-deep);
  background: rgba(255, 255, 255, 0.6);
  font-size: 0.55rem;
}

.brew-detail-backdrop {
  position: fixed;
  z-index: 40;
  inset: 0;
  display: grid;
  padding: 24px;
  place-items: center;
  background: rgba(31, 32, 67, 0.28);
  backdrop-filter: blur(8px) saturate(112%);
}

.brew-detail {
  position: relative;
  display: flex;
  width: min(620px, 100%);
  max-height: min(760px, calc(100vh - 48px));
  overflow: hidden;
  flex-direction: column;
  border-color: rgba(255, 255, 255, 0.9);
  border-radius: 24px;
  background: rgba(252, 252, 255, 0.94);
  box-shadow: 0 28px 80px rgba(39, 34, 92, 0.26);
}

.brew-detail-header {
  display: flex;
  min-width: 0;
  padding: 26px 28px 20px;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  border-bottom: 1px solid rgba(105, 105, 145, 0.1);
}

.brew-detail-source {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 15px;
}

.brew-detail-avatar {
  width: 58px;
  height: 58px;
  flex: 0 0 auto;
  overflow: hidden;
  border: 2px solid rgba(255, 255, 255, 0.9);
  border-radius: 18px;
  color: var(--purple-deep);
  background: rgba(229, 225, 255, 0.72);
  box-shadow: 0 7px 18px rgba(72, 56, 135, 0.12);
  object-fit: cover;
}

.detail-source-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
}

.detail-meta {
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 7px;
  color: var(--muted);
  font-size: 0.58rem;
}

.detail-type {
  display: inline-flex;
  min-height: 21px;
  padding: 3px 8px;
  align-items: center;
  gap: 4px;
  border-radius: 7px;
  color: var(--purple-deep);
  background: rgba(224, 219, 255, 0.72);
  font-weight: 760;
}

.detail-type.is-link {
  color: #dd7046;
  background: rgba(255, 226, 213, 0.82);
}

.detail-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--green);
  font-weight: 700;
}

.detail-status::before {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: currentColor;
  box-shadow: 0 0 0 3px rgba(53, 165, 123, 0.12);
  content: "";
}

.detail-count {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.brew-detail h2 {
  overflow: hidden;
  margin: 0;
  color: var(--ink);
  font-size: 1.22rem;
  font-weight: 800;
  line-height: 1.12;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-author {
  overflow: hidden;
  color: var(--muted);
  font-size: 0.63rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.brew-detail-close {
  display: grid;
  width: 28px;
  height: 28px;
  padding: 0;
  flex: 0 0 auto;
  place-items: center;
  border: 0;
  border-radius: 50%;
  color: var(--muted-strong);
  background: rgba(234, 231, 245, 0.68);
  transition: color 0.18s ease, background 0.18s ease, transform 0.18s ease;
}

.brew-detail-close:hover,
.brew-detail-close:focus-visible {
  color: var(--purple-deep);
  background: rgba(224, 219, 255, 0.9);
  transform: rotate(6deg);
}

.brew-detail-scroll {
  min-height: 0;
  padding: 0 28px 24px;
  overflow: auto;
  scrollbar-color: rgba(117, 100, 222, 0.35) transparent;
  scrollbar-width: thin;
}

.detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  padding-top: 18px;
}

.detail-tags span {
  padding: 5px 9px;
  border-radius: 7px;
  color: var(--purple-deep);
  background: rgba(224, 219, 255, 0.58);
  font-size: 0.59rem;
  font-weight: 720;
}

.detail-section {
  margin-top: 22px;
}

.detail-section-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
}

.detail-section-heading h3 {
  margin: 0;
  color: var(--ink);
  font-size: 0.78rem;
  font-weight: 800;
}

.detail-section-heading time,
.detail-section-heading > span {
  flex: 0 0 auto;
  color: var(--muted);
  font-size: 0.59rem;
}

.detail-latest-card {
  display: block;
  margin-top: 10px;
  padding: 19px 20px 17px;
  border: 1px solid rgba(255, 255, 255, 0.86);
  border-radius: 17px;
  color: inherit;
  background: rgba(234, 231, 247, 0.7);
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.56);
  transition: background 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.detail-latest-card:hover,
.detail-latest-card:focus-visible {
  background: rgba(228, 224, 247, 0.9);
  box-shadow: 0 12px 26px rgba(72, 56, 135, 0.1);
  transform: translateY(-1px);
}

.detail-latest-mark {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  color: var(--purple-deep);
  font-size: 0.53rem;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.detail-latest-mark > span {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--purple);
  box-shadow: 0 0 0 4px rgba(117, 100, 222, 0.12);
  content: "";
}

.detail-latest-card > strong {
  display: block;
  margin-top: 10px;
  color: var(--ink-soft);
  font-size: 1rem;
  font-weight: 800;
  line-height: 1.42;
}

.detail-latest-card > p {
  display: -webkit-box;
  margin: 8px 0 0;
  overflow: hidden;
  color: var(--muted-strong);
  font-size: 0.68rem;
  line-height: 1.65;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}

.detail-read-link {
  display: inline-flex;
  margin-top: 14px;
  align-items: center;
  gap: 5px;
  color: var(--purple-deep);
  font-size: 0.61rem;
  font-weight: 760;
}

.detail-article-list {
  margin-top: 8px;
  border-top: 1px solid rgba(105, 105, 145, 0.1);
}

.detail-article-row {
  display: grid;
  min-width: 0;
  min-height: 62px;
  padding: 12px 4px;
  grid-template-columns: 30px minmax(0, 1fr) 16px;
  align-items: center;
  gap: 10px;
  border-bottom: 1px solid rgba(105, 105, 145, 0.1);
  color: inherit;
}

a.detail-article-row {
  transition: color 0.18s ease, padding 0.18s ease;
}

a.detail-article-row:hover,
a.detail-article-row:focus-visible {
  padding-inline: 7px;
  color: var(--purple-deep);
}

.detail-article-index {
  color: #a8a3bf;
  font-size: 0.62rem;
  font-variant-numeric: tabular-nums;
  font-weight: 760;
}

.detail-article-copy {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 5px;
}

.detail-article-copy strong {
  overflow: hidden;
  color: var(--ink-soft);
  font-size: 0.7rem;
  font-weight: 680;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.detail-article-copy time {
  color: var(--muted);
  font-size: 0.58rem;
}

.detail-article-row > svg {
  color: var(--muted);
}

.detail-list-empty {
  margin: 10px 0 0;
  color: var(--muted);
  font-size: 0.63rem;
}

.detail-no-feed {
  display: flex;
  margin-top: 24px;
  padding: 23px 20px;
  align-items: center;
  flex-direction: column;
  gap: 8px;
  border: 1px solid rgba(105, 105, 145, 0.1);
  border-radius: 16px;
  color: var(--muted);
  background: rgba(239, 237, 246, 0.54);
  text-align: center;
}

.detail-no-feed-icon {
  display: grid;
  width: 42px;
  height: 42px;
  margin-bottom: 3px;
  place-items: center;
  border-radius: 13px;
  color: var(--purple-deep);
  background: rgba(224, 219, 255, 0.75);
}

.detail-no-feed strong {
  color: var(--ink-soft);
  font-size: 0.77rem;
}

.detail-no-feed p {
  max-width: 300px;
  margin: 0;
  font-size: 0.63rem;
  line-height: 1.6;
}

.detail-footer {
  display: flex;
  min-height: 68px;
  padding: 14px 28px 16px;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  border-top: 1px solid rgba(105, 105, 145, 0.1);
}

.detail-footer-state {
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 7px;
  color: var(--muted);
  font-size: 0.59rem;
}

.detail-footer-dot {
  width: 6px;
  height: 6px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: #b5b5c1;
}

.detail-footer-dot.is-live {
  background: var(--green);
  box-shadow: 0 0 0 4px rgba(53, 165, 123, 0.12);
}

.detail-action {
  display: inline-flex;
  min-height: 33px;
  padding: 0 12px;
  align-items: center;
  gap: 6px;
  border-radius: 9px;
  color: #fff;
  background: var(--purple);
  box-shadow: 0 5px 12px rgba(117, 100, 222, 0.2);
  font-size: 0.62rem;
  font-weight: 720;
  transition: background 0.18s ease, transform 0.18s ease;
}

.detail-action:hover,
.detail-action:focus-visible {
  background: var(--purple-deep);
  transform: translateY(-1px);
}

.brew-detail-enter-active,
.brew-detail-leave-active {
  transition: opacity 0.24s ease;
}

.brew-detail-enter-active .brew-detail,
.brew-detail-leave-active .brew-detail {
  transition: opacity 0.24s ease, transform 0.32s cubic-bezier(0.22, 1, 0.36, 1);
}

.brew-detail-enter-from,
.brew-detail-leave-to {
  opacity: 0;
}

.brew-detail-enter-from .brew-detail,
.brew-detail-leave-to .brew-detail {
  opacity: 0;
  transform: translateY(18px) scale(0.97);
}

@media (max-width: 1199px) and (min-width: 641px) {
  .brew-current-update {
    width: 164px;
  }

  .brew-toolbar-actions button:nth-child(1) {
    width: 101px;
  }

  .brew-toolbar-actions button:nth-child(2) {
    width: 65px;
  }

  .brew-toolbar-actions button:nth-child(3) {
    width: 76px;
  }

  .brew-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 640px) {
  .brew-page {
    padding-bottom: 106px;
  }

  .brew-content {
    width: calc(100% - 32px);
    margin-top: 80px;
  }

  .brew-mobile-controls {
    display: flex;
    width: 100%;
    height: 54px;
    margin-bottom: 16px;
    padding: 9px 10px 9px 16px;
    align-items: center;
    gap: 8px;
    border: 1px solid rgba(255, 255, 255, 0.8);
    border-radius: 15px;
    background: rgba(255, 255, 255, 0.72);
    box-shadow: 0 10px 25px rgba(72, 56, 135, 0.08);
    backdrop-filter: blur(18px) saturate(132%);
  }

  .brew-mobile-avatar {
    width: 36px;
    height: 36px;
    flex: 0 0 auto;
    border: 1px solid rgba(255, 255, 255, 0.78);
    border-radius: 9px;
    object-fit: cover;
  }

  .brew-mobile-controls > div {
    display: flex;
    min-width: 0;
    flex-direction: column;
    gap: 2px;
  }

  .brew-mobile-controls strong {
    font-size: 0.77rem;
    font-weight: 760;
  }

  .brew-mobile-controls small {
    color: var(--muted);
    font-size: 0.58rem;
  }

  .brew-mobile-controls button {
    display: grid;
    width: 40px;
    height: 36px;
    margin-left: auto;
    padding: 0;
    place-items: center;
    border: 0;
    border-radius: 9px;
    color: var(--muted-strong);
    background: transparent;
  }

  .brew-grid {
    display: flex;
    gap: 12px;
    flex-direction: column;
  }

  :deep(.brew-source-card) {
    grid-column: auto;
    grid-row: auto;
  }

  :deep(.layout-featured),
  :deep(.layout-standard),
  :deep(.layout-link) {
    grid-row: auto;
  }

  .brew-bottom-bar {
    display: none;
  }

  .brew-search-panel {
    bottom: 100px;
  }

  .brew-sort-menu,
  .brew-shortcut-panel {
    right: 16px;
    bottom: 100px;
    left: auto;
  }

  .brew-detail-backdrop {
    padding: 10px;
  }

  .brew-detail {
    max-height: calc(100vh - 20px);
    border-radius: 22px;
  }

  .brew-detail-header {
    padding: 20px 18px 17px;
    gap: 10px;
  }

  .brew-detail-source {
    gap: 12px;
  }

  .brew-detail-avatar {
    width: 52px;
    height: 52px;
    border-radius: 16px;
  }

  .detail-meta {
    gap: 5px;
    font-size: 0.55rem;
  }

  .detail-type {
    min-height: 20px;
    padding-inline: 7px;
  }

  .brew-detail h2 {
    font-size: 1.05rem;
  }

  .detail-author {
    font-size: 0.59rem;
  }

  .brew-detail-scroll {
    padding: 0 18px 20px;
  }

  .detail-tags {
    padding-top: 15px;
  }

  .detail-section {
    margin-top: 19px;
  }

  .detail-latest-card {
    padding: 17px 16px 15px;
  }

  .detail-latest-card > strong {
    font-size: 0.9rem;
  }

  .detail-article-row {
    grid-template-columns: 27px minmax(0, 1fr) 14px;
    gap: 8px;
  }

  .detail-article-copy strong {
    font-size: 0.67rem;
  }

  .detail-footer {
    min-height: 62px;
    padding: 12px 18px 14px;
  }
}
</style>
