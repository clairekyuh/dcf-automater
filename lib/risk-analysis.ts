import type { CompanyData, HistoricalRow, RiskItem, RiskLevel } from "@/lib/company-data";
import type { DcfModel } from "@/lib/dcf-engine";

export type RiskValuationResult = {
  valid: boolean;
  perShare: number;
  terminalShare: number;
  terminalForecastFcf: number;
  terminalFcf: number;
};

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

function moveFromPrice(value: number, price: number) {
  const change = price ? (value / price - 1) * 100 : 0;
  return { change, label: change >= 0 ? "Upside" : "Downside" };
}

export function geopoliticalExposure(data: CompanyData): RiskItem {
  const country = data.company.country || "Domicile unavailable";
  const domicileKnown = !/unavailable|unknown|unclassified/i.test(country);
  const businessNiche = data.comparison?.nicheLabel || data.company.industry || data.company.sector;
  const context = `${businessNiche} ${data.company.industry} ${data.company.sector} ${data.company.description}`;
  const filingSignal = data.businessAnalysis?.supplyChain.signals.find((signal) =>
    /geographic|china|taiwan|export|sanction|trade/i.test(`${signal.title} ${signal.detail}`),
  );
  const countryRisk = /china|russia|taiwan|ukraine|israel/i.test(country);
  let sensitiveIndustry = false;
  let channel = domicileKnown
    ? `The automated data does not identify an obvious geopolitically sensitive business model. The main unanswered questions are how much revenue, sourcing, and operating capacity sit outside ${country}.`
    : "The company domicile could not be verified from the available metadata, so the model cannot reliably classify country-specific sanctions, trade, tax, or operating exposure.";

  if (/ai[- ]native|gpu cloud|accelerated[- ]compute|data center/i.test(context)) {
    sensitiveIndustry = true;
    channel = "The practical exposures are advanced-GPU export controls, a concentrated Asian chip supply chain, and country-specific power and data-center rules. Restrictions or conflict could delay server deliveries, raise equipment costs, or limit which customers the company can serve.";
  } else if (/electronic design automation|semiconductor ip|chip[- ]design/i.test(context)) {
    sensitiveIndustry = true;
    channel = "The practical exposures are export-license restrictions on chip-design software or IP, especially for certain Chinese customers, plus dependence on a semiconductor ecosystem concentrated in Taiwan and East Asia. Those restrictions can reduce sales or disrupt customers' product schedules.";
  } else if (/semiconductor|chip|foundr/i.test(context)) {
    sensitiveIndustry = true;
    channel = "The practical exposures are fabrication and packaging capacity concentrated in East Asia, restrictions on advanced-chip sales to China, and limits on semiconductor equipment exports. A disruption can reduce available supply, delay launches, or increase input costs.";
  } else if (/aerospace|defense/i.test(context)) {
    sensitiveIndustry = true;
    channel = "The practical exposures are government procurement decisions, sanctions, export licenses, and restrictions on selling sensitive products across borders. These can delay contracts or prevent sales to particular customers and countries.";
  } else if (/oil|gas|energy|mining|commodity/i.test(context)) {
    sensitiveIndustry = true;
    channel = "The practical exposures are sanctions, resource nationalism, cross-border pipelines or shipping routes, and local taxes or royalties. These can interrupt production, raise transport costs, or restrict access to markets.";
  } else if (/shipping|freight|maritime/i.test(context)) {
    sensitiveIndustry = true;
    channel = "The practical exposures are wars and sanctions that close trade routes, port restrictions, and disruption at shipping chokepoints. These can lengthen routes, raise fuel and insurance costs, or reduce shipment volumes.";
  } else if (/cloud|software|internet|telecom/i.test(context)) {
    channel = "The main cross-border exposures are data-localization laws, privacy rules, sanctions, and government restrictions on digital services. These can require local infrastructure, increase compliance costs, or block service in a market.";
  } else if (/electric[- ]vehicle|automotive|automobile|vehicle manufactur|auto manufactur/i.test(context)) {
    sensitiveIndustry = true;
    channel = "The practical exposures are tariffs and local-content rules on vehicles and batteries, export controls affecting advanced chips, and dependence on cross-border battery-material and semiconductor supply chains. These can restrict market access, raise component costs, or require additional local manufacturing investment.";
  }

  if (/china/i.test(country)) {
    channel = `As a China-domiciled issuer, the company may also be affected by U.S.–China trade restrictions, Chinese industrial and data regulation, U.S. listing and audit requirements, and RMB/USD movements. ${channel}`;
  } else if (/russia|ukraine|israel|taiwan/i.test(country)) {
    channel = `The stated domicile itself creates elevated conflict, sanctions, trade-route, or market-access exposure. ${channel}`;
  }

  if (filingSignal) channel = `${filingSignal.detail} ${channel}`;

  const level: RiskLevel = countryRisk ? "high" : !domicileKnown || filingSignal || sensitiveIndustry ? "medium" : "low";
  const evidenceLimit = data.businessAnalysis?.supplyChain.filingReviewed
    ? "This screen reviewed the latest annual filing, but it does not calculate revenue or supplier percentages by country."
    : "A parseable annual filing was not available, so this screen uses only the reported domicile and business type—not revenue or supplier percentages by country.";
  return {
    level,
    title: "Geopolitical and cross-border exposure",
    detail: `For ${data.company.symbol}, the available company metadata lists the domicile as ${country} and identifies the business as ${businessNiche}. ${channel} This matters to the DCF because it can lower revenue growth or increase capex and operating costs. ${evidenceLimit}`,
  };
}

