"use client";

import React from "react";
import { useAppSelector } from "@/store/hooks";
import {
  formatCurrency,
  formatPercentage,
  getPriceChangeColor,
} from "@/lib/utils";
import { useRouter } from "next/navigation";

interface MarketTableProps {
  type: "crypto" | "stocks";
}

function MarketTable({ type }: MarketTableProps) {
  const router = useRouter();
  const { cryptoPrices, stockPrices, searchQuery, sortField, sortOrder } =
    useAppSelector((state) => state.market);

  // Get the appropriate data based on type
  const data = type === "crypto" ? cryptoPrices : stockPrices;

  // Convert to array and filter
  const items = Object.values(data).filter((item: any) => {
    if (!searchQuery) return true;
    const symbol = item.symbol.toLowerCase();
    return symbol.includes(searchQuery.toLowerCase());
  });

  // Sort items
  const sortedItems = [...items].sort((a: any, b: any) => {
    let aVal, bVal;

    switch (sortField) {
      case "name":
        aVal = a.symbol;
        bVal = b.symbol;
        break;
      case "price":
        aVal = a.price;
        bVal = b.price;
        break;
      case "change":
        aVal =
          type === "crypto" ? a.priceChangePercent24h : a.priceChangePercent;
        bVal =
          type === "crypto" ? b.priceChangePercent24h : b.priceChangePercent;
        break;
      case "volume":
        aVal = type === "crypto" ? a.volume24h : a.volume;
        bVal = type === "crypto" ? b.volume24h : b.volume;
        break;
      default:
        return 0;
    }

    if (sortOrder === "asc") {
      return aVal > bVal ? 1 : -1;
    } else {
      return aVal < bVal ? 1 : -1;
    }
  });

  const handleRowClick = (symbol: string) => {
    if (type === "crypto") {
      router.push(`/crypto/${symbol.toLowerCase()}`);
    } else {
      router.push(`/stocks/${symbol}`);
    }
  };

  if (items.length === 0) {
    return (
      <div className="glass-card p-8 rounded-2xl text-center">
        <div className="text-gray-400">
          {searchQuery ? "No results found" : "Waiting for market data..."}
        </div>
      </div>
    );
  }

  return (
    <div className="glass-card rounded-2xl overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b border-white/10">
              <th className="text-left px-6 py-4 text-gray-400 font-semibold">
                Symbol
              </th>
              <th className="text-right px-6 py-4 text-gray-400 font-semibold">
                Price
              </th>
              <th className="text-right px-6 py-4 text-gray-400 font-semibold">
                24h Change
              </th>
              <th className="text-right px-6 py-4 text-gray-400 font-semibold">
                24h %
              </th>
              {type === "crypto" && (
                <>
                  <th className="text-right px-6 py-4 text-gray-400 font-semibold">
                    24h High
                  </th>
                  <th className="text-right px-6 py-4 text-gray-400 font-semibold">
                    24h Low
                  </th>
                </>
              )}
              <th className="text-right px-6 py-4 text-gray-400 font-semibold">
                Volume
              </th>
            </tr>
          </thead>
          <tbody>
            {sortedItems.map((item: any) => {
              const changePercent =
                type === "crypto"
                  ? item.priceChangePercent24h
                  : item.priceChangePercent;
              const priceChange =
                type === "crypto" ? item.priceChange24h : item.priceChange;
              const volume = type === "crypto" ? item.volume24h : item.volume;

              return (
                <tr
                  key={item.symbol}
                  onClick={() => handleRowClick(item.symbol)}
                  className="border-b border-white/5 hover:bg-white/5 transition cursor-pointer group"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center">
                      <img
                        src={
                          type === "crypto"
                            ? `https://assets.coincap.io/assets/icons/${item.symbol.toLowerCase()}@2x.png`
                            : `https://financialmodelingprep.com/image-stock/${item.symbol}.png`
                        }
                        alt={item.symbol}
                        className="w-8 h-8 rounded-full mr-3"
                        onError={(e) => {
                          // Fallback to gradient if image fails to load
                          e.currentTarget.style.display = "none";
                          e.currentTarget.nextElementSibling?.classList.remove(
                            "hidden"
                          );
                        }}
                      />
                      <div className="hidden w-8 h-8 rounded-full bg-gradient-to-r from-blue-500 to-purple-600 flex items-center justify-center mr-3 group-hover:shadow-lg group-hover:shadow-blue-500/50 transition">
                        <span className="text-white font-bold text-sm">
                          {item.symbol.substring(0, 1)}
                        </span>
                      </div>
                      <div>
                        <div className="text-white font-semibold">
                          {item.symbol}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="text-white font-mono">
                      {formatCurrency(item.price)}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div
                      className={`font-mono ${getPriceChangeColor(
                        priceChange
                      )}`}
                    >
                      {priceChange >= 0 ? "+" : ""}
                      {formatCurrency(priceChange)}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div
                      className={`font-mono font-semibold ${getPriceChangeColor(
                        changePercent
                      )}`}
                    >
                      {formatPercentage(changePercent)}
                    </div>
                  </td>
                  {type === "crypto" && (
                    <>
                      <td className="px-6 py-4 text-right">
                        <div className="text-gray-300 font-mono">
                          {formatCurrency(item.high24h)}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <div className="text-gray-300 font-mono">
                          {formatCurrency(item.low24h)}
                        </div>
                      </td>
                    </>
                  )}
                  <td className="px-6 py-4 text-right">
                    <div className="text-gray-300 font-mono">
                      {volume.toLocaleString("en-US", {
                        maximumFractionDigits: 0,
                      })}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {sortedItems.length > 0 && (
        <div className="px-6 py-4 border-t border-white/10 text-sm text-gray-400 text-center">
          Showing {sortedItems.length}{" "}
          {type === "crypto" ? "cryptocurrencies" : "stocks"} · Live updates via
          WebSocket
        </div>
      )}
    </div>
  );
}
export default React.memo(MarketTable);
