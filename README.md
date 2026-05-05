# Portfolio Tracker

个人投资组合追踪工具，部署在 Cloudflare Workers 上。

## 功能

- **持仓管理**：多账户、多市场（美股/港股/A股）、多币种
- **交易记录**：买入/卖出/股息，CSV/Excel 批量导入
- **实时行情**：长桥 API（主）+ Yahoo Finance（备）
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

## 本地开发

```bash
npm install --legacy-peer-deps
npm run dev        # Next.js dev server
npx wrangler dev   # 含 D1/KV 的完整本地环境
```

## 部署

```bash
npx @opennextjs/cloudflare build
npx wrangler deploy
```

或推送到 `master` 分支，GitHub Actions 自动构建部署。

## 环境变量

| 变量 | 说明 |
|---|---|
| `JWT_SECRET` | JWT 签名密钥 |
| `LONGBRIDGE_APP_KEY` | 长桥 OpenAPI Key |
| `LONGBRIDGE_APP_SECRET` | 长桥 OpenAPI Secret |

## 数据结构

- `accounts` — 账户（名称、币种、杠杆率）
- `assets` — 标的（代码、市场、类型）
- `transactions` — 交易记录（买卖、分红）
- `alerts` — 价格提醒
- `exchange_rates` — 汇率
- `auth` — 认证数据（密码哈希、Passkey PRF 哈希）

## License

MIT
