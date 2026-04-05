/**
 * Finnhub WebSocket Client for Real-time Stock Prices
 * Requires API key
 */

export interface StockPrice {
  symbol: string;
  price: number;
  priceChange: number;
  priceChangePercent: number;
  volume: number;
  lastUpdate: number;
}

type StockPriceUpdateCallback = (data: Record<string, StockPrice>) => void;

class FinnhubWebSocketClient {
  private ws: WebSocket | null = null;
  private callbacks: Set<StockPriceUpdateCallback> = new Set();
  private prices: Record<string, StockPrice> = {};
  private reconnectTimer: NodeJS.Timeout | null = null;
  private apiKey: string;
  private wsToken: string | null = null;
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

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  private async getWebSocketToken(): Promise<string> {
    if (this.wsToken) {
      return this.wsToken;
    }
    
    try {
      const response = await fetch('/api/finnhub/ws-token');
      const data = await response.json();
      if (data.token) {
        this.wsToken = data.token;
        return data.token;
      }
      throw new Error('No token returned from server');
    } catch (error) {
      console.error('[Finnhub WS] Failed to fetch WebSocket token:', error);
      // Fallback to constructor API key
      return this.apiKey;
    }
  }

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) {
      console.log('[Finnhub WS] Already connected');
      return;
    }

    try {
      // Connect WebSocket using token from server
      this.getWebSocketToken().then(token => {
        const url = `wss://ws.finnhub.io?token=${token}`;
        console.log('[Finnhub WS] Connecting...');

        this.ws = new WebSocket(url);

        this.ws.onopen = () => {
          console.log('[Finnhub WS] Connected successfully');
          this.reconnectAttempts = 0; // Reset on successful connection
          // Subscribe to symbols
          this.symbols.forEach(symbol => {
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

        this.ws.onerror = (event) => {
          // WebSocket error events don't contain detailed error info
          console.warn('[Finnhub WS] Connection error occurred');
        };

        this.ws.onclose = (event) => {
          console.log(`[Finnhub WS] Connection closed (code: ${event.code}, reason: ${event.reason || 'No reason provided'})`);
          this.scheduleReconnect();
        };
      });
    } catch (error) {
      console.error('[Finnhub WS] Connection error:', error);
      this.scheduleReconnect();
    }
  }

  async fetchInitialData() {
    console.log('[Finnhub] Fetching initial data...');
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
      console.log(`[Finnhub WS] Subscribed to ${symbol}`);
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
    // Trigger debounced notification
    this.notifyCallbacks();

    // Notify all subscribers
    this.notifyCallbacks();
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

  private notifyCallbacks() {
    this.scheduleNotify();
  }

  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectBaseDelay = 1000; // 1 second

  private scheduleReconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error(`[Finnhub WS] Max reconnection attempts (${this.maxReconnectAttempts}) reached. Giving up.`);
      return;
    }
    
    this.reconnectAttempts++;
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, max 30s
    const delay = Math.min(this.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts - 1), 30000);
    
    console.log(`[Finnhub WS] Attempting to reconnect... (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}, delay: ${delay}ms)`);
    
    this.reconnectTimer = setTimeout(() => {
      this.reconnectAttempts = 0; // Reset on reconnect attempt
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

  disconnect() {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
    }
    this.reconnectAttempts = 0; // Reset attempts on manual disconnect
    if (this.ws) {
      // Unsubscribe from all symbols
      this.symbols.forEach(symbol => {
        if (this.ws?.readyState === WebSocket.OPEN) {
          this.ws.send(JSON.stringify({ type: 'unsubscribe', symbol }));
        }
      });
      this.ws.close();
      this.ws = null;
    }
    this.callbacks.clear();
  }

  getCurrentPrices(): Record<string, StockPrice> {
    return { ...this.prices };
  }

  getPrice(symbol: string): StockPrice | undefined {
    return this.prices[symbol.toUpperCase()];
  }
}

// Create singleton instance (will be initialized with API key from env)
let finnhubWSInstance: FinnhubWebSocketClient | null = null;

export async function getFinnhubWS(apiKey?: string): Promise<FinnhubWebSocketClient> {
  if (!finnhubWSInstance) {
    let key = apiKey || process.env.NEXT_PUBLIC_FINNHUB_API_KEY || '';
    
    // Try to get token from server-side API route
    try {
      const response = await fetch('/api/finnhub/ws-token');
      const data = await response.json();
      if (data.token) {
        key = data.token;
      }
    } catch (error) {
      console.warn('[Finnhub WS] Using fallback API key:', error);
    }
    
    finnhubWSInstance = new FinnhubWebSocketClient(key);
  }
  return finnhubWSInstance;
}

export type { FinnhubWebSocketClient };
