export type PeerFit = "direct" | "close" | "adjacent";

export type PeerRationale = {
  fit: PeerFit;
  businessModel: string;
  detail: string;
};

export type PeerSet = {
  id: string;
  label: string;
  basis: string;
  symbols: string[];
  patterns: RegExp[];
  operatingCompetitors?: string[];
  rationales?: Record<string, PeerRationale>;
};

export type PeerCompanyInput = {
  symbol: string;
  sector: string;
  industry: string;
  name: string;
  description: string;
};

const peerSets: PeerSet[] = [
  {
    id: "ai-cloud",
    label: "AI-native GPU cloud infrastructure",
    basis: "Companies offering GPU compute or high-density AI infrastructure are more economically comparable than diversified software vendors. Hyperscalers are shown separately as operating competitors because their cloud economics are buried inside much larger businesses.",
    symbols: ["CRWV", "NBIS", "IREN", "APLD"],
    patterns: [/\bai[- ]native\b/i, /\bai cloud\b/i, /\bgpu\b.{0,45}\b(cloud|compute|infrastructure)\b/i, /\b(cloud|compute)\b.{0,45}\b(ai|gpu)\b/i, /purpose-built.{0,35}\bai\b/i, /accelerated[- ]compute/i],
    operatingCompetitors: ["MSFT", "AMZN", "GOOGL", "ORCL"],
    rationales: {
      CRWV: { fit: "direct", businessModel: "Purpose-built AI cloud platform", detail: "Purpose-built AI cloud combining GPU infrastructure, networking, storage, orchestration, and managed software." },
      NBIS: { fit: "direct", businessModel: "Full-stack AI-native cloud", detail: "Full-stack AI-native cloud with GPU compute, data centers, orchestration, storage, and managed AI services." },
      IREN: { fit: "close", businessModel: "AI cloud and power-dense data centers", detail: "Provides GPU AI-cloud services and owns power-dense data centers, but still has a material Bitcoin-mining business." },
      APLD: { fit: "adjacent", businessModel: "AI/HPC data-center developer", detail: "Builds and leases high-density AI/HPC data centers; it is closer to an infrastructure landlord than a full-stack cloud platform." },
    },
  },
  { id: "consumer-ecosystems", label: "Consumer devices and digital ecosystems", basis: "No public company mirrors the full business mix, so the group emphasizes consumer hardware, operating systems, services, and ecosystem reach.", symbols: ["AAPL", "GOOGL", "MSFT", "SONY"], patterns: [/consumer electronics/i, /smartphone/i, /personal technology/i, /devices and services/i] },
  { id: "electric-vehicles", label: "Electric-vehicle manufacturers", basis: "Peers design and manufacture electric vehicles and share exposure to factory utilization, battery costs, pricing, and vehicle demand.", symbols: ["TSLA", "RIVN", "LCID", "NIO"], patterns: [/electric vehicle/i, /\bev manufacturer/i, /battery electric/i] },
  { id: "eda", label: "Electronic design automation and engineering software", basis: "Peers sell mission-critical engineering tools with specialized IP, long product cycles, and workflow switching costs.", symbols: ["SNPS", "CDNS", "ADSK", "PTC"], patterns: [/electronic design automation/i, /semiconductor ip/i, /engineering.{0,20}software/i] },
  { id: "cybersecurity", label: "Enterprise cybersecurity platforms", basis: "Peers sell security software and platforms with recurring revenue, large-enterprise distribution, and high product-integration costs.", symbols: ["PANW", "CRWD", "FTNT", "ZS"], patterns: [/cybersecurity/i, /network security/i, /cloud security/i, /endpoint security/i] },
  { id: "gpu-semiconductors", label: "Accelerated-computing semiconductors", basis: "Peers compete through chip architecture, performance, software ecosystems, manufacturing access, and product cycles.", symbols: ["NVDA", "AMD", "AVGO", "INTC"], patterns: [/graphics processing/i, /\bgpu\b/i, /accelerated computing/i, /semiconductor/i] },
  { id: "data-centers", label: "Data-center ownership and colocation", basis: "Peers monetize power, buildings, interconnection, and leased data-center capacity rather than primarily selling software.", symbols: ["EQIX", "DLR", "IRM", "APLD"], patterns: [/colocation/i, /data center (reit|operator|hosting|infrastructure)/i, /leased data center/i] },
  { id: "public-cloud", label: "Diversified public-cloud platforms", basis: "Peers operate broad cloud-computing platforms spanning compute, storage, databases, software, and developer services.", symbols: ["MSFT", "AMZN", "GOOGL", "ORCL"], patterns: [/public cloud/i, /cloud computing platform/i, /hyperscaler/i, /cloud infrastructure services/i] },
  { id: "enterprise-software", label: "Enterprise application software", basis: "Peers primarily sell standardized, recurring software used across business workflows.", symbols: ["CRM", "NOW", "WDAY", "ORCL"], patterns: [/enterprise software/i, /software as a service/i, /\bsaas\b/i, /business applications/i, /prepackaged software/i] },
  { id: "payments", label: "Digital payments networks and processors", basis: "Peers monetize payment volume, merchant acceptance, transaction processing, and network scale.", symbols: ["V", "MA", "PYPL", "FI"], patterns: [/payment network/i, /payment processing/i, /digital payments/i, /merchant acquiring/i] },
  { id: "banks", label: "Large diversified banks", basis: "Peers are compared on lending, deposits, capital, credit quality, and fee-generating financial services.", symbols: ["JPM", "BAC", "WFC", "C"], patterns: [/\bbank\b/i, /consumer banking/i, /commercial banking/i] },
  { id: "insurance", label: "Property and casualty insurance", basis: "Peers underwrite similar risks and are evaluated using premiums, loss ratios, reserves, and investment income.", symbols: ["CB", "PGR", "ALL", "TRV"], patterns: [/property.{0,10}casualty/i, /insurance underwriting/i, /\binsurance\b/i] },
  { id: "biotech", label: "Large-cap biotechnology", basis: "Peers depend on patented medicines, clinical pipelines, regulatory outcomes, and research productivity.", symbols: ["AMGN", "GILD", "REGN", "VRTX"], patterns: [/biotechnology/i, /biopharma/i, /therapeutic/i] },
  { id: "pharma", label: "Global pharmaceutical companies", basis: "Peers commercialize broad medicine portfolios and are compared on pipeline durability, patent exposure, and global distribution.", symbols: ["MRK", "PFE", "ABBV", "BMY"], patterns: [/pharmaceutical/i, /prescription medicine/i] },
  { id: "automotive", label: "Global vehicle manufacturers", basis: "Peers manufacture and finance vehicles, with similar exposure to production scale, pricing, demand cycles, and capital intensity.", symbols: ["GM", "F", "TM", "HMC"], patterns: [/automotive/i, /automobile manufacturer/i, /vehicles and mobility/i] },
  { id: "energy", label: "Oil and gas producers", basis: "Peers are exposed to commodity prices, production costs, reserve replacement, and capital discipline.", symbols: ["XOM", "CVX", "COP", "EOG"], patterns: [/oil and gas/i, /petroleum/i, /hydrocarbon/i, /energy exploration/i] },
  { id: "utilities", label: "Regulated electric utilities", basis: "Peers earn regulated returns on capital-intensive electricity networks and generation assets.", symbols: ["NEE", "DUK", "SO", "AEP"], patterns: [/electric utility/i, /regulated utility/i, /power utility/i] },
  { id: "telecom", label: "Telecommunications networks", basis: "Peers monetize wireless, broadband, and communications networks with similar capital intensity and subscriber economics.", symbols: ["VZ", "T", "TMUS", "CHTR"], patterns: [/telecommunications/i, /wireless network/i, /broadband services/i] },
  { id: "retail", label: "Large-format and general retail", basis: "Peers compete through merchandise, purchasing scale, stores, logistics, memberships, and consumer pricing.", symbols: ["WMT", "COST", "TGT", "AMZN"], patterns: [/general merchandise/i, /discount retail/i, /membership warehouse/i, /\bretail\b/i] },
  { id: "aerospace", label: "Aerospace and defense contractors", basis: "Peers share long program cycles, government customers, backlogs, engineering requirements, and contract execution risk.", symbols: ["RTX", "LMT", "NOC", "GD"], patterns: [/aerospace/i, /defense contractor/i, /defence contractor/i] },
  { id: "industrials", label: "Diversified industrial technology", basis: "Peers sell engineered equipment and services with exposure to industrial cycles, backlogs, and operating leverage.", symbols: ["HON", "ETN", "EMR", "ROK"], patterns: [/industrial technology/i, /industrial automation/i, /engineered products/i, /manufacturing solutions/i] },
];

