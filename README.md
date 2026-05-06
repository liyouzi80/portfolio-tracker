# Portfolio Tracker

跨市场、多币种、自托管的个人投资组合追踪工具。**单 Worker 部署**，全部数据在你自己的 Cloudflare 账户里，零月费可运行。

> 不是面向"被托管"的产品。这是给你自己用、并且必须看得见每一行代码、每一笔费用、每一次行情请求来源的工具。

---

## 它能做什么

**多市场行情**
美股、港股、A股、日股、韩股、英德法荷西意瑞加澳台印 —— 任何 Yahoo Finance 能查到代码的标的都能跟。优先级回退链：腾讯财经（A股、港股）→ 长桥（港股优先源，可选）→ Finnhub（美股，可选）→ Yahoo Finance（兜底，全市场）。

**真正算对的多币种盈亏**
持仓在持仓币种、账户在账户币种、组合总览按你选定的 base currency 折算。汇率每日自动更新，**写入 daily snapshot 时同步保存当日汇率**——半年后回看历史净值不会被汇率波动污染。

**已实现盈亏拆分**
区分**交易盈亏**（卖出价差）和**股息收入**——这两类的稳定性完全不同，合并显示等于看个寂寞。

**净值曲线 + 盈亏走势 + 持仓配置饼图**
不是基于"累计买入金额"的伪净值——是基于每日真实 mark-to-market 的 daily snapshot。前端用 TradingView Lightweight Charts 渲染。

**价格提醒**
设阈值，cron 每 30 分钟检查一次，触发后浏览器弹通知。前端 settings 区显示已触发态，未读数量在 tab 上显示橙色徽标。

**导入与备份**
CSV / Excel 批量导入交易记录，支持中英文表头、自动识别 A 股代码和港股代码、按 (symbol + market) 唯一去重。一键导出全部数据成 CSV 备份（含交易、账户、资产、快照、汇率、提醒）。

**端到端安全**
- WebAuthn Passkey + PRF 扩展实现免密登录（Touch ID / Face ID / Windows Hello）
- 主密码 PBKDF2-SHA256 200,000 次迭代（OWASP 2023 推荐值），登录时自动透明升级旧哈希
- JWT session、SameSite Cookie、HttpOnly
- 所有 API 走 middleware 鉴权（除登录路由和 cron 自鉴权路由）

**灾备容错**
- 价格 KV 缓存 24h TTL；缺失时回退到 D1 `assets.last_price`
- 缺汇率时跳过该持仓而不是归零
- 行情源失败时按链路降级，不让单个 API 故障搞垮整个 dashboard

