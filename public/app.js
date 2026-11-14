// app.js - Frontend Application Controller & Real-Time Sync

let currentSymbol = 'BTCUSD';
let currentTimeframe = '15m';
let refreshIntervalTimer = null;
let autoRefreshSec = 15;
let countdown = autoRefreshSec;
let chartInstance = null;
let lastKnownSignal = null;
let audioEnabled = true;

// Web Audio API Chime for trade signal alert
function playAlertChime(isBullish = true) {
  if (!audioEnabled) return;
  try {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(isBullish ? 587.33 : 349.23, audioCtx.currentTime); // D5 or F4
    osc.frequency.exponentialRampToValueAtTime(isBullish ? 880 : 220, audioCtx.currentTime + 0.35);

    gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.4);

    osc.connect(gain);
    gain.connect(audioCtx.destination);

    osc.start();
    osc.stop(audioCtx.currentTime + 0.45);
  } catch (e) {
    // Audio autoplay restrictions or unsupported
  }
}

// Format numbers
function formatPrice(num) {
  if (num === null || num === undefined) return '--';
  return num >= 100 ? num.toLocaleString(undefined, { minimumFractionDigits: 1, maximumFractionDigits: 2 })
                    : num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

// Fetch analysis and candles
async function loadData() {
  const refreshBtn = document.getElementById('refreshBtn');
  if (refreshBtn) refreshBtn.classList.add('loading');

  try {
    const [analysisRes, candlesRes] = await Promise.all([
      fetch(`/api/analysis?symbol=${currentSymbol}&timeframe=${currentTimeframe}`).then(r => r.json()),
      fetch(`/api/candles?symbol=${currentSymbol}&resolution=${currentTimeframe}&count=90`).then(r => r.json())
    ]);

    if (analysisRes.success) {
      updateAnalysisUI(analysisRes.analysis, analysisRes.history);
      if (candlesRes.success && chartInstance) {
        chartInstance.setData(candlesRes.candles, analysisRes.analysis);
      }
    }
  } catch (error) {
    console.error('Failed to load market data:', error);
  } finally {
    if (refreshBtn) refreshBtn.classList.remove('loading');
    countdown = autoRefreshSec;
  }
}

// Update UI
function updateAnalysisUI(data, history) {
  const { confluence, tradeSetup, currentPrice, ticker, orderbook, indicators, smc, session } = data;

  // 1. Ticker Bar
  document.getElementById('currentPriceDisplay').innerText = '$' + formatPrice(currentPrice);
  if (ticker) {
    const change24h = ((ticker.close - ticker.open) / (ticker.open || 1)) * 100;
    const changeEl = document.getElementById('change24hDisplay');
    changeEl.innerText = `${change24h >= 0 ? '+' : ''}${change24h.toFixed(2)}%`;
    changeEl.className = `stat-value ${change24h >= 0 ? 'green' : 'red'}`;

    document.getElementById('high24hDisplay').innerText = '$' + formatPrice(ticker.high24h);
    document.getElementById('low24hDisplay').innerText = '$' + formatPrice(ticker.low24h);
    document.getElementById('vol24hDisplay').innerText = (ticker.volume24h || 0).toLocaleString();
    document.getElementById('markPriceDisplay').innerText = '$' + formatPrice(ticker.markPrice);
  }

  // 2. Institutional Trading Sessions & Killzones Bar
  if (session) {
    const sessionNameEl = document.getElementById('activeSessionName');
    if (sessionNameEl) sessionNameEl.innerText = session.activeSession || 'STANDARD SESSION';

    const utcEl = document.getElementById('utcClockDisplay');
    const istEl = document.getElementById('istClockDisplay');
    if (utcEl) utcEl.innerText = session.clocks?.utc ? `UTC: ${session.clocks.utc}` : 'UTC: --:--';
    if (istEl) istEl.innerText = session.clocks?.ist ? `IST: ${session.clocks.ist}` : 'IST: --:--';

    // Toggle Session Active Pills
    const pillAsia = document.getElementById('pillAsia');
    const pillLondon = document.getElementById('pillLondon');
    const pillOverlap = document.getElementById('pillOverlap');
    const pillNY = document.getElementById('pillNY');

    if (pillAsia) pillAsia.className = `session-pill ${session.isAsiaActive ? 'active' : ''}`;
    if (pillLondon) pillLondon.className = `session-pill ${session.isLondonActive ? 'active' : ''}`;
    if (pillOverlap) pillOverlap.className = `session-pill overlap ${session.isOverlapActive ? 'active' : ''}`;
    if (pillNY) pillNY.className = `session-pill ${session.isNyActive ? 'active' : ''}`;

    // Asia High / Low Range Display
    const asiaHighEl = document.getElementById('asiaHighDisplay');
    const asiaLowEl = document.getElementById('asiaLowDisplay');
    if (asiaHighEl) asiaHighEl.innerText = session.asiaRange?.high ? '$' + formatPrice(session.asiaRange.high) : '--';
    if (asiaLowEl) asiaLowEl.innerText = session.asiaRange?.low ? '$' + formatPrice(session.asiaRange.low) : '--';

    // Liquidity Sweep Badge
    const sweepBadge = document.getElementById('sessionSweepBadge');
    if (sweepBadge) {
      if (session.liquiditySweep?.hasSweptHigh) {
        sweepBadge.className = 'sweep-badge swept-high';
        sweepBadge.innerText = '⚡ Swept Asia High (Supply Liquidity)';
      } else if (session.liquiditySweep?.hasSweptLow) {
        sweepBadge.className = 'sweep-badge swept-low';
        sweepBadge.innerText = '⚡ Swept Asia Low (Demand Liquidity)';
      } else {
        sweepBadge.className = 'sweep-badge';
        sweepBadge.innerText = 'Asia Range Intact';
      }
    }
  }

  // 3. Big Signal Banner
  const banner = document.getElementById('signalBanner');
  banner.className = `signal-banner ${confluence.signalClass}`;
  document.getElementById('signalBadge').innerText = confluence.signal;

  const scoreSign = confluence.score > 0 ? '+' : '';
  document.getElementById('signalScoreBadge').innerText = `Confluence Score: ${scoreSign}${confluence.score} / 100`;
  document.getElementById('probabilityDisplay').innerText = `Estimated Accuracy: ~${confluence.estimatedProbability}%`;

  // Sound alert on new high-confidence signal
  if (confluence.signal !== lastKnownSignal && confluence.isFullConfirmation) {
    playAlertChime(confluence.biasDirection === 'LONG');
    lastKnownSignal = confluence.signal;
  }

  // 4. Confluence Score Meter
  const bullFill = document.getElementById('meterBullFill');
  const bearFill = document.getElementById('meterBearFill');
  if (confluence.score >= 0) {
    bullFill.style.width = `${confluence.score}%`;
    bearFill.style.width = '0%';
  } else {
    bearFill.style.width = `${Math.abs(confluence.score)}%`;
    bullFill.style.width = '0%';
  }

  // 5. Actionable Trade Setup Box & Strict Confirmation Gatekeeper
  const unconfirmedBox = document.getElementById('unconfirmedNoticeBox');
  const confirmedBox = document.getElementById('confirmedNoticeBox');
  const gateBadge = document.getElementById('tradeSetupGateBadge');
  const missingList = document.getElementById('missingConfirmationsList');
  const tradeBox = document.getElementById('tradeSetupBox');

  const isTradeConfirmed = tradeSetup && tradeSetup.isConfirmed === true && tradeSetup.entryPrice;

  if (isTradeConfirmed) {
    // FULLY CONFIRMED TRADE
    if (unconfirmedBox) unconfirmedBox.style.display = 'none';
    if (confirmedBox) confirmedBox.style.display = 'flex';
    if (gateBadge) {
      gateBadge.innerText = 'GATE: ALL CONFIRMED ✅';
      gateBadge.style.background = 'rgba(0, 192, 118, 0.2)';
      gateBadge.style.color = 'var(--bull-green)';
    }

    tradeBox.style.display = 'block';
    document.getElementById('tradeDirection').innerText = tradeSetup.direction;
    document.getElementById('tradeDirection').className = `trade-row-val ${confluence.biasDirection === 'LONG' ? 'green' : 'red'}`;
    document.getElementById('tradeEntry').innerText = '$' + formatPrice(tradeSetup.entryPrice);
    document.getElementById('tradeSL').innerText = '$' + formatPrice(tradeSetup.stopLoss) + ` (${tradeSetup.riskPercentage}% risk)`;
    document.getElementById('tradeTP1').innerText = '$' + formatPrice(tradeSetup.tp1);
    document.getElementById('tradeTP2').innerText = '$' + formatPrice(tradeSetup.tp2);
    document.getElementById('tradeTP3').innerText = '$' + formatPrice(tradeSetup.tp3);
    document.getElementById('tradeRR').innerText = tradeSetup.riskRewardRatio;
    document.getElementById('invalidationText').innerText = tradeSetup.invalidation;

    // Trigger position calculator refresh
    recalcPositionSize(tradeSetup);
  } else {
    // UNCONFIRMED / NO TRADE (Strict Gatekeeper Active)
    if (confirmedBox) confirmedBox.style.display = 'none';
    if (unconfirmedBox) {
      unconfirmedBox.style.display = 'block';
      if (missingList) {
        const reasons = (tradeSetup && tradeSetup.missingConfirmations) || confluence.missingConfirmations || [];
        if (reasons.length > 0) {
          missingList.innerHTML = reasons.map(r => `<li>${r}</li>`).join('');
        } else {
          missingList.innerHTML = '<li>⏳ Confluence indicators are currently mixed or consolidating.</li>';
        }
      }
    }

    if (gateBadge) {
      gateBadge.innerText = 'GATE: WAITING CONFIRMATION 🛑';
      gateBadge.style.background = 'rgba(239, 68, 68, 0.2)';
      gateBadge.style.color = 'var(--bear-red)';
    }

    tradeBox.style.display = 'block';
    document.getElementById('tradeDirection').innerText = '🛑 WAITING FOR COMPLETE CONFIRMATION';
    document.getElementById('tradeDirection').className = 'trade-row-val red';
    document.getElementById('tradeEntry').innerText = 'No Entry (Strict Gate Active)';
    document.getElementById('tradeSL').innerText = '-- (Pending Setup)';
    document.getElementById('tradeTP1').innerText = '-- (Pending Setup)';
    document.getElementById('tradeTP2').innerText = '-- (Pending Setup)';
    document.getElementById('tradeTP3').innerText = '-- (Pending Setup)';
    document.getElementById('tradeRR').innerText = 'WAITING';
    document.getElementById('invalidationText').innerText = tradeSetup?.invalidation || 'সবকটি স্ট্র্যাটেজি কনফার্ম না হওয়া পর্যন্ত কোনো এন্ট্রি দেওয়া হবে না।';

    // Reset position sizing display to neutral
    recalcPositionSize(null);
  }

  // 5. Render Valid Institutional S/R Zones
  const zonesContainer = document.getElementById('validZonesContainer');
  const zoneStatusBadge = document.getElementById('priceZoneStatusBadge');
  const validZones = smc?.validZones;

  if (zonesContainer && validZones) {
    if (zoneStatusBadge && validZones.priceStatus) {
      zoneStatusBadge.innerText = validZones.priceStatus.replace(/_/g, ' ');
    }

    let zonesHtml = '';

    // Render Resistances (highest first down to closest)
    if (validZones.resistanceZones && validZones.resistanceZones.length > 0) {
      const revRes = validZones.resistanceZones.slice().reverse();
      revRes.forEach((rz, i) => {
        zonesHtml += `
          <div class="zone-item res-zone">
            <div class="zone-header">
              <span style="color: var(--bear-red);">⚔️ R${revRes.length - i} SUPPLY: $${formatPrice(rz.bottom)} - $${formatPrice(rz.top)}</span>
              <span class="zone-badge-pill ${rz.strength === 'STRONG' ? 'strong' : 'mod'}">${rz.touches}x Rejections • ${rz.strength}</span>
            </div>
            <div class="zone-sub">
              <span>+${rz.distanceDollar} (+${rz.distancePct}%) away</span>
              <span style="color: var(--text-muted);">Reversal Short / Take Profit</span>
            </div>
          </div>
        `;
      });
    }

    // Mid Price Marker
    zonesHtml += `
      <div style="display: flex; align-items: center; justify-content: center; gap: 8px; padding: 4px 0; font-size: 11px; font-family: var(--font-mono); color: var(--delta-purple);">
        <span>────</span>
        <b>CURRENT: $${formatPrice(currentPrice)}</b>
        <span>────</span>
      </div>
    `;

    // Render Supports (closest first down to lowest)
    if (validZones.supportZones && validZones.supportZones.length > 0) {
      validZones.supportZones.forEach((sz, i) => {
        zonesHtml += `
          <div class="zone-item sup-zone">
            <div class="zone-header">
              <span style="color: var(--bull-green);">🛡️ S${i + 1} DEMAND: $${formatPrice(sz.bottom)} - $${formatPrice(sz.top)}</span>
              <span class="zone-badge-pill ${sz.strength === 'STRONG' ? 'strong' : 'mod'}">${sz.touches}x Touches • ${sz.strength}</span>
            </div>
            <div class="zone-sub">
              <span>-${sz.distanceDollar} (${sz.distancePct}%) away</span>
              <span style="color: var(--text-muted);">Bounce Long / Stop Floor</span>
            </div>
          </div>
        `;
      });
    }

    zonesContainer.innerHTML = zonesHtml;
  }

  // 6. Confluence Checklist
  const factorsContainer = document.getElementById('confluenceFactors');
  factorsContainer.innerHTML = '';
  confluence.factors.forEach(factor => {
    const item = document.createElement('div');
    item.className = 'confluence-item';

    const badgeClass = factor.status === 'BULLISH' ? 'bullish' : factor.status === 'BEARISH' ? 'bearish' : 'neutral';
    const sign = factor.points > 0 ? '+' : '';

    item.innerHTML = `
      <div class="item-left">
        <div class="item-name">${factor.name}</div>
        <div class="item-detail">${factor.detail}</div>
      </div>
      <div class="item-badge ${badgeClass}">
        ${factor.status} (${sign}${factor.points} pts)
      </div>
    `;
    factorsContainer.appendChild(item);
  });

  // 6. Orderbook Depth Bar
  if (orderbook) {
    const bidPart = document.getElementById('depthBidPart');
    const askPart = document.getElementById('depthAskPart');
    bidPart.style.width = `${orderbook.bidRatio}%`;
    askPart.style.width = `${orderbook.askRatio}%`;
    bidPart.innerText = `${orderbook.bidRatio}% Bids`;
    askPart.innerText = `${orderbook.askRatio}% Asks`;

    // Render Orderbook rows
    renderOrderbookTable(orderbook);
  }

  // 7. Signal History
  if (history && history.length > 0) {
    renderHistoryTable(history);
  }
}

// Render Orderbook
function renderOrderbookTable(ob) {
  const container = document.getElementById('orderbookRows');
  if (!container) return;

  let html = '';
  const count = Math.min(6, Math.max(ob.bids?.length || 0, ob.asks?.length || 0));

  for (let i = 0; i < count; i++) {
    const bid = ob.bids?.[i];
    const ask = ob.asks?.[i];
    html += `
      <tr>
        <td style="color: var(--bull-green)">${bid ? formatPrice(bid.price) : '--'}</td>
        <td style="color: var(--bull-green)">${bid ? bid.size : '--'}</td>
        <td style="color: var(--bear-red); text-align: right">${ask ? formatPrice(ask.price) : '--'}</td>
        <td style="color: var(--bear-red); text-align: right">${ask ? ask.size : '--'}</td>
      </tr>
    `;
  }
  container.innerHTML = html;
}

// Render Signal History
function renderHistoryTable(history) {
  const tbody = document.getElementById('historyTableBody');
  if (!tbody) return;

  tbody.innerHTML = history.map(item => {
    const isBull = item.signal.includes('BUY');
    const color = isBull ? 'var(--bull-green)' : 'var(--bear-red)';
    const timeStr = new Date(item.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    return `
      <tr>
        <td>${timeStr}</td>
        <td><b>${item.symbol}</b></td>
        <td>${item.timeframe}</td>
        <td style="color: ${color}; font-weight: 700;">${item.signal}</td>
        <td>$${formatPrice(item.price)}</td>
        <td>${item.entry ? '$' + formatPrice(item.entry) : '--'}</td>
        <td style="color: var(--bear-red)">${item.sl ? '$' + formatPrice(item.sl) : '--'}</td>
        <td style="color: var(--bull-green)">${item.tp1 ? '$' + formatPrice(item.tp1) : '--'}</td>
      </tr>
    `;
  }).join('');
}

// Dynamic Position Sizing Calculator
function recalcPositionSize(setup) {
  const balance = parseFloat(document.getElementById('calcBalance').value) || 500;
  const riskPct = parseFloat(document.getElementById('calcRisk').value) || 2;
  const leverage = parseFloat(document.getElementById('calcLeverage').value) || 10;

  const dollarRisk = balance * (riskPct / 100);

  if (!setup || !setup.riskDistance || setup.riskDistance <= 0) {
    document.getElementById('calcPosSize').innerText = `$${(dollarRisk * 10).toFixed(0)}`;
    document.getElementById('calcDollarRisk').innerText = `$${dollarRisk.toFixed(2)}`;
    document.getElementById('calcTargetProfit').innerText = `$${(dollarRisk * 2.5).toFixed(2)}`;
    return;
  }

  const contracts = dollarRisk / setup.riskDistance;
  const positionValue = contracts * setup.entryPrice;
  const marginRequired = positionValue / leverage;
  const tp1Profit = contracts * (setup.tp1 - setup.entryPrice);
  const tp2Profit = contracts * (setup.tp2 - setup.entryPrice);

  document.getElementById('calcPosSize').innerText = `${contracts.toFixed(3)} ${currentSymbol.replace('USDT', '').replace('USD', '')} ($${positionValue.toFixed(0)})`;
  document.getElementById('calcDollarRisk').innerText = `$${dollarRisk.toFixed(2)} (${marginRequired.toFixed(1)}$ margin at ${leverage}x)`;
  document.getElementById('calcTargetProfit').innerText = `TP1: +$${Math.abs(tp1Profit).toFixed(1)} | TP2: +$${Math.abs(tp2Profit).toFixed(1)}`;
}

// Setup Event Listeners
function initApp() {
  chartInstance = new window.TradingChart('chartCanvas');

  // Symbol buttons
  document.querySelectorAll('.symbol-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.symbol-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSymbol = btn.dataset.symbol;
      loadData();
    });
  });

  // Timeframe buttons
  document.querySelectorAll('.tf-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tf-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentTimeframe = btn.dataset.tf;
      loadData();
    });
  });

  // Refresh Button
  document.getElementById('refreshBtn').addEventListener('click', () => {
    loadData();
  });

  // Calculator inputs
  ['calcBalance', 'calcRisk', 'calcLeverage'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', () => recalcPositionSize());
  });

  // Audio Toggle
  const audioBtn = document.getElementById('audioToggleBtn');
  if (audioBtn) {
    audioBtn.addEventListener('click', () => {
      audioEnabled = !audioEnabled;
      audioBtn.innerText = audioEnabled ? '🔊 Sound On' : '🔇 Muted';
      audioBtn.style.color = audioEnabled ? 'var(--bull-green)' : 'var(--text-muted)';
    });
  }

  // Telegram Modal Setup
  const tgBtn = document.getElementById('tgSettingsBtn');
  const modal = document.getElementById('tgModal');
  const closeModal = document.getElementById('closeTgModal');

  if (tgBtn && modal) {
    tgBtn.addEventListener('click', () => { modal.style.display = 'flex'; });
    closeModal.addEventListener('click', () => { modal.style.display = 'none'; });
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.style.display = 'none';
    });
  }

  // Save Telegram settings
  document.getElementById('saveTgBtn')?.addEventListener('click', async () => {
    const token = document.getElementById('tgBotToken').value.trim();
    const chatId = document.getElementById('tgChatId').value.trim();

    const res = await fetch('/api/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ telegramBotToken: token, telegramChatId: chatId })
    }).then(r => r.json());

    if (res.success) {
      alert('Telegram settings saved! You can click "Send Test Alert" to verify.');
    }
  });

  // Test Telegram alert
  document.getElementById('testTgBtn')?.addEventListener('click', async () => {
    const token = document.getElementById('tgBotToken').value.trim();
    const chatId = document.getElementById('tgChatId').value.trim();

    const res = await fetch('/api/telegram-test', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, chatId })
    }).then(r => r.json());

    if (res.success) {
      alert('✅ Test alert sent successfully to Telegram!');
    } else {
      alert('❌ Failed: ' + (res.message || 'Check your bot token and chat ID'));
    }
  });

  // Bengali Guide Modal
  const guideBtn = document.getElementById('guideBtn');
  const guideModal = document.getElementById('guideModal');
  const closeGuide = document.getElementById('closeGuideModal');

  if (guideBtn && guideModal) {
    guideBtn.addEventListener('click', () => { guideModal.style.display = 'flex'; });
    closeGuide.addEventListener('click', () => { guideModal.style.display = 'none'; });
    guideModal.addEventListener('click', (e) => {
      if (e.target === guideModal) guideModal.style.display = 'none';
    });
  }

  // Auto-refresh countdown loop
  setInterval(() => {
    countdown--;
    const countEl = document.getElementById('refreshCountdown');
    if (countEl) countEl.innerText = `${countdown}s`;
    if (countdown <= 0) {
      loadData();
    }
  }, 1000);

  // Initial load
  loadData();
}

window.addEventListener('DOMContentLoaded', initApp);
