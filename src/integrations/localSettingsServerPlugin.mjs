import { fileURLToPath } from "node:url";

const snapshotPath = fileURLToPath(
  new URL("../../.momona/generated.json", import.meta.url),
);
const localConfigPath = fileURLToPath(
  new URL("../../.momona/localConfig.json", import.meta.url),
);
const settingsEntrypoint = new URL("../routes/settings.astro", import.meta.url);
const maxBodySize = 1024 * 1024;
const maxFeedSize = 2 * 1024 * 1024;
const maxMusicResponseSize = 8 * 1024 * 1024;

const requestError = (message, statusCode = 400) => {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
};

const readJsonBody = async (request) => {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.from(chunk);
    size += buffer.length;
    if (size > maxBodySize) throw requestError("请求体过大", 413);
    chunks.push(buffer);
  }
  if (!chunks.length) throw requestError("请求体不能为空");
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw requestError("请求体不是有效 JSON");
  }
};

const respondJson = (response, statusCode, payload) => {
  response.statusCode = statusCode;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
};

const errorStatus = (error) =>
  Number.isInteger(error?.statusCode) ? error.statusCode : 500;

const errorMessage = (error) =>
  error instanceof Error ? error.message : String(error);

const readFriendFeed = async (request) => {
  const requestUrl = new URL(
    request.url,
    `http://${request.headers.host || "localhost"}`,
  );
  const rawFeedUrl = requestUrl.searchParams.get("url") || "";
  let feedUrl;
  try {
    feedUrl = new URL(rawFeedUrl);
  } catch {
    throw requestError("订阅源地址无效");
  }
  if (feedUrl.protocol !== "http:" && feedUrl.protocol !== "https:") {
    throw requestError("只支持 HTTP 或 HTTPS 订阅源");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(feedUrl, {
      signal: controller.signal,
      headers: {
        Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml",
        "User-Agent": "Momona Friend RSS Reader/1.0",
      },
    });
    if (!response.ok) {
      throw requestError(`订阅源返回 ${response.status}`, 502);
    }
    const xml = await response.text();
    if (!xml.trim() || xml.length > maxFeedSize) {
      throw requestError("订阅源内容无效", 502);
    }
    return { feedUrl: feedUrl.toString(), xml };
  } catch (error) {
    if (error?.statusCode) throw error;
    throw requestError("订阅源暂时无法访问", 502);
  } finally {
    clearTimeout(timer);
  }
};

const fetchRemoteJson = async (url, options = {}, label = "远程服务") => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    if (!response.ok) throw requestError(`${label}返回 ${response.status}`, 502);
    const text = await response.text();
    if (!text || text.length > maxMusicResponseSize) {
      throw requestError(`${label}响应无效`, 502);
    }
    try {
      return JSON.parse(text);
    } catch {
      throw requestError(`${label}不是有效 JSON`, 502);
    }
  } catch (error) {
    if (error?.statusCode) throw error;
    throw requestError(`${label}暂时无法访问`, 502);
  } finally {
    clearTimeout(timer);
  }
};

const readMusicPlaylist = async (request) => {
  const requestUrl = new URL(
    request.url,
    `http://${request.headers.host || "localhost"}`,
  );
  const source = requestUrl.searchParams.get("source") || "";
  const playlistId = requestUrl.searchParams.get("id") || "";
  if (!['netease', 'qq'].includes(source) || !/^\d+$/.test(playlistId)) {
    throw requestError("歌单平台或 ID 无效");
  }

  const upstreamUrl = source === "qq"
    ? `https://c.y.qq.com/qzone/fcg-bin/fcg_ucc_getcdinfo_byids_cp.fcg?type=1&json=1&utf8=1&onlysong=0&disstid=${encodeURIComponent(playlistId)}&g_tk=5381&loginUin=0&hostUin=0&format=json&inCharset=utf8&outCharset=utf-8&notice=0&platform=yqq.json&needNewCode=0`
    : `https://music.163.com/api/v6/playlist/detail?id=${encodeURIComponent(playlistId)}`;
  return fetchRemoteJson(upstreamUrl, {
    headers: {
      Accept: "application/json, text/plain, */*",
      Referer: source === "qq" ? "https://y.qq.com/" : "https://music.163.com/",
      Origin: source === "qq" ? "https://y.qq.com" : "https://music.163.com",
      "User-Agent": "Momona Music/1.0",
    },
  }, `${source === "qq" ? "QQ 音乐" : "网易云音乐"}歌单服务`);
};

/**
 * 本地设置页集成。
 *
 * Astro 的 server hook 只在开发服务器中注册接口，生产 build 不会把这些
 * 路由或中间件输出到 dist；静态页面只读取项目内配置和公开快照。
 */
export const localSettingsServerPlugin = {
  name: "momona-local-settings",
  hooks: {
    "astro:config:setup"({ command, injectRoute, updateConfig }) {
      if (command !== "dev") return;
      injectRoute({
        pattern: "/settings",
        entrypoint: settingsEntrypoint,
      });
      updateConfig({
        vite: {
          server: {
            watch: {
              ignored: [snapshotPath, localConfigPath],
            },
          },
        },
      });
    },

    async "astro:server:setup"({ server }) {
      const { createLocalSettingsApi } = await server.ssrLoadModule(
        "/src/lib/localSettingsApi.ts",
      );
      const api = createLocalSettingsApi();

      const register = (path, method, handler) => {
        server.middlewares.use(path, async (request, response, next) => {
          if (request.method !== method) {
            next();
            return;
          }
          try {
            const payload = method === "GET" ? undefined : await readJsonBody(request);
            const result = await handler(payload, request);
            respondJson(response, 200, result);
          } catch (error) {
            respondJson(response, errorStatus(error), {
              message: errorMessage(error),
            });
          }
        });
      };

      register("/__momona/snapshot", "GET", () => api.readSnapshot());
      register("/__momona/config", "GET", () => api.readConfig());
      register("/__momona/source-status", "GET", () => api.readSourceStatus());
      register("/__momona/source-preview", "GET", (_payload, request) => {
        const requestUrl = new URL(
          request.url,
          `http://${request.headers.host || "localhost"}`,
        );
        return api.readSourcePreview(requestUrl.searchParams.get("sourceId") || "");
      });
      register("/__momona/save", "POST", (payload) => api.save(payload));
      register("/__momona/sync-source", "POST", (payload) =>
        api.syncSource(payload),
      );
      register("/__momona/process-source", "POST", (payload) =>
        api.processSource(payload),
      );
      register("/__momona/clear-source-cache", "POST", (payload) =>
        api.clearSourceCache(payload),
      );
      register("/__momona/sync", "POST", (payload) => api.sync(payload));
      register("/__momona/save-friends", "POST", (payload) =>
        api.saveFriends(payload),
      );
      register("/__momona/sync-game", "POST", (payload) => api.syncGame(payload));
      register("/__momona/friend-rss", "GET", (_payload, request) =>
        readFriendFeed(request),
      );
      register("/__momona/music-playlist", "GET", (_payload, request) =>
        readMusicPlaylist(request),
      );

      let autoRefreshRunning = false;
      const runAutoRefresh = async () => {
        if (autoRefreshRunning) return;
        autoRefreshRunning = true;
        try {
          await api.autoRefresh();
        } catch {
          // 自动刷新失败不会影响开发服务器或当前页面快照。
        } finally {
          autoRefreshRunning = false;
        }
      };
      const autoRefreshTimer = setInterval(runAutoRefresh, 15 * 60 * 1000);
      autoRefreshTimer.unref?.();
    },
  },
};
