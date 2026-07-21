# DCF Calculator

A ticker-driven, spreadsheet-style discounted cash flow calculator built with Next.js and TypeScript.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Current features

- Automatic company overview, sector, industry, and annual financials
- Bloomberg XDCF-shaped build with six calendar-year forecast columns, a five-year valuation window, partial first and sixth years, and mid-year discounting
- Perpetual-growth and exit-multiple valuation bridges shown side by side
- A CRWV reference case that reproduces the supplied Bloomberg Terminal XDCF dated April 27, 2026, including its operating forecast, WACC, terminal assumptions, capital bridge, and published per-share outputs
- Hover and keyboard-focus definitions for technical DCF terms, every editable assumption, and each WACC component including risk-free rate, beta, equity risk premium, and capital weights
- Observed niche-peer revenue growth shown beside the long-run perpetual-growth assumption
- Optional two-year S&P Global consensus revenue anchors, with an automatic historical-growth fallback when the forecast cannot be validated
- Capital-intensive forecasts that fade current D&A and capex ratios toward explicit, editable Year-5 targets instead of treating a build-out year as permanent
- D&A / revenue and capex / revenue shown directly in every forecast year so the perpetual-growth cash flow can be audited
- Business-model peer selection with direct, close, and adjacent fit labels; broad operating competitors are separated from primary valuation peers
- Business-focus comparison and a conditional moat assessment with evidence that still needs verification
- Separate `/company-analysis` page whose description, supply-chain mapping, customer concentration, company COGS, and default-risk inputs come only from SEC data
- Best-effort SEC 10-K/20-F review for major customers, supplier concentration, external manufacturing, infrastructure providers, and geographic supply exposure
- SEC Company Facts solvency screen using leverage, liquidity, interest coverage, and free-cash-flow coverage; missing facts produce an insufficient-data result instead of a low-risk label
- Peer-median EV/EBITDA and trading range shown inside the exit-multiple valuation bridge
- WACC/terminal-growth and WACC/exit-multiple sensitivity tables
- Monthly stock-price chart with 1Y, 3Y, 5Y, and maximum-period controls
- Editable business-niche-based starting assumptions
- Expandable plain-language explanations for every editable assumption
- Potential-risk flags for capex, leverage, margins, geopolitics, terminal value, and valuation cushion
- Responsive layout

The model always uses the Bloomberg XDCF calculation structure. For CRWV, the forecast inputs and valuation bridge are the figures in the user-supplied April 27, 2026 Bloomberg PDF, allowing a direct reconciliation to $1,247.14 per share under perpetual growth and $1,348.65 under the exit-multiple method. For other tickers, the same calculation structure is populated from freely available Nasdaq financials and forecast fallbacks, so the output will not equal a Bloomberg terminal estimate unless the same proprietary consensus inputs are supplied.

The main site loads Nasdaq-displayed annual financial statements, company profiles, market summaries, and cached price history without an API key. Alpha Vantage is no longer called, so its 25-request daily quota cannot block ticker loading. Peer requests are optional and cannot prevent the focus-company DCF from loading. The separate company-analysis page continues to use SEC Company Facts and the latest SEC annual filing; unavailable SEC fields are shown honestly rather than replaced with another provider.

> For educational purposes only. Not investment advice.
