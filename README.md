# Portfolio Tracker

个人投资组合追踪工具，部署在 Cloudflare Workers 上。

## 功能

- **持仓管理**：多账户、多市场（美股/港股/A股）、多币种
- **交易记录**：买入/卖出/股息，CSV/Excel 批量导入
- **实时行情**：长桥 API（主）+ Yahoo Finance（备用，免费无需配置）
- **可视化**：净值曲线、盈亏走势、资产配置饼图
- **价格提醒**：自定义价格阈值提醒
- **安全登录**：Bing 每日壁纸背景 + Passkey（Touch ID/Face ID）+ 密码

## 技术栈

| 层 | 技术 |
|---|---|
| 框架 | Next.js 16（App Router + Edge Runtime） |
| UI | shadcn/ui + Tailwind CSS v3 |
| 图表 | Recharts |
| 数据库 | Cloudflare D1（SQLite） |
| 缓存 | Cloudflare KV |
| 认证 | WebAuthn PRF + PBKDF2 + JWT |
| 部署 | Cloudflare Workers + OpenNext |
| CI/CD | GitHub Actions（push → 自动部署） |

---

## 部署指南（Fork 后自行部署）

### 前置条件

- [Cloudflare 账号](https://dash.cloudflare.com/sign-up)（免费计划即可）
- Node.js 18+
- [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)：`npm i -g wrangler`

---

### 第一步：创建 Cloudflare 资源

登录 Wrangler：
```bash
wrangler login
```

创建 **D1 数据库**（存储交易记录、账户等所有数据）：
```bash
wrangler d1 create portfolio-db
# 输出示例：
# database_id = "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
```

创建 **KV 命名空间**（价格缓存）：
```bash
wrangler kv namespace create PRICE_CACHE
# 输出示例：
# id = "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
```

---

### 第二步：更新 wrangler.toml

将上一步得到的 ID 填入 `wrangler.toml`：

```toml
[[d1_databases]]
binding = "DB"
database_name = "portfolio-db"
database_id = "你的-d1-database-id"   # ← 替换这里

[[kv_namespaces]]
binding = "PRICE_CACHE"
id = "你的-kv-namespace-id"            # ← 替换这里
```

---

### 第三步：设置 GitHub Secrets

进入你的 GitHub 仓库 → **Settings → Secrets and variables → Actions**，添加以下 secrets：

| Secret 名称 | 如何获取 | 必须 |
|---|---|---|
| `CF_ACCOUNT_ID` | Cloudflare 控制台右侧边栏 → Account ID | ✅ 必须 |
| `CF_API_TOKEN` | [创建 API Token](https://dash.cloudflare.com/profile/api-tokens)，选模板 **Edit Cloudflare Workers** | ✅ 必须 |
| `JWT_SECRET` | 随机字符串，如 `openssl rand -hex 32` 生成 | 推荐（不填则每次重启后 session 失效） |
| `LONGBRIDGE_APP_KEY` | [长桥开放平台](https://open.longportapp.com/) | 可选（不填则使用 Yahoo Finance） |
| `LONGBRIDGE_APP_SECRET` | 同上 | 可选 |
| `LONGBRIDGE_ACCESS_TOKEN` | 同上 | 可选 |

> **长桥凭证说明**：不配置时自动降级使用 Yahoo Finance 免费获取美股/港股行情，A 股行情需要长桥。

---

### 第四步：推送触发部署

```bash
git push origin master
```

GitHub Actions 会自动构建并部署到 Cloudflare Workers。部署完成后，访问你的 Workers 域名（`*.workers.dev`）或自定义域名。

---

### 第五步：首次登录设置

首次访问会提示**设置主密码**，设置后可在「设置 → 安全设置」注册 Passkey（Touch ID / Face ID）以后快速免密登录。

---

### 手动部署（不用 GitHub Actions）

```bash
npm install --legacy-peer-deps
npx @opennextjs/cloudflare build
wrangler deploy

# 设置 Worker 环境变量（可选）
wrangler secret put JWT_SECRET
wrangler secret put LONGBRIDGE_APP_KEY
wrangler secret put LONGBRIDGE_APP_SECRET
wrangler secret put LONGBRIDGE_ACCESS_TOKEN
```

---

### 本地开发

```bash
npm install --legacy-peer-deps
npm run dev        # Next.js dev server（无 D1/KV）
npx wrangler dev   # 含 D1/KV 的完整本地环境
```

> **注意**：`npm run dev` 使用 `next dev`，本地无 Cloudflare D1/KV。如需完整本地环境，使用 `npx wrangler dev`。

---

### 常见问题

**CI build 失败 `Type error: Cannot find name 'lbKey'`**

长桥凭证通过 GitHub Secrets 注入 Worker，不再在客户端填写。如果在 `settings-tab.tsx` 中看到此错误，检查是否引用了已移除的 `lbKey`/`lbSecret`/`lbAccessToken` 变量。

**部署后 API 返回 500 / Internal Server Error**

常见原因：
1. D1 数据库未正确绑定 — 检查 `wrangler.toml` 中 `database_id` 是否正确
2. `JWT_SECRET` 未设置或为空 — 检查 GitHub Actions Secrets
3. 查看 Worker 日志：`wrangler tail`

**`npm ci` 报 `Invalid Version`**

`package-lock.json` 中可能缺少 `version` 字段。执行 `rm -rf node_modules package-lock.json && npm install --legacy-peer-deps` 重新生成。

---

## 数据结构

| 表 | 说明 |
|---|---|
| `accounts` | 账户（名称、币种、杠杆率） |
| `assets` | 标的（代码、市场、类型） |
| `transactions` | 交易记录（买卖、分红） |
| `alerts` | 价格提醒 |
| `exchange_rates` | 汇率 |
| `auth` | 认证数据（密码哈希、Passkey PRF 哈希） |

## License

MIT
