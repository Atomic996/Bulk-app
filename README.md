# BULK TRADER — Auto Trading Engine

Automated trading bot for [Bulk Exchange](https://early.bulk.trade) built with Next.js 14.

## Stack
- **Next.js 14** — framework
- **bulk-keychain-wasm** — transaction signing in browser
- **Phantom Wallet** — signing via `signMessage`
- **lightweight-charts** — TradingView-style candlestick chart
- **Zustand** — global state
- **4 real strategies** — Grid, Market Making, Momentum, Mean Reversion (pure TA, no AI)

## Local Dev

```bash
npm install
npm run dev
# → http://localhost:3000
```

## Deploy to Vercel

### Option A — Vercel CLI (fastest)

```bash
npm i -g vercel
vercel login
vercel --prod
```

Set these env vars in Vercel dashboard → Settings → Environment Variables:

| Key | Value |
|-----|-------|
| `NEXT_PUBLIC_BULK_WS_URL`  | `wss://api.early.bulk.trade/ws` |
| `NEXT_PUBLIC_BULK_API_URL` | `https://api.early.bulk.trade`  |
| `NEXT_PUBLIC_ORIGIN_URL`   | `https://early.bulk.trade`      |
| `NEXT_PUBLIC_PRIVY_APP_ID` | `cmbuls93q01jol20lf0ak0plb`     |
| `NEXT_PUBLIC_PRIVY_URL`    | `https://auth.privy.io/api/v1`  |

### Option B — GitHub + Vercel (auto-deploy on push)

1. Create GitHub repo and push this folder
2. Go to https://vercel.com/new → Import repo
3. Add env vars above
4. Click **Deploy**

Every `git push` redeploys automatically.

## Usage

1. Open the app
2. Click **CONNECT WALLET** (Phantom)
3. Select **PAPER** mode first to test
4. Adjust config in right panel
5. Click **▶ START BOT**
6. Switch to **LIVE** mode when ready

## Strategy Logic

| Strategy | Trigger | Indicators |
|----------|---------|-----------|
| Grid | ADX < 25, low vol | VWAP deviation |
| Market Making | ADX < 20, tight spread | ATR < 0.5% |
| Momentum | EMA crossover + MACD | EMA 9/21, MACD |
| Mean Reversion | RSI extremes + BB | RSI 14, Bollinger Bands |

Bot auto-selects the highest-scoring strategy per pair, or you can force one manually.
