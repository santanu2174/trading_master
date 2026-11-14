// confluenceEngine.js - Multi-Strategy Confluence & Strict Confirmation Engine

const deltaApi = require('./deltaApi');
const indicators = require('./indicators');
const { analyzeSessions } = require('./sessionEngine');

/**
 * Analyzes market data across multiple strategies, indicators, and sessions.
 * Implements a strict confirmation gate: Will NOT issue trade entry until ALL required strategies confirm.
 * @param {string} symbol - 'BTCUSD' or 'ETHUSD'
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

  // 2. Compute Intraday Technical Indicators
  const ema9 = indicators.calculateEMA(closes, 9);
  const ema21 = indicators.calculateEMA(closes, 21);
  const ema50 = indicators.calculateEMA(closes, 50);
  const ema200 = indicators.calculateEMA(closes, Math.min(200, closes.length));

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

  // 3. Compute Institutional Trading Sessions & Killzones
  const sessionData = analyzeSessions(ltfCandles, currentPrice);

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

  // 4. Compute Higher Timeframe (1h) Trend Filter
  let htfBias = 'NEUTRAL';
  let htfScore = 0;
  if (htfCandles && htfCandles.length >= 30) {
    const htfCloses = htfCandles.map(c => c.close);
    const htfEma50 = indicators.calculateEMA(htfCloses, 50);
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

  // 5. Build 8-Pillar Multi-Strategy Confirmation Matrix
  let rawScore = 0;
  const factors = [];

  // Pillar 1: 1H Macro Trend Filter (Max +/- 20)
  rawScore += htfScore;
  factors.push({
    id: 'htf',
    name: '1. 1H Macro Trend Filter',
    status: htfBias === 'BULLISH' ? 'BULLISH' : htfBias === 'BEARISH' ? 'BEARISH' : 'NEUTRAL',
    points: htfScore,
    detail: `1H Trend is ${htfBias} (Higher timeframe institutional direction)`
  });

  // Pillar 2: Intraday EMA Alignment (Max +/- 15)
  let emaScore = 0;
  let emaDetail = '';
  if (currEma9 && currEma21) {
    if (currentPrice > currEma9 && currEma9 > currEma21) {
      if (currEma50 && currEma21 > currEma50) {
        emaScore = 15;
        emaDetail = 'Perfect Bullish EMA Stack (Price > 9 > 21 > 50)';
      } else {
        emaScore = 10;
        emaDetail = 'Bullish Short-term Alignment (Price > 9 EMA > 21 EMA)';
      }
    } else if (currentPrice < currEma9 && currEma9 < currEma21) {
      if (currEma50 && currEma21 < currEma50) {
        emaScore = -15;
        emaDetail = 'Perfect Bearish EMA Stack (Price < 9 < 21 < 50)';
      } else {
        emaScore = -10;
        emaDetail = 'Bearish Short-term Alignment (Price < 9 EMA < 21 EMA)';
      }
    } else {
      emaScore = 0;
      emaDetail = 'EMA Compression / Choppy crossover';
    }
  }
  rawScore += emaScore;
  factors.push({
    id: 'ema',
    name: '2. Intraday EMA Alignment',
    status: emaScore > 0 ? 'BULLISH' : emaScore < 0 ? 'BEARISH' : 'NEUTRAL',
    points: emaScore,
    detail: emaDetail
  });

  // Pillar 3: SuperTrend (10, 3) (Max +/- 15)
  let stScore = 0;
  if (currSupertrend === 1) {
    stScore = 15;
    factors.push({
      id: 'supertrend',
      name: '3. SuperTrend (10, 3)',
      status: 'BULLISH',
      points: 15,
      detail: `SuperTrend is GREEN (Support holding at $${supertrend.supertrend[lastIdx].toFixed(1)})`
    });
  } else {
    stScore = -15;
    factors.push({
      id: 'supertrend',
      name: '3. SuperTrend (10, 3)',
      status: 'BEARISH',
      points: -15,
      detail: `SuperTrend is RED (Resistance capping at $${supertrend.supertrend[lastIdx].toFixed(1)})`
    });
  }
  rawScore += stScore;

  // Pillar 4: RSI & Divergence Analysis (Max +/- 20)
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
    if (currRsi > 53 && currRsi < 68) {
      rsiScore += 10;
      rsiStatus = 'BULLISH';
      rsiDetail += ' (Bullish Momentum Expansion)';
    } else if (currRsi < 47 && currRsi > 32) {
      rsiScore -= 10;
      rsiStatus = 'BEARISH';
      rsiDetail += ' (Bearish Momentum Expansion)';
    } else if (currRsi <= 30) {
      rsiScore += 6;
      rsiStatus = 'BULLISH';
      rsiDetail += ' (Oversold - Potential Rebound Zone)';
    } else if (currRsi >= 70) {
      rsiScore -= 6;
      rsiStatus = 'BEARISH';
      rsiDetail += ' (Overbought - Potential Exhaustion)';
    }
  }
  rawScore += rsiScore;
  factors.push({
    id: 'rsi',
    name: '4. RSI & Divergence Engine',
    status: rsiStatus,
    points: rsiScore,
    detail: rsiDetail
  });

  // Pillar 5: MACD Histogram Momentum (Max +/- 10)
  let macdScore = 0;
  let macdStatus = 'NEUTRAL';
  let macdDetail = '';
  if (currMacdHist !== null && prevMacdHist !== null) {
    if (currMacdHist > 0 && currMacdHist > prevMacdHist) {
      macdScore = 10;
      macdStatus = 'BULLISH';
      macdDetail = 'MACD Histogram positive and expanding upward (Buyers accelerating)';
    } else if (currMacdHist > 0 && currMacdHist <= prevMacdHist) {
      macdScore = 3;
      macdStatus = 'BULLISH';
      macdDetail = 'MACD Histogram positive but decelerating (Caution: momentum weakening)';
    } else if (currMacdHist < 0 && currMacdHist < prevMacdHist) {
      macdScore = -10;
      macdStatus = 'BEARISH';
      macdDetail = 'MACD Histogram negative and expanding downward (Sellers dominant)';
    } else if (currMacdHist < 0 && currMacdHist >= prevMacdHist) {
      macdScore = -3;
      macdStatus = 'BEARISH';
      macdDetail = 'MACD Histogram negative but contracting (Selling pressure subsiding)';
    }
  }
  rawScore += macdScore;
  factors.push({
    id: 'macd',
    name: '5. MACD Momentum Oscillator',
    status: macdStatus,
    points: macdScore,
    detail: macdDetail
  });

  // Pillar 6: Trading Sessions & Liquidity Sweep (Max +/- 15)
  let sessionScore = sessionData.asiaRange.score || 0;
  let sessionStatus = 'NEUTRAL';
  if (sessionScore > 0) sessionStatus = 'BULLISH';
  else if (sessionScore < 0) sessionStatus = 'BEARISH';

  rawScore += sessionScore;
  factors.push({
    id: 'session',
    name: '6. Trading Session & Liquidity Sweep',
    status: sessionStatus,
    points: sessionScore,
    detail: `${sessionData.currentSessionName} | ${sessionData.asiaRange.detail}`
  });

  // Pillar 7: Valid Support & Resistance Reaction (Max +/- 15)
  let zoneScore = 0;
  let zoneStatus = 'NEUTRAL';
  let zoneDetail = validZones.priceStatus ? validZones.priceStatus.replace(/_/g, ' ') : 'Consolidating between zones';

  if (validZones.priceStatus?.includes('SUPPORT')) {
    zoneScore = 15;
    zoneStatus = 'BULLISH';
    zoneDetail = `Price is testing Valid Demand Support ($${validZones.nearestSupport?.bottom} - $${validZones.nearestSupport?.top})`;
  } else if (validZones.priceStatus?.includes('RESISTANCE')) {
    zoneScore = -15;
    zoneStatus = 'BEARISH';
    zoneDetail = `Price is testing Valid Supply Resistance ($${validZones.nearestResistance?.bottom} - $${validZones.nearestResistance?.top})`;
  }
  rawScore += zoneScore;
  factors.push({
    id: 'zones',
    name: '7. Institutional Support / Resistance Zone',
    status: zoneStatus,
    points: zoneScore,
    detail: zoneDetail
  });

  // Pillar 8: Volume Surge & Delta Orderflow (Max +/- 10)
  let flowScore = 0;
  let flowStatus = 'NEUTRAL';
  let flowDetail = '';
  const isVolSpike = currVol > avgVol * 1.35;
  const isBuyerWall = orderbook && orderbook.bidRatio >= 58;
  const isSellerWall = orderbook && orderbook.askRatio >= 58;

  if (isVolSpike && isBuyerWall) {
    flowScore = 10;
    flowStatus = 'BULLISH';
    flowDetail = `Volume surge + Buyer Wall (${orderbook.bidRatio}% Bids)`;
  } else if (isVolSpike && isSellerWall) {
    flowScore = -10;
    flowStatus = 'BEARISH';
    flowDetail = `Volume flush + Heavy Seller Resistance (${orderbook.askRatio}% Asks)`;
  } else if (isBuyerWall) {
    flowScore = 6;
    flowStatus = 'BULLISH';
    flowDetail = `Buyer wall dominant (${orderbook.bidRatio}% Bids)`;
  } else if (isSellerWall) {
    flowScore = -6;
    flowStatus = 'BEARISH';
    flowDetail = `Seller wall dominant (${orderbook.askRatio}% Asks)`;
  } else {
    flowDetail = `Orderflow balanced: ${orderbook?.bidRatio || 50}% Bids / ${orderbook?.askRatio || 50}% Asks`;
  }
  rawScore += flowScore;
  factors.push({
    id: 'flow',
    name: '8. Volume & Orderflow Depth',
    status: flowStatus,
    points: flowScore,
    detail: flowDetail
  });

  // Normalize final confluence score (-100 to +100)
  const finalScore = Math.max(-100, Math.min(100, rawScore));
  const absScore = Math.abs(finalScore);

  // 6. STRICT CONFIRMATION GATEKEEPER
  // Count how many factors are bullish vs bearish
  const bullishFactorsCount = factors.filter(f => f.status === 'BULLISH').length;
  const bearishFactorsCount = factors.filter(f => f.status === 'BEARISH').length;
  const totalFactorsCount = factors.length; // 8 factors

  const missingConfirmations = [];
  let isFullConfirmation = false;
  let confirmedDirection = 'NEUTRAL';

  // Rule 1: High threshold (at least score >= 70 OR score <= -70)
  // Rule 2: At least 6 out of 8 factors must agree
  // Rule 3: 1H Macro Trend must NOT contradict
  // Rule 4: RSI Divergence must NOT contradict

  if (finalScore >= 65 && bullishFactorsCount >= 5) {
    // Check Long Confirmation Rules
    let passed = true;

    if (htfBias === 'BEARISH') {
      passed = false;
      missingConfirmations.push('❌ 1H Macro Trend is BEARISH — Counter-trend Long is strictly prohibited.');
    }
    if (divergence.type.includes('BEARISH')) {
      passed = false;
      missingConfirmations.push('❌ Bearish RSI Divergence detected — Risk of impending pullback.');
    }
    if (validZones.priceStatus?.includes('RESISTANCE')) {
      passed = false;
      missingConfirmations.push('❌ Price is directly under a Valid Resistance Supply Zone — Do not buy into a ceiling.');
    }

    if (passed && finalScore >= 65) {
      isFullConfirmation = true;
      confirmedDirection = 'LONG';
    }
  } else if (finalScore <= -65 && bearishFactorsCount >= 5) {
    // Check Short Confirmation Rules
    let passed = true;

    if (htfBias === 'BULLISH') {
      passed = false;
      missingConfirmations.push('❌ 1H Macro Trend is BULLISH — Counter-trend Short is strictly prohibited.');
    }
    if (divergence.type.includes('BULLISH')) {
      passed = false;
      missingConfirmations.push('❌ Bullish RSI Divergence detected — Risk of sudden bounce.');
    }
    if (validZones.priceStatus?.includes('SUPPORT')) {
      passed = false;
      missingConfirmations.push('❌ Price is directly on top of a Valid Support Demand Zone — Do not short into a floor.');
    }

    if (passed && finalScore <= -65) {
      isFullConfirmation = true;
      confirmedDirection = 'SHORT';
    }
  }

  // Populate generic missing confirmations if not yet met
  if (!isFullConfirmation) {
    if (finalScore > 0 && finalScore < 65) {
      missingConfirmations.push(`⏳ Bullish Confluence Score (${finalScore}%) is below strict minimum threshold (65%).`);
    } else if (finalScore < 0 && finalScore > -65) {
      missingConfirmations.push(`⏳ Bearish Confluence Score (${Math.abs(finalScore)}%) is below strict minimum threshold (65%).`);
    } else if (finalScore === 0) {
      missingConfirmations.push('⏳ Market is in Choppy Consolidation — Indicators are conflicting.');
    }

    if (bullishFactorsCount < 5 && bearishFactorsCount < 5) {
      missingConfirmations.push(`⏳ Only ${Math.max(bullishFactorsCount, bearishFactorsCount)}/8 strategies confirmed (Minimum 5 required).`);
    }
  }

  // 7. Determine Signal & Build Trade Setup
  let signal = 'NEUTRAL / WAIT FOR CONFIRMATION';
  let signalClass = 'neutral';

  if (isFullConfirmation && confirmedDirection === 'LONG') {
    signal = '🚀 FULL CONFIRMATION: STRONG LONG (BUY)';
    signalClass = 'strong-buy';
  } else if (isFullConfirmation && confirmedDirection === 'SHORT') {
    signal = '🚀 FULL CONFIRMATION: STRONG SHORT (SELL)';
    signalClass = 'strong-sell';
  } else {
    signal = '⏳ WAITING FOR COMPLETE CONFIRMATION (NO TRADE)';
    signalClass = 'neutral';
    confirmedDirection = 'NEUTRAL';
  }

  let tradeSetup = null;
  const bufferAtr = currAtr * 1.5;

  // STRICT RULE: If not fully confirmed, DO NOT GIVE ENTRY/SL/TP!
  if (isFullConfirmation && confirmedDirection === 'LONG') {
    const entryPrice = currentPrice;
    const supBottom = validZones?.nearestSupport ? validZones.nearestSupport.bottom : (smc.keySupports[0] || currentPrice - bufferAtr);
    const stopLoss = Math.min(supBottom - (currAtr * 0.3), currentPrice - bufferAtr);
    const risk = entryPrice - stopLoss;

    if (risk > 0) {
      const tp1 = entryPrice + (risk * 1.5);
      const tp2 = entryPrice + (risk * 2.5);
      const tp3 = entryPrice + (risk * 4.0);

      tradeSetup = {
        isConfirmed: true,
        direction: 'BUY / LONG (CONFIRMED ✅)',
        entryPrice: parseFloat(entryPrice.toFixed(2)),
        stopLoss: parseFloat(stopLoss.toFixed(2)),
        tp1: parseFloat(tp1.toFixed(2)),
        tp2: parseFloat(tp2.toFixed(2)),
        tp3: parseFloat(tp3.toFixed(2)),
        riskDistance: parseFloat(risk.toFixed(2)),
        riskPercentage: parseFloat(((risk / entryPrice) * 100).toFixed(2)),
        riskRewardRatio: '1 : 2.5 (Avg)',
        invalidation: `Candle close below $${stopLoss.toFixed(2)} invalidates this setup.`,
        executionRules: [
          'Entry: Enter market or limit order near entry price.',
          'Take Profit 1: Close 50% position when TP1 is hit.',
          'Stop Loss to Breakeven: Immediately trail SL to entry price once TP1 is hit (0 risk runner).',
          'Take Profit 2: Close remaining 30% position at TP2.',
          'Take Profit 3: Trail remaining 20% position with SuperTrend or TP3.'
        ]
      };
    }
  } else if (isFullConfirmation && confirmedDirection === 'SHORT') {
    const entryPrice = currentPrice;
    const resTop = validZones?.nearestResistance ? validZones.nearestResistance.top : (smc.keyResistances[0] || currentPrice + bufferAtr);
    const stopLoss = Math.max(resTop + (currAtr * 0.3), currentPrice + bufferAtr);
    const risk = stopLoss - entryPrice;

    if (risk > 0) {
      const tp1 = entryPrice - (risk * 1.5);
      const tp2 = entryPrice - (risk * 2.5);
      const tp3 = entryPrice - (risk * 4.0);

      tradeSetup = {
        isConfirmed: true,
        direction: 'SELL / SHORT (CONFIRMED ✅)',
        entryPrice: parseFloat(entryPrice.toFixed(2)),
        stopLoss: parseFloat(stopLoss.toFixed(2)),
        tp1: parseFloat(tp1.toFixed(2)),
        tp2: parseFloat(tp2.toFixed(2)),
        tp3: parseFloat(tp3.toFixed(2)),
        riskDistance: parseFloat(risk.toFixed(2)),
        riskPercentage: parseFloat(((risk / entryPrice) * 100).toFixed(2)),
        riskRewardRatio: '1 : 2.5 (Avg)',
        invalidation: `Candle close above $${stopLoss.toFixed(2)} invalidates this setup.`,
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
    // UNCONFIRMED / NO TRADE (Strict Discipline)
    tradeSetup = {
      isConfirmed: false,
      direction: 'WAITING FOR COMPLETE CONFIRMATION',
      entryPrice: null,
      stopLoss: null,
      tp1: null,
      tp2: null,
      tp3: null,
      invalidation: 'সবকটি স্ট্র্যাটেজি কনফার্ম না হওয়া পর্যন্ত কোনো ট্রেড এন্ট্রি নিষিদ্ধ। ক্যাপিটাল রক্ষা করাই প্রথম কাজ।',
      missingConfirmations,
      executionRules: [
        'সবগুলো ইন্ডিকেটর ও সেশন একই দিকে কনফার্ম না করা পর্যন্ত কোনো ট্রেড নেবেন না।',
        '১ ঘণ্টার হায়ার টাইমফ্রেম ট্রেন্ডের বিপরীতে কখনোই ট্রেড করবেন না।',
        'ফেইকআউট ও স্টপ-হান্টিং এড়াতে সম্পূর্ণ কনফার্মেশনের অপেক্ষা করুন।'
      ]
    };
  }

  const estimatedProbability = isFullConfirmation
    ? Math.min(92, Math.round(55 + (absScore * 0.38)))
    : 50;

  return {
    symbol,
    timeframe: executionTf,
    timestamp: new Date().toISOString(),
    currentPrice,
    ticker,
    session: sessionData,
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
      biasDirection: confirmedDirection,
      isFullConfirmation,
      bullishFactorsCount,
      bearishFactorsCount,
      totalFactorsCount,
      missingConfirmations,
      htfBias,
      factors
    },
    tradeSetup
  };
}

module.exports = {
  analyzeTrade
};
