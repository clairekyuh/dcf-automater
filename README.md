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
- A real-company starting example that cycles across Apple, Google, Microsoft, Johnson & Johnson, Walmart, and Exxon Mobil; the ticker input starts empty with rotating suggestions
- Bloomberg XDCF-shaped build with six company-fiscal-year forecast columns, a five-year valuation window, partial first and sixth years, and mid-year discounting
- Wall Street Prep six-step unlevered DCF audit: forecast UFCF, calculate terminal value, discount at WACC, add non-operating assets, subtract non-equity claims, and divide by the share count
- Excel-style in-browser workbook tabs for the DCF model, assumptions, WACC cross-check, valuation bridge, and both sensitivity analyses
- Perpetual-growth and exit-multiple valuation bridges shown side by side
- The supplied Bloomberg XDCF is used strictly as a process template: six forecast columns, exact five-year weighting, mid-year discounting, Year-5 interpolation, both terminal formulas, and the enterprise-to-equity bridge
- Hover and keyboard-focus definitions for technical DCF terms, every editable assumption, and each WACC component including risk-free rate, beta, equity risk premium, and capital weights
- Observed niche-peer revenue growth shown beside the long-run perpetual-growth assumption
- Optional two-year S&P Global consensus revenue anchors, with an automatic historical-growth fallback when the forecast cannot be validated
- Six explicit annual forecast-driver columns for revenue growth, gross and EBIT margins, tax, D&A, capex, working capital, deferred tax, and other non-cash adjustments; terminal growth cannot change the explicit forecast or exit-multiple result
- D&A / revenue and capex / revenue shown directly in every forecast year so the perpetual-growth cash flow can be audited
- Business-model peer selection with direct, close, and adjacent fit labels; broad operating competitors are separated from primary valuation peers
- Peer mean and peer median rows for every comparable-company metric, with outlier caveats
- Business-focus comparison and a conditional moat assessment with evidence that still needs verification
- Standard unlevered DCF is disabled for banks and insurers, where debt and regulatory capital are operating inputs and sector-specific equity methods are required
- Separate `/company-analysis` page whose filing conclusions, supply-chain signals, customer concentration, company COGS, and credit-screen inputs come only from SEC data
- Best-effort SEC 10-K/20-F review for major customers, supplier concentration, external manufacturing, infrastructure providers, and geographic supply exposure
- SEC Company Facts credit and liquidity screen using leverage, liquidity, interest coverage, and free-cash-flow coverage; missing facts produce an insufficient-data result instead of a low-risk label
- Peer-median EV/EBITDA and trading range shown inside the exit-multiple valuation bridge
- WACC/terminal-growth and WACC/exit-multiple sensitivity tables
- Side-by-side terminal-method cross-checks showing the perpetuity method's implied exit multiple and the exit method's implied perpetual growth rate
- Stock-price chart with independent Daily, Weekly, and Monthly intervals plus 3M, 6M, YTD, 1Y, 3Y, 5Y, and maximum-available-period controls
- Editable business-niche-based starting assumptions
- Expandable plain-language explanations for every editable assumption
- Potential-risk flags for capex, leverage, margins, geopolitics, terminal value, and valuation cushion
- Responsive layout

The model combines Wall Street Prep's six-step unlevered DCF framework with the calculation structure observed in the supplied Bloomberg XDCF PDF, but it never imports the PDF's dated company inputs or published answer. Every ticker—including CRWV—is populated from current public data and visible, editable assumptions. When a validated two-year revenue consensus is available, it anchors Years 1 and 2; Years 3 through 6 are explicitly labeled website estimates with their own editable maturity path. The perpetual-growth input is used only in the terminal formula. This means the website follows the published process but will not equal Bloomberg Terminal output unless the same proprietary operating forecasts and assumptions are separately supplied.

This remains an automated quick DCF, not a linked three-statement model. The share-count source and cost-of-debt proxy are labeled in the workbook. The risk-free rate is refreshed from FRED and the implied equity risk premium from Damodaran when those sources are reachable. Selected WACC reconciles exactly to the displayed capital-weighted formula plus a visible, editable company-specific premium.

The main site loads Nasdaq-displayed annual financial statements, company profiles, market summaries, and cached price history without an API key. Alpha Vantage is no longer called, so its 25-request daily quota cannot block ticker loading. Peer requests are optional and cannot prevent the focus-company DCF from loading. The separate company-analysis page continues to use SEC Company Facts and the latest SEC annual filing; unavailable SEC fields are shown honestly rather than replaced with another provider.

For SEC fair-access compliance, copy `.env.example` to `.env.local` and set `SEC_USER_AGENT` to an application name plus a real contact email. SEC requests are serialized, rate-limited, retried with backoff, and cached. If EDGAR returns 403/429 or is otherwise unavailable, the page identifies that status and does not label blank provider data as SEC-sourced.

## Verification

```bash
npm test
npm run build
```

The regression suite checks Bloomberg partial-year timing, non-calendar fiscal timing, independence between perpetual growth and the exit-multiple method, invalid perpetuity assumptions, exact WACC reconciliation, and the financial-sector DCF block.

> For educational purposes only. Not investment advice.
