/**
 * Hotel Price Monitor - Main Entry Point
 * Orchestrates scraping and notifications
 */

require('dotenv').config();

const { scrapeIsrotel } = require('./scrapers/isrotel');
const { scrapeAstral } = require('./scrapers/astral');
const { sendMessage, formatPriceUpdate, sendErrorNotification } = require('./telegram');
const { addEntry, comparePrices, getLastPrices } = require('./history');

/**
 * Main execution function
 */
async function main() {
  const startTime = Date.now();
  console.log('🚀 Starting hotel price check...');
  console.log(`⏰ Time: ${new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' })}`);
  console.log('─'.repeat(40));
  
  const timestamp = new Date().toISOString();
  const errors = [];
  
  try {
    // Scrape all hotels
    let allPrices = {};
    
    // Scrape Isrotel
    console.log('\n📊 Scraping Isrotel hotels...');
    try {
      const isrotelPrices = await scrapeIsrotel();
      allPrices = { ...allPrices, ...isrotelPrices };
    } catch (error) {
      console.error('❌ Isrotel scraping failed:', error.message);
      errors.push(`Isrotel: ${error.message}`);
    }
    
    // Scrape Astral
    console.log('\n📊 Scraping Astral hotels...');
    try {
      const astralPrices = await scrapeAstral();
      allPrices = { ...allPrices, ...astralPrices };
    } catch (error) {
      console.error('❌ Astral scraping failed:', error.message);
      errors.push(`Astral: ${error.message}`);
    }
    
    // Check if we got any prices
    const hasAnyPrices = Object.values(allPrices).some(hotel => 
      Object.values(hotel).some(price => price !== null)
    );
    
    if (!hasAnyPrices) {
      throw new Error('No prices were retrieved from any hotel');
    }
    
    // Compare with previous prices
    const comparison = comparePrices(allPrices);
    
    // Save to history
    console.log('\n💾 Saving to history...');
    addEntry(allPrices);
    
    // Format and send Telegram message
    console.log('\n📱 Sending Telegram notification...');
    let message = formatPriceUpdate(allPrices, timestamp);
    
    // Add price change information if any
    if (comparison.changes.length > 0) {
      message += '\n\n📈 <b>שינויים מהבדיקה הקודמת:</b>\n';
      for (const change of comparison.changes) {
        const emoji = change.direction === 'up' ? '🔺' : '🔻';
        const sign = change.direction === 'up' ? '+' : '';
        message += `${emoji} ${change.hotel} (${change.dates}): ${sign}₪${Math.abs(change.diff)} (${sign}${change.percentChange}%)\n`;
      }
    }
    
    // Add errors if any
    if (errors.length > 0) {
      message += '\n\n⚠️ <b>שגיאות:</b>\n';
      for (const error of errors) {
        message += `• ${error}\n`;
      }
    }
    
    await sendMessage(message);
    
    // Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n' + '─'.repeat(40));
    console.log(`✅ Done! Duration: ${duration}s`);
    console.log(`📊 Hotels checked: ${Object.keys(allPrices).length}`);
    console.log(`📈 Price changes: ${comparison.changes.length}`);
    
  } catch (error) {
    console.error('\n❌ Fatal error:', error.message);
    
    // Try to send error notification
    try {
      await sendErrorNotification(error);
    } catch (telegramError) {
      console.error('Failed to send error notification:', telegramError.message);
    }
    
    process.exit(1);
  }
}

// Run
main().catch(console.error);
