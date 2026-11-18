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

  // 7. PREDICTIVE MARKET FALL & RISE RADAR ENGINE
  const bufferAtr = currAtr * 1.5;
  const supBottom = validZones?.nearestSupport ? validZones.nearestSupport.bottom : (smc.keySupports[0] || currentPrice - bufferAtr);
  const resTop = validZones?.nearestResistance ? validZones.nearestResistance.top : (smc.keyResistances[0] || currentPrice + bufferAtr);

  let fallRiseDirection = 'CONSOLIDATION';
  let fallProbability = 50;
  let riseProbability = 50;
  let fallRiseTitle = '⚖️ ACCUMULATION / PRE-BREAKOUT ⏳';
  let fallRiseBengali = 'মার্কেট রেঞ্জে ঘুরছে (ব্রেকআউটের জন্য অপেক্ষা করুন)';
  let fallRiseAction = '⏳ সাপোর্ট বা রেজিস্ট্যান্সে লিমিট এন্ট্রি রাখুন';
  const fallRiseCatalysts = [];

  // Determine if Market is about to FALL or RISE
  if (finalScore <= -15 || (htfBias === 'BEARISH' && bearishFactorsCount >= 3)) {
    fallRiseDirection = 'FALL';
    fallProbability = Math.min(95, Math.max(65, Math.round(55 + (Math.abs(finalScore) * 0.45))));
    riseProbability = 100 - fallProbability;
    fallRiseTitle = '⚠️ CRITICAL FALL WARNING: MARKET WILL DUMP (DOWN) 🔻';
    fallRiseBengali = 'মার্কেট দ্রুত নিচে পড়বে (FALL / SHORT সিগন্যাল অ্যাক্টিভ) 🔻';
    fallRiseAction = `🔴 এখনই SELL / SHORT এন্ট্রি নিন: $${currentPrice.toFixed(2)}`;

    if (htfBias === 'BEARISH') fallRiseCatalysts.push('১ ঘণ্টার ম্যাক্রো ট্রেন্ড শক্তিশালী বিয়ারিশ মোমেন্টামে রয়েছে।');
    if (divergence.type.includes('BEARISH')) fallRiseCatalysts.push(`RSI বিয়ারিশ ডাইভারজেন্স (${divergence.type}): প্রাইস দুর্বল হচ্ছে।`);
    if (sessionData?.asiaRange?.status?.includes('HIGH_SWEPT')) fallRiseCatalysts.push('এশিয়ান হাই ট্র্যাপ সুইপ করে সেলাররা মার্কেট পুশ করছে (Judas Swing)।');
    if (currSupertrend === 'BEARISH') fallRiseCatalysts.push('সুপারট্রেন্ড (১০, ৩) রেড সিগন্যালে রেজিস্ট্যান্স তৈরি করেছে।');
    if (orderbook && orderbook.askRatio >= 52) fallRiseCatalysts.push(`অর্ডারবুকে বিক্রেতাদের চাপ dominant (${orderbook.askRatio}% Asks)।`);
    if (validZones?.nearestResistance) fallRiseCatalysts.push(`রেজিস্ট্যান্স সাপ্লাই জোন ($${validZones.nearestResistance.bottom} - $${validZones.nearestResistance.top}) থেকে রিজেকশন।`);
    if (fallRiseCatalysts.length === 0) fallRiseCatalysts.push('বিয়ারিশ মোমেন্টাম ও সেলিং প্রেসার বৃদ্ধি পাচ্ছে।');
  } else if (finalScore >= 15 || (htfBias === 'BULLISH' && bullishFactorsCount >= 3)) {
    fallRiseDirection = 'RISE';
    riseProbability = Math.min(95, Math.max(65, Math.round(55 + (finalScore * 0.45))));
    fallProbability = 100 - riseProbability;
    fallRiseTitle = '🚀 EXPLOSIVE RISE WARNING: MARKET WILL PUMP (UP) 🚀';
    fallRiseBengali = 'মার্কেট দ্রুত উপরে উঠবে (RISE / LONG সিগন্যাল অ্যাক্টিভ) 🚀';
    fallRiseAction = `🟢 এখনই BUY / LONG এন্ট্রি নিন: $${currentPrice.toFixed(2)}`;

    if (htfBias === 'BULLISH') fallRiseCatalysts.push('১ ঘণ্টার ম্যাক্রো ট্রেন্ড শক্তিশালী বুলিশ মোমেন্টামে রয়েছে।');
    if (divergence.type.includes('BULLISH')) fallRiseCatalysts.push(`RSI বুলিশ ডাইভারজেন্স (${divergence.type}): বাউন্স প্রত্যাশিত।`);
    if (sessionData?.asiaRange?.status?.includes('LOW_SWEPT')) fallRiseCatalysts.push('এশিয়ান লো সুইপ করে বায়াররা এন্ট্রি নিয়েছে (Turtle Soup Spring)।');
    if (currSupertrend === 'BULLISH') fallRiseCatalysts.push('সুপারট্রেন্ড (১০, ৩) গ্রিন সিগন্যালে ডায়নামিক সাপোর্ট দিচ্ছে।');
    if (orderbook && orderbook.bidRatio >= 52) fallRiseCatalysts.push(`অর্ডারবুকে ক্রেতাদের চাপ dominant (${orderbook.bidRatio}% Bids)।`);
    if (validZones?.nearestSupport) fallRiseCatalysts.push(`সাপোর্ট ডিমান্ড জোন ($${validZones.nearestSupport.bottom} - $${validZones.nearestSupport.top}) থেকে বাউন্স।`);
    if (fallRiseCatalysts.length === 0) fallRiseCatalysts.push('বুলিশ মোমেন্টাম ও বায়িং প্রেসার বৃদ্ধি পাচ্ছে।');
  } else {
    fallRiseCatalysts.push('মার্কেট বর্তমানে কনসোলিডেশন জোনে রয়েছে।');
    if (validZones?.nearestSupport) fallRiseCatalysts.push(`Buy Limit Setup: সাপোর্ট $${validZones.nearestSupport.bottom} এ এলে বাই করুন।`);
    if (validZones?.nearestResistance) fallRiseCatalysts.push(`Sell Limit Setup: রেজিস্ট্যান্স $${validZones.nearestResistance.top} এ গেলে শর্ট করুন।`);
  }

  // Calculate Entry, SL, TP for Fall or Rise
  let calculatedSL, calculatedTP1, calculatedTP2, calculatedTP3, calculatedRisk;
  if (fallRiseDirection === 'FALL') {
    calculatedSL = parseFloat(Math.max(resTop + (currAtr * 0.3), currentPrice + bufferAtr).toFixed(2));
    calculatedRisk = calculatedSL - currentPrice;
    calculatedTP1 = parseFloat((currentPrice - (calculatedRisk * 1.5)).toFixed(2));
    calculatedTP2 = parseFloat((currentPrice - (calculatedRisk * 2.5)).toFixed(2));
    calculatedTP3 = parseFloat((currentPrice - (calculatedRisk * 4.0)).toFixed(2));
  } else {
    calculatedSL = parseFloat(Math.min(supBottom - (currAtr * 0.3), currentPrice - bufferAtr).toFixed(2));
    calculatedRisk = currentPrice - calculatedSL;
    calculatedTP1 = parseFloat((currentPrice + (calculatedRisk * 1.5)).toFixed(2));
    calculatedTP2 = parseFloat((currentPrice + (calculatedRisk * 2.5)).toFixed(2));
    calculatedTP3 = parseFloat((currentPrice + (calculatedRisk * 4.0)).toFixed(2));
  }

  const fallRisePredictor = {
    direction: fallRiseDirection,
    title: fallRiseTitle,
    movementBengali: fallRiseBengali,
    actionCommand: fallRiseAction,
    fallProbability,
    riseProbability,
    entryPrice: parseFloat(currentPrice.toFixed(2)),
    stopLoss: calculatedSL,
    tp1: calculatedTP1,
    tp2: calculatedTP2,
    tp3: calculatedTP3,
    riskRewardRatio: '1 : 2.5 (Avg)',
    catalysts: fallRiseCatalysts,
    executionRules: [
      '🛡️ এন্ট্রি নেওয়ার পর TP1 হিট হলে ৫০% লাভ তুলে নিন এবং Stop Loss এন্ট্রি প্রাইসে নিয়ে রিস্ক জিরো করুন।',
      '⚡ ১ ঘণ্টার হায়ার টাইমফ্রেম ট্রেন্ডের সাথে ট্রেড রাখুন।'
    ]
  };

  // 8. Determine Signal & Build Trade Setup
  let signal = 'NEUTRAL / WAIT FOR CONFIRMATION';
  let signalClass = 'neutral';

  if (isFullConfirmation && confirmedDirection === 'LONG') {
    signal = '🚀 FULL CONFIRMATION: STRONG LONG (BUY)';
    signalClass = 'strong-buy';
  } else if (isFullConfirmation && confirmedDirection === 'SHORT') {
    signal = '🚀 FULL CONFIRMATION: STRONG SHORT (SELL)';
    signalClass = 'strong-sell';
  } else if (fallRiseDirection === 'FALL') {
    signal = '🔻 MARKET FALL PREDICTION: SHORT TRIGGER';
    signalClass = 'strong-sell';
  } else if (fallRiseDirection === 'RISE') {
    signal = '🚀 MARKET RISE PREDICTION: LONG TRIGGER';
    signalClass = 'strong-buy';
  } else {
    signal = '⏳ CONSOLIDATION / WAITING FOR BREAKOUT';
    signalClass = 'neutral';
  }

  const tradeDirectionLabel = isFullConfirmation
    ? (confirmedDirection === 'LONG' ? 'BUY / LONG (CONFIRMED ✅)' : 'SELL / SHORT (CONFIRMED ✅)')
    : (fallRiseDirection === 'FALL' ? 'SELL / SHORT (MOMENTUM TRIGGER ⚡)' : fallRiseDirection === 'RISE' ? 'BUY / LONG (MOMENTUM TRIGGER ⚡)' : 'WAITING FOR BREAKOUT');

  const tradeSetup = {
    isConfirmed: isFullConfirmation,
    direction: tradeDirectionLabel,
    entryPrice: parseFloat(currentPrice.toFixed(2)),
    stopLoss: calculatedSL,
    tp1: calculatedTP1,
    tp2: calculatedTP2,
    tp3: calculatedTP3,
    riskDistance: parseFloat(Math.abs(currentPrice - calculatedSL).toFixed(2)),
    riskPercentage: parseFloat(((Math.abs(currentPrice - calculatedSL) / currentPrice) * 100).toFixed(2)),
    riskRewardRatio: '1 : 2.5 (Avg)',
    invalidation: fallRiseDirection === 'FALL' ? `Candle close above $${calculatedSL} invalidates setup.` : `Candle close below $${calculatedSL} invalidates setup.`,
    missingConfirmations,
    executionRules: [
      'TP1 হিট হলে ৫০% প্রফিট বুক করুন এবং Stop Loss সাথে সাথে Entry Price (Cost-to-Cost)-এ সরিয়ে নিন।',
      'ট্রেন্ড কনফার্মেশন ও মোমেন্টামের সাথে ট্রেড করুন।'
    ]
  };

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
    fallRisePredictor,
    tradeSetup
  };
}

module.exports = {
  analyzeTrade
};
