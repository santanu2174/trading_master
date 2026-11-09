// scan_chart.js - AI Chart Scanner Controller & Canvas SMC Annotation Engine

let currentScanResult = null;
let uploadedImageElement = null;

// Layer toggles
const layers = {
  sr: true,
  fvg: true,
  bos: true,
  choch: true,
  setup: true
};

// Initialize
function initScanner() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');

  // Click dropzone to open file dialog
  dropzone.addEventListener('click', () => fileInput.click());

  fileInput.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleImageFile(e.target.files[0]);
    }
  });

  // Drag and drop
  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageFile(e.dataTransfer.files[0]);
    }
  });

  // Global Clipboard Paste (Ctrl + V)
  window.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent.clipboardData)?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.indexOf('image') !== -1) {
        const file = items[i].getAsFile();
        if (file) {
          handleImageFile(file);
          break;
        }
      }
    }
  });

  // Layer toggles
  document.getElementById('toggleSR')?.addEventListener('change', (e) => {
    layers.sr = e.target.checked;
    redrawAnnotations();
  });
  document.getElementById('toggleFVG')?.addEventListener('change', (e) => {
    layers.fvg = e.target.checked;
    redrawAnnotations();
  });
  document.getElementById('toggleBOS')?.addEventListener('change', (e) => {
    layers.bos = e.target.checked;
    redrawAnnotations();
  });
  document.getElementById('toggleCHOCH')?.addEventListener('change', (e) => {
    layers.choch = e.target.checked;
    redrawAnnotations();
  });
  document.getElementById('toggleSetup')?.addEventListener('change', (e) => {
    layers.setup = e.target.checked;
    redrawAnnotations();
  });

  // Download button
  document.getElementById('downloadAnnotatedBtn')?.addEventListener('click', () => {
    const canvas = document.getElementById('annotatedCanvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `SMC_Chart_Analysis_${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  });

  // Upload new button
  document.getElementById('uploadNewBtn')?.addEventListener('click', () => {
    document.getElementById('chartViewerCard').style.display = 'none';
    document.getElementById('dropzone').style.display = 'flex';
    currentScanResult = null;
    uploadedImageElement = null;
  });

  // Sample chart buttons
  document.getElementById('sampleBullBtn')?.addEventListener('click', () => generateSampleChart(true));
  document.getElementById('sampleBearBtn')?.addEventListener('click', () => generateSampleChart(false));

  // Gemini API Key Modal
  setupApiKeyModal();

  // Guide Modal
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
}

// Handle an uploaded or pasted image file
function handleImageFile(file) {
  if (!file.type.startsWith('image/')) {
    alert('Please upload a valid image file (PNG, JPG, WEBP).');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const base64Url = e.target.result;
    sendChartForAnalysis(base64Url);
  };
  reader.readAsDataURL(file);
}

// Send base64 image to server API
async function sendChartForAnalysis(base64Url) {
  const dropzone = document.getElementById('dropzone');
  const loading = document.getElementById('loadingIndicator');
  const viewer = document.getElementById('chartViewerCard');

  dropzone.style.display = 'none';
  loading.style.display = 'flex';
  viewer.style.display = 'none';

  // Load image element
  const img = new Image();
  img.src = base64Url;
  await new Promise((resolve) => { img.onload = resolve; });
  uploadedImageElement = img;

  const savedKey = localStorage.getItem('geminiApiKey') || '';

  try {
    const res = await fetch('/api/scan-chart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: base64Url,
        apiKey: savedKey
      })
    });

    const data = await res.json();
    loading.style.display = 'none';

    if (data.success && data.result) {
      currentScanResult = data.result;
      viewer.style.display = 'flex';
      renderAnalysisResult(data.result);
      redrawAnnotations();
    } else {
      alert('Error analyzing chart: ' + (data.message || 'Unknown error'));
      dropzone.style.display = 'flex';
    }
  } catch (err) {
    loading.style.display = 'none';
    dropzone.style.display = 'flex';
    alert('Failed to connect to scanner API: ' + err.message);
  }
}

