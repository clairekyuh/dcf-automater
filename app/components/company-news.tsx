"use client";

import { useEffect, useState } from "react";
import { apiErrorMessage } from "@/lib/client/api-error";
import type { CompanyNewsItem } from "@/lib/company-news";

type NewsResponse = {
  source: string;
  sourceUrl: string;
  asOf: string;
  methodology: string;
  articles: CompanyNewsItem[];
  error?: string;
};

const publishedDate = (value: string | null) => value
  ? new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(value))
  : "Date unavailable";

export default function CompanyNews({ symbol, name, showHeading = true }: { symbol: string; name: string; showHeading?: boolean }) {
  const [news, setNews] = useState<NewsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void Promise.resolve().then(async () => {
      if (controller.signal.aborted) return;
      setLoading(true);
      setError("");
      setNews(null);
      try {
        const response = await fetch(`/api/news?symbol=${encodeURIComponent(symbol)}&name=${encodeURIComponent(name)}`, { signal: controller.signal });
        const payload = await response.json();
        if (!response.ok) throw new Error(apiErrorMessage(payload, "Current news is temporarily unavailable."));
        if (!controller.signal.aborted) setNews(payload as NewsResponse);
      } catch (caught) {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        if (!controller.signal.aborted) setError(caught instanceof Error ? caught.message : "Current news is temporarily unavailable.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    });
    return () => controller.abort();
  }, [symbol, name, reloadKey]);

  const sourceUrl = news?.sourceUrl || `https://www.nasdaq.com/market-activity/stocks/${symbol.toLowerCase()}/news-headlines`;
  return <section className="sheet-section" id="news">
    {showHeading && <div className="section-heading"><div><span className="section-index">06</span><p>RECENT EVENTS</p><h2>Current company news</h2></div><p className="section-description">Recent fundamental headlines tied to {name}. Each item explains the possible DCF connection; news does not change the model automatically because the underlying facts still need to be verified.</p></div>}
    {loading && <div className="news-loading" role="status" aria-live="polite"><strong>Loading relevant headlines for {symbol}…</strong>{[0, 1, 2].map((row) => <i key={row}/>)}</div>}
    {!loading && error && <div className="news-status news-error" role="alert"><span>News unavailable</span><p>{error}</p><div><button type="button" onClick={() => setReloadKey((key) => key + 1)}>Retry</button><a href={sourceUrl} target="_blank" rel="noreferrer">Open Nasdaq headlines ↗</a></div></div>}
    {!loading && !error && news && news.articles.length === 0 && <div className="news-status"><span>No relevant headlines returned</span><p>The screened feed did not contain a company-specific fundamental item. This does not mean the company has no material developments.</p><div><button type="button" onClick={() => setReloadKey((key) => key + 1)}>Retry</button><a href={sourceUrl} target="_blank" rel="noreferrer">Review all {symbol} headlines ↗</a></div></div>}
    {!loading && !error && Boolean(news?.articles.length) && <>
      <div className="news-grid">{news!.articles.map((article) => <article key={`${article.publishedAt}-${article.title}`}>
        <div className="news-card-head"><time dateTime={article.publishedAt || undefined}>{publishedDate(article.publishedAt)}</time><span className={`news-category ${article.relevance}`}>{article.category}</span></div>
        <h3><a href={article.url} target="_blank" rel="noreferrer">{article.title} ↗</a></h3>
        <small>{article.publisher}</small>
        <div className="news-impact"><b>DCF relevance</b><p>{article.whyItMatters}</p></div>
      </article>)}</div>
      <div className="news-foot"><p>Headline-based screen only. Read the original article and company filing before changing any assumption.</p><a href={sourceUrl} target="_blank" rel="noreferrer">View all {symbol} headlines ↗</a></div>
    </>}
  </section>;
}