---

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Next.js 14 App Router |
| 部署 | Cloudflare Workers via [@opennextjs/cloudflare](https://github.com/opennextjs/opennextjs-cloudflare) |
| 数据库 | Cloudflare D1（SQLite at edge）+ Drizzle ORM |
| 缓存 | Cloudflare KV（价格 24h TTL） |
| UI | shadcn/ui + Tailwind CSS v3 |
| 图表 | TradingView Lightweight Charts |
| 认证 | WebAuthn PRF + PBKDF2-SHA256 + JWT (jose) |
| 行情源 | 腾讯财经 / 长桥 OpenAPI / Finnhub / Yahoo Finance |
| 调度 | GitHub Actions cron（每 30 分钟抓价 / 每天拍 snapshot / 每天更新汇率） |
| CI/CD | GitHub Actions（push master → 自动部署 Worker） |

---

## 部署指南

### 前置条件

- [Cloudflare 账号](https://dash.cloudflare.com/sign-up)（Workers 免费计划够用）
- 一个 GitHub 账号
- Node.js 22+（本地开发用，部署不需要）
- `npm i -g wrangler`（首次创建资源用，部署后 GitHub Actions 接管）

---

### 第 1 步：Fork 本仓库

点右上角 Fork，让 GitHub Actions 在**你自己的仓库**上跑。

---

### 第 2 步：创建 Cloudflare 资源

```bash
wrangler login
wrangler d1 create portfolio-db
# 记下输出的 database_id

wrangler kv namespace create PRICE_CACHE
# 记下输出的 id
```

把这两个 ID 填进 `wrangler.toml`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "portfolio-db"
database_id = "你的-d1-database-id"

[[kv_namespaces]]
binding = "PRICE_CACHE"
id = "你的-kv-namespace-id"
```

提交这次改动到你 fork 的仓库（首次 push 不会跑 Actions，因为 secrets 还没配）。

---

### 第 3 步：配置 GitHub Secrets

仓库 → Settings → Secrets and variables → Actions，新增：

| Secret | 必须 | 用途 |
|---|---|---|
| `CF_ACCOUNT_ID` | ✅ | Cloudflare 控制台右侧 Account ID |
| `CF_API_TOKEN` | ✅ | [创建](https://dash.cloudflare.com/profile/api-tokens) → 模板「Edit Cloudflare Workers」 |
| `JWT_SECRET` | ✅ | session 签名。`openssl rand -hex 32` 生成 |
| `CRON_SECRET` | ✅ | cron 接口鉴权。`openssl rand -hex 32` 生成 |
| `WORKER_HOST` | ✅ | 你的 Worker 域名（**不带** `https://`），如 `portfolio.yourdomain.com` 或 `portfolio-tracker.your-account.workers.dev` |
| `FINNHUB_API_KEY` | 可选 | [Finnhub](https://finnhub.io/) 免费注册即得，仅用于美股价格备份源（60 req/min） |
| `LONGBRIDGE_APP_KEY` | 可选 | [长桥开放平台](https://open.longportapp.com/)，港股优先源 |
| `LONGBRIDGE_APP_SECRET` | 可选 | 同上 |
| `LONGBRIDGE_ACCESS_TOKEN` | 可选 | 同上 |

**关于行情源**：什么都不配也能跑——会全部走 Yahoo Finance + 腾讯财经免费源。配 Finnhub 后美股有更稳定的源 + 含 prevClose（影响"今日盈亏"计算）。配长桥后港股优先走它，速度更快。

---

### 第 4 步：推送触发部署

任意推送到 master：

```bash
git commit --allow-empty -m "trigger deploy"
git push origin master
```

`.github/workflows/deploy.yml` 会自动构建 + 部署 + 注入 secrets。等 Actions 跑完后访问 Worker 域名。

---

### 第 5 步：首次访问初始化

第一次访问 `https://你的 worker 域名`，会引导你**设置主密码**（≥ 8 位、不可纯数字）。设置完后：

1. 进入 **设置 → 账户管理**，添加你的第一个账户（名称、币种、杠杆系数）
2. 进入 **设置 → 安全设置**，注册 Passkey（强烈推荐，下次免密登录）
3. 进入 **交易记录** 添加第一笔交易，或导入 CSV

---

### 第 6 步：seed 一次行情数据（首次部署必须）

刚部署时 KV 缓存、汇率表、daily snapshot 表都是空的。手动跑一次 cron workflow：

仓库 → Actions → Cron Jobs → Run workflow → job 选 `all` → Run。

之后会按以下时间表自动跑：

- **每 30 分钟**：抓价格 + 检查所有提醒
- **每天 06:30 UTC**：更新 12 种货币的两两汇率
- **每天 08:00 UTC**：拍 daily snapshot（净值曲线和盈亏走势的数据来源）

---

## 本地开发

```bash
npm install --legacy-peer-deps
npm run dev        # Next.js dev server（无 D1/KV）
npx wrangler dev   # 含 D1/KV 的完整本地环境（更接近生产）
```

---

## 数据结构

| 表 | 说明 |
|---|---|
| `accounts` | 账户：名称、币种、杠杆系数 |
| `assets` | 标的：代码、市场、币种、`last_price` 容灾兜底 |
| `transactions` | 交易：买/卖/分红，含 `tx_hash` 防重复导入 |
| `alerts` | 价格提醒：阈值、启用状态、`triggered_at` |
| `daily_snapshots` | 每日组合快照：成本、市值、当日汇率 JSON |
| `exchange_rates` | 货币两两汇率（每天 06:30 UTC 更新） |
| `auth` | 主密码哈希、Passkey PRF 哈希、配置 |

---

## 行情源覆盖

| 市场 | 主源 | 备源 |
|---|---|---|
| A 股 | 腾讯财经 | Yahoo Finance |
| 港股 | 长桥（如配置）→ 腾讯财经 | Yahoo Finance |
| 美股 | Finnhub（如配置） | Yahoo Finance |
| 日韩英德法荷西意瑞加澳台印 | Yahoo Finance | — |

腾讯财经美股端点会被 Cloudflare Workers 出口拦截，所以美股不走腾讯。其他市场通过 Yahoo Finance 后缀（`.T`/`.HK`/`.SS` 等）覆盖。

---

## 安全性说明

**密码**
- PBKDF2-SHA256 200,000 次迭代，存储格式 `${iterations}:${base64(salt)}`，可平滑升级
- 强制 ≥ 8 位、不可纯数字
- 旧 1k 迭代格式登录成功后自动升级

**Passkey**
- 走 WebAuthn PRF 扩展，本地派生对称密钥
- 服务端只存派生密钥的 SHA-256 哈希，无法反推
- 支持 Touch ID / Face ID / Windows Hello / YubiKey

**Session**
- JWT (HS256)，7 天过期
- HttpOnly + Secure + SameSite=Lax cookie

**API 鉴权**
- 全部 `/api/*` 路径走 middleware 鉴权（除 `/api/auth`、`/api/bg`、`/api/cron`）
- `/api/cron` 走 `?secret=` query string 鉴权（CRON_SECRET）

---

## 常见问题

**部署后日股 / 韩股 / 欧股价格不显示**
等下一次 cron `price-fetch` 跑完（每 30 分钟一次），KV 缓存会被填充。或手动 Run workflow → price-fetch。

**净值曲线 / 盈亏走势是空白的**
需要至少一天的 daily snapshot 数据。第一次部署后手动 Run workflow → snapshot 立即拍一次，之后每天 08:00 UTC 自动累积。

**今日盈亏卡显示"等待行情数据"**
没有持仓的 `prevClose` 字段。原因可能是：(1) KV 缓存还没更新（手动跑一次 price-fetch），(2) 行情源没返回 prevClose（部分行情源对部分市场不返回，这是正常的，会随源切换自动恢复）。

**部署后 API 返回 500 / Internal Server Error**
- 检查 `wrangler.toml` 的 `database_id` 和 KV `id` 是否正确
- `JWT_SECRET` 未设置 → API 会因 secret key 缺失全部 500
- `wrangler tail` 看实时日志

**`npm ci` 在 GitHub Actions 报 `Invalid Version`**
删 `package-lock.json` 重新 `npm install --legacy-peer-deps`，提交新的 lock。

---

## 项目结构

```
src/
├── app/
│   ├── api/
│   │   ├── auth/          # 登录、Passkey 注册、设置
│   │   ├── accounts/      # 账户 CRUD（含级联删除）
│   │   ├── transactions/  # 交易 CRUD + CSV 导入
│   │   ├── portfolio/     # 组合总览（最复杂的一个，含盈亏计算）
│   │   ├── price/         # 单个标的价格查询
│   │   ├── search/        # Yahoo + 本地资产联合搜索
│   │   ├── alerts/        # 价格提醒 CRUD
│   │   ├── rates/         # 汇率查询
│   │   ├── export/        # 全量数据 CSV 导出
│   │   ├── bg/            # Bing 每日壁纸（登录页）
│   │   └── cron/          # 调度任务（price-fetch / snapshot / rates-fetch）
│   ├── layout.tsx
│   └── page.tsx
├── components/            # React 组件，shadcn/ui 为底
├── db/                    # Drizzle schema
├── lib/
│   ├── auth.ts            # PBKDF2 + JWT
│   ├── price.ts           # 4 个行情源的统一封装
│   ├── format.ts          # 财务级格式化
│   └── stock-names.ts     # 美股代码 → 中文名映射
├── middleware.ts          # API 路径鉴权
└── types/
    └── cloudflare.d.ts    # D1 / KV 类型补丁
```

---

## License

MIT

---

## 致谢

- [shadcn/ui](https://ui.shadcn.com/) — 组件系统
- [TradingView Lightweight Charts](https://www.tradingview.com/lightweight-charts/) — 金融级图表（Apache-2.0）
- [Drizzle ORM](https://orm.drizzle.team/) — 类型安全的 D1 ORM
- [腾讯财经免费行情接口](http://qt.gtimg.cn/)、[Yahoo Finance](https://finance.yahoo.com/) — 公益数据源
