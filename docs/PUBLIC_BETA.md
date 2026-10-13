# 小规模公测上线清单

## Supabase

1. Authentication 设置中开启 Email 注册，保持 Confirm email 开启，密码最少 8 位。
2. URL Configuration：Site URL 填 https://my-shows.pages.dev；Redirect URLs 添加 https://my-shows.pages.dev 和本地开发地址 http://localhost:5173。
3. 配置 Custom SMTP，验证发信域名的 SPF/DKIM，测试普通用户邮箱能收到注册和重置邮件。默认邮件服务不能给公众发信。
4. 执行 supabase/schema.sql 和 supabase/public-beta.sql，确认 shows 启用 RLS。用两个测试账号分别添加记录，验证互相不能读取或修改。
5. 初期只向少量朋友发送链接，观察 Usage。不要关闭邮箱验证来绕过邮件配置。
6. 公测前启用 Supabase Auth 的 CAPTCHA，并在前端接入对应验证码（当前注册流程尚未包含验证码）；小范围邀请阶段限制传播规模并监控注册量，正式面向陌生用户推广前必须完成这一步。

## Cloudflare

1. Production 的 Variables and Secrets 保留 VITE_SUPABASE_URL、VITE_SUPABASE_ANON_KEY、TMDB_API_KEY。前两项需同时供构建与 Function 使用。
2. 限流使用 Supabase 原子计数函数：每个账号每自然分钟最多 30 次请求，跨设备共享。无需 Cloudflare 额外绑定。
3. 必须先执行 public-beta.sql；缺少计数函数时接口关闭。不要删除保护后开放接口。
4. 缺少限流/身份配置时搜索返回 503。匿名返回 401，超限返回 429。
5. 验证正常搜索、邮箱回跳、密码重置，再公开分享链接。保护接口启用后，旧前端请求不携带登录令牌会失效，因此前端与 Function 必须一同部署。

## 上线验收

- 新邮箱注册、验证后登录；忘记密码后成功设置新密码。
- A 账户退出后 B 账户看不到 A 的记录，离线草稿仅恢复到原账号。
- 未登录直接访问 /api/tmdb/search/tv 返回 401；其他路径返回 404。
- 过量请求返回 429；TMDB 断连显示可重试错误。
- 下载备份后可正常恢复，公开隐私说明和 TMDB 标识可访问。
- 注销暂由运营者人工验证并在 Supabase 删除用户，外键级联删除云端剧库；提醒用户清除其设备本地缓存。
