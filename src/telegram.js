/**
 * Telegram Bot Module
 * Handles sending messages to Telegram
 */

const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

// Hotel configuration for building URLs
const HOTEL_CONFIG = {
  'המלך שלמה': { type: 'isrotel', code: 'KS' },
  'רויאל גארדן': { type: 'isrotel', code: 'RG' },
  'Queen of Sheba': { type: 'astral', hotelId: '11104', slug: 'astral-queen-of-sheba' }
};

// Guest configuration (matching scrapers)
const ISROTEL_COMPOSITION = '2-1-1'; // 2 adults, 1 child, 1 infant
const ASTRAL_ROOMS_DATA = [{ 
  adults: 2, 
  children: 1, 
  infants: 1,
  childrenAges: [5],
  infantsAges: [1]
}];

/**
 * Build booking URL for a hotel and date range
 */
function buildBookingUrl(hotelName, checkIn, checkOut) {
  const config = HOTEL_CONFIG[hotelName];
  if (!config) return null;
  
  if (config.type === 'isrotel') {
    // Isrotel URL format: DD-MM-YYYY
    const [inYear, inMonth, inDay] = checkIn.split('-');
    const [outYear, outMonth, outDay] = checkOut.split('-');
    const checkInFormatted = `${inDay}-${inMonth}-${inYear}`;
    const checkOutFormatted = `${outDay}-${outMonth}-${outYear}`;
    const searchQuery = `${config.code}/${checkInFormatted}/${checkOutFormatted}/${ISROTEL_COMPOSITION}/-1`;
    return `https://www.isrotel.co.il/searchresult/%D7%97%D7%93%D7%A8-%D7%91%D7%9E%D7%9C%D7%95%D7%9F/?SearchQuery=${searchQuery}`;
  }
  
  if (config.type === 'astral') {
    // Astral URL format: YYYY-MM-DD with single-encoded roomsGuests
    const roomsJson = JSON.stringify(ASTRAL_ROOMS_DATA);
    const roomsEncoded = encodeURIComponent(roomsJson);
    return `https://www.astralhotels.co.il/hotels/${config.slug}?hotelIdList=${config.hotelId}&fromDate=${checkIn}&toDate=${checkOut}&roomsGuests=${roomsEncoded}`;
  }
  
  return null;
}

/**
 * Parse date label to get check-in/check-out dates
 * Input: "7-11/06" Output: { checkIn: "2026-06-07", checkOut: "2026-06-11" }
 */
function parseDateLabel(label) {
  const match = label.match(/(\d+)-(\d+)\/(\d+)/);
  if (!match) return null;
  
  const [, startDay, endDay, month] = match;
  const year = '2026'; // Current year for bookings
  const monthPadded = month.padStart(2, '0');
  
  return {
    checkIn: `${year}-${monthPadded}-${startDay.padStart(2, '0')}`,
    checkOut: `${year}-${monthPadded}-${endDay.padStart(2, '0')}`
  };
}

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
 * Format price update message with booking links
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
  message += `👥 2 מבוגרים + ילד + תינוק\n`;
  message += `${'─'.repeat(20)}\n\n`;
  
  // Collect all prices for comparison
  const allPrices = [];
  
  for (const [hotel, datesPrices] of Object.entries(prices)) {
    message += `<b>📍 ${hotel}</b>\n`;
    
    // Find cheapest date for this hotel
    let cheapestDate = null;
    let cheapestPrice = Infinity;
    
    for (const [dates, price] of Object.entries(datesPrices)) {
      if (price && price > 0 && price < cheapestPrice) {
        cheapestPrice = price;
        cheapestDate = dates;
      }
    }
    
    for (const [dates, price] of Object.entries(datesPrices)) {
      if (price && price > 0) {
        const priceStr = `₪${price.toLocaleString('he-IL')}`;
        const isCheapest = dates === cheapestDate ? ' 💚' : '';
        message += `   ${dates}: ${priceStr}${isCheapest}\n`;
        allPrices.push({ hotel, dates, price });
      } else {
        message += `   ${dates}: ❌ לא זמין\n`;
      }
    }
    
    // Add booking link for cheapest option of this hotel
    if (cheapestDate) {
      const parsedDates = parseDateLabel(cheapestDate);
      if (parsedDates) {
        const bookingUrl = buildBookingUrl(hotel, parsedDates.checkIn, parsedDates.checkOut);
        if (bookingUrl) {
          message += `   🔗 <a href="${bookingUrl}">להזמנה (${cheapestDate})</a>\n`;
        }
      }
    }
    message += '\n';
  }
  
  // Find and highlight the overall cheapest option
  if (allPrices.length > 0) {
    const cheapest = allPrices.reduce((a, b) => a.price < b.price ? a : b);
    const parsedDates = parseDateLabel(cheapest.dates);
    
    message += `${'─'.repeat(20)}\n`;
    message += `💰 <b>הכי זול:</b>\n`;
    message += `${cheapest.hotel} (${cheapest.dates})\n`;
    message += `<b>₪${cheapest.price.toLocaleString('he-IL')}</b>`;
    
    // Add direct booking link for the cheapest overall
    if (parsedDates) {
      const bookingUrl = buildBookingUrl(cheapest.hotel, parsedDates.checkIn, parsedDates.checkOut);
      if (bookingUrl) {
        message += `\n🔗 <a href="${bookingUrl}">להזמנה ישירה</a>`;
      }
    }
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
  sendErrorNotification,
  buildBookingUrl,
  parseDateLabel
};
