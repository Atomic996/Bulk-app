// src/types/index.ts

export interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface OrderBook {
  bids: [number, number][]; // [price, size]
  asks: [number, number][];
}

export interface Ticker {
  symbol: string;
  price: number;
  change24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
}

export type OrderSide = 'buy' | 'sell';
export type OrderType = 'limit' | 'market';
export type TIF = 'GTC' | 'IOC' | 'ALO';
export type StrategyId = 'grid' | 'mm' | 'momentum' | 'reversion';

export interface StrategySignal {
  side: OrderSide | 'hold';
  confidence: number;         // 0–100
  strategyId: StrategyId;
  reason: string;
  indicators: {
    rsi: number;
    ema9: number;
    ema21: number;
    bbUpper: number;
    bbLower: number;
    bbMid: number;
    atr: number;
    macdLine: number;
    signalLine: number;
    vwap: number;
    adx: number;
  };
  strategyScores: Record<StrategyId, number>;
}

export interface ActiveOrder {
  id: string;
  clientId: string;
  symbol: string;
  side: OrderSide;
  price: number;
  size: number;
  strategyId: StrategyId;
  createdAt: number;
  slPrice?: number;
  tpPrice?: number;
}

export interface Trade {
  id: string;
  symbol: string;
  side: OrderSide;
  price: number;
  size: number;
  pnl: number;
  strategyId: StrategyId;
  closedAt: number;
}

export interface BotConfig {
  pairs: string[];
  orderSizeUSD: number;
  maxOpenOrders: number;
  intervalSec: number;
  riskPct: number;
  useSL: boolean;
  useTP: boolean;
  useBracket: boolean;
  forcedStrategy: StrategyId | 'auto';
  mode: 'live' | 'paper';
}

export interface SessionStats {
  trades: number;
  wins: number;
  pnl: number;
  activeOrders: number;
}
