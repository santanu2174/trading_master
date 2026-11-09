// deltaApi.js - Delta Exchange Real-Time Market Data Client
// Optimized for Delta Exchange India (api.india.delta.exchange) with Global fallback

const https = require('https');

// Primary endpoint is India Delta Exchange where BTCUSD & ETHUSD perps actively trade
const DELTA_INDIA_URL = 'https://api.india.delta.exchange';
const DELTA_GLOBAL_URL = 'https://api.delta.exchange';

// Symbol normalization map (translates BTCUSDT -> BTCUSD for Delta Exchange India)
function normalizeSymbol(symbol) {
  if (!symbol) return 'BTCUSD';
  const clean = symbol.trim().toUpperCase();
  if (clean === 'BTCUSDT' || clean === 'BTC') return 'BTCUSD';
  if (clean === 'ETHUSDT' || clean === 'ETH') return 'ETHUSD';
  if (clean === 'SOLUSDT' || clean === 'SOL') return 'SOLUSD';
  if (clean === 'XRPUSDT' || clean === 'XRP') return 'XRPUSD';
  return clean;
}

function fetchJson(url) {
  return new Promise((resolve, reject) => {
    const options = {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) DeltaTradePro/2.4',
        'Accept': 'application/json'
      },
      timeout: 10000
    };

    const req = https.get(url, options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const json = JSON.parse(data);
          resolve(json);
        } catch (err) {
          reject(new Error(`JSON parse error from ${url}: ${err.message}`));
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      reject(new Error(`Timeout fetching ${url}`));
    });

    req.on('error', (err) => {
      reject(err);
    });
  });
}

/**
 * Fetch candles with primary India endpoint, falling back to global if needed
 */
async function getCandles(rawSymbol, resolution = '15m', count = 120) {
  const symbol = normalizeSymbol(rawSymbol);
  const now = Math.floor(Date.now() / 1000);

  const resSecMap = {
    '1m': 60,
    '3m': 180,
    '5m': 300,
    '15m': 900,
    '30m': 1800,
    '1h': 3600,
    '2h': 7200,
    '4h': 14400,
    '1d': 86400
  };
  const step = resSecMap[resolution] || 900;
  const start = now - (step * count);

  // Try India first
  const hosts = [DELTA_INDIA_URL, DELTA_GLOBAL_URL];

  for (const host of hosts) {
    try {
      const url = `${host}/v2/history/candles?resolution=${resolution}&symbol=${symbol}&start=${start}&end=${now}`;
      const data = await fetchJson(url);

      if (data && data.success && Array.isArray(data.result) && data.result.length > 0) {
        // Delta Exchange returns candles in reverse chronological order (newest first).
        // Sort strictly ascending by time (oldest -> newest) for charting and technical analysis
        const candles = data.result
          .map(c => ({
            time: c.time * 1000,
            open: parseFloat(c.open),
            high: parseFloat(c.high),
            low: parseFloat(c.low),
            close: parseFloat(c.close),
            volume: parseFloat(c.volume || 0)
          }))
          .sort((a, b) => a.time - b.time);

        return candles;
      }
    } catch (err) {
      console.warn(`Candles fetch attempt failed on ${host}: ${err.message}`);
    }
  }

  return [];
}

/**
 * Fetch 24h Ticker data
 */
async function getTicker(rawSymbol) {
  const symbol = normalizeSymbol(rawSymbol);
  const hosts = [DELTA_INDIA_URL, DELTA_GLOBAL_URL];

  for (const host of hosts) {
    try {
      const url = `${host}/v2/tickers/${symbol}`;
      const data = await fetchJson(url);
      if (data && data.success && data.result) {
        const res = data.result;
        return {
          symbol: res.symbol,
          markPrice: parseFloat(res.mark_price || res.close || 0),
          spotPrice: parseFloat(res.spot_price || res.mark_price || 0),
          close: parseFloat(res.close || 0),
          open: parseFloat(res.open || 0),
          high24h: parseFloat(res.high || res.high_24h || 0),
          low24h: parseFloat(res.low || res.low_24h || 0),
          volume24h: parseFloat(res.volume || res.volume_24h || 0),
          turnover24h: parseFloat(res.turnover || res.turnover_24h || 0),
          openInterest: parseFloat(res.oi || res.open_interest || 0),
          fundingRate: parseFloat(res.funding_rate || 0),
          timestamp: Date.now()
        };
      }
    } catch (err) {
      console.warn(`Ticker fetch attempt failed on ${host}: ${err.message}`);
    }
  }

  return null;
}

/**
 * Fetch L2 Orderbook Depth
 */
async function getOrderbook(rawSymbol) {
  const symbol = normalizeSymbol(rawSymbol);
  const hosts = [DELTA_INDIA_URL, DELTA_GLOBAL_URL];

  for (const host of hosts) {
    try {
      const url = `${host}/v2/l2orderbook/${symbol}`;
      const data = await fetchJson(url);
      if (data && data.success && data.result) {
        const buy = data.result.buy || [];
        const sell = data.result.sell || [];

        let totalBidVolume = 0;
        let totalAskVolume = 0;

        for (let i = 0; i < Math.min(15, buy.length); i++) {
          totalBidVolume += parseFloat(buy[i].size || 0);
        }
        for (let i = 0; i < Math.min(15, sell.length); i++) {
          totalAskVolume += parseFloat(sell[i].size || 0);
        }

        const totalVolume = totalBidVolume + totalAskVolume;
        const bidRatio = totalVolume > 0 ? (totalBidVolume / totalVolume) * 100 : 50;
        const askRatio = totalVolume > 0 ? (totalAskVolume / totalVolume) * 100 : 50;

        return {
          bestBid: buy.length > 0 ? parseFloat(buy[0].price) : null,
          bestAsk: sell.length > 0 ? parseFloat(sell[0].price) : null,
          totalBidVolume,
          totalAskVolume,
          bidRatio: Math.round(bidRatio),
          askRatio: Math.round(askRatio),
          bids: buy.slice(0, 10).map(b => ({ price: parseFloat(b.price), size: parseFloat(b.size) })),
          asks: sell.slice(0, 10).map(a => ({ price: parseFloat(a.price), size: parseFloat(a.size) }))
        };
      }
    } catch (err) {
      console.warn(`Orderbook fetch attempt failed on ${host}: ${err.message}`);
    }
  }

  return null;
}

module.exports = {
  getCandles,
  getTicker,
  getOrderbook,
  normalizeSymbol
};
