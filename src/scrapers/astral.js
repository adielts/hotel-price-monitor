/**
 * Astral Hotels Scraper
 * Scrapes prices from Astral website (Queen of Sheba)
 * Configuration: 2 adults + 1 child + 1 infant
 * 
 * Uses playwright-extra with stealth plugin to avoid bot detection
 */

const { chromium } = require('playwright-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
const fs = require('fs');
const path = require('path');

// Add stealth plugin to avoid detection
chromium.use(StealthPlugin());

// Hotel to monitor
const HOTEL = {
  name: 'Queen of Sheba',
  hotelId: '11104',
  slug: 'astral-queen-of-sheba'
};

// Room composition
const ADULTS = 2;
const CHILDREN = 1;  // Child age 5
const INFANTS = 1;   // Infant age 1

// Date ranges to check (same as Isrotel)
const DATE_RANGES = [
  { checkIn: '2026-06-07', checkOut: '2026-06-11', label: '7-11/06' },
  { checkIn: '2026-06-14', checkOut: '2026-06-18', label: '14-18/06' },
  { checkIn: '2026-06-21', checkOut: '2026-06-25', label: '21-25/06' }
];

/**
 * Build search URL with dates and guests
 * URL format discovered from actual Astral search
 */
function buildSearchUrl(checkIn, checkOut) {
  // roomsGuests - single URL encoding with children ages
  // Format: adults, children count, infants count, plus ages array
  const roomsData = [{ 
    adults: ADULTS, 
    children: CHILDREN, 
    infants: INFANTS,
    childrenAges: [5],  // Child age 5
    infantsAges: [1]    // Infant age 1
  }];
  const roomsJson = JSON.stringify(roomsData);
  // Single encode only
  const roomsEncoded = encodeURIComponent(roomsJson);
  
  return `https://www.astralhotels.co.il/hotels/${HOTEL.slug}?hotelIdList=${HOTEL.hotelId}&fromDate=${checkIn}&toDate=${checkOut}&roomsGuests=${roomsEncoded}`;
}

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
 * Scrape price for a date range using direct URL
 */
async function scrapePrice(browser, dates) {
  const context = await browser.newContext({
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
    extraHTTPHeaders: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
      'Accept-Encoding': 'gzip, deflate, br',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1'
    }
  });
  
  const page = await context.newPage();
  let price = null;
  
  // Capture API responses for prices
  const apiPrices = [];
  page.on('response', async (response) => {
    const url = response.url();
    if (url.includes('availability') || url.includes('search') || url.includes('rooms') || url.includes('rate')) {
      try {
        const contentType = response.headers()['content-type'] || '';
        if (contentType.includes('json')) {
          const data = await response.json();
          const jsonStr = JSON.stringify(data);
          // Extract prices from JSON
          const priceMatches = jsonStr.match(/["\']?(?:price|total|amount|rate|Price|Total)["\']?\s*:\s*(\d+)/gi) || [];
          for (const match of priceMatches) {
            const num = parseInt(match.replace(/[^\d]/g, ''), 10);
            if (num >= 5000 && num <= 50000) {
              apiPrices.push(num);
            }
          }
        }
      } catch (e) {}
    }
  });
  
  try {
    console.log(`  📍 Checking ${HOTEL.name} for ${dates.label}...`);
    
    // Build direct search URL
    const searchUrl = buildSearchUrl(dates.checkIn, dates.checkOut);
    console.log(`    URL: ${searchUrl.substring(0, 80)}...`);
    
    // Navigate directly to search results
    await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
    
    // Wait for prices to load - look for loading indicator to disappear or prices to appear
    console.log(`    Waiting for prices to load...`);
    
    // Wait for loading indicator to disappear (text: "החיפוש שלך בדרך")
    try {
      await page.waitForFunction(() => {
        const bodyText = document.body.innerText || '';
        const isLoading = bodyText.includes('החיפוש שלך בדרך') || bodyText.includes('טוען');
        const hasPrice = bodyText.includes('₪') || bodyText.match(/\d{1,2},\d{3}/);
        return !isLoading || hasPrice;
      }, { timeout: 30000 });
    } catch (e) {
      console.log(`    Loading indicator timeout, continuing...`);
    }
    
    // Additional wait for dynamic content
    await page.waitForTimeout(3000);
    
    // Wait for price elements to appear
    try {
      await page.waitForFunction(() => {
        const bodyText = document.body.innerText || '';
        return bodyText.includes('₪') || bodyText.match(/\d{1,2},\d{3}/);
      }, { timeout: 15000 });
    } catch (e) {
      console.log(`    No price elements found after waiting`);
    }
    
    // Final short wait for any animations
    await page.waitForTimeout(2000);
    
    // Take screenshot
    await saveScreenshot(page, `astral-${dates.label.replace('/', '-')}`);
    
    // Extract prices from the page
    const priceData = await page.evaluate(() => {
      const allText = document.body.innerText;
      
      // Find all price patterns: ₪X,XXX or just numbers near "סה"כ"
      const pricePatterns = [
        /₪\s*([\d,]+)/g,
        /(\d{1,2},\d{3})\s*₪/g,
        /סה"כ[:\s]*([\d,]+)/g,
        /מחיר[:\s]*([\d,]+)/g,
        /לחדר[:\s]*([\d,]+)/g
      ];
      
      const allPrices = [];
      
      for (const regex of pricePatterns) {
        let match;
        while ((match = regex.exec(allText)) !== null) {
          const numStr = match[1].replace(/,/g, '');
          const num = parseInt(numStr, 10);
          // Filter for reasonable 4-night stay prices
          if (num >= 5000 && num <= 50000) {
            allPrices.push(num);
          }
        }
      }
      
      // Also look for room cards with prices
      const roomCards = document.querySelectorAll('[class*="room"], [class*="Room"], [class*="card"], [class*="Card"]');
      for (const card of roomCards) {
        const cardText = card.innerText || '';
        const priceMatch = cardText.match(/₪\s*([\d,]+)/);
        if (priceMatch) {
          const num = parseInt(priceMatch[1].replace(/,/g, ''), 10);
          if (num >= 5000 && num <= 50000) {
            allPrices.push(num);
          }
        }
      }
      
      return {
        prices: [...new Set(allPrices)].sort((a, b) => a - b),
        pageTitle: document.title,
        hasResults: !allText.includes('לא נמצאו') && !allText.includes('אין חדרים')
      };
    });
    
    console.log(`    Page prices: ${priceData.prices.slice(0, 5).join(', ') || 'none'}`);
    console.log(`    API prices: ${apiPrices.slice(0, 5).join(', ') || 'none'}`);
    
    // Combine page and API prices
    const allPrices = [...new Set([...priceData.prices, ...apiPrices])].sort((a, b) => a - b);
    
    if (allPrices.length > 0) {
      // Take the lowest reasonable price (likely the base room)
      price = allPrices[0];
      console.log(`    ✓ Best price: ₪${price.toLocaleString()}`);
    } else {
      console.log(`    ✗ No prices found`);
      if (!priceData.hasResults) {
        console.log(`    (Page indicates no availability)`);
      }
    }
    
  } catch (error) {
    console.error(`    Error: ${error.message}`);
    await saveScreenshot(page, `astral-error-${dates.label.replace('/', '-')}`);
  } finally {
    await context.close();
  }
  
  return price;
}

/**
 * Main scraping function
 */
async function scrapeAstral() {
  console.log('\n🏨 Starting Astral scraper (Stealth mode)...');
  console.log(`   Hotel: ${HOTEL.name}`);
  console.log(`   Guests: ${ADULTS} adults + ${CHILDREN} child + ${INFANTS} infant`);
  
  const results = {
    [HOTEL.name]: {}
  };
  
  const browser = await chromium.launch({
    headless: true,
    args: [
      '--no-sandbox', 
      '--disable-setuid-sandbox', 
      '--disable-dev-shm-usage',
      '--disable-blink-features=AutomationControlled',
      '--disable-features=IsolateOrigins,site-per-process'
    ]
  });
  
  // First, visit homepage to establish cookies and look human-like
  try {
    console.log('   📍 Visiting homepage first...');
    const initContext = await browser.newContext({
      locale: 'he-IL',
      timezoneId: 'Asia/Jerusalem',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36'
    });
    const initPage = await initContext.newPage();
    await initPage.goto('https://www.astralhotels.co.il/', { waitUntil: 'networkidle', timeout: 30000 });
    await initPage.waitForTimeout(2000 + Math.random() * 2000);
    await initContext.close();
    console.log('   ✓ Homepage visited');
  } catch (e) {
    console.log(`   ⚠ Homepage visit failed: ${e.message}`);
  }
  
  try {
    for (const dates of DATE_RANGES) {
      const price = await scrapePrice(browser, dates);
      results[HOTEL.name][dates.label] = price;
      
      // Random delay between requests (3-6 seconds) to look more human
      const delay = 3000 + Math.random() * 3000;
      console.log(`    Waiting ${Math.round(delay/1000)}s before next request...`);
      await new Promise(r => setTimeout(r, delay));
    }
  } finally {
    await browser.close();
  }
  
  // Summary
  console.log('\n📊 Astral Results:');
  for (const [label, price] of Object.entries(results[HOTEL.name])) {
    if (price) {
      console.log(`   ${label}: ₪${price.toLocaleString()}`);
    } else {
      console.log(`   ${label}: ❌ לא זמין`);
    }
  }
  
  console.log('✅ Astral scraping complete');
  return results;
}

module.exports = { scrapeAstral, HOTEL, DATE_RANGES };

// Run directly if called as main
if (require.main === module) {
  scrapeAstral()
    .then(results => {
      console.log('\nFinal results:', JSON.stringify(results, null, 2));
    })
    .catch(err => {
      console.error('Scraper failed:', err);
      process.exit(1);
    });
}