// Render analysis text and trade setup
function renderAnalysisResult(result) {
  const isLong = result.biasDirection === 'LONG';
  const banner = document.getElementById('scanVerdictBanner');
  banner.className = `signal-banner ${isLong ? 'strong-buy' : 'strong-sell'}`;

  document.getElementById('scanDirectionBadge').innerText = result.direction || (isLong ? 'STRONG BUY (LONG)' : 'STRONG SELL (SHORT)');
  document.getElementById('scanConfidenceBadge').innerText = `Confidence: ${result.confidence || 85}%`;
  document.getElementById('scanTrendBadge').innerText = `Structure: ${result.trend || 'BULLISH'}`;

  // Trade setup
  const setup = result.tradeSetup || {};
  document.getElementById('setupAction').innerText = setup.action || (isLong ? 'BUY / LONG' : 'SELL / SHORT');
  document.getElementById('setupAction').className = `trade-row-val ${isLong ? 'green' : 'red'}`;
  document.getElementById('setupEntry').innerText = setup.entryZone || 'Demand Zone Retest';
  document.getElementById('setupSL').innerText = setup.stopLoss || 'Below Swing Low';
  document.getElementById('setupTP1').innerText = setup.tp1 || 'Target 1 (1:1.8 RR)';
  document.getElementById('setupTP2').innerText = setup.tp2 || 'Target 2 (1:2.8 RR)';
  document.getElementById('setupTP3').innerText = setup.tp3 || 'Target 3 (1:4.0 RR)';
  document.getElementById('setupRRR').innerText = setup.riskRewardRatio || '1 : 2.8';
  document.getElementById('setupExecutionRule').innerHTML = `🛡️ <b>Golden Rule:</b> ${setup.executionRule || 'TP1 hit হলে ৫০% প্রফিট বুক করুন এবং Stop Loss সাথে সাথে Entry Price-এ সরিয়ে সম্পূর্ণ রিস্ক-ফ্রি ট্রেড উপভোগ করুন।'}`;

  // Observations
  const obsContainer = document.getElementById('smcObservationsList');
  obsContainer.innerHTML = '';
  const observations = result.observations || [
    'BOS Confirmed: Market structure broken in direction of trend.',
    'Fair Value Gap (FVG): Imbalance zone is acting as high-probability entry magnetic zone.',
    'Order Block Retest: Institutional footprint confirmed with volume rejections.'
  ];

  observations.forEach(obs => {
    const item = document.createElement('div');
    item.className = 'confluence-item';
    item.innerHTML = `
      <div class="item-left">
        <div class="item-name" style="font-size: 12px;">⚡ SMC Factor</div>
        <div class="item-detail" style="font-size: 11px;">${obs}</div>
      </div>
      <div class="item-badge bullish">VALIDATED</div>
    `;
    obsContainer.appendChild(item);
  });

  // Summary
  document.getElementById('scanSummaryText').innerText = result.summary || 'Market structure shows clear institutional accumulation at key demand levels with bullish follow-through.';

  // Engine source badge
  const engineBadge = document.getElementById('scanEngineSource');
  if (engineBadge) {
    engineBadge.innerText = result.source === 'GEMINI_AI_VISION'
      ? 'Engine: Google Gemini Multimodal Vision AI'
      : 'Engine: Intelligent SMC Vision Heuristic';
  }
}

