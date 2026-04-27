/**
 * Astral Hotels Scraper
 * Scrapes prices from Astral website (Queen of Sheba)
 * Configuration: 2 adults + 1 child + 1 infant
 * 
 * Uses direct URL with double-encoded roomsGuests parameter
 * Single persistent context with cookie warming to avoid WAF blocks
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
const CHILDREN = 1;
const INFANTS = 1;

// Date ranges to check
const DATE_RANGES = [
  { checkIn: '2026-06-07', checkOut: '2026-06-11', label: '7-11/06' },
  { checkIn: '2026-06-14', checkOut: '2026-06-18', label: '14-18/06' },
  { checkIn: '2026-06-21', checkOut: '2026-06-25', label: '21-25/06' }
];

/**
 * Build search URL with dates and guests
 * Uses DOUBLE URL encoding for roomsGuests, matching exactly how the real site works
 * Example working URL:
 * https://www.astralhotels.co.il/hotels/astral-queen-of-sheba?hotelIdList=11104&fromDate=2026-06-14&toDate=2026-06-18&roomsGuests=%255B%257B%2522adults%2522%253A2%252C%2522children%2522%253A1%252C%2522infants%2522%253A1%257D%255D
 */
function buildSearchUrl(checkIn, checkOut) {
  const roomsData = [{ adults: ADULTS, children: CHILDREN, infants: INFANTS }];
  const roomsJson = JSON.stringify(roomsData);
  // Double encode - this is how the real site does it
  const roomsDoubleEncoded = encodeURIComponent(encodeURIComponent(roomsJson));
  
  return `https://www.astralhotels.co.il/hotels/${HOTEL.slug}?hotelIdList=${HOTEL.hotelId}&fromDate=${checkIn}&toDate=${checkOut}&roomsGuests=${roomsDoubleEncoded}`;
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
 * Extract prices from a page
 */
async function extractPrices(page) {
  return await page.evaluate(() => {
    const allText = document.body.innerText;
    
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
        if (num >= 5000 && num <= 50000) {
          allPrices.push(num);
        }
      }
    }
    
    // Also look for room cards
    const roomCards = document.querySelectorAll('[class*="room"], [class*="Room"], [class*="card"], [class*="Card"], [class*="price"], [class*="Price"]');
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
      bodySnippet: allText.substring(0, 500),
      isBlocked: allText.includes('request is blocked') || allText.includes('Access Denied'),
      hasResults: allText.includes('₪') || allText.includes('חדר')
    };
  });
}

/**
 * Main scraping function
 * Uses a SINGLE browser context for all requests (cookie persistence)
 */
