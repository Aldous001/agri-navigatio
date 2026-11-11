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

当前更新脚本同步参考网站公开汇总。独立抓取各省补贴平台和精确厂家销量仍需接入原始记录；月度与区域信息已按下述全品目口径纳入。

### 月度与区域（原站全品目）

按最新确认，参考网站公开的全品目汇总数据已完整纳入，入口为“月度与区域”。此页明确标注包含作业监测设备，不属于137条核验农机导航型号的专属统计。省／市／区县／年份筛选、全国省级地图、月度趋势与明细、区域明细下钻、区县品目／厂家／乡镇公开排名均可查询，并支持区域CSV、月度CSV和完整原站汇总JSON下载。市和区县通过选择框及明细表下钻；当前地图仍展示全国省级边界。

完整原站汇总保存在 `nav_snapshots` 的 `reference` 行，采用 gzip-base64 压缩，登录并获准访问后由浏览器解压；不写入公开的 Pages 文件。原站公开字段原样保留，缺失月份不补零，乡镇数据仍限原站公开TOP10。年份指标沿用公示年份，月度趋势沿用购机日期，不能强行对齐。完整数据下载只包含原站公开汇总，不包含原始逐笔购机记录。

`supabase/sync-reference-schema.sql` 扩展快照编号约束并创建仅服务角色可调用的原子写入函数。导航快照与完整汇总快照在同一事务更新，一项失败则全部保留旧版。部署最新 `navigation-sync` 后，既有每日10:30任务会同时同步两种口径，无需新增计划。

区域页面测试使用 Node.js 与 `jsdom@26.1.0`：`npm install --no-save --package-lock=false --ignore-scripts jsdom@26.1.0`，然后运行 `node --test scripts/test-regional.mjs scripts/test-sync.mjs`；区域测试会读取本地 `private/reference-latest.json` 作为源数据样本。

## 云端每日同步

已在 Supabase 部署 `navigation-sync`，定时任务 `navigation-source-daily` 每天北京时间10:30读取原站公开索引。本机关闭不影响云端执行，仍依赖 Supabase 项目及参考网站正常运行。网页从受账号权限保护的快照读取数据，无需每天重新发布网页。页面显示来源数据时间和最近成功同步时间；两者不同表示检查过来源，但来源本身未更新。

同步以当前快照中的137条已核验型号为名单，只更新台套数、销售额、均价、年度台套数、主要省份和覆盖省份数。新增型号不自动归入农机导航，需核实类别和厂家后维护名单。厂家名称或来源结构变化、记录缺失、负数和时间倒退都会中止更新并记录错误，保留上次快照。

服务函数及测试位于 `supabase/functions/navigation-sync/` 和 `scripts/test-sync.mjs`。数据库配置在 `supabase/sync-schema.sql`、`supabase/sync-schedule.sql`；通过 Supabase 的 Cron 和 `nav_sync_runs` 表查看状态、暂停或恢复。调度令牌保存在 Vault，本机备份位于未提交的 `private/sync-token.txt`；仓库只保存令牌校验摘要，不保存令牌和服务密钥。

运行同步校验：`node --test scripts/test-sync.mjs`。当前部署已做接口实跑；页面的完整登录、地图和导出交互仍需浏览器验收。

## 停用账号

```powershell
python scripts/manage.py disable-user --user-id "用户 UUID"
```

## 上线验收

使用匿名请求访问 nav_snapshots 应被拒绝，已登录但 nav_members 无授权的账号应读不到快照。获准账号可以查询和导出，停用后刷新数据应被拒绝。需要连接实际项目后完成这些验证。
