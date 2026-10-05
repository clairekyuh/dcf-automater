# DCF Calculator

DCF Calculator is a ticker-driven website for estimating a public company's intrinsic value using a discounted cash flow analysis.

Enter a ticker to load available company data, review the operating forecast, adjust the assumptions, compare two terminal-value methods, and export the model to Excel.

## What a DCF does

A discounted cash flow model estimates what a business is worth today based on the cash it may generate in the future.

The calculator follows this process:

1. Start with the company's reported revenue and operating results.
2. Forecast revenue, margins, taxes, depreciation, capital spending, and working capital.
3. Calculate unlevered free cash flow, which is cash generated for both shareholders and lenders.
4. Discount each forecast cash flow to today's value using the weighted average cost of capital, or WACC.
5. Estimate the value of cash flows beyond the explicit forecast using perpetual growth and exit-multiple methods.
6. Add cash, subtract debt and other non-equity claims, and divide by diluted shares to estimate value per share.

## What the website provides

- A six-period operating forecast covering an exact five-year valuation window
- Revenue, EBIT, taxes, depreciation, capital expenditures, working capital, and unlevered free cash flow
- Perpetual-growth and exit-multiple valuations
- WACC calculations and editable assumptions
- Sensitivity tables showing how value changes with WACC, growth, and exit multiples
- Comparable-company analysis using market capitalization, enterprise value, and LTM/NTM trading multiples
- Historical stock-price charts
- Company news, business information, and potential-risk analysis
- An Excel export containing the model, formulas, sensitivity tables, comparable companies, and charts

## How to use it

1. Enter a public-company ticker.
2. Review the company description and source data.
3. Check the forecast assumptions, especially revenue growth, margins, capital spending, and working capital.
4. Review WACC and terminal-value assumptions.
5. Compare the perpetual-growth and exit-multiple results.
6. Use the sensitivity tables to understand how dependent the valuation is on major assumptions.
7. Review warnings before relying on the output.
8. Export the workbook to Excel if you want to continue the analysis manually.

## Understanding the two terminal methods

### Perpetual growth

The perpetual-growth method assumes the company continues operating after the explicit forecast and grows at a sustainable long-term rate. The model connects terminal growth with the reinvestment required to support that growth.

### Exit multiple

The exit-multiple method applies an EV/EBITDA multiple to the company's terminal-year EBITDA. It provides a market-based cross-check against the perpetual-growth result.

Neither method should be treated as a price target. Large differences between the two methods usually indicate that the operating forecast, WACC, terminal growth, or exit multiple needs closer review.

## Data and assumptions

The website uses public market and company information from Nasdaq, SEC EDGAR, FRED, Damodaran data, and available consensus information surfaced by Stock Analysis.

Reported figures, external consensus estimates, automatic model estimates, editable assumptions, and unavailable information are identified separately. Missing data is not intentionally replaced with a confident value.

The model is most useful as a transparent starting point. It is not a fully linked three-statement model, and automatic forecasts require independent review. Loss-making companies, recent IPOs, financial institutions, foreign issuers, and companies with incomplete data may require specialized valuation methods or additional assumptions.

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

For SEC requests, copy `.env.example` to `.env.local` and set `SEC_USER_AGENT` to an application name and contact email.

## Verify the project

```bash
npm run check
npm run build
```

## Methodology references

- [CFA Institute: Free Cash Flow Valuation](https://www.cfainstitute.org/insights/professional-learning/refresher-readings/2026/free-cash-flow-valuation)
- [Aswath Damodaran: Growth and Reinvestment](https://pages.stern.nyu.edu/~adamodar/New_Home_Page/valquestions/growth.htm)
- [Wall Street Prep: Building a DCF Model](https://www.wallstreetprep.com/knowledge/dcf-model-training-6-steps-building-dcf-model-excel/)
- [Wall Street Prep: Mid-Year Convention](https://www.wallstreetprep.com/knowledge/mid-year-convention/)

## Disclaimer

THIS IS NOT FINANCIAL ADVICE.
