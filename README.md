# DCF Calculator

A ticker-driven, spreadsheet-style discounted cash flow calculator built with Next.js and TypeScript.

## Run locally

```bash
npm install
cp .env.example .env.local
# Add a free Alpha Vantage API key to .env.local
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Current features

- Automatic company overview, sector, industry, and annual financials
- Workbook-style navigation that jumps between sections on the same page
- Complete five-year operating and unlevered free-cash-flow build
- Perpetual-growth and exit-multiple valuation bridges shown side by side
- WACC/terminal-growth and WACC/exit-multiple sensitivity tables
- Monthly stock-price chart with 1Y, 3Y, 5Y, and maximum-period controls
- Nine-step guided DCF lesson using the currently loaded company's numbers
- Editable industry-based starting assumptions
- Expandable plain-language explanations for every editable assumption
- Potential-risk flags for capex, leverage, margins, geopolitics, terminal value, and valuation cushion
- Responsive layout

The app uses official Alpha Vantage fundamental-data and monthly-price endpoints. `IBM` works with demo access; other tickers require a free `ALPHA_VANTAGE_API_KEY`. A complete analysis uses five provider requests, so the free daily allowance supports approximately five full ticker analyses.

> For educational purposes only. Not investment advice.
