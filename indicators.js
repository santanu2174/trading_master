// indicators.js - Professional Technical & Algorithmic Trading Indicators

/**
 * Simple Moving Average (SMA)
 */
function calculateSMA(values, period) {
  const result = [];
  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += values[i - j];
      result.push(sum / period);
    }
  }
  return result;
}

/**
 * Exponential Moving Average (EMA)
 */
function calculateEMA(values, period) {
  const result = [];
  const k = 2 / (period + 1);
  let prevEma = null;

  for (let i = 0; i < values.length; i++) {
    if (i < period - 1) {
      result.push(null);
    } else if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += values[j];
      prevEma = sum / period;
      result.push(prevEma);
    } else {
      const currentEma = (values[i] * k) + (prevEma * (1 - k));
      result.push(currentEma);
      prevEma = currentEma;
    }
  }
  return result;
}

/**
 * Relative Strength Index (RSI - Wilder's Smoothed)
 */
function calculateRSI(closes, period = 14) {
  const result = [];
  if (closes.length < period + 1) return closes.map(() => 50);

  let gains = 0;
  let losses = 0;

  for (let i = 1; i <= period; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff >= 0) gains += diff;
    else losses += Math.abs(diff);
  }

  let avgGain = gains / period;
  let avgLoss = losses / period;

  for (let i = 0; i < closes.length; i++) {
    if (i < period) {
      result.push(null);
    } else if (i === period) {
      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      const rsi = 100 - (100 / (1 + rs));
      result.push(rsi);
    } else {
      const diff = closes[i] - closes[i - 1];
      const gain = diff > 0 ? diff : 0;
      const loss = diff < 0 ? Math.abs(diff) : 0;

      avgGain = ((avgGain * (period - 1)) + gain) / period;
      avgLoss = ((avgLoss * (period - 1)) + loss) / period;

      const rs = avgLoss === 0 ? 100 : avgGain / avgLoss;
      const rsi = 100 - (100 / (1 + rs));
      result.push(rsi);
    }
  }
  return result;
}

/**
 * Moving Average Convergence Divergence (MACD)
 */
function calculateMACD(closes, fastPeriod = 12, slowPeriod = 26, signalPeriod = 9) {
  const fastEMA = calculateEMA(closes, fastPeriod);
  const slowEMA = calculateEMA(closes, slowPeriod);
  const macdLine = [];

  for (let i = 0; i < closes.length; i++) {
    if (fastEMA[i] === null || slowEMA[i] === null) {
      macdLine.push(null);
    } else {
      macdLine.push(fastEMA[i] - slowEMA[i]);
    }
  }

  const validMacdValues = macdLine.filter(v => v !== null);
  const validSignalValues = calculateEMA(validMacdValues, signalPeriod);

  const signalLine = [];
  const histogram = [];
  let sigIdx = 0;

  for (let i = 0; i < macdLine.length; i++) {
    if (macdLine[i] === null || sigIdx >= validSignalValues.length || validSignalValues[sigIdx] === null) {
      signalLine.push(null);
      histogram.push(null);
      if (macdLine[i] !== null) sigIdx++;
    } else {
      const sig = validSignalValues[sigIdx];
      const hist = macdLine[i] - sig;
      signalLine.push(sig);
      histogram.push(hist);
      sigIdx++;
    }
  }

  return { macdLine, signalLine, histogram };
}

/**
 * Bollinger Bands (BB)
 */
function calculateBollingerBands(closes, period = 20, multiplier = 2) {
  const sma = calculateSMA(closes, period);
  const upper = [];
  const lower = [];
  const bandwidth = [];

  for (let i = 0; i < closes.length; i++) {
    if (sma[i] === null) {
      upper.push(null);
      lower.push(null);
      bandwidth.push(null);
    } else {
      let sumSqDiff = 0;
      for (let j = 0; j < period; j++) {
        const diff = closes[i - j] - sma[i];
        sumSqDiff += diff * diff;
      }
      const stdDev = Math.sqrt(sumSqDiff / period);
      const up = sma[i] + (multiplier * stdDev);
      const low = sma[i] - (multiplier * stdDev);
      upper.push(up);
      lower.push(low);
      bandwidth.push(((up - low) / sma[i]) * 100);
    }
  }

  return { middle: sma, upper, lower, bandwidth };
}

/**
 * Average True Range (ATR)
 */
