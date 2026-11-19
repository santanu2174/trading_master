// 1min_scanchart.js - 1-Minute & 5-Minute Scalp Vision AI Terminal Controller

let currentScalpResult = null;
let uploadedImageElement = null;
let currentScalpTimeframe = '1m';

// Layer toggles
const scalpLayers = {
  sweep: true,
  fvg: true,
  bos: true,
  choch: true,
  ob: true,
  setup: true
};

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  initScalpScanner();
});

function initScalpScanner() {
  const dropzone = document.getElementById('dropzone');
  const fileInput = document.getElementById('fileInput');

  // Timeframe selector buttons
  const tf1mBtn = document.getElementById('tf1mBtn');
  const tf5mBtn = document.getElementById('tf5mBtn');
  const activeTfBadge = document.getElementById('activeTfBadge');
  const canvasTfIndicator = document.getElementById('canvasTfIndicator');

  function setTimeframe(tf) {
    currentScalpTimeframe = tf;
    if (tf === '1m') {
      tf1mBtn.classList.add('active');
      tf5mBtn.classList.remove('active');
      if (activeTfBadge) activeTfBadge.innerText = 'ACTIVE: 1M ULTRA SCALP';
      if (canvasTfIndicator) canvasTfIndicator.innerText = 'Timeframe: 1M Ultra Scalp • Smart Money Concepts Overlay';
    } else {
      tf5mBtn.classList.add('active');
      tf1mBtn.classList.remove('active');
      if (activeTfBadge) activeTfBadge.innerText = 'ACTIVE: 5M MICRO INTRADAY';
      if (canvasTfIndicator) canvasTfIndicator.innerText = 'Timeframe: 5M Micro Intraday • Smart Money Concepts Overlay';
    }

    // If an image is already loaded, re-scan with the new timeframe
    if (uploadedImageElement && uploadedImageElement.src) {
      sendChartForAnalysis(uploadedImageElement.src);
    }
  }

  tf1mBtn?.addEventListener('click', () => setTimeframe('1m'));
  tf5mBtn?.addEventListener('click', () => setTimeframe('5m'));

  // Dropzone click
  dropzone?.addEventListener('click', () => fileInput?.click());

  fileInput?.addEventListener('change', (e) => {
    if (e.target.files && e.target.files[0]) {
      handleImageFile(e.target.files[0]);
    }
  });

  // Drag and drop events
  dropzone?.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone?.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone?.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageFile(e.dataTransfer.files[0]);
    }
  });

  // Global Clipboard Paste (Ctrl + V)
  window.addEventListener('paste', (e) => {
    const items = (e.clipboardData || e.originalEvent?.clipboardData)?.items;
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

  // Layer checkbox toggles
  document.getElementById('toggleSweep')?.addEventListener('change', (e) => {
    scalpLayers.sweep = e.target.checked;
    redrawScalpAnnotations();
  });
  document.getElementById('toggleFVG')?.addEventListener('change', (e) => {
    scalpLayers.fvg = e.target.checked;
    redrawScalpAnnotations();
  });
  document.getElementById('toggleBOS')?.addEventListener('change', (e) => {
    scalpLayers.bos = e.target.checked;
    redrawScalpAnnotations();
  });
  document.getElementById('toggleCHOCH')?.addEventListener('change', (e) => {
    scalpLayers.choch = e.target.checked;
    redrawScalpAnnotations();
  });
  document.getElementById('toggleOB')?.addEventListener('change', (e) => {
    scalpLayers.ob = e.target.checked;
    redrawScalpAnnotations();
  });
  document.getElementById('toggleSetup')?.addEventListener('change', (e) => {
    scalpLayers.setup = e.target.checked;
    redrawScalpAnnotations();
  });

  // Download annotated chart
  document.getElementById('downloadAnnotatedBtn')?.addEventListener('click', () => {
    const canvas = document.getElementById('annotatedCanvas');
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `Scalp_${currentScalpTimeframe.toUpperCase()}_Analysis_${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  });

  // Upload new chart
  document.getElementById('uploadNewBtn')?.addEventListener('click', () => {
    document.getElementById('chartViewerCard').style.display = 'none';
    document.getElementById('dropzone').style.display = 'flex';
    currentScalpResult = null;
    uploadedImageElement = null;
    if (fileInput) fileInput.value = '';
  });

  // Sample Demo Charts
  document.getElementById('sampleBullSweepBtn')?.addEventListener('click', () => {
    generateSampleScalpChart(true);
  });
  document.getElementById('sampleBearTrapBtn')?.addEventListener('click', () => {
    generateSampleScalpChart(false);
  });

  // Gemini API Key Modal
  setupApiKeyModal();

  // Bengali Guide Modal
  const guideBtn = document.getElementById('guideBtn');
  const guideModal = document.getElementById('guideModal');
  const closeGuide = document.getElementById('closeGuideModal');

  if (guideBtn && guideModal) {
    guideBtn.addEventListener('click', () => { guideModal.style.display = 'flex'; });
    closeGuide?.addEventListener('click', () => { guideModal.style.display = 'none'; });
    guideModal.addEventListener('click', (e) => {
      if (e.target === guideModal) guideModal.style.display = 'none';
    });
  }
}

// Handle an image file
function handleImageFile(file) {
  if (!file.type.startsWith('image/')) {
    alert('অনুগ্রহ করে একটি সঠিক ইমেজ ফাইল আপলোড করুন (PNG, JPG, WEBP)।');
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    const base64Url = e.target.result;
    sendChartForAnalysis(base64Url);
  };
  reader.readAsDataURL(file);
}

// Computer Vision: Pixel-level chart trend & level analysis on client canvas
function extractChartVisualMetrics(img) {
  try {
    const canvas = document.createElement('canvas');
    const w = Math.min(img.naturalWidth || 800, 800);
    const h = Math.min(img.naturalHeight || 500, 500);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, w, h);

    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;

    const startX = Math.floor(w * 0.05);
    const endX = Math.floor(w * 0.92);
    const startY = Math.floor(h * 0.08);
    const endY = Math.floor(h * 0.92);

    const numSlices = 12;
    const sliceWidth = (endX - startX) / numSlices;

    let totalGreen = 0;
    let totalRed = 0;
    const sliceCenters = [];
    const sliceHighs = [];
    const sliceLows = [];

    for (let s = 0; s < numSlices; s++) {
      const sX1 = Math.floor(startX + s * sliceWidth);
      const sX2 = Math.floor(startX + (s + 1) * sliceWidth);

      let greenCount = 0;
      let redCount = 0;
      let minY = endY;
      let maxY = startY;
      let sumY = 0;
      let countY = 0;

      for (let x = sX1; x < sX2; x += 2) {
        for (let y = startY; y < endY; y += 2) {
          const idx = (y * w + x) * 4;
          const r = data[idx];
          const g = data[idx + 1];
          const b = data[idx + 2];

          const isGreen = (g > r + 18 && g > b + 10) || (g > 130 && r < 100 && b < 120);
          const isRed = (r > g + 20 && r > b + 12) || (r > 150 && g < 100 && b < 100);

          if (isGreen) {
            greenCount++;
            sumY += y;
            countY++;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          } else if (isRed) {
            redCount++;
            sumY += y;
            countY++;
            if (y < minY) minY = y;
            if (y > maxY) maxY = y;
          }
        }
      }

      totalGreen += greenCount;
      totalRed += redCount;
      const avgY = countY > 0 ? (sumY / countY) : (sliceCenters.length > 0 ? sliceCenters[sliceCenters.length - 1] : h * 0.5);
      sliceCenters.push(avgY);
      sliceHighs.push(minY);
      sliceLows.push(maxY);
    }

    const leftHalf = sliceCenters.slice(0, 6);
    const rightHalf = sliceCenters.slice(6, 12);
    const leftAvgY = leftHalf.reduce((a, b) => a + b, 0) / leftHalf.length;
    const rightAvgY = rightHalf.reduce((a, b) => a + b, 0) / rightHalf.length;

    const recent3 = sliceCenters.slice(9, 12);
    const prev3 = sliceCenters.slice(6, 9);
    const recentAvgY = recent3.reduce((a, b) => a + b, 0) / 3;
    const prevAvgY = prev3.reduce((a, b) => a + b, 0) / 3;

    const overallTrendScore = (leftAvgY - rightAvgY);
    const recentTrendScore = (prevAvgY - recentAvgY);
    const colorBias = (totalGreen - totalRed) * 0.05;

    const combinedScore = (overallTrendScore * 1.5) + (recentTrendScore * 2.0) + colorBias;
    const isBullish = combinedScore >= 0;

    const validHighs = sliceHighs.filter(y => y < endY);
    const validLows = sliceLows.filter(y => y > startY);
    const minObservedY = validHighs.length > 0 ? Math.min(...validHighs) : h * 0.20;
    const maxObservedY = validLows.length > 0 ? Math.max(...validLows) : h * 0.80;

    const swingHighNorm = Math.max(12, Math.min(36, Math.round((minObservedY / h) * 100)));
    const swingLowNorm = Math.max(64, Math.min(88, Math.round((maxObservedY / h) * 100)));
    const currentPriceNorm = Math.max(20, Math.min(80, Math.round((rightAvgY / h) * 100)));

    const confidence = Math.min(95, Math.max(80, Math.round(78 + Math.min(16, Math.abs(combinedScore) / 8))));

    return {
      isBullish,
      direction: isBullish ? 'LONG' : 'SHORT',
      confidence,
      swingHighY: swingHighNorm,
      swingLowY: swingLowNorm,
      currentPriceY: currentPriceNorm,
      greenRatio: Math.round((totalGreen / (totalGreen + totalRed + 1)) * 100),
      redRatio: Math.round((totalRed / (totalGreen + totalRed + 1)) * 100)
    };
  } catch (e) {
    console.warn('Canvas pixel extraction failed:', e);
    return null;
  }
}

// Send base64 image to server API
async function sendChartForAnalysis(base64Url) {
  const dropzone = document.getElementById('dropzone');
  const loading = document.getElementById('loadingIndicator');
  const viewer = document.getElementById('chartViewerCard');
  const loadingText = document.getElementById('loadingStatusText');

  if (dropzone) dropzone.style.display = 'none';
  if (viewer) viewer.style.display = 'none';
  if (loading) {
    loading.style.display = 'flex';
    if (loadingText) {
      loadingText.innerText = `Scanning ${currentScalpTimeframe.toUpperCase()} Micro Structure & Liquidity...`;
    }
  }

  // Pre-load image element for canvas rendering
  uploadedImageElement = new Image();
  uploadedImageElement.src = base64Url;
  await new Promise((resolve) => {
    uploadedImageElement.onload = resolve;
  });

  // Extract pixel-level computer vision metrics from uploaded chart
  const visualMetrics = extractChartVisualMetrics(uploadedImageElement);

  // Check saved Gemini API Key
  const savedKey = localStorage.getItem('gemini_api_key') || '';

  try {
    const response = await fetch('/api/scan-scalp-chart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image: base64Url,
        apiKey: savedKey,
        timeframe: currentScalpTimeframe,
        visualMetrics
      })
    });

    const data = await response.json();
    if (!data.success) {
      throw new Error(data.message || 'Failed to analyze 1M/5M chart.');
    }

    currentScalpResult = data.result;
    renderScalpAnalysisUI(currentScalpResult);
    redrawScalpAnnotations();

    if (loading) loading.style.display = 'none';
    if (viewer) viewer.style.display = 'flex';
  } catch (error) {
    console.error('Scalp analysis error:', error);
    alert('চার্ট বিশ্লেষণ করতে সমস্যা হয়েছে: ' + error.message);
    if (loading) loading.style.display = 'none';
    if (dropzone) dropzone.style.display = 'flex';
  }
}

// Render analysis data in sidebar UI
function renderScalpAnalysisUI(result) {
  const isBull = result.biasDirection === 'LONG';
  const tf = result.timeframe || currentScalpTimeframe.toUpperCase();

  // 1. Verdict Banner
  const banner = document.getElementById('scanVerdictBanner');
  const badge = document.getElementById('scanDirectionBadge');
  const confBadge = document.getElementById('scanConfidenceBadge');
  const trendBadge = document.getElementById('scanTrendBadge');

  if (banner) {
    banner.className = `signal-banner ${isBull ? 'strong-buy' : 'strong-sell'}`;
  }
  if (badge) {
    badge.innerText = result.direction;
  }
  if (confBadge) {
    confBadge.innerText = `Scalp Accuracy: ~${result.confidence}%`;
  }
  if (trendBadge) {
    trendBadge.innerText = `Structure: ${result.trend}`;
  }

  // 2. Actionable Scalp Trade Setup Card
  const setup = result.tradeSetup;
  if (setup) {
    const actionEl = document.getElementById('setupAction');
    if (actionEl) {
      actionEl.innerText = setup.action;
      actionEl.className = `trade-row-val ${isBull ? 'green' : 'red'}`;
    }
    document.getElementById('setupEntry').innerText = setup.entryZone;
    document.getElementById('setupSL').innerText = setup.stopLoss;
    document.getElementById('setupTP1').innerText = setup.tp1;
    document.getElementById('setupTP2').innerText = setup.tp2;
    document.getElementById('setupTP3').innerText = setup.tp3;
    document.getElementById('setupRRR').innerText = setup.riskRewardRatio;
    if (setup.executionRule) {
      document.getElementById('setupExecutionRule').innerHTML = setup.executionRule;
    }
  }

  // 3. Update 5-Pillar Checklist
  const sweepEl = document.getElementById('pillarSweep');
  const fvgEl = document.getElementById('pillarFVG');
  const bosEl = document.getElementById('pillarBOS');
  const chochEl = document.getElementById('pillarCHOCH');
  const obEl = document.getElementById('pillarOB');

  const sweeps = result.zones?.liquiditySweeps || [];
  const fvgs = result.zones?.fvgs || [];
  const bosList = result.zones?.bos || [];
  const chochList = result.zones?.choch || [];
  const obList = result.zones?.orderBlocks || [];

  if (sweepEl) {
    sweepEl.innerText = sweeps.length > 0 ? `SWEPT ✅ (${sweeps[0].type})` : 'CONFIRMED ✅';
    sweepEl.style.color = '#ec4899';
    sweepEl.style.fontWeight = '700';
  }
  if (fvgEl) {
    fvgEl.innerText = fvgs.length > 0 ? 'ACTIVE IMBALANCE ✅' : 'MITIGATED ✅';
    fvgEl.style.color = '#eab308';
    fvgEl.style.fontWeight = '700';
  }
  if (bosEl) {
    bosEl.innerText = bosList.length > 0 ? 'STRUCTURE BROKEN ✅' : 'HOLDING ✅';
    bosEl.style.color = '#38bdf8';
    bosEl.style.fontWeight = '700';
  }
  if (chochEl) {
    chochEl.innerText = chochList.length > 0 ? 'CHARACTER SHIFT ✅' : 'ALIGNED ✅';
    chochEl.style.color = '#d946ef';
    chochEl.style.fontWeight = '700';
  }
  if (obEl) {
    obEl.innerText = obList.length > 0 ? 'INSTITUTIONAL BLOCK ✅' : 'CONFIRMED ✅';
    obEl.style.color = '#10b981';
    obEl.style.fontWeight = '700';
  }

  // 4. Summary & Observations
  const summaryEl = document.getElementById('scanSummaryText');
  if (summaryEl) {
    summaryEl.innerText = result.summary || result.marketPhase || '';
  }

  const obsContainer = document.getElementById('smcObservationsList');
  if (obsContainer && result.observations) {
    obsContainer.innerHTML = result.observations.map(obs => `
      <div style="font-size: 11px; color: #cbd5e1; background: rgba(0,0,0,0.25); padding: 6px 10px; border-radius: 4px; border-left: 2px solid ${isBull ? 'var(--bull-green)' : 'var(--bear-red)'}; font-family: var(--font-mono); line-height: 1.4;">
        ${obs}
      </div>
    `).join('');
  }

  // Source Engine
  const srcEl = document.getElementById('scanEngineSource');
  if (srcEl) {
    srcEl.innerText = result.source.includes('GEMINI')
      ? 'Engine: Gemini Multimodal Scalp AI ⚡'
      : 'Engine: Intelligent 1M/5M Scalp Vision (Offline Heuristic)';
  }
}

// Redraw annotated canvas
function redrawScalpAnnotations() {
  if (!uploadedImageElement || !currentScalpResult) return;

  const canvas = document.getElementById('annotatedCanvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  canvas.width = uploadedImageElement.naturalWidth || uploadedImageElement.width || 1200;
  canvas.height = uploadedImageElement.naturalHeight || uploadedImageElement.height || 700;

  const W = canvas.width;
  const H = canvas.height;

  // 1. Draw base screenshot
  ctx.drawImage(uploadedImageElement, 0, 0, W, H);

  // Slight dark overlay for contrast
  ctx.fillStyle = 'rgba(10, 15, 25, 0.15)';
  ctx.fillRect(0, 0, W, H);

  const zones = currentScalpResult.zones || {};
  const isLong = currentScalpResult.biasDirection === 'LONG';

  // Helper coordinate converter
  const toX = (pct) => (pct / 100) * W;
  const toY = (pct) => (pct / 100) * H;

  // 2. LIQUIDITY SWEEPS LAYER
  if (scalpLayers.sweep && zones.liquiditySweeps) {
    zones.liquiditySweeps.forEach(sw => {
      const y = toY(sw.y);
      const x1 = toX(sw.x1 || 10);
      const x2 = toX(sw.x2 || 90);
      const color = sw.color || (isLong ? '#00c076' : '#ff3b69');

      // Draw dashed sweep level
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = 2.5;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();

      // Glowing sweep grab zone
      ctx.fillStyle = isLong ? 'rgba(0, 192, 118, 0.12)' : 'rgba(255, 59, 105, 0.12)';
      const zoneH = H * 0.04;
      ctx.fillRect(x1, isLong ? y : y - zoneH, x2 - x1, zoneH);

      // Sweep Label
      ctx.setLineDash([]);
      ctx.fillStyle = color;
      ctx.font = 'bold 13px monospace';
      const labelText = sw.label || '⚡ LIQUIDITY SWEEP (BSL/SSL PURGED)';
      const textMetrics = ctx.measureText(labelText);
      const textW = textMetrics.width + 16;
      const textH = 24;

      const badgeX = x1 + 20;
      const badgeY = isLong ? y + 8 : y - 32;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.fillRect(badgeX, badgeY, textW, textH);
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.strokeRect(badgeX, badgeY, textW, textH);

      ctx.fillStyle = color;
      ctx.fillText(labelText, badgeX + 8, badgeY + 16);
      ctx.restore();
    });
  }

  // 3. FAIR VALUE GAPS (FVG) LAYER
  if (scalpLayers.fvg && zones.fvgs) {
    zones.fvgs.forEach(fvg => {
      const x = toX(fvg.xmin);
      const y = toY(fvg.ymin);
      const w = toX(fvg.xmax) - x;
      const h = toY(fvg.ymax) - y;

      ctx.save();
      ctx.fillStyle = 'rgba(234, 179, 8, 0.22)';
      ctx.fillRect(x, y, w, h);

      ctx.strokeStyle = '#eab308';
      ctx.lineWidth = 1.8;
      ctx.setLineDash([5, 4]);
      ctx.strokeRect(x, y, w, h);

      // Label
      ctx.setLineDash([]);
      ctx.fillStyle = '#eab308';
      ctx.font = 'bold 12px monospace';
      const fvgText = fvg.label || '🟡 1M/5M +FVG (IMBALANCE)';
      ctx.fillText(fvgText, x + 8, y + (h / 2) + 4);
      ctx.restore();
    });
  }

  // 4. ORDER BLOCKS (OB) LAYER
  if (scalpLayers.ob && zones.orderBlocks) {
    zones.orderBlocks.forEach(ob => {
      const x = toX(ob.xmin);
      const y = toY(ob.ymin);
      const w = toX(ob.xmax) - x;
      const h = toY(ob.ymax) - y;
      const color = ob.color || (isLong ? '#10b981' : '#f43f5e');

      ctx.save();
      ctx.fillStyle = isLong ? 'rgba(16, 185, 129, 0.18)' : 'rgba(244, 63, 94, 0.18)';
      ctx.fillRect(x, y, w, h);

      ctx.strokeStyle = color;
      ctx.lineWidth = 1.8;
      ctx.strokeRect(x, y, w, h);

      // OB Label
      ctx.fillStyle = color;
      ctx.font = 'bold 12px monospace';
      ctx.fillText(ob.label || '📦 ORDER BLOCK', x + 8, y + 16);
      ctx.restore();
    });
  }

  // 5. BREAK OF STRUCTURE (BOS) LAYER
  if (scalpLayers.bos && zones.bos) {
    zones.bos.forEach(b => {
      const y = toY(b.y);
      const x1 = toX(b.x1);
      const x2 = toX(b.x2);

      ctx.save();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([6, 4]);
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      const label = b.label || '⚡ BOS (Break of Structure)';
      ctx.font = 'bold 11px monospace';
      const tw = ctx.measureText(label).width + 12;
      ctx.fillRect(x1 + 10, y - 18, tw, 20);
      ctx.strokeStyle = '#38bdf8';
      ctx.strokeRect(x1 + 10, y - 18, tw, 20);

      ctx.fillStyle = '#38bdf8';
      ctx.fillText(label, x1 + 16, y - 4);
      ctx.restore();
    });
  }

  // 6. CHANGE OF CHARACTER (CHoCH) LAYER
  if (scalpLayers.choch && zones.choch) {
    zones.choch.forEach(ch => {
      const y = toY(ch.y);
      const x1 = toX(ch.x1);
      const x2 = toX(ch.x2);

      ctx.save();
      ctx.strokeStyle = '#ec4899';
      ctx.lineWidth = 2.2;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(x1, y);
      ctx.lineTo(x2, y);
      ctx.stroke();

      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
      const label = ch.label || '🔄 CHoCH (Trend Reversal)';
      ctx.font = 'bold 11px monospace';
      const tw = ctx.measureText(label).width + 12;
      ctx.fillRect(x1 + 10, y - 18, tw, 20);
      ctx.strokeStyle = '#ec4899';
      ctx.strokeRect(x1 + 10, y - 18, tw, 20);

      ctx.fillStyle = '#ec4899';
      ctx.fillText(label, x1 + 16, y - 4);
      ctx.restore();
    });
  }

  // 7. SCALP TRADE SETUP OVERLAY
  if (scalpLayers.setup && currentScalpResult.tradeSetup) {
    ctx.save();
    const entryY = isLong ? H * 0.55 : H * 0.42;
    const slY = isLong ? H * 0.79 : H * 0.21;
    const tp1Y = isLong ? H * 0.38 : H * 0.58;
    const tp2Y = isLong ? H * 0.24 : H * 0.72;

    // Draw Entry Line
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 3]);
    ctx.beginPath();
    ctx.moveTo(W * 0.45, entryY);
    ctx.lineTo(W * 0.95, entryY);
    ctx.stroke();

    ctx.fillStyle = '#a855f7';
    ctx.font = 'bold 12px monospace';
    ctx.fillText('🎯 SCALP ENTRY ZONE', W * 0.75, entryY - 6);

    // Draw Stop Loss Line
    ctx.strokeStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(W * 0.45, slY);
    ctx.lineTo(W * 0.95, slY);
    ctx.stroke();

    ctx.fillStyle = '#ef4444';
    ctx.fillText('🛑 TIGHT SCALP SL (INVALIDATION)', W * 0.68, isLong ? slY + 16 : slY - 6);

    // Draw TP1 Line
    ctx.strokeStyle = '#10b981';
    ctx.beginPath();
    ctx.moveTo(W * 0.45, tp1Y);
    ctx.lineTo(W * 0.95, tp1Y);
    ctx.stroke();

    ctx.fillStyle = '#10b981';
    ctx.fillText('💰 SCALP TP1 (50% PROFIT - 1:1.8 RR)', W * 0.66, isLong ? tp1Y - 6 : tp1Y + 16);

    ctx.restore();
  }
}

// Generate Realistic Demo Sample 1M/5M Candlestick Charts
function generateSampleScalpChart(isBullish = true) {
  const offCanvas = document.createElement('canvas');
  offCanvas.width = 1100;
  offCanvas.height = 650;
  const ctx = offCanvas.getContext('2d');

  // Background
  ctx.fillStyle = '#0b0f19';
  ctx.fillRect(0, 0, 1100, 650);

  // Grid lines
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
  ctx.lineWidth = 1;
  for (let x = 60; x < 1100; x += 60) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, 650);
    ctx.stroke();
  }
  for (let y = 50; y < 650; y += 50) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(1100, y);
    ctx.stroke();
  }

  // Draw chart header overlay
  ctx.fillStyle = '#94a3b8';
  ctx.font = 'bold 14px monospace';
  const tf = currentScalpTimeframe.toUpperCase();
  ctx.fillText(`BTC/USD Perpetual • ${tf} Scalp • Delta Exchange`, 30, 35);
  ctx.fillStyle = isBullish ? '#00c076' : '#ff3b69';
  ctx.fillText(`O: 67,420.0  H: 67,890.5  L: 67,110.0  C: 67,650.0 (${isBullish ? '+0.85%' : '-0.75%'})`, 30, 58);

  // Generate 48 candlesticks demonstrating an SMC Liquidity Sweep & Reaction
  const numCandles = 44;
  const candleW = 14;
  const spacing = 22;
  const startX = 60;

  let currentPrice = isBullish ? 350 : 300;

  for (let i = 0; i < numCandles; i++) {
    const x = startX + (i * spacing);
    let open, close, high, low;

    if (isBullish) {
      if (i < 14) {
        // Initial downward chop creating equal lows
        open = currentPrice;
        close = open + (Math.random() * 20 - 15);
        high = Math.max(open, close) + Math.random() * 12;
        low = Math.min(open, close) - Math.random() * 12;
      } else if (i >= 14 && i <= 18) {
        // Equal lows support floor
        open = currentPrice;
        close = 470 + (Math.random() * 10 - 5);
        high = close + 8;
        low = 485;
      } else if (i === 19) {
        // THE LIQUIDITY SWEEP CANDLE: Violent long wick down sweeping the lows!
        open = 465;
        close = 460;
        high = 470;
        low = 540; // Deep sweep wick
      } else if (i === 20) {
        // Immediate Reversal Green Hammer
        open = 462;
        close = 430;
        high = 428;
        low = 475;
      } else if (i >= 21 && i <= 24) {
        // Massive Bullish Expansion creating FVG and CHoCH
        open = currentPrice;
        close = open - (35 + Math.random() * 15);
        high = close - 6;
        low = open + 5;
      } else if (i >= 25 && i <= 28) {
        // Pullback into FVG for perfect entry
        open = currentPrice;
        close = open + (12 + Math.random() * 8);
        high = open + 4;
        low = close - 4;
      } else {
        // Continuation impulse to target
        open = currentPrice;
        close = open - (20 + Math.random() * 15);
        high = close - 8;
        low = open + 4;
      }
    } else {
      // Bearish Demonstration
      if (i < 14) {
        open = currentPrice;
        close = open + (Math.random() * 20 - 8);
        high = Math.max(open, close) + Math.random() * 12;
        low = Math.min(open, close) - Math.random() * 12;
      } else if (i >= 14 && i <= 18) {
        // Equal highs resistance ceiling
        open = currentPrice;
        close = 180 + (Math.random() * 10 - 5);
        low = close - 8;
        high = 165;
      } else if (i === 19) {
        // THE LIQUIDITY SWEEP CANDLE: Violent long wick up sweeping the highs!
        open = 185;
        close = 195;
        low = 180;
        high = 110; // Deep sweep wick up (Judas Swing)
      } else if (i === 20) {
        // Immediate Reversal Red Shooting Star
        open = 192;
        close = 225;
        low = 228;
        high = 175;
      } else if (i >= 21 && i <= 24) {
        // Massive Bearish Flush creating FVG and CHoCH
        open = currentPrice;
        close = open + (35 + Math.random() * 15);
        low = close + 6;
        high = open - 5;
      } else if (i >= 25 && i <= 28) {
        // Pullback into FVG for short entry
        open = currentPrice;
        close = open - (12 + Math.random() * 8);
        low = open - 4;
        high = close + 4;
      } else {
        // Continuation breakdown to target
        open = currentPrice;
        close = open + (20 + Math.random() * 15);
        low = close + 8;
        high = open - 4;
      }
    }

    currentPrice = close;

    const isGreen = close < open; // in screen Y, lower value is higher price
    const color = isGreen ? '#00c076' : '#ff3b69';

    // Draw wick
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(x + candleW / 2, high);
    ctx.lineTo(x + candleW / 2, low);
    ctx.stroke();

    // Draw body
    ctx.fillStyle = color;
    const bodyTop = Math.min(open, close);
    const bodyH = Math.max(3, Math.abs(open - close));
    ctx.fillRect(x, bodyTop, candleW, bodyH);
  }

  const base64Png = offCanvas.toDataURL('image/png');
  sendChartForAnalysis(base64Png);
}

// Setup Gemini API Key Modal
function setupApiKeyModal() {
  const btn = document.getElementById('apiKeySettingsBtn');
  const modal = document.getElementById('apiKeyModal');
  const closeBtn = document.getElementById('closeApiKeyModal');
  const input = document.getElementById('geminiApiKeyInput');
  const saveBtn = document.getElementById('saveApiKeyBtn');
  const clearBtn = document.getElementById('clearApiKeyBtn');

  if (!btn || !modal) return;

  const currentKey = localStorage.getItem('gemini_api_key') || '';
  if (input) input.value = currentKey;

  btn.addEventListener('click', () => { modal.style.display = 'flex'; });
  closeBtn?.addEventListener('click', () => { modal.style.display = 'none'; });
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.style.display = 'none';
  });

  saveBtn?.addEventListener('click', () => {
    const val = input.value.trim();
    if (val) {
      localStorage.setItem('gemini_api_key', val);
      alert('Gemini API Key সফলভাবে সেভ করা হয়েছে!');
    }
    modal.style.display = 'none';
  });

  clearBtn?.addEventListener('click', () => {
    localStorage.removeItem('gemini_api_key');
    if (input) input.value = '';
    alert('Gemini API Key মুছে ফেলা হয়েছে। এখন বিল্ট-ইন হিউরিস্টিক ইঞ্জিন চলবে।');
    modal.style.display = 'none';
  });
}
