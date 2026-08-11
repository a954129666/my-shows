# My Shows - 我的英美剧记录工具

个人英美剧观看记录工具，用来快速记录看过哪些剧，以及当前看到第几季第几集。

## 功能

- TMDB 搜索、海报、首播年份、国家、总季集数与每季集数
- 待看、正在观看、已看完、已弃剧和观看进度
- 筛选、排序、卡片/列表展示和批量管理
- CSV 导入、JSON 备份与恢复
- Supabase 账号登录和电脑/手机云端同步
- Cloudflare Pages Function 保护 TMDB API Key
- 未配置 Supabase 时自动回退到 localStorage 本地模式

## 本地运行

1. 安装依赖：`npm install`
2. 复制配置：`cp .env.example .env`
3. 按 `.env.example` 填写环境变量
4. 启动：`npm run dev`

也可以在 macOS 上双击项目根目录的“打开 My Shows.command”。本地旧数据属于 `http://localhost:5173`，不要直接双击 `dist/index.html`。

## 云端上线

按以下两份说明操作：

1. [Supabase 配置](docs/SUPABASE_SETUP.md)
2. [GitHub + Cloudflare Pages 部署](docs/CLOUDFLARE_SETUP.md)

配置 Supabase 环境变量后，网页会显示登录页。账号需由你在 Supabase 控制台手动创建，网页不开放注册。

## 数据迁移

在原来的 `http://localhost:5173` 先导出 JSON 备份。配置 Supabase 并登录后，可以：

- 点击页面中的“迁移到云端”，合并当前浏览器的旧记录；或
- 点击“恢复备份”，用 JSON 替换云端剧库。

迁移完成后，在手机和电脑登录同一账号即可使用同一份数据。

## 安全说明

- `.env`、`.env.local` 已被 Git 忽略。
- 不能向 GitHub 提交数据库密码、Supabase `service_role` Key 或 TMDB Key。
- Supabase 的 Publishable/anon Key 可以用于前端；数据权限由 `supabase/schema.sql` 中的 RLS 策略保护。
- 线上 TMDB 请求经过 `/api/tmdb/*`，TMDB Key 仅配置为 Cloudflare Secret。

## 命令

```bash
npm run dev
npm run build
npm run lint
```

## 技术栈

React、TypeScript、Vite、Tailwind CSS、Supabase REST/Auth、Cloudflare Pages Functions、TMDB API。
