/**
 * Price History Chart Generator
 * Generates an interactive HTML chart for GitHub Pages (docs/index.html)
 * Also generates a local copy for quick viewing (prices/chart.html)
 * Usage: npm run chart
 */

const { loadHistory } = require('./history');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const DOCS_DIR = path.join(__dirname, '../docs');
const DOCS_FILE = path.join(DOCS_DIR, 'index.html');
const LOCAL_FILE = path.join(__dirname, '../prices/chart.html');

// 9 distinct colors - 3 per hotel (dark/medium/light shades)
const HOTEL_COLORS = {
  'המלך שלמה': [
    { line: 'rgb(30, 100, 200)', bg: 'rgba(30, 100, 200, 0.1)' },   // dark blue
    { line: 'rgb(66, 153, 245)', bg: 'rgba(66, 153, 245, 0.1)' },   // medium blue
    { line: 'rgb(130, 195, 255)', bg: 'rgba(130, 195, 255, 0.1)' },  // light blue
  ],
  'רויאל גארדן': [
    { line: 'rgb(200, 30, 60)', bg: 'rgba(200, 30, 60, 0.1)' },     // dark red
    { line: 'rgb(240, 80, 110)', bg: 'rgba(240, 80, 110, 0.1)' },   // medium red/pink
    { line: 'rgb(255, 140, 160)', bg: 'rgba(255, 140, 160, 0.1)' }, // light pink
  ],
  'Queen of Sheba': [
    { line: 'rgb(20, 140, 130)', bg: 'rgba(20, 140, 130, 0.1)' },   // dark teal
    { line: 'rgb(60, 190, 180)', bg: 'rgba(60, 190, 180, 0.1)' },   // medium teal
    { line: 'rgb(120, 220, 210)', bg: 'rgba(120, 220, 210, 0.1)' }, // light teal
  ],
};

const FALLBACK_COLORS = [
  { line: 'rgb(128, 128, 128)', bg: 'rgba(128, 128, 128, 0.1)' },
  { line: 'rgb(160, 160, 160)', bg: 'rgba(160, 160, 160, 0.1)' },
  { line: 'rgb(192, 192, 192)', bg: 'rgba(192, 192, 192, 0.1)' },
];

function generateChart() {
  const history = loadHistory();

  if (history.entries.length === 0) {
    console.error('No history data found. Run the scraper first.');
    process.exit(1);
  }

  // Extract hotel names and date ranges from the first entry
  const hotels = Object.keys(history.entries[0].prices);
  const dateRanges = Object.keys(history.entries[0].prices[hotels[0]]);

  // Build datasets - all hotels in one chart with distinct colors
  const datasets = [];
  hotels.forEach(hotel => {
    const colors = HOTEL_COLORS[hotel] || FALLBACK_COLORS;
    dateRanges.forEach((dateRange, i) => {
      const data = history.entries.map(entry => {
        const price = entry.prices[hotel]?.[dateRange];
        return {
          x: entry.timestamp,
          y: price
        };
      }).filter(point => point.y !== null && point.y !== undefined);

      datasets.push({
        label: `${hotel} (${dateRange})`,
        data,
        borderColor: colors[i % colors.length].line,
        backgroundColor: colors[i % colors.length].bg,
        tension: 0.3,
        fill: false,
        pointRadius: 3,
        pointHoverRadius: 7,
        borderWidth: 2,
      });
    });
  });

  const html = buildHtml(datasets);

  // Write to docs/ for GitHub Pages
  if (!fs.existsSync(DOCS_DIR)) {
    fs.mkdirSync(DOCS_DIR, { recursive: true });
  }
  fs.writeFileSync(DOCS_FILE, html, 'utf8');
  console.log(`📊 Chart generated: ${DOCS_FILE}`);

  // Also write local copy
  fs.writeFileSync(LOCAL_FILE, html, 'utf8');
  console.log(`📊 Local copy: ${LOCAL_FILE}`);

  // Open in default browser (local usage only)
  if (!process.env.CI) {
    const command = process.platform === 'win32' ? `start "" "${LOCAL_FILE}"`
      : process.platform === 'darwin' ? `open "${LOCAL_FILE}"`
      : `xdg-open "${LOCAL_FILE}"`;

    exec(command, (err) => {
      if (err) console.error('Could not open browser:', err.message);
    });
  }
}

