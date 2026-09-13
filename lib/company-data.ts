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
  revenue: number;
  ebit: number;
  ebitMargin: number;
  operatingCashFlow: number;
  capex: number;
  capexPercentRevenue: number;
  depreciation: number;
  freeCashFlow: number;
  debt?: number;
  interestExpense?: number;
  incomeTax?: number;
  earningsBeforeTax?: number;
  netIncome?: number;
  cogs?: number;
  grossMargin?: number;
  shortDebt?: number;
  longDebt?: number;
};

export type ComparableCompany = {
  symbol: string;
  name: string;
  description: string;
  sector: string;
  industry: string;
  marketCap: number | null;
  revenueGrowth: number | null;
  operatingMargin: number | null;
  evToRevenue: number | null;
  evToEbitda: number | null;
  pe: number | null;
  peerFit?: "focus" | "direct" | "close" | "adjacent";
  businessModel?: string;
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
  source: string;
  asOf: string;
  qualityNotes?: string[];
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
  } | null;
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
