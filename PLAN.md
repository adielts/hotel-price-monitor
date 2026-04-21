# Hotel Price Monitor - Implementation Plan

## Overview
Automated hotel price monitoring system using GitHub Actions + Playwright + Telegram Bot.
Checks prices every 3 hours and sends updates to Telegram.

**Cost: 100% FREE** ✅

---

## Target Hotels

| Hotel | Chain | Dates to Monitor |
|-------|-------|------------------|
| המלך שלמה | Isrotel | 7-11/06, 14-18/06, 21-25/06 |
| רויאל גארדן | Isrotel | 7-11/06, 14-18/06, 21-25/06 |
| Queen of Sheba | Astral | 7-11/06, 14-18/06, 21-25/06 |

---

## Agent Tasks

### 🤖 AGENT 1: Telegram Bot Setup
**Status:** ⬜ Not Started  
**Estimated Time:** 15 minutes  
**Dependencies:** None

#### Steps:
1. [ ] Open Telegram and search for `@BotFather`
2. [ ] Send `/newbot` command
3. [ ] Choose bot name: `Hotel Price Monitor` (or similar)
4. [ ] Choose username: `my_hotel_prices_bot` (must end with `bot`)
5. [ ] Copy the **Bot Token** (looks like: `123456789:ABCdefGHIjklMNOpqrsTUVwxyz`)
6. [ ] Message `@userinfobot` to get your **Chat ID** (numeric)
7. [ ] Save both values securely

#### Output Required:
```
TELEGRAM_BOT_TOKEN=<your_token>
TELEGRAM_CHAT_ID=<your_chat_id>
```

---

### 🤖 AGENT 2: GitHub Repository Setup
**Status:** ⬜ Not Started  
**Estimated Time:** 10 minutes  
**Dependencies:** None

#### Steps:
1. [ ] Create new GitHub repository: `hotel-price-monitor`
2. [ ] Set repository to **Private** (recommended)
3. [ ] Push this code to the repository
4. [ ] Go to Settings → Secrets and variables → Actions
5. [ ] Add repository secrets:
   - `TELEGRAM_BOT_TOKEN` (from Agent 1)
   - `TELEGRAM_CHAT_ID` (from Agent 1)

#### Output Required:
- GitHub repo URL
- Secrets configured

---

### 🤖 AGENT 3: API Investigation (CRITICAL - Do First!)
**Status:** ⬜ Not Started  
**Estimated Time:** 30-60 minutes  
**Dependencies:** None

#### Purpose:
Before using complex Playwright scrapers, check if hidden APIs exist.
This could save hours of work and make scraping more reliable!

#### Steps for Isrotel:
1. [ ] Open Chrome DevTools (F12) → Network tab
2. [ ] Go to https://www.isrotel.co.il/isrotel-hotels/eilat-hotels/ישרוטל-המלך-שלמה/
3. [ ] Click on booking/הזמנה button
4. [ ] Select dates: 7-11 June 2026
5. [ ] Watch Network tab for XHR/Fetch requests
6. [ ] Look for requests containing:
   - `api`, `availability`, `rates`, `pricing`, `search`
   - JSON responses with price data
7. [ ] If found: Document the endpoint, headers, and payload

#### Steps for Astral:
1. [ ] Same process for https://www.astralhotels.co.il/hotels/astral-queen-of-sheba
2. [ ] Also check page source for `<script id="__NEXT_DATA__">` (Next.js data)
3. [ ] If `__NEXT_DATA__` contains prices - we can parse HTML directly!

#### Output Required:
```
ISROTEL_API_FOUND: yes/no
ISROTEL_API_ENDPOINT: <url if found>
ISROTEL_API_PAYLOAD: <sample payload if found>

ASTRAL_API_FOUND: yes/no
ASTRAL_NEXT_DATA: yes/no
ASTRAL_API_ENDPOINT: <url if found>
```

#### Update scrapers if APIs found:
If APIs are discovered, update `src/scrapers/isrotel.js` and `src/scrapers/astral.js` 
to use simple fetch() calls instead of Playwright browser automation.

---

### 🤖 AGENT 4: Telegram Module Development
**Status:** ✅ Implemented  
**File:** `src/telegram.js`

---

