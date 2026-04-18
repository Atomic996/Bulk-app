// src/engine/indicators.ts
// Pure technical analysis — no AI, real calculations

export function calcEMA(prices: number[], period: number): number[] {
  if (prices.length === 0) return [];
  const k = 2 / (period + 1);
  const result: number[] = [prices[0]];
  for (let i = 1; i < prices.length; i++) {
    result.push(prices[i] * k + result[i - 1] * (1 - k));
  }
  return result;
}

export function calcSMA(prices: number[], period: number): number[] {
  const result: number[] = [];
  for (let i = 0; i < prices.length; i++) {
    if (i < period - 1) { result.push(NaN); continue; }
    const slice = prices.slice(i - period + 1, i + 1);
    result.push(slice.reduce((a, b) => a + b, 0) / period);
  }
  return result;
}

export function calcRSI(prices: number[], period = 14): number {
  if (prices.length < period + 1) return 50;
  let gains = 0, losses = 0;
  for (let i = prices.length - period; i < prices.length; i++) {
    const d = prices[i] - prices[i - 1];
    if (d > 0) gains += d; else losses += Math.abs(d);
  }
  const avgGain = gains / period;
  const avgLoss = losses / period || 0.0001;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

export function calcBollingerBands(
  prices: number[],
  period = 20,
  mult = 2
): { upper: number; mid: number; lower: number } {
  if (prices.length < period) {
    const p = prices[prices.length - 1] || 0;
    return { upper: p * 1.02, mid: p, lower: p * 0.98 };
  }
  const slice = prices.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const variance = slice.reduce((a, b) => a + (b - mean) ** 2, 0) / period;
  const std = Math.sqrt(variance);
  return { upper: mean + mult * std, mid: mean, lower: mean - mult * std };
}

export function calcATR(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14
): number {
  if (highs.length < 2) return 0;
  const trs: number[] = [];
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trs.push(tr);
  }
  const slice = trs.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / slice.length;
}

export function calcMACD(
  prices: number[],
  fastPeriod = 12,
  slowPeriod = 26,
  signalPeriod = 9
): { macd: number; signal: number; histogram: number } {
  if (prices.length < slowPeriod) return { macd: 0, signal: 0, histogram: 0 };
  const fastEMA = calcEMA(prices, fastPeriod);
  const slowEMA = calcEMA(prices, slowPeriod);
  const macdLine = fastEMA.map((v, i) => v - slowEMA[i]);
  const signalEMA = calcEMA(macdLine.slice(-signalPeriod * 3), signalPeriod);
  const macd = macdLine[macdLine.length - 1];
  const signal = signalEMA[signalEMA.length - 1];
  return { macd, signal, histogram: macd - signal };
}

export function calcVWAP(
  candles: { high: number; low: number; close: number; volume: number }[]
): number {
  if (candles.length === 0) return 0;
  let totalTP = 0, totalVol = 0;
  for (const c of candles) {
    const tp = (c.high + c.low + c.close) / 3;
    totalTP += tp * c.volume;
    totalVol += c.volume;
  }
  return totalVol > 0 ? totalTP / totalVol : 0;
}

export function calcADX(
  highs: number[],
  lows: number[],
  closes: number[],
  period = 14
): number {
  if (highs.length < period * 2) return 25;
  const trueRanges: number[] = [];
  const plusDM: number[] = [];
  const minusDM: number[] = [];

  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trueRanges.push(tr);
    const upMove = highs[i] - highs[i - 1];
    const downMove = lows[i - 1] - lows[i];
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  const smoothTR = trueRanges.slice(-period).reduce((a, b) => a + b, 0);
  const smoothPlus = plusDM.slice(-period).reduce((a, b) => a + b, 0);
  const smoothMinus = minusDM.slice(-period).reduce((a, b) => a + b, 0);

  const plusDI = smoothTR > 0 ? (smoothPlus / smoothTR) * 100 : 0;
  const minusDI = smoothTR > 0 ? (smoothMinus / smoothTR) * 100 : 0;
  const diDiff = Math.abs(plusDI - minusDI);
  const diSum = plusDI + minusDI || 0.0001;
  return (diDiff / diSum) * 100;
}

export function stdDev(arr: number[]): number {
  if (arr.length === 0) return 0;
  const m = arr.reduce((a, b) => a + b, 0) / arr.length;
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
}
