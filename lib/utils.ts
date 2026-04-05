import { clsx, type ClassValue } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/**
 * Format number as currency
 * Automatically adjusts decimal places for very small values
 */
export function formatCurrency(value: number, currency: string = 'USD'): string {
  // For very small values (less than 0.01), use more decimal places
  let minimumFractionDigits = 2;
  let maximumFractionDigits = 2;
  
  if (value < 0.01 && value > 0) {
    // For values like 0.00004, show up to 8 decimal places
    minimumFractionDigits = 2;
    maximumFractionDigits = 8;
  } else if (value < 1 && value > 0) {
    // For values like 0.42, show up to 4 decimal places
    minimumFractionDigits = 2;
    maximumFractionDigits = 4;
  }
  
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency,
    minimumFractionDigits,
    maximumFractionDigits,
  }).format(value);
}

/**
 * Format large numbers with abbreviations (K, M, B, T)
 */
export function formatLargeNumber(value: number): string {
  if (value >= 1e12) {
    return `$${(value / 1e12).toFixed(2)}T`;
  }
  if (value >= 1e9) {
    return `$${(value / 1e9).toFixed(2)}B`;
  }
  if (value >= 1e6) {
    return `$${(value / 1e6).toFixed(2)}M`;
  }
  if (value >= 1e3) {
    return `$${(value / 1e3).toFixed(2)}K`;
  }
  return `$${value.toFixed(2)}`;
}

/**
 * Format percentage with + or - sign
 */
export function formatPercentage(value: number): string {
  const sign = value >= 0 ? '+' : '';
  return `${sign}${value.toFixed(2)}%`;
}

/**
 * Get color class based on value (green for positive, red for negative)
 * Uses design system tokens (text-success/text-error) instead of hardcoded Tailwind colors
 */
export function getPriceChangeColor(value: number): string {
  return value >= 0 ? 'text-success' : 'text-error';
}

/**
 * Format date to relative time (e.g., "2 hours ago")
 */
export function formatRelativeTime(date: Date): string {
  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (diffInSeconds < 60) {
    return 'just now';
  }
  if (diffInSeconds < 3600) {
    const minutes = Math.floor(diffInSeconds / 60);
    return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
  }
  if (diffInSeconds < 86400) {
    const hours = Math.floor(diffInSeconds / 3600);
    return `${hours} hour${hours > 1 ? 's' : ''} ago`;
  }
  const days = Math.floor(diffInSeconds / 86400);
  return `${days} day${days > 1 ? 's' : ''} ago`;
}

/**
 * Debounce function for search inputs
 */
export function debounce<T extends (...args: any[]) => any>(
  func: T,
  wait: number
): (...args: Parameters<T>) => void {
  let timeout: NodeJS.Timeout | null = null;
  return (...args: Parameters<T>) => {
    if (timeout) clearTimeout(timeout);
    timeout = setTimeout(() => func(...args), wait);
  };
}
export function getFinnhubResolution(timeframe: string): string {
  switch (timeframe) {
    case '1s':
    case '1m':
      return '1'; // 1 minute resolution
    case '5m':
      return '5';
    case '15m':
      return '15';
    case '1h':
      return '60';
    case '1d':
      return 'D';
    default:
      return '1';
  }
}
