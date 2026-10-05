# DCF Calculator

A web-based discounted cash flow calculator for public companies.

Enter a ticker to estimate intrinsic value from projected unlevered free cash flow. The model discounts forecast cash flows using WACC, calculates terminal value with perpetual-growth and exit-multiple methods, and converts enterprise value into an implied value per share.

## Features

- Automatic company data and forecasts
- Editable DCF and WACC assumptions
- Perpetual-growth and exit-multiple valuations
- Sensitivity tables and comparable-company analysis
- Stock-price, news, and risk pages
- Excel export
- Warnings when available data cannot support a reliable DCF

## Run locally

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

For SEC data, copy `.env.example` to `.env.local` and add a `SEC_USER_AGENT` containing an application name and contact email.

## Data limitations

The calculator uses public data and automatic estimates. Review all assumptions before relying on the output. Some companies require a different valuation method or additional data.

THIS IS NOT FINANCIAL ADVICE.
