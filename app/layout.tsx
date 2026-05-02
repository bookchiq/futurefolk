import type { Metadata, Viewport } from "next";
import { EB_Garamond } from "next/font/google";
import "./globals.css";

const ebGaramond = EB_Garamond({
  subsets: ["latin"],
  variable: "--font-serif",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Futurefolk",
  description: "Your future selves, living in Discord.",
};

export const viewport: Viewport = {
  themeColor: "#faf6ed",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={ebGaramond.variable}>
      <body className="bg-bg text-ink">{children}</body>
    </html>
  );
}
