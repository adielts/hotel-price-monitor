/**
 * Chart URL Module
 * Provides the GitHub Pages chart URL for Telegram messages
 * and triggers chart HTML generation
 */

const { generateChart } = require('./chart');
const { loadHistory } = require('./history');

const CHART_URL = 'https://adielts.github.io/hotel-price-monitor/';

/**
 * Generate the chart HTML and return the GitHub Pages URL
 * @returns {Promise<string|null>} - Chart URL or null if not enough data
 */
async function generateChartUrl() {
  const history = loadHistory();

  if (history.entries.length < 2) {
    console.log('📊 Not enough history data for chart (need at least 2 entries)');
    return null;
  }

  try {
    generateChart();
    return CHART_URL;
  } catch (error) {
    console.error('📊 Failed to generate chart:', error.message);
    return null;
  }
}

module.exports = { generateChartUrl };
