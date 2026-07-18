import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Intrinsic — DCF Valuation",
  description: "A fast, transparent discounted cash flow calculator.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
