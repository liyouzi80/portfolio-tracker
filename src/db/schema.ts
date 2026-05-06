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
  },
  (table) => [uniqueIndex("idx_assets_symbol_market").on(table.symbol, table.market)]
);

export const transactions = sqliteTable("transactions", {
  id: text("id").primaryKey(),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  assetId: text("asset_id")
    .notNull()
    .references(() => assets.id),
  type: text("type").notNull(), // buy, sell, dividend, split
  quantity: real("quantity").notNull(),
  price: real("price").notNull(),
  fee: real("fee").default(0),
  date: text("date").notNull(), // ISO date
  notes: text("notes"),
  txHash: text("tx_hash"), // SHA-256 dedup key: date|account|asset|type|qty|price|fee
  createdAt: text("created_at").notNull(),
});

export const alerts = sqliteTable("alerts", {
  id: text("id").primaryKey(),
  assetId: text("asset_id")
    .notNull()
    .references(() => assets.id),
  conditionType: text("condition_type").notNull(), // price_above, price_below, change_pct
  threshold: real("threshold").notNull(),
  enabled: integer("enabled").default(1),
  triggeredAt: text("triggered_at"),
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

export const exchangeRates = sqliteTable("exchange_rates", {
  fromCurrency: text("from_currency").notNull(),
  toCurrency: text("to_currency").notNull(),
  rate: real("rate").notNull(),
  updatedAt: text("updated_at").notNull(),
}, (table) => [
  primaryKey({ columns: [table.fromCurrency, table.toCurrency] }),
]);
