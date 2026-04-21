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
  slug: 'queen-of-sheba',
  code: 'queen-of-sheba'
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
 * Scrape price for a date range by automating the booking form
 * Has a 60 second timeout to prevent hanging
 */
async function scrapePrice(browser, dates) {
  const TIMEOUT = 60000; // 60 seconds max per date range
  
  const scrapeWithTimeout = async () => {
    const context = await browser.newContext({
      locale: 'he-IL',
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      viewport: { width: 1920, height: 1080 }
    });
    
    const page = await context.newPage();
  let price = null;
  
  // Capture API responses
  const apiPrices = [];
  page.on('response', async (response) => {
    const url = response.url();
    // Look for API calls that might contain prices
    if (url.includes('availability') || url.includes('search') || url.includes('rooms') || url.includes('rate')) {
      try {
        const contentType = response.headers()['content-type'] || '';
        if (contentType.includes('json')) {
          const data = await response.json();
          const jsonStr = JSON.stringify(data);
          // Extract prices from JSON
          const priceMatches = jsonStr.match(/["\']?(?:price|total|amount|rate)["\']?\s*:\s*(\d+)/gi) || [];
          for (const match of priceMatches) {
            const num = parseInt(match.replace(/[^\d]/g, ''), 10);
            if (num >= 5000 && num <= 50000) {
              apiPrices.push(num);
              console.log(`    API price found: ${num}`);
            }
          }
        }
      } catch (e) {}
    }
  });
  
  try {
    console.log(`  📍 Checking ${HOTEL.name} for ${dates.label}...`);
    
    // Navigate to hotel page
    await page.goto(HOTEL.url, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
    
    // Parse dates
    const checkIn = new Date(dates.checkIn);
    const checkOut = new Date(dates.checkOut);
    
    console.log(`    Selecting dates: ${dates.checkIn} to ${dates.checkOut}`);
    
    // Try to interact with booking form
    try {
      // 1. Click on date picker button
      const dateButton = await page.$('button:has-text("לבחירת תאריכים"), [data-testid="date-picker"], .date-picker-trigger');
      if (dateButton) {
        await dateButton.click();
        await page.waitForTimeout(1500);
        console.log(`    Opened date picker`);
        
        // 2. Navigate to correct month (June 2026)
        // We need to navigate from current month (April 2026) to June 2026 - about 2 months forward
        console.log(`    Navigating to June 2026...`);
        
        for (let i = 0; i < 5; i++) { // Navigate max 5 times, then give up
          // Check current calendar month
          const calendarText = await page.evaluate(() => {
            // Get all text from calendar area
            const calendarArea = document.querySelector('[class*="calendar"], [class*="Calendar"], [class*="datepicker"], [class*="DatePicker"], [role="dialog"]');
            return calendarArea ? calendarArea.innerText : '';
          });
          
          if (!calendarText) {
            console.log(`    Calendar not found, skipping date selection`);
            break;
          }
          
          console.log(`    Calendar month: ${calendarText.substring(0, 50)}...`);
          
          // Check if we found June 2026
          const hasJune = calendarText.includes('יוני') || calendarText.includes('June');
          const has2026 = calendarText.includes('2026');
          
          if (hasJune && has2026) {
            console.log(`    ✓ Found June 2026`);
            break;
          }
          
          // Try to click next month button
          const clicked = await page.evaluate(() => {
            const selectors = [
              '[class*="next"]', '[class*="Next"]',
              '[aria-label*="next"]', '[aria-label*="Next"]',
              'button svg[class*="right"]',
              '.react-datepicker__navigation--next'
            ];
            for (const sel of selectors) {
              const btn = document.querySelector(sel);
              if (btn) {
                btn.click();
                return sel;
              }
            }
            return null;
          });
          
          if (clicked) {
            console.log(`    Clicked next: ${clicked}`);
            await page.waitForTimeout(500);
          } else {
            console.log(`    No next button found, stopping navigation`);
            break;
          }
        }
        
        // 3. Select check-in day (7)
        const checkInDay = checkIn.getDate().toString();
        console.log(`    Looking for day ${checkInDay}...`);
        
        // Find clickable day elements
        const dayClicked = await page.evaluate((day) => {
          // Find all elements that might be day buttons
          const allElements = document.querySelectorAll('button, td, div[role="button"], span[role="button"], [class*="day"], [class*="Day"]');
          for (const el of allElements) {
            const text = (el.innerText || el.textContent || '').trim();
            if (text === day && !el.classList.toString().includes('disabled')) {
              el.click();
              return true;
            }
          }
          return false;
        }, checkInDay);
        
        if (dayClicked) {
          console.log(`    ✓ Selected check-in: day ${checkInDay}`);
          await page.waitForTimeout(500);
        }
        
        // 4. Select check-out day (11)
        const checkOutDay = checkOut.getDate().toString();
        console.log(`    Looking for checkout day ${checkOutDay}...`);
        
        const checkoutClicked = await page.evaluate((day) => {
          const allElements = document.querySelectorAll('button, td, div[role="button"], span[role="button"], [class*="day"], [class*="Day"]');
          for (const el of allElements) {
            const text = (el.innerText || el.textContent || '').trim();
            if (text === day && !el.classList.toString().includes('disabled')) {
              el.click();
              return true;
            }
          }
          return false;
        }, checkOutDay);
        
        if (checkoutClicked) {
          console.log(`    ✓ Selected check-out: day ${checkOutDay}`);
          await page.waitForTimeout(500);
        }
      }
      
      // 5. Set guests count
      const guestsButton = await page.$('button:has-text("אורחים"), [class*="guest"]');
      if (guestsButton) {
        await guestsButton.click();
        await page.waitForTimeout(1000);
        
        // Try to increase adults and children
        // This is very site-specific
        console.log(`    Setting guests: ${ADULTS} adults + ${CHILDREN} children + ${INFANTS} infants`);
      }
      
      // 6. Click search button
      const searchButton = await page.$('button:has-text("קחו אותי לחופשה"), button:has-text("חיפוש"), button[type="submit"]');
      if (searchButton) {
        await searchButton.click();
        console.log(`    Clicked search`);
        await page.waitForTimeout(5000);
      }
      
    } catch (formError) {
      console.log(`    Form interaction error: ${formError.message}`);
    }
    
    await page.waitForTimeout(3000);
    
    // Extract prices from the page
    const priceData = await page.evaluate(() => {
      const allText = document.body.innerText;
      
      // Find all price patterns
      const priceRegex = /₪\s*([\d,]+)/g;
      const allPrices = [];
      let match;
      
      while ((match = priceRegex.exec(allText)) !== null) {
        const numStr = match[1].replace(/,/g, '');
        const num = parseInt(numStr, 10);
        if (num >= 5000 && num <= 50000) {
          allPrices.push(num);
        }
      }
      
      return {
        prices: [...new Set(allPrices)].sort((a, b) => a - b),
        debugText: allText.substring(0, 2000)
      };
    });
    
    console.log(`    Page prices: ${priceData.prices.slice(0, 5).join(', ')}`);
    console.log(`    API prices: ${apiPrices.slice(0, 5).join(', ')}`);
    
    // Combine page and API prices
    const allPrices = [...new Set([...priceData.prices, ...apiPrices])].sort((a, b) => a - b);
    
    if (allPrices.length > 0) {
      price = allPrices[0];
      console.log(`    ✅ Selected price: ₪${price.toLocaleString()}`);
    } else {
      console.log(`    ❌ No valid prices found`);
    }
    
    await saveScreenshot(page, `astral-${HOTEL.slug}-${dates.label.replace('/', '-')}`);
    
    return price;
    
  } catch (error) {
    console.error(`    ❌ Error: ${error.message}`);
    try {
      await saveScreenshot(page, `astral-error-${HOTEL.slug}`);
    } catch (e) {}
    return null;
  } finally {
    await context.close();
  }
  };
  
  // Run with timeout
  try {
    return await Promise.race([
      scrapeWithTimeout(),
      new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Timeout after 60 seconds')), TIMEOUT)
      )
    ]);
  } catch (error) {
    console.log(`    ⏱️ Astral scrape timeout or error: ${error.message}`);
    return null;
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