// sessionEngine.js - Institutional Trading Sessions & ICT Killzones Engine

/**
 * Calculates current market session, killzones, Asia High/Low, and liquidity sweeps
 * @param {Array} candles - Historical 15m candles
 * @param {number} currentPrice - Current mark price
 */
function analyzeSessions(candles, currentPrice) {
  const now = new Date();
  const utcHours = now.getUTCHours();
  const utcMinutes = now.getUTCMinutes();
  const utcDec = utcHours + (utcMinutes / 60);

  // 1. Session Status
  const isAsia = utcDec >= 0 && utcDec < 8;
  const isLondon = utcDec >= 7 && utcDec < 15;
  const isNY = utcDec >= 12 && utcDec < 20;
  const isOverlap = utcDec >= 12 && utcDec < 16; // London + NY Overlap (Power Hour)

  // 2. Killzones
  const isAsiaKillzone = utcDec >= 0 && utcDec < 4;
  const isLondonKillzone = utcDec >= 7 && utcDec < 10;
  const isNYKillzone = utcDec >= 12 && utcDec < 15;

  let currentSessionName = 'OFF-PEAK / CONSOLIDATION';
  let sessionBadgeClass = 'neutral';
  let sessionQuality = 'MODERATE';

  if (isOverlap) {
    currentSessionName = '🔥 LONDON & NEW YORK OVERLAP (POWER HOUR)';
    sessionBadgeClass = 'strong-buy';
    sessionQuality = 'PRIME_INSTITUTIONAL';
  } else if (isLondonKillzone) {
    currentSessionName = '🇬🇧 LONDON OPEN KILLZONE (ICT SWEEP)';
    sessionBadgeClass = 'buy';
    sessionQuality = 'HIGH_MOMENTUM';
  } else if (isNYKillzone) {
    currentSessionName = '🇺🇸 NEW YORK OPEN KILLZONE (INSTITUTIONAL EXPANSION)';
    sessionBadgeClass = 'buy';
    sessionQuality = 'HIGH_MOMENTUM';
  } else if (isLondon) {
    currentSessionName = '🇬🇧 LONDON SESSION';
    sessionBadgeClass = 'buy';
    sessionQuality = 'ACTIVE_TREND';
  } else if (isNY) {
    currentSessionName = '🇺🇸 NEW YORK SESSION';
    sessionBadgeClass = 'buy';
    sessionQuality = 'ACTIVE_TREND';
  } else if (isAsia) {
    currentSessionName = '🌏 ASIAN SESSION (ACCUMULATION / RANGE)';
    sessionBadgeClass = 'neutral';
    sessionQuality = 'RANGE_BOUND';
  }

  // 3. Extract Asian Session Candles (00:00 - 08:00 UTC) from the last 24h
  const oneDayAgoMs = Date.now() - (24 * 60 * 60 * 1000);
  const recentDayCandles = candles.filter(c => c.time >= oneDayAgoMs);

  const asiaCandles = recentDayCandles.filter(c => {
    const d = new Date(c.time);
    const h = d.getUTCHours();
    return h >= 0 && h < 8;
  });

  let asiaHigh = null;
  let asiaLow = null;
  let asiaMid = null;

  if (asiaCandles.length > 0) {
    asiaHigh = parseFloat(Math.max(...asiaCandles.map(c => c.high)).toFixed(1));
    asiaLow = parseFloat(Math.min(...asiaCandles.map(c => c.low)).toFixed(1));
    asiaMid = parseFloat(((asiaHigh + asiaLow) / 2).toFixed(1));
  }

  // 4. Session Liquidity Sweeps (Judas Swing / Turtle Soup)
  // Check if price wicked above Asia High or below Asia Low during post-Asia sessions
  let sweepStatus = 'NO_SWEEP';
  let sweepScore = 0;
  let sweepDetail = 'Asia Session liquidity pools intact';

  if (asiaHigh && asiaLow && !isAsia) {
    const postAsiaCandles = recentDayCandles.filter(c => {
      const d = new Date(c.time);
      return d.getUTCHours() >= 8;
    });

    // Check if recent candles pierced Asia High and closed below
    const piercedHigh = postAsiaCandles.some(c => c.high > asiaHigh);
    const sweptHighAndRejected = piercedHigh && currentPrice < asiaHigh;

    // Check if recent candles pierced Asia Low and closed above
    const piercedLow = postAsiaCandles.some(c => c.low < asiaLow);
    const sweptLowAndRejected = piercedLow && currentPrice > asiaLow;

    if (sweptHighAndRejected) {
      sweepStatus = 'BEARISH_ASIA_HIGH_SWEPT';
      sweepScore = -20;
      sweepDetail = `⚔️ Asia High ($${asiaHigh}) was swept & rejected! (Institutional Short Trap / Judas Swing)`;
    } else if (sweptLowAndRejected) {
      sweepStatus = 'BULLISH_ASIA_LOW_SWEPT';
      sweepScore = 20;
      sweepDetail = `🛡️ Asia Low ($${asiaLow}) was swept & reclaimed! (Institutional Long Spring / Turtle Soup)`;
    } else if (currentPrice > asiaHigh) {
      sweepStatus = 'BREAKOUT_ABOVE_ASIA';
      sweepScore = 10;
      sweepDetail = `Bullish expansion holding above Asia High ($${asiaHigh})`;
    } else if (currentPrice < asiaLow) {
      sweepStatus = 'BREAKOUT_BELOW_ASIA';
      sweepScore = -10;
      sweepDetail = `Bearish breakdown holding below Asia Low ($${asiaLow})`;
    }
  }

  // Formatting clocks
  const utcClock = `${String(utcHours).padStart(2, '0')}:${String(utcMinutes).padStart(2, '0')} UTC`;
  // IST is UTC + 5:30
  const istDate = new Date(now.getTime() + (5.5 * 60 * 60 * 1000));
  const istClock = `${String(istDate.getUTCHours()).padStart(2, '0')}:${String(istDate.getUTCMinutes()).padStart(2, '0')} IST`;

  const hasSweptHigh = sweepStatus === 'BEARISH_ASIA_HIGH_SWEPT';
  const hasSweptLow = sweepStatus === 'BULLISH_ASIA_LOW_SWEPT';

  return {
    utcClock,
    istClock,
    clocks: { utc: utcClock, ist: istClock },
    activeSession: currentSessionName,
    currentSessionName,
    sessionBadgeClass,
    sessionQuality,
    isAsiaActive: isAsia,
    isLondonActive: isLondon,
    isNyActive: isNY,
    isOverlapActive: isOverlap,
    liquiditySweep: {
      hasSweptHigh,
      hasSweptLow,
      status: sweepStatus,
      detail: sweepDetail
    },
    sessions: {
      asia: { name: 'Asian Session', hours: '00:00 - 08:00 UTC', active: isAsia, killzone: isAsiaKillzone },
      london: { name: 'London Session', hours: '07:00 - 15:00 UTC', active: isLondon, killzone: isLondonKillzone },
      ny: { name: 'New York Session', hours: '12:00 - 20:00 UTC', active: isNY, killzone: isNYKillzone },
      overlap: { name: 'London / NY Overlap', hours: '12:00 - 16:00 UTC', active: isOverlap }
    },
    asiaRange: {
      high: asiaHigh,
      low: asiaLow,
      mid: asiaMid,
      status: sweepStatus,
      score: sweepScore,
      detail: sweepDetail
    }
  };
}

module.exports = {
  analyzeSessions
};