function calculateATR(candles, period = 14) {
  const tr = [];
  for (let i = 0; i < candles.length; i++) {
    if (i === 0) {
      tr.push(candles[i].high - candles[i].low);
    } else {
      const h_l = candles[i].high - candles[i].low;
      const h_cp = Math.abs(candles[i].high - candles[i - 1].close);
      const l_cp = Math.abs(candles[i].low - candles[i - 1].close);
      tr.push(Math.max(h_l, h_cp, l_cp));
    }
  }

  const atr = [];
  let prevAtr = null;

  for (let i = 0; i < tr.length; i++) {
    if (i < period - 1) {
      atr.push(null);
    } else if (i === period - 1) {
      let sum = 0;
      for (let j = 0; j < period; j++) sum += tr[j];
      prevAtr = sum / period;
      atr.push(prevAtr);
    } else {
      const currentAtr = ((prevAtr * (period - 1)) + tr[i]) / period;
      atr.push(currentAtr);
      prevAtr = currentAtr;
    }
  }
  return atr;
}

/**
 * SuperTrend (10, 3)
 */
function calculateSupertrend(candles, period = 10, multiplier = 3) {
  const atr = calculateATR(candles, period);
  const trend = [];
  const supertrend = [];

  let prevUpper = 0;
  let prevLower = 0;
  let prevTrend = 1;

  for (let i = 0; i < candles.length; i++) {
    if (atr[i] === null) {
      trend.push(1);
      supertrend.push(candles[i].close);
      continue;
    }

    const hl2 = (candles[i].high + candles[i].low) / 2;
    let basicUpper = hl2 + (multiplier * atr[i]);
    let basicLower = hl2 - (multiplier * atr[i]);

    let finalUpper = (basicUpper < prevUpper || (i > 0 && candles[i - 1].close > prevUpper)) ? basicUpper : prevUpper;
    let finalLower = (basicLower > prevLower || (i > 0 && candles[i - 1].close < prevLower)) ? basicLower : prevLower;

    let currentTrend = prevTrend;
    if (prevTrend === 1 && candles[i].close < finalLower) {
      currentTrend = -1;
    } else if (prevTrend === -1 && candles[i].close > finalUpper) {
      currentTrend = 1;
    }

    trend.push(currentTrend);
    supertrend.push(currentTrend === 1 ? finalLower : finalUpper);

    prevUpper = finalUpper;
    prevLower = finalLower;
    prevTrend = currentTrend;
  }

  return { trend, supertrend };
}

/**
 * Detect Regular & Hidden Divergences (RSI vs Price)
 */
function detectDivergences(candles, rsiValues, lookback = 30) {
  if (candles.length < lookback || rsiValues.length < lookback) {
    return { type: 'NONE', description: 'Not enough data' };
  }

  const startIdx = candles.length - lookback;
  const recentCandles = candles.slice(startIdx);
  const recentRSI = rsiValues.slice(startIdx);

  const swingLows = [];
  const swingHighs = [];

  for (let i = 2; i < recentCandles.length - 2; i++) {
    if (recentCandles[i].low <= recentCandles[i - 1].low &&
        recentCandles[i].low <= recentCandles[i - 2].low &&
        recentCandles[i].low <= recentCandles[i + 1].low &&
        recentCandles[i].low <= recentCandles[i + 2].low &&
        recentRSI[i] !== null) {
      swingLows.push({ index: i, price: recentCandles[i].low, rsi: recentRSI[i] });
    }
    if (recentCandles[i].high >= recentCandles[i - 1].high &&
        recentCandles[i].high >= recentCandles[i - 2].high &&
        recentCandles[i].high >= recentCandles[i + 1].high &&
        recentCandles[i].high >= recentCandles[i + 2].high &&
        recentRSI[i] !== null) {
      swingHighs.push({ index: i, price: recentCandles[i].high, rsi: recentRSI[i] });
    }
  }

  if (swingLows.length >= 2) {
    const prevLow = swingLows[swingLows.length - 2];
    const currLow = swingLows[swingLows.length - 1];

    if (currLow.price < prevLow.price && currLow.rsi > prevLow.rsi + 1.5) {
      return {
        type: 'REGULAR_BULLISH_DIVERGENCE',
        score: 25,
        description: `Bullish Divergence: Price Lower Low ($${currLow.price}) while RSI Higher Low (${currLow.rsi.toFixed(1)} vs ${prevLow.rsi.toFixed(1)})`
      };
    }
    if (currLow.price > prevLow.price && currLow.rsi < prevLow.rsi - 2.0) {
      return {
        type: 'HIDDEN_BULLISH_DIVERGENCE',
        score: 18,
        description: `Hidden Bullish Divergence: Price Higher Low ($${currLow.price}) with RSI reset (${currLow.rsi.toFixed(1)})`
      };
    }
  }

  if (swingHighs.length >= 2) {
    const prevHigh = swingHighs[swingHighs.length - 2];
    const currHigh = swingHighs[swingHighs.length - 1];

    if (currHigh.price > prevHigh.price && currHigh.rsi < prevHigh.rsi - 1.5) {
      return {
        type: 'REGULAR_BEARISH_DIVERGENCE',
        score: -25,
        description: `Bearish Divergence: Price Higher High ($${currHigh.price}) while RSI Lower High (${currHigh.rsi.toFixed(1)} vs ${prevHigh.rsi.toFixed(1)})`
      };
    }
    if (currHigh.price < prevHigh.price && currHigh.rsi > prevHigh.rsi + 2.0) {
      return {
        type: 'HIDDEN_BEARISH_DIVERGENCE',
        score: -18,
        description: `Hidden Bearish Divergence: Price Lower High ($${currHigh.price}) with RSI overextension`
      };
    }
  }

  return { type: 'NONE', score: 0, description: 'No active RSI divergence' };
}

