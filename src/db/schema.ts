import { integer, real, text, uniqueIndex, primaryKey } from "drizzle-orm/sqlite-core";
import { sqliteTable } from "drizzle-orm/sqlite-core";

export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  currency: text("currency").notNull(), // CNY, HKD, USD
  leverage: real("leverage").default(1),
  createdAt: text("created_at").notNull(),
});

export const assets = sqliteTable(
  "assets",
  {
    id: text("id").primaryKey(),
    symbol: text("symbol").notNull(),
    name: text("name"),
    market: text("market").notNull(), // US, HK, CN
    currency: text("currency").notNull(),
    assetType: text("asset_type").default("stock"), // stock, etf, crypto, fund
    lastPrice: real("last_price"),
    lastPrevClose: real("last_prev_close"),
    lastPriceUpdatedAt: text("last_price_updated_at"),
  },
  (table) => [uniqueIndex("idx_assets_symbol_market").on(table.symbol, table.market)]
);

export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  assetId: text("asset_id").references(() => assets.id),
  type: text("type").notNull(), // buy, sell, dividend, split, deposit, withdrawal
  quantity: real("quantity").notNull(),
  price: real("price").notNull(),
  fee: real("fee").default(0),
  date: text("date").notNull(), // ISO date
  notes: text("notes"),
  txHash: text("tx_hash"), // SHA-256 dedup key: date|account|asset|type|qty|price|fee
  createdAt: text("created_at").notNull(),
});

export const dailySnapshots = sqliteTable("daily_snapshots", {
  id: text("id").primaryKey(),
  date: text("date").notNull(), // ISO date YYYY-MM-DD
  accountId: text("account_id").notNull(),
  totalCost: real("total_cost").notNull(), // cost basis
  totalMarketValue: real("total_market_value").notNull(), // marked to market
  currency: text("currency").notNull(),
  rates: text("rates"), // JSON snapshot of exchange rates at capture time
  createdAt: text("created_at").notNull(),
});

export const cronRuns = sqliteTable("cron_runs", {
  id: text("id").primaryKey(),
  triggerType: text("trigger_type").notNull(),
  status: text("status").notNull(),
  succeeded: integer("succeeded").default(0),
  failed: integer("failed").default(0),
  durationMs: integer("duration_ms").default(0),
  errorMessage: text("error_message"),
  startedAt: text("started_at").notNull(),
});

export const exchangeRates = sqliteTable("exchange_rates", {
  fromCurrency: text("from_currency").notNull(),
  toCurrency: text("to_currency").notNull(),
  rate: real("rate").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.fromCurrency, table.toCurrency] }),
]);
