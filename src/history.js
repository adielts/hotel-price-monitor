/**
 * Price History Management Module
 * Handles loading, saving, and analyzing price history
 */

const fs = require('fs');
const path = require('path');

const HISTORY_FILE = path.join(__dirname, '../prices/history.json');

/**
 * Load price history from file
 * @returns {object} - History object with entries array
 */
function loadHistory() {
  try {
    if (fs.existsSync(HISTORY_FILE)) {
      const data = fs.readFileSync(HISTORY_FILE, 'utf8');
      return JSON.parse(data);
    }
  } catch (error) {
    console.error('Error loading history:', error.message);
  }
  return { entries: [] };
}

/**
 * Save history to file
 * @param {object} history - History object to save
 */
function saveHistory(history) {
  const dir = path.dirname(HISTORY_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(HISTORY_FILE, JSON.stringify(history, null, 2), 'utf8');
}

/**
 * Add a new price entry to history
 * @param {object} prices - Current prices
 * @returns {object} - Updated history
 */
function addEntry(prices) {
  const history = loadHistory();
  
  history.entries.push({
    timestamp: new Date().toISOString(),
    prices: prices
  });
  
  // Keep last 30 days only (240 entries at 3-hour intervals)
  const maxEntries = 240;
  if (history.entries.length > maxEntries) {
    history.entries = history.entries.slice(-maxEntries);
  }
  
  saveHistory(history);
  console.log(`💾 History saved. Total entries: ${history.entries.length}`);
  
  return history;
}

/**
 * Get the most recent prices
 * @returns {object|null} - Last prices or null if no history
 */
function getLastPrices() {
  const history = loadHistory();
  if (history.entries.length === 0) return null;
  return history.entries[history.entries.length - 1].prices;
}

/**
 * Compare current prices with previous prices
 * @param {object} currentPrices - Current prices
 * @returns {object} - Comparison result with changes
 */
function comparePrices(currentPrices) {
  const lastPrices = getLastPrices();
  if (!lastPrices) {
    return { hasChanges: true, changes: [], isFirstRun: true };
  }
  
  const changes = [];
  
  for (const [hotel, datesPrices] of Object.entries(currentPrices)) {
    for (const [dates, currentPrice] of Object.entries(datesPrices)) {
      const previousPrice = lastPrices[hotel]?.[dates];
      
      if (previousPrice && currentPrice && previousPrice !== currentPrice) {
        const diff = currentPrice - previousPrice;
        const percentChange = ((diff / previousPrice) * 100).toFixed(1);
        
        changes.push({
          hotel,
          dates,
          previousPrice,
          currentPrice,
          diff,
          percentChange,
          direction: diff > 0 ? 'up' : 'down'
        });
      }
    }
  }
  
  return {
    hasChanges: changes.length > 0,
    changes,
    isFirstRun: false
  };
}

/**
 * Get price statistics for a hotel/date combination
 * @param {string} hotel - Hotel name
 * @param {string} dates - Date range
 * @returns {object} - Stats (min, max, avg, count)
 */
function getPriceStats(hotel, dates) {
  const history = loadHistory();
  const prices = history.entries
    .map(e => e.prices[hotel]?.[dates])
    .filter(p => p && p > 0);
  
  if (prices.length === 0) {
    return { min: null, max: null, avg: null, count: 0 };
  }
  
  return {
    min: Math.min(...prices),
    max: Math.max(...prices),
    avg: Math.round(prices.reduce((a, b) => a + b, 0) / prices.length),
    count: prices.length
  };
}

module.exports = {
  loadHistory,
  saveHistory,
  addEntry,
  getLastPrices,
  comparePrices,
  getPriceStats
};