const exactPeerSet: Record<string, string> = {
  CRWV: "ai-cloud", NBIS: "ai-cloud", IREN: "ai-cloud", APLD: "ai-cloud",
  SNPS: "eda", CDNS: "eda", ADSK: "eda", PTC: "eda", NVDA: "gpu-semiconductors", AMD: "gpu-semiconductors", AVGO: "gpu-semiconductors", INTC: "gpu-semiconductors",
  PANW: "cybersecurity", CRWD: "cybersecurity", FTNT: "cybersecurity", ZS: "cybersecurity", EQIX: "data-centers", DLR: "data-centers", IRM: "data-centers",
  AAPL: "consumer-ecosystems", TSLA: "electric-vehicles", RIVN: "electric-vehicles", LCID: "electric-vehicles",
  XOM: "energy", CVX: "energy", COP: "energy", EOG: "energy",
  JPM: "banks", BAC: "banks", WFC: "banks", C: "banks",
  CB: "insurance", PGR: "insurance", ALL: "insurance", TRV: "insurance",
  WMT: "retail", COST: "retail", TGT: "retail",
  GOOGL: "public-cloud", GOOG: "public-cloud", MSFT: "public-cloud", AMZN: "public-cloud", ORCL: "public-cloud",
  NEE: "utilities", DUK: "utilities", SO: "utilities", AEP: "utilities",
  VZ: "telecom", T: "telecom", TMUS: "telecom", CHTR: "telecom",
  MRK: "pharma", PFE: "pharma", ABBV: "pharma", BMY: "pharma", JNJ: "pharma",
  AMGN: "biotech", GILD: "biotech", REGN: "biotech", VRTX: "biotech",
};