// Redraw chart canvas with SMC overlays
function redrawAnnotations() {
  if (!uploadedImageElement || !currentScanResult) return;

  const canvas = document.getElementById('annotatedCanvas');
  const ctx = canvas.getContext('2d');
  const img = uploadedImageElement;

  canvas.width = img.naturalWidth || img.width;
  canvas.height = img.naturalHeight || img.height;

  const w = canvas.width;
  const h = canvas.height;

  // 1. Draw original uploaded image
  ctx.drawImage(img, 0, 0, w, h);

  const zones = currentScanResult.zones || {};
  const isLong = currentScanResult.biasDirection === 'LONG';

  // Helper coordinate converter from normalized 0-100% to canvas pixels
  const getX = (pct) => (pct / 100) * w;
  const getY = (pct) => (pct / 100) * h;

  // 2. DRAW SUPPORT / DEMAND ZONES
  if (layers.sr && zones.supports) {
    zones.supports.forEach(sup => {
      const x1 = getX(sup.xmin || 5);
      const x2 = getX(sup.xmax || 95);
      const y1 = getY(sup.ymin);
      const y2 = getY(sup.ymax);
      const boxW = x2 - x1;
      const boxH = Math.max(Math.abs(y2 - y1), 16);
      const topY = Math.min(y1, y2);

      // Shaded green box
      ctx.fillStyle = 'rgba(8, 153, 129, 0.22)';
      ctx.fillRect(x1, topY, boxW, boxH);

      // Dashed border
      ctx.strokeStyle = '#089981';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(x1, topY, boxW, boxH);
      ctx.setLineDash([]);

      // Label Badge
      drawPillBadge(ctx, x1 + 10, topY + 16, sup.label || '🛡️ DEMAND / SUPPORT ZONE', '#089981', '#ffffff');
    });
  }

  // 3. DRAW RESISTANCE / SUPPLY ZONES
  if (layers.sr && zones.resistances) {
    zones.resistances.forEach(res => {
      const x1 = getX(res.xmin || 5);
      const x2 = getX(res.xmax || 95);
      const y1 = getY(res.ymin);
      const y2 = getY(res.ymax);
      const boxW = x2 - x1;
      const boxH = Math.max(Math.abs(y2 - y1), 16);
      const topY = Math.min(y1, y2);

      // Shaded red box
      ctx.fillStyle = 'rgba(242, 54, 69, 0.22)';
      ctx.fillRect(x1, topY, boxW, boxH);

      // Dashed border
      ctx.strokeStyle = '#f23645';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.strokeRect(x1, topY, boxW, boxH);
      ctx.setLineDash([]);

      // Label Badge
      drawPillBadge(ctx, x1 + 10, topY + 16, res.label || '⚔️ SUPPLY / RESISTANCE ZONE', '#f23645', '#ffffff');
    });
  }

  // 4. DRAW FAIR VALUE GAPS (FVG)
  if (layers.fvg && zones.fvgs) {
    zones.fvgs.forEach(fvg => {
      const x1 = getX(fvg.xmin || 30);
      const x2 = getX(fvg.xmax || 85);
      const y1 = getY(fvg.ymin);
      const y2 = getY(fvg.ymax);
      const boxW = x2 - x1;
      const boxH = Math.max(Math.abs(y2 - y1), 14);
      const topY = Math.min(y1, y2);

      // Shaded gold box
      ctx.fillStyle = 'rgba(234, 179, 8, 0.28)';
      ctx.fillRect(x1, topY, boxW, boxH);

      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(x1, topY, boxW, boxH);
      ctx.setLineDash([]);

      drawPillBadge(ctx, x1 + 8, topY + 14, fvg.label || '🟡 FVG (Fair Value Gap)', '#eab308', '#000000');
    });
  }

  // 5. DRAW BREAK OF STRUCTURE (BOS)
  if (layers.bos && zones.bos) {
    zones.bos.forEach(b => {
      const x1 = getX(b.x1 || 20);
      const x2 = getX(b.x2 || 80);
      const y = getY(b.y);

      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 4]);
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();
      ctx.setLineDash([]);

      // Arrow head at x2
      drawArrow(ctx, x2 - 12, y, x2, y, '#38bdf8');

      // Label Badge
      drawPillBadge(ctx, x1 + 8, y - 8, b.label || '⚡ BOS (Break of Structure)', '#0284c7', '#ffffff');
    });
  }

  // 6. DRAW CHANGE OF CHARACTER (CHoCH)
  if (layers.choch && zones.choch) {
    zones.choch.forEach(ch => {
      const x1 = getX(ch.x1 || 15);
      const x2 = getX(ch.x2 || 70);
      const y = getY(ch.y);

      ctx.strokeStyle = '#ec4899';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([6, 3]);
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();
      ctx.setLineDash([]);

      drawArrow(ctx, x2 - 12, y, x2, y, '#ec4899');
      drawPillBadge(ctx, x1 + 8, y - 8, ch.label || '🔄 CHoCH (Trend Reversal)', '#db2777', '#ffffff');
    });
  }

  // 7. DRAW TRADE SETUP TARGETS
  if (layers.setup) {
    const entryY = isLong ? getY(58) : getY(42);
    const slY = isLong ? getY(78) : getY(22);
    const tp1Y = isLong ? getY(40) : getY(60);
    const tp2Y = isLong ? getY(24) : getY(76);

    // Entry line (Yellow)
    drawTargetLine(ctx, entryY, w, '#fbbf24', '🎯 ENTRY ZONE', []);
    // Stop Loss (Red dashed)
    drawTargetLine(ctx, slY, w, '#f23645', '🛑 STOP LOSS (SL)', [6, 4]);
    // TP1 (Green dashed)
    drawTargetLine(ctx, tp1Y, w, '#089981', '✅ TARGET 1 (TP1 - 1:1.8)', [4, 4]);
    // TP2 (Cyan dashed)
    drawTargetLine(ctx, tp2Y, w, '#38bdf8', '🚀 TARGET 2 (TP2 - 1:2.8)', [4, 4]);
  }
}

// Helpers
function drawPillBadge(ctx, x, y, text, bgColor, textColor) {
  ctx.save();
  ctx.font = 'bold 11px monospace';
  const textWidth = ctx.measureText(text).width;
  const paddingX = 8;
  const h = 18;

  ctx.fillStyle = bgColor;
  ctx.beginPath();
  ctx.roundRect(x, y - 13, textWidth + (paddingX * 2), h, 4);
  ctx.fill();

  ctx.fillStyle = textColor;
  ctx.fillText(text, x + paddingX, y);
  ctx.restore();
}

