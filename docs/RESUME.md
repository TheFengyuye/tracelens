# TraceLens — 简历项目文案（定稿草案）

## 一句话定位

**自托管、开源的 LLM / Agent 可观测平台**：追踪每一次模型调用、工具调用与 agent 步骤，支持会话回放、token 与成本分析。

## 技术栈

TypeScript（零依赖插桩 SDK）· Node.js 原生 HTTP · JSONL 事件溯源存储 · React + Vite · AsyncLocalStorage · DSH/Cordis 插件体系

## 英文简历 Bullet

- Designed and open-sourced **TraceLens**, a self-hosted LLM/Agent observability platform: a **zero-dependency TypeScript SDK** records nested spans (LLM / tool / agent) with **AsyncLocalStorage-based async context propagation** — nested calls auto-attach and auto-parent — plus automatic token & cost estimation across 15+ models (DeepSeek / OpenAI / Anthropic / Gemini).
- Built a **zero-framework Node HTTP server** with an append-only **JSONL event-sourcing store** (crash-safe, pluggable Store interface) and a REST API (ingest / list / detail / aggregate stats with per-model token & cost breakdown).
- Built a **React + Vite dashboard**: trace list with filters, span waterfall with input/output/token/cost, chronological **session replay**, live stats cards.
- Integrated TraceLens as a **runtime-injectable plugin** into DeepSeek Harness (a Cordis-based local agent harness): conversation-view dashboard panel, agent tools (`tracelens_status` / `tracelens_stats` / `tracelens_ingest`), session snapshot capture, and a system-prompt announcement — injected without a restart.
- Verified end-to-end: unit tests (node:test), strict typecheck, production builds, and a live smoke test (ingest → query → stats); CI via GitHub Actions.

## 中文简历 Bullet

- 设计并开源 **TraceLens**（自托管 LLM/Agent 可观测平台）：**零依赖 TypeScript 插桩 SDK**，基于 **AsyncLocalStorage 异步上下文传播**自动生成嵌套 span（LLM/工具/Agent 步骤），内置 15+ 模型的 token 成本估算（DeepSeek/OpenAI/Anthropic/Gemini），成本表可覆盖。
- 用 **Node 原生 HTTP** 实现零框架 REST 服务：**JSONL 事件溯源存储**（追加写、崩溃安全、Store 接口可插拔），提供摄入/列表/详情/聚合统计 API（含 per-model token 与成本）。
- 实现 **React + Vite 监控面板**：追踪列表与过滤、span 瀑布流（输入/输出/token/成本）、按时间线**会话回放**、实时统计卡片。
- 作为**可运行时注入的插件**集成进 DeepSeek Harness（Cordis 系本地 Agent 框架）：聊天视图内嵌 Dashboard、agent 工具（status/stats/ingest）、会话快照捕获、系统提示宣告——免重启热注入。
- 全链路验证：单元测试（node:test）、严格类型检查、生产构建、真实冒烟测试（摄入→查询→统计）；GitHub Actions CI。

## 面试可聊的技术难点

1. **异步上下文传播**：AsyncLocalStorage 把异步调用链串成 span 树，无需手传 traceId——传播正确性用单测锁定（嵌套 withSpan 自动父子）。
2. **零依赖 SDK 的边界**：buffer + exporter 回调的最小内核 vs 完整功能（成本表/近似 token 计数/流式计数）的取舍。
3. **事件溯源 + 回放**：span 只追加不可变，回放/统计由查询层派生；JSONL 单文件追加写 vs SQLite 查询能力的权衡（Store 接口隔离）。
4. **成本模型**：多 provider 价格集中表 + 运行时覆盖；未知模型优雅降级（不报错）。
5. **插件热注入**：无源码 checkout 环境下手写 __ModuleLoader__ bundle 对齐 tsdown 契约；schema 方言（标准 JSON Schema vs 工具自定义方言）踩坑与修复。

## 量化指标（待实机补充后替换占位）

- 单元测试：4/4 通过（node:test + tsx）
- Web 生产构建：149 KB JS（gzip 48 KB），构建 <1 s
- 服务端冒烟：摄入→统计全链路 <50 ms（本机）
- 模型成本表：15+ 个模型，可运行时覆盖
- CI：GitHub Actions（typecheck + test + build）
