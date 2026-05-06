export async function ensureNotificationPermission(): Promise<boolean> {
  if (!("Notification" in window)) return false;
  if (Notification.permission === "granted") return true;
  if (Notification.permission === "denied") return false;
  const result = await Notification.requestPermission();
  return result === "granted";
}

export function notifyAlert(symbol: string, condition: string, threshold: number, currentPrice?: number) {
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const condText = condition === "price_above" ? "高于" : "低于";
  new Notification(`${symbol} 价格${condText} ${threshold}`, {
    body: currentPrice ? `当前价 ${currentPrice}` : "已触发提醒",
    tag: `alert-${symbol}-${condition}-${threshold}`,
    icon: "/favicon.svg",
  });
}
