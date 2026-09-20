// @ts-check
import { defineConfig } from "astro/config";
import vue from "@astrojs/vue";
import { localSettingsServerPlugin } from "./src/integrations/localSettingsServerPlugin.mjs";

/**
 * Astro 静态站点配置。
 *
 * Vue 只负责浏览器端的交互层，所有路由仍然在构建阶段输出为独立的 HTML
 * 文件，因此部署时不需要运行 Node 服务或后端接口。
 */
export default defineConfig({
  output: "static",
  site: process.env.ASTRO_SITE || undefined,
  base: process.env.ASTRO_BASE || undefined,
  devToolbar: {
    enabled: false,
  },
  integrations: [vue({ devtools: false }), localSettingsServerPlugin],
});
