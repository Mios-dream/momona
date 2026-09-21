# Momona 个人项目重构方案

## 1. 重构定位

本次重构的目标是提高个人站点的可读性、可维护性和数据边界清晰度，不改变现有页面用途，不增加业务功能，也不引入企业级的权限、审计、事务或复杂校验体系。

重构遵循以下原则：

- 页面组件只负责展示和交互，不直接调用第三方接口、读取凭据或操作本地 JSON 文件。
- 每个数据来源先转换为统一领域模型，再交给页面派生层组合，避免页面知道平台 API 的差异。
- 原始响应、公开投影、页面快照和本地配置分层保存，凭据不进入公开页面数据。
- 长函数按职责拆分，优先使用早返回减少嵌套；只有确实复用或能表达边界的逻辑才抽取公共方法。
- 以个人项目可直接运行和容易修改为优先，不为了抽象而增加框架、容器或复杂基础设施。

## 2. 目录职责

| 目录 | 职责 | 不应承担的职责 |
| --- | --- | --- |
| `src/data` | 领域类型、默认值、静态目录、本地配置规范化、页面快照合并 | 发起网络请求、操作浏览器 DOM |
| `src/lib/dataSources/providers` | 一个第三方来源的身份解析、请求和原始响应解析 | 直接修改 Vue 状态或页面组件 |
| `src/lib/dataSources/registry.ts` | 注册来源适配器，统一来源协议和来源级投影 | 保存文件、渲染页面 |
| `src/lib/dataSources/siteData` | 将统一来源结果组合成首页、资料库、报告和媒体派生数据 | 访问第三方 API |
| `src/lib/persistence` | JSON 文件读取、原子写入等最小持久化能力 | 解释业务字段或拼装页面数据 |
| `src/lib/sourceSnapshots.ts` | 管理来源原始快照、公开派生快照和来源状态 | 生成 Vue 组件配置 |
| `src/lib/localConfigStore.ts` | 管理本地配置、凭据合并和配置文件读写 | 处理来源 API 细节 |
| `src/lib/localSnapshot.ts` | 管理公开页面快照和串行更新 | 解析远程响应 |
| `src/lib/localSettingsApi.ts` | 编排设置页的配置、同步、快照和刷新操作 | 直接实现平台请求 |
| `src/composables` | 封装可复用的浏览器交互状态，例如拖拽、缩放和布局 | 持久化来源数据 |
| `src/utils` | 与 Vue 无关的纯计算和布局工具 | 读取本地配置或调用网络 |
| `src/components` | 页面结构、交互事件和展示状态 | 了解上游 API 返回格式 |
| `src/integrations` | Astro 开发期本地设置接口和开发期自动刷新 | 参与静态页面业务派生 |

页面路由保持 Astro 静态输出。Vue 只承载浏览器端交互，生产部署不需要 Node 后端；设置接口和自动刷新只在 Astro 开发服务器中注入。

## 3. 数据来源适配协议

来源适配器集中注册在 `src/lib/dataSources/registry.ts`，每个来源实现相同的四步协议：

```ts
interface SourceAdapter {
  resolveIdentity(config: SourceConfig): string;
  sync(config: SourceConfig): Promise<ProviderSyncData>;
  project(rawData: unknown, config: SourceConfig): SourceProjection;
  formatMessage(result: ProviderSyncData, config: SourceConfig): string;
}
```

- `resolveIdentity`：只负责从用户名、用户页 URL 或数字 ID 中得到请求所需的身份值。
- `sync`：只负责调用来源 provider，并返回原始响应与统一的中间同步结果。
- `project`：将原始响应按当前配置投影为 `LibraryItem[]`、`MusicCatalog` 和仓库列表。
- `formatMessage`：生成设置页和同步命令使用的中文摘要，不让调用方拼接来源特有文案。

新增或替换来源时，优先新增一个 provider 文件，再在注册表增加适配器映射。页面层、设置页和快照层只依赖 `DataSourceId`、`ProviderSyncData`、`SourceProjection` 等统一类型。

## 4. 数据流与快照边界

```text
LocalConfig
    |
    v
resolveIdentity -> provider.sync -> ProviderSyncData.rawData
                                      |
                                      v
                              adapter.project
                                      |
             +------------------------+------------------------+
             |                                                 |
             v                                                 v
     来源私有原始快照                                  公开来源派生快照
 .momona/sources/<id>.raw.json                    .momona/sources/<id>.derived.json
             |                                                 |
             +------------------------+------------------------+
                                      v
                           mergeSourceSiteData
                                      |
                                      v
                         .momona/generated.json
                                      |
                                      v
                              Astro/Vue 页面
```

### 4.1 原始快照

`*.raw.json` 保存远程响应和抓取时间，只供本地重新投影和排查同步问题使用。它可能包含平台返回的额外字段，因此不应被发布到静态站点。

