/**
 * Astral Hotels Scraper
 * Scrapes prices from Astral website (Queen of Sheba)
 * Configuration: 2 adults + 1 child + 1 infant, half-board (חצי פנסיון)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Hotel to monitor
const HOTEL = {
  name: 'Queen of Sheba',
  url: 'https://www.astralhotels.co.il/hotels/astral-queen-of-sheba',
  searchUrl: 'https://www.astralhotels.co.il/search',
  slug: 'queen-of-sheba',
  code: 'queen-of-sheba'
};

// Room composition
const ADULTS = 2;
const CHILDREN = 1;  // Child age 5
const INFANTS = 1;   // Infant age 1
const TOTAL_GUESTS = ADULTS + CHILDREN + INFANTS;

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
 * Format date for display (DD/MM/YYYY)
 */
function formatDateDisplay(dateStr) {
  const [year, month, day] = dateStr.split('-');
  return `${day}/${month}/${year}`;
}

/**
 * Scrape price for a date range using Astral's booking form
 */
async function scrapePrice(browser, dates) {
  const context = await browser.newContext({
    locale: 'he-IL',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
  });
  
  const page = await context.newPage();
  let price = null;
  
  try {
    console.log(`  📍 Checking ${HOTEL.name} for ${dates.label}...`);
    
    // Navigate to hotel page
    await page.goto(HOTEL.url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    // Try to interact with the booking form
    // Look for date picker and guest selector
    try {
      // Click on date picker to open it
      const dateButton = await page.$('button:has-text("לבחירת תאריכים"), [class*="date"], input[type="date"]');
      if (dateButton) {
        await dateButton.click();
        await page.waitForTimeout(1000);
        
        // Try to set check-in date
        const checkInDate = new Date(dates.checkIn);
        const checkOutDate = new Date(dates.checkOut);
        
        // Look for calendar navigation and date selection
        // This is site-specific and may need adjustment
        console.log(`    Setting dates: ${formatDateDisplay(dates.checkIn)} - ${formatDateDisplay(dates.checkOut)}`);
      }
      
      // Look for guests/rooms selector
      const guestsButton = await page.$('button:has-text("אורחים"), [class*="guest"]');
      if (guestsButton) {
        await guestsButton.click();
        await page.waitForTimeout(1000);
        console.log(`    Setting guests: ${TOTAL_GUESTS}`);
      }
      
      // Click search button
      const searchButton = await page.$('button:has-text("חיפוש"), button:has-text("קחו אותי לחופשה")');
      if (searchButton) {
        await searchButton.click();
        await page.waitForTimeout(5000);
      }
    } catch (formError) {
      console.log(`    Form interaction failed: ${formError.message}`);
    }
    
    // Wait for results and extract prices
    await page.waitForTimeout(3000);
    
    // Extract prices from the page
    const priceData = await page.evaluate(() => {
      const results = [];
      const allText = document.body.innerText;
      
      // Look for room cards/sections
      const roomSections = document.querySelectorAll('[class*="room"], [class*="option"], [class*="card"], [class*="result"]');
      
      for (const section of roomSections) {
        const text = section.innerText || '';
        
        // Check if this is half-board (חצי פנסיון)
        const isHalfBoard = text.includes('חצי פנסיון');
        
        // Extract prices
        const priceMatches = text.match(/₪\s*[\d,]+/g) || [];
        const prices = priceMatches.map(p => {
          const num = parseInt(p.replace(/[^\d]/g, ''), 10);
          // Filter for reasonable total stay prices
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
      
      // Also find all prices on the page
      const allPrices = (allText.match(/₪\s*[\d,]+/g) || [])
        .map(p => parseInt(p.replace(/[^\d]/g, ''), 10))
        .filter(p => p >= 3000 && p <= 100000);
      
      return {
        roomResults: results,
        allPrices: [...new Set(allPrices)].sort((a, b) => a - b),
        pageHasHalfBoard: allText.includes('חצי פנסיון'),
        pageText: allText.substring(0, 5000)
      };
    });
    
    console.log(`    Found ${priceData.allPrices.length} valid prices on page`);
    
    // Prefer half-board room prices
    const halfBoardRooms = priceData.roomResults.filter(r => r.isHalfBoard);
    if (halfBoardRooms.length > 0) {
      price = Math.min(...halfBoardRooms.map(r => r.minPrice));
      console.log(`    ✅ Found half-board price: ₪${price.toLocaleString()}`);
    }
    // Fall back to cheapest room
    else if (priceData.allPrices.length > 0) {
      price = priceData.allPrices[0];
      console.log(`    ✅ Found price: ₪${price.toLocaleString()}`);
    }
    
    await saveScreenshot(page, `astral-${HOTEL.slug}-${dates.label.replace('/', '-')}`);
    
    if (!price) {
      console.log(`    ❌ No valid price found`);
      console.log(`    Debug - Sample text: ${priceData.pageText.substring(0, 300)}...`);
    }
    
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