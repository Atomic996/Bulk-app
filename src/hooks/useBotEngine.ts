// src/hooks/useBotEngine.ts
import { useEffect, useRef, useCallback } from 'react';
import { useStore } from '@/lib/store';
import { analyzeMarket } from '@/engine/strategies';
import { placeOrder, placeBracket } from '@/lib/orderExecutor';
import type { ActiveOrder, Trade } from '@/types';

export function useBotEngine() {
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const { addLog, addOrder, removeOrder, addTrade } = useStore();

  // Analysis every 10s (always on)
  useEffect(() => {
    const run = () => {
      const { config: cfg, candles: cv } = useStore.getState();
      cfg.pairs.forEach((pair) => {
        const c = cv[pair];
        if (c && c.length >= 30) useStore.getState().setSignal(pair, analyzeMarket(c));
      });
    };
    run();
    const t = setInterval(run, 10_000);
    return () => clearInterval(t);
  }, []);

  const simulateFill = useCallback((order: ActiveOrder) => {
    const delay = Math.random() * 7000 + 3000;
    setTimeout(() => {
      const { orders } = useStore.getState();
      if (!orders.find((o) => o.id === order.id)) return;
      removeOrder(order.id);
      const { config: cfg } = useStore.getState();
      const pnl = (Math.random() * 7 - 2.5) * cfg.orderSizeUSD / 100;
      addTrade({ id: Math.random().toString(36).slice(2), symbol: order.symbol, side: order.side, price: order.price, size: order.size, pnl, strategyId: order.strategyId, closedAt: Date.now() } as Trade);
      addLog('fill', `FILL ${order.symbol} ${order.side.toUpperCase()} | P&L ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)}`);
    }, delay);
  }, [removeOrder, addTrade, addLog]);

  const loop = useCallback(async () => {
    const { config: cfg, candles: cv, tickers, orders: curOrds, wallet } = useStore.getState();
    for (const pair of cfg.pairs) {
      if (curOrds.length >= cfg.maxOpenOrders) { addLog('warn', `Max orders reached`); break; }
      if (curOrds.filter((o) => o.symbol === pair).length >= 2) continue;
      const c = cv[pair];
      if (!c || c.length < 30) { addLog('info', `${pair}: waiting for data`); continue; }

      const signal = analyzeMarket(c);
      useStore.getState().setSignal(pair, signal);

      const strat = cfg.forcedStrategy !== 'auto' ? cfg.forcedStrategy : signal.strategyId;
      const score = signal.strategyScores[strat];
      if (signal.side === 'hold' || score < 55) { addLog('info', `${pair}: hold (${score.toFixed(0)}%) — ${signal.reason}`); continue; }

      const price = tickers[pair]?.price ?? c.at(-1)?.close ?? 0;
      if (!price) continue;

      const isBuy  = signal.side === 'buy';
      const size   = cfg.orderSizeUSD / price;
      const slDist = price * cfg.riskPct / 100;
      const tpDist = slDist * 2;
      const entry  = parseFloat((price * (isBuy ? 0.9999 : 1.0001)).toFixed(8));

      addLog('info', `${pair}: ${isBuy ? '📈 BUY' : '📉 SELL'} via ${strat.toUpperCase()} (${score.toFixed(0)}%) — ${signal.reason}`);

      let result: { success: boolean; orderId?: string; error?: string };
      if (cfg.useBracket) {
        result = await placeBracket({ entry: { symbol:pair, isBuy, price:entry, size, orderType:'limit', tif:'GTC' }, stopPrice: cfg.useSL ? (isBuy ? price - slDist : price + slDist) : undefined, takeProfitPrice: cfg.useTP ? (isBuy ? price + tpDist : price - tpDist) : undefined }, wallet, cfg.mode);
        if (result.success) addLog('order', `${pair}: Bracket order submitted [${result.orderId?.slice(0,12)}]`);
      } else {
        result = await placeOrder({ symbol:pair, isBuy, price:entry, size, orderType:'limit', tif:'GTC' }, wallet, cfg.mode);
        if (result.success) addLog('order', `${pair}: ${isBuy ? 'BUY' : 'SELL'} ${size.toFixed(6)} @ $${entry} [${result.orderId?.slice(0,12)}]`);
      }

      if (result.success) {
        const o: ActiveOrder = { id: result.orderId ?? Math.random().toString(36).slice(2), clientId: Math.random().toString(36).slice(2), symbol: pair, side: isBuy ? 'buy' : 'sell', price: entry, size, strategyId: strat, createdAt: Date.now(), slPrice: cfg.useSL ? (isBuy ? price - slDist : price + slDist) : undefined, tpPrice: cfg.useTP ? (isBuy ? price + tpDist : price - tpDist) : undefined };
        addOrder(o);
        if (cfg.mode === 'paper') simulateFill(o);
      } else {
        addLog('error', `${pair}: Order failed — ${result.error}`);
      }
    }
  }, [addLog, addOrder, simulateFill]);

  const { botRunning, config } = useStore();

  useEffect(() => {
    if (botRunning) {
      addLog('info', `🚀 Bot STARTED — ${config.pairs.join(', ')} | mode: ${config.mode.toUpperCase()}`);
      loop();
      timerRef.current = setInterval(loop, config.intervalSec * 1000);
    } else {
      if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; addLog('warn', '⏹ Bot STOPPED'); }
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [botRunning, config.intervalSec, loop, addLog]);
}
