/**
 * Astral Hotels Scraper
 * Scrapes prices from Astral website (Queen of Sheba)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Hotel to monitor
const HOTEL = {
  name: 'Queen of Sheba',
  url: 'https://www.astralhotels.co.il/hotels/astral-queen-of-sheba',
  slug: 'queen-of-sheba'
};

// Date ranges to check (same as Isrotel)
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
 * Scrape price for a date range
 */
async function scrapePrice(browser, dates) {
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
    console.log(`  📍 Checking ${HOTEL.name} for ${dates.label}...`);
    
    // Navigate to hotel page
    await page.goto(HOTEL.url, { waitUntil: 'networkidle', timeout: 15000 });
    await page.waitForTimeout(2000);
    
    // Get all text and find prices
    const pageText = await page.evaluate(() => document.body.innerText);
    const foundPrices = extractPrices(pageText);
    
    if (foundPrices.length > 0) {
      price = Math.min(...foundPrices);
      console.log(`    ✅ Found prices: ${foundPrices.slice(0, 5).join(', ')}... Using: ₪${price}`);
    }
    
    // Check API prices
    if (!price && apiPrices.length > 0) {
      price = Math.min(...apiPrices);
      console.log(`    ✅ Found API price: ₪${price}`);
    }
    
    // Try clicking booking button as fallback
    if (!price) {
      const btn = await page.$('a:has-text("הזמנה"), button:has-text("הזמנה")');
      if (btn) {
        console.log(`    Found booking button`);
        await btn.click();
        await page.waitForTimeout(3000);
        const newText = await page.evaluate(() => document.body.innerText);
        const newPrices = extractPrices(newText);
        if (newPrices.length > 0) {
          price = Math.min(...newPrices);
          console.log(`    ✅ Found price after click: ₪${price}`);
        }
      }
    }
    
    await saveScreenshot(page, `astral-${HOTEL.slug}-${dates.label.replace('/', '-')}`);
    
    if (!price) console.log(`    ❌ No price found`);
    return price;
    
  } catch (error) {
    console.error(`    ❌ Error: ${error.message}`);
    await saveScreenshot(page, `astral-error-${HOTEL.slug}`);
    return null;
  } finally {
    await context.close();
  }
}

/**
 * Main scraping function for Astral
 */
async function scrapeAstral() {
  console.log('🏨 Starting Astral scraper...');
  
  const headless = process.env.HEADLESS !== 'false';
  
  const browser = await chromium.launch({ 
    headless,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  
  const results = {
    [HOTEL.name]: {}
  };
  
  try {
    for (const dates of DATE_RANGES) {
      const price = await scrapePrice(browser, dates);
      results[HOTEL.name][dates.label] = price;
      
      // Short delay between requests
      await new Promise(r => setTimeout(r, 1000));
    }
  } finally {
    await browser.close();
  }
  
  console.log('✅ Astral scraping complete');
  return results;
}

module.exports = { scrapeAstral, HOTEL, DATE_RANGES };
}

module.exports = { scrapeAstral, HOTEL, DATE_RANGES };
