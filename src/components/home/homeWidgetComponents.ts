import type { Component } from "vue";
import HomeActivities from "./HomeActivities.vue";
import HomeAgentCard from "./HomeAgentCard.vue";
import HomeBilibiliCard from "./HomeBilibiliCard.vue";
import HomeCollectionCard from "./HomeCollectionCard.vue";
import HomeFeedCard from "./HomeFeedCard.vue";
import HomeFriendCard from "./HomeFriendCard.vue";
import HomeGameCard from "./HomeGameCard.vue";
import HomeGithubCard from "./HomeGithubCard.vue";
import HomeGreeting from "./HomeGreeting.vue";
import HomeLinkCard from "./HomeLinkCard.vue";
import HomeMediaPairCard from "./HomeMediaPairCard.vue";
import HomeMusicCard from "./HomeMusicCard.vue";
import HomeWeatherCard from "./HomeWeatherCard.vue";
import type { HomeWidgetType } from "../../data/types";

/**
 * 首页组件类型到具体 Vue 组件的统一映射。
 *
 * 首页网格与「添加组件」弹窗的实时预览共用这份映射，保证预览与实际
 * 渲染结果一致；新增组件只需要先在目录登记，再在这里接入实现。
 */
export const homeWidgetComponents: Record<HomeWidgetType, Component> = {
  greeting: HomeGreeting,
  feed: HomeFeedCard,
  friend: HomeFriendCard,
  agent: HomeAgentCard,
  collection: HomeCollectionCard,
  weather: HomeWeatherCard,
  media: HomeMediaPairCard,
  music: HomeMusicCard,
  game: HomeGameCard,
  activities: HomeActivities,
  link: HomeLinkCard,
  github: HomeGithubCard,
  bilibili: HomeBilibiliCard,
};
