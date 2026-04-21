# 🏨 Hotel Price Monitor

Automated hotel price monitoring with Telegram notifications.  
**100% Free** using GitHub Actions + Playwright + Telegram Bot.

## 📋 Features

- ⏰ Automatic price checks every 3 hours
- 📱 Instant Telegram notifications
- 📊 Price history tracking
- 📈 Price change alerts
- 🆓 Completely free to run

## 🏨 Monitored Hotels

| Hotel | Location | Chain |
|-------|----------|-------|
| המלך שלמה | Eilat | Isrotel |
| רויאל גארדן | Eilat | Isrotel |
| Queen of Sheba | Eilat | Astral |

## 📅 Monitored Dates

- June 7-11, 2026
- June 14-18, 2026
- June 21-25, 2026

## 🚀 Quick Start

### 1. Create Telegram Bot

1. Open Telegram and search for `@BotFather`
2. Send `/newbot` and follow instructions
3. Copy your **Bot Token**
4. Message `@userinfobot` to get your **Chat ID**
5. **Important:** Send a message to your new bot to activate it

### 2. Setup GitHub Repository

1. Fork or clone this repository
2. Go to **Settings** → **Secrets and variables** → **Actions**
3. Add these secrets:
   - `TELEGRAM_BOT_TOKEN` - Your bot token
   - `TELEGRAM_CHAT_ID` - Your chat ID

### 3. Enable GitHub Actions

1. Go to **Actions** tab
2. Enable workflows if prompted
3. Run manually: **Actions** → **Check Hotel Prices** → **Run workflow**

## 💻 Local Development

```bash
# Clone repository
git clone https://github.com/YOUR_USERNAME/hotel-price-monitor.git
cd hotel-price-monitor

# Install dependencies
npm install

# Install Playwright browsers
npx playwright install chromium

# Create .env file
cp .env.example .env
# Edit .env with your Telegram credentials

# Run
npm start

# Debug mode (see browser)
npm run debug
# or
HEADLESS=false npm start
```

## 📁 Project Structure

```
hotel-price-monitor/
├── .github/
│   └── workflows/
│       └── check-prices.yml    # GitHub Actions workflow
├── src/
│   ├── scrapers/
│   │   ├── isrotel.js          # Isrotel hotel scraper
│   │   └── astral.js           # Astral hotel scraper
│   ├── telegram.js             # Telegram bot module
│   ├── history.js              # Price history management
│   └── index.js                # Main entry point
├── prices/
│   └── history.json            # Price history data
├── screenshots/                 # Debug screenshots (gitignored)
├── .env.example                # Environment template
├── .gitignore
├── package.json
├── PLAN.md                     # Detailed implementation plan
└── README.md
```

## ⚙️ Configuration

### Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| `TELEGRAM_BOT_TOKEN` | Telegram bot token from @BotFather | ✅ |
| `TELEGRAM_CHAT_ID` | Your Telegram chat ID | ✅ |
| `HEADLESS` | Run browser headless (default: true) | ❌ |

### Customizing Hotels/Dates

Edit the following files:
- `src/scrapers/isrotel.js` - `HOTELS` and `DATE_RANGES` constants
- `src/scrapers/astral.js` - `HOTEL` and `DATE_RANGES` constants

## 🔧 Troubleshooting

### Telegram not working
- Make sure you sent a message to your bot first
- Verify bot token and chat ID are correct
- Check GitHub Secrets are set properly

### Prices show as "לא זמין"
- Dates might be sold out
- Run locally with `HEADLESS=false` to debug
- Check screenshots in `screenshots/` folder
- Selectors might need updating if site changed

### GitHub Actions failing
- Check Actions tab for detailed logs
- Look at uploaded screenshots artifact
- Verify all secrets are configured

## 📝 License

MIT

## 🙏 Contributing

Contributions welcome! Please feel free to submit a Pull Request.
