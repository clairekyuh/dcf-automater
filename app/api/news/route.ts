import { NextRequest, NextResponse } from "next/server";
import { selectRelevantNews, type NasdaqNewsRow } from "@/lib/company-news";

export const runtime = "nodejs";

const NASDAQ_NEWS_API = "https://www.nasdaq.com/api/news/topic/articlebysymbol";
const NASDAQ_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Referer: "https://www.nasdaq.com/",
};

export async function GET(request: NextRequest) {
  const symbol = (request.nextUrl.searchParams.get("symbol") || "").trim().toUpperCase();
  const name = (request.nextUrl.searchParams.get("name") || symbol).trim();
  if (!/^[A-Z][A-Z0-9.-]{0,9}$/.test(symbol)) {
    return NextResponse.json({ error: "Enter a valid ticker symbol." }, { status: 400 });
  }

  try {
    const query = new URLSearchParams({ q: symbol, assetclass: "stocks", limit: "100" });
    const response = await fetch(`${NASDAQ_NEWS_API}?${query}`, {
      headers: NASDAQ_HEADERS,
      next: { revalidate: 900 },
    });
    if (!response.ok) throw new Error(`Nasdaq news returned HTTP ${response.status}.`);

    const payload = await response.json();
    const rows = Array.isArray(payload?.data?.rows) ? payload.data.rows as NasdaqNewsRow[] : [];
    const articles = selectRelevantNews(rows, symbol, name);
    return NextResponse.json({
      symbol,
      source: "Nasdaq-linked company news",
      sourceUrl: `https://www.nasdaq.com/market-activity/stocks/${symbol.toLowerCase()}/news-headlines`,
      asOf: new Date().toISOString(),
      articles,
      methodology: "Recent ticker-linked headlines are screened for company mentions and fundamental valuation topics. Headlines never change DCF assumptions automatically.",
    }, { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" } });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Current news is temporarily unavailable.",
      articles: [],
    }, { status: 502 });
  }
}
