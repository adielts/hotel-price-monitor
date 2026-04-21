/**
 * Isrotel Hotels Scraper
 * Scrapes prices from Isrotel website for specified hotels and dates
 * Configuration: 2 adults + 1 child + 1 infant, half-board (חצי פנסיון)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Room composition: 2 adults + 1 child + 1 infant
// Format from Isrotel: adults-childAge-infantAge (or adults-child-infant)
const ROOM_COMPOSITION = '2-1-1'; // Matching the URL format from user

// Hotels to monitor (Isrotel chain)
const HOTELS = [
  {
    name: 'המלך שלמה',
    code: 'KS',
    slug: 'king-solomon'
  },
  {
    name: 'רויאל גארדן',
    code: 'RG',
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
 * Format date for Isrotel URL (DD-MM-YYYY)
 */
function formatDateForUrl(dateStr) {
  const [year, month, day] = dateStr.split('-');
  return `${day}-${month}-${year}`;
}

/**
 * Build Isrotel search URL
 * Format: https://www.isrotel.co.il/searchresult/חדר-במלון/?SearchQuery={code}/{checkIn}/{checkOut}/{composition}/-1
 */
function buildSearchUrl(hotelCode, checkIn, checkOut) {
  const checkInFormatted = formatDateForUrl(checkIn);
  const checkOutFormatted = formatDateForUrl(checkOut);
  const searchQuery = `${hotelCode}/${checkInFormatted}/${checkOutFormatted}/${ROOM_COMPOSITION}/-1`;
  return `https://www.isrotel.co.il/searchresult/%D7%97%D7%93%D7%A8-%D7%91%D7%9E%D7%9C%D7%95%D7%9F/?SearchQuery=${searchQuery}`;
}

/**
 * Scrape price for a single hotel and date range
 * Targets half-board (חצי פנסיון) prices, gets cheapest room option
 * @param {object} browser - Playwright browser instance
 * @param {object} hotel - Hotel info
 * @param {object} dates - Date range
 * @returns {number|null} - Total price for stay or null if not found
 */
async function scrapeHotelPrice(browser, hotel, dates) {
  const context = await browser.newContext({
    locale: 'he-IL',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  let price = null;
  
  try {
    console.log(`  📍 Checking ${hotel.name} for ${dates.label}...`);
    
    // Build search URL with room composition
    const searchUrl = buildSearchUrl(hotel.code, dates.checkIn, dates.checkOut);
    console.log(`    URL: ${searchUrl}`);
    
    await page.goto(searchUrl, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(5000); // Wait longer for dynamic content
    
    // Extract prices from the page - try multiple methods
    const priceData = await page.evaluate(() => {
      const allText = document.body.innerText;
      
      // Method 1: Find ₪ followed by numbers
      const prices1 = [];
      const regex1 = /₪\s*([\d,]+)/g;
      let match;
      while ((match = regex1.exec(allText)) !== null) {
        const num = parseInt(match[1].replace(/,/g, ''), 10);
        if (num >= 5000 && num <= 50000) {
          prices1.push(num);
        }
      }
      
      // Method 2: Find numbers followed by ₪ or ש"ח
      const regex2 = /([\d,]+)\s*(?:₪|ש"ח)/g;
      while ((match = regex2.exec(allText)) !== null) {
        const num = parseInt(match[1].replace(/,/g, ''), 10);
        if (num >= 5000 && num <= 50000) {
          prices1.push(num);
        }
      }
      
      // Method 3: Look for price elements in DOM
      const priceElements = document.querySelectorAll('[class*="price"], [class*="Price"], [class*="cost"], [class*="total"], [class*="sum"]');
      for (const el of priceElements) {
        const text = el.innerText || el.textContent || '';
        const nums = text.match(/[\d,]+/g) || [];
        for (const numStr of nums) {
          const num = parseInt(numStr.replace(/,/g, ''), 10);
          if (num >= 5000 && num <= 50000) {
            prices1.push(num);
          }
        }
      }
      
      // Get sample of page text for debugging
      const sampleText = allText.substring(0, 4000);
      
      // Look for specific price patterns visible in screenshots
      const specificPrices = [];
      const patterns = [
        /(\d{1,2}[,.]?\d{3})\s*₪/g,  // 9,321 ₪
        /₪\s*(\d{1,2}[,.]?\d{3})/g,  // ₪ 9,321
      ];
      
      for (const pattern of patterns) {
        let m;
        while ((m = pattern.exec(allText)) !== null) {
          const num = parseInt(m[1].replace(/[,\.]/g, ''), 10);
          if (num >= 5000 && num <= 50000) {
            specificPrices.push(num);
          }
        }
      }
      
      return {
        prices: [...new Set([...prices1, ...specificPrices])].sort((a, b) => a - b),
        sampleText,
        priceElementCount: priceElements.length,
        foundAnyPriceSymbol: allText.includes('₪'),
        foundNumbers: (allText.match(/\d{4,5}/g) || []).slice(0, 20)
      };
    });
    
    console.log(`    Found ${priceData.prices.length} valid prices`);
    console.log(`    Prices: ${priceData.prices.slice(0, 10).join(', ')}`);
    console.log(`    Price elements in DOM: ${priceData.priceElementCount}`);
    console.log(`    Found ₪ symbol: ${priceData.foundAnyPriceSymbol}`);
    console.log(`    Numbers found: ${priceData.foundNumbers.join(', ')}`);
    
    if (priceData.prices.length > 0) {
      // Get the cheapest price
      price = priceData.prices[0];
      console.log(`    ✅ Selected price: ₪${price.toLocaleString()}`);
    } else {
      console.log(`    ❌ No valid prices found`);
      // Log more debug info
      console.log(`    Sample text (first 1000 chars):`);
      console.log(priceData.sampleText.substring(0, 1000));
    }
    
    await saveScreenshot(page, `isrotel-${hotel.slug}-${dates.label.replace('/', '-')}`);
    
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
