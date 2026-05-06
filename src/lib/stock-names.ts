// Static Chinese name mapping for common US stocks.
// Tencent/Finnhub give English names for US stocks;
// this map provides Chinese names for display purposes.
// New entries can be added as needed — the price-fetch cron
// will update the assets table when a match is found.

const US_STOCK_CN_NAMES: Record<string, string> = {
  // 半导体
  NVDA: "英伟达",
  AMD: "超威半导体",
  MU: "美光科技",
  INTC: "英特尔",
  TSM: "台积电",
  QCOM: "高通",
  AVGO: "博通",
  MRVL: "迈威尔科技",
  AMAT: "应用材料",
  LRCX: "拉姆研究",
  ASML: "阿斯麦",
  TXN: "德州仪器",
  ADI: "亚德诺半导体",

  // 互联网 / 科技
  GOOGL: "谷歌",
  META: "Meta",
  MSFT: "微软",
  AAPL: "苹果",
  AMZN: "亚马逊",
  NFLX: "奈飞",
  CRM: "赛富时",
  ADBE: "Adobe",
  ORCL: "甲骨文",
  CSCO: "思科",

  // 金融
  JPM: "摩根大通",
  BAC: "美国银行",
  GS: "高盛",
  MS: "摩根士丹利",
  C: "花旗集团",
  WFC: "富国银行",
  V: "Visa",
  MA: "万事达",
  AXP: "美国运通",

  // 消费 / 零售
  TSLA: "特斯拉",
  RIVN: "Rivian",
  LCID: "Lucid",
  COST: "好市多",
  WMT: "沃尔玛",
  TGT: "塔吉特",
  HD: "家得宝",
  MCD: "麦当劳",
  SBUX: "星巴克",
  NKE: "耐克",
  DIS: "迪士尼",

  // 医疗
  JNJ: "强生",
  PFE: "辉瑞",
  MRK: "默克",
  ABBV: "艾伯维",
  LLY: "礼来",
  UNH: "联合健康",
  ISRG: "直觉外科",

  // 工业 / 能源
  BA: "波音",
  CAT: "卡特彼勒",
  GE: "通用电气",
  RTX: "雷神技术",
  LMT: "洛克希德马丁",
  XOM: "埃克森美孚",
  CVX: "雪佛龙",
  COP: "康菲石油",
  OXY: "西方石油",

  // 杠杆 ETF
  TQQQ: "纳指三倍做多",
  SQQQ: "纳指三倍做空",
  SOXL: "半导体三倍做多",
  SOXS: "半导体三倍做空",
  UPRO: "标普三倍做多",
  SPXU: "标普三倍做空",
  TMF: "国债三倍做多",
  TMV: "国债三倍做空",
  UGL: "黄金两倍做多",
  GLD: "黄金ETF",
  USO: "美国石油基金",
  SPY: "标普500ETF",
  QQQ: "纳指100ETF",
  IWM: "罗素2000ETF",
  DIA: "道指ETF",
  VTI: "全市场ETF",

  // 其他
  CRCL: "Circle",
  MUU: "美光科技",
  SNXX: "嘉信理财货币基金",
  TSLL: "特斯拉两倍做多",
  AMDL: "AMD两倍做多",
  XE: "XE能源基金",
  MSFL: "微软两倍做多",
  DRAM: "DRAM半导体ETF",
};

export function getChineseName(symbol: string, market: string): string | null {
  if (market !== "US") return null; // HK/CN handled by Tencent API
  return US_STOCK_CN_NAMES[symbol.toUpperCase()] || null;
}
