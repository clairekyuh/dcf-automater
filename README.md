# DCF Calculator

A ticker-driven, spreadsheet-style discounted cash flow calculator built with Next.js and TypeScript.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Deploy to Vercel

The repository is ready for Vercel's Next.js preset and Node.js 24 runtime.

1. Push the repository to GitHub.
2. In [Vercel](https://vercel.com/new), import `clairekyuh/dcf-automater`.
3. Keep the detected framework as **Next.js** and the root directory as the repository root.
4. Add `SEC_USER_AGENT` under **Project Settings → Environment Variables**. Use an application name and a real contact email, for example `DCF Automater name@example.com`, and enable it for Production, Preview, and Development.
5. Click **Deploy**. Vercel will run `npm install` and `npm run build` automatically.

No Alpha Vantage key is required. Company data, price history, and news use public Nasdaq endpoints; the company-analysis screen uses SEC EDGAR. External providers can still rate-limit or block cloud-hosted requests, and the application reports those failures rather than inventing data.

For a command-line deployment after installing and signing in to the Vercel CLI:

```bash
vercel
vercel --prod
```

## Current features

- Automatic company overview, sector, industry, and annual financials
- A real-company starting example that cycles across Apple, Google, Microsoft, Johnson & Johnson, Walmart, and Exxon Mobil; the ticker input starts empty with rotating suggestions
- Six company-fiscal-year forecast columns, a five-year valuation window, partial first and sixth years, and mid-year discounting
- Six-step unlevered DCF formula audit: forecast UFCF, calculate terminal value, discount at WACC, add non-operating assets, subtract non-equity claims, and divide by the diluted share count
- Excel-style in-browser workbook tabs for the DCF model, assumptions, WACC cross-check, valuation bridge, and both sensitivity analyses
- Perpetual-growth and exit-multiple valuation bridges shown side by side
- Hover and keyboard-focus definitions for technical DCF terms, every editable assumption, and each WACC component including risk-free rate, beta, equity risk premium, and capital weights
- Observed niche-peer revenue growth shown beside the long-run perpetual-growth assumption
- Optional two-year S&P Global consensus revenue anchors, with an automatic historical-growth fallback when the forecast cannot be validated
- Six explicit annual forecast-driver columns for revenue growth, gross and EBIT margins, tax, D&A, capex, working capital, deferred tax, and other non-cash adjustments; terminal growth cannot change the explicit forecast or exit-multiple result
- D&A / revenue and capex / revenue shown directly in every forecast year so the perpetual-growth cash flow can be audited
- Business-model peer selection with direct, close, and adjacent fit labels; broad operating competitors are separated from primary valuation peers
- Peer mean and peer median rows for every comparable-company metric, with outlier caveats
- Business-focus comparison and a conditional moat assessment with evidence that still needs verification
- Standard unlevered DCF is disabled for banks and insurers, where debt and regulatory capital are operating inputs; those tickers now receive a sector-specific capital, credit, funding, liquidity, rate, and regulatory review checklist instead
- Separate `/company-analysis` page whose filing conclusions, supply-chain signals, customer concentration, company COGS, and credit-screen inputs come only from SEC data
- Best-effort SEC 10-K/20-F review for major customers, supplier concentration, external manufacturing, infrastructure providers, and geographic supply exposure
- SEC Company Facts credit and liquidity screen using leverage, liquidity, interest coverage, and free-cash-flow coverage; missing facts produce an insufficient-data result instead of a low-risk label
- Peer-median EV/EBITDA and trading range shown inside the exit-multiple valuation bridge
- WACC/terminal-growth and WACC/exit-multiple sensitivity tables
- A transparent five-year monthly price-return beta regression against SPY when enough history exists, with both raw beta and a one-third-toward-1.0 adjustment disclosed; insufficient history uses a neutral beta plus a separately visible industry-WACC gap rather than silently understating risk
- Perpetual-growth terminal cash flow normalized as terminal NOPAT × (1 − g / terminal ROIC), with terminal ROIC defaulting to WACC so new perpetual investment creates no automatic excess value
- Side-by-side terminal-method cross-checks showing the perpetuity method's implied exit multiple and the exit method's implied perpetual growth rate
- Stock-price chart with independent Daily, Weekly, and Monthly intervals plus 3M, 6M, YTD, 1Y, 3Y, 5Y, and maximum-available-period controls
- Editable business-niche-based starting assumptions
- Expandable plain-language explanations for every editable assumption
- Potential-risk flags for capex, leverage, margins, geopolitics, terminal value, terminal normalization, turnaround assumptions, disagreement between terminal methods, and room for forecast error
- Responsive layout

The model uses standard unlevered DCF formulas with six fiscal forecast columns, exact five-year weighting, mid-year discounting, Year-5 interpolation, both terminal formulas, and an enterprise-to-equity bridge. Every supported ticker is populated from current public data and visible, editable assumptions. When a validated two-year revenue consensus is available, it anchors Years 1 and 2; Years 3 through 6 are explicitly labeled website estimates with their own editable maturity path. The perpetual-growth input is used only in the terminal calculation. The perpetual-growth method explicitly connects growth to required reinvestment through terminal ROIC; the exit-multiple method remains a separate market-based cross-check.

This remains an automated quick DCF, not a linked three-statement model or an independent analyst price target. The share-count source and cost-of-debt proxy are labeled in the workbook. Historical tax starts with a multi-year median effective rate rather than one potentially distorted year. The risk-free rate is refreshed from FRED and the implied equity risk premium from Damodaran when those sources are reachable. Beta uses a disclosed five-year monthly price-return regression against SPY when enough matched observations exist and adjusts the raw result one-third toward 1.0. Selected WACC reconciles exactly to the displayed capital-weighted formula. The visible company-specific premium starts at 0% when beta history is sufficient; when it is not, it transparently fills only the gap to the displayed industry WACC starting point.

Foreign-issuer per-share values use market capitalization divided by the quoted security price unless an ADR/local-share conversion is verified, avoiding a mix of ordinary shares with an ADR price. Operating leases are not automatically capitalized because a consistent adjustment would also require lease-adjusted EBIT, D&A, capex, and cash flow. Preferred stock and non-controlling interests are included when structured SEC facts identify them. The working-capital forecast starts with a clearly disclosed 2% of incremental-revenue shortcut, while deferred tax and other non-cash adjustments start at 0%; both require company-specific replacement for high-stakes use.

The main site loads Nasdaq-displayed annual financial statements, company profiles, market summaries, and cached price history without an API key. Alpha Vantage is no longer called, so its 25-request daily quota cannot block ticker loading. Peer requests are optional and cannot prevent the focus-company DCF from loading. The separate company-analysis page continues to use SEC Company Facts and the latest SEC annual filing; unavailable SEC fields are shown honestly rather than replaced with another provider.

## Methodology references

The implementation is cross-checked against the [CFA Institute FCFF/FCFE valuation framework](https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/free-cash-flow-valuation), [Aswath Damodaran's growth and reinvestment framework](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/valquestions/growth.htm), [Damodaran's terminal reinvestment discussion](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/valquestions/termvalueexreturns.htm), [Wall Street Prep's six-step unlevered DCF outline](https://www.wallstreetprep.com/knowledge/dcf-model-training-6-steps-building-dcf-model-excel/), and its [mid-year convention reference](https://www.wallstreetprep.com/knowledge/mid-year-convention/). These references support the formulas and consistency checks; they do not endorse the website's automatic forecasts or scenario values.

For SEC fair-access compliance, copy `.env.example` to `.env.local` and set `SEC_USER_AGENT` to an application name plus a real contact email. SEC requests are serialized, rate-limited, retried with backoff, and cached. If EDGAR returns 403/429 or is otherwise unavailable, the page identifies that status and does not label blank provider data as SEC-sourced.

## Verification

```bash
npm test
npm run build
```

The regression suite checks partial-year timing, non-calendar fiscal timing, terminal reinvestment and ROIC linkage, independence between perpetual growth and the exit-multiple method, invalid operating and terminal assumptions, raw and adjusted beta, normalized taxes, foreign share-count units, exact WACC reconciliation, and the financial-sector DCF block.

> For educational purposes only. Not investment advice.
