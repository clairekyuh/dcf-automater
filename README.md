# Intrinsic — DCF Automater

A ticker-driven, transparent discounted cash flow and investment-risk workbench built with Next.js and TypeScript.

## Run locally

```bash
npm install
cp .env.example .env.local
# Add a free Alpha Vantage API key to .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Current features

- Automatic company overview, sector, industry, and five years of financials
- Fully transparent five-year unlevered free-cash-flow build
- Perpetuity-growth and exit-multiple terminal value methods
- Editable industry-based starting assumptions
- Bear, base, and bull scenarios
- Risk flags for capex, leverage, margins, geopolitics, terminal value, and valuation cushion
- Responsive layout

The app uses the official Alpha Vantage fundamental-data endpoints. `IBM` works with demo access; other tickers require a free `ALPHA_VANTAGE_API_KEY`. API responses are cached for one day to conserve the free request allowance.

> For educational purposes only. Not investment advice.
