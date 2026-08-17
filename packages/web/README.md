# @tracelens/web

Dashboard（React + Vite）：

```bash
npm run dev:server   # 先起后端 (127.0.0.1:8787)
npm run dev:web      # 再起前端 (127.0.0.1:5173, /api 代理到后端)
```

功能：统计卡片（调用/token/成本/延迟）、追踪列表（按名称过滤）、span 瀑布流详情（输入输出/token/成本）、会话回放。
