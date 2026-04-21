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
 * Random delay to avoid detection
 */
async function randomDelay(min = 1000, max = 3000) {
  const delay = min + Math.random() * (max - min);
  await new Promise(r => setTimeout(r, delay));
}

/**
 * Extract price from text
 */
function extractPrice(text) {
  if (!text) return null;
  const numbers = text.replace(/[^\d]/g, '');
  const price = parseInt(numbers, 10);
  return price > 0 ? price : null;
}

/**
 * Try to extract data from Next.js __NEXT_DATA__ script
 */
async function extractNextData(page) {
  try {
    const nextData = await page.evaluate(() => {
      const script = document.querySelector('#__NEXT_DATA__');
      if (script) {
        return JSON.parse(script.textContent);
      }
      return null;
    });
    return nextData;
  } catch (e) {
    return null;
  }
}

/**
 * Scrape price for a date range
 */
async function scrapePrice(browser, dates) {
  const context = await browser.newContext({
    locale: 'he-IL',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();
  
  try {
    console.log(`  📍 Checking ${HOTEL.name} for ${dates.label}...`);
    
    // Navigate to hotel page
    await page.goto(HOTEL.url, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    await randomDelay(2000, 4000);
    
    // Check for Next.js data first (might contain prices)
    const nextData = await extractNextData(page);
    if (nextData) {
      console.log('    Found __NEXT_DATA__, checking for prices...');
      // This would need to be adapted based on actual data structure
    }
    
    // Look for booking/check availability button
    const bookingSelectors = [
      'button:has-text("הזמנה")',
      'button:has-text("בדוק זמינות")',
      'a:has-text("הזמנה")',
      'a:has-text("להזמנה")',
      '.booking-btn',
      '[class*="booking"]',
      '[class*="reserve"]'
    ];
    
    let bookingButton = null;
    for (const selector of bookingSelectors) {
      try {
        bookingButton = await page.$(selector);
        if (bookingButton) {
          console.log(`    Found booking button`);
          break;
        }
      } catch (e) {
        // Continue
      }
    }
    
    if (bookingButton) {
      await bookingButton.click();
      await randomDelay(2000, 4000);
    }
    
    // Try URL with date parameters
    const checkInFormatted = dates.checkIn.split('-').reverse().join('/');
    const checkOutFormatted = dates.checkOut.split('-').reverse().join('/');
    
    const bookingUrls = [
      `${HOTEL.url}?checkin=${dates.checkIn}&checkout=${dates.checkOut}`,
      `${HOTEL.url}/booking?from=${dates.checkIn}&to=${dates.checkOut}`,
      `https://www.astralhotels.co.il/booking?hotel=queen-of-sheba&checkin=${dates.checkIn}&checkout=${dates.checkOut}`
    ];
    
    for (const url of bookingUrls) {
      try {
        await page.goto(url, { waitUntil: 'networkidle', timeout: 15000 });
        await randomDelay(2000, 3000);
        break;
      } catch (e) {
        // Try next URL
      }
    }
    
    // Look for date picker and fill dates
    try {
      // This depends on the actual site structure
      const dateInputs = await page.$$('input[type="date"], input[name*="date"], input[class*="date"]');
      if (dateInputs.length >= 2) {
        await dateInputs[0].fill(dates.checkIn);
        await dateInputs[1].fill(dates.checkOut);
        await randomDelay(1000, 2000);
        
        // Look for search button
        const searchBtn = await page.$('button[type="submit"], button:has-text("חפש"), button:has-text("בדוק")');
        if (searchBtn) {
          await searchBtn.click();
          await randomDelay(3000, 5000);
        }
      }
    } catch (e) {
      console.log('    Could not interact with date inputs');
    }
    
    // Search for price elements
    const priceSelectors = [
      '.price',
      '.room-price',
      '[class*="price"]',
      '[data-price]',
      'span:has-text("₪")',
      '.rate',
      '.amount',
      '[class*="total"]'
    ];
    
    let price = null;
    
    for (const selector of priceSelectors) {
      try {
        const elements = await page.$$(selector);
        for (const element of elements) {
          const text = await element.textContent();
          if (text && text.includes('₪')) {
            price = extractPrice(text);
            if (price && price > 100) {
              console.log(`    Found price: ₪${price}`);
              break;
            }
          }
        }
        if (price) break;
      } catch (e) {
        // Continue
      }
    }
    
    // Try extracting from page content as last resort
    if (!price) {
      const content = await page.content();
      const priceMatch = content.match(/₪\s*([\d,]+)/);
      if (priceMatch) {
        price = extractPrice(priceMatch[0]);
      }
    }
    
    // Save screenshot for debugging
    await saveScreenshot(page, `astral-${HOTEL.slug}-${dates.label.replace('/', '-')}`);
    
    return price;
    
  } catch (error) {
    console.error(`    ❌ Error scraping ${HOTEL.name}: ${error.message}`);
    await saveScreenshot(page, `astral-error-${HOTEL.slug}`);
    return null;
  } finally {
    await context.close();
  }
}

/**
 * Main scraping function for Astral
 * @returns {object} - Prices object { hotelName: { dateRange: price } }
 */
async function scrapeAstral() {
  console.log('🏨 Starting Astral scraper...');
  
  const headless = process.env.HEADLESS !== 'false';
  
  const browser = await chromium.launch({ 
    headless,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage'
    ]
  });
  
  const results = {
    [HOTEL.name]: {}
  };
  
  try {
    for (const dates of DATE_RANGES) {
      const price = await scrapePrice(browser, dates);
      results[HOTEL.name][dates.label] = price;
      
      // Delay between requests
      await randomDelay(3000, 5000);
    }
  } finally {
    await browser.close();
  }
  
  console.log('✅ Astral scraping complete');
  return results;
}

module.exports = { scrapeAstral, HOTEL, DATE_RANGES };
