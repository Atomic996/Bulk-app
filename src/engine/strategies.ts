// src/engine/strategies.ts
// Pure technical strategy engine — signal from real market data only

import type { Candle, StrategySignal, StrategyId } from '@/types';
import {
  calcEMA,
  calcRSI,
  calcBollingerBands,
  calcATR,
  calcMACD,
  calcVWAP,
  calcADX,
  stdDev,
} from './indicators';

// ─── GRID STRATEGY ──────────────────────────────────────────────────────────
// Detects ranging market via low ADX + low volatility
// Buys below VWAP, sells above VWAP
function gridSignal(
  closes: number[],
  highs: number[],
  lows: number[],
  candles: Candle[]
): { side: 'buy' | 'sell' | 'hold'; confidence: number; reason: string } {
  const price = closes[closes.length - 1];
  const adx = calcADX(highs, lows, closes, 14);
  const atr = calcATR(highs, lows, closes, 14);
  const vwap = calcVWAP(candles.slice(-50));
  const vol = (stdDev(closes.slice(-20)) / price) * 100;

  // Grid works best in low-trend, low-vol conditions
  if (adx > 30) return { side: 'hold', confidence: 20, reason: `ADX ${adx.toFixed(1)} too high for grid` };

  const gridScore = Math.max(0, 100 - adx * 2 - vol * 10);

  const devFromVwap = (price - vwap) / vwap * 100;
  let side: 'buy' | 'sell' | 'hold' = 'hold';
  if (devFromVwap < -0.3) side = 'buy';
  else if (devFromVwap > 0.3) side = 'sell';

  return {
    side,
    confidence: side !== 'hold' ? Math.min(gridScore, 90) : gridScore * 0.5,
    reason: `ADX ${adx.toFixed(1)}, VWAP dev ${devFromVwap.toFixed(2)}%, vol ${vol.toFixed(2)}%`,
  };
}

// ─── MARKET MAKING STRATEGY ─────────────────────────────────────────────────
// Very low volatility + tight spreads — continuously quotes both sides
function mmSignal(
  closes: number[],
  highs: number[],
  lows: number[],
  candles: Candle[]
): { side: 'buy' | 'sell' | 'hold'; confidence: number; reason: string } {
  const price = closes[closes.length - 1];
  const atr = calcATR(highs, lows, closes, 14);
  const vol = (atr / price) * 100;
  const adx = calcADX(highs, lows, closes, 14);

  if (vol > 0.8 || adx > 25) {
    return { side: 'hold', confidence: 15, reason: `Vol ${vol.toFixed(3)}% too high for MM` };
  }

  const score = Math.max(0, 90 - vol * 40 - adx * 1.5);
  // MM quotes both sides — alternate based on recent momentum
  const recentClose = closes.slice(-3);
  const momentum = recentClose[2] - recentClose[0];
  const side: 'buy' | 'sell' = momentum <= 0 ? 'buy' : 'sell';

  return {
    side,
    confidence: score,
    reason: `MM mode: vol ${vol.toFixed(3)}%, ADX ${adx.toFixed(1)}`,
  };
}

// ─── MOMENTUM STRATEGY ──────────────────────────────────────────────────────
// EMA crossover + MACD confirmation + ADX trend strength
function momentumSignal(
  closes: number[]
): { side: 'buy' | 'sell' | 'hold'; confidence: number; reason: string } {
  if (closes.length < 30) return { side: 'hold', confidence: 0, reason: 'Not enough data' };

  const ema9 = calcEMA(closes, 9);
  const ema21 = calcEMA(closes, 21);
  const { macd, signal: sig, histogram } = calcMACD(closes);

  const crossNow = ema9[ema9.length - 1] - ema21[ema21.length - 1];
  const crossPrev = ema9[ema9.length - 2] - ema21[ema21.length - 2];
  const crossed = (crossNow > 0 && crossPrev <= 0) || (crossNow < 0 && crossPrev >= 0);
  const crossStrength = Math.abs(crossNow) / closes[closes.length - 1] * 1000;

  // Require MACD confirmation
  const macdBull = macd > sig && histogram > 0;
  const macdBear = macd < sig && histogram < 0;

  let side: 'buy' | 'sell' | 'hold' = 'hold';
  let confidence = 0;

  if (crossNow > 0 && macdBull) {
    side = 'buy';
    confidence = Math.min(40 + crossStrength * 10 + (crossed ? 20 : 0), 92);
  } else if (crossNow < 0 && macdBear) {
    side = 'sell';
    confidence = Math.min(40 + crossStrength * 10 + (crossed ? 20 : 0), 92);
  } else if (Math.abs(crossStrength) > 0.5) {
    side = crossNow > 0 ? 'buy' : 'sell';
    confidence = Math.min(25 + crossStrength * 8, 60);
  }

  return {
    side,
    confidence,
    reason: `EMA9 ${crossNow > 0 ? '>' : '<'} EMA21, MACD ${histogram > 0 ? 'bull' : 'bear'}, cross ${crossStrength.toFixed(2)}σ`,
  };
}

