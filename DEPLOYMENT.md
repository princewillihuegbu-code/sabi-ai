# 🇳🇬 SABI MVP — Complete Deployment Guide

## What is Sabi?
Sabi ("to know" in Pidgin/Yoruba) is a voice-first WhatsApp AI assistant designed for everyday Nigerians. It handles market prices, weather, government services, and news in Pidgin, Yoruba, Igbo, Hausa, and English.

---

## 📁 Folder Structure

```
sabi/
├── backend/
│   ├── src/
│   │   ├── index.js                  # Express entry point
│   │   ├── routes/
│   │   │   ├── webhook.js            # WhatsApp webhook (GET verify + POST handler)
│   │   │   └── admin.js              # Admin API endpoints
│   │   ├── services/
│   │   │   ├── messageHandler.js     # Core orchestration (onboarding + main flow)
│   │   │   ├── whatsappService.js    # WA Cloud API: send text/audio/template
│   │   │   ├── transcriptionService.js  # OpenAI Whisper STT
│   │   │   ├── intentService.js      # GPT-4o-mini intent classification
│   │   │   ├── responseService.js    # GPT-4o-mini multilingual response gen
│   │   │   ├── ttsService.js         # ElevenLabs TTS + Google TTS fallback
│   │   │   ├── marketService.js      # commodity.ng API + cache
│   │   │   ├── weatherService.js     # NiMet API + cache
│   │   │   ├── newsService.js        # BBC Pidgin/Punch/Vanguard RSS
│   │   │   ├── govService.js         # Static government guides (NIN, SIM, passport)
│   │   │   ├── userService.js        # Supabase user CRUD
│   │   │   └── analyticsService.js   # Query logging
│   │   ├── jobs/
│   │   │   ├── dailyBroadcast.js     # 7am cron: voice+text to opted-in users
│   │   │   └── cacheRefresh.js       # 6h cron: refresh all location caches
│   │   ├── config/
│   │   │   └── supabase.js           # Supabase client
│   │   └── utils/
│   │       └── logger.js             # Winston logger
│   ├── package.json
│   └── .env.example
├── pwa/
│   ├── index.html                    # Full PWA (chat + voice + settings + admin)
│   └── manifest.json                 # PWA manifest
└── docs/
    ├── supabase_schema.sql           # Complete DB schema + RLS + views
    └── DEPLOYMENT.md                 # This file
```

---

## 🚀 Step-by-Step Deployment

### Step 1: Prerequisites
- Node.js 18+ 
- Supabase account (free tier works)
- WhatsApp Business account + Meta Developer account
- OpenAI API key
- ElevenLabs API key (or Google Cloud TTS)

### Step 2: Supabase Setup
1. Create new project at supabase.com
2. Go to SQL Editor → New Query
3. Paste contents of `docs/supabase_schema.sql` and run
4. Go to Settings → API → copy `URL` and `service_role` key
5. Go to Storage → Create bucket named `sabi-voice-notes` (public)

### Step 3: WhatsApp Business Cloud API
1. Go to developers.facebook.com → Create App → Business type
2. Add "WhatsApp" product
3. In WhatsApp > API Setup:
   - Note your Phone Number ID
   - Note your WhatsApp Business Account ID
   - Generate permanent access token
4. Set webhook URL to: `https://your-domain.com/webhook`
5. Set verify token (must match WHATSAPP_VERIFY_TOKEN in .env)
6. Subscribe to: `messages` webhook field

### Step 4: Backend Deployment (Railway / Render / Fly.io)

**Railway (recommended):**
```bash
# Install Railway CLI
npm install -g @railway/cli

# Login and deploy
railway login
railway init
railway up
```

Set environment variables in Railway dashboard from `.env.example`

**Render:**
1. Connect GitHub repo
2. New Web Service → select backend folder
3. Build: `npm install`
4. Start: `npm start`
5. Add environment variables

### Step 5: Environment Variables
Copy `.env.example` to `.env` and fill all values:
```bash
cp .env.example .env
# Edit .env with your actual API keys
```

### Step 6: PWA Deployment (Vercel)
```bash
cd pwa
# Update API endpoints in index.html to your backend URL
npx vercel --prod
```

Or deploy to Netlify:
```bash
netlify deploy --prod --dir=pwa
```

### Step 7: WhatsApp Webhook Final Setup
1. Your backend must be live with HTTPS
2. In Meta Developer Console → WhatsApp → Configuration
3. Webhook URL: `https://your-backend.railway.app/webhook`
4. Verify Token: (same as WHATSAPP_VERIFY_TOKEN)
5. Click Verify → should succeed
6. Subscribe to `messages`

---

## 🧪 Test Your Setup

### Test webhook locally with ngrok:
```bash
npm install -g ngrok
cd backend && node src/index.js
# New terminal:
ngrok http 3000
# Use the HTTPS URL as your webhook
```

### Test message flow:
```bash
# Verify health endpoint
curl https://your-backend.com/health

# Check admin stats
curl -H "x-admin-key: YOUR_ADMIN_KEY" https://your-backend.com/admin/stats

# Trigger manual broadcast
curl -X POST -H "x-admin-key: YOUR_ADMIN_KEY" https://your-backend.com/admin/broadcast

# Refresh cache
curl -X POST -H "x-admin-key: YOUR_ADMIN_KEY" https://your-backend.com/admin/cache/refresh
```