export function riskAnalysis(data: CompanyData, model: DcfModel, perpetuity: RiskValuationResult, multiple: RiskValuationResult): RiskItem[] {
  const risks: RiskItem[] = [];
  const capex = data.metrics.capexPercentRevenue;
  risks.push({ level: capex > 12 ? "high" : capex > 6 ? "medium" : "low", title: "Capital intensity", detail: `${fmt.format(capex)}% of latest revenue was spent on capex. High reinvestment can prevent accounting profit from becoming distributable cash.` });
  const leverage = data.metrics.debt / Math.max(data.metrics.revenue, 1);
  risks.push({ level: leverage > 1 ? "high" : leverage > .45 ? "medium" : "low", title: "Balance-sheet leverage", detail: `Debt equals ${fmt.format(leverage * 100)}% of annual revenue. Refinancing risk rises if rates increase or earnings deteriorate.` });
  const terminalShares = [perpetuity.valid ? perpetuity.terminalShare : null, multiple.valid ? multiple.terminalShare : null].filter((value): value is number => value !== null);
  const terminalShare = terminalShares.length ? Math.max(...terminalShares) : 100;
  const terminalDetail = `${perpetuity.valid ? `${fmt.format(perpetuity.terminalShare)}% of perpetual-growth enterprise value` : "The perpetual-growth method is currently invalid"}; ${multiple.valid ? `${fmt.format(multiple.terminalShare)}% of exit-multiple enterprise value` : "the exit-multiple method is currently invalid"}. Terminal value represents cash flows beyond Year 5.`;
  risks.push({ level: terminalShare > 80 ? "high" : terminalShare > 65 ? "medium" : "low", title: "Terminal-value dependence", detail: terminalDetail });
  if (perpetuity.valid && Math.abs(perpetuity.terminalForecastFcf) > 1) {
    const normalizationChange = (perpetuity.terminalFcf / perpetuity.terminalForecastFcf - 1) * 100;
    if (Math.abs(normalizationChange) > 25) {
      risks.push({
        level: Math.abs(normalizationChange) > 75 ? "high" : "medium",
        title: "Terminal cash-flow normalization",
        detail: `The explicit Year-5 forecast produces ${usd0.format(perpetuity.terminalForecastFcf)}M of UFCF, while the perpetual formula uses ${usd0.format(perpetuity.terminalFcf)}M after linking mature growth to required reinvestment at terminal ROIC—a ${fmt.format(Math.abs(normalizationChange))}% ${normalizationChange >= 0 ? "increase" : "decrease"}. A large step means explicit capex, D&A, working capital, or margins have not fully converged to the terminal economics. Extend or revise the fade rather than accepting the jump without evidence.`,
      });
    }
  }
  risks.push(geopoliticalExposure(data));
  const marginRows = data.historical.filter((row) => Number.isFinite(row.ebitMargin));
  const lowMarginRow = marginRows.reduce<HistoricalRow | null>((lowest, row) => !lowest || row.ebitMargin < lowest.ebitMargin ? row : lowest, null);
  const highMarginRow = marginRows.reduce<HistoricalRow | null>((highest, row) => !highest || row.ebitMargin > highest.ebitMargin ? row : highest, null);
  const spread = lowMarginRow && highMarginRow ? highMarginRow.ebitMargin - lowMarginRow.ebitMargin : 0;
  const modeledMargin = model.forecastDrivers[5]?.ebitMargin ?? data.metrics.ebitMargin;
  const marginDetail = lowMarginRow && highMarginRow
    ? `EBIT margin ranged from ${fmt.format(lowMarginRow.ebitMargin)}% in ${lowMarginRow.year} to ${fmt.format(highMarginRow.ebitMargin)}% in ${highMarginRow.year}, a ${fmt.format(spread)} percentage-point swing. The final explicit forecast assumes ${fmt.format(modeledMargin)}%. A wide historical range means operating profit—and therefore free cash flow—may be harder to forecast reliably.`
    : `There was not enough historical EBIT-margin data to judge stability. The final explicit forecast assumes ${fmt.format(modeledMargin)}%, so verify that assumption against company guidance and a full business cycle.`;
  risks.push({ level: spread > 15 ? "high" : spread > 7 ? "medium" : "low", title: "Operating-margin consistency", detail: marginDetail });
  const marginExpansion = modeledMargin - data.metrics.ebitMargin;
  if (data.metrics.ebitMargin < 0 || marginExpansion > 10) {
    risks.push({
      level: "high",
      title: "Turnaround assumption",
      detail: `The automatic scenario moves EBIT margin from ${fmt.format(data.metrics.ebitMargin)}% in the latest reported period to ${fmt.format(modeledMargin)}% in the final explicit year, a ${fmt.format(marginExpansion)} percentage-point change. This is a website-generated scenario—not analyst consensus. Validate the timing, capacity utilization, pricing, cost structure, and funding needed to achieve it before relying on either valuation method.`,
    });
  }
  if (perpetuity.valid && multiple.valid) {
    const methodSpread = Math.abs(perpetuity.perShare - multiple.perShare) / Math.max(Math.min(perpetuity.perShare, multiple.perShare), .01) * 100;
    if (methodSpread > 25) {
      risks.push({
        level: methodSpread > 75 ? "high" : "medium",
        title: "Terminal-method disagreement",
        detail: `The perpetual-growth scenario gives ${usd.format(perpetuity.perShare)} per share while the exit-multiple scenario gives ${usd.format(multiple.perShare)}, a ${fmt.format(methodSpread)}% spread relative to the lower result. This usually means the selected terminal multiple implies different mature growth, margins, reinvestment, or returns than the perpetual model. Do not average the two mechanically; reconcile the terminal assumptions first.`,
      });
    }
  }
  const validValues = [...(multiple.valid ? [multiple.perShare] : []), ...(perpetuity.valid ? [perpetuity.perShare] : [])];
  if (!validValues.length) {
    risks.push({ level: "high", title: "Room for forecast error", detail: "Neither terminal method currently has valid assumptions, so the model cannot calculate a valuation cushion. Correct the invalid WACC, growth, ROIC, EBITDA, multiple, or share-count input first." });
    return risks;
  }
  const lowValue = Math.min(...validValues);
  const highValue = Math.max(...validValues);
  const conservativeMove = moveFromPrice(lowValue, model.marketPrice);
  const valuationDetail = model.marketPrice <= 0
    ? `The two DCF methods imply ${usd.format(lowValue)}–${usd.format(highValue)} per share, but a valid market price was unavailable, so the model cannot measure room for forecast error.`
    : conservativeMove.change >= 0
      ? `The lower of the two DCF estimates is ${usd.format(lowValue)}, which is ${fmt.format(conservativeMove.change)}% above the ${usd.format(model.marketPrice)} market-price input. That difference is the room for forecast error: the conservative estimate exceeds the price by ${usd.format(lowValue - model.marketPrice)} per share. The other method gives ${usd.format(highValue)}.`
      : `The lower of the two DCF estimates is ${usd.format(lowValue)}, which is ${fmt.format(Math.abs(conservativeMove.change))}% below the ${usd.format(model.marketPrice)} market-price input. On the more conservative method, the stock price already exceeds estimated value, so there is no margin of safety. The other method gives ${usd.format(highValue)}.`;
  const evidenceLevel: RiskLevel = !data.forecast ? "high" : data.businessAnalysis?.filing ? "low" : "medium";
  const priceLevel: RiskLevel = conservativeMove.change < 10 ? "high" : conservativeMove.change < 25 ? "medium" : "low";
  const rank = { low: 0, medium: 1, high: 2 } as const;
  const level = rank[evidenceLevel] > rank[priceLevel] ? evidenceLevel : priceLevel;
  const evidenceDetail = !data.forecast
    ? " No validated revenue forecast was available, so a large numerical upside does not create a dependable margin of safety."
    : data.businessAnalysis?.filing
      ? " Filing data was available, but the forecast still requires analyst judgment."
      : " SEC filing data was unavailable for this load, so the apparent cushion receives at least a medium-risk label.";
  risks.push({ level, title: "Room for forecast error", detail: `${valuationDetail}${evidenceDetail}` });
  return risks;
}

