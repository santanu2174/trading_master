// chart.js - Professional Canvas Candlestick & Indicator Chart Renderer
// Engineered to match TradingView & Delta Exchange layouts

class TradingChart {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    this.ctx = this.canvas.getContext('2d');
    this.candles = [];
    this.analysis = null;
    this.mousePos = { x: 0, y: 0 };
    this.isHovering = false;

    this.setupListeners();
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  setupListeners() {
    this.canvas.addEventListener('mousemove', (e) => {
      const rect = this.canvas.getBoundingClientRect();
      this.mousePos = {
        x: (e.clientX - rect.left),
        y: (e.clientY - rect.top)
      };
      this.isHovering = true;
      this.render();
    });

    this.canvas.addEventListener('mouseleave', () => {
      this.isHovering = false;
      this.render();
    });
  }

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    this.width = rect.width;
    this.height = rect.height;

    this.canvas.width = this.width * dpr;
    this.canvas.height = this.height * dpr;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    this.render();
  }

  setData(candles, analysis) {
    this.candles = candles || [];
    this.analysis = analysis;
    this.render();
  }

  render() {
    const ctx = this.ctx;
    const width = this.width;
    const height = this.height;

    // Dark background matching Delta Exchange
    ctx.fillStyle = '#0a0e17';
    ctx.fillRect(0, 0, width, height);

    if (!this.candles || this.candles.length === 0) {
      ctx.fillStyle = '#64748b';
      ctx.font = '14px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Connecting to Delta Exchange feed...', width / 2, height / 2);
      return;
    }

    const paddingRight = 75; // Right price axis
    const paddingBottom = 28; // Bottom time axis
    const paddingTop = 24;
    const chartWidth = width - paddingRight;
    const chartHeight = height - paddingBottom - paddingTop;
    const volumeHeight = chartHeight * 0.18;
    const priceHeight = chartHeight - volumeHeight - 12;

    // Show last 50 candles for clean, distinct candle bodies like TradingView
    const visibleCount = Math.min(50, this.candles.length);
    const visibleCandles = this.candles.slice(-visibleCount);

    // Calculate High / Low price ranges
    let minPrice = Infinity;
    let maxPrice = -Infinity;
    let maxVol = 0;

    visibleCandles.forEach(c => {
      if (c.low < minPrice) minPrice = c.low;
      if (c.high > maxPrice) maxPrice = c.high;
      if (c.volume > maxVol) maxVol = c.volume;
    });

    // Expand bounds if SL or TP are nearby
    if (this.analysis?.tradeSetup?.stopLoss) {
      minPrice = Math.min(minPrice, this.analysis.tradeSetup.stopLoss * 0.999);
      maxPrice = Math.max(maxPrice, this.analysis.tradeSetup.stopLoss * 1.001);
    }
    if (this.analysis?.tradeSetup?.tp1) {
      minPrice = Math.min(minPrice, this.analysis.tradeSetup.tp1 * 0.999);
      maxPrice = Math.max(maxPrice, this.analysis.tradeSetup.tp1 * 1.001);
    }

    const priceRange = (maxPrice - minPrice) || 1;
    const priceBuffer = priceRange * 0.08;
    minPrice -= priceBuffer;
    maxPrice += priceBuffer;
    const adjustedRange = maxPrice - minPrice;

    // Coordinate converters
    const getY = (price) => paddingTop + priceHeight - ((price - minPrice) / adjustedRange) * priceHeight;
    const getVolY = (vol) => height - paddingBottom - (maxVol > 0 ? (vol / maxVol) * volumeHeight : 0);
    const slotWidth = chartWidth / visibleCount;
    const candleWidth = Math.max(slotWidth * 0.72, 3);
    const getX = (idx) => (idx * slotWidth) + (slotWidth / 2);

    // Draw horizontal grid lines & Price labels
    ctx.strokeStyle = '#151e2e';
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    const gridSteps = 6;
    ctx.fillStyle = '#64748b';
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';

    for (let i = 0; i <= gridSteps; i++) {
      const p = minPrice + (adjustedRange * (i / gridSteps));
      const y = getY(p);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(chartWidth, y);
      ctx.stroke();
      ctx.fillText(p.toFixed(p > 100 ? 1 : 2), chartWidth + 6, y + 4);
    }

    // Draw Valid Support & Resistance Institutional Zones (Demand & Supply)
    const validZones = this.analysis?.smc?.validZones;
    if (validZones) {
      // 1. Draw Valid Support Zones (Demand)
      validZones.supportZones?.forEach((zone, idx) => {
        const yTop = getY(zone.top);
        const yBottom = getY(zone.bottom);
        const zoneHeight = Math.max(Math.abs(yBottom - yTop), 7);
        const yStart = Math.min(yTop, yBottom);

        // Shaded Box (More opaque for the primary zone)
        ctx.fillStyle = idx === 0 ? 'rgba(8, 153, 129, 0.18)' : 'rgba(8, 153, 129, 0.08)';
        ctx.fillRect(0, yStart, chartWidth, zoneHeight);

        // Dashed boundaries
        ctx.strokeStyle = idx === 0 ? 'rgba(8, 153, 129, 0.85)' : 'rgba(8, 153, 129, 0.45)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(0, yTop); ctx.lineTo(chartWidth, yTop);
        ctx.moveTo(0, yBottom); ctx.lineTo(chartWidth, yBottom);
        ctx.stroke();
        ctx.setLineDash([]);

        // Zone label badge inside chart
        ctx.fillStyle = '#089981';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`🛡️ VALID SUPPORT: $${zone.bottom} - $${zone.top} (${zone.touches}x Touches • ${zone.strength})`, 14, yStart + Math.min(13, zoneHeight - 2));
      });

      // 2. Draw Valid Resistance Zones (Supply)
      validZones.resistanceZones?.forEach((zone, idx) => {
        const yTop = getY(zone.top);
        const yBottom = getY(zone.bottom);
        const zoneHeight = Math.max(Math.abs(yBottom - yTop), 7);
        const yStart = Math.min(yTop, yBottom);

        ctx.fillStyle = idx === 0 ? 'rgba(242, 54, 69, 0.18)' : 'rgba(242, 54, 69, 0.08)';
        ctx.fillRect(0, yStart, chartWidth, zoneHeight);

        ctx.strokeStyle = idx === 0 ? 'rgba(242, 54, 69, 0.85)' : 'rgba(242, 54, 69, 0.45)';
        ctx.lineWidth = 1.2;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(0, yTop); ctx.lineTo(chartWidth, yTop);
        ctx.moveTo(0, yBottom); ctx.lineTo(chartWidth, yBottom);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = '#f23645';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`⚔️ VALID RESISTANCE: $${zone.bottom} - $${zone.top} (${zone.touches}x Rejections • ${zone.strength})`, 14, yStart + Math.min(13, zoneHeight - 2));
      });
    }

    // Time Axis tick lines & timestamps
    ctx.fillStyle = '#64748b';
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    const timeStep = Math.max(1, Math.floor(visibleCount / 6));

    visibleCandles.forEach((c, idx) => {
      if (idx % timeStep === 0 || idx === visibleCount - 1) {
        const x = getX(idx);
        ctx.strokeStyle = '#151e2e';
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, height - paddingBottom);
        ctx.stroke();

        const date = new Date(c.time);
        const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
        ctx.fillText(timeStr, x, height - 10);
      }
    });

    // Draw Candlesticks & Volume
    let hoveredCandle = null;
    let hoveredX = 0;

    visibleCandles.forEach((c, idx) => {
      const x = getX(idx);
      const isUp = c.close >= c.open;
      const color = isUp ? '#089981' : '#f23645'; // TradingView standard colors

      // Check hover
      if (this.isHovering && Math.abs(this.mousePos.x - x) < slotWidth / 2) {
        hoveredCandle = c;
        hoveredX = x;
      }

      // Volume bar
      const volY = getVolY(c.volume);
      ctx.fillStyle = isUp ? 'rgba(8, 153, 129, 0.35)' : 'rgba(242, 54, 69, 0.35)';
      ctx.fillRect(x - (candleWidth / 2), volY, candleWidth, height - paddingBottom - volY);

      // Wick
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x, getY(c.high));
      ctx.lineTo(x, getY(c.low));
      ctx.stroke();

      // Candle Body
      const openY = getY(c.open);
      const closeY = getY(c.close);
      const bodyTop = Math.min(openY, closeY);
      const bodyHeight = Math.max(Math.abs(openY - closeY), 1.6);

      ctx.fillStyle = color;
      ctx.fillRect(x - (candleWidth / 2), bodyTop, candleWidth, bodyHeight);
    });

    // Draw EMA 9 & EMA 21
    this.drawEmaLine(visibleCandles, 9, '#38bdf8', getX, getY);
    this.drawEmaLine(visibleCandles, 21, '#fbbf24', getX, getY);

    // Draw Current Mark Price dashed line
    const lastCandle = visibleCandles[visibleCandles.length - 1];
    const livePrice = this.analysis?.currentPrice || lastCandle.close;
    const liveY = getY(livePrice);

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(0, liveY);
    ctx.lineTo(chartWidth, liveY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Live price badge on right axis
    ctx.fillStyle = '#6366f1';
    ctx.fillRect(chartWidth + 1, liveY - 9, paddingRight - 2, 18);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(livePrice.toFixed(livePrice > 100 ? 1 : 2), chartWidth + 5, liveY + 4);

    // Draw Trade Setup Levels (Entry, SL, TP1, TP2)
    const setup = this.analysis?.tradeSetup;
    if (setup && setup.entryPrice) {
      this.drawLevelLine(ctx, getY(setup.entryPrice), chartWidth, '#fbbf24', `Entry: $${setup.entryPrice}`);
      this.drawLevelLine(ctx, getY(setup.stopLoss), chartWidth, '#ff3b69', `SL: $${setup.stopLoss}`, [4, 4]);
      this.drawLevelLine(ctx, getY(setup.tp1), chartWidth, '#089981', `TP1: $${setup.tp1}`, [3, 3]);
      if (setup.tp2) {
        this.drawLevelLine(ctx, getY(setup.tp2), chartWidth, '#34d399', `TP2: $${setup.tp2}`, [3, 3]);
      }
    }

    // Draw Direct Fall / Rise Entry Marker on the latest candle
    const predictor = this.analysis?.fallRisePredictor;
    if (predictor && lastCandle && visibleCandles.length > 0) {
      const lastX = getX(visibleCandles.length - 1);
      ctx.save();
      if (predictor.direction === 'FALL') {
        const arrowY = getY(lastCandle.high) - 16;
        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('▼', lastX, arrowY);

        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.fillRect(lastX - 60, arrowY - 24, 120, 20);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(lastX - 60, arrowY - 24, 120, 20);

        ctx.fillStyle = '#ef4444';
        ctx.font = 'bold 10px monospace';
        ctx.fillText('▼ SELL / FALL ENTRY', lastX, arrowY - 10);
      } else if (predictor.direction === 'RISE') {
        const arrowY = getY(lastCandle.low) + 22;
        ctx.fillStyle = '#10b981';
        ctx.font = 'bold 16px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('▲', lastX, arrowY);

        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.fillRect(lastX - 60, arrowY + 6, 120, 20);
        ctx.strokeStyle = '#10b981';
        ctx.lineWidth = 1.2;
        ctx.strokeRect(lastX - 60, arrowY + 6, 120, 20);

        ctx.fillStyle = '#10b981';
        ctx.font = 'bold 10px monospace';
        ctx.fillText('▲ BUY / RISE ENTRY', lastX, arrowY + 20);
      }
      ctx.restore();
    }

    // Crosshair and Inspection Tooltip
    if (this.isHovering && hoveredCandle) {
      ctx.setLineDash([2, 2]);
      ctx.strokeStyle = '#94a3b8';
      ctx.lineWidth = 1;

      // Vertical line
      ctx.beginPath();
      ctx.moveTo(hoveredX, paddingTop);
      ctx.lineTo(hoveredX, height - paddingBottom);
      ctx.stroke();

      // Horizontal line
      ctx.beginPath();
      ctx.moveTo(0, this.mousePos.y);
      ctx.lineTo(chartWidth, this.mousePos.y);
      ctx.stroke();
      ctx.setLineDash([]);

      const dateStr = new Date(hoveredCandle.time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
      const isUp = hoveredCandle.close >= hoveredCandle.open;
      const overlayEl = document.getElementById('chartOverlayText');
      if (overlayEl) {
        overlayEl.innerHTML = `
          <span><b>Time:</b> ${dateStr}</span>
          <span><b>O:</b> ${hoveredCandle.open.toFixed(1)}</span>
          <span><b>H:</b> ${hoveredCandle.high.toFixed(1)}</span>
          <span><b>L:</b> ${hoveredCandle.low.toFixed(1)}</span>
          <span style="color: ${isUp ? '#089981' : '#f23645'}"><b>C:</b> ${hoveredCandle.close.toFixed(1)}</span>
          <span><b>Vol:</b> ${hoveredCandle.volume.toLocaleString()}</span>
        `;
      }
    }
  }

  drawEmaLine(candles, period, color, getX, getY) {
    const closes = candles.map(c => c.close);
    const k = 2 / (period + 1);
    let ema = null;
    const emaVals = [];

    for (let i = 0; i < closes.length; i++) {
      if (i === 0) ema = closes[0];
      else ema = (closes[i] * k) + (ema * (1 - k));
      emaVals.push(ema);
    }

    const ctx = this.ctx;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.6;
    ctx.setLineDash([]);
    ctx.beginPath();

    for (let i = 0; i < candles.length; i++) {
      const x = getX(i);
      const y = getY(emaVals[i]);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  drawLevelLine(ctx, y, width, color, label, dash = []) {
    if (y < 0 || y > this.height) return;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = color;
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'right';
    ctx.fillText(label, width - 8, y - 4);
  }
}

window.TradingChart = TradingChart;