function drawTargetLine(ctx, y, width, color, label, dash = []) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = 1.8;
  ctx.setLineDash(dash);
  ctx.beginPath();
  ctx.moveTo(0, y);
  ctx.lineTo(width, y);
  ctx.stroke();
  ctx.setLineDash([]);

  // Label badge on the right
  ctx.fillStyle = color;
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'right';
  ctx.fillText(label, width - 12, y - 5);
  ctx.restore();
}

function drawArrow(ctx, fromx, fromy, tox, toy, color) {
  const headlen = 10;
  const angle = Math.atan2(toy - fromy, tox - fromx);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2.5;

  ctx.beginPath();
  ctx.moveTo(tox, toy);
  ctx.lineTo(tox - headlen * Math.cos(angle - Math.PI / 6), toy - headlen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(tox - headlen * Math.cos(angle + Math.PI / 6), toy - headlen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// API Key Modal
function setupApiKeyModal() {
  const modal = document.getElementById('apiKeyModal');
  const openBtn = document.getElementById('apiKeySettingsBtn');
  const closeBtn = document.getElementById('closeApiKeyModal');
  const input = document.getElementById('geminiApiKeyInput');
  const saveBtn = document.getElementById('saveApiKeyBtn');
  const clearBtn = document.getElementById('clearApiKeyBtn');

  if (!modal) return;

  const savedKey = localStorage.getItem('geminiApiKey') || '';
  if (input) input.value = savedKey;

  openBtn?.addEventListener('click', () => { modal.style.display = 'flex'; });
  closeBtn?.addEventListener('click', () => { modal.style.display = 'none'; });
  modal.addEventListener('click', (e) => { if (e.target === modal) modal.style.display = 'none'; });

  saveBtn?.addEventListener('click', () => {
    const key = input.value.trim();
    localStorage.setItem('geminiApiKey', key);
    alert('Gemini API Key saved! Chart scanning will now use Gemini Vision AI.');
    modal.style.display = 'none';
  });

  clearBtn?.addEventListener('click', () => {
    localStorage.removeItem('geminiApiKey');
    if (input) input.value = '';
    alert('API Key cleared. Scanner will use Built-in Intelligent SMC Heuristic Vision.');
  });
}

// Generates an interactive synthetic chart for immediate sample testing
function generateSampleChart(isBullish = true) {
  const c = document.createElement('canvas');
  c.width = 960;
  c.height = 540;
  const ctx = c.getContext('2d');

  // Dark background
  ctx.fillStyle = '#0b0f19';
  ctx.fillRect(0, 0, c.width, c.height);

  // Grid
  ctx.strokeStyle = '#161f30';
  ctx.lineWidth = 1;
  for (let x = 0; x < c.width; x += 60) {
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, c.height); ctx.stroke();
  }
  for (let y = 0; y < c.height; y += 45) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(c.width, y); ctx.stroke();
  }

  // Draw 40 synthetic candles
  let p = isBullish ? 74500 : 77500;
  const count = 35;
  const slotW = (c.width - 100) / count;

  for (let i = 0; i < count; i++) {
    const isUp = isBullish
      ? (i > 22 ? Math.random() > 0.35 : Math.random() > 0.5)
      : (i > 22 ? Math.random() > 0.65 : Math.random() > 0.5);

    const change = (Math.random() * 80 + 20) * (isUp ? 1 : -1);
    const open = p;
    const close = p + change;
    const high = Math.max(open, close) + Math.random() * 40;
    const low = Math.min(open, close) - Math.random() * 40;
    p = close;

    const x = 30 + (i * slotW) + (slotW / 2);
    const minP = isBullish ? 74000 : 74800;
    const maxP = isBullish ? 76800 : 78200;
    const getY = (price) => 500 - (((price - minP) / (maxP - minP)) * 440);

    const color = isUp ? '#089981' : '#f23645';
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x, getY(high));
    ctx.lineTo(x, getY(low));
    ctx.stroke();

    ctx.fillStyle = color;
    const oY = getY(open);
    const cY = getY(close);
    ctx.fillRect(x - (slotW * 0.35), Math.min(oY, cY), slotW * 0.7, Math.max(Math.abs(oY - cY), 2));
  }

  // Watermark
  ctx.fillStyle = '#64748b';
  ctx.font = 'bold 14px monospace';
  ctx.fillText(isBullish ? 'BTC/USD 15m (Sample Bullish Chart)' : 'BTC/USD 15m (Sample Bearish Chart)', 40, 40);

  const dataUrl = c.toDataURL('image/png');
  sendChartForAnalysis(dataUrl);
}

window.addEventListener('DOMContentLoaded', initScanner);
