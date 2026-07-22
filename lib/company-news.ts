export type NasdaqNewsRow = {
  title?: string | null;
  description?: string | null;
  created?: string | null;
  publisher?: string | null;
  url?: string | null;
  related_symbols?: string[] | null;
};

export type CompanyNewsItem = {
  title: string;
  url: string;
  publisher: string;
  publishedAt: string | null;
  category: string;
  whyItMatters: string;
  relevance: "high" | "medium";
};

const categories = [
  {
    label: "Earnings & guidance",
    pattern: /\b(earnings|quarterly results?|results? for the quarter|guidance|outlook|forecast|revenue|sales|profit|loss|margin|free cash flow)\b/i,
    why: "May change the revenue-growth, margin, tax, or cash-flow assumptions used in the explicit forecast.",
    weight: 7,
  },
  {
    label: "Customers & demand",
    pattern: /\b(customer|contract|backlog|booking|order|partnership|partner|supplier|demand|award|multi-year deal)\b/i,
    why: "May affect revenue visibility, customer concentration, pricing, and the durability of forecast growth.",
    weight: 7,
  },
  {
    label: "Capital spending",
    pattern: /\b(capex|capital spending|capital expenditure|data cent(?:er|re)|factory|plant|capacity|buildout|infrastructure investment|power supply|construction)\b/i,
    why: "May change capital expenditure, depreciation, utilization, financing needs, and near-term unlevered free cash flow.",
    weight: 7,
  },
  {
    label: "Financing & balance sheet",
    pattern: /\b(debt|loan|bond|credit facility|financing|refinanc|liquidity|share offering|stock offering|convertible|buyback|repurchase|dividend)\b/i,
    why: "May affect debt, cash, diluted shares, cost of capital, or the enterprise-to-equity value bridge.",
    weight: 7,
  },
  {
    label: "Regulation & legal",
    pattern: /\b(regulat|antitrust|lawsuit|litigation|court|probe|investigation|tariff|sanction|export (?:ban|control|restriction)|fine|settlement)\b/i,
    why: "May affect addressable markets, operating costs, forecast risk, or the company-specific risk premium in WACC.",
    weight: 7,
  },
  {
    label: "M&A & strategy",
    pattern: /\b(acquir|acquisition|merger|takeover|divest|spin[- ]?off|asset sale|joint venture)\b/i,
    why: "May change the operating forecast, balance sheet, share count, integration costs, or business mix.",
    weight: 6,
  },
  {
    label: "Competitive landscape",
    pattern: /\b(competitor|competition|competes?|competitive|entering .{0,80} market|market entry|cloud business plan)\b/i,
    why: "May affect market share, pricing, customer retention, long-run growth, margins, or the risk assigned to the forecast.",
    weight: 5,
  },
  {
    label: "Products & operations",
    pattern: /\b(launch|unveil|introduc|product|service|platform|production|shipment|outage|recall|security breach|cyberattack|patent|approval)\b/i,
    why: "May affect demand, pricing, operating costs, competitive position, or the timing of future cash flows.",
    weight: 5,
  },
  {
    label: "Leadership & governance",
    pattern: /\b(ceo|cfo|chief executive|chief financial|board|director|executive|insider (?:sale|buying|purchase))\b/i,
    why: "May signal changes in execution, capital allocation, governance, or confidence in the operating plan.",
    weight: 4,
  },
] as const;

