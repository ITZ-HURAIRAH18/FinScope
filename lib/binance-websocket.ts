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

/**
 * Connection status mirror for the UI's "Live" indicator (audit M6/Header):
 * the indicator used to be hard-coded green even with no stream connected.
 */
export type BinanceConnectionStatus =
  | 'idle'
  | 'connecting'
  | 'connected'
  | 'polling'
  | 'disconnected';

type StatusCallback = (status: BinanceConnectionStatus) => void;

class BinanceWebSocketClient {
  private ws: WebSocket | null = null;
  private callbacks: Set<PriceUpdateCallback> = new Set();
  private statusCallbacks: Set<StatusCallback> = new Set();
  private status: BinanceConnectionStatus = 'idle';
  private prices: Record<string, CryptoPrice> = {};
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pollingTimer: NodeJS.Timeout | null = null;
  private isPolling = false;
  private wsFailed = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectBaseDelay = 2000; // 2 seconds
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
    'ordiusdt',
    'shibusdt',
    'ltcusdt',
    'trxusdt',
    'linkusdt',
  ];

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('[Binance WS] Already connected');
      return;
    }

    this.reconnectAttempts = 0; // Reset attempts when starting a new connection
    this.setStatus('connecting');

    try {
      // Connect to Binance public 24hr ticker stream for multiple symbols
      const streams = this.symbols.map(s => `${s}@ticker`).join('/');
      const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;

      console.log('[Binance WS] Connecting to ', url);
      this.ws = new WebSocket(url);

      this.ws.onopen = () => {
        console.log('[Binance WS] Connected successfully');
        this.reconnectAttempts = 0; // Reset on successful connection
        this.wsFailed = false;
        this.setStatus('connected');
        
        // Stop polling if WS reconnected
        if (this.isPolling) {
          console.log('[Binance WS] Stopping fallback polling, using WebSocket.');
          this.stopPolling();
        }
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

      this.ws.onerror = (event) => {
        // WebSocket error events don't contain detailed error info
        // The actual error will be captured in onclose event
        console.warn('[Binance WS] Connection error occurred');
      };

      this.ws.onclose = (event) => {
        console.log(`[Binance WS] Connection closed (code: ${event.code}, reason: ${event.reason || 'No reason provided'})`);

        // Mark WebSocket as failed
        this.wsFailed = true;
        
        // Start fallback polling if not already polling
        if (!this.isPolling) {
          console.log('[Binance WS] Starting fallback REST API polling...');
          this.startPolling();
        } else {
          // Only schedule reconnect if we want to retry WS later
          this.scheduleReconnect();
        }
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
    
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`[Binance WS] Max reconnection attempts (${this.maxReconnectAttempts}) reached. Using REST polling only.`);
      if (!this.isPolling) {
        this.startPolling();
      }
      return;
    }
    
    this.reconnectAttempts++;
    // Exponential backoff: 2s, 4s, 8s, 16s, 32s
    const delay = Math.min(this.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
    
    console.log(`[Binance WS] Attempting to reconnect... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}, delay: ${delay}ms)`);
    
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private async startPolling() {
    if (this.isPolling) return;
    this.isPolling = true;
    // WebSocket is down — we're serving 10s REST snapshots instead.
    this.setStatus('polling');
    
    await this.fetchPricesFromRestApi();
    
    // Poll every 10 seconds
    this.pollingTimer = setInterval(() => {
      this.fetchPricesFromRestApi();
    }, 10000);
  }

  private stopPolling() {
    if (this.pollingTimer) {
      clearInterval(this.pollingTimer);
      this.pollingTimer = null;
    }
    this.isPolling = false;
    this.wsFailed = false;
    this.reconnectAttempts = 0;
  }

  private async fetchPricesFromRestApi() {
    try {
      const response = await fetch('/api/crypto-prices?symbols=' + this.symbols.map(s => s.replace('usdt', '').toUpperCase()).join(','));
      
      if (!response.ok) {
        console.error('[Binance REST] API error:', response.status);
        return;
      }
      
      const data = await response.json();
      // New response shape: { prices: {...}, meta: {...} } (tolerate the old flat map)
      const pricesMap: Record<string, CryptoPrice> = data?.prices ?? data;
      
      // Merge with existing prices (lastUpdate comes from the provider fetch
      // time inside the route — not re-stamped here)
      Object.keys(pricesMap).forEach(symbol => {
        if (pricesMap[symbol] && typeof pricesMap[symbol] === 'object') {
          this.prices[symbol] = pricesMap[symbol];
        }
      });
      
      // Notify callbacks
      this.notifyCallbacks();
    } catch (error) {
      console.error('[Binance REST] Failed to fetch prices:', error);
    }
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
      this.reconnectTimer = null;
    }
    this.stopPolling();
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
    this.callbacks.clear();
    this.setStatus('disconnected');
    this.statusCallbacks.clear();
  }

  /** Current connection status (WS connected / REST fallback / idle). */
  getStatus(): BinanceConnectionStatus {
    return this.status;
  }

  /** Subscribe to status changes; the callback fires immediately with the
   *  current status. Returns an unsubscribe function. */
  onStatus(callback: StatusCallback): () => void {
    this.statusCallbacks.add(callback);
    try {
      callback(this.status);
    } catch (error) {
      console.error('[Binance WS] Status callback error:', error);
    }
    return () => {
      this.statusCallbacks.delete(callback);
    };
  }

  private setStatus(status: BinanceConnectionStatus) {
    if (this.status === status) return;
    this.status = status;
    this.statusCallbacks.forEach((cb) => {
      try {
        cb(status);
      } catch (error) {
        console.error('[Binance WS] Status callback error:', error);
      }
    });
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
