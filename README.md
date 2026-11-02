# NSB — Smart EUR/USD Analysis

A Next.js App Router / JSX starter for EUR/USD market structure analysis and paper trading. It includes an embedded TradingView chart, Twelve Data candle retrieval, a transparent EMA/range-break rule engine, manually entered fundamental/event context, risk sizing, and a browser-local paper trade journal.

## Requirements
- Node.js 20.9+ (recommended)
- A Twelve Data API key: https://twelvedata.com/

## Setup
1. Extract this project folder and open it in VS Code.
2. In a terminal, run `npm install`.
3. Copy `.env.example` to `.env.local`.
4. Put your key in `.env.local`: `TWELVE_DATA_API_KEY=your_real_key_here`.
5. Run `npm run dev` and open http://localhost:3000.
6. Run `npm run build` before deployment.

Never commit `.env.local` or put the private key in a `NEXT_PUBLIC_` variable. If you change environment variables, restart the dev server.

## What is implemented
- `/api/market?interval=1h` and `/api/market?interval=4h`: requests candles server-side from Twelve Data.
- `/api/analyze`: gets both timeframes, calculates EMA20/EMA50, ATR, swing points and recent-range break, and combines them with user-supplied fundamentals.
- TradingView chart iframe for EUR/USD, with 1H and 4H selection.
- Risk calculator capped at 2% per trade, based on approximate USD-account EUR/USD pip value.
- Paper trade journal in browser localStorage. No broker integration or live orders.

## Limitations and safety
- This is not an 80%-accurate predictor and does not claim any verified win rate.
- The fundamental input is manual, not an automatically updating economic calendar. Connect a licensed calendar/news provider in `src/lib/fundamentals.js` before treating fundamentals as live.
- Twelve Data API plan limits and supported intervals depend on your account. The app surfaces provider errors rather than substituting invented live prices.
- TradingView's displayed quote and Twelve Data's quote may differ by feed, broker, and timestamp. Do not assume chart price and analysis price are identical.
- The strategy is a simple baseline, not a proven trading system. Backtest with spreads, commissions, slippage, walk-forward and out-of-sample validation before considering real money.
- Paper journal entries are saved locally and results are manually graded. It does not automatically monitor stop/target hits, and it does not submit broker orders.
- Risk size is approximate. Confirm pip value, lot size, margin, contract details, spreads and fees with the broker.

## Deploy to Vercel
Import the project into Vercel, add `TWELVE_DATA_API_KEY` in Project Settings → Environment Variables, then deploy. Keep the key server-only. After changing env vars, redeploy.

## NSB safety and UI updates

- Analysis History and Economic Calendar are independently collapsible to reduce dashboard clutter.
- The breakout monitor uses direction-aware pip distance and indicates when a level has already been reached.
- Pending automatic signal outcomes are re-evaluated every five minutes using subsequent 1H candles; the signal-generating candle is excluded. If stop and TP1 are both touched in the same candle, the result is treated conservatively as ambiguous and -1R.
- Paper-trade creation is blocked when event risk is unknown or high, or when any mandatory validation check fails. Missing calendar coverage is not treated as proof that no event is scheduled.
- High-impact event block window defaults to 60 minutes before and 30 minutes after a relevant EUR/USD event. These can be configured in `.env.local` with `NSB_EVENT_BLOCK_BEFORE_MINUTES` and `NSB_EVENT_BLOCK_AFTER_MINUTES`.
- This is a rule-based educational tool, not a guarantee of predictive accuracy or profitability. Validate rules with out-of-sample backtesting and paper trading before relying on performance metrics.

## Local verification

```bash
npm ci
npm run build
npm run dev
```

Keep `.env.local` private and never commit API keys. `.env.example` contains placeholders only.
