"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AuthButton from "@/components/auth/AuthButton";
import ThemeToggle from "@/components/ThemeToggle";
import { binanceWS, BinanceConnectionStatus } from "@/lib/binance-websocket";
import { getFinnhubWS, FinnhubConnectionStatus } from "@/lib/finnhub-websocket";

interface HeaderProps {
  activePage?: "home" | "markets" | "analytics" | "news" | "watchlist" | "portfolio" | "profile";
}

type LiveState = "standby" | "connecting" | "live" | "polling" | "offline";

function combineStatuses(
  crypto: BinanceConnectionStatus,
  stocks: FinnhubConnectionStatus
): LiveState {
  // At least one stream over a live WebSocket → green "Live".
  if (crypto === "connected" || stocks === "connected") return "live";
  // Crypto WS down but REST fallback still delivering 10s snapshots
  // (only the Binance client has a polling state).
  if (crypto === "polling") return "polling";
  // A connection attempt is in flight.
  if (crypto === "connecting" || stocks === "connecting") return "connecting";
  // Streams previously active but now down (or token rejected).
  if (crypto === "disconnected" || stocks === "disconnected" || stocks === "unauthorized") {
    return "offline";
  }
  // Nothing ever connected on this page (e.g. /profile, /news).
  return "standby";
}

const LIVE_LABELS: Record<LiveState, { text: string; dot: string; ping: string }> = {
  live: { text: "Live", dot: "bg-success", ping: "bg-success" },
  polling: { text: "Live · 10s", dot: "bg-warning", ping: "bg-warning" },
  connecting: { text: "Connecting…", dot: "bg-warning", ping: "bg-warning" },
  offline: { text: "Offline", dot: "bg-error", ping: "bg-error" },
  standby: { text: "Data on Markets", dot: "bg-muted-foreground", ping: "bg-muted-foreground" },
};

export default function Header({ activePage = "home" }: HeaderProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [cryptoStatus, setCryptoStatus] = useState<BinanceConnectionStatus>("idle");
  const [stockStatus, setStockStatus] = useState<FinnhubConnectionStatus>("idle");
  const liveState = combineStatuses(cryptoStatus, stockStatus);
  const pathname = usePathname();

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

  // M6: the indicator used to be hard-coded green regardless of connection
  // state. Subscribe to both stream clients and render their real status.
  useEffect(() => {
    let unsubFinnhub: (() => void) | undefined;
    let cancelled = false;

    const unsubBinance = binanceWS.onStatus(() => {
      setCryptoStatus(binanceWS.getStatus());
    });

    getFinnhubWS()
      .then((ws) => {
        if (cancelled) return;
        unsubFinnhub = ws.subscribeStatus(() => {
          setStockStatus(ws.getStatus());
        });
      })
      .catch(() => {
        // No token (e.g. unauthenticated pages) — the crypto stream alone
        // still drives the indicator.
      });

    return () => {
      cancelled = true;
      unsubBinance();
      unsubFinnhub?.();
    };
  }, []);

  useEffect(() => {
    if (isMobileMenuOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "unset";
    }
    return () => {
      document.body.style.overflow = "unset";
    };
  }, [isMobileMenuOpen]);

  // M6: Escape closes the mobile menu (standard disclosure behavior).
  useEffect(() => {
    if (!isMobileMenuOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsMobileMenuOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isMobileMenuOpen]);

  const navLinks = [
    { href: "/", label: "Home", page: "home" },
    { href: "/dashboard", label: "Markets", page: "markets" },
    { href: "/analytics", label: "Analytics", page: "analytics" },
    { href: "/news", label: "News", page: "news" },
    { href: "/watchlist", label: "Watchlist", page: "watchlist" },
    { href: "/portfolio", label: "Portfolio", page: "portfolio" },
  ];

  const live = LIVE_LABELS[liveState];

  const StatusIndicator = ({ className = "" }: { className?: string }) => (
    <div
      className={`flex items-center gap-1.5 text-xs text-muted-foreground ${className}`}
      role="status"
      aria-live="polite"
    >
      <span className="relative flex h-2 w-2">
        {liveState !== "standby" && (
          <span className={`animate-ping absolute inline-flex h-full w-full rounded-full ${live.ping} opacity-75`}></span>
        )}
        <span className={`relative inline-flex rounded-full h-2 w-2 ${live.dot}`}></span>
      </span>
      <span>{live.text}</span>
    </div>
  );

  return (
    <header className="border-b border-border/60 backdrop-blur-xl bg-background/80 sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 flex items-center justify-center transition-all duration-200 group-hover:bg-primary/20 group-hover:border-primary/40 group-hover:shadow-pink-glow-sm">
              <svg className="w-4 h-4 text-primary" viewBox="0 0 24 12" fill="currentColor">
                <path d="M0 11.5L2 9.5L5 10.5L8 6.5L11 8.5L14 3.5L17 5.5L20 1.5L22 2.5L24 0.5V12H0V11.5Z" />
              </svg>
            </div>
            <span className="text-lg font-semibold tracking-tight text-foreground">
              finscope
            </span>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-0.5">
            {navLinks.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`px-3 py-1.5 text-sm font-medium rounded-md transition-all duration-150 ${
                  activePage === link.page
                    ? "text-foreground bg-accent"
                    : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
                }`}
              >
                {link.label}
              </Link>
            ))}
          </nav>

          {/* Auth + Mobile Toggle */}
          <div className="flex items-center gap-2">
            <div className="hidden md:flex items-center gap-3">
              <StatusIndicator />
              <ThemeToggle />
              <AuthButton />
            </div>
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
              aria-label="Toggle mobile menu"
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-menu"
            >
              {isMobileMenuOpen ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Mobile Menu — relative+z keeps it ABOVE the click-catcher overlay
          (the old -z-10 rendered the overlay behind page content instead). */}
      <div
        id="mobile-menu"
        className={`md:hidden relative z-10 transition-all duration-300 ease-in-out border-t border-border/60 ${
          isMobileMenuOpen
            ? "max-h-screen opacity-100"
            : "max-h-0 opacity-0 overflow-hidden"
        }`}
      >
        <nav className="px-3 py-3 space-y-1 bg-background/95 backdrop-blur-xl">
          {navLinks.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`block px-3 py-2 text-sm font-medium rounded-md transition-colors ${
                activePage === link.page
                  ? "text-foreground bg-accent"
                  : "text-muted-foreground hover:text-foreground hover:bg-accent/50"
              }`}
            >
              {link.label}
            </Link>
          ))}
          <div className="pt-3 mt-3 border-t border-border/60">
            <div className="flex items-center justify-between px-3 mb-3">
              <StatusIndicator />
              <ThemeToggle />
            </div>
            <AuthButton />
          </div>
        </nav>
      </div>

      {isMobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-background/60 backdrop-blur-sm z-0"
          onClick={() => setIsMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}
    </header>
  );
}
