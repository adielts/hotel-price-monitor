/**
 * Telegram Bot Module
 * Handles sending messages to Telegram
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

/**
 * Send a message to Telegram
 * @param {string} text - Message text (supports HTML)
 * @returns {Promise<object>} - Telegram API response
 */
async function sendMessage(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) {
    throw new Error('Missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID environment variables');
  }

  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TELEGRAM_CHAT_ID,
      text: text,
      parse_mode: 'HTML'
    })
  });
  
  const data = await response.json();
  
  if (!response.ok || !data.ok) {
    throw new Error(`Telegram error: ${data.description || response.status}`);
  }
  
  return data;
}

/**
 * Format price update message
 * @param {object} prices - Prices object { hotelName: { dateRange: price } }
 * @param {string} timestamp - ISO timestamp
 * @returns {string} - Formatted message
 */
function formatPriceUpdate(prices, timestamp) {
  const date = new Date(timestamp).toLocaleString('he-IL', {
    timeZone: 'Asia/Jerusalem',
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  let message = `🏨 <b>עדכון מחירי מלונות</b>\n`;
  message += `📅 ${date}\n`;
  message += `${'─'.repeat(20)}\n\n`;
  
  // Collect all prices for comparison
  const allPrices = [];
  
  for (const [hotel, datesPrices] of Object.entries(prices)) {
    message += `<b>📍 ${hotel}</b>\n`;
    
    for (const [dates, price] of Object.entries(datesPrices)) {
      if (price && price > 0) {
        const priceStr = `₪${price.toLocaleString('he-IL')}`;
        message += `   ${dates}: ${priceStr}\n`;
        allPrices.push({ hotel, dates, price });
      } else {
        message += `   ${dates}: ❌ לא זמין\n`;
      }
    }
    message += '\n';
  }
  
  // Find and highlight the cheapest option
  if (allPrices.length > 0) {
    const cheapest = allPrices.reduce((a, b) => a.price < b.price ? a : b);
    message += `${'─'.repeat(20)}\n`;
    message += `💰 <b>הכי זול:</b>\n`;
    message += `${cheapest.hotel} (${cheapest.dates})\n`;
    message += `<b>₪${cheapest.price.toLocaleString('he-IL')}</b>`;
  }
  
  return message;
}

/**
 * Send error notification
 * @param {Error} error - Error object
 * @returns {Promise<object>}
 */
async function sendErrorNotification(error) {
  const message = `⚠️ <b>שגיאה בבדיקת מחירים</b>\n\n${error.message}`;
  return sendMessage(message);
}

module.exports = { 
  sendMessage, 
  formatPriceUpdate, 
  sendErrorNotification 
};