### 🤖 AGENT 5: Isrotel Scraper Development
**Status:** ✅ Implemented (Playwright version)  
**File:** `src/scrapers/isrotel.js`

**Note:** Selectors may need adjustment after manual testing.
Run with `HEADLESS=false` to see the browser and debug selectors.

---

### 🤖 AGENT 6: Astral Scraper Development
**Status:** ✅ Implemented (Playwright version)  
**File:** `src/scrapers/astral.js`

---

### 🤖 AGENT 7: History Management
**Status:** ✅ Implemented  
**File:** `src/history.js`

---

### 🤖 AGENT 8: Main Orchestrator
**Status:** ✅ Implemented  
**File:** `src/index.js`

---

### 🤖 AGENT 9: GitHub Actions Workflow
**Status:** ✅ Implemented  
**File:** `.github/workflows/check-prices.yml`

---

### 🤖 AGENT 10: Package Configuration
**Status:** ✅ Implemented  
**Files:** `package.json`, `.env.example`, `.gitignore`

---

## Execution Order

```
┌─────────────────────────────────────────────────────────────────┐
│                    PHASE 1: Setup (Parallel)                     │
├─────────────────────────────────────────────────────────────────┤
│  Agent 1: Telegram Bot    Agent 2: GitHub Repo                  │
│  (15 min)                 (10 min)                              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                 PHASE 2: Investigation                           │
├─────────────────────────────────────────────────────────────────┤
│  Agent 3: API Investigation (30-60 min)                         │
│  ⚠️ CRITICAL - May simplify scraping significantly              │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    PHASE 3: Testing                              │
├─────────────────────────────────────────────────────────────────┤
│  1. Create .env file with your credentials                      │
│  2. Run locally: npm install && npm start                       │
│  3. Verify Telegram message received                            │
│  4. Debug selectors if needed (run with HEADLESS=false)         │
│  5. Push to GitHub                                              │
│  6. Run workflow manually (Actions → Run workflow)              │
│  7. Verify automated commit of history.json                     │
└─────────────────────────────────────────────────────────────────┘
```

---

## Quick Start Commands

```bash
# 1. Clone the repository
git clone https://github.com/YOUR_USERNAME/hotel-price-monitor.git
cd hotel-price-monitor

# 2. Install dependencies
npm install

# 3. Install Playwright browsers
npx playwright install chromium

# 4. Create .env file
cp .env.example .env
# Edit .env with your Telegram credentials

# 5. Test locally
npm start

# 6. Debug mode (see browser)
HEADLESS=false npm start
```

---

## Troubleshooting Guide

### Scraper Not Working
1. Check if site structure changed
2. Run with `HEADLESS=false` to see browser
3. Check `screenshots/` folder for error images
4. Look for Cloudflare/bot protection pages

### Telegram Not Sending
1. Verify bot token is correct
2. **Important:** Message your bot first to "activate" the chat
3. Check chat ID is numeric (not username)
4. Test manually:
   ```bash
   curl -X POST "https://api.telegram.org/bot<TOKEN>/sendMessage" \
     -H "Content-Type: application/json" \
     -d '{"chat_id": "<CHAT_ID>", "text": "test"}'
   ```

### GitHub Actions Failing
1. Check Actions tab for detailed logs
2. Verify secrets are set correctly (Settings → Secrets)
3. Check if Playwright installation step succeeded
4. Look for timeout errors - may need longer waits

### Prices Show as "לא זמין"
1. Dates might be sold out or too far in the future
2. Selectors may need updating - run locally with `HEADLESS=false`
3. Site might be blocking automated access

---

## GitHub Secrets Required

Go to your repository → Settings → Secrets and variables → Actions → New repository secret

| Secret Name | Description |
|-------------|-------------|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather (e.g., `123456789:ABC...`) |
| `TELEGRAM_CHAT_ID` | Your chat ID from @userinfobot (e.g., `987654321`) |

---

## Future Improvements (Optional)

- [ ] Add price drop alerts (notify only when price decreases by X%)
- [ ] Web dashboard to view price history charts
- [ ] Support for more hotels/booking sites
- [ ] Price comparison with booking.com/hotels.com
- [ ] Direct booking link in notification
- [ ] Weekly summary report