function buildHtml(datasets) {
  const datasetsJson = JSON.stringify(datasets);
  const generatedAt = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });
  const dataPoints = datasets[0]?.data?.length || 0;

  return `<!DOCTYPE html>
<html lang="he" dir="rtl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>מעקב מחירי מלונות - היסטוריה</title>
  <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/chartjs-adapter-date-fns"></script>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #f5f7fa;
      padding: 20px;
      direction: rtl;
    }
    h1 {
      text-align: center;
      color: #2c3e50;
      margin-bottom: 8px;
      font-size: 1.8em;
    }
    .subtitle {
      text-align: center;
      color: #7f8c8d;
      margin-bottom: 30px;
      font-size: 0.9em;
    }
    .chart-container {
      background: white;
      border-radius: 12px;
      padding: 16px;
      margin-bottom: 24px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      max-width: 1000px;
      margin-left: auto;
      margin-right: auto;
      position: relative;
      height: 70vh;
      min-height: 400px;
    }
    canvas { width: 100% !important; height: 100% !important; }
    .legend-hint {
      text-align: center;
      color: #95a5a6;
      font-size: 0.8em;
      margin-top: 10px;
    }
    @media (max-width: 600px) {
      body { padding: 8px; }
      h1 { font-size: 1.4em; }
      .chart-container { padding: 10px; height: 60vh; min-height: 350px; }
    }
  </style>
</head>
<body>
  <h1>📊 מעקב מחירי מלונות</h1>
  <p class="subtitle">עודכן: ${generatedAt} | ${dataPoints} נקודות נתונים</p>

  <div class="chart-container">
    <canvas id="priceChart"></canvas>
    <p class="legend-hint">💡 לחצו על פריט ב-Legend כדי להסתיר/להציג קו. העבירו את האצבע על נקודה לפרטים.</p>
  </div>

  <script>
    const datasets = ${datasetsJson};

    const ctx = document.getElementById('priceChart').getContext('2d');
    new Chart(ctx, {
      type: 'line',
      data: {
        datasets: datasets.map(ds => ({
          ...ds,
          data: ds.data.map(p => ({ x: new Date(p.x), y: p.y }))
        }))
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: {
          mode: 'nearest',
          intersect: false,
          axis: 'x'
        },
        plugins: {
          legend: {
            position: 'bottom',
            labels: {
              font: { size: 12 },
              padding: 16,
              usePointStyle: true,
              pointStyle: 'circle'
            }
          },
          tooltip: {
            backgroundColor: 'rgba(0,0,0,0.85)',
            titleFont: { size: 13 },
            bodyFont: { size: 13 },
            padding: 12,
            displayColors: true,
            callbacks: {
              title: function(items) {
                if (!items.length) return '';
                const d = new Date(items[0].parsed.x);
                return d.toLocaleString('he-IL', {
                  timeZone: 'Asia/Jerusalem',
                  day: '2-digit', month: '2-digit', year: '2-digit',
                  hour: '2-digit', minute: '2-digit'
                });
              },
              label: function(context) {
                const price = context.parsed.y;
                return ' ' + context.dataset.label + ': ₪' + price.toLocaleString('he-IL');
              }
            }
          }
        },
        scales: {
          x: {
            type: 'time',
            time: {
              displayFormats: {
                hour: 'dd/MM HH:mm',
                day: 'dd/MM'
              }
            },
            title: { display: true, text: 'תאריך בדיקה', font: { size: 13 } },
            grid: { color: 'rgba(0,0,0,0.05)' }
          },
          y: {
            title: { display: true, text: 'מחיר (₪)', font: { size: 13 } },
            ticks: {
              callback: function(value) { return '₪' + value.toLocaleString('he-IL'); }
            },
            grid: { color: 'rgba(0,0,0,0.05)' }
          }
        }
      }
    });
  </script>
</body>
</html>`;
}

// Run if called directly
if (require.main === module) {
  generateChart();
}

module.exports = { generateChart };