export function financialSectorRiskAnalysis(data: CompanyData): RiskItem[] {
  const filingAvailable = Boolean(data.businessAnalysis?.filing);
  const evidence = filingAvailable
    ? "The latest filing was available, but this screen does not extract regulatory schedules or loan/insurance reserve tables."
    : "The SEC filing feed was unavailable, so no institution-specific regulatory ratios were verified.";
  return [
    {
      level: "high",
      title: "Valuation-method limitation",
      detail: "A standard enterprise-value UFCF DCF is intentionally disabled because debt and interest are operating inputs for banks and insurers. Use residual income, dividend discount, excess return, or price-to-tangible-book analysis tied to regulatory capital instead.",
    },
    {
      level: "medium",
      title: "Capital adequacy",
      detail: `Review CET1 and total capital ratios, risk-weighted-asset growth, stress-test buffers, and the capacity to return capital. A thin buffer can constrain dividends and balance-sheet growth. ${evidence}`,
    },
    {
      level: "medium",
      title: "Credit quality and reserves",
      detail: `Review nonperforming assets, net charge-offs, criticized loans, reserve coverage, underwriting vintages, and sector concentrations. Losses above reserved levels reduce book value and distributable earnings. ${evidence}`,
    },
    {
      level: "medium",
      title: "Funding, liquidity, and rate sensitivity",
      detail: `Review uninsured deposits, deposit beta, wholesale funding, available liquidity, securities duration, accumulated other comprehensive income, and net-interest-income sensitivity. Deposit flight or adverse rate moves can compress earnings or force asset sales. ${evidence}`,
    },
    {
      level: "medium",
      title: "Regulatory and conduct exposure",
      detail: "Capital rules, consumer-protection actions, anti-money-laundering controls, litigation, and resolution requirements can change allowable growth, expenses, and capital distributions.",
    },
    geopoliticalExposure(data),
  ];
}
