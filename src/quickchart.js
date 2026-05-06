/**
 * QuickChart Integration Module
 * Generates chart URLs using QuickChart.io API for Telegram messages
 */

const { loadHistory } = require('./history');

const QUICKCHART_API = 'https://quickchart.io/chart/create';

const COLORS = {
  'המלך שלמה': { border: 'rgb(54, 162, 235)', background: 'rgba(54, 162, 235, 0.2)' },
  'רויאל גארדן': { border: 'rgb(255, 99, 132)', background: 'rgba(255, 99, 132, 0.2)' },
  'Queen of Sheba': { border: 'rgb(75, 192, 192)', background: 'rgba(75, 192, 192, 0.2)' },
};

const LINE_STYLES = [
  { borderDash: [] },        // solid
  { borderDash: [5, 5] },    // dashed
  { borderDash: [2, 2] },    // dotted
];

/**
 * Generate a QuickChart short URL for price history
 * @returns {Promise<string|null>} - Short URL or null on failure
 */
async function generateChartUrl() {
  const history = loadHistory();

  if (history.entries.length < 2) {
    console.log('📊 Not enough history data for chart (need at least 2 entries)');
    return null;
  }

  const hotels = Object.keys(history.entries[0].prices);
  const dateRanges = Object.keys(history.entries[0].prices[hotels[0]]);

  // Format timestamps for X-axis labels
  const labels = history.entries.map(entry => {
    const d = new Date(entry.timestamp);
    return d.toLocaleDateString('he-IL', {
      timeZone: 'Asia/Jerusalem',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  });

  // Build datasets - one line per hotel+dateRange combination
  const datasets = [];
  hotels.forEach((hotel, hotelIdx) => {
    dateRanges.forEach((dateRange, rangeIdx) => {
      const data = history.entries.map(entry => {
        const price = entry.prices[hotel]?.[dateRange];
        return price || null;
      });

      // Skip datasets that are all null
      if (data.every(v => v === null)) return;

      const color = COLORS[hotel] || { border: 'rgb(128,128,128)', background: 'rgba(128,128,128,0.2)' };
      const style = LINE_STYLES[rangeIdx % LINE_STYLES.length];

      datasets.push({
        label: `${hotel} (${dateRange})`,
        data,
        borderColor: color.border,
        backgroundColor: color.background,
        borderDash: style.borderDash,
        fill: false,
        tension: 0.3,
        pointRadius: 3,
        borderWidth: 2,
      });
    });
  });

  const chartConfig = {
    type: 'line',
    data: { labels, datasets },
    options: {
      title: {
        display: true,
        text: 'היסטוריית מחירי מלונות (₪)',
        fontSize: 16,
      },
      scales: {
        yAxes: [{
          ticks: {
            callback: (val) => '₪' + val,
          },
          scaleLabel: { display: true, labelString: 'מחיר (₪)' }
        }],
        xAxes: [{
          scaleLabel: { display: true, labelString: 'תאריך בדיקה' }
        }]
      },
      legend: {
        position: 'bottom',
        labels: { fontSize: 10 }
      }
    }
  };

  try {
    const response = await fetch(QUICKCHART_API, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chart: chartConfig,
        width: 800,
        height: 450,
        backgroundColor: 'white',
        format: 'png',
      })
    });

    const result = await response.json();

    if (result.success && result.url) {
      console.log(`📊 Chart URL generated: ${result.url}`);
      return result.url;
    } else {
      console.error('📊 QuickChart API error:', result);
      return null;
    }
  } catch (error) {
    console.error('📊 Failed to generate chart URL:', error.message);
    return null;
  }
}

module.exports = { generateChartUrl };
