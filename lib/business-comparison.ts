export type BusinessComparable = {
  symbol: string;
  name: string;
  description: string;
  sector: string;
  industry: string;
  businessModel?: string;
  peerRationale?: string;
};

type BusinessComparisonInput = {
  company: BusinessComparable;
  peers: BusinessComparable[];
  nicheLabel?: string;
  capexPercentRevenue: number;
  operatingMargin: number | null;
  peerMedianMargin: number | null;
};

type BusinessDimension = { label: string; detail: string };

const nicheRules = [
  {
    match: /consumer devices and digital ecosystems/i,
    title: "Hardware, platform control, and services must be separated",
    revenue: "Separate device units and pricing from recurring services, app distribution, subscriptions, licensing, and advertising. Those streams have different growth, margins, and replacement cycles.",
    capital: "Distinguish outsourced manufacturing and supplier commitments from cloud data-center investment, content spending, retail inventory, and internally manufactured components.",
    valuation: "An installed-base ecosystem can support retention and services growth, but a hardware-led company should not automatically receive the same multiple as an advertising or enterprise-cloud platform.",
  },
  {
    match: /ai-native gpu cloud/i,
    title: "GPU-cloud peers differ most in asset ownership and contract quality",
    revenue: "Compare contracted GPU capacity, customer concentration, usage pricing, backlog conversion, managed software, and how much revenue comes from AI cloud rather than another activity such as crypto mining.",
    capital: "Separate companies that own data centers and power infrastructure from those that lease capacity or use financing partners. GPU refresh cycles, utilization, and financing terms drive free cash flow.",
    valuation: "Similar revenue growth can produce very different value when one company needs substantially more capex, carries more debt, or depends on fewer customers.",
  },
  {
    match: /electronic design automation|engineering software/i,
    title: "Design workflow, semiconductor IP, and end markets drive the comparison",
    revenue: "Separate core chip-design software, semiconductor IP royalties, verification tools, and broader engineering software. Recurring subscriptions and long design cycles can be more durable than transactional licenses.",
    capital: "The model is generally asset-light, but acquired intangibles, stock compensation, R&D intensity, and acquisition spending can differ substantially across peers.",
    valuation: "EDA tools embedded in semiconductor workflows can have stronger switching costs than adjacent design software, so peer multiples need to reflect product criticality and revenue mix.",
  },
  {
    match: /cybersecurity/i,
    title: "Security platform breadth and delivery model matter",
    revenue: "Compare cloud subscriptions, hardware appliances, endpoint seats, usage-based products, and professional services. Platform consolidation can affect both growth and retention.",
    capital: "Cybersecurity is usually asset-light, but sales efficiency, stock compensation, acquisitions, and cloud-hosting costs can create very different free-cash-flow profiles.",
    valuation: "High growth deserves less weight when it requires heavy sales spending or dilution; retention, platform adoption, and normalized operating margins are critical.",
  },
  {
    match: /accelerated-computing semiconductors|semiconductor products/i,
    title: "Chip architecture, manufacturing exposure, and software ecosystems differ",
    revenue: "Separate GPUs, CPUs, networking, custom silicon, licensing, and manufacturing revenue. Data-center exposure and consumer-device exposure carry different cycles.",
    capital: "Fabless designers rely on foundries and packaging partners, while integrated manufacturers fund fabrication plants. Inventory, purchase commitments, and process transitions change cash needs.",
    valuation: "A software ecosystem or design lead may support pricing power, but foundry dependence, product cycles, and customer concentration can make headline multiples misleading.",
  },
  {
    match: /data-center ownership|colocation/i,
    title: "Real-estate capacity is not the same business as cloud computing",
    revenue: "Compare long-term leases, colocation and interconnection fees, powered-shell contracts, and any managed computing services. Contract length and tenant concentration matter.",
    capital: "Land, buildings, electrical capacity, and construction pipelines require substantial capital. Funding structure and development yields are central to value.",
    valuation: "REIT and infrastructure economics should be judged using occupancy, development returns, leverage, and recurring rent—not a software-company multiple.",
  },
  {
    match: /public-cloud platforms/i,
    title: "Cloud economics are often hidden inside very different parent businesses",
    revenue: "Separate infrastructure cloud, enterprise software, advertising, e-commerce, databases, devices, and subscriptions. The consolidated growth rate may not represent the cloud segment.",
    capital: "AI servers and data centers require heavy investment, while advertising and software can be less capital intensive. Segment mix changes consolidated free cash flow.",
    valuation: "The same cloud growth can deserve different multiples depending on non-cloud businesses, margins, customer mix, and required infrastructure spending.",
  },
  {
    match: /enterprise application software/i,
    title: "Workflow ownership and revenue architecture drive software quality",
    revenue: "Compare seat subscriptions, usage pricing, maintenance, implementation services, and cloud infrastructure. Product category and customer size affect retention and growth.",
    capital: "Software is usually asset-light, but hosting costs, sales efficiency, acquisitions, and stock compensation can materially change per-share cash generation.",
    valuation: "Recurring revenue alone is not enough; net retention, pricing power, margin maturity, and dilution determine whether peer multiples are comparable.",
  },
  {
    match: /payments network|processors/i,
    title: "Networks, processors, merchant acquirers, and wallets are different models",
    revenue: "Separate network tolls, transaction processing, merchant acquiring, issuer services, and consumer-wallet economics. Take rates and credit exposure vary.",
    capital: "Payment networks can be asset-light, while processors carry integration costs and some providers assume lending, fraud, or working-capital risk.",
    valuation: "Volume growth is not directly comparable unless take rate, credit exposure, customer concentration, and incremental margins are also considered.",
  },
  {
    match: /banks/i,
    title: "Funding mix and balance-sheet risk define bank differences",
    revenue: "Compare lending spreads, deposits, card income, investment banking, trading, asset management, and wealth fees rather than treating total revenue as one stream.",
    capital: "Deposits and wholesale funding are operating inputs, while regulatory capital and credit losses constrain growth and distributions.",
    valuation: "Use return on equity, tangible book value, asset quality, capital ratios, and funding costs; industrial-company EV multiples and UFCF are not appropriate.",
  },
  {
    match: /insurance/i,
    title: "Underwriting mix and reserve risk matter more than headline growth",
    revenue: "Separate premiums by insurance line, underwriting income, investment income, and fee businesses. Pricing cycles and catastrophe exposure vary.",
    capital: "Claims reserves and regulatory capital are operating requirements; leverage and cash-flow measures used for industrial companies are not directly comparable.",
    valuation: "Compare loss ratios, reserve development, book value growth, returns on equity, and capital adequacy rather than relying on EV/EBITDA.",
  },
  {
    match: /biotechnology|pharmaceutical/i,
    title: "Patent durability and pipeline concentration determine comparability",
    revenue: "Separate established products, recently launched drugs, royalties, licensing, and pipeline assets. A similar growth rate can hide very different patent cliffs.",
    capital: "R&D, clinical trials, milestone payments, acquisitions, and manufacturing obligations replace traditional industrial capex as the major reinvestment needs.",
    valuation: "Risk-adjusted pipeline value, patent life, reimbursement, and product concentration matter more than a simple peer-average multiple.",
  },
  {
    match: /electric-vehicle|vehicle manufacturers/i,
    title: "Vehicle mix, manufacturing scale, and financing exposure differ",
    revenue: "Compare vehicle volumes and price mix with software, charging, services, energy products, and financing. Pure-EV and diversified manufacturers face different transitions.",
    capital: "Factories, tooling, batteries, inventory, warranties, and supplier commitments make utilization and production scale essential to free cash flow.",
    valuation: "A growth premium is difficult to justify without durable gross margins, efficient factories, manageable warranty costs, and credible demand at scale.",
  },
  {
    match: /oil and gas|energy production/i,
    title: "Upstream, refining, chemicals, and trading create different cycle exposure",
    revenue: "Separate production volumes and commodity prices from refining margins, chemicals, marketing, and trading. Integrated and pure-play producers respond differently to oil prices.",
    capital: "Reserve replacement, drilling productivity, project lead times, decommissioning, and maintenance spending determine sustainable free cash flow.",
    valuation: "Use normalized commodity prices and asset quality; a current-cycle earnings multiple can overstate or understate durable value.",
  },
  {
    match: /regulated electric utilities/i,
    title: "Regulatory jurisdiction and generation mix drive utility economics",
    revenue: "Compare regulated electric and gas operations, merchant generation, renewables, and customer growth. Allowed returns vary by jurisdiction.",
    capital: "Grid upgrades and generation projects create large, recurring capital needs funded with debt and equity under regulatory oversight.",
    valuation: "Rate-base growth is valuable only when projects earn allowed returns without excessive financing, construction, or political risk.",
  },
  {
    match: /telecommunications/i,
    title: "Wireless, fiber, cable, and media mixes are not interchangeable",
    revenue: "Compare subscriber revenue, equipment sales, broadband, enterprise connectivity, and media exposure. Churn and average revenue per user are key.",
    capital: "Spectrum, fiber, network equipment, and customer acquisition require sustained spending; leverage and coverage quality influence flexibility.",
    valuation: "Low churn and network quality can support durable cash flow, but high debt and continual network investment can limit equity value.",
  },
  {
    match: /retail/i,
    title: "Merchandise mix, format, and distribution economics drive retail differences",
    revenue: "Separate grocery, discretionary goods, memberships, advertising, marketplace fees, and e-commerce. Gross margin and repeat frequency vary by mix.",
    capital: "Stores, fulfillment centers, inventory turns, shrink, leases, and last-mile delivery shape cash conversion and reinvestment.",
    valuation: "Similar sales growth can have different value depending on membership income, inventory productivity, store economics, and online fulfillment costs.",
  },
  {
    match: /aerospace and defense/i,
    title: "Program mix, contract structure, and customer concentration matter",
    revenue: "Compare defense programs, commercial aerospace, aftermarket service, classified work, and fixed-price versus cost-plus contracts.",
    capital: "Long development programs, supplier advances, inventory, pension obligations, and contract assets can make cash flow diverge from reported earnings.",
    valuation: "Backlog quality and program execution matter more than backlog size alone; fixed-price overruns and government dependence change risk.",
  },
  {
    match: /industrial technology/i,
    title: "Product cycle, installed base, and service mix shape industrial quality",
    revenue: "Separate equipment, components, automation, software, and recurring aftermarket service. End-market exposure determines cyclicality.",
    capital: "Factories, inventory, working capital, acquisitions, and channel stocking can create very different cash conversion across peers.",
    valuation: "A larger installed base and service mix can support more durable margins, while project concentration and cyclical equipment sales deserve lower confidence.",
  },
] as const;

