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
    await page.waitForTimeout(3000);
    
    // Wait for room results to load
    await page.waitForSelector('.room-card, .search-result, [class*="room"], [class*="price"]', { timeout: 10000 }).catch(() => {});
    
    // Try to find half-board (חצי פנסיון) prices
    // The page structure shows prices in different formats
    const priceData = await page.evaluate(() => {
      const results = [];
      
      // Look for room cards/sections
      const roomSections = document.querySelectorAll('[class*="room"], [class*="option"], .search-result-item, .hotel-room');
      
      for (const section of roomSections) {
        const text = section.innerText || '';
        
        // Check if this is half-board (חצי פנסיון)
        const isHalfBoard = text.includes('חצי פנסיון');
        
        // Extract all prices from this section
        const priceMatches = text.match(/₪\s*[\d,]+/g) || [];
        const prices = priceMatches.map(p => {
          const num = parseInt(p.replace(/[^\d]/g, ''), 10);
          // Filter for reasonable total stay prices (4 nights for 4 people)
          return (num >= 3000 && num <= 100000) ? num : null;
        }).filter(Boolean);
        
        if (prices.length > 0) {
          results.push({
            isHalfBoard,
            prices,
            minPrice: Math.min(...prices)
          });
        }
      }
      
      // Also try to find prices directly on the page
      const allText = document.body.innerText;
      const allPrices = (allText.match(/₪\s*[\d,]+/g) || [])
        .map(p => parseInt(p.replace(/[^\d]/g, ''), 10))
        .filter(p => p >= 3000 && p <= 100000);
      
      return {
        roomResults: results,
        allPrices: [...new Set(allPrices)].sort((a, b) => a - b),
        pageHasHalfBoard: allText.includes('חצי פנסיון'),
        pageText: allText.substring(0, 5000) // For debugging
      };
    });
    
    console.log(`    Found ${priceData.allPrices.length} valid prices on page`);
    
    // Prefer half-board room prices
    const halfBoardRooms = priceData.roomResults.filter(r => r.isHalfBoard);
    if (halfBoardRooms.length > 0) {
      price = Math.min(...halfBoardRooms.map(r => r.minPrice));
      console.log(`    ✅ Found half-board price: ₪${price.toLocaleString()}`);
    } 
    // Fall back to cheapest room if half-board not specifically found
    else if (priceData.allPrices.length > 0) {
      price = priceData.allPrices[0]; // Cheapest valid price
      console.log(`    ✅ Found price: ₪${price.toLocaleString()}`);
    }
    
    await saveScreenshot(page, `isrotel-${hotel.slug}-${dates.label.replace('/', '-')}`);
    
    if (!price) {
      console.log(`    ❌ No valid price found`);
      console.log(`    Debug - Sample text: ${priceData.pageText.substring(0, 500)}...`);
    }
    
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
