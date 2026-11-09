// confluenceEngine.js - Multi-Strategy Confluence & Trade Generation Engine

const deltaApi = require('./deltaApi');
const indicators = require('./indicators');

/**
 * Analyzes market data across multiple strategies and generates an actionable trade setup.
 * @param {string} symbol - 'BTCUSDT' or 'ETHUSDT'
 * @param {string} executionTf - '5m' or '15m'
 */
async function analyzeTrade(symbol = 'BTCUSD', executionTf = '15m') {
  // 1. Fetch data concurrently: LTF candles, HTF (1h) candles, Ticker, and Orderbook
  const [ltfCandles, htfCandles, ticker, orderbook] = await Promise.all([
    deltaApi.getCandles(symbol, executionTf, 130),
    deltaApi.getCandles(symbol, '1h', 100),
    deltaApi.getTicker(symbol),
    deltaApi.getOrderbook(symbol)
  ]);

  if (!ltfCandles || ltfCandles.length < 50) {
    throw new Error(`Insufficient candle data received from Delta Exchange for ${symbol}`);
  }

  const currentPrice = ticker ? ticker.markPrice : ltfCandles[ltfCandles.length - 1].close;
  const closes = ltfCandles.map(c => c.close);
  const volumes = ltfCandles.map(c => c.volume);
  const lastIdx = ltfCandles.length - 1;

  // 2. Compute Intraday Indicators
  const ema9 = indicators.calculateEMA(closes, 9);
  const ema21 = indicators.calculateEMA(closes, 21);
  const ema50 = indicators.calculateEMA(closes, 50);
  const ema200 = indicators.calculateEMA(closes, 200);

  const rsi = indicators.calculateRSI(closes, 14);
  const macd = indicators.calculateMACD(closes, 12, 26, 9);
  const bb = indicators.calculateBollingerBands(closes, 20, 2);
  const atr = indicators.calculateATR(ltfCandles, 14);
  const supertrend = indicators.calculateSupertrend(ltfCandles, 10, 3);
  const volumeMa20 = indicators.calculateSMA(volumes, 20);

  // Divergence & Smart Money Concepts & Valid Zones
  const divergence = indicators.detectDivergences(ltfCandles, rsi, 35);
  const smc = indicators.detectSmartMoneyStructures(ltfCandles, currentPrice);
  const validZones = smc.validZones;

  // Current values
  const currEma9 = ema9[lastIdx];
  const currEma21 = ema21[lastIdx];
  const currEma50 = ema50[lastIdx];
  const currEma200 = ema200[lastIdx];
  const currRsi = rsi[lastIdx];
  const currMacdHist = macd.histogram[lastIdx];
  const prevMacdHist = macd.histogram[lastIdx - 1];
  const currSupertrend = supertrend.trend[lastIdx];
  const currAtr = atr[lastIdx] || (currentPrice * 0.005);
  const currVol = volumes[lastIdx];
  const avgVol = volumeMa20[lastIdx] || currVol;

  // 3. Compute Higher Timeframe (1h) Trend Filter
  let htfBias = 'NEUTRAL';
  let htfScore = 0;
  if (htfCandles && htfCandles.length >= 30) {
    const htfCloses = htfCandles.map(c => c.close);
    const htfEma50 = indicators.calculateEMA(htfCloses, 50);
    const htfEma200 = indicators.calculateEMA(htfCloses, Math.min(100, htfCloses.length));
    const htfSuper = indicators.calculateSupertrend(htfCandles, 10, 3);

    const lastHtfIdx = htfCandles.length - 1;
    const htfClose = htfCloses[lastHtfIdx];
    const htfEma = htfEma50[lastHtfIdx] || htfClose;
    const htfTrend = htfSuper.trend[lastHtfIdx];

    if (htfClose > htfEma && htfTrend === 1) {
      htfBias = 'BULLISH';
      htfScore = 20;
    } else if (htfClose < htfEma && htfTrend === -1) {
      htfBias = 'BEARISH';
      htfScore = -20;
    } else {
      htfBias = 'CHOPPY / CONSOLIDATION';
      htfScore = 0;
    }
  }

  // 4. Confluence Scoring Engine
  let rawScore = 0; // -100 to +100
  const factors = [];

  // Factor A: HTF Trend Alignment (Max +/- 20)
  rawScore += htfScore;
  factors.push({
    name: '1H Macro Trend Filter',
    status: htfBias === 'BULLISH' ? 'BULLISH' : htfBias === 'BEARISH' ? 'BEARISH' : 'NEUTRAL',
    points: htfScore,
    detail: `1H Trend is ${htfBias} (Higher timeframe macro direction)`
  });

  // Factor B: Intraday EMA Alignment (Max +/- 20)
  let emaScore = 0;
  let emaDetail = '';
  if (currEma9 && currEma21) {
    if (currentPrice > currEma9 && currEma9 > currEma21) {
      if (currEma50 && currEma21 > currEma50) {
        emaScore = 20;
        emaDetail = 'Perfect Bullish EMA Stack (Price > 9 > 21 > 50)';
      } else {
        emaScore = 12;
        emaDetail = 'Bullish Short-term Alignment (Price > 9 EMA > 21 EMA)';
      }
    } else if (currentPrice < currEma9 && currEma9 < currEma21) {
      if (currEma50 && currEma21 < currEma50) {
        emaScore = -20;
        emaDetail = 'Perfect Bearish EMA Stack (Price < 9 < 21 < 50)';
      } else {
        emaScore = -12;
        emaDetail = 'Bearish Short-term Alignment (Price < 9 EMA < 21 EMA)';
      }
    } else {
      emaScore = 0;
      emaDetail = 'EMA Compression / Choppy crossover';
    }
  }
  rawScore += emaScore;
  factors.push({
    name: 'Intraday EMA Alignment',
    status: emaScore > 0 ? 'BULLISH' : emaScore < 0 ? 'BEARISH' : 'NEUTRAL',
    points: emaScore,
    detail: emaDetail
  });

  // Factor C: SuperTrend & Price Action (Max +/- 15)
  let stScore = 0;
  if (currSupertrend === 1) {
    stScore = 15;
    factors.push({
      name: 'SuperTrend (10, 3)',
      status: 'BULLISH',
      points: 15,
      detail: `SuperTrend is GREEN (Support at $${supertrend.supertrend[lastIdx].toFixed(1)})`
    });
  } else {
    stScore = -15;
    factors.push({
      name: 'SuperTrend (10, 3)',
      status: 'BEARISH',
      points: -15,
      detail: `SuperTrend is RED (Resistance at $${supertrend.supertrend[lastIdx].toFixed(1)})`
    });
  }
  rawScore += stScore;

  // Factor D: RSI & Divergence (Max +/- 25)
  let rsiScore = 0;
  let rsiDetail = `RSI(14) at ${currRsi ? currRsi.toFixed(1) : 'N/A'}`;
  let rsiStatus = 'NEUTRAL';

  if (divergence.type.includes('BULLISH')) {
    rsiScore += divergence.score;
    rsiDetail += ` | ${divergence.description}`;
    rsiStatus = 'BULLISH';
  } else if (divergence.type.includes('BEARISH')) {
    rsiScore += divergence.score;
    rsiDetail += ` | ${divergence.description}`;
    rsiStatus = 'BEARISH';
  } else {
    // Normal momentum zones
    if (currRsi > 52 && currRsi < 68) {
      rsiScore += 10;
      rsiStatus = 'BULLISH';
      rsiDetail += ' (Healthy Bullish Momentum Zone)';
    } else if (currRsi < 48 && currRsi > 32) {
      rsiScore -= 10;
      rsiStatus = 'BEARISH';
      rsiDetail += ' (Bearish Momentum Expansion)';
    } else if (currRsi <= 30) {
      rsiScore += 8;
      rsiStatus = 'BULLISH';
      rsiDetail += ' (Oversold - Potential Bounce Zone)';
    } else if (currRsi >= 70) {
      rsiScore -= 8;
      rsiStatus = 'BEARISH';
      rsiDetail += ' (Overbought - Potential Exhaustion)';
    }
  }
  rawScore += rsiScore;
  factors.push({
    name: 'RSI & Divergence Analysis',
    status: rsiStatus,
    points: rsiScore,
    detail: rsiDetail
  });

  // Factor E: MACD Histogram Momentum (Max +/- 10)
  let macdScore = 0;
  let macdStatus = 'NEUTRAL';
  let macdDetail = '';
  if (currMacdHist !== null && prevMacdHist !== null) {
    if (currMacdHist > 0 && currMacdHist > prevMacdHist) {
      macdScore = 10;
      macdStatus = 'BULLISH';
      macdDetail = 'MACD Histogram positive and expanding upward (Buyers accelerating)';
    } else if (currMacdHist > 0 && currMacdHist <= prevMacdHist) {
      macdScore = 4;
      macdStatus = 'BULLISH';
      macdDetail = 'MACD Histogram positive but weakening (Caution: momentum decelerating)';
    } else if (currMacdHist < 0 && currMacdHist < prevMacdHist) {
      macdScore = -10;
      macdStatus = 'BEARISH';
      macdDetail = 'MACD Histogram negative and expanding downward (Sellers dominating)';
    } else if (currMacdHist < 0 && currMacdHist >= prevMacdHist) {
      macdScore = -4;
      macdStatus = 'BEARISH';
      macdDetail = 'MACD Histogram negative but contracting (Selling pressure subsiding)';
    }
  }
  rawScore += macdScore;
  factors.push({
    name: 'MACD Momentum Oscillator',
    status: macdStatus,
    points: macdScore,
    detail: macdDetail
  });

  // Factor F: Volume Spike Confirmation (Max +/- 10)
  let volScore = 0;
  let volStatus = 'NEUTRAL';
  let volDetail = `Volume: ${(currVol || 0).toFixed(2)} vs Avg: ${(avgVol || 0).toFixed(2)}`;
  if (currVol > avgVol * 1.35) {
    const isGreenCandle = ltfCandles[lastIdx].close >= ltfCandles[lastIdx].open;
    if (isGreenCandle) {
      volScore = 10;
      volStatus = 'BULLISH';
      volDetail += ' (Strong Bullish Volume Spike detected)';
    } else {
      volScore = -10;
      volStatus = 'BEARISH';
      volDetail += ' (Strong Bearish Volume Flush detected)';
    }
  } else {
    volDetail += ' (Average trading volume)';
  }
  rawScore += volScore;
  factors.push({
    name: 'Volume Flow & Confirmation',
    status: volStatus,
    points: volScore,
    detail: volDetail
  });

  // Factor G: Delta Exchange Orderbook Depth Pressure (Max +/- 10)
  let obScore = 0;
  let obStatus = 'NEUTRAL';
  let obDetail = 'Orderbook depth balanced';
  if (orderbook) {
    if (orderbook.bidRatio >= 60) {
      obScore = 10;
      obStatus = 'BULLISH';
      obDetail = `Strong Buyer Wall: ${orderbook.bidRatio}% Bids vs ${orderbook.askRatio}% Asks`;
    } else if (orderbook.askRatio >= 60) {
      obScore = -10;
      obStatus = 'BEARISH';
      obDetail = `Heavy Seller Resistance: ${orderbook.askRatio}% Asks vs ${orderbook.bidRatio}% Bids`;
    } else {
      obDetail = `Balanced Orderbook: ${orderbook.bidRatio}% Bids / ${orderbook.askRatio}% Asks`;
    }
  }
  rawScore += obScore;
  factors.push({
    name: 'Delta Orderflow Depth',
    status: obStatus,
    points: obScore,
    detail: obDetail
  });

  // Normalize final confluence score (-100 to +100)
  const finalScore = Math.max(-100, Math.min(100, rawScore));
  const absScore = Math.abs(finalScore);

  // 5. Determine Trade Signal Category
  let signal = 'NEUTRAL / WAIT';
  let signalClass = 'neutral';
  let biasDirection = 'NEUTRAL';

  if (finalScore >= 60) {
    signal = 'STRONG BUY (LONG)';
    signalClass = 'strong-buy';
    biasDirection = 'LONG';
  } else if (finalScore >= 35) {
    signal = 'SCALP BUY (LONG)';
    signalClass = 'buy';
    biasDirection = 'LONG';
  } else if (finalScore <= -60) {
    signal = 'STRONG SELL (SHORT)';
    signalClass = 'strong-sell';
    biasDirection = 'SHORT';
  } else if (finalScore <= -35) {
    signal = 'SCALP SELL (SHORT)';
    signalClass = 'sell';
    biasDirection = 'SHORT';
  } else {
    signal = 'NEUTRAL (WAIT FOR BREAKOUT)';
    signalClass = 'neutral';
    biasDirection = 'NEUTRAL';
  }

  // 6. Professional Risk-Managed Trade Setup Construction
  let tradeSetup = null;
  const bufferAtr = currAtr * 1.5;

  if (biasDirection === 'LONG') {
    const entryPrice = currentPrice;
    // SL below nearest valid support demand zone bottom with ATR buffer
    const supBottom = validZones?.nearestSupport ? validZones.nearestSupport.bottom : (smc.keySupports[0] || currentPrice - bufferAtr);
    const stopLoss = Math.min(supBottom - (currAtr * 0.3), currentPrice - bufferAtr);
    const risk = entryPrice - stopLoss;

    if (risk > 0) {
      const tp1 = entryPrice + (risk * 1.5);
      const tp2 = entryPrice + (risk * 2.5);
      const tp3 = entryPrice + (risk * 4.0);

      tradeSetup = {
        direction: 'BUY / LONG',
        entryPrice: parseFloat(entryPrice.toFixed(2)),
        stopLoss: parseFloat(stopLoss.toFixed(2)),
        tp1: parseFloat(tp1.toFixed(2)),
        tp2: parseFloat(tp2.toFixed(2)),
        tp3: parseFloat(tp3.toFixed(2)),
        riskDistance: parseFloat(risk.toFixed(2)),
        riskPercentage: parseFloat(((risk / entryPrice) * 100).toFixed(2)),
        riskRewardRatio: '1 : 2.5 (Avg)',
        invalidation: `Candle closes below $${stopLoss.toFixed(2)} invalidates this Long setup.`,
        executionRules: [
          'Entry: Enter market or limit order near entry price.',
          'Take Profit 1: Close 50% position when TP1 is hit.',
          'Stop Loss to Breakeven: Immediately trail SL to entry price once TP1 is hit (0 risk runner).',
          'Take Profit 2: Close remaining 30% position at TP2.',
          'Take Profit 3: Trail remaining 20% position with SuperTrend or TP3.'
        ]
      };
    }
  } else if (biasDirection === 'SHORT') {
    const entryPrice = currentPrice;
    const resTop = validZones?.nearestResistance ? validZones.nearestResistance.top : (smc.keyResistances[0] || currentPrice + bufferAtr);
    const stopLoss = Math.max(resTop + (currAtr * 0.3), currentPrice + bufferAtr);
    const risk = stopLoss - entryPrice;

    if (risk > 0) {
      const tp1 = entryPrice - (risk * 1.5);
      const tp2 = entryPrice - (risk * 2.5);
      const tp3 = entryPrice - (risk * 4.0);

      tradeSetup = {
        direction: 'SELL / SHORT',
        entryPrice: parseFloat(entryPrice.toFixed(2)),
        stopLoss: parseFloat(stopLoss.toFixed(2)),
        tp1: parseFloat(tp1.toFixed(2)),
        tp2: parseFloat(tp2.toFixed(2)),
        tp3: parseFloat(tp3.toFixed(2)),
        riskDistance: parseFloat(risk.toFixed(2)),
        riskPercentage: parseFloat(((risk / entryPrice) * 100).toFixed(2)),
        riskRewardRatio: '1 : 2.5 (Avg)',
        invalidation: `Candle closes above $${stopLoss.toFixed(2)} invalidates this Short setup.`,
        executionRules: [
          'Entry: Enter short position near entry price.',
          'Take Profit 1: Close 50% position when TP1 is hit.',
          'Stop Loss to Breakeven: Immediately trail SL to entry price once TP1 is hit.',
          'Take Profit 2: Close remaining 30% position at TP2.',
          'Take Profit 3: Trail remaining 20% position with SuperTrend or TP3.'
        ]
      };
    }
  } else {
    // Neutral
    tradeSetup = {
      direction: 'WAIT / CONSOLIDATION',
      entryPrice: null,
      stopLoss: null,
      tp1: null,
      tp2: null,
      tp3: null,
      invalidation: 'Market is moving sideways. Professional rule: Capital preservation. Do NOT force a trade.',
      executionRules: [
        'Wait for a clean breakout of the consolidation range.',
        'Watch for 15m candle close above resistance or below support.',
        'Observe volume expansion on the breakout candle.'
      ]
    };
  }

  // Calculate estimated confluence win probability (50% base + confluence tilt)
  const estimatedProbability = biasDirection === 'NEUTRAL'
    ? 50
    : Math.min(88, Math.round(50 + (absScore * 0.38)));

  return {
    symbol,
    timeframe: executionTf,
    timestamp: new Date().toISOString(),
    currentPrice,
    ticker,
    orderbook: {
      bestBid: orderbook?.bestBid,
      bestAsk: orderbook?.bestAsk,
      bidRatio: orderbook?.bidRatio,
      askRatio: orderbook?.askRatio,
      totalBidVolume: orderbook?.totalBidVolume,
      totalAskVolume: orderbook?.totalAskVolume
    },
    indicators: {
      ema9: currEma9,
      ema21: currEma21,
      ema50: currEma50,
      ema200: currEma200,
      rsi: currRsi,
      macdHist: currMacdHist,
      supertrend: supertrend.supertrend[lastIdx],
      supertrendTrend: currSupertrend,
      atr: currAtr,
      bollinger: {
        upper: bb.upper[lastIdx],
        middle: bb.middle[lastIdx],
        lower: bb.lower[lastIdx],
        bandwidth: bb.bandwidth[lastIdx]
      }
    },
    smc: {
      keySupports: smc.keySupports,
      keyResistances: smc.keyResistances,
      validZones: smc.validZones,
      activeFVGs: smc.fairValueGaps.slice(-3),
      recentOrderBlocks: smc.orderBlocks.slice(-3)
    },
    confluence: {
      score: finalScore,
      absScore,
      estimatedProbability,
      signal,
      signalClass,
      biasDirection,
      htfBias,
      factors
    },
    tradeSetup
  };
}

module.exports = {
  analyzeTrade
};
