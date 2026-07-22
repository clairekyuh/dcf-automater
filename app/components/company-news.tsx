"use client";

import { useEffect, useState } from "react";
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

export default function CompanyNews({ symbol, name }: { symbol: string; name: string }) {
  const [news, setNews] = useState<NewsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setNews(null);
    fetch(`/api/news?symbol=${encodeURIComponent(symbol)}&name=${encodeURIComponent(name)}`, { signal: controller.signal })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.error || "Current news is temporarily unavailable.");
        return payload as NewsResponse;
      })
      .then(setNews)
      .catch((caught) => {
        if (caught instanceof DOMException && caught.name === "AbortError") return;
        setError(caught instanceof Error ? caught.message : "Current news is temporarily unavailable.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [symbol, name]);

  const sourceUrl = news?.sourceUrl || `https://www.nasdaq.com/market-activity/stocks/${symbol.toLowerCase()}/news-headlines`;
  return <section className="sheet-section" id="news">
    <div className="section-heading"><div><span className="section-index">05</span><p>RECENT EVENTS</p><h2>Current company news</h2></div><p className="section-description">Recent fundamental headlines tied to {name}. Each item explains the possible DCF connection; news does not change the model automatically because the underlying facts still need to be verified.</p></div>
    {loading && <div className="news-status" role="status"><span>SCREENING RECENT HEADLINES</span><p>Looking for earnings, guidance, financing, customer, capex, regulatory, and operating events relevant to {symbol}.</p></div>}
    {!loading && error && <div className="news-status news-error"><span>NEWS TEMPORARILY UNAVAILABLE</span><p>{error}</p><a href={sourceUrl} target="_blank" rel="noreferrer">Open {symbol} headlines on Nasdaq ↗</a></div>}
    {!loading && !error && news && news.articles.length === 0 && <div className="news-status"><span>NO HIGH-RELEVANCE HEADLINES FOUND</span><p>The recent feed did not contain a company-specific fundamental item that passed the screen. This is not evidence that the company has no material developments.</p><a href={sourceUrl} target="_blank" rel="noreferrer">Review all {symbol} headlines ↗</a></div>}
    {!loading && !error && Boolean(news?.articles.length) && <>
      <div className="news-grid">{news!.articles.map((article) => <article key={`${article.publishedAt}-${article.title}`}>
        <div className="news-card-head"><span className={`news-category ${article.relevance}`}>{article.category}</span><time dateTime={article.publishedAt || undefined}>{publishedDate(article.publishedAt)}</time></div>
        <h3><a href={article.url} target="_blank" rel="noreferrer">{article.title} ↗</a></h3>
        <small>{article.publisher}</small>
        <div className="news-impact"><b>POSSIBLE DCF RELEVANCE</b><p>{article.whyItMatters}</p></div>
      </article>)}</div>
      <div className="news-foot"><p>Headline-based screen only. Read the original article and company filing before changing any assumption.</p><a href={sourceUrl} target="_blank" rel="noreferrer">View all {symbol} headlines ↗</a></div>
    </>}
  </section>;
}
