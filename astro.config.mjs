// @ts-check
import { defineConfig } from "astro/config";
import vue from "@astrojs/vue";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { localSettingsServerPlugin } from "./src/integrations/localSettingsServerPlugin.mjs";

const packageMetadata = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
);

function resolveGitRevision() {
  const configuredRevision = process.env.MOMONA_COMMIT?.trim();
  if (configuredRevision) return configuredRevision.slice(0, 7);

  try {
    return (
      execFileSync("git", ["rev-parse", "--short=7", "HEAD"], {
        encoding: "utf8",
      }).trim() || "local"
    );
  } catch {
    return "local";
  }
}

const buildVersion = `v${packageMetadata.version}`;
const buildRevision = resolveGitRevision();

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
  vite: {
    define: {
      __MOMONA_VERSION__: JSON.stringify(buildVersion),
      __MOMONA_REVISION__: JSON.stringify(buildRevision),
    },
  },
  integrations: [vue({ devtools: false }), localSettingsServerPlugin],
});