---

## 🌐 API Integrations

### commodity.ng (Market Prices)
- Sign up at commodity.ng
- Get API key from dashboard
- Set `COMMODITY_API_KEY` and `COMMODITY_API_URL`

### NiMet (Weather)
- Contact NiMet: info@nimet.gov.ng
- Request API access for developers
- Set `NIMET_API_KEY`
- **Fallback:** OpenWeatherMap free tier works as alternative:
  ```
  NIMET_API_URL=https://api.openweathermap.org/data/2.5
  NIMET_API_KEY=your_openweather_key
  ```

### ElevenLabs TTS
- Sign up at elevenlabs.io
- Create or clone voices (suggest African/Nigerian accent voices)
- Set voice IDs per language in .env

---

## 📊 Admin Dashboard

Access the admin API at `/admin/stats` with your `ADMIN_API_KEY`:

**Endpoints:**
| Method | Path | Description |
|--------|------|-------------|
| GET | /admin/stats | Full dashboard data |
| GET | /admin/users | Paginated user list |
| POST | /admin/broadcast | Trigger manual broadcast |
| POST | /admin/cache/refresh | Force cache refresh |

---

## 🎙️ Voice Message Flow

```
User sends voice note
        ↓
WhatsApp webhook fires (POST /webhook)
        ↓
Download audio buffer via WA media API
        ↓
OpenAI Whisper transcription (language hint)
        ↓
GPT-4o-mini intent classification → {intent, entities}
        ↓
Fetch real data (commodity.ng / NiMet / RSS / Gov guide)
  └─ Cache hit? Use cache | API fail? Use stale cache + flag
        ↓
GPT-4o-mini response generation (in user's language, <80 words)
        ↓
ElevenLabs TTS → OGG audio buffer
        ↓
Upload to WhatsApp media API → get media_id
        ↓
Send audio message + text fallback to user
        ↓
Log to analytics table
```

---

## 📱 PWA Features

- **Chat Tab:** Full chat history, text input, demo responses
- **Voice Tab:** Hold-to-talk button, Web Speech API integration, language selector
- **Settings Tab:** Language, location, notification toggles
- **Admin Tab:** Live dashboard with user stats, language/intent distribution, recent queries

---

## 🎨 Branding Guide

### Logo
**Concept:** A speech bubble with three dots (WhatsApp messaging metaphor) combined with a subtle mic icon. A curved tail in Nigerian Green points to the user — representing Sabi "talking to you." The bubble has a warm yellow dot accent symbolizing the AI brain.

**WhatsApp DP version:** Green circle background (#0A7F3F) with white speech bubble + yellow accent dot. Clean, recognizable at 40×40px.

**Splash screen:** Full green background, centered yellow-bg logo card with rounded corners, white "Sabi" wordmark in Syne 800, "Your Smart Nigerian AI Assistant" subtitle, 🇳🇬 flag.

### Typography
- **Display/Logo:** Syne 800 — bold, geometric, modern-African energy
- **Body/UI:** Plus Jakarta Sans — highly legible, professional, works at small sizes
- **Numbers/Stats:** Syne 700 — strong data presentation

### Colors
| Token | Hex | Use |
|-------|-----|-----|
| Deep Green | `#0A7F3F` | Primary brand, buttons, headers |
| Green Dark | `#065C2D` | Pressed states, dark UI |
| Green Light | `#12A853` | Voice elements, success states |
| Warm Yellow | `#FFC72C` | Accents, highlights, CTAs |
| Dark Grey | `#1A1A1A` | Admin dark mode base |
| Grey Mid | `#4A4A4A` | Secondary text |
| Grey Light | `#F5F5F0` | Background, subtle warmth |

---

## 💡 Offline Fallback Logic

When APIs fail:
1. Check `cache_data` table for type+location
2. If stale cache exists: return it + set `isCached = true`
3. Message appended: *"This na yesterday data – check later for fresh one 👍"*
4. If no cache at all: return hardcoded mock data for top commodities
5. Cache refresh cron runs every 6 hours to keep data fresh

---

## 🔒 Security Notes

- Rate limiting: 30 requests/min per IP
- Webhook verify token: Keep secret, 32+ chars
- Admin API key: 64+ chars, store in env, never in code
- Supabase RLS: Enabled on all tables, only service key bypasses
- Phone numbers: Never logged in plaintext in production logs

---

## 📈 Scaling Considerations

- WhatsApp allows ~80 messages/sec on standard tier
- For 10k+ users: Add Redis for in-memory cache layer
- For high-volume TTS: Pre-generate common responses and cache audio
- For better multilingual accuracy: Fine-tune Whisper on Pidgin/Yoruba data
- Daily broadcast: Use a queue (Bull/BullMQ) for 50k+ users

---

## 🛠️ Local Development

```bash
cd backend
npm install
cp .env.example .env
# Fill in your test credentials
npm run dev
# In new terminal:
npx ngrok http 3000
# Add ngrok HTTPS URL as WhatsApp webhook
```

---

*Built with 💚 for everyday Nigerians*
*Sabi - Because everyone deserves to know.*
