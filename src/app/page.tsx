// src/app/page.tsx
'use client';
import { useMarketData } from '@/hooks/useMarketData';
import { useBotEngine }  from '@/hooks/useBotEngine';
import Header            from '@/components/panel/Header';
import StrategyPanel     from '@/components/panel/StrategyPanel';
import PairTabs, { OrderBook } from '@/components/panel/MarketBar';
import BotPanel          from '@/components/panel/BotPanel';
import LogPanel          from '@/components/panel/LogPanel';
import PriceChart        from '@/components/chart/PriceChart';

export default function TradingApp() {
  useMarketData();
  useBotEngine();

  return (
    <div className="relative z-10 flex flex-col h-screen">
      <Header />

      {/* Main grid below header */}
      <div className="flex flex-1 overflow-hidden" style={{ marginTop: '56px' }}>

        {/* LEFT — Strategies (280px) */}
        <div className="w-72 flex-shrink-0 border-r border-border bg-surface overflow-hidden flex flex-col">
          <StrategyPanel />
        </div>

        {/* CENTER — Chart */}
        <div className="flex-1 flex flex-col overflow-hidden border-r border-border">
          <PairTabs />
          <div className="flex-1 overflow-hidden">
            <PriceChart />
          </div>
          <OrderBook />
          <LogPanel />
        </div>

        {/* RIGHT — Bot config (300px) */}
        <div className="w-80 flex-shrink-0 border-l border-border bg-surface overflow-hidden flex flex-col">
          <BotPanel />
        </div>

      </div>
    </div>
  );
}
