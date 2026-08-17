# Architecture

## Data model

- Trace = 一次会话/一次任务的根
- SpanEvent = 树节点（LLM 调用 / 工具 / 检索 / agent 步骤 / HTTP）
- Span 不可变：写后只读，回放/统计由查询层派生

## Components

1. **@tracelens/sdk**（零依赖）
   - Tracer：AsyncLocalStorage 上下文传播 + 内存缓冲 + 定时/手动 flush
   - Exporter：Console / HTTP / Composite（可插拔）
   - cost.ts：USD / 1M tokens 价格表 + estimateCostUsd()
   - tokenizer.ts：近似 token 计数，可替换成 tiktoken
   - instrument.ts：OpenAI/DeepSeek 兼容 chat client，自动记录 span、usage、cost
2. **@tracelens/server**
   - node:http 零框架 REST API
   - JsonlStore：追加写、崩溃安全、零原生依赖；Store 接口抽象（SQLite 适配器按需添加）
   - 查询：列表分页/过滤、按 id 取树、聚合统计（含 per-model）
3. **@tracelens/web**（React + Vite，规划中）
   - / 追踪列表 + 统计卡片
   - /traces/:id 瀑布流 + 回放
4. **apps/dsh-plugin**（规划中）
   - 复用 dsh-super-injector 通道注入
   - 侧边栏面板 + agent 调用自动捕获

## Design decisions

- 零依赖 SDK：接入方零负担（内存缓冲 + export 回调）
- 事件溯源：span 只追加，回放/统计派生，便于调试与重放
- **JSONL 先行**：单文件、追加写、无需原生编译；Store 接口隔离存储实现
- 成本表集中 + 可覆盖：价格变动只改一处
- 原生 http 起步：无框架依赖，路由手写，便于替换为 Hono/Fastify