### 4.2 公开派生快照

`*.derived.json` 只保存当前页面需要的统一字段。写入前会移除资料条目的 `metadata` 等私有字段。清理派生缓存时保留原始快照，以便修改内容筛选后离线重新处理。

### 4.3 页面快照

`.momona/generated.json` 是页面构建和设置页预览使用的公开数据入口，包含已经组合好的首页、资料库、报告、友联、播放器目录和来源状态。页面不应直接读取来源原始快照。

### 4.4 配置和凭据

`.momona/localConfig.json` 保存本地配置；token 等凭据在运行时通过环境变量或本地凭据文件合并，`LocalConfig` 进入页面派生流程前仍然只用于同步和筛选。生成的 `SiteData` 不包含来源 token。

## 5. 同步与失败策略

`syncDataSource` 只处理一个来源，先判断来源是否启用、是否选择了内容、是否能解析身份，再调用适配器。`collectSiteData` 负责并行收集所有来源，命令行同步脚本则按来源逐个保存快照并更新页面快照。

来源失败时：

- 当前来源记录 `error` 状态和可读消息。
- 其他来源继续同步。
- `mergeSourceSiteData` 保留该来源上一次成功的页面数据，避免一次临时网络错误清空公开页面。
- 成功同步才覆盖对应的原始快照和派生快照。

来源状态只描述最近一次同步结果，不承担复杂监控或告警职责。

## 6. 页面和交互层约定

- 页面组件通过 `SiteData`、`LocalConfig` 派生的统一模型接收数据。
- `usePanZoom` 和 `useLibraryCanvasControls` 负责画布交互状态、事件转换、动画帧合并和提交时机；页面只负责传入边界、绘制函数和持久化回调。
- 首页网格、友联墙和资料库布局算法放在独立工具或数据模块中，组件不内嵌布局计算。
- 音乐播放器主机负责播放状态和浏览器媒体 API，音乐来源解析和目录生成仍在 provider/数据层完成。
- 设置页只编排表单状态和本地 API 调用；配置默认值、来源目录、标签和内容选项放在 `src/data` 中集中维护。

## 7. 注释和方法规范

所有具名函数、类构造函数、对象 API 方法和 Astro/Vue 生命周期钩子都使用中文 TSDoc，至少说明：

- 方法的职责和边界。
- 每个参数的含义。
- 返回值或异步完成条件。
- 可能抛出的错误或重要副作用。

方法内部只保留有助于理解决策的中文注释，例如“为什么保留旧数据”“为什么必须在动画帧中合并变换”。不为简单赋值和显而易见的语法添加空泛注释。

方法重构优先级如下：

1. 先用早返回处理无效输入、跳过条件和错误分支。
2. 把身份解析、远程请求、响应解析、模型投影和消息格式化拆为不同函数。
3. 把跨页面复用的纯逻辑放入 `src/utils` 或数据层，把只服务一个组件的逻辑保留在组件私有函数中。
4. 保持公共方法参数语义稳定；需要多个可选参数时使用命名对象，避免调用处依赖参数顺序。

## 8. 本地接口与并发写入

`localSettingsServerPlugin.mjs` 只负责开发服务器路由注册、请求体限制、远程预览请求和统一错误响应。实际配置和快照操作由 `localSettingsApi` 与数据层完成。

所有 JSON 写入都使用临时文件再重命名的方式，减少中断留下半份文件的概率。设置页更新公开页面快照时通过 `createSiteSnapshotStore` 串行排队：每个更新都重新读取最新文件，再基于最新数据计算下一份快照，避免两个开发期请求互相覆盖。

## 9. 验证清单

完成代码调整后执行：

```powershell
pnpm astro check
pnpm build
git diff --check
git status --short
```

需要重点观察：

- `astro check` 不产生 TypeScript、Vue 模板或 Astro 类型错误。
- `pnpm build` 能在无本地开发接口的情况下输出静态页面。
- 页面组件没有直接导入 provider、`fs`、token 或来源原始响应类型。
- 失败来源不会删除旧的公开页面条目。
- 原始快照和页面快照中没有凭据字段。

## 10. 已知边界和风险

本项目仍然依赖第三方服务的公开接口和页面结构，来源接口变更、限流、跨域资源失效或返回字段变化需要在对应 provider 中修复。浏览器端 RSS 验证、图片加载、音频播放和自动播放会受到浏览器权限、跨域策略和用户手势限制；这些属于运行环境边界，不通过增加企业级校验来掩盖。

静态构建只能使用同步时已经写入的公开快照。开发期设置页的本地接口不是生产后端，发布前应通过同步命令生成最新 `.momona/generated.json`，并按项目发布策略决定是否提交公开快照。
