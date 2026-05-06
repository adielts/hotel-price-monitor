/**
 * Price History Chart Generator
 * Generates an interactive HTML chart from price history data
 * Usage: npm run chart
 */

const { loadHistory } = require('./history');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const OUTPUT_FILE = path.join(__dirname, '../prices/chart.html');

const COLORS = [
  { line: 'rgb(54, 162, 235)', bg: 'rgba(54, 162, 235, 0.1)' },   // blue
  { line: 'rgb(255, 99, 132)', bg: 'rgba(255, 99, 132, 0.1)' },   // red
  { line: 'rgb(75, 192, 192)', bg: 'rgba(75, 192, 192, 0.1)' },   // teal
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

  // Build datasets per hotel
  const chartsData = hotels.map(hotel => {
    const datasets = dateRanges.map((dateRange, i) => {
      const data = history.entries.map(entry => {
        const price = entry.prices[hotel]?.[dateRange];
        return {
          x: entry.timestamp,
          y: price // null values will create gaps
        };
      }).filter(point => point.y !== null && point.y !== undefined);

      return {
        label: dateRange,
        data,
        borderColor: COLORS[i % COLORS.length].line,
        backgroundColor: COLORS[i % COLORS.length].bg,
        tension: 0.3,
        fill: false,
        pointRadius: 4,
        pointHoverRadius: 6,
      };
    });

    return { hotel, datasets };
  });

  const html = buildHtml(chartsData);
  fs.writeFileSync(OUTPUT_FILE, html, 'utf8');
  console.log(`Chart generated: ${OUTPUT_FILE}`);

  // Open in default browser
  const command = process.platform === 'win32' ? `start "" "${OUTPUT_FILE}"`
    : process.platform === 'darwin' ? `open "${OUTPUT_FILE}"`
    : `xdg-open "${OUTPUT_FILE}"`;

  exec(command, (err) => {
    if (err) console.error('Could not open browser:', err.message);
  });
}

function buildHtml(chartsData) {
  const chartsJson = JSON.stringify(chartsData);
  const generatedAt = new Date().toLocaleString('he-IL', { timeZone: 'Asia/Jerusalem' });

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
      padding: 24px;
      margin-bottom: 24px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.08);
      max-width: 900px;
      margin-left: auto;
      margin-right: auto;
    }
    .chart-container h2 {
      color: #34495e;
      margin-bottom: 16px;
      font-size: 1.3em;
    }
    canvas { width: 100% !important; }
  </style>
</head>
<body>
  <h1>📊 מעקב מחירי מלונות</h1>
  <p class="subtitle">עודכן: ${generatedAt} | ${chartsData.length > 0 ? chartsData[0].datasets[0]?.data?.length || 0 : 0} נקודות נתונים</p>

  ${chartsData.map((chart, idx) => `
  <div class="chart-container">
    <h2>${chart.hotel}</h2>
    <canvas id="chart${idx}"></canvas>
  </div>`).join('')}

  <script>
    const chartsData = ${chartsJson};

    chartsData.forEach((chartData, idx) => {
      const ctx = document.getElementById('chart' + idx).getContext('2d');
      new Chart(ctx, {
        type: 'line',
        data: {
          datasets: chartData.datasets.map(ds => ({
            ...ds,
            data: ds.data.map(p => ({ x: new Date(p.x), y: p.y }))
          }))
        },
        options: {
          responsive: true,
          interaction: {
            mode: 'index',
            intersect: false,
          },
          plugins: {
            legend: {
              position: 'top',
              labels: { font: { size: 13 } }
            },
            tooltip: {
              callbacks: {
                label: function(context) {
                  return context.dataset.label + ': ₪' + context.parsed.y.toLocaleString();
                }
              }
            }
          },
          scales: {
            x: {
              type: 'time',
              time: {
                displayFormats: { hour: 'dd/MM HH:mm', day: 'dd/MM' }
              },
              title: { display: true, text: 'תאריך בדיקה' }
            },
            y: {
              title: { display: true, text: 'מחיר (₪)' },
              ticks: {
                callback: function(value) { return '₪' + value.toLocaleString(); }
              }
            }
          }
        }
      });
    });
  </script>
</body>
</html>`;
}

generateChart();
