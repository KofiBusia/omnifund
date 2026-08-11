/**
 * OmniFund Pro — Ghana Stock Exchange (GSE) Realtime AFX Sync Service
 * Direct HTML Web Scraper & API Proxy for https://afx.kwayisi.org/gse/
 */

import { fetchGSEPrices as fetchViaGemini } from '../lib/gemini';

export interface GSEStockPrice {
  ticker: string;
  name: string;
  price: number;
  volume?: number;
  change?: string;
  lastUpdated?: string;
}

export interface AFXSyncResult {
  success: boolean;
  source: 'PROXY_DIRECT' | 'ALL_ORIGINS' | 'CORS_PROXY' | 'GEMINI_AI' | 'FALLBACK';
  timestamp: string;
  gseIndex?: string;
  lastTradeTime?: string;
  prices: Record<string, GSEStockPrice>;
  error?: string;
}

/**
 * Parses raw HTML string from afx.kwayisi.org/gse/ into structured GSE stock quotes
 */
export function parseAFXHtml(html: string): {
  prices: Record<string, GSEStockPrice>;
  gseIndex?: string;
  lastTradeTime?: string;
} {
  const prices: Record<string, GSEStockPrice> = {};
  let gseIndex: string | undefined = undefined;
  let lastTradeTime: string | undefined = undefined;

  try {
    // 1. Extract GSE Index (e.g., 15,225.56 (+38.09))
    const indexMatch = html.match(/GSE-CI Index<\/th>.*?<td>([0-9,.]+\s*\([^)]+\))/i) || html.match(/GSE-CI<\/abbr>\s*<span[^>]*>([^<]+)/i);
    if (indexMatch) {
      gseIndex = indexMatch[1].trim();
    }

    // 2. Extract Last Trade Time (e.g. Aug 10, 2026 at 17:11)
    const timeMatch = html.match(/<time[^>]*id=u[^>]*>([^<]+(?:<span[^>]*>[^<]*<\/span>[^<]*)*)<\/time>/i) || html.match(/datetime="([^"]+)"/i);
    if (timeMatch) {
      lastTradeTime = timeMatch[1].replace(/<[^>]+>/g, '').trim();
    }

    // 3. Extract Stock Table Rows
    // Each row: <tr><td><a href=.../gse/ticker.html...>TICKER</a><td>...<td>Volume<td>Price<td>Change
    const rowRegex = /<tr[^>]*>\s*<td><a[^>]*href=["']?[^"'>]*\/gse\/([a-zA-Z0-9]+)\.html["']?[^>]*>([A-Za-z0-9_-]+)<\/a>\s*<\/td>\s*<td><a[^>]*>([^<]+)<\/a>\s*<\/td>\s*<td>([^<]*)<\/td>\s*<td>([0-9.,]+)<\/td>(?:\s*<td[^>]*>([^<]*)<\/td>)?/gi;

    let match;
    while ((match = rowRegex.exec(html)) !== null) {
      const slug = match[1].toUpperCase();
      const rawTicker = match[2].trim().toUpperCase();
      const name = match[3].trim();
      const rawVol = match[4].replace(/,/g, '').trim();
      const rawPrice = match[5].replace(/,/g, '').trim();
      const change = match[6] ? match[6].trim() : '';

      const price = parseFloat(rawPrice);
      const volume = rawVol ? parseInt(rawVol, 10) : 0;

      if (!isNaN(price) && price > 0) {
        prices[rawTicker] = {
          ticker: rawTicker,
          name,
          price,
          volume: isNaN(volume) ? 0 : volume,
          change,
          lastUpdated: lastTradeTime
        };
        // Also map slug as fallback
        if (slug && !prices[slug]) {
          prices[slug] = prices[rawTicker];
        }
      }
    }

    // Fallback simple regex if table structure differs slightly
    if (Object.keys(prices).length === 0) {
      const simpleRegex = /([A-Z0-9]{2,10})\.html[^>]*>([A-Z0-9]{2,10})<\/a>.*?<td>([0-9,.]+)<\/td>/gi;
      let sm;
      while ((sm = simpleRegex.exec(html)) !== null) {
        const ticker = sm[2].toUpperCase();
        const price = parseFloat(sm[3].replace(/,/g, ''));
        if (!isNaN(price) && price > 0 && !prices[ticker]) {
          prices[ticker] = { ticker, name: ticker, price };
        }
      }
    }
  } catch (err) {
    console.error('Error parsing AFX HTML:', err);
  }

  return { prices, gseIndex, lastTradeTime };
}

