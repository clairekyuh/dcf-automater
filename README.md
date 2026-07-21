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
- Complete five-year operating and unlevered free-cash-flow build
- Perpetual-growth and exit-multiple valuation bridges shown side by side
- Plain-language UFCF definition plus formulas with the loaded company’s numbers substituted into both terminal-value methods
- Observed peer-industry revenue growth shown beside the long-run perpetual-growth assumption
- Automatically selected competitor group with revenue growth, margins, EV/revenue, EV/EBITDA, P/E, and focus-company differences
- Business-focus comparison and a conditional moat assessment with evidence that still needs verification
- Peer-median EV/EBITDA and trading range shown inside the exit-multiple valuation bridge
- WACC/terminal-growth and WACC/exit-multiple sensitivity tables
- Monthly stock-price chart with 1Y, 3Y, 5Y, and maximum-period controls
- Nine-step guided DCF lesson using the currently loaded company's numbers
- Editable industry-based starting assumptions
- Expandable plain-language explanations for every editable assumption
- Potential-risk flags for capex, leverage, margins, geopolitics, terminal value, and valuation cushion
- Responsive layout

The app uses official Alpha Vantage fundamental-data and monthly-price endpoints. `IBM` works with demo access; other tickers require a free `ALPHA_VANTAGE_API_KEY`. A complete analysis uses up to eight provider requests: four for the focus company, one for price history, and three peer-company overviews. With a 25-request daily allowance, that supports approximately three complete analyses; the main DCF still loads if optional price or peer requests are unavailable.

> For educational purposes only. Not investment advice.
