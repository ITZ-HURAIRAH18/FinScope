"use client";

import React, { useState } from "react";

interface CryptoIconProps {
  symbol: string;
  className?: string;
}

export default function CryptoIcon({ symbol, className = "w-8 h-8" }: CryptoIconProps) {
  const [iconError, setIconError] = useState<number>(0);
  const [showFallback, setShowFallback] = useState(false);

  const iconSources = [
    `https://assets.coincap.io/assets/icons/${symbol.toLowerCase()}@2x.png`,
    `https://cryptologos.cc/logos/${symbol.toLowerCase()}-${symbol.toLowerCase()}-logo.png`,
    `https://s2.coinmarketcap.com/static/img/coins/64x64/${symbol.toLowerCase()}.png`,
    `https://icons.llamao.fi/icons/tokens/0/${symbol.toLowerCase()}?h=60&w=60`,
  ];

  const handleImageError = () => {
    if (iconError < iconSources.length - 1) {
      setIconError(iconError + 1);
    } else {
      setShowFallback(true);
    }
  };

  if (showFallback) {
    return (
      <div
        className={`${className} flex bg-card border border-card-border rounded-md items-center justify-center`}
      >
        <span className="text-primary font-semibold text-xs">
          {symbol.substring(0, 2)}
        </span>
      </div>
    );
  }

  return (
    <img
      src={iconSources[iconError]}
      alt={symbol}
      className={`${className} rounded-md`}
      onError={handleImageError}
    />
  );
}
