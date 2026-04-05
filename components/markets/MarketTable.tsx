"use client";

import React, { useState } from "react";
import { useAppSelector } from "@/store/hooks";
import {
  formatCurrency,
  formatPercentage,
  formatLargeNumber,
  getPriceChangeColor,
} from "@/lib/utils";
import { useRouter } from "next/navigation";
import CryptoIcon from "../crypto/CryptoIcon";
import { Card, CardContent, Badge } from "@/components/ui";
import { ArrowUpRight, ArrowDownRight, TrendingUp, TrendingDown } from "lucide-react";

interface MarketTableProps {
  type: "crypto" | "stocks";
}

function MarketTable({ type }: MarketTableProps) {
  const router = useRouter();
  const { cryptoPrices, stockPrices, searchQuery, sortField, sortOrder } =
    useAppSelector((state) => state.market);

  const [localSort, setLocalSort] = useState<{ field: string; order: 'asc' | 'desc' } | null>(null);

  const data = type === "crypto" ? cryptoPrices : stockPrices;

  const items = Object.values(data).filter((item: any) => {
    if (!searchQuery) return true;
    const symbol = item.symbol.toLowerCase();
    return symbol.includes(searchQuery.toLowerCase());
  });

  // Use local sort if set, otherwise use global sort
  const activeSortField = localSort?.field || sortField;
  const activeSortOrder = localSort?.order || sortOrder;

  const sortedItems = [...items].sort((a: any, b: any) => {
    let aVal, bVal;

    switch (activeSortField) {
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

    if (activeSortOrder === "asc") {
      return aVal > bVal ? 1 : -1;
    } else {
      return aVal < bVal ? 1 : -1;
    }
  });

  const handleSort = (field: string) => {
    if (localSort?.field === field) {
      setLocalSort({ field, order: localSort.order === 'asc' ? 'desc' : 'asc' });
    } else {
      setLocalSort({ field, order: 'desc' });
    }
  };

  const SortIcon = ({ field }: { field: string }) => {
    if (activeSortField !== field) return <span className="inline-block w-3 h-3 ml-1 opacity-0 group-hover:opacity-40">▼</span>;
    return activeSortOrder === 'asc' 
      ? <span className="inline-block w-3 h-3 ml-1 text-primary">▲</span>
      : <span className="inline-block w-3 h-3 ml-1 text-primary">▼</span>;
  };

  const handleRowClick = (symbol: string) => {
    if (type === "crypto") {
      router.push(`/crypto/${symbol.toLowerCase()}`);
    } else {
      router.push(`/stocks/${symbol}`);
    }
  };

  if (items.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center">
          <svg className="w-10 h-10 mx-auto mb-3 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
          </svg>
          <div className="text-sm text-muted-foreground">
            {searchQuery ? "No results found" : "Waiting for market data..."}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-card-border bg-secondary/30">
                <th className="text-left px-4 py-3 text-xs font-semibold text-foreground/80 uppercase tracking-wider">
                  Symbol
                </th>
                <th 
                  className="text-right px-4 py-3 text-xs font-semibold text-foreground/80 uppercase tracking-wider cursor-pointer select-none group"
                  onClick={() => handleSort('price')}
                >
                  <span className="inline-flex items-center">Price<SortIcon field="price" /></span>
                </th>
                <th 
                  className="text-right px-4 py-3 text-xs font-semibold text-foreground/80 uppercase tracking-wider cursor-pointer select-none group"
                  onClick={() => handleSort('change')}
                >
                  <span className="inline-flex items-center">24h Change<SortIcon field="change" /></span>
                </th>
                <th className="text-right px-4 py-3 text-xs font-semibold text-foreground/80 uppercase tracking-wider">
                  24h %
                </th>
                {type === "crypto" && (
                  <>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                      24h High
                    </th>
                    <th className="text-right px-4 py-3 text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                      24h Low
                    </th>
                  </>
                )}
                <th 
                  className="text-right px-4 py-3 text-xs font-semibold text-foreground/70 uppercase tracking-wider cursor-pointer select-none group"
                  onClick={() => handleSort('volume')}
                >
                  <span className="inline-flex items-center">Volume<SortIcon field="volume" /></span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sortedItems.map((item: any, index: number) => {
                const changePercent =
                  type === "crypto"
                    ? item.priceChangePercent24h
                    : item.priceChangePercent;
                const priceChange =
                  type === "crypto" ? item.priceChange24h : item.priceChange;
                const volume = type === "crypto" ? item.volume24h : item.volume;
                const isPositive = changePercent >= 0;

                return (
                  <tr
                    key={item.symbol}
                    onClick={() => handleRowClick(item.symbol)}
                    className={`border-b border-card-border/50 last:border-0 hover:bg-accent/80 transition-colors duration-150 cursor-pointer group ${
                      index % 2 === 0 ? 'bg-transparent' : 'bg-secondary/10'
                    }`}
                  >
                    <td className="px-4 py-3.5">
                      <div className="flex items-center">
                        <div className="border-l-2 border-transparent group-hover:border-primary transition-colors duration-150 pl-0 -ml-0 pr-0">
                          {type === "crypto" ? (
                            <CryptoIcon symbol={item.symbol} className="w-7 h-7 mr-2.5 rounded-md" />
                          ) : (
                            <img
                              src={`https://financialmodelingprep.com/image-stock/${
                                item.symbol === 'OANDA:XAU_USD' ? 'GLD' : item.symbol
                              }.png`}
                              alt={item.symbol}
                              className="w-7 h-7 rounded-md mr-2.5 bg-secondary object-cover"
                              onError={(e) => {
                                const target = e.currentTarget as HTMLImageElement;
                                target.style.display = "none";
                              }}
                            />
                          )}
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-foreground">
                            {item.symbol === 'OANDA:XAU_USD' ? 'Gold' : item.symbol}
                          </div>
                          {item.symbol === 'OANDA:XAU_USD' && (
                            <div className="text-xs text-muted-foreground mt-0.5">Spot</div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className="text-sm font-mono font-semibold text-foreground">
                        {formatCurrency(item.price)}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className={`text-sm font-mono font-medium ${getPriceChangeColor(priceChange)}`}>
                        {priceChange >= 0 ? "+" : ""}
                        {formatCurrency(priceChange)}
                      </div>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      <div className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-xs font-mono font-semibold ${
                        isPositive ? 'bg-success/10 text-success' : 'bg-error/10 text-error'
                      }`}>
                        {isPositive ? (
                          <ArrowUpRight className="w-3 h-3" />
                        ) : (
                          <ArrowDownRight className="w-3 h-3" />
                        )}
                        {formatPercentage(changePercent)}
                      </div>
                    </td>
                    {type === "crypto" && (
                      <>
                        <td className="px-4 py-3.5 text-right">
                          <div className="text-xs font-mono text-muted-foreground/80">
                            {formatCurrency(item.high24h)}
                          </div>
                        </td>
                        <td className="px-4 py-3.5 text-right">
                          <div className="text-xs font-mono text-muted-foreground/80">
                            {formatCurrency(item.low24h)}
                          </div>
                        </td>
                      </>
                    )}
                    <td className="px-4 py-3.5 text-right">
                      <div className="text-xs font-mono text-muted-foreground">
                        {formatLargeNumber(volume)}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {sortedItems.length > 0 && (
          <div className="px-4 py-3 border-t border-card-border text-xs text-muted-foreground text-center bg-secondary/20">
            Showing {sortedItems.length} {type === "crypto" ? "cryptocurrencies" : "stocks"}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
export default React.memo(MarketTable);