export function selectPeerSet(company: PeerCompanyInput) {
  const text = `${company.name} ${company.sector} ${company.industry} ${company.description}`;
  const exact = exactPeerSet[company.symbol];
  const ranked = peerSets
    .map((set) => ({ set, score: set.patterns.reduce((sum, pattern) => sum + (pattern.test(text) ? 1 : 0), 0) + (set.id === exact ? 100 : 0) }))
    .sort((a, b) => b.score - a.score);
  const sectorFallback = /energy|oil|gas/i.test(text) ? "energy"
    : /bank/i.test(text) ? "banks"
      : /insurance/i.test(text) ? "insurance"
        : /utility/i.test(text) ? "utilities"
          : /telecom/i.test(text) ? "telecom"
            : /pharma/i.test(text) ? "pharma"
              : /biotech/i.test(text) ? "biotech"
                : /retail/i.test(text) ? "retail"
                  : /aerospace|defense/i.test(text) ? "aerospace"
                    : /industrial|manufactur/i.test(text) ? "industrials"
                      : null;
  const selectedId = exact || (ranked[0]?.score > 0 ? ranked[0].set.id : sectorFallback);
  const selected = selectedId ? peerSets.find((set) => set.id === selectedId) : undefined;
  if (!selected) {
    return {
      id: "unclassified",
      label: `${company.industry || company.sector || "Company"}—peer set not validated`,
      basis: "The automatic classifier did not find a sufficiently specific business-model match, so it did not substitute an unrelated software peer group. Select comparables manually before relying on relative valuation.",
      symbols: [] as string[],
      patterns: [] as RegExp[],
      rationales: undefined,
      operatingCompetitors: [] as string[],
      industryExplanation: `${company.industry} is the reported market classification. A narrower public-company peer group could not be validated automatically.`,
      classificationConfidence: "low" as const,
    };
  }
  const symbols = selected.symbols.filter((candidate) => candidate !== company.symbol).slice(0, 3);
  return {
    ...selected,
    symbols,
    classificationConfidence: exact ? "high" as const : "medium" as const,
    industryExplanation: /prepackaged software/i.test(company.industry)
      ? `“Prepackaged software” is a broad legacy classification for standardized software developed for multiple customers. It does not mean boxed software, and it may not describe ${selected.label} economics very well.`
      : `${company.industry} is the reported market classification. The peer set is narrowed using the company description and business model: ${selected.label.toLowerCase()}.`,
  };
}
