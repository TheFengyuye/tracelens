# TraceLens for DSH

DeepSeek Harness 插件（运行时注入，手写 lib 免构建）：

- **conversation.view 面板**：聊天视图内嵌 TraceLens Dashboard（iframe，默认 http://127.0.0.1:8787，URL 可改并持久化到 localStorage）
- **Capture session**：把当前 DSH 会话最近 50 条消息快照成 Trace 摄入 TraceLens
- **Agent 工具**：`tracelens_status`（健康检查）、`tracelens_stats`（聚合统计）、`tracelens_ingest`（摄入任意 trace JSON）
- **系统提示**：向 agent 宣告插件能力与限制

## 使用

```bash
# 1. 启动 TraceLens server（仓库根目录）
npm run dev:server

# 2. 注入插件（在 DSH 里对 AI 说，或命令行）
dev_inject_plugin E:/deepseek harness/tracelens/apps/dsh-plugin
```

## 说明

- `lib/index.js`（host，ESM）与 `lib/client.js`（client，__ModuleLoader__ CJS bundle，手写对齐 tsdown 输出格式）
- 面板是浏览器内 iframe，浏览器需能访问 TraceLens server
- 会话快照仅发往本地 TraceLens server（自托管，数据不出本机）
