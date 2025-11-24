/**
 * Binance WebSocket Client for Real-time Crypto Prices
 * Connects to Binance public WebSocket streams
 */

export interface CryptoPrice {
  symbol: string;
  price: number;
  priceChange24h: number;
  priceChangePercent24h: number;
  volume24h: number;
  high24h: number;
  low24h: number;
  lastUpdate: number;
}

type PriceUpdateCallback = (data: Record<string, CryptoPrice>) => void;

class BinanceWebSocketClient {
  private ws: WebSocket | null = null;
  private callbacks: Set<PriceUpdateCallback> = new Set();
  private prices: Record<string, CryptoPrice> = {};
  private reconnectTimer: NodeJS.Timeout | null = null;
  private symbols: string[] = [
    'btcusdt',
    'ethusdt',
    'bnbusdt',
    'solusdt',
    'xrpusdt',
    'adausdt',
    'dogeusdt',
    'maticusdt',
    'dotusdt',
    'avaxusdt',
  ];

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('[Binance WS] Already connected');
      return;
    }

    try {
      // Connect to Binance public 24hr ticker stream for multiple symbols
      const streams = this.symbols.map(s => `${s}@ticker`).join('/');
      const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;

      console.log('[Binance WS] Connecting to ', url);
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('[Binance WS] Connected successfully');
      };

      this.ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          if (message.data) {
            this.handleTickerUpdate(message.data);
          }
        } catch (error) {
          console.error('[Binance WS] Error parsing message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('[Binance WS] Error:', error);
      };

      this.ws.onclose = () => {
        console.log('[Binance WS] Connection closed, reconnecting...');
        this.scheduleReconnect();
      };
    } catch (error) {
      console.error('[Binance WS] Connection error:', error);
      this.scheduleReconnect();
    }
  }

  private handleTickerUpdate(data: any) {
    const symbol = data.s.toLowerCase(); // e.g., 'BTCUSDT'
    const displaySymbol = symbol.replace('usdt', '').toUpperCase();

    const price: CryptoPrice = {
      symbol: displaySymbol,
      price: parseFloat(data.c),
      priceChange24h: parseFloat(data.p),
      priceChangePercent24h: parseFloat(data.P),
      volume24h: parseFloat(data.v),
      high24h: parseFloat(data.h),
      low24h: parseFloat(data.l),
      lastUpdate: Date.now(),
    };

    this.prices[displaySymbol] = price;

    // Notify all subscribers
    this.notifyCallbacks();
  }

  private notifyCallbacks() {
    this.callbacks.forEach(callback => {
      try {
        callback(this.prices);
      } catch (error) {
        console.error('[Binance WS] Callback error:', error);
      }
    });
  }

  private scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.reconnectTimer = setTimeout(() => {
      console.log('[Binance WS] Attempting to reconnect...');
      this.connect();
    }, 5000);
  }

  subscribe(callback: PriceUpdateCallback) {
    this.callbacks.add(callback);
    // Immediately send current prices if available
    if (Object.keys(this.prices).length > 0) {
      callback(this.prices);
    }
    return () => {
      this.callbacks.delete(callback);
    };
  }

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.callbacks.clear();
  }

  getCurrentPrices(): Record<string, CryptoPrice> {
    return { ...this.prices };
  }

  getPrice(symbol: string): CryptoPrice | undefined {
    return this.prices[symbol.toUpperCase()];
  }
}

// Singleton instance
export const binanceWS = new BinanceWebSocketClient();
