type CompanyDescriptionInput = {
  symbol?: string;
  name: string;
  description?: string | null;
  sector?: string | null;
  industry?: string | null;
};

const establishedSummaries: Record<string, string> = {
  AAPL: "Apple designs and sells consumer electronics, including the iPhone, Mac, iPad, Apple Watch, and AirPods. It also provides software and services such as the App Store, iCloud, Apple Music, and Apple Pay.",
  ADBE: "Adobe develops software for creating, editing, publishing, and measuring digital content. Its main products include Creative Cloud, Document Cloud, Acrobat, and digital-marketing and commerce tools in Experience Cloud.",
  AMZN: "Amazon operates an online retail marketplace, sells products directly, provides fulfillment and advertising services, and runs the AWS cloud-computing business. It also operates subscription, entertainment, and physical-store businesses.",
  CRWV: "CoreWeave operates a cloud platform for artificial-intelligence workloads. It rents access to GPU-based computing infrastructure and provides software and technical services used to train, deploy, and run AI models.",
  CDNS: "Cadence develops electronic-design-automation software used to design and verify semiconductors, circuit boards, and electronic systems. It also licenses semiconductor intellectual property and sells system-design and simulation software.",
  GOOGL: "Alphabet's main business is Google. It earns most of its revenue from advertising across Search, YouTube, and other Google services, and also operates Google Cloud, Android, consumer devices, subscriptions, and early-stage Other Bets businesses.",
  GOOG: "Alphabet's main business is Google. It earns most of its revenue from advertising across Search, YouTube, and other Google services, and also operates Google Cloud, Android, consumer devices, subscriptions, and early-stage Other Bets businesses.",
  JPM: "JPMorgan Chase provides consumer and commercial banking, credit cards, investment banking, trading, asset management, and wealth-management services. Its earnings are driven mainly by lending, fees, markets activity, and management of client assets.",
  JNJ: "Johnson & Johnson develops and sells medicines and medical technologies. Its businesses include prescription drugs across major therapeutic areas and devices used in surgery, orthopedics, cardiovascular care, and vision treatment.",
  META: "Meta operates Facebook, Instagram, WhatsApp, Messenger, and Threads. It earns most of its revenue from digital advertising and also develops virtual- and augmented-reality hardware and software through Reality Labs.",
  MSFT: "Microsoft develops and sells productivity software, cloud infrastructure, operating systems, business applications, and gaming products. Its major businesses include Microsoft 365, Azure, Windows, Dynamics, LinkedIn, and Xbox.",
  NVDA: "NVIDIA designs processors and computing platforms used for artificial intelligence, data centers, gaming, professional visualization, and automotive systems. It sells GPUs, networking products, systems, and related software.",
  SNPS: "Synopsys develops electronic-design-automation software used to design and test semiconductors and electronic systems. It also licenses semiconductor intellectual property and provides software-security and engineering services.",
  TSLA: "Tesla designs and sells electric vehicles and operates energy-generation and storage businesses. Its products include passenger vehicles, charging services, solar systems, battery storage, related software, and automotive services.",
  WMT: "Walmart operates discount stores, supermarkets, warehouse clubs, and e-commerce platforms. It sells groceries and general merchandise through Walmart and Sam's Club and also provides advertising, fulfillment, membership, and financial services.",
  XOM: "Exxon Mobil produces and sells crude oil, natural gas, fuels, lubricants, and chemical products. Its operations cover oil and gas production, refining, transportation, product marketing, petrochemicals, and lower-carbon projects.",
};

const marketingLanguage = /\b(?:mission|vision|committed|dedicated|empower(?:s|ed|ing)?|pioneer(?:s|ed|ing)?|revolutioni[sz]|innovati(?:on|ve)|industry-leading|world-class|best-in-class|leading(?: company| provider| platform| the world)?|essential|strategy|strategic|trusted by|force multiplier|breakthrough|with confidence|better than we found|learn more|visit (?:our|the) website)\b/i;
const corporateBiography = /\b(?:was founded|founded in|established in|headquartered in|employees|public listing|listed on|nasdaq|new york stock exchange|nyse)\b/i;
const operatingLanguage = /\b(?:operates? through|operates?|provides?|offers?|develops?|designs?|manufactures?|produces?|sells?|distributes?|licenses?|owns?|leases?|runs?|generates?|specializes? in|serves? customers)\b/i;
const businessNouns = /\b(?:segment|product|service|software|platform|cloud|subscription|hardware|infrastructure|customer|business|revenue|marketplace|banking|insurance|retail|energy|semiconductor|vehicle|medicine|drug)\b/i;

function cleanSentence(sentence: string) {
  return sentence
    .replace(/\((?:Nasdaq|NYSE)[^)]+\)/gi, "")
    .replace(/https?:\/\/\S+|www\.\S+/gi, "")
    .replace(/\b(?:industry-leading|world-class|best-in-class|cutting-edge|innovative|premier)\b/gi, "")
    .replace(/^Today,?\s*/i, "")
    .replace(/\s+/g, " ")
    .replace(/\s+([,.;:])/g, "$1")
    .trim();
}

function fallbackDescription(input: CompanyDescriptionInput) {
  const classification = input.industry && input.industry !== "Unclassified"
    ? input.industry
    : input.sector && input.sector !== "Unclassified" ? input.sector : "its reported industry";
  return `${input.name} operates in ${classification}. The available profile does not provide enough factual detail to summarize its products and services reliably.`;
}

export function conciseBusinessDescription(input: CompanyDescriptionInput) {
  const known = input.symbol ? establishedSummaries[input.symbol.toUpperCase()] : undefined;
  if (known) return known;

  const raw = input.description?.replace(/\s+/g, " ").trim() || "";
  if (!raw) return fallbackDescription(input);

  const sentences = raw.match(/[^.!?]+[.!?]+|[^.!?]+$/g) || [raw];
  const candidates = sentences
    .map((sentence, index) => ({ sentence: cleanSentence(sentence), index }))
    .filter(({ sentence }) => sentence.length >= 25)
    .map((candidate) => {
      const operating = operatingLanguage.test(candidate.sentence);
      const score = (operating ? 4 : 0)
        + (businessNouns.test(candidate.sentence) ? 2 : 0)
        - (marketingLanguage.test(candidate.sentence) ? 6 : 0)
        - (corporateBiography.test(candidate.sentence) ? 5 : 0);
      return { ...candidate, score };
    })
    .filter(({ score }) => score >= 2)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, 2)
    .sort((a, b) => a.index - b.index);

  if (!candidates.length) return fallbackDescription(input);
  const result = candidates.map(({ sentence }) => sentence).join(" ").trim();
  if (result.length <= 420) return result;
  const shortened = result.slice(0, 417);
  const lastSpace = shortened.lastIndexOf(" ");
  return `${shortened.slice(0, lastSpace > 300 ? lastSpace : 417).trimEnd()}…`;
}
