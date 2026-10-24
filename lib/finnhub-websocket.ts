/**
 * Finnhub WebSocket Client for Real-time Stock Prices
 *
 * The API key is fetched from the authenticated server proxy
 * (/api/finnhub/ws-token) — it is intentionally NOT read from
 * NEXT_PUBLIC_* environment variables and there is no client-side
 * key fallback (see docs/AUDIT-REPORT.md finding H1).
 */

export interface StockPrice {
  symbol: string;
  price: number;
  priceChange: number;
  priceChangePercent: number;
  volume: number;
  lastUpdate: number;
}

export type FinnhubConnectionStatus = 'idle' | 'connecting' | 'connected' | 'disconnected' | 'unauthorized';

type StockPriceUpdateCallback = (data: Record<string, StockPrice>) => void;
type StatusCallback = (status: FinnhubConnectionStatus) => void;

class FinnhubWebSocketClient {
  private ws: WebSocket | null = null;
  private callbacks: Set<StockPriceUpdateCallback> = new Set();
  private statusCallbacks: Set<StatusCallback> = new Set();
  private prices: Record<string, StockPrice> = {};
  private reconnectTimer: NodeJS.Timeout | null = null;
  private wsToken: string | null = null;
  private status: FinnhubConnectionStatus = 'idle';
  private connecting = false;
  private symbols: string[] = [
    'AAPL',
    'GOOGL',
    'MSFT',
    'TSLA',
    'AMZN',
    'META',
    'NVDA',
    'AMD',
    'NFLX',
    'DIS',
    'OANDA:XAU_USD', // Gold Spot
    'SLV', // Silver
  ];

  private setStatus(status: FinnhubConnectionStatus) {
    if (this.status === status) return;
    this.status = status;
    this.statusCallbacks.forEach((cb) => {
      try {
        cb(status);
      } catch (error) {
        console.error('[Finnhub WS] Status callback error:', error);
      }
    });
  }

  getStatus(): FinnhubConnectionStatus {
    return this.status;
  }

  subscribeStatus(callback: StatusCallback): () => void {
    this.statusCallbacks.add(callback);
    callback(this.status);
    return () => {
      this.statusCallbacks.delete(callback);
    };
  }

  private async getWebSocketToken(): Promise<string> {
    if (this.wsToken) {
      return this.wsToken;
    }

    const response = await fetch('/api/finnhub/ws-token');
    if (!response.ok) {
      // 401 = user not signed in; other statuses = server-side misconfiguration.
      throw new Error(`Token request failed with status ${response.status}`);
    }
    const data = await response.json();
    if (data.token) {
      this.wsToken = data.token;
      return data.token;
    }
    throw new Error('No token returned from server');
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN || this.connecting) {
      return;
    }
    this.connecting = true;
    this.setStatus('connecting');