/**
 * Detect VALID Institutional Support and Resistance Zones (Demand & Supply Zones)
 * Identifies validated clusters with multi-touch rejections, order blocks, and price ranges.
 */
function detectValidZones(candles, currentPrice) {
  if (!candles || candles.length < 20) {
    return { supportZones: [], resistanceZones: [], status: 'INSUFFICIENT_DATA' };
  }

  // 1. Detect Pivot Highs and Pivot Lows across the candle history
  const pivots = [];
  for (let i = 2; i < candles.length - 2; i++) {
    const c = candles[i];
    const isHigh = c.high >= candles[i - 1].high && c.high >= candles[i - 2].high &&
                   c.high >= candles[i + 1].high && c.high >= candles[i + 2].high;
    const isLow = c.low <= candles[i - 1].low && c.low <= candles[i - 2].low &&
                  c.low <= candles[i + 1].low && c.low <= candles[i + 2].low;

    if (isHigh) {
      pivots.push({ type: 'HIGH', price: c.high, time: c.time, volume: c.volume, index: i });
    }
    if (isLow) {
      pivots.push({ type: 'LOW', price: c.low, time: c.time, volume: c.volume, index: i });
    }
  }

  // Clustering tolerance: ~0.09% of price ($65 on BTC, $2.0 on ETH)
  const tolerance = currentPrice * 0.0009;

  function clusterPivots(pivotList, isSupport) {
    const sorted = pivotList.slice().sort((a, b) => a.price - b.price);
    const clusters = [];

    for (const p of sorted) {
      let found = false;
      for (const cl of clusters) {
        if (Math.abs(p.price - cl.meanPrice) <= tolerance) {
          cl.pivots.push(p);
          cl.meanPrice = cl.pivots.reduce((sum, item) => sum + item.price, 0) / cl.pivots.length;
          found = true;
          break;
        }
      }
      if (!found) {
        clusters.push({ meanPrice: p.price, pivots: [p] });
      }
    }

    return clusters.map(cl => {
      const prices = cl.pivots.map(p => p.price);
      const touches = cl.pivots.length;
      const minP = Math.min(...prices);
      const maxP = Math.max(...prices);

      // Add a small buffer to form a realistic tradeable zone
      const pad = Math.max(tolerance * 0.15, (maxP - minP) / 2);
      const top = parseFloat((maxP + pad).toFixed(1));
      const bottom = parseFloat((minP - pad).toFixed(1));
      const mid = parseFloat(((top + bottom) / 2).toFixed(1));

      const strength = touches >= 3 ? 'STRONG' : touches === 2 ? 'MODERATE' : 'MINOR';
      const distancePct = parseFloat((((mid - currentPrice) / currentPrice) * 100).toFixed(2));
      const distanceDollar = Math.abs(mid - currentPrice).toFixed(1);

      return {
        type: isSupport ? 'SUPPORT' : 'RESISTANCE',
        top,
        bottom,
        mid,
        touches,
        strength,
        distancePct,
        distanceDollar,
        role: isSupport ? 'Institutional Demand / Buyer Defense' : 'Institutional Supply / Seller Wall',
        label: isSupport
          ? `Demand Zone: $${bottom} - $${top} (${touches}x Rejections)`
          : `Supply Zone: $${bottom} - $${top} (${touches}x Rejections)`
      };
    });
  }

  const highPivots = pivots.filter(p => p.type === 'HIGH');
  const lowPivots = pivots.filter(p => p.type === 'LOW');

  // Filter valid resistances (above or containing current price)
  const resistanceZones = clusterPivots(highPivots, false)
    .filter(z => z.bottom >= currentPrice || (z.bottom <= currentPrice && z.top >= currentPrice))
    .sort((a, b) => a.mid - b.mid)
    .slice(0, 3);

  // Filter valid supports (below or containing current price)
  const supportZones = clusterPivots(lowPivots, true)
    .filter(z => z.top <= currentPrice || (z.bottom <= currentPrice && z.top >= currentPrice))
    .sort((a, b) => b.mid - a.mid)
    .slice(0, 3);

  // Determine current price status relative to zones
  let priceStatus = 'CONSOLIDATING_BETWEEN_ZONES';
  const insideSup = supportZones.find(z => currentPrice >= z.bottom && currentPrice <= z.top);
  const insideRes = resistanceZones.find(z => currentPrice >= z.bottom && currentPrice <= z.top);

  if (insideSup) {
    priceStatus = `TESTING_VALID_SUPPORT (${insideSup.touches}x Touches)`;
  } else if (insideRes) {
    priceStatus = `TESTING_VALID_RESISTANCE (${insideRes.touches}x Rejections)`;
  }

  return {
    supportZones,
    resistanceZones,
    nearestSupport: supportZones[0] || null,
    nearestResistance: resistanceZones[0] || null,
    priceStatus
  };
}

