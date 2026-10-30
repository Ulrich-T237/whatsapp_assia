# Assia — AGC WhatsApp, no PC

Same **Assia brain**. Your laptop can be off.

This is **WhatsApp linked-device** (Baileys) on a free host — **not** Meta Cloud API. Cloud stays paused until AGC billing/verification is done.

## Why Baileys (not whatsapp-web.js)

`whatsapp-web.js` needs Chrome (~400 MB). Free 512 MB boxes die.  
**Baileys** is a socket. It fits Render / Koyeb / Northflank nano.

AI: `@google/genai` · **`gemini-2.5-flash`** (Google AI Studio free tier).  
Session: **MongoDB Atlas M0** (free) so a restart does **not** ask for a new QR.

## Honest free hosting (Oct 2026)

| Host | Free? | Stays awake? | Use it? |
|---|---|---|---|
| **Render** Free | Yes | **Sleeps after 15 min** unless you ping `/health` every 5 min | Yes, with a free pinger |
| **Koyeb** | Often closed to new free accounts (Pro from ~$29) | Used to stay up | Use if you already have Starter |
| **Northflank** Sandbox | Yes (card sometimes) | **Always on** | Best free fit |
| Render Starter | **$7/mo** | Always on | If pinging is too fragile |

**Required free accounts**

1. [MongoDB Atlas](https://www.mongodb.com/atlas) → M0 cluster → user + password → Network **0.0.0.0/0** → copy `MONGODB_URI`
2. Gemini key you already have (`GEMINI_API_KEY`)
3. One host above

## 1. MongoDB Atlas (5 minutes)

1. Create a **free M0** cluster  
2. Database user + password  
3. Network access: **Allow access from anywhere** (`0.0.0.0/0`)  
4. Connect → Drivers → copy the URI  
   `mongodb+srv://USER:PASS@cluster...`

## 2. GitHub

Put this folder in a GitHub repo (Render/Koyeb/Northflank pull from Git).

Do **not** commit `.env`.

## 3a. Render (free + pinger)

1. [render.com](https://render.com) → **New → Web Service** → this repo  
2. Runtime: **Docker** (uses `Dockerfile`)  
3. Plan: **Free**  
4. Health check: `/health`  
5. Environment:

```
ASSISTANT_NAME=Assia
GEMINI_MODEL=gemini-2.5-flash
GEMINI_API_KEY=        (your key)
MONGODB_URI=           (Atlas URI)
MONGODB_DB=agc_assia
DASHBOARD_KEY=         (any secret word)
IGNORE_GROUPS=true
```

6. Deploy. Open `https://YOUR-APP.onrender.com/?key=DASHBOARD_KEY`  
7. **Keep it awake (required on Free):** [cron-job.org](https://cron-job.org) or UptimeRobot → GET `https://YOUR-APP.onrender.com/health` every **5 minutes**.  
   Without this, Render sleeps, WhatsApp drops, Assia is silent until the next ping.

## 3b. Koyeb

App → GitHub → this Dockerfile → port **3000** → health `/health` → same env vars as above.

## 3c. Northflank (always-on free)

New service → Dockerfile → port 3000 → same env vars. No pinger needed.

## 4. Link WhatsApp (once)

Open the site. Either:

- Scan the **QR**, or  
- Type `2376XXXXXXXX` → **Get pairing code** → phone: WhatsApp → **Linked devices** → **Link with phone number**

The number that links **is Assia**.

**Do not** link **659 92 39 82 / 683 70 80 03 / 233 43 89 38 / 694 13 38 76** if a human already uses those chats.  
**Do not** link your everyday personal chat. Use a spare / future AGC bot SIM.

After it says online, from **another** phone send **`hi`** or **`bonjour`**.

MongoDB stores the session. Restarts should **not** need a new scan.

## Local test (optional)

```
cp .env.example .env
# fill GEMINI_API_KEY and MONGODB_URI
npm install
npm start
```

Open http://localhost:3000

## If she goes silent

1. `/health` should show `"whatsapp": true`  
2. Render: is the 5-minute pinger still hitting `/health`?  
3. Phone: **Linked devices** — is the host still listed?  
4. Re-open the dashboard and pair again only if it was logged out  

Cloud API (555 test number) is a **later** step, after AGC’s Meta payment method.
