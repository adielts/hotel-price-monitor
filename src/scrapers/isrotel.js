/**
 * Isrotel Hotels Scraper
 * Scrapes prices from Isrotel website for specified hotels and dates
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Hotels to monitor
const HOTELS = [
  {
    name: 'המלך שלמה',
    url: 'https://www.isrotel.co.il/isrotel-hotels/eilat-hotels/%D7%99%D7%A9%D7%A8%D7%95%D7%98%D7%9C-%D7%94%D7%9E%D7%9C%D7%9A-%D7%A9%D7%9C%D7%9E%D7%94/',
    slug: 'king-solomon',
    hotelCode: 'EILKS'
  },
  {
    name: 'רויאל גארדן',
    url: 'https://www.isrotel.co.il/isrotel-hotels/eilat-hotels/%D7%99%D7%A9%D7%A8%D7%95%D7%98%D7%9C-%D7%A8%D7%95%D7%99%D7%90%D7%9C-%D7%92%D7%90%D7%A8%D7%93%D7%9F/',
    slug: 'royal-garden',
    hotelCode: 'EILRG'
  }
];

// Date ranges to check
const DATE_RANGES = [
  { checkIn: '2026-06-07', checkOut: '2026-06-11', label: '7-11/06' },
  { checkIn: '2026-06-14', checkOut: '2026-06-18', label: '14-18/06' },
  { checkIn: '2026-06-21', checkOut: '2026-06-25', label: '21-25/06' }
];

/**
 * Save screenshot for debugging
 */
async function saveScreenshot(page, name) {
  const screenshotDir = path.join(__dirname, '../../screenshots');
  if (!fs.existsSync(screenshotDir)) {
    fs.mkdirSync(screenshotDir, { recursive: true });
  }
  await page.screenshot({ 
    path: path.join(screenshotDir, `${name}-${Date.now()}.png`),
    fullPage: true 
  });
}

/**
 * Extract all prices from text
 */
function extractPrices(text) {
  if (!text) return [];
  const matches = text.match(/₪\s*[\d,]+/g) || [];
  return matches.map(m => {
    const num = parseInt(m.replace(/[^\d]/g, ''), 10);
    return num > 100 && num < 50000 ? num : null;
  }).filter(Boolean);
}

/**
 * Format date for URL (DD/MM/YYYY)
 */
function formatDateForUrl(dateStr) {
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

/**
 * Scrape price for a single hotel and date range
 * @param {object} browser - Playwright browser instance
 * @param {object} hotel - Hotel info
 * @param {object} dates - Date range
 * @returns {number|null} - Price or null if not found
 */
async function scrapeHotelPrice(browser, hotel, dates) {
  const context = await browser.newContext({
    locale: 'he-IL',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  let price = null;
  
  // Monitor API responses
  const apiPrices = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('price') || url.includes('rate') || url.includes('availability')) {
      try {
        if (response.headers()['content-type']?.includes('json')) {
          const data = await response.json();
          const prices = extractPrices(JSON.stringify(data));
          apiPrices.push(...prices);
        }
      } catch (e) {}
    }
  });
  
  try {
    console.log(`  📍 Checking ${hotel.name} for ${dates.label}...`);
    
    // Format dates
    const checkIn = formatDateForUrl(dates.checkIn);
    const checkOut = formatDateForUrl(dates.checkOut);
    
    // Try direct booking URLs
    const bookingUrls = [
      `https://www.isrotel.co.il/booking-results/?checkin=${checkIn}&checkout=${checkOut}&adults=2&children=0`,
      hotel.url
    ];
    
    for (const url of bookingUrls) {
      if (price) break;
      
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
        await page.waitForTimeout(2000);
        
        // Get all text and find prices
        const pageText = await page.evaluate(() => document.body.innerText);
        const foundPrices = extractPrices(pageText);
        
        if (foundPrices.length > 0) {
          price = Math.min(...foundPrices);
          console.log(`    ✅ Found prices: ${foundPrices.slice(0, 5).join(', ')}... Using: ₪${price}`);
          break;
        }
        
        // Check API prices
        if (apiPrices.length > 0) {
          price = Math.min(...apiPrices);
          console.log(`    ✅ Found API price: ₪${price}`);
          break;
        }
        
      } catch (e) {
        console.log(`    ⚠️ URL timeout`);
      }
    }
    
    // Try clicking booking button as fallback
    if (!price) {
      try {
        await page.goto(hotel.url, { waitUntil: 'domcontentloaded', timeout: 10000 });
        const btn = await page.$('a:has-text("הזמנה")');
        if (btn) {
          await btn.click();
          await page.waitForTimeout(3000);
          const pageText = await page.evaluate(() => document.body.innerText);
          const foundPrices = extractPrices(pageText);
          if (foundPrices.length > 0) {
            price = Math.min(...foundPrices);
            console.log(`    ✅ Found price after click: ₪${price}`);
          }
        }
      } catch (e) {}
    }
    
    await saveScreenshot(page, `isrotel-${hotel.slug}-${dates.label.replace('/', '-')}`);
    
    if (!price) console.log(`    ❌ No price found`);
    return price;
    
  } catch (error) {
    console.error(`    ❌ Error: ${error.message}`);
    await saveScreenshot(page, `isrotel-error-${hotel.slug}`);
    return null;
  } finally {
    await context.close();
  }
}

/**
 * Main scraping function for Isrotel
 * @returns {object} - Prices object { hotelName: { dateRange: price } }
 */
async function scrapeIsrotel() {
  console.log('🏨 Starting Isrotel scraper...');
  
  const headless = process.env.HEADLESS !== 'false';
  
  const browser = await chromium.launch({ 
    headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  });
  
  const results = {};
  
  try {
    for (const hotel of HOTELS) {
      results[hotel.name] = {};
      
      for (const dates of DATE_RANGES) {
        const price = await scrapeHotelPrice(browser, hotel, dates);
        results[hotel.name][dates.label] = price;
        
        // Short delay between requests
        await new Promise(r => setTimeout(r, 1000));
      }
    }
  } finally {
    await browser.close();
  }
  
  console.log('✅ Isrotel scraping complete');
  return results;
}

module.exports = { scrapeIsrotel, HOTELS, DATE_RANGES };