/**
 * Primary Real-Time Fetcher: Queries multiple proxy layers to bypass CORS and get direct live AFX data
 */
export async function syncRealtimeAFXPrices(requestedTickers?: string[]): Promise<AFXSyncResult> {
  const targetUrl = 'https://afx.kwayisi.org/gse/';

  // Source 1: Express / Vite local proxy endpoint
  try {
    const res = await fetch('/api/afx-gse', { headers: { 'Accept': 'text/html,application/xhtml+xml' } });
    if (res.ok) {
      const html = await res.text();
      const parsed = parseAFXHtml(html);
      if (Object.keys(parsed.prices).length > 0) {
        return {
          success: true,
          source: 'PROXY_DIRECT',
          timestamp: new Date().toISOString(),
          gseIndex: parsed.gseIndex,
          lastTradeTime: parsed.lastTradeTime,
          prices: filterTickers(parsed.prices, requestedTickers)
        };
      }
    }
  } catch (e) {
    // Ignore and try next source
  }

  // Source 2: AllOrigins CORS proxy
  try {
    const allOriginsUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
    const res = await fetch(allOriginsUrl);
    if (res.ok) {
      const html = await res.text();
      const parsed = parseAFXHtml(html);
      if (Object.keys(parsed.prices).length > 0) {
        return {
          success: true,
          source: 'ALL_ORIGINS',
          timestamp: new Date().toISOString(),
          gseIndex: parsed.gseIndex,
          lastTradeTime: parsed.lastTradeTime,
          prices: filterTickers(parsed.prices, requestedTickers)
        };
      }
    }
  } catch (e) {
    // Ignore and try next source
  }

  // Source 3: CorsProxy.io fallback
  try {
    const corsProxyUrl = `https://corsproxy.io/?${encodeURIComponent(targetUrl)}`;
    const res = await fetch(corsProxyUrl);
    if (res.ok) {
      const html = await res.text();
      const parsed = parseAFXHtml(html);
      if (Object.keys(parsed.prices).length > 0) {
        return {
          success: true,
          source: 'CORS_PROXY',
          timestamp: new Date().toISOString(),
          gseIndex: parsed.gseIndex,
          lastTradeTime: parsed.lastTradeTime,
          prices: filterTickers(parsed.prices, requestedTickers)
        };
      }
    }
  } catch (e) {
    // Ignore and try next source
  }

  // Source 4: Gemini AI fallback with Web Context
  if (requestedTickers && requestedTickers.length > 0) {
    try {
      const geminiPrices = await fetchViaGemini(requestedTickers);
      if (geminiPrices && Object.keys(geminiPrices).length > 0) {
        const pricesMap: Record<string, GSEStockPrice> = {};
        Object.entries(geminiPrices).forEach(([tk, val]) => {
          if (typeof val === 'number' && val > 0) {
            pricesMap[tk.toUpperCase()] = {
              ticker: tk.toUpperCase(),
              name: tk.toUpperCase(),
              price: val
            };
          }
        });
        return {
          success: true,
          source: 'GEMINI_AI',
          timestamp: new Date().toISOString(),
          prices: pricesMap
        };
      }
    } catch (e) {
      console.warn('Gemini AI price fetch failed:', e);
    }
  }

  return {
    success: false,
    source: 'FALLBACK',
    timestamp: new Date().toISOString(),
    prices: {},
    error: 'Could not fetch live AFX prices from any endpoint.'
  };
}

function filterTickers(
  allPrices: Record<string, GSEStockPrice>,
  requestedTickers?: string[]
): Record<string, GSEStockPrice> {
  if (!requestedTickers || requestedTickers.length === 0) {
    return allPrices;
  }

  const result: Record<string, GSEStockPrice> = {};
  const upperReq = requestedTickers.map(t => t.toUpperCase().replace(/[_\s-]/g, ''));

  Object.entries(allPrices).forEach(([key, stock]) => {
    const normKey = key.toUpperCase().replace(/[_\s-]/g, '');
    if (upperReq.some(req => req === normKey || normKey.includes(req) || req.includes(normKey))) {
      result[key] = stock;
    }
  });

  return result;
}
