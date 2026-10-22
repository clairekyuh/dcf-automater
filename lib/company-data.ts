export type RiskLevel = "high" | "medium" | "low";

export type RiskItem = {
  level: RiskLevel;
  title: string;
  detail: string;
};

export type PricePoint = {
  date: string;
  close: number;
};

export type HistoricalRow = {
  year: string;
  fiscalDate?: string;
  missingFields?: string[];
  revenue: number;
  ebit: number;
  ebitMargin: number;
  operatingCashFlow: number;
  capex: number;
  capexPercentRevenue: number;
  depreciation: number;
  freeCashFlow: number;
  cash?: number;
  debt?: number;
  interestExpense?: number;
  incomeTax?: number;
  earningsBeforeTax?: number;
  netIncome?: number;
  currentAssets?: number;
  currentLiabilities?: number;
  totalAssets?: number;
  totalLiabilities?: number;
  retainedEarnings?: number;
  cogs?: number;
  grossMargin?: number;
  shortDebt?: number;
  longDebt?: number;
  revenueStatus?: "reported";
  revenueSource?: string;
  revenueSourceUrl?: string;
  revenueSourceAsOf?: string;
  revenueOriginalUnit?: string;
  revenueNormalizedUnit?: "USD millions";
  revenuePeriodType?: "full-year";
  revenueReconciliation?: "matched" | "conflicting";
};

export type FinancialConceptObservation = {
  concept: string;
  value: number | null;
  status: "reported" | "calculated" | "not-reported";
  confidence: "high" | "medium" | "low";
  method: "aggregate" | "component-sum" | "single-tag" | "unavailable";
  rawTags: string[];
  reason: string;
  originalUnit: string;
  normalizedUnit: string;
  components: Array<{
    tag: string;
    value: number;
    start: string | null;
    end: string;
    filed: string;
    accession: string | null;
    form: string;
    unit: string;
    originalUnit: string;
    normalizedUnit: string;
  }>;
};

export type RevenueReconciliation = {
  fiscalDate: string;
  secRevenue: number;
  nasdaqRevenue: number;
  differencePercent: number;
  status: "matched" | "conflicting";
};

export type RevenueInterimResult = {
  periodEnd: string;
  periodStart: string;
  periodType: "quarter" | "year-to-date";
  revenue: number;
  comparableRevenue: number | null;
  growth: number | null;
  source: string;
  sourceUrl: string;
  asOf: string;
};

export type RevenueDataQuality = {
  quality: "complete" | "partial" | "conflicting" | "unavailable";
  issues: string[];
  reconciliation: RevenueReconciliation[];
  historicalSourcePriority: string;
  latestInterim: RevenueInterimResult | null;
};

export type ComparableCompany = {
  ltmRevenue?: number | null;
  ltmEbitda?: number | null;
  financialsAsOf?: string;
  balanceAsOf?: string;
  forwardPeriodEnd?: string | null;
  retrievedAt?: string;
  sourceUrl?: string;
  preferredInterest?: number | null;
  dataNotes?: string[];
  symbol: string;
  name: string;
  description: string;
  sector: string;
  industry: string;
  marketCap: number | null;
  enterpriseValue?: number | null;
  revenueGrowth: number | null;
  operatingMargin: number | null;
  evToRevenue: number | null;
  evToEbitda: number | null;
  evToRevenueLtm?: number | null;
  evToRevenueNtm?: number | null;
  evToEbitdaLtm?: number | null;
  evToEbitdaNtm?: number | null;
  evToEbitLtm?: number | null;
  evToEbitNtm?: number | null;
  evToEbitdaLtmQuality?: "normal" | "extreme" | "not-meaningful" | "unavailable";
  evToEbitdaNtmQuality?: "normal" | "extreme" | "not-meaningful" | "unavailable";
  evToEbitLtmQuality?: "normal" | "extreme" | "not-meaningful" | "unavailable";
  evToEbitNtmQuality?: "normal" | "extreme" | "not-meaningful" | "unavailable";
  ltmBasis?: string | null;
  ntmBasis?: string | null;
  pe: number | null;
  peerFit?: "focus" | "direct" | "close" | "adjacent";
  businessModel?: string;
  manualAdded?: boolean;
  peerRationale?: string;
};

export type CustomerDisclosure = {
  customer: string;
  revenuePercent: number;
  disclosure: string;
};

