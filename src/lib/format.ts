// Financial-grade number formatting with strict decimal alignment.
// All monetary values displayed in the UI must use these formatters
// so that decimal points are vertically aligned in tables.

const MONETARY = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const MONETARY_COMPACT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

const QUANTITY = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 0,
  maximumFractionDigits: 4,
});

const PERCENT = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: "exceptZero",
});

/** Money: always 2 decimal places (e.g. "1,234.56") */
export function fmtMoney(n: number): string {
  return MONETARY.format(n);
}

/** Money compact: no decimals (e.g. "1,235") */
export function fmtMoneyCompact(n: number): string {
  return MONETARY_COMPACT.format(n);
}

/** Money with explicit sign (e.g. "+1,234.56" or "-1,234.56") */
export function fmtMoneySigned(n: number): string {
  if (n === 0) return MONETARY.format(0);
  return `${n > 0 ? "+" : ""}${MONETARY.format(n)}`;
}

/** Quantity: up to 4 decimal places, trailing zeros trimmed (e.g. "100", "0.5", "1.2345") */
export function fmtQuantity(n: number): string {
  return QUANTITY.format(n);
}

/** Percentage with sign (e.g. "+12.50%", "-3.21%") */
export function fmtPercent(n: number): string {
  return `${PERCENT.format(n)}%`;
}
