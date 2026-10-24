import { NextRequest, NextResponse } from 'next/server';

/**
 * News API (Finnhub `/news`).
 *
 * Honesty fixes (docs/AUDIT-REPORT.md H8):
 * - Finnhub's `/news` endpoint only supports `general` and `merge`. The old
 *   code forwarded the UI's `crypto`/`stock` categories straight to it, so
 *   every tab served the same "general" feed while claiming to be filtered.
 *   Now we always request `general` from Finnhub and implement the Crypto /
 *   Stock tabs as an EXPLICIT keyword filter over that feed — the response
 *   meta declares `filter: "keyword"`, and the UI labels it as such.
 * - The cache was a single global entry keyed by nothing, so a `limit=2`
 *   response was served to a later `limit=5` request. Cache is now keyed by
 *   `category:limit`.
 * - The server key (`FINNHUB_API_KEY`) is preferred; the `NEXT_PUBLIC_` env
 *   is only a deployment fallback and is never sent to browsers from here (H1).
 */

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes
const MAX_LIMIT = 100;

const newsCache = new Map<string, { data: any; timestamp: number }>();
const MAX_CACHE_ENTRIES = 20;

type Category = 'general' | 'crypto' | 'stock';

/**
 * Keyword lists for the honest, provider-limited filtering. Matched against
 * headline + summary + Finnhub's `related` symbols with WORD BOUNDARIES —
 * plain substring matching let short tickers (eth, sol, ada) fire inside
 * unrelated words ("Berthe", "resolve", "Adams").
 */
const CRYPTO_KEYWORDS = [
  'crypto', 'cryptocurrency', 'bitcoin', 'btc', 'ethereum', 'eth', 'solana',
  'ripple', 'xrp', 'dogecoin', 'doge', 'cardano', 'ada', 'binance', 'coinbase',
  'blockchain', 'token', 'stablecoin', 'defi', 'mining', 'coin', 'digital asset',
];
const STOCK_KEYWORDS = [
  'stock', 'stocks', 'share', 'shares', 'equity', 'nasdaq', 'nyse', 'dow jones',
  's&p', 'earnings', 'ipo', 'dividend', 'analyst', 'revenue', 'profit',
  'quarterly', 'buyback', 'apple', 'microsoft', 'google', 'alphabet', 'amazon',
  'tesla', 'meta', 'nvidia', 'netflix',
];

const KEYWORDS: Record<'crypto' | 'stock', RegExp[]> = {
  // Precompile with the global flag off + word boundaries once at module load.
  crypto: CRYPTO_KEYWORDS.map((k) => new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')),
  stock: STOCK_KEYWORDS.map((k) => new RegExp(`\\b${k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')),
};

function matchesCategory(article: any, category: Category): boolean {
  if (category === 'general') return true;
  const haystack = `${article.headline || ''} ${article.summary || ''} ${
    article.related || ''
  }`;
  return KEYWORDS[category].some((re) => re.test(haystack));
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const rawCategory = searchParams.get('category') || 'general';
    const category: Category =
      rawCategory === 'crypto' || rawCategory === 'stock' ? rawCategory : 'general';
    const limit = Math.min(
      MAX_LIMIT,
      Math.max(1, parseInt(searchParams.get('limit') || '50', 10) || 50)
    );

    // Cache key includes BOTH parameters (H8: the old global entry served
    // e.g. limit=2 results to a limit=5 request).
    const cacheKey = `${category}:${limit}`;
    const cached = newsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
      return NextResponse.json(cached.data);
    }

    const apiKey = process.env.FINNHUB_API_KEY || process.env.NEXT_PUBLIC_FINNHUB_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'API key not configured' },
        { status: 500 }
      );
    }

    // Always request the supported `general` feed — `crypto`/`stock` are not
    // valid Finnhub categories and were silently ignored upstream (H8).
    const url = `https://finnhub.io/api/v1/news?category=general&token=${apiKey}`;

    const response = await fetch(url);

    if (!response.ok) {
      throw new Error(`Finnhub API error: ${response.status}`);
    }

    const data = await response.json();

    const filtered = Array.isArray(data)
      ? data.filter((item: any) => matchesCategory(item, category))
      : [];

    const articles = filtered.slice(0, limit).map((item: any, index: number) => ({
      id: item.id || index,
      headline: item.headline,
      summary: item.summary || '',
      source: item.source,
      url: item.url,
      datetime: item.datetime,
      image: item.image || '/placeholder-news.jpg',
      category,
      related: item.related || undefined,
    }));

    const result = {
      articles,
      total: articles.length,
      meta: {
        provider: 'finnhub',
        providerCategory: 'general', // what was actually requested upstream
        filter: category === 'general' ? 'none' : 'keyword',
        requestedCategory: category,
        limit,
        fetchedAt: new Date().toISOString(),
      },
    };

    // Bounded cache (H8).
    if (newsCache.size >= MAX_CACHE_ENTRIES) {
      const oldestKey = newsCache.keys().next().value;
      if (oldestKey !== undefined) newsCache.delete(oldestKey);
    }
    newsCache.set(cacheKey, { data: result, timestamp: Date.now() });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching news:', error);
    return NextResponse.json(
      { error: 'Failed to fetch news' },
      { status: 500 }
    );
  }
}
