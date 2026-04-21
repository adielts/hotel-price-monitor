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
    slug: 'king-solomon'
  },
  {
    name: 'רויאל גארדן',
    url: 'https://www.isrotel.co.il/isrotel-hotels/eilat-hotels/%D7%99%D7%A9%D7%A8%D7%95%D7%98%D7%9C-%D7%A8%D7%95%D7%99%D7%90%D7%9C-%D7%92%D7%90%D7%A8%D7%93%D7%9F/',
    slug: 'royal-garden'
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
 * Random delay to avoid detection
 */
async function randomDelay(min = 1000, max = 3000) {
  const delay = min + Math.random() * (max - min);
  await new Promise(r => setTimeout(r, delay));
}

/**
 * Extract price from text (handles various formats)
 */
function extractPrice(text) {
  if (!text) return null;
  // Remove non-numeric characters except digits
  const numbers = text.replace(/[^\d]/g, '');
  const price = parseInt(numbers, 10);
  return price > 0 ? price : null;
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
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
  });
  
  const page = await context.newPage();
  
  try {
    console.log(`  📍 Checking ${hotel.name} for ${dates.label}...`);
    
    // Navigate to hotel page
    await page.goto(hotel.url, { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    
    await randomDelay(2000, 4000);
    
    // Try to find and click the booking button
    // Common selectors for Isrotel booking buttons
    const bookingSelectors = [
      'button:has-text("הזמנה")',
      'a:has-text("הזמנה")',
      '.booking-btn',
      '.reserve-btn',
      '[data-action="book"]',
      '.btn-booking',
      'button:has-text("בדוק זמינות")',
      'a:has-text("בדוק זמינות")'
    ];
    
    let bookingButton = null;
    for (const selector of bookingSelectors) {
      try {
        bookingButton = await page.$(selector);
        if (bookingButton) {
          console.log(`    Found booking button with selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Continue trying other selectors
      }
    }
    
    if (bookingButton) {
      await bookingButton.click();
      await randomDelay(2000, 3000);
    }
    
    // Wait for booking form/popup to appear
    await page.waitForTimeout(3000);
    
    // Try to find date inputs and fill them
    // This is highly dependent on the actual site structure
    const dateInputSelectors = [
      'input[type="date"]',
      'input[name*="checkin"]',
      'input[name*="check-in"]',
      'input[placeholder*="כניסה"]',
      '.date-picker input',
      '[data-field="checkin"]'
    ];
    
    // Try direct URL approach with dates
    const bookingUrl = `https://www.isrotel.co.il/booking/?hotel=${hotel.slug}&checkin=${dates.checkIn}&checkout=${dates.checkOut}&adults=2`;
    
    try {
      await page.goto(bookingUrl, { 
        waitUntil: 'networkidle',
        timeout: 30000 
      });
      await randomDelay(3000, 5000);
    } catch (e) {
      console.log(`    Could not load booking URL directly`);
    }
    
    // Look for price elements
    const priceSelectors = [
      '.price',
      '.room-price',
      '.total-price',
      '.rate',
      '[class*="price"]',
      '[data-price]',
      'span:has-text("₪")',
      '.amount'
    ];
    
    let price = null;
    
    for (const selector of priceSelectors) {
      try {
        const elements = await page.$$(selector);
        for (const element of elements) {
          const text = await element.textContent();
          if (text && text.includes('₪')) {
            price = extractPrice(text);
            if (price && price > 100) { // Sanity check
              console.log(`    Found price: ₪${price}`);
              break;
            }
          }
        }
        if (price) break;
      } catch (e) {
        // Continue trying other selectors
      }
    }
    
    // If no price found, try to extract from page content
    if (!price) {
      const pageContent = await page.content();
      const priceMatch = pageContent.match(/₪\s*([\d,]+)/);
      if (priceMatch) {
        price = extractPrice(priceMatch[0]);
      }
    }
    
    // Save screenshot for debugging
    await saveScreenshot(page, `isrotel-${hotel.slug}-${dates.label.replace('/', '-')}`);
    
    return price;
    
  } catch (error) {
    console.error(`    ❌ Error scraping ${hotel.name}: ${error.message}`);
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
        
        // Delay between requests to avoid rate limiting
        await randomDelay(3000, 5000);
      }
    }
  } finally {
    await browser.close();
  }
  
  console.log('✅ Isrotel scraping complete');
  return results;
}

module.exports = { scrapeIsrotel, HOTELS, DATE_RANGES };
