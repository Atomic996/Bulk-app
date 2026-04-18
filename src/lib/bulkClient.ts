// src/lib/bulkClient.ts
// Real Bulk Exchange — wss://api.early.bulk.trade/ws

import type { Candle, OrderBook, Ticker } from '@/types';

export const BULK_WS_URL  = process.env.NEXT_PUBLIC_BULK_WS_URL  ?? 'wss://api.early.bulk.trade/ws';
export const BULK_API_URL = process.env.NEXT_PUBLIC_BULK_API_URL ?? 'https://api.early.bulk.trade';
export const ORIGIN_URL   = process.env.NEXT_PUBLIC_ORIGIN_URL   ?? 'https://early.bulk.trade';

const HEADERS = { Origin: ORIGIN_URL, 'Content-Type': 'application/json' };

// ─── REST ────────────────────────────────────────────────────────────────────

export async function fetchCandles(symbol: string, interval = '1m', limit = 200): Promise<Candle[]> {
  try {
    const res = await fetch(`${BULK_API_URL}/api/v1/candles?symbol=${symbol}&interval=${interval}&limit=${limit}`, { headers: HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    const raw: number[][] = d.candles ?? d.data ?? d ?? [];
    return raw.map((c) => ({
      time: Math.floor(c[0] / 1000), open: +c[1], high: +c[2], low: +c[3], close: +c[4], volume: +(c[5] ?? 0),
    }));
  } catch (e) { console.warn(`fetchCandles ${symbol}:`, e); return []; }
}

export async function fetchTicker(symbol: string): Promise<Ticker | null> {
  try {
    const res = await fetch(`${BULK_API_URL}/api/v1/ticker?symbol=${symbol}`, { headers: HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    return { symbol, price: +(d.lastPrice ?? d.price ?? d.c ?? 0), change24h: +(d.priceChangePercent ?? d.P ?? 0), volume24h: +(d.volume ?? 0), high24h: +(d.highPrice ?? 0), low24h: +(d.lowPrice ?? 0) };
  } catch { return null; }
}

export async function fetchOrderBook(symbol: string, depth = 20): Promise<OrderBook> {
  try {
    const res = await fetch(`${BULK_API_URL}/api/v1/depth?symbol=${symbol}&limit=${depth}`, { headers: HEADERS });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    const p = (b: (string|number)[]): [number,number] => [+b[0], +b[1]];
    return { bids: (d.bids ?? []).map(p), asks: (d.asks ?? []).map(p) };
  } catch { return { bids: [], asks: [] }; }
}

// ─── WebSocket ───────────────────────────────────────────────────────────────

export type MarketDataCallback = {
  onCandle?:       (symbol: string, c: Candle) => void;
  onOrderBook?:    (symbol: string, b: OrderBook) => void;
  onTicker?:       (symbol: string, t: Ticker) => void;
  onTrade?:        (symbol: string, price: number, size: number, side: 'buy'|'sell') => void;
  onConnected?:    () => void;
  onDisconnected?: () => void;
};

export class BulkWebSocket {
  private ws:            WebSocket | null = null;
  private pingTimer:     ReturnType<typeof setInterval> | null = null;
  private reconnTimer:   ReturnType<typeof setTimeout>  | null = null;
  private pairs:         Set<string> = new Set();
  private cb:            MarketDataCallback;
  private delay =        2000;
  private dead =         false;

  constructor(cb: MarketDataCallback) { this.cb = cb; }

  connect() {
    if (this.dead) return;
    try {
      this.ws = new WebSocket(BULK_WS_URL);
      this.ws.onopen    = this.onOpen.bind(this);
      this.ws.onmessage = this.onMsg.bind(this);
      this.ws.onclose   = this.onClose.bind(this);
      this.ws.onerror   = () => {};
    } catch { this.scheduleReconn(); }
  }

  private onOpen() {
    this.delay = 2000;
    this.cb.onConnected?.();
    for (const s of this.pairs) this.sub(s);
    this.pingTimer = setInterval(() => this.send({ type: 'ping', timestamp: Date.now() }), 20_000);
  }

  private onMsg(e: MessageEvent) {
    try { this.route(JSON.parse(e.data as string) as Record<string,unknown>); } catch { /**/ }
  }

  private route(msg: Record<string,unknown>) {
    const type    = String(msg.type ?? msg.e ?? msg.event ?? '');
    const channel = String(msg.channel ?? msg.ch ?? '');
    const data    = (msg.data ?? msg) as Record<string,unknown>;
    const symbol  = String(msg.symbol ?? data.symbol ?? data.s ?? msg.s ?? '');
    if (type === 'pong') return;

    // Ticker
    if (type === 'ticker' || channel === 'ticker' || type === '24hrTicker') {
      if (!symbol) return;
      this.cb.onTicker?.(symbol, {
        symbol, price: +(data.lastPrice ?? data.price ?? data.c ?? 0),
        change24h: +(data.priceChangePercent ?? data.P ?? 0),
        volume24h: +(data.volume ?? 0), high24h: +(data.highPrice ?? 0), low24h: +(data.lowPrice ?? 0),
      });
    }
    // Kline
    if (type === 'kline' || type === 'candle' || channel.startsWith('kline') || channel.startsWith('candle')) {
      const k = (data.k ?? data.kline ?? data) as Record<string,unknown>;
      if (!symbol) return;
      this.cb.onCandle?.(symbol, {
        time: Math.floor(+String(k.t ?? k.openTime ?? k.time ?? Date.now()) / 1000),
        open: +String(k.o ?? k.open ?? 0), high: +String(k.h ?? k.high ?? 0),
        low:  +String(k.l ?? k.low  ?? 0), close: +String(k.c ?? k.close ?? 0),
        volume: +String(k.v ?? k.volume ?? 0),
      });
    }
    // Depth
    if (type === 'depth' || channel.startsWith('depth') || channel === 'book') {
      if (!symbol) return;
      const p = (b: unknown): [number,number] => { const a = b as (string|number)[]; return [+a[0], +a[1]]; };
      this.cb.onOrderBook?.(symbol, {
        bids: ((data.bids ?? []) as unknown[]).map(p),
        asks: ((data.asks ?? []) as unknown[]).map(p),
      });
    }
    // Trade
    if (type === 'trade' || type === 'aggTrade' || channel === 'trade') {
      if (!symbol) return;
      const price = +(data.price ?? data.p ?? 0);
      const size  = +(data.qty   ?? data.q ?? 0);
      this.cb.onTrade?.(symbol, price, size, (data.isBuy ?? data.m === false) ? 'buy' : 'sell');
    }
  }

  private onClose() {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.cb.onDisconnected?.();
    this.scheduleReconn();
  }

  private scheduleReconn() {
    if (this.dead) return;
    this.reconnTimer = setTimeout(() => {
      this.delay = Math.min(this.delay * 1.5, 30_000);
      this.connect();
    }, this.delay);
  }

  subscribe(symbol: string) {
    this.pairs.add(symbol);
    if (this.ws?.readyState === WebSocket.OPEN) this.sub(symbol);
  }

  private sub(symbol: string) {
    [
      { type:'subscribe', channel:'ticker',  symbol },
      { type:'subscribe', channel:'kline',   symbol, interval:'1m' },
      { type:'subscribe', channel:'depth',   symbol, limit:20 },
      { type:'subscribe', channel:'trade',   symbol },
    ].forEach((s) => this.send(s));
  }

  private send(d: object) {
    if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(d));
  }

  get isConnected() { return this.ws?.readyState === WebSocket.OPEN; }

  destroy() {
    this.dead = true;
    if (this.pingTimer)    clearInterval(this.pingTimer);
    if (this.reconnTimer)  clearTimeout(this.reconnTimer);
    this.ws?.close();
  }
}
