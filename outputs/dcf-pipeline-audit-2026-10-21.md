# DCF pipeline audit checklist

Status legend: `PASS`, `FIXED`, `LIMITATION`.

## Baseline

- `PASS` Existing lint, TypeScript, and 111 automated tests passed before this audit.
- `FIXED` ADSK fiscal 2026 now uses the filed $195M D&A aggregate rather than $43M property depreciation.
- `FIXED` Historical D&A and capex use the same canonical SEC resolver where comparable annual facts exist.
- `FIXED` The API now exposes concept, raw tags, accession, form, period, filed date, unit, status, confidence, selection method, and components.
- `FIXED` Reported CFO less capex and EBIT-derived UFCF now have an explicit reconciliation and material residual flag.
- `FIXED` Optional tax, interest, asset, liability, retained-earnings, and income fields no longer become reported zeros when absent.
- `FIXED` Terminal ROIC now begins from a disclosed, capped historical accounting-ROIC convergence estimate and falls back to WACC when book capital is unusable.
- `FIXED` Automatic exit multiples now require at least three positive, non-extreme operational peers with acceptable dispersion and use the median.
- `PASS` Gordon growth validates WACC greater than growth and links terminal reinvestment to growth divided by terminal ROIC.
- `PASS` Exact five-year partial-period weighting and mid-year discounting have automated coverage.
- `PASS` Banks and insurers are blocked from the standard FCFF model.
- `FIXED` Applicability routing covers banks and insurers, REITs, pipeline biotech, digital-asset treasuries, persistent losses, insufficient history, unverified currency conversion, and loss-making issuers with capex above revenue.

## Data extraction and lineage

- `PASS` Canonical concept resolver enforces aggregate-versus-component precedence and prevents aggregate/component double counting.
- `PASS` Annual duration and instant contexts are validated; latest filing wins for duplicated period facts.
- `PASS` D&A, property depreciation, intangible amortization, contract-cost amortization, stock compensation, deferred tax, PP&E capex, intangible capex, and contract-cost assets have separate concepts.
- `LIMITATION` The public UI does not yet expose every taxonomy candidate or extension tag. Unresolved concepts remain unavailable and require filing review.
- `LIMITATION` Provider financials are displayed in USD, but provider FX translation dates are unavailable for some foreign issuers. Those DCFs are suppressed.

## Valuation model

- `PASS` Historical CFO-to-FCFF reconciliation shows the residual and known SBC, contract-cost, and deferred-tax drivers.
- `PASS` Contract-cost amortization is not included in D&A without the matching operating-asset investment. The signed other-operating-adjustment forecast stays separate and editable.
- `PASS` Terminal growth requires reinvestment equal to growth divided by terminal ROIC.
- `PASS` Invalid WACC, terminal, peer, share-count, calendar, and source-input conditions suppress a valuation instead of displaying zero as fair value.
- `FIXED` Stale saved assumptions with implausible WACC inputs are rejected.
- `FIXED` Total debt reconciles to current plus noncurrent debt in the enterprise-to-equity bridge.

## Applicability and edge cases

- `PASS` Every suppressed category explains the required alternative model or operating plan.
- `LIMITATION` Commodity producers and distressed issuers still require analyst judgment beyond deterministic industry labels. The site presents scenarios, not analyst targets.

## Verification matrix

- `PASS` ADSK regression validates filing 0000769397-26-000015: D&A $195M, contract-cost amortization $536M, contract-cost asset change $446M, SBC $788M, total capex $76M, and a disclosed cash-conversion residual.
- `PASS` Live API matrix replayed AAPL, MSFT, ADSK, CRWV, NIO, JPM, and SONY. Unit tests cover WMT fiscal alignment, banks/insurers, recent IPO history, foreign issuers, and revenue conflicts/restatements.
- `PASS` Browser replay confirms ADSK WACC 9.29%, perpetual-growth value $121.02, and suppressed exit method with only two usable peers.
- `PASS` Lint, TypeScript, 127 tests, native Excel-chart tests, and production build pass.
- `LIMITATION` A full analyst-grade forecast still requires current consensus for every operating line, current diluted securities, lease normalization, acquisition adjustments, and company-specific segment modeling that free data does not consistently provide.