    this.getWebSocketToken()
      .then((token) => {
        this.connecting = false;
        const url = `wss://ws.finnhub.io?token=${token}`;

        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          // Reset backoff only on a genuinely successful connection.
          this.reconnectAttempts = 0;
          this.setStatus('connected');
          this.symbols.forEach((symbol) => {
            this.subscribeSymbol(symbol);
          });
          // Fetch initial data via REST to populate immediately
          this.fetchInitialData();
        };

        this.ws.onmessage = (event) => {
          try {
            const message = JSON.parse(event.data);
            if (message.type === 'trade' && message.data) {
              message.data.forEach((trade: any) => {
                this.handleTradeUpdate(trade);
              });
            }
          } catch (error) {
            console.error('[Finnhub WS] Error parsing message:', error);
          }
        };

        this.ws.onerror = () => {
          // WebSocket error events don't contain detailed error info;
          // the close handler drives reconnection.
          console.warn('[Finnhub WS] Connection error occurred');
        };

        this.ws.onclose = (event) => {
          const unauthorized = event.code === 401 || event.code === 4401;
          if (unauthorized) {
            // Token expired/invalid — force a fresh token on the next attempt.
            this.wsToken = null;
          }
          this.scheduleReconnect(unauthorized);
        };
      })
      .catch((error) => {
        this.connecting = false;
        const unauthorized = /status 401/.test(String(error?.message));
        console.error('[Finnhub WS] Failed to obtain token:', error);
        this.setStatus(unauthorized ? 'unauthorized' : 'disconnected');
        this.scheduleReconnect(unauthorized);
      });
  }

  async fetchInitialData() {
    const promises = this.symbols.map(async (symbol) => {
      try {
        // Use proxied API route to hide API key
        const response = await fetch(`/api/finnhub/quote?symbol=${encodeURIComponent(symbol)}`);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
          console.error(`[Finnhub] API error for ${symbol}:`, errorData);
          return;
        }

        const data = await response.json();
        // Finnhub quote: c=current, d=change, dp=percent, h=high, l=low, o=open, pc=prev close
        if (data.c) {
          this.prices[symbol] = {
            symbol,
            price: data.c,
            priceChange: data.d,
            priceChangePercent: data.dp,
            volume: 0, // Quote endpoint doesn't provide volume
            lastUpdate: Date.now(),
          };
        }
      } catch (e) {
        console.error(`[Finnhub] Error fetching initial data for ${symbol}`, e);
      }
    });

    await Promise.all(promises);
    this.notifyCallbacksImmediate();
  }

  private subscribeSymbol(symbol: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: 'subscribe', symbol }));
    }
  }

  private handleTradeUpdate(trade: any) {
    const symbol = trade.s;
    const price = trade.p;
    const volume = trade.v;

    // Calculate change if we have previous data
    const existingPrice = this.prices[symbol];
    let priceChange = 0;
    let priceChangePercent = 0;

    if (existingPrice) {
      priceChange = price - existingPrice.price;
      priceChangePercent = (priceChange / existingPrice.price) * 100;
    }

    this.prices[symbol] = {
      symbol,
      price,
      priceChange,
      priceChangePercent,
      volume: existingPrice ? existingPrice.volume + volume : volume,
      lastUpdate: Date.now(),
    };

    // Debounced notification (single call — previously invoked twice per trade)
    this.scheduleNotify();
  }

  private debounceTimer: NodeJS.Timeout | null = null;
  private pendingUpdate = false;

  private scheduleNotify() {
    if (this.debounceTimer) return; // already scheduled
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      if (this.pendingUpdate) {
        this.pendingUpdate = false;
        this.notifyCallbacksImmediate();
      }
    }, 200);
    this.pendingUpdate = true;
  }

  private notifyCallbacksImmediate() {
    this.callbacks.forEach(callback => {
      try {
        callback(this.prices);
      } catch (error) {
        console.error('[Finnhub WS] Callback error:', error);
      }
    });
  }

  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectBaseDelay = 1000; // 1 second

  private scheduleReconnect(tokenExpired = false) {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    if (this.status === 'unauthorized' && !tokenExpired) {
      return; // no point retrying without credentials
    }

    this.reconnectAttempts++;
    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      console.error(`[Finnhub WS] Max reconnection attempts (${this.maxReconnectAttempts}) reached. Giving up.`);
      this.setStatus('disconnected');
      return;
    }

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
    // (previously the attempt counter was reset inside this callback,
    //  which made the backoff never exceed 1s — see audit finding)
    const delay = Math.min(this.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);

    this.setStatus('connecting');
    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  subscribe(callback: StockPriceUpdateCallback) {
    this.callbacks.add(callback);
    // Immediately send current prices if available
    if (Object.keys(this.prices).length > 0) {
      callback(this.prices);
    }
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /** Full teardown: closes the socket and drops every subscriber. */
  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.reconnectAttempts = 0;
    this.connecting = false;
    if (this.ws) {
      this.symbols.forEach(symbol => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'unsubscribe', symbol }));
        }
      });
      this.ws.close();
      this.ws = null;
    }
    this.callbacks.clear();
    this.setStatus('idle');
  }

  getCurrentPrices(): Record<string, StockPrice> {
    return { ...this.prices };
  }

  getPrice(symbol: string): StockPrice | undefined {
    return this.prices[symbol.toUpperCase()];
  }
}

// Singleton instance — the token is fetched from the server proxy on connect().
let finnhubWSInstance: FinnhubWebSocketClient | null = null;

export async function getFinnhubWS(): Promise<FinnhubWebSocketClient> {
  if (!finnhubWSInstance) {
    finnhubWSInstance = new FinnhubWebSocketClient();
  }
  return finnhubWSInstance;
}

export type { FinnhubWebSocketClient };
