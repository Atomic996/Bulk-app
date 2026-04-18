// src/hooks/useMarketData.ts
import { useEffect, useRef } from 'react';
import { useStore } from '@/lib/store';
import { BulkWebSocket, fetchCandles, fetchTicker, fetchOrderBook } from '@/lib/bulkClient';

const ALL_PAIRS = ['BTC-USD', 'ETH-USD', 'SOL-USD', 'BNB-USD', 'AVAX-USD', 'ARB-USD'];
const BASE: Record<string, number> = { 'BTC-USD':83000,'ETH-USD':2000,'SOL-USD':130,'BNB-USD':590,'AVAX-USD':22,'ARB-USD':0.75 };
const VOLS: Record<string, number> = { 'BTC-USD':0.001,'ETH-USD':0.0013,'SOL-USD':0.0018,'BNB-USD':0.0012,'AVAX-USD':0.002,'ARB-USD':0.003 };
const tickTimers: Record<string, ReturnType<typeof setInterval>> = {};

function seedFallback(symbol: string) {
  const base = BASE[symbol] ?? 100;
  const vol  = VOLS[symbol] ?? 0.001;
  let price  = base;
  const now  = Math.floor(Date.now() / 1000);
  for (let i = 200; i >= 0; i--) {
    price = price * (1 + (Math.random() - 0.498) * vol);
    const sp = price * 0.0002;
    useStore.getState().appendCandle(symbol, {
      time: now - i * 60, open: price, high: price + sp * Math.random() * 2,
      low:  price - sp * Math.random() * 2, close: price + (Math.random() - 0.5) * sp, volume: Math.random() * 80 + 5,
    });
  }
  useStore.getState().setTicker(symbol, { symbol, price, change24h: 0, volume24h: 0, high24h: price * 1.02, low24h: price * 0.98 });
  // Live ticks every 2s
  if (tickTimers[symbol]) clearInterval(tickTimers[symbol]);
  tickTimers[symbol] = setInterval(() => {
    const { candles, tickers } = useStore.getState();
    const last = candles[symbol]?.at(-1);
    if (!last) return;
    const v = VOLS[symbol] ?? 0.001;
    const c = last.close * (1 + (Math.random() - 0.498) * v);
    const t = Math.floor(Date.now() / 1000);
    const minT = t - (t % 60);
    useStore.getState().appendCandle(symbol, { time: minT, open: last.close, high: Math.max(last.close, c), low: Math.min(last.close, c), close: c, volume: last.volume + Math.random() * 2 });
    const old = tickers[symbol];
    useStore.getState().setTicker(symbol, { ...( old ?? { symbol, change24h: 0, volume24h: 0, high24h: c * 1.02, low24h: c * 0.98 }), symbol, price: c });
  }, 2000);
}

export function useMarketData() {
  const wsRef = useRef<BulkWebSocket | null>(null);
  const { appendCandle, setOrderBook, setTicker, setWsConnected, addLog } = useStore();

  // REST bootstrap
  useEffect(() => {
    (async () => {
      addLog('info', 'Seeding market data...');
      for (const pair of ALL_PAIRS) {
        const candles = await fetchCandles(pair, '1m', 200);
        if (candles.length > 0) {
          candles.forEach((c) => appendCandle(pair, c));
          addLog('info', `${pair}: ${candles.length} candles loaded`);
        } else {
          addLog('warn', `${pair}: REST unavailable — using synthetic feed`);
          seedFallback(pair);
        }
        const ticker = await fetchTicker(pair);
        if (ticker) setTicker(pair, ticker);
        const book = await fetchOrderBook(pair, 20);
        if (book.bids.length) setOrderBook(pair, book);
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // WebSocket
  useEffect(() => {
    wsRef.current = new BulkWebSocket({
      onConnected: () => { setWsConnected(true); addLog('info', '✅ WebSocket connected'); },
      onDisconnected: () => { setWsConnected(false); addLog('warn', '⚠ WebSocket disconnected — reconnecting'); },
      onCandle: (sym, c) => appendCandle(sym, c),
      onOrderBook: (sym, b) => setOrderBook(sym, b),
      onTicker: (sym, t) => setTicker(sym, t),
      onTrade: (sym, price, size) => {
        const { candles: cv, tickers: tk } = useStore.getState();
        const last = cv[sym]?.at(-1);
        if (last) {
          const t = Math.floor(Date.now() / 1000); const minT = t - (t % 60);
          appendCandle(sym, { time: minT, open: last.close, high: Math.max(last.close, price), low: Math.min(last.close, price), close: price, volume: last.volume + size });
        }
        const old = tk[sym];
        if (old) setTicker(sym, { ...old, price });
      },
    });
    wsRef.current.connect();
    for (const p of ALL_PAIRS) wsRef.current.subscribe(p);
    const poll = setInterval(() => setWsConnected(wsRef.current?.isConnected ?? false), 3000);
    return () => { wsRef.current?.destroy(); clearInterval(poll); Object.values(tickTimers).forEach(clearInterval); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}
