# @tracelens/server

零依赖 JSONL 存储 + REST API（node:http，无框架）。

```bash
npm run build -w @tracelens/sdk   # 先构建 SDK（server 依赖它的类型）
npm run dev:server                # 或: cd packages/server && npm run dev
```

## API

| Method | Path | Description |
| --- | --- | --- |
| POST | /api/traces | 摄入 Trace（SDK HttpExporter 调用） |
| GET | /api/traces?limit&offset&name&sessionId&status | 列表（含摘要） |
| GET | /api/traces/:id | 完整 Trace（span 树） |
| GET | /api/stats | 聚合统计：调用数/token/成本/延迟/per-model |
| GET | /api/health | 健康检查 |

环境变量：`PORT`（默认 8787）、`TRACELENS_DATA`（默认 ./data）、`TRACELENS_WEB_DIST`（默认 `../web/dist` 相对本包，即 `packages/web/dist`）。

静态托管：若 `packages/web/dist` 存在（`npm run build -w @tracelens/web`），`http://127.0.0.1:8787/` 直接提供完整 Dashboard——DSH 插件面板 iframe 与浏览器直开同一入口。