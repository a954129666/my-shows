# GitHub + Cloudflare Pages 上线步骤

## 1. 确保代码已推送到 GitHub

仓库中不能包含 `.env`。需要包含 `functions/`、`src/`、`supabase/`、`package.json` 和 `package-lock.json`。

## 2. 创建 Cloudflare Pages 项目

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/)。
2. 打开 **Workers & Pages**，选择 **Create > Pages > Connect to Git**。
3. 授权 GitHub，只授予 `a954129666/my-shows` 仓库权限。
4. 选择仓库和 `main` 分支。
5. 配置构建：

   - Framework preset：`Vite`
   - Build command：`npm run build`
   - Build output directory：`dist`
   - Node.js：`20` 或更高

## 3. 添加环境变量

在 Pages 项目 **Settings > Variables and Secrets** 中添加：

- `VITE_SUPABASE_URL`：Supabase Project URL（普通文本）
- `VITE_SUPABASE_ANON_KEY`：Supabase Publishable/anon key（普通文本）
- `TMDB_API_KEY`：TMDB Key，选择 **Secret/Encrypt**

不要在 Cloudflare 配置前端变量 `TMDB_API_KEY` 的 `VITE_` 版本。浏览器会通过项目中的 `/api/tmdb/*` Function 调用 TMDB。

## 4. 部署和验证

1. 点击 **Save and Deploy**。
2. 部署成功后打开 Cloudflare 提供的 `*.pages.dev` 地址。
3. 使用在 Supabase 创建的邮箱和密码登录。
4. 测试添加剧、修改进度和删除，然后分别在电脑和手机刷新确认同步。

后续每次推送到 GitHub `main`，Cloudflare 都会自动重新构建和发布。