export type BusinessAnalysis = {
  source: string;
  secStatus?: "available" | "unavailable";
  secUnavailableReason?: string | null;
  asOf: string | null;
  companyDescription: string;
  financials: {
    revenue: number | null;
    cogs: number | null;
    cogsPercentRevenue: number | null;
    grossProfit: number | null;
    grossMargin: number | null;
    operatingCashFlow: number | null;
    freeCashFlow: number | null;
    currentAssets: number | null;
    currentLiabilities: number | null;
    interestExpense: number | null;
    ebitda: number | null;
    netDebt: number | null;
  };
  customerConcentration: {
    disclosures: CustomerDisclosure[];
    noMajorCustomer: boolean;
    disclosureThreshold: number;
  };
  supplyChain: {
    stages: Array<{ name: string; detail: string }>;
    signals: RiskItem[];
    filingReviewed: boolean;
  };
  defaultRisk: {
    level: "high" | "moderate" | "low" | "insufficient";
    points: number;
    availableChecks?: number;
    drivers: string[];
    ratios: {
      debtToRevenue: number | null;
      netDebtToEbitda: number | null;
      currentRatio: number | null;
      interestCoverage: number | null;
      fcfToDebt: number | null;
    };
    altmanZ: number | null;
    altmanZone: string | null;
    altmanApplicable: boolean;
    altmanReason?: string;
    methodology: string;
  };
  filing: {
    form: string;
    filingDate: string;
    reportDate: string;
    url: string;
  } | null;
};

export type CompanyData = {
  missingFinancialInputs?: string[];
  coverage?: "valuation" | "full";
  retrievedAt?: string;
  source: string;
  asOf: string;
  qualityNotes?: string[];
  financialConcepts?: Record<string, FinancialConceptObservation> | null;
  cashFlowReconciliation?: {
    period: string;
    reportedFreeCashFlow: number;
    afterTaxInterest: number;
    reportedUfcfProxy: number;
    nopat: number;
    depreciationAndAmortization: number;
    capex: number;
    ebitDerivedBeforeOtherItems: number;
    residualCashConversion: number;
    residualPercentRevenue: number | null;
    status: "review" | "reconciled";
    knownDrivers: {
      shareBasedCompensation: number | null;
      contractCostAmortization: number | null;
      contractCostAssetChange: number | null;
      deferredTaxCashFlowAdjustment: number | null;
    };
    explanation: string;
  } | null;
  denomination?: { quoteCurrency: string; financialDisplayCurrency: string; issuerReportingCurrency: string; normalizationStatus: string; fxRate: number | null; fxAsOf: string | null; sourceUrl: string; ordinarySharesPerQuotedSecurity: number | null; securitySourceUrl: string | null; verifiedAt: string };
  shareBasis?: { annualDilutedShares: number | null; annualPeriodEnd: string | null; marketCapImpliedShares: number | null; currentFullyDilutedShares: number | null; status: string; securityRatio: number | null; sourceUrl: string | null };
  company: {
    symbol: string;
    name: string;
    description: string;
    descriptionSource?: string;
    ipoDate?: string | null;
    exchange: string;
    currency: string;
    country: string;
    sector: string;
    industry: string;
  };
  market: {
    marketCap: number;
    shares: number;
    sharesSource?: string;
    estimatedPrice: number;
    priceDate?: string | null;
    priceBasis?: string;
    beta: number;
    betaSource?: string;
    riskFreeRate?: number;
    riskFreeAsOf?: string;
    equityRiskPremium?: number;
    erpAsOf?: string;
    marketInputsSource?: string;
    priceHistory?: PricePoint[];
  };
  metrics: {
    revenueGrowth: number;
    revenue: number;
    ebitMargin: number;
    capexPercentRevenue: number;
    daPercentRevenue: number;
    cash: number;
    debt: number;
    shortDebt?: number;
    longDebt?: number;
    preferredInterest?: number;
    taxRate: number;
  };
  forecast?: {
    year1Revenue: number;
    year2Revenue: number;
    year1Growth: number;
    year2Growth: number;
    source: string;
    sourceUrl: string;
    asOf?: string;
    periods?: Array<{
      periodEnd: string;
      revenue: number;
      growth: number;
      status: "consensus";
      source: string;
      sourceUrl: string;
      asOf: string;
    }>;
  } | null;
  revenueData?: RevenueDataQuality;
  comparison?: {
    company: ComparableCompany;
    peers: ComparableCompany[];
    selectedPeerSymbols: string[];
    industryGrowthRate: number | null;
    nicheLabel?: string;
    selectionBasis?: string;
    industryExplanation?: string;
    operatingCompetitors?: string[];
  };
  businessAnalysis?: BusinessAnalysis;
  historical: HistoricalRow[];
};