const applePeerModels: Record<string, string> = {
  AAPL: "Apple is centered on premium devices, its own operating systems and silicon roadmap, app distribution, and services sold into a large installed base.",
  GOOGL: "Alphabet is primarily advertising-funded through Search and YouTube, with Google Cloud, Android, subscriptions, and devices as additional businesses.",
  GOOG: "Alphabet is primarily advertising-funded through Search and YouTube, with Google Cloud, Android, subscriptions, and devices as additional businesses.",
  MSFT: "Microsoft is centered on enterprise software and cloud infrastructure through Microsoft 365, Azure, Windows, Dynamics, LinkedIn, and gaming.",
  SONY: "Sony combines PlayStation gaming hardware and network services with entertainment content, image sensors, and consumer electronics.",
};

function concise(value: string, limit = 300) {
  const clean = String(value || "").replace(/\s+/g, " ").trim();
  if (!clean) return "A sufficiently detailed business description was not available.";
  const sentences = clean.match(/[^.!?]+[.!?]+/g) || [clean];
  const result = sentences.slice(0, 2).join(" ").trim();
  if (result.length <= limit) return result;
  const shortened = result.slice(0, limit - 1);
  return `${shortened.slice(0, shortened.lastIndexOf(" ")).trim()}…`;
}

function number(value: number | null) {
  return value === null || !Number.isFinite(value) ? null : new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}

