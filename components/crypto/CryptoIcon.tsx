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
    // Specific override for ORDI if known, otherwise generic sources might catch it if updated
    `https://icons.llamao.fi/icons/tokens/0/${symbol.toLowerCase()}?h=60&w=60`, // generic defillama source often has many tokens
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
        className={`${className} flex bg-gradient-to-r from-red-600 via-red-500 to-pink-500 rounded-full items-center justify-center`}
      >
        <span className="text-white font-bold text-sm">
          {symbol.substring(0, 1)}
        </span>
      </div>
    );
  }

  return (
    <img
      src={iconSources[iconError]}
      alt={symbol}
      className={`${className} rounded-full`}
      onError={handleImageError}
    />
  );
}