async function scrapeAstral() {
  console.log('\n🏨 Starting Astral scraper (Direct URL + Stealth)...');
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
      '--disable-blink-features=AutomationControlled'
    ]
  });
  
  // Create ONE context for all requests - cookies will persist
  const context = await browser.newContext({
    locale: 'he-IL',
    timezoneId: 'Asia/Jerusalem',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    hasTouch: false,
    isMobile: false,
    extraHTTPHeaders: {
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
      'Accept-Language': 'he-IL,he;q=0.9,en-US;q=0.8,en;q=0.7',
      'Cache-Control': 'no-cache',
      'Sec-Ch-Ua': '"Chromium";v="136", "Google Chrome";v="136", "Not-A.Brand";v="99"',
      'Sec-Ch-Ua-Mobile': '?0',
      'Sec-Ch-Ua-Platform': '"Windows"',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'Upgrade-Insecure-Requests': '1'
    }
  });
  
  // Capture API responses for prices
  const apiPrices = {};
  
  try {
    // === STEP 1: Warm up - visit homepage to get cookies ===
    console.log('   🔑 Warming up - visiting homepage for cookies...');
    const warmupPage = await context.newPage();
    
    try {
      await warmupPage.goto('https://www.astralhotels.co.il/', { 
        waitUntil: 'networkidle', 
        timeout: 30000 
      });
      
      // Wait for any WAF challenge/cookies to be set
      await warmupPage.waitForTimeout(3000);
      
      // Check if homepage loaded OK
      const homepageText = await warmupPage.evaluate(() => document.body.innerText.substring(0, 300));
      const isBlocked = homepageText.includes('blocked') || homepageText.includes('Access Denied');
      
      if (isBlocked) {
        console.log('   ⚠️ Homepage is blocked, waiting for challenge...');
        // Wait longer - some WAFs need time to set cookies via JS
        await warmupPage.waitForTimeout(10000);
      } else {
        console.log('   ✓ Homepage loaded successfully');
      }
      
      // Click around a bit to look more human
      await warmupPage.mouse.move(500, 300);
      await warmupPage.waitForTimeout(500);
      await warmupPage.mouse.move(800, 400);
      await warmupPage.waitForTimeout(1000);
      
    } catch (e) {
      console.log(`   ⚠️ Homepage warmup failed: ${e.message}`);
    }
    
    await warmupPage.close();
    
    // Small delay between homepage and search
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));
    
    // === STEP 2: Visit hotel page first (natural browsing flow) ===
    console.log('   🏨 Visiting hotel page...');
    const hotelPage = await context.newPage();
    
    try {
      await hotelPage.goto(`https://www.astralhotels.co.il/hotels/${HOTEL.slug}`, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });
      await hotelPage.waitForTimeout(3000);
      
      const hotelPageData = await hotelPage.evaluate(() => ({
        title: document.title,
        isBlocked: document.body.innerText.includes('blocked')
      }));
      
      if (hotelPageData.isBlocked) {
        console.log('   ⚠️ Hotel page blocked, waiting...');
        await hotelPage.waitForTimeout(10000);
      } else {
        console.log(`   ✓ Hotel page loaded: ${hotelPageData.title}`);
      }
    } catch (e) {
      console.log(`   ⚠️ Hotel page failed: ${e.message}`);
    }
    
    await hotelPage.close();
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 1000));
    
    // === STEP 3: Now search each date range ===
    for (const dates of DATE_RANGES) {
      console.log(`\n  📍 Checking ${dates.label}...`);
      
      const searchUrl = buildSearchUrl(dates.checkIn, dates.checkOut);
      console.log(`    URL: ...fromDate=${dates.checkIn}&toDate=${dates.checkOut}&roomsGuests=...`);
      
      const page = await context.newPage();
      apiPrices[dates.label] = [];
      
      // Listen for API responses
      page.on('response', async (response) => {
        const url = response.url();
        if (url.includes('availability') || url.includes('search') || 
            url.includes('rooms') || url.includes('rate') || url.includes('price')) {
          try {
            const contentType = response.headers()['content-type'] || '';
            if (contentType.includes('json')) {
              const data = await response.json();
              const jsonStr = JSON.stringify(data);
              const priceMatches = jsonStr.match(/["\']?(?:price|total|amount|rate|Price|Total|totalPrice)["\']?\s*:\s*(\d+)/gi) || [];
              for (const match of priceMatches) {
                const num = parseInt(match.replace(/[^\d]/g, ''), 10);
                if (num >= 5000 && num <= 50000) {
                  apiPrices[dates.label].push(num);
                  console.log(`    API price: ${num}`);
                }
              }
            }
          } catch (e) {}
        }
      });
      
      try {
        // Navigate to search URL
        await page.goto(searchUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });
        
        // Wait for loading to finish
        console.log(`    Waiting for results...`);
        try {
          await page.waitForFunction(() => {
            const text = document.body.innerText || '';
            return text.includes('₪') || text.includes('blocked') || 
                   text.includes('לא נמצאו') || text.includes('אין חדרים');
          }, { timeout: 20000 });
        } catch (e) {
          console.log(`    Still loading after 20s...`);
        }
        
        await page.waitForTimeout(3000);
        
        // Take screenshot
        await saveScreenshot(page, `astral-${dates.label.replace('/', '-')}`);
        
        // Extract prices
        const priceData = await extractPrices(page);
        
        if (priceData.isBlocked) {
          console.log(`    ❌ Request blocked by WAF`);
          console.log(`    Body: ${priceData.bodySnippet.substring(0, 100)}`);
          results[HOTEL.name][dates.label] = null;
        } else {
          const pagePrices = priceData.prices;
          const apiFound = apiPrices[dates.label] || [];
          const allPrices = [...new Set([...pagePrices, ...apiFound])].sort((a, b) => a - b);
          
          console.log(`    Page prices: ${pagePrices.join(', ') || 'none'}`);
          console.log(`    API prices: ${apiFound.join(', ') || 'none'}`);
          
          if (allPrices.length > 0) {
            results[HOTEL.name][dates.label] = allPrices[0];
            console.log(`    ✓ Best price: ₪${allPrices[0].toLocaleString()}`);
          } else {
            results[HOTEL.name][dates.label] = null;
            console.log(`    ✗ No prices found`);
          }
        }
        
      } catch (error) {
        console.error(`    Error: ${error.message}`);
        try { await saveScreenshot(page, `astral-error-${dates.label.replace('/', '-')}`); } catch (e) {}
        results[HOTEL.name][dates.label] = null;
      }
      
      await page.close();
      
      // Random delay between searches
      const delay = 3000 + Math.random() * 3000;
      await new Promise(r => setTimeout(r, delay));
    }
    
  } finally {
    await context.close();
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

if (require.main === module) {
  scrapeAstral()
    .then(results => console.log('\nFinal:', JSON.stringify(results, null, 2)))
    .catch(err => { console.error('Failed:', err); process.exit(1); });
}