// ─── MEAN REVERSION STRATEGY ────────────────────────────────────────────────
// RSI extremes + Bollinger Band deviation
function reversionSignal(
  closes: number[]
): { side: 'buy' | 'sell' | 'hold'; confidence: number; reason: string } {
  const rsi = calcRSI(closes, 14);
  const { upper, lower, mid } = calcBollingerBands(closes, 20, 2);
  const price = closes[closes.length - 1];

  const bbPct = (price - lower) / (upper - lower); // 0 = at lower, 1 = at upper
  const bbDevLower = (price - lower) / lower * 100;
  const bbDevUpper = (upper - price) / upper * 100;

  let side: 'buy' | 'sell' | 'hold' = 'hold';
  let confidence = 0;

  // Strong oversold: RSI < 30 AND price below lower BB
  if (rsi < 30 && price < lower) {
    side = 'buy';
    confidence = Math.min(40 + (30 - rsi) * 1.5 + Math.abs(bbDevLower) * 2, 92);
  }
  // Strong overbought: RSI > 70 AND price above upper BB
  else if (rsi > 70 && price > upper) {
    side = 'sell';
    confidence = Math.min(40 + (rsi - 70) * 1.5 + Math.abs(bbDevUpper) * 2, 92);
  }
  // Moderate oversold
  else if (rsi < 40 && bbPct < 0.2) {
    side = 'buy';
    confidence = Math.min(30 + (40 - rsi) * 1, 65);
  }
  // Moderate overbought
  else if (rsi > 60 && bbPct > 0.8) {
    side = 'sell';
    confidence = Math.min(30 + (rsi - 60) * 1, 65);
  }

  return {
    side,
    confidence,
    reason: `RSI ${rsi.toFixed(1)}, BB% ${(bbPct * 100).toFixed(1)}%`,
  };
}

// ─── MASTER SIGNAL COMBINER ─────────────────────────────────────────────────
export function analyzeMarket(candles: Candle[]): StrategySignal {
  if (candles.length < 30) {
    return {
      side: 'hold',
      confidence: 0,
      strategyId: 'grid',
      reason: 'Collecting data...',
      indicators: {
        rsi: 50, ema9: 0, ema21: 0,
        bbUpper: 0, bbLower: 0, bbMid: 0,
        atr: 0, macdLine: 0, signalLine: 0,
        vwap: 0, adx: 0,
      },
      strategyScores: { grid: 0, mm: 0, momentum: 0, reversion: 0 },
    };
  }

  const closes = candles.map((c) => c.close);
  const highs  = candles.map((c) => c.high);
  const lows   = candles.map((c) => c.low);

  // Compute all indicators
  const rsi     = calcRSI(closes, 14);
  const ema9Arr = calcEMA(closes, 9);
  const ema21Arr= calcEMA(closes, 21);
  const bb      = calcBollingerBands(closes, 20, 2);
  const atr     = calcATR(highs, lows, closes, 14);
  const { macd, signal: sig } = calcMACD(closes);
  const vwap    = calcVWAP(candles.slice(-50));
  const adx     = calcADX(highs, lows, closes, 14);

  // Run all strategies
  const grid      = gridSignal(closes, highs, lows, candles);
  const mm        = mmSignal(closes, highs, lows, candles);
  const momentum  = momentumSignal(closes);
  const reversion = reversionSignal(closes);

  const strategyScores: Record<StrategyId, number> = {
    grid:      grid.confidence,
    mm:        mm.confidence,
    momentum:  momentum.confidence,
    reversion: reversion.confidence,
  };

  // Pick best strategy
  const best = (Object.entries(strategyScores) as [StrategyId, number][])
    .sort((a, b) => b[1] - a[1])[0];

  const bestId = best[0] as StrategyId;
  const signals: Record<StrategyId, typeof grid> = { grid, mm, momentum, reversion };
  const winner = signals[bestId];

  return {
    side: winner.side,
    confidence: winner.confidence,
    strategyId: bestId,
    reason: `[${bestId.toUpperCase()}] ${winner.reason}`,
    indicators: {
      rsi,
      ema9:  ema9Arr[ema9Arr.length - 1],
      ema21: ema21Arr[ema21Arr.length - 1],
      bbUpper: bb.upper,
      bbLower: bb.lower,
      bbMid:   bb.mid,
      atr,
      macdLine:   macd,
      signalLine: sig,
      vwap,
      adx,
    },
    strategyScores,
  };
}
