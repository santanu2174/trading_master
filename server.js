// server.js - Fast, Zero-Dependency Delta Trade Analyzer Server
const http = require('http');
const url = require('url');
const fs = require('fs');
const path = require('path');
const deltaApi = require('./deltaApi');
const { analyzeTrade } = require('./confluenceEngine');
const { sendTelegramAlert } = require('./telegramAlert');
const { processChartImage } = require('./chartVision');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const CONFIG_FILE = path.join(__dirname, 'config.json');

// Ensure default config file exists
let appConfig = {
  telegramBotToken: '',
  telegramChatId: '',
  geminiApiKey: '',
  alertOnStrongOnly: true,
  audioAlerts: true,
  autoRefreshInterval: 15
};

if (fs.existsSync(CONFIG_FILE)) {
  try {
    appConfig = { ...appConfig, ...JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8')) };
  } catch (e) {
    console.error('Error reading config.json, using defaults.');
  }
} else {
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(appConfig, null, 2), 'utf8');
}

// In-memory trade signal history log
const signalHistory = [];

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function sendJson(res, statusCode, data) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 25 * 1024 * 1024) { // 25MB limit for high-res screenshots
        req.connection.destroy();
        reject(new Error('Request entity too large'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  // Handle CORS Preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS'
    });
    res.end();
    return;
  }

  try {
    // API ENDPOINTS
    if (pathname === '/api/analysis') {
      const symbol = (parsedUrl.query.symbol || 'BTCUSD').toUpperCase();
      const timeframe = parsedUrl.query.timeframe || '15m';

      const analysis = await analyzeTrade(symbol, timeframe);

      // Check if we should log to signal history
      if (analysis.confluence.biasDirection !== 'NEUTRAL') {
        const lastSignal = signalHistory[0];
        const isDuplicate = lastSignal &&
          lastSignal.symbol === symbol &&
          lastSignal.signal === analysis.confluence.signal &&
          (Date.now() - new Date(lastSignal.time).getTime() < 1000 * 60 * 15);

        if (!isDuplicate) {
          signalHistory.unshift({
            id: Date.now().toString(),
            time: new Date().toISOString(),
            symbol,
            timeframe,
            signal: analysis.confluence.signal,
            score: analysis.confluence.score,
            price: analysis.currentPrice,
            entry: analysis.tradeSetup?.entryPrice,
            sl: analysis.tradeSetup?.stopLoss,
            tp1: analysis.tradeSetup?.tp1,
            tp2: analysis.tradeSetup?.tp2,
            tp3: analysis.tradeSetup?.tp3
          });
          if (signalHistory.length > 50) signalHistory.pop();

          // Auto send Telegram alert if configured
          if (appConfig.telegramBotToken && appConfig.telegramChatId) {
            const isStrong = analysis.confluence.signal.includes('STRONG');
            if (!appConfig.alertOnStrongOnly || isStrong) {
              sendTelegramAlert(appConfig.telegramBotToken, appConfig.telegramChatId, analysis)
                .catch(err => console.error('Telegram auto-alert error:', err));
            }
          }
        }
      }

      sendJson(res, 200, { success: true, analysis, history: signalHistory.slice(0, 15) });
      return;
    }

    if (pathname === '/api/candles') {
      const symbol = (parsedUrl.query.symbol || 'BTCUSD').toUpperCase();
      const resolution = parsedUrl.query.resolution || '15m';
      const count = parseInt(parsedUrl.query.count || '120', 10);

      const candles = await deltaApi.getCandles(symbol, resolution, count);
      sendJson(res, 200, { success: true, count: candles.length, candles });
      return;
    }

    if (pathname === '/api/ticker') {
      const symbol = (parsedUrl.query.symbol || 'BTCUSD').toUpperCase();
      const ticker = await deltaApi.getTicker(symbol);
      sendJson(res, 200, { success: true, ticker });
      return;
    }

    if (pathname === '/api/orderbook') {
      const symbol = (parsedUrl.query.symbol || 'BTCUSD').toUpperCase();
      const orderbook = await deltaApi.getOrderbook(symbol);
      sendJson(res, 200, { success: true, orderbook });
      return;
    }

    if (pathname === '/api/config' && req.method === 'GET') {
      sendJson(res, 200, { success: true, config: appConfig });
      return;
    }

    if (pathname === '/api/config' && req.method === 'POST') {
      const newConfig = await parseBody(req);
      appConfig = { ...appConfig, ...newConfig };
      fs.writeFileSync(CONFIG_FILE, JSON.stringify(appConfig, null, 2), 'utf8');
      sendJson(res, 200, { success: true, config: appConfig, message: 'Settings saved' });
      return;
    }

    if (pathname === '/api/telegram-test' && req.method === 'POST') {
      const body = await parseBody(req);
      const token = body.token || appConfig.telegramBotToken;
      const chatId = body.chatId || appConfig.telegramChatId;

      const dummyAnalysis = await analyzeTrade('BTCUSDT', '15m');
      const tgResult = await sendTelegramAlert(token, chatId, dummyAnalysis);
      sendJson(res, 200, tgResult);
      return;
    }

    if (pathname === '/api/scan-chart' && req.method === 'POST') {
      const body = await parseBody(req);
      if (!body.image) {
        sendJson(res, 400, { success: false, message: 'Image base64 data is required' });
        return;
      }
      const apiKey = body.apiKey || appConfig.geminiApiKey || process.env.GEMINI_API_KEY;
      try {
        const scanResult = await processChartImage(body.image, apiKey);
        sendJson(res, 200, { success: true, result: scanResult });
      } catch (err) {
        console.error('Scan Chart Error:', err);
        sendJson(res, 500, { success: false, message: err.message });
      }
      return;
    }

    // STATIC FILE SERVING
    let reqPath = pathname;
    if (reqPath === '/' || reqPath === '') {
      reqPath = 'index.html';
    } else if (reqPath === '/scan_chart' || reqPath === '/scan-chart') {
      reqPath = 'scan_chart.html';
    }

    let filePath = path.join(PUBLIC_DIR, reqPath);
    const extname = path.extname(filePath).toLowerCase();

    // Prevent directory traversal
    if (!filePath.startsWith(PUBLIC_DIR)) {
      res.writeHead(403);
      res.end('Access Denied');
      return;
    }

    fs.readFile(filePath, (err, content) => {
      if (err) {
        if (err.code === 'ENOENT') {
          // Serve index.html for SPA fallback or 404
          const indexHtml = path.join(PUBLIC_DIR, 'index.html');
          if (fs.existsSync(indexHtml)) {
            res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
            fs.createReadStream(indexHtml).pipe(res);
          } else {
            res.writeHead(404);
            res.end('Not Found');
          }
        } else {
          res.writeHead(500);
          res.end(`Server Error: ${err.code}`);
        }
      } else {
        const contentType = MIME_TYPES[extname] || 'application/octet-stream';
        res.writeHead(200, { 'Content-Type': contentType });
        res.end(content, 'utf-8');
      }
    });

  } catch (error) {
    console.error('Server Handler Error:', error);
    sendJson(res, 500, { success: false, error: error.message });
  }
});

server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 Delta Exchange Trade Analyzer is running!`);
  console.log(`📡 Local Terminal: http://localhost:${PORT}`);
  console.log(`⚡ Connected to Delta Exchange Futures Market`);
  console.log(`====================================================`);
});
