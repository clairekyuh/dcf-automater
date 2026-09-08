"use client";

import { useMemo, useState } from "react";

export type PricePoint = { date: string; close: number };

const fmt = new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 });
const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 });
const usd0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export default function StockPriceChart({ points, symbol }: { points: PricePoint[]; symbol: string }) {
  type ChartPeriod = "3M" | "6M" | "YTD" | "1Y" | "3Y" | "5Y" | "MAX";
  type ChartInterval = "1D" | "1W" | "1M";
  const periods: ChartPeriod[] = ["3M", "6M", "YTD", "1Y", "3Y", "5Y", "MAX"];
  const intervals: Array<{ value: ChartInterval; label: string; heading: string }> = [
    { value: "1D", label: "Daily", heading: "DAILY" },
    { value: "1W", label: "Weekly", heading: "WEEKLY" },
    { value: "1M", label: "Monthly", heading: "MONTHLY" },
  ];
  const [period, setPeriod] = useState<ChartPeriod>("5Y");
  const [interval, setInterval] = useState<ChartInterval>("1M");
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const sampled = useMemo(() => {
    if (interval === "1D") return points;
    const buckets = new Map<string, PricePoint>();
    for (const point of points) {
      const pointDate = new Date(`${point.date}T00:00:00Z`);
      let key = point.date.slice(0, 7);
      if (interval === "1W") {
        const weekStart = new Date(pointDate);
        weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));
        key = weekStart.toISOString().slice(0, 10);
      }
      buckets.set(key, point);
    }
    return Array.from(buckets.values());
  }, [interval, points]);
  const filtered = useMemo(() => {
    if (!sampled.length || period === "MAX") return sampled;
    const latest = new Date(`${sampled[sampled.length - 1].date}T00:00:00Z`);
    const cutoff = new Date(latest);
    if (period === "YTD") cutoff.setTime(Date.UTC(latest.getUTCFullYear(), 0, 1));
    else if (period === "3M" || period === "6M") cutoff.setUTCMonth(cutoff.getUTCMonth() - (period === "3M" ? 3 : 6));
    else cutoff.setUTCFullYear(cutoff.getUTCFullYear() - (period === "1Y" ? 1 : period === "3Y" ? 3 : 5));
    return sampled.filter((point) => new Date(`${point.date}T00:00:00Z`) >= cutoff);
  }, [period, sampled]);

  if (filtered.length < 2) return <div className="chart-empty">Price history was not returned by Nasdaq for this ticker.</div>;
  const width = 900;
  const height = 330;
  const pad = { left: 68, right: 22, top: 24, bottom: 48 };
  const prices = filtered.map((point) => point.close);
  const rawMin = Math.min(...prices);
  const rawMax = Math.max(...prices);
  const cushion = Math.max((rawMax - rawMin) * .1, rawMax * .02, 1);
  const min = Math.max(0, rawMin - cushion);
  const max = rawMax + cushion;
  const x = (index: number) => pad.left + index / Math.max(filtered.length - 1, 1) * (width - pad.left - pad.right);
  const y = (value: number) => pad.top + (max - value) / Math.max(max - min, 1) * (height - pad.top - pad.bottom);
  const line = filtered.map((point, index) => `${index ? "L" : "M"}${x(index).toFixed(1)},${y(point.close).toFixed(1)}`).join(" ");
  const area = `${line} L${x(filtered.length - 1)},${height - pad.bottom} L${x(0)},${height - pad.bottom} Z`;
  const tickIndexes = Array.from(new Set([0, .25, .5, .75, 1].map((ratio) => Math.round((filtered.length - 1) * ratio))));
  const first = filtered[0];
  const last = filtered[filtered.length - 1];
  const change = (last.close / first.close - 1) * 100;
  const dateLabel = (date: string) => new Intl.DateTimeFormat("en-US", ["3M", "6M", "YTD"].includes(period)
    ? { month: "short", day: "numeric", timeZone: "UTC" }
    : { month: "short", year: "2-digit", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
  const selectedInterval = intervals.find((item) => item.value === interval) || intervals[2];
  const hoveredPoint = hoveredIndex === null ? null : filtered[Math.min(hoveredIndex, filtered.length - 1)];
  const hoveredX = hoveredPoint && hoveredIndex !== null ? x(Math.min(hoveredIndex, filtered.length - 1)) : null;
  const hoveredY = hoveredPoint ? y(hoveredPoint.close) : null;
  const tooltipWidth = 150;
  const tooltipHeight = 52;
  const tooltipX = hoveredX === null ? 0 : clamp(hoveredX - tooltipWidth / 2, pad.left, width - pad.right - tooltipWidth);
  const tooltipY = hoveredY === null ? 0 : hoveredY - tooltipHeight - 14 < pad.top ? hoveredY + 14 : hoveredY - tooltipHeight - 14;
  const fullDateLabel = (date: string) => new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
  const selectNearestPoint = (clientX: number, currentTarget: SVGRectElement) => {
    const bounds = currentTarget.getBoundingClientRect();
    const chartX = (clientX - bounds.left) / Math.max(bounds.width, 1) * width;
    const ratio = clamp((chartX - pad.left) / (width - pad.left - pad.right), 0, 1);
    setHoveredIndex(Math.round(ratio * (filtered.length - 1)));
  };
  return <div className="price-chart-card">
    <div className="chart-head"><div><span>{symbol} {selectedInterval.heading} CLOSE</span><h3>{usd.format(last.close)} <i className={change >= 0 ? "positive" : "negative"}>{change >= 0 ? "+" : ""}{fmt.format(change)}%</i></h3></div><div className="chart-controls"><div className="chart-control-row"><span>RANGE</span><div className="period-toggle" role="group" aria-label="Stock-price time range">{periods.map((item) => <button type="button" aria-pressed={item === period} className={item === period ? "active" : ""} key={item} onClick={() => setPeriod(item)}>{item}</button>)}</div></div><div className="chart-control-row"><span>INTERVAL</span><div className="period-toggle interval-toggle" role="group" aria-label="Stock-price observation interval">{intervals.map((item) => <button type="button" aria-pressed={item.value === interval} className={item.value === interval ? "active" : ""} key={item.value} onClick={() => setInterval(item.value)}>{item.label}</button>)}</div></div></div></div>
    <svg className="price-svg" viewBox={`0 0 ${width} ${height}`} role="img" aria-label={`${symbol} ${selectedInterval.label.toLowerCase()} closing price chart for ${period}`}>
      <defs><linearGradient id="priceFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#78924b" stopOpacity=".28"/><stop offset="1" stopColor="#78924b" stopOpacity="0"/></linearGradient></defs>
      {[0, .25, .5, .75, 1].map((ratio) => { const value = max - (max - min) * ratio; const yPos = y(value); return <g key={ratio}><line x1={pad.left} x2={width - pad.right} y1={yPos} y2={yPos}/><text x={pad.left - 10} y={yPos + 4} textAnchor="end">{usd0.format(value)}</text></g>; })}
      {tickIndexes.map((index) => <text key={index} x={x(index)} y={height - 17} textAnchor={index === 0 ? "start" : index === filtered.length - 1 ? "end" : "middle"}>{dateLabel(filtered[index].date)}</text>)}
      <path className="price-area" d={area}/><path className="price-line" d={line}/><circle cx={x(filtered.length - 1)} cy={y(last.close)} r="4"/>
      <rect className="price-hover-target" x={pad.left} y={pad.top} width={width - pad.left - pad.right} height={height - pad.top - pad.bottom} tabIndex={0} aria-label="Hover or use the left and right arrow keys to inspect closing prices" onPointerMove={(event) => selectNearestPoint(event.clientX, event.currentTarget)} onPointerDown={(event) => selectNearestPoint(event.clientX, event.currentTarget)} onPointerLeave={() => setHoveredIndex(null)} onFocus={() => setHoveredIndex(filtered.length - 1)} onBlur={() => setHoveredIndex(null)} onKeyDown={(event) => { if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return; event.preventDefault(); const direction = event.key === "ArrowRight" ? 1 : -1; setHoveredIndex((current) => clamp((current ?? filtered.length - 1) + direction, 0, filtered.length - 1)); }}/>
      {hoveredPoint && hoveredX !== null && hoveredY !== null && <g className="price-tooltip" pointerEvents="none"><line className="price-crosshair" x1={hoveredX} x2={hoveredX} y1={pad.top} y2={height - pad.bottom}/><circle className="price-hover-dot" cx={hoveredX} cy={hoveredY} r="5"/><rect x={tooltipX} y={tooltipY} width={tooltipWidth} height={tooltipHeight} rx="4"/><text className="price-tooltip-date" x={tooltipX + 12} y={tooltipY + 19}>{fullDateLabel(hoveredPoint.date)}</text><text className="price-tooltip-price" x={tooltipX + 12} y={tooltipY + 39}>{usd.format(hoveredPoint.close)} close</text></g>}
    </svg>
    <div className="chart-stats"><span>Period low <b>{usd.format(rawMin)}</b></span><span>Period high <b>{usd.format(rawMax)}</b></span><span>Observations <b>{filtered.length} {selectedInterval.label.toLowerCase()} closes</b></span><span>Price return only <b>dividends excluded · MAX up to 10Y</b></span></div>
  </div>;
}
