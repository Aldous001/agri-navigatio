# 农机导航数据平台

GitHub Pages 提供网页，Supabase 提供账号验证和数据访问控制。项目所有者通过本机脚本上传数据、创建和停用账号。

## 首次配置

1. 在自己的 Supabase 账号下创建项目，在 SQL Editor 执行 `supabase/schema.sql`。
2. 在 Authentication 设置关闭 Allow new users to sign up 和匿名登录。关闭不使用的第三方登录提供商。
3. 将项目 URL 和 Publishable key 填入 `web/config.js`。服务端密钥只用于本机管理脚本。
4. 执行 `python scripts/manage.py upload` 上传私有快照。脚本会询问项目 URL 和隐藏输入的服务端密钥。
5. 执行 `python scripts/manage.py create-user` 创建首个账号。账号授权保存在 nav_members 表。
6. 将源码推送到自己的 GitHub 仓库，在 Settings → Pages 选择 GitHub Actions，运行发布工作流。
7. 在 Supabase 的 URL Configuration 中填写 Pages 访问地址。

## 本机运行

在项目目录运行 `python -m http.server 8765 --bind 127.0.0.1 --directory web`，浏览器打开 `http://127.0.0.1:8765`。

## 数据

第一版从原站公开型号索引匹配已经核查的导航名单。原站按型号聚合的数量可能包含多个厂家，同型号省份数据只列主要省份。页面明确展示该口径。型号字符串仅空格差异的条目合并后计算数量。

准备快照需要提供此前核查结果路径。

```powershell
python scripts/prepare_snapshot.py --catalog "核查结果绝对路径\curated.json"
python scripts/manage.py upload
```

`private` 目录保存本地快照，已在 .gitignore 中排除。Pages 发布工作流只上传 web 目录。

当前更新脚本同步的是原站公开索引。独立抓取各省补贴平台、月度趋势、县级地图下钻和精确厂家销量仍需接入原始记录。

## 停用账号

```powershell
python scripts/manage.py disable-user --user-id "用户 UUID"
```

## 上线验收

使用匿名请求访问 nav_snapshots 应被拒绝，已登录但 nav_members 无授权的账号应读不到快照。获准账号可以查询和导出，停用后刷新数据应被拒绝。需要连接实际项目后完成这些验证。
