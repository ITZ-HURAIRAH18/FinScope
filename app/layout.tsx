import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import Footer from "@/components/Footer";
import CleanupTrigger from "@/components/CleanupTrigger";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "FinScope - Real-Time Crypto & Stock Analytics",
  description: "Track crypto and stock markets in real-time with interactive charts, watchlists, and analytics.",
  keywords: ["crypto", "stocks", "finance", "trading", "analytics", "dashboard"],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        <Providers>
          <CleanupTrigger />
          {children}
          <Footer />
        </Providers>
      </body>
    </html>
  );
}
