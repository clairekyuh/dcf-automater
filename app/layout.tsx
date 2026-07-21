import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DCF Calculator — Interactive Valuation Workbook",
  description: "Build, inspect, and stress-test a complete discounted cash flow valuation from a public-company ticker.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
