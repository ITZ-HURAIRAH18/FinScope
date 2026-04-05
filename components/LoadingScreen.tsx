"use client";

import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  TrendingUp,
  BarChart3,
  Activity,
  ArrowUpRight,
  ArrowDownRight,
  CandlestickChart,
  LineChart,
  Wallet,
} from "lucide-react";

// Rotating loading messages
const LOADING_MESSAGES = [
  "Connecting to markets...",
  "Loading real-time data...",
  "Syncing your watchlist...",
  "Fetching market analytics...",
  "Preparing your dashboard...",
  "Establishing secure connection...",
  "Loading chart data...",
  "Almost there...",
];

// Floating icon pool for ambient animation
const FLOATING_ICONS = [
  { Icon: TrendingUp, size: 20 },
  { Icon: BarChart3, size: 16 },
  { Icon: Activity, size: 18 },
  { Icon: ArrowUpRight, size: 14 },
  { Icon: ArrowDownRight, size: 14 },
  { Icon: CandlestickChart, size: 16 },
  { Icon: LineChart, size: 18 },
  { Icon: Wallet, size: 16 },
];

export default function LoadingScreen() {
  const [progress, setProgress] = useState(0);
  const [messageIndex, setMessageIndex] = useState(0);
  const [isComplete, setIsComplete] = useState(false);

  // Progress simulation - slows down as it approaches 90%
  useEffect(() => {
    const progressInterval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 90) {
          clearInterval(progressInterval);
          return 90;
        }
        // Slow down as we approach 90%
        const increment = prev < 30 ? 3 : prev < 60 ? 2 : 1;
        return prev + increment;
      });
    }, 50);

    return () => clearInterval(progressInterval);
  }, []);

  // Rotate loading messages
  useEffect(() => {
    const messageInterval = setInterval(() => {
      setMessageIndex((prev) => (prev + 1) % LOADING_MESSAGES.length);
    }, 2500);

    return () => clearInterval(messageInterval);
  }, []);

  // Mark as complete when progress hits 90+
  useEffect(() => {
    if (progress >= 90) {
      const timeout = setTimeout(() => setIsComplete(true), 400);
      return () => clearTimeout(timeout);
    }
  }, [progress]);

  const getMessage = useCallback(() => LOADING_MESSAGES[messageIndex], [messageIndex]);

  return (
    <main className="relative min-h-screen bg-background overflow-hidden flex items-center justify-center">
      {/* ===== Background Effects ===== */}

      {/* Grid pattern */}
      <div className="absolute inset-0 bg-grid opacity-[0.4]" />

      {/* Animated gradient orbs */}
      <motion.div
        className="absolute top-1/4 left-1/4 w-64 h-64 rounded-full bg-primary/5 blur-3xl"
        animate={{
          scale: [1, 1.2, 1],
          opacity: [0.3, 0.5, 0.3],
          x: [0, 30, -20, 0],
          y: [0, -20, 30, 0],
        }}
        transition={{
          duration: 8,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />
      <motion.div
        className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-primary/3 blur-3xl"
        animate={{
          scale: [1, 1.3, 1],
          opacity: [0.2, 0.4, 0.2],
          x: [0, -40, 20, 0],
          y: [0, 30, -40, 0],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          ease: "easeInOut",
        }}
      />

      {/* Floating ambient icons */}
      <div className="absolute inset-0 pointer-events-none">
        {FLOATING_ICONS.map(({ Icon, size }, index) => (
          <motion.div
            key={index}
            className="absolute text-muted-foreground/20"
            style={{
              left: `${15 + (index * 70) % 85}%`,
              top: `${10 + (index * 47) % 80}%`,
            }}
            animate={{
              y: [0, -15, 0],
              opacity: [0.15, 0.3, 0.15],
              rotate: [0, index % 2 === 0 ? 10 : -10, 0],
            }}
            transition={{
              duration: 4 + index * 0.5,
              repeat: Infinity,
              ease: "easeInOut",
              delay: index * 0.3,
            }}
          >
            <Icon size={size} strokeWidth={1.5} />
          </motion.div>
        ))}
      </div>

      {/* ===== Main Content ===== */}
      <motion.div
        className="relative z-10 flex flex-col items-center gap-8 px-6"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
      >
        {/* Animated Logo */}
        <div className="flex flex-col items-center gap-4">
          {/* Logo container with pulse ring */}
          <div className="relative">
            {/* Outer pulse ring */}
            <motion.div
              className="absolute inset-0 rounded-xl bg-primary/20"
              animate={{ scale: [1, 1.4], opacity: [0.4, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeOut" }}
            />
            {/* Secondary pulse ring with delay */}
            <motion.div
              className="absolute inset-0 rounded-xl bg-primary/15"
              animate={{ scale: [1, 1.4], opacity: [0.4, 0] }}
              transition={{ duration: 2, repeat: Infinity, ease: "easeOut", delay: 1 }}
            />

            {/* Logo box */}
            <motion.div
              className="relative w-16 h-16 rounded-xl bg-primary/10 border border-primary/20 flex items-center justify-center backdrop-blur-sm"
              animate={{ rotate: [0, 1, -1, 0] }}
              transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
            >
              <svg
                className="w-8 h-8 text-primary"
                viewBox="0 0 24 12"
                fill="currentColor"
              >
                <path d="M0 11.5L2 9.5L5 10.5L8 6.5L11 8.5L14 3.5L17 5.5L20 1.5L22 2.5L24 0.5V12H0V11.5Z" />
              </svg>
            </motion.div>
          </div>

          {/* Brand name */}
          <div className="flex items-center gap-2.5">
            <span className="text-2xl font-semibold text-foreground tracking-tight">
              FinScope
            </span>
            <motion.div
              className="w-1.5 h-1.5 rounded-full bg-primary"
              animate={{ opacity: [1, 0.3, 1] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
            />
          </div>
        </div>

        {/* Progress Section */}
        <div className="flex flex-col items-center gap-3 w-full max-w-xs">
          {/* Progress bar */}
          <div className="relative w-full h-1 bg-secondary/50 rounded-full overflow-hidden">
            {/* Glow effect on progress tip */}
            <motion.div
              className="absolute right-0 top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-primary/40 blur-sm"
              animate={{ opacity: [0.4, 0.8, 0.4] }}
              transition={{ duration: 1.5, repeat: Infinity }}
              style={{ left: `calc(${progress}% - 6px)` }}
            />
            {/* Progress fill */}
            <motion.div
              className="h-full bg-gradient-to-r from-primary to-primary/80 rounded-full relative"
              initial={{ width: "0%" }}
              animate={{ width: `${progress}%` }}
              transition={{ type: "tween", ease: "easeOut", duration: 0.15 }}
            >
              {/* Shimmer overlay on progress bar */}
              <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer" />
            </motion.div>
          </div>

          {/* Progress percentage */}
          <div className="flex items-center justify-between w-full">
            <motion.p
              key={messageIndex}
              className="text-xs text-muted-foreground"
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.3 }}
            >
              {getMessage()}
            </motion.p>
            <span className="text-xs font-mono text-muted-foreground/60 tabular-nums">
              {progress}%
            </span>
          </div>
        </div>

        {/* Loading dots animation */}
        <div className="flex items-center gap-1.5">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="w-1 h-1 rounded-full bg-primary/50"
              animate={{
                scale: [1, 1.5, 1],
                opacity: [0.3, 1, 0.3],
              }}
              transition={{
                duration: 1.2,
                repeat: Infinity,
                ease: "easeInOut",
                delay: i * 0.2,
              }}
            />
          ))}
        </div>
      </motion.div>

      {/* Bottom gradient fade */}
      <div className="absolute bottom-0 left-0 right-0 h-32 bg-gradient-to-t from-background to-transparent pointer-events-none" />
      <div className="absolute top-0 left-0 right-0 h-32 bg-gradient-to-b from-background to-transparent pointer-events-none" />
    </main>
  );
}
