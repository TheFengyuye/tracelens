# TraceLens — 1 个月开发计划（简历项目）

## 目标

开源一个自托管的 LLM / Agent 可观测平台 MVP，能写进简历：

- 技术栈：TypeScript（零依赖 SDK）、Node 原生 http、JSONL 存储、React + Vite、DSH 插件
- 产出：可运行 demo + GitHub 仓库 + 文档 + 截图 + CI
- 简历写法示例：
  - 设计并开源 TraceLens：为 LLM 应用/Agent 提供调用追踪、会话回放与成本分析；SDK 零依赖、异步上下文自动父子 span、HTTP 导出、JSONL 存储；Dashboard 支持 span 瀑布流与成本聚合
  - 为 DeepSeek Harness 实现插件集成：自动捕获 agent 会话，侧边栏面板查看追踪
  - 结果：<N> 个模型成本表、demo 可复现、CI 绿、单元测试通过

## 里程碑

### W1 — SDK + 存储 + 摄入 API + demo（进行中）
- [x] 仓库骨架与文档
- [x] SDK：types / tracer / exporter / tokenizer / cost
- [x] AsyncLocalStorage 异步上下文传播（嵌套 span 自动父子）
- [x] chat client（OpenAI/DeepSeek 兼容，自动记 span + 成本）
- [x] server：JSONL store + REST API（摄入/列表/详情/统计）
- [x] examples/demo-agent.ts（mock 与真实 key 两种模式）
- [ ] 单元测试跑通（node:test + tsx，代码已写，需本机 npm test）
- [x] SQLite 适配器（SqliteStore，better-sqlite3，8/8 测试）

### W2 — Web 面板
- [ ] 追踪列表 + 过滤
- [ ] 详情：span 瀑布流、输入输出、token/cost
- [ ] 会话回放（按时间重放 span 时间线）
- [ ] 统计卡片：调用数、平均延迟、token、成本趋势

### W3 — DSH 插件（已注入运行中的 DSH ✅）
- [x] 用 dev_scaffold_plugin 生成 ui-panel 骨架（apps/dsh-plugin-scaffold，已 gitignore）
- [x] 手写零 import host（lib/index.js）+ __ModuleLoader__ client bundle（lib/client.js），绕过无 checkout 环境的构建限制
- [x] 注入验证：dev_inject_plugin → host ✓ / client ✓，registry active
- [x] conversation.view 面板内嵌 TraceLens Dashboard iframe + Capture session（会话快照摄入）
- [x] Agent 工具：tracelens_status / tracelens_stats / tracelens_ingest + 系统提示宣告
- [ ] 面板实机 UX 验证（需 GUI 刷新后人工确认）

### W4 — 打磨与发布（进行中）
- [x] 本机全链路验证：SDK 构建 + 单测 4/4 + demo + server/web 生产构建 + E2E 冒烟（摄入→列表→详情→统计）
- [x] 简历文案定稿（docs/RESUME.md）+ CHANGELOG.md + git init 完成
- [x] GitHub Actions CI 工作流（待仓库推送后首跑）
- [ ] GitHub 建仓推送（需 gh auth login）+ Release
- [ ] npm 发布（@tracelens/sdk、@tracelens/server，可后续）
- [ ] 面板实机 UX 确认 + README 截图

## 技术难点（面试素材）

1. 异步上下文传播：AsyncLocalStorage 把父子 span 串成树（已实现）
2. 低开销插桩：包装 fetch/客户端，失败不影响业务
3. 流式输出 token 计数：SSE 增量累计（已实现：sseLines 跨分块解码 + 优先 provider usage、回退 tokenizer 估算）
4. 成本模型：多 provider 价格表 + 可覆盖（已实现）
5. 回放设计：事件溯源（span 只追加，回放即重放时间线）
6. 存储权衡：JSONL 零依赖 vs SQLite 查询能力（Store 接口抽象）