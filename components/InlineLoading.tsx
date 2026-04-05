"use client";

import { useEffect, useState } from "react";

interface InlineLoadingProps {
  size?: "sm" | "md" | "lg";
  showTimer?: boolean;
  fullScreen?: boolean;
}

export default function InlineLoading({
  size = "md",
  showTimer = false,
  fullScreen = false
}: InlineLoadingProps) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    const timerInterval = setInterval(() => {
      setSeconds((prev) => prev + 1);
    }, 1000);

    return () => clearInterval(timerInterval);
  }, []);

  const formatTime = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const remainingSecs = secs % 60;
    return `${mins.toString().padStart(2, '0')}:${remainingSecs.toString().padStart(2, '0')}`;
  };

  const sizes = {
    sm: { spinner: "w-5 h-5", text: "text-xs" },
    md: { spinner: "w-8 h-8", text: "text-sm" },
    lg: { spinner: "w-10 h-10", text: "text-base" }
  };

  const currentSize = sizes[size];
  const containerClass = fullScreen
    ? "min-h-screen bg-background flex items-center justify-center"
    : "flex items-center justify-center p-8";

  return (
    <div className={containerClass}>
      <div className="text-center space-y-3 animate-fade-in">
        <svg className={`${currentSize.spinner} animate-spin text-primary mx-auto`} fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
        </svg>
        <div className={currentSize.text}>
          <p className="text-foreground font-medium">Loading...</p>
          {showTimer && (
            <p className="text-muted-foreground font-mono text-xs mt-1">{formatTime(seconds)}</p>
          )}
        </div>
      </div>
    </div>
  );
}
