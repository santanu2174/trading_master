// telegramAlert.js - Optional Telegram Notifications for High-Confluence Signals

const https = require('https');

/**
 * Sends a trade alert to a Telegram chat via Bot API
 * @param {string} botToken
 * @param {string} chatId
 * @param {object} analysis
 */
async function sendTelegramAlert(botToken, chatId, analysis) {
  if (!botToken || !chatId) {
    return { success: false, message: 'Bot token or Chat ID not configured' };
  }

  const { symbol, timeframe, confluence, tradeSetup, currentPrice } = analysis;
  const isLong = confluence.biasDirection === 'LONG';
  const icon = isLong ? '🟢 🚀' : '🔴 🔻';

  const message = `
<b>${icon} DELTA EXCHANGE TRADE SIGNAL</b>
━━━━━━━━━━━━━━━━━━━━━
<b>Asset:</b> <code>${symbol}</code> (Futures)
<b>Timeframe:</b> ${timeframe}
<b>Signal:</b> <b>${confluence.signal}</b>
<b>Confluence Score:</b> ${confluence.score > 0 ? '+' : ''}${confluence.score}/100
<b>Win Probability:</b> ~${confluence.estimatedProbability}%
<b>Current Price:</b> $${currentPrice.toLocaleString()}

${tradeSetup.entryPrice ? `
<b>🎯 TRADE SETUP:</b>
• <b>Entry:</b> $${tradeSetup.entryPrice.toLocaleString()}
• <b>Stop Loss:</b> $${tradeSetup.stopLoss.toLocaleString()} (${tradeSetup.riskPercentage}% risk)
• <b>Target 1 (50% exit):</b> $${tradeSetup.tp1.toLocaleString()}
• <b>Target 2 (30% exit):</b> $${tradeSetup.tp2.toLocaleString()}
• <b>Target 3 (Runner):</b> $${tradeSetup.tp3.toLocaleString()}
• <b>Risk:Reward:</b> ${tradeSetup.riskRewardRatio}

⚠️ <i>Rule: Move SL to Breakeven once TP1 is achieved!</i>
` : '<i>Market in consolidation. Waiting for breakout.</i>'}
━━━━━━━━━━━━━━━━━━━━━
<i>Automated Delta Trade Analyzer</i>
`.trim();

  const postData = JSON.stringify({
    chat_id: chatId,
    text: message,
    parse_mode: 'HTML'
  });

  return new Promise((resolve) => {
    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${botToken}/sendMessage`,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: 8000
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const resp = JSON.parse(data);
          resolve({ success: resp.ok, result: resp });
        } catch (e) {
          resolve({ success: false, message: e.message });
        }
      });
    });

    req.on('timeout', () => {
      req.destroy();
      resolve({ success: false, message: 'Telegram request timeout' });
    });

    req.on('error', (err) => {
      resolve({ success: false, message: err.message });
    });

    req.write(postData);
    req.end();
  });
}

module.exports = {
  sendTelegramAlert
};
