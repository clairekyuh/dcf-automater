import { NextRequest, NextResponse } from "next/server";
import { selectRelevantNews, type NasdaqNewsRow } from "@/lib/company-news";
import { normalizeCompanyName, normalizeTicker } from "@/lib/ticker";
import { createRequestDiagnostics, logDiagnostic, safeErrorType, withDiagnosticHeaders } from "@/lib/server/diagnostics";
import { fetchWithTimeout } from "@/lib/server/fetch-with-timeout";

export const runtime = "nodejs";
export const maxDuration = 30;

const NASDAQ_NEWS_API = "https://www.nasdaq.com/api/news/topic/articlebysymbol";
const NASDAQ_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  Referer: "https://www.nasdaq.com/",
};

export async function GET(request: NextRequest) {
  const diagnostics = createRequestDiagnostics(request, "/api/news");
  const symbol = normalizeTicker(request.nextUrl.searchParams.get("symbol"));
  if (!symbol) {
    logDiagnostic("warn", diagnostics, { event: "news_request_rejected", status: 400, outcome: "rejected" });
    return withDiagnosticHeaders(NextResponse.json({ error: "Enter a valid ticker symbol.", code: "INVALID_TICKER", requestId: diagnostics.requestId }, { status: 400 }), diagnostics);
  }
  const name = normalizeCompanyName(request.nextUrl.searchParams.get("name"), symbol);

  try {
    const query = new URLSearchParams({ q: symbol, assetclass: "stocks", limit: "100" });
    const response = await fetchWithTimeout(`${NASDAQ_NEWS_API}?${query}`, {
      headers: NASDAQ_HEADERS,
      next: { revalidate: 900 },
    });
    if (!response.ok) throw new Error(`Nasdaq news returned HTTP ${response.status}.`);

    const payload = await response.json();
    const rows = Array.isArray(payload?.data?.rows) ? payload.data.rows as NasdaqNewsRow[] : [];
    const articles = selectRelevantNews(rows, symbol, name);
    const result = NextResponse.json({
      symbol,
      source: "Nasdaq-linked company news",
      sourceUrl: `https://www.nasdaq.com/market-activity/stocks/${symbol.toLowerCase()}/news-headlines`,
      asOf: new Date().toISOString(),
      articles,
      methodology: "Recent ticker-linked headlines are screened for company mentions and fundamental valuation topics. Headlines never change DCF assumptions automatically.",
    }, { headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=3600" } });
    logDiagnostic("info", diagnostics, { event: "news_request_completed", status: 200, symbol, outcome: "success" });
    return withDiagnosticHeaders(result, diagnostics);
  } catch (error) {
    logDiagnostic("error", diagnostics, { event: "news_request_failed", status: 502, symbol, outcome: "error", errorType: safeErrorType(error) });
    return withDiagnosticHeaders(NextResponse.json({
      error: "Current news is temporarily unavailable.",
      code: "NEWS_DATA_UNAVAILABLE",
      requestId: diagnostics.requestId,
      articles: [],
    }, { status: 502 }), diagnostics);
  }
}