/**
 * Detect Smart Money Concepts (Order Blocks & Fair Value Gaps)
 */
function detectSmartMoneyStructures(candles, currentPrice) {
  const result = {
    orderBlocks: [],
    fairValueGaps: [],
    validZones: detectValidZones(candles, currentPrice),
    keySupports: [],
    keyResistances: []
  };

  // Populate keySupports & keyResistances from validZones for backward compatibility
  result.keySupports = result.validZones.supportZones.map(z => z.mid);
  result.keyResistances = result.validZones.resistanceZones.map(z => z.mid);

  if (candles.length < 20) return result;

  // Fair Value Gaps (FVG)
  for (let i = candles.length - 20; i < candles.length - 1; i++) {
    if (i < 2) continue;
    if (candles[i].low > candles[i - 2].high) {
      result.fairValueGaps.push({
        type: 'BULLISH_FVG',
        bottom: candles[i - 2].high,
        top: candles[i].low,
        index: i - 1
      });
    }
    if (candles[i].high < candles[i - 2].low) {
      result.fairValueGaps.push({
        type: 'BEARISH_FVG',
        top: candles[i - 2].low,
        bottom: candles[i].high,
        index: i - 1
      });
    }
  }

  // Order Blocks (OB)
  for (let i = candles.length - 18; i < candles.length - 2; i++) {
    if (i < 1) continue;
    const isDownCandle = candles[i].close < candles[i].open;
    const nextCandleBigUp = candles[i + 1].close > candles[i + 1].open &&
      (candles[i + 1].close - candles[i + 1].open) > (candles[i].high - candles[i].low) * 1.4;

    if (isDownCandle && nextCandleBigUp) {
      result.orderBlocks.push({
        type: 'BULLISH_ORDER_BLOCK',
        top: candles[i].high,
        bottom: candles[i].low,
        index: i
      });
    }

    const isUpCandle = candles[i].close > candles[i].open;
    const nextCandleBigDown = candles[i + 1].close < candles[i + 1].open &&
      (candles[i + 1].open - candles[i + 1].close) > (candles[i].high - candles[i].low) * 1.4;

    if (isUpCandle && nextCandleBigDown) {
      result.orderBlocks.push({
        type: 'BEARISH_ORDER_BLOCK',
        top: candles[i].high,
        bottom: candles[i].low,
        index: i
      });
    }
  }

  return result;
}

module.exports = {
  calculateSMA,
  calculateEMA,
  calculateRSI,
  calculateMACD,
  calculateBollingerBands,
  calculateATR,
  calculateSupertrend,
  detectDivergences,
  detectValidZones,
  detectSmartMoneyStructures
};
