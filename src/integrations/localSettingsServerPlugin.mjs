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

/**
 * 创建一个带 HTTP 状态码的本地设置请求错误。
 *
 * @param {string} message - 面向设置页显示的错误信息。
 * @param {number} statusCode - 需要返回的 HTTP 状态码。
 * @returns {Error & {statusCode: number}} 带状态码的错误对象。
 */
function requestError(message, statusCode = 400) {
  const error = new Error(message);
  error.statusCode = statusCode;
  return error;
}

/**
 * 读取并限制本地设置接口的 JSON 请求体大小。
 *
 * @param {import('node:http').IncomingMessage} request - 当前 HTTP 请求。
 * @returns {Promise<unknown>} 解析后的 JSON 请求载荷。
 * @throws 当请求体过大、为空或不是有效 JSON 时抛出请求错误。
 */
async function readJsonBody(request) {
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
}

/**
 * 将接口结果统一序列化为不缓存的 JSON 响应。
 *
 * @param {import('node:http').ServerResponse} response - 当前 HTTP 响应。
 * @param {number} statusCode - HTTP 状态码。
 * @param {unknown} payload - 需要序列化的响应载荷。
 * @returns {void} 无返回值。
 */
function respondJson(response, statusCode, payload) {
  response.statusCode = statusCode;
  response.setHeader("Cache-Control", "no-store");
  response.setHeader("Content-Type", "application/json; charset=utf-8");
  response.end(JSON.stringify(payload));
}

/**
 * 从未知异常中读取可用 HTTP 状态码。
 *
 * @param {unknown} error - 捕获到的未知异常。
 * @returns {number} 可用于响应的 HTTP 状态码。
 */
function errorStatus(error) {
  return Number.isInteger(error?.statusCode) ? error.statusCode : 500;
}

/**
 * 将未知异常转换为用户可读的错误文本。
 *
 * @param {unknown} error - 捕获到的未知异常。
 * @returns {string} 适合返回给设置页的错误文本。
 */
function errorMessage(error) {
  return error instanceof Error ? error.message : String(error);
}

/**
 * 请求外部 RSS/Atom 地址，供本地友联预览使用。
 *
 * @param {import('node:http').IncomingMessage} request - 携带订阅源地址的请求。
 * @returns {Promise<{feedUrl: string, xml: string}>} 规范化地址和 XML 文本。
 * @throws 当地址、协议、响应状态或响应体不符合要求时抛出请求错误。
 */
async function readFriendFeed(request) {
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
}

/**
 * 请求外部 JSON 接口，并统一处理超时、大小和格式错误。
 *
 * @param {string | URL} url - 外部 JSON 接口地址。
 * @param {RequestInit} options - 需要传给 fetch 的请求选项。
 * @param {string} label - 错误信息中使用的服务名称。
 * @returns {Promise<unknown>} 解析后的 JSON 响应。
 * @throws 当请求超时、状态异常、响应过大或不是有效 JSON 时抛出请求错误。
 */
async function fetchRemoteJson(url, options = {}, label = "远程服务") {
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
}

/**
 * 读取指定音乐平台的公开歌单原始响应。
 *
 * @param {import('node:http').IncomingMessage} request - 携带平台和歌单 ID 的请求。
 * @returns {Promise<unknown>} 音乐平台返回的原始 JSON。
 * @throws 当平台、ID或上游响应不符合要求时抛出请求错误。
 */
async function readMusicPlaylist(request) {
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
}

/**
 * 本地设置页集成。
 *
 * Astro 的 server hook 只在开发服务器中注册接口，生产 build 不会把这些
 * 路由或中间件输出到 dist；静态页面只读取项目内配置和公开快照。
 */
export const localSettingsServerPlugin = {
  name: "momona-local-settings",
  hooks: {
    /**
     * 只在开发服务器中挂载设置页入口，并忽略本地快照文件变动。
     *
     * @param context - Astro 配置钩子上下文。
     * @returns {void} 无返回值。
     */
    "astro:config:setup"(context) {
      const { command, injectRoute, updateConfig } = context;
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

    /**
     * 注册本地设置接口和开发环境的定时刷新任务。
     *
     * @param context - Astro 开发服务器钩子上下文。
     * @returns {Promise<void>} 接口注册完成后结束。
     */
    async "astro:server:setup"(context) {
      const { server } = context;
      const { createLocalSettingsApi } = await server.ssrLoadModule(
        "/src/lib/localSettingsApi.ts",
      );
      const api = createLocalSettingsApi();

      /**
       * 注册一个带方法判断和统一异常处理的开发服务器中间件。
       *
       * @param {string} path - 需要挂载的本地接口路径。
       * @param {string} method - 允许通过的 HTTP 方法。
       * @param {(payload: unknown, request: import('node:http').IncomingMessage) => Promise<unknown> | unknown} handler - 业务处理函数。
       * @returns {void} 无返回值；中间件会被挂载到开发服务器。
       */
      function register(path, method, handler) {
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
      }

      register("/__momona/snapshot", "GET", () => api.readSnapshot());
      register("/__momona/config", "GET", () => api.readConfig());
      register("/__momona/source-status", "GET", () => api.readSourceStatus());
      register("/__momona/save", "POST", (payload) => api.save(payload));
      register("/__momona/sync-source", "POST", (payload) =>
        api.syncSource(payload),
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
      /**
       * 防止自动刷新重入，并将异常限制在后台任务内部。
       *
       * @returns {Promise<void>} 本轮自动刷新完成后结束。
       */
      async function runAutoRefresh() {
        if (autoRefreshRunning) return;
        autoRefreshRunning = true;
        try {
          await api.autoRefresh();
        } catch {
          // 自动刷新失败不会影响开发服务器或当前页面快照。
        } finally {
          autoRefreshRunning = false;
        }
      }
      const autoRefreshTimer = setInterval(runAutoRefresh, 15 * 60 * 1000);
      autoRefreshTimer.unref?.();
    },
  },
};
