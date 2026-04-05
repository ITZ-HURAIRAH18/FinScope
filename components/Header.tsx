"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import AuthButton from "@/components/auth/AuthButton";

interface HeaderProps {
  activePage?: "home" | "markets" | "analytics" | "news" | "watchlist" | "portfolio" | "profile";
}

export default function Header({ activePage = "home" }: HeaderProps) {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setIsMobileMenuOpen(false);
  }, [pathname]);

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

  const navLinks = [
    { href: "/", label: "Home", page: "home" },
    { href: "/dashboard", label: "Markets", page: "markets" },
    { href: "/analytics", label: "Analytics", page: "analytics" },
    { href: "/news", label: "News", page: "news" },
    { href: "/watchlist", label: "Watchlist", page: "watchlist" },
    { href: "/portfolio", label: "Portfolio", page: "portfolio" },
  ];

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
              {/* Status indicator */}
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
                </span>
                <span>Live</span>
              </div>
              <AuthButton />
            </div>
            <button
              onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
              className="md:hidden p-2 text-muted-foreground hover:text-foreground hover:bg-accent rounded-md transition-colors"
              aria-label="Toggle mobile menu"
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

      {/* Mobile Menu */}
      <div
        className={`md:hidden transition-all duration-300 ease-in-out border-t border-border/60 ${
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
            {/* Mobile status indicator */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-3 px-3">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-success opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-success"></span>
              </span>
              <span>Live market data</span>
            </div>
            <AuthButton />
          </div>
        </nav>
      </div>

      {isMobileMenuOpen && (
        <div
          className="md:hidden fixed inset-0 bg-background/60 backdrop-blur-sm -z-10"
          onClick={() => setIsMobileMenuOpen(false)}
        />
      )}
    </header>
  );
}
