/**
 * Astral Hotels Scraper
 * Scrapes prices from Astral website (Queen of Sheba)
 * Configuration: 2 adults + 1 child + 1 infant
 * 
 * Uses direct URL navigation (no calendar interaction needed!)
 */

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

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
  // roomsGuests is double-URL-encoded JSON
  const roomsData = [{ adults: ADULTS, children: CHILDREN, infants: INFANTS }];
  const roomsJson = JSON.stringify(roomsData);
  // Double encode: first encode, then encode again
  const roomsEncoded = encodeURIComponent(encodeURIComponent(roomsJson));
  
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
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 }
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
    
    // Wait for content to load
    await page.waitForTimeout(5000);
    
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
  console.log('\n🏨 Starting Astral scraper (Direct URL method)...');
  console.log(`   Hotel: ${HOTEL.name}`);
  console.log(`   Guests: ${ADULTS} adults + ${CHILDREN} child + ${INFANTS} infant`);
  
  const results = {
    [HOTEL.name]: {}
  };
  
  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  });
  
  try {
    for (const dates of DATE_RANGES) {
      const price = await scrapePrice(browser, dates);
      results[HOTEL.name][dates.label] = price;
      
      // Small delay between requests
      await new Promise(r => setTimeout(r, 2000));
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
    
    // Navigate to hotel page - use domcontentloaded for faster load
    await page.goto(HOTEL.url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000); // Wait for dynamic content
    
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
        
        // 2. The calendar is an infinite scroll - need to scroll to June 2026
        console.log(`    Scrolling calendar to June 2026...`);
        
        // Scroll the calendar container to show June
        const scrolledToJune = await page.evaluate(() => {
          // Find calendar container
          const calendarContainers = document.querySelectorAll('[class*="calendar"], [class*="Calendar"], [class*="scroll"]');
          
          for (const container of calendarContainers) {
            // Check if this container has month labels
            const text = container.innerText || '';
            if (text.includes('אפריל') || text.includes('April') || text.includes('מאי')) {
              // Found calendar, now find June section
              const allElements = container.querySelectorAll('*');
              for (const el of allElements) {
                const elText = el.innerText || '';
                if ((elText.includes('יוני 2026') || elText.includes('יוני') && elText.length < 30)) {
                  el.scrollIntoView({ behavior: 'instant', block: 'center' });
                  return 'Scrolled to June';
                }
              }
              
              // If can't find June label, try scrolling the container down
              container.scrollTop += 400;
              return 'Scrolled container down';
            }
          }
          
          // Alternative: find any element mentioning June and scroll to it
          const allPageElements = document.querySelectorAll('*');
          for (const el of allPageElements) {
            const text = (el.innerText || '').trim();
            if (text === 'יוני 2026' || text === 'June 2026' || 
                (text.includes('יוני') && text.includes('2026') && text.length < 30)) {
              el.scrollIntoView({ behavior: 'instant', block: 'center' });
              return 'Scrolled to June element';
            }
          }
          
          return null;
        });
        
        if (scrolledToJune) {
          console.log(`    ✓ ${scrolledToJune}`);
        }
        await page.waitForTimeout(800);
        
        // 3. Select check-in day (7) - look for day 7 in June section
        const checkInDay = checkIn.getDate(); // 7
        console.log(`    Looking for day ${checkInDay} in June...`);
        
        // Click on the check-in date - need to find it in June section
        const checkInClicked = await page.evaluate(({ day }) => {
          // Strategy: Find the June 2026 label, then look for nearby day buttons
          let juneSection = null;
          const allElements = document.querySelectorAll('*');
          
          // Find June section
          for (const el of allElements) {
            const text = (el.innerText || '').trim();
            if ((text === 'יוני 2026' || text === 'June 2026' || text.includes('יוני')) && text.length < 30) {
              // Found June label - its parent should be the month container
              juneSection = el.parentElement?.parentElement || el.parentElement;
              break;
            }
          }
          
          // If found June section, look for day buttons within it
          if (juneSection) {
            const dayButtons = juneSection.querySelectorAll('button, [role="button"], abbr, td, span');
            for (const btn of dayButtons) {
              const text = (btn.innerText || btn.textContent || '').trim();
              if (text === String(day)) {
                const isDisabled = btn.disabled || btn.getAttribute('aria-disabled') === 'true';
                if (!isDisabled) {
                  btn.click();
                  return `Clicked day ${day} in June section`;
                }
              }
            }
          }
          
          // Fallback: search through all day buttons and count occurrences
          // We want the 3rd occurrence of the day number (April, May, June)
          const allDayButtons = document.querySelectorAll('button, [role="button"], abbr, td');
          const matches = [];
          for (const btn of allDayButtons) {
            const text = (btn.innerText || btn.textContent || '').trim();
            if (text === String(day) || text.startsWith(String(day) + '\n')) {
              const isDisabled = btn.disabled || btn.getAttribute('aria-disabled') === 'true' ||
                                 btn.classList.toString().includes('disabled');
              if (!isDisabled) {
                matches.push(btn);
              }
            }
          }
          
          // Click the 3rd match (index 2) which should be June
          // (April=0, May=1, June=2)
          if (matches.length >= 3) {
            matches[2].click();
            return `Clicked 3rd occurrence of day ${day} (June)`;
          } else if (matches.length > 0) {
            // If less than 3, click the last one
            matches[matches.length - 1].click();
            return `Clicked last occurrence of day ${day}`;
          }
          
          return null;
        }, { day: checkInDay });
        
        if (checkInClicked) {
          console.log(`    ✓ ${checkInClicked}`);
          await page.waitForTimeout(700);
        } else {
          console.log(`    Could not click check-in day`);
        }
        
        // 4. Select check-out day (11) in June
        const checkOutDay = checkOut.getDate(); // 11
        console.log(`    Looking for checkout day ${checkOutDay} in June...`);
        
        const checkoutClicked = await page.evaluate(({ day }) => {
          // Same strategy - find June section or use 3rd occurrence
          let juneSection = null;
          const allElements = document.querySelectorAll('*');
          
          for (const el of allElements) {
            const text = (el.innerText || '').trim();
            if ((text === 'יוני 2026' || text === 'June 2026' || text.includes('יוני')) && text.length < 30) {
              juneSection = el.parentElement?.parentElement || el.parentElement;
              break;
            }
          }
          
          if (juneSection) {
            const dayButtons = juneSection.querySelectorAll('button, [role="button"], abbr, td, span');
            for (const btn of dayButtons) {
              const text = (btn.innerText || btn.textContent || '').trim();
              if (text === String(day)) {
                const isDisabled = btn.disabled || btn.getAttribute('aria-disabled') === 'true';
                if (!isDisabled) {
                  btn.click();
                  return `Clicked day ${day} in June section`;
                }
              }
            }
          }
          
          // Fallback: 3rd occurrence
          const allDayButtons = document.querySelectorAll('button, [role="button"], abbr, td');
          const matches = [];
          for (const btn of allDayButtons) {
            const text = (btn.innerText || btn.textContent || '').trim();
            if (text === String(day) || text.startsWith(String(day) + '\n')) {
              const isDisabled = btn.disabled || btn.getAttribute('aria-disabled') === 'true' ||
                                 btn.classList.toString().includes('disabled');
              if (!isDisabled) {
                matches.push(btn);
              }
            }
          }
          
          if (matches.length >= 3) {
            matches[2].click();
            return `Clicked 3rd occurrence of day ${day} (June)`;
          } else if (matches.length > 0) {
            matches[matches.length - 1].click();
            return `Clicked last occurrence of day ${day}`;
          }
          
          return null;
        }, { day: checkOutDay });
        
        if (checkoutClicked) {
          console.log(`    ✓ ${checkoutClicked}`);
          await page.waitForTimeout(700);
        } else {
          console.log(`    Could not click check-out day`);
        }
      }
      
      // 5. Click "המשך" (Continue) button if present
      const continueBtn = await page.$('button:has-text("המשך")');
      if (continueBtn) {
        await continueBtn.click();
        console.log(`    Clicked continue`);
        await page.waitForTimeout(1000);
      }
      
      // 6. Set guests count
      const guestsButton = await page.$('button:has-text("אורחים"), [class*="guest"]');
      if (guestsButton) {
        await guestsButton.click();
        await page.waitForTimeout(1000);
        console.log(`    Setting guests: ${ADULTS} adults + ${CHILDREN} children + ${INFANTS} infants`);
      }
      
      // 7. Click search button
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