const hardFluff = /analyst blog|research reports?|stock reports?|technical outlook|golden cross|\bvs\.?\b|should you buy|is .* (?:stock )?a buy|buy the dip|still a buy|better buy|buy today|buy before|buy now|buy instead|buying aggressively|buy this|buy,? sell or hold|worth buying|bargain|value trap|rebound bet|stock to buy|top momentum stock|best .* stock|which .* stock|could double|trillion company|well-positioned to win|most valuable company|biggest company|prediction:|time to sell|for .* stock investors|millionaire-maker|options? (?:activity|now available)|most active|etf (?:inflow|outflow)|general market|outperform(?:s|ed)? broader market|up \d+(?:\.\d+)?% since|thesis|before earnings/i;
const marketChatter = /price target|analyst rating|upgrade|downgrade|stock (?:moves?|rises?|falls?|jumps?|drops?|sinks?|tanks?|slumps?|soars?|keeps|hits|tumbles?)|\b[A-Za-z]+ rises? \d|shares? (?:slip|fall|drop|jump)|why .* stock|what(?:'s| is) wrong with|investors? (?:should|be scared|worry)/i;
const concreteEvent = /\b(earnings|results|guidance|launch|unveil|introduc|sign|contract|order|debt|credit facility|financing|offering|buyback|acquir|merger|appoint|resign|ceo|cfo|lawsuit|settlement|regulat|approval|recall|outage|data cent(?:er|re)|factory|capacity expansion)\b/i;
const corporateSuffixes = new Set(["inc", "incorporated", "corp", "corporation", "company", "companies", "holdings", "holding", "group", "plc", "ltd", "limited", "common", "stock", "class", "ordinary", "shares", "the"]);
const genericNameTerms = new Set(["design", "systems", "system", "technology", "technologies", "financial", "services", "service", "global", "international", "industries", "industrial", "energy", "bank", "bancorp"]);

function companyTerms(name: string) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(/\s+/)
    .filter((term) => term.length >= 3 && !corporateSuffixes.has(term) && !genericNameTerms.has(term));
}

function directlyMentionsCompany(row: NasdaqNewsRow, symbol: string, name: string) {
  // Nasdaq can tag a story with every peer mentioned in its body. Requiring the
  // focus company in the headline keeps peer-only stories out of company news.
  const text = String(row.title || "").toLowerCase();
  const tickerPattern = new RegExp(`\\b${symbol.toLowerCase().replace(/[^a-z0-9]/g, "")}\\b`, "i");
  if (tickerPattern.test(text)) return true;
  return companyTerms(name).some((term) => new RegExp(`\\b${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i").test(text));
}

function parseNasdaqDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(`${value} 12:00:00 UTC`);
  return Number.isFinite(parsed.getTime()) ? parsed.toISOString() : null;
}

function absoluteNasdaqUrl(value?: string | null) {
  if (!value) return "https://www.nasdaq.com/market-activity";
  if (/^https?:\/\//i.test(value)) return value;
  return `https://www.nasdaq.com${value.startsWith("/") ? value : `/${value}`}`;
}

function cleanTitle(value?: string | null) {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

export function selectRelevantNews(rows: NasdaqNewsRow[], symbol: string, name: string, limit = 6): CompanyNewsItem[] {
  const normalizedSymbol = symbol.trim().toUpperCase();
  const ranked = rows.flatMap((row) => {
    const title = cleanTitle(row.title);
    if (!title || !directlyMentionsCompany(row, normalizedSymbol, name)) return [];
    if (hardFluff.test(title)) return [];

    const text = `${title} ${row.description || ""}`;
    const category = categories.find((item) => item.pattern.test(text));
    const chatter = marketChatter.test(title);
    if (chatter && !concreteEvent.test(title)) return [];

    const score = 8 + (category?.weight || 2) - (chatter ? 4 : 0);
    if (score < 8) return [];
    return [{
      item: {
        title,
        url: absoluteNasdaqUrl(row.url),
        publisher: cleanTitle(row.publisher) || "Nasdaq",
        publishedAt: parseNasdaqDate(row.created),
        category: category?.label || "Company update",
        whyItMatters: category?.why || "Review the underlying event for possible changes to revenue, margins, reinvestment, risk, or capital structure.",
        relevance: score >= 14 && !chatter ? "high" as const : "medium" as const,
      },
      score,
    }];
  });

  const seen = new Set<string>();
  const categoryCounts = new Map<string, number>();
  return ranked
    .sort((a, b) => String(b.item.publishedAt).localeCompare(String(a.item.publishedAt)) || b.score - a.score)
    .filter(({ item }) => {
      const key = item.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (seen.has(key)) return false;
      const categoryCount = categoryCounts.get(item.category) || 0;
      if (categoryCount >= 2) return false;
      seen.add(key);
      categoryCounts.set(item.category, categoryCount + 1);
      return true;
    })
    .slice(0, limit)
    .map(({ item }) => item);
}
