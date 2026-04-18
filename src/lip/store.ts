// src/lib/store.ts
import { create } from 'zustand';
import type {
  Candle, OrderBook, Ticker, ActiveOrder, Trade,
  BotConfig, SessionStats, StrategySignal, StrategyId
} from '@/types';
import type { SigningWallet as PhantomWallet } from './orderExecutor';

interface LogEntry {
  id: string;
  time: number;
  type: 'info' | 'order' | 'warn' | 'error' | 'fill';
  msg: string;
}

interface AppState {
  // Wallet
  wallet: PhantomWallet | null;
  pubkey: string | null;
  connected: boolean;
  setWallet: (w: PhantomWallet, pk: string) => void;

  // Market data
  candles: Record<string, Candle[]>;
  orderBooks: Record<string, OrderBook>;
  tickers: Record<string, Ticker>;
  activePair: string;
  setActivePair: (p: string) => void;
  appendCandle: (symbol: string, c: Candle) => void;
  setOrderBook: (symbol: string, ob: OrderBook) => void;
  setTicker: (symbol: string, t: Ticker) => void;

  // Signals
  signals: Record<string, StrategySignal>;
  setSignal: (symbol: string, s: StrategySignal) => void;

  // Bot
  botRunning: boolean;
  config: BotConfig;
  setConfig: (cfg: Partial<BotConfig>) => void;
  toggleBot: () => void;

  // Orders & trades
  orders: ActiveOrder[];
  trades: Trade[];
  stats: SessionStats;
  addOrder: (o: ActiveOrder) => void;
  removeOrder: (id: string) => void;
  addTrade: (t: Trade) => void;

  // Logs
  logs: LogEntry[];
  addLog: (type: LogEntry['type'], msg: string) => void;
  clearLogs: () => void;

  // WS status
  wsConnected: boolean;
  setWsConnected: (v: boolean) => void;
}

export const useStore = create<AppState>((set, get) => ({
  // Wallet
  wallet: null,
  pubkey: null,
  connected: false,
  setWallet: (w, pk) => set({ wallet: w, pubkey: pk, connected: true }),

  // Market
  candles: {},
  orderBooks: {},
  tickers: {},
  activePair: 'BTC-USD',
  setActivePair: (p) => set({ activePair: p }),
  appendCandle: (symbol, c) =>
    set((s) => {
      const existing = s.candles[symbol] ?? [];
      // Update last candle if same timestamp, else append
      const last = existing[existing.length - 1];
      let updated: Candle[];
      if (last && last.time === c.time) {
        updated = [...existing.slice(0, -1), c];
      } else {
        updated = [...existing, c].slice(-300); // keep last 300
      }
      return { candles: { ...s.candles, [symbol]: updated } };
    }),
  setOrderBook: (symbol, ob) =>
    set((s) => ({ orderBooks: { ...s.orderBooks, [symbol]: ob } })),
  setTicker: (symbol, t) =>
    set((s) => ({ tickers: { ...s.tickers, [symbol]: t } })),

  // Signals
  signals: {},
  setSignal: (symbol, s) =>
    set((st) => ({ signals: { ...st.signals, [symbol]: s } })),

  // Bot
  botRunning: false,
  config: {
    pairs: ['BTC-USD', 'ETH-USD', 'SOL-USD'],
    orderSizeUSD: 50,
    maxOpenOrders: 5,
    intervalSec: 30,
    riskPct: 1.5,
    useSL: true,
    useTP: true,
    useBracket: true,
    forcedStrategy: 'auto',
    mode: 'paper',
  },
  setConfig: (cfg) =>
    set((s) => ({ config: { ...s.config, ...cfg } })),
  toggleBot: () => set((s) => ({ botRunning: !s.botRunning })),

  // Orders
  orders: [],
  trades: [],
  stats: { trades: 0, wins: 0, pnl: 0, activeOrders: 0 },
  addOrder: (o) =>
    set((s) => ({
      orders: [...s.orders, o],
      stats: { ...s.stats, activeOrders: s.stats.activeOrders + 1 },
    })),
  removeOrder: (id) =>
    set((s) => ({
      orders: s.orders.filter((o) => o.id !== id),
      stats: { ...s.stats, activeOrders: Math.max(0, s.stats.activeOrders - 1) },
    })),
  addTrade: (t) =>
    set((s) => {
      const wins = s.stats.wins + (t.pnl > 0 ? 1 : 0);
      return {
        trades: [t, ...s.trades].slice(0, 100),
        stats: {
          ...s.stats,
          trades: s.stats.trades + 1,
          wins,
          pnl: s.stats.pnl + t.pnl,
        },
      };
    }),

  // Logs
  logs: [],
  addLog: (type, msg) =>
    set((s) => ({
      logs: [
        { id: Math.random().toString(36).slice(2), time: Date.now(), type, msg },
        ...s.logs,
      ].slice(0, 200),
    })),
  clearLogs: () => set({ logs: [] }),

  // WS
  wsConnected: false,
  setWsConnected: (v) => set({ wsConnected: v }),
}));
