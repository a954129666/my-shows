# Supabase 配置步骤

## 1. 创建项目

1. 登录 [Supabase Dashboard](https://supabase.com/dashboard)。
2. 点击 **New project**，选择离你较近的 `Singapore` 区域。
3. 保存好数据库密码，等待项目创建完成。

## 2. 创建数据表和权限

1. 左侧打开 **SQL Editor**。
2. 点击 **New query**。
3. 复制项目中 `supabase/schema.sql` 的全部内容。
4. 点击 **Run**，确认执行成功。

这段 SQL 会创建 `shows` 表并启用 RLS。四条权限规则都要求 `auth.uid() = user_id`，因此登录用户只能访问自己的数据。

## 3. 关闭公开注册

1. 打开 **Authentication > Providers > Email**。
2. 保持 Email 登录开启。
3. 关闭 **Allow new users to sign up**（不同界面版本可能显示为 **Enable sign ups**）。

网页只提供登录入口，不提供注册入口。

## 4. 创建你的账号

1. 打开 **Authentication > Users**。
2. 点击 **Add user > Create new user**。
3. 输入你的邮箱和一个强密码。
4. 勾选自动确认邮箱（Auto Confirm User），然后创建。

## 5. 获取前端环境变量

1. 打开 **Project Settings > API**。
2. 复制 **Project URL**。
3. 复制 **Publishable key**；如果项目仍显示旧版 Key，复制 `anon public`。
4. 本地 `.env` 填写：

```env
VITE_SUPABASE_URL=https://你的项目.supabase.co
VITE_SUPABASE_ANON_KEY=你的_publishable_或_anon_key
TMDB_API_KEY=你的_tmdb_key
```

`VITE_SUPABASE_ANON_KEY` 可以出现在前端，真正的数据保护来自 RLS。不要把数据库密码、`service_role` Key 或 TMDB Key 填入任何 `VITE_` 变量。

## 6. 迁移现有数据

1. 在原来保存数据的 `http://localhost:5173` 打开项目并先“导出备份”。
2. 配置 Supabase 后重新启动本地项目并登录。
3. 在登录后的页面点击 **恢复备份**，选择之前导出的 JSON。
4. 刷新页面，确认数量和进度正确。
5. 再在手机登录验证同步。

恢复备份会替换当前云端剧库，因此请先确认云端没有需要保留的新数据。