export function buildBusinessComparison(input: BusinessComparisonInput) {
  const context = `${input.nicheLabel || ""} ${input.company.industry} ${input.company.sector} ${input.company.description}`;
  const rule = nicheRules.find((item) => item.match.test(context)) || {
    title: "Revenue model, customers, and reinvestment need separate review",
    revenue: "Compare what each company sells, who pays, whether revenue is recurring or transactional, and which products or customers produce most of the economics.",
    capital: "Compare physical assets, inventory, working capital, acquisitions, stock compensation, and other reinvestment that may not appear in the same accounting line.",
    valuation: "Do not apply a peer multiple mechanically when growth durability, margins, capital intensity, geography, or customer concentration differ.",
  };
  const apple = input.company.symbol === "AAPL";
  const capex = number(input.capexPercentRevenue);
  const companyMargin = number(input.operatingMargin);
  const peerMargin = number(input.peerMedianMargin);
  const observedEconomics = companyMargin !== null && peerMargin !== null
    ? `${input.company.symbol}’s latest operating margin is ${companyMargin}% versus a ${peerMargin}% peer median.`
    : "A reliable company-versus-peer operating-margin comparison was unavailable.";
  const capexContext = capex === null
    ? "A reliable capex-to-revenue observation was unavailable."
    : `${input.company.symbol}’s latest capex equals ${capex}% of revenue; this ratio does not capture acquisitions, supplier commitments, leases, or stock compensation.`;

  const peerModels = input.peers.slice(0, 3).map((peer) => ({
    symbol: peer.symbol,
    name: peer.name,
    detail: applePeerModels[peer.symbol] || concise(peer.description || peer.peerRationale || peer.businessModel || ""),
  }));
  const companyModel = apple
    ? applePeerModels.AAPL
    : concise(input.company.description || input.company.businessModel || "");
  const summary = apple
    ? "Apple is not simply another large technology platform. Its economics start with premium device sales, but control of hardware, operating systems, custom silicon, app distribution, retail channels, and attached services lets it monetize the same installed base repeatedly. Alphabet is much more advertising-funded, Microsoft is more enterprise-software and cloud driven, and Sony has greater gaming, content, and image-sensor exposure."
    : `${companyModel} The selected peers operate in the same broad niche, but the comparison should be anchored to the specific revenue engine, customer relationship, and reinvestment model shown below—not the industry label alone.`;

  const dimensions: BusinessDimension[] = [
    { label: "Revenue engine", detail: apple ? "Device volume and price mix create the installed base; services, app distribution, subscriptions, licensing, and accessories increase revenue per user over time. That differs from advertising-led or enterprise-seat models." : rule.revenue },
    { label: "Capital and cost structure", detail: `${apple ? "Apple outsources most assembly but still carries inventory, tooling, supplier commitments, logistics exposure, retail assets, and data-center investment." : rule.capital} ${capexContext}` },
    { label: "Why valuation can differ", detail: `${apple ? "Apple’s multiple depends on device replacement cycles, installed-base retention, services attach rates, pricing power, regulation of app distribution, and the durability of its integrated ecosystem." : rule.valuation} ${observedEconomics}` },
  ];

  return {
    title: apple ? "Apple combines premium hardware with a controlled ecosystem and recurring services" : `${input.company.symbol}: ${rule.title}`,
    summary,
    dimensions,
    peerModels,
    ruleTitle: rule.title,
  };
}
