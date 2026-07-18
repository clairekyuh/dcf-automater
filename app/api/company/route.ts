import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

const API = "https://www.alphavantage.co/query";

const n = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const millions = (value: unknown) => n(value) / 1_000_000;

type Statement = Record<string, string>;

async function alpha(functionName: string, symbol: string, apiKey: string) {
  const url = new URL(API);
  url.searchParams.set("function", functionName);
  url.searchParams.set("symbol", symbol);
  url.searchParams.set("apikey", apiKey);
  // Do not cache provider errors; the normalized successful response is cached below.
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Financial-data request failed (${response.status}).`);
  const data = await response.json();
  if (data.Note || data.Information) throw new Error(data.Note || data.Information);
  if (data["Error Message"]) throw new Error("Ticker not found. Check the symbol and try again.");
  return data;
}

function nearest(report: Statement[] | undefined, fiscalDate: string) {
  if (!report?.length) return {} as Statement;
  return report.find((item) => item.fiscalDateEnding === fiscalDate) || report[0];
}

function growthRate(values: number[]) {
  const valid = values.filter((value) => value > 0);
  if (valid.length < 2) return 0;
  const newest = valid[0];
  const oldest = valid[valid.length - 1];
  return (Math.pow(newest / oldest, 1 / (valid.length - 1)) - 1) * 100;
}

export async function GET(request: NextRequest) {
  const symbol = request.nextUrl.searchParams.get("symbol")?.trim().toUpperCase();
  if (!symbol || !/^[A-Z0-9.\-]{1,12}$/.test(symbol)) {
    return NextResponse.json({ error: "Enter a valid ticker symbol." }, { status: 400 });
  }

  const apiKey = process.env.ALPHA_VANTAGE_API_KEY || (symbol === "IBM" ? "demo" : "");
  if (!apiKey) {
    return NextResponse.json({
      error: "This deployment needs an Alpha Vantage API key. Add ALPHA_VANTAGE_API_KEY to .env.local. IBM works in demo mode.",
    }, { status: 503 });
  }

  try {
    // Pace calls so the free/demo tier's per-second limit is respected.
    const functions = ["OVERVIEW", "INCOME_STATEMENT", "BALANCE_SHEET", "CASH_FLOW"];
    const responses = [];
    for (const functionName of functions) {
      responses.push(await alpha(functionName, symbol, apiKey));
      if (functionName !== "CASH_FLOW") await new Promise((resolve) => setTimeout(resolve, 600));
    }
    const [overview, income, balance, cashflow] = responses;

    if (!overview.Symbol || !income.annualReports?.length) throw new Error("No complete company data was returned for this ticker.");

    const historical = (income.annualReports as Statement[]).slice(0, 5).map((inc) => {
      const bal = nearest(balance.annualReports, inc.fiscalDateEnding);
      const cf = nearest(cashflow.annualReports, inc.fiscalDateEnding);
      const revenue = millions(inc.totalRevenue);
      const ebit = millions(inc.ebit || inc.operatingIncome);
      const capex = Math.abs(millions(cf.capitalExpenditures));
      const depreciation = millions(cf.depreciationDepletionAndAmortization || cf.depreciation);
      const operatingCashFlow = millions(cf.operatingCashflow);
      const freeCashFlow = operatingCashFlow - capex;
      return {
        year: inc.fiscalDateEnding?.slice(0, 4),
        fiscalDate: inc.fiscalDateEnding,
        revenue,
        ebit,
        ebitMargin: revenue ? (ebit / revenue) * 100 : 0,
        operatingCashFlow,
        capex,
        capexPercentRevenue: revenue ? (capex / revenue) * 100 : 0,
        depreciation,
        freeCashFlow,
        cash: millions(bal.cashAndCashEquivalentsAtCarryingValue || bal.cashAndShortTermInvestments),
        debt: millions(bal.shortLongTermDebtTotal || bal.longTermDebt || bal.totalLiabilities),
      };
    });

    const latest = historical[0];
    const revenueGrowth = growthRate(historical.map((row) => row.revenue));
    const shares = millions(overview.SharesOutstanding);
    const marketCap = millions(overview.MarketCapitalization);

    const normalizedResponse = NextResponse.json({
      source: "Alpha Vantage",
      asOf: latest.fiscalDate,
      company: {
        symbol: overview.Symbol,
        name: overview.Name,
        description: overview.Description,
        exchange: overview.Exchange,
        currency: overview.Currency || "USD",
        country: overview.Country,
        sector: overview.Sector || "Unclassified",
        industry: overview.Industry || "Unclassified",
      },
      market: {
        marketCap,
        shares,
        estimatedPrice: shares ? marketCap / shares : 0,
        beta: n(overview.Beta),
      },
      metrics: {
        revenueGrowth,
        revenue: latest.revenue,
        ebitMargin: latest.ebitMargin,
        capexPercentRevenue: latest.capexPercentRevenue,
        cash: latest.cash,
        debt: latest.debt,
        taxRate: 21,
      },
      historical: historical.reverse(),
    });
    normalizedResponse.headers.set("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=3600");
    return normalizedResponse;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to load company data." }, { status: 502 });
  }
}
