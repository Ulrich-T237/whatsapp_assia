require('dotenv').config();

const http = require('http');
const QRCode = require('qrcode');
const qrcodeTerminal = require('qrcode-terminal');
const pino = require('pino');
const {
  default: makeWASocket,
  Browsers,
  DisconnectReason,
  fetchLatestBaileysVersion,
} = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const { loadAuth, mongoUri } = require('./lib/mongo-auth');
const { handleIncoming } = require('./src/plain');
const { persona } = require('./src/config');
const ai = require('./src/ai');

const PORT = Number(process.env.PORT || 3000);
const IGNORE_GROUPS = String(process.env.IGNORE_GROUPS || 'true') === 'true';
const NAME = persona.name || 'ASSIAA';
const DASHBOARD_KEY = String(process.env.DASHBOARD_KEY || '').trim();

const busy = new Set();
const status = {
  ready: false,
  number: '',
  qr: null,
  pairingCode: '',
  lastError: '',
  store: mongoUri() ? 'mongo' : 'file',
};

let sock = null;
let auth = null;
let restarting = false;

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function dashboardOk(req) {
  if (!DASHBOARD_KEY) return true;
  const url = new URL(req.url, 'http://localhost');
  const q = url.searchParams.get('key') || '';
  const hdr = String(req.headers['x-dashboard-key'] || '');
  return q === DASHBOARD_KEY || hdr === DASHBOARD_KEY;
}

function jidUser(jid) {
  return String(jid || '').split('@')[0].split(':')[0];
}

function messageText(msg) {
  const m = msg.message || {};
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.listResponseMessage?.title ||
    m.templateButtonReplyMessage?.selectedDisplayText ||
    ''
  ).trim();
}

async function startSock() {
  if (!auth) auth = await loadAuth();
  status.store = auth.kind;
  const { version } = await fetchLatestBaileysVersion();
  sock = makeWASocket({
    version,
    auth: auth.state,
    logger: pino({ level: 'silent' }),
    browser:
      Browsers && typeof Browsers.ubuntu === 'function'
        ? Browsers.ubuntu('Chrome')
        : ['Ubuntu', 'Chrome', '22.04.4'],
    markOnlineOnConnect: true,
    syncFullHistory: false,
  });

  sock.ev.on('creds.update', auth.saveCreds);

  sock.ev.on('connection.update', async (update) => {
    const { connection, lastDisconnect, qr } = update;
    if (qr) {
      status.qr = qr;
      status.ready = false;
      status.pairingCode = '';
      console.log('\nScan the QR on the web page, or use Link with phone number.');
      qrcodeTerminal.generate(qr, { small: true });
    }
    if (connection === 'open') {
      status.qr = null;
      status.pairingCode = '';
      status.lastError = '';
      status.ready = true;
      status.number = jidUser(sock.user?.id);
      console.log(`\n${NAME} is online as ${status.number}. Laptop can be off.`);
      console.log(ai.isConfigured() ? `AI: ${ai.providerName()} ${ai.defaultModel()}` : 'AI: off');
    }
    if (connection === 'close') {
      status.ready = false;
      const err = lastDisconnect?.error;
      const code = err instanceof Boom ? err.output?.statusCode : err?.output?.statusCode;
      status.lastError = `close ${code || ''} ${err?.message || ''}`.trim();
      console.log('Disconnected:', status.lastError);
      const loggedOut = code === DisconnectReason.loggedOut;
      if (loggedOut) {
        console.log('Logged out. Clearing session — open the page to pair again.');
        try {
          await auth.clear();
        } catch (e) {
          console.error('clear session:', e.message || e);
        }
        auth = null;
        status.qr = null;
      }
      if (!restarting) {
        restarting = true;
        const wait = loggedOut ? 2000 : 4000;
        await sleep(wait);
        restarting = false;
        startSock().catch((e) => console.error('restart:', e.message || e));
      }
    }
  });

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    for (const msg of messages) {
      try {
        if (!msg.message || msg.key.fromMe) continue;
        const jid = msg.key.remoteJid;
        if (!jid || jid === 'status@broadcast') continue;
        if (IGNORE_GROUPS && jid.endsWith('@g.us')) continue;
        if (jid.endsWith('@newsletter') || jid.endsWith('@broadcast')) continue;

        const body = messageText(msg);
        if (!body) continue;
        if (busy.has(jid)) continue;
        busy.add(jid);

        console.log(`[IN] ${jid} | ${body.slice(0, 120)}`);
        try {
          await sock.sendPresenceUpdate('composing', jid);
        } catch {
          /* ignore */
        }

        const reply = await handleIncoming(jid, body);
        if (reply) {
          const parts = String(reply).split(/\n\n+/).filter(Boolean);
          const bubbles = parts.length <= 4 ? parts : [reply];
          for (let i = 0; i < bubbles.length; i += 1) {
            await sock.sendMessage(jid, { text: bubbles[i] });
            if (i < bubbles.length - 1) await sleep(350);
          }
          console.log(`[OUT] ${jid} | ${reply.slice(0, 80).replace(/\n/g, ' ')}…`);
        }
      } catch (err) {
        console.error('message:', err.message || err);
      } finally {
        if (msg.key?.remoteJid) busy.delete(msg.key.remoteJid);
      }
    }
  });
}

async function requestPair(phone) {
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length < 8) throw new Error('Enter the full number with country code, e.g. 2376XXXXXXXX');
  if (!sock) throw new Error('WhatsApp is still starting. Wait 10 seconds.');
  if (status.ready) throw new Error(`Already linked as ${status.number}`);
  const code = await sock.requestPairingCode(digits);
  status.pairingCode = String(code || '').replace(/(.{4})/g, '$1 ').trim();
  return status.pairingCode;
}

function pageHtml() {
  const linked = status.ready
    ? `<p class="ok">${NAME} is online as <b>+${status.number}</b>. Your PC can be off.</p>
       <p class="hint">From another phone, write <b>hi</b> or <b>bonjour</b> to that number.</p>`
    : status.qr
      ? `<p>WhatsApp → Settings → <b>Linked devices</b> → Link a device</p>
         <p><img src="/qr.png" width="260" height="260" alt="QR"></p>
         <p class="hint">Or pair with a code (no QR):</p>
         <form method="POST" action="/pair">
           <input name="phone" placeholder="2376XXXXXXXX" inputmode="numeric" autocomplete="tel">
           <button type="submit">Get pairing code</button>
         </form>
         ${status.pairingCode ? `<p class="code">${status.pairingCode}</p><p class="hint">WhatsApp → Linked devices → Link with phone number</p>` : ''}`
      : `<p>Starting WhatsApp… this page refreshes.</p>`;
  return `<!doctype html>
<html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="${status.ready ? 30 : 8}">
<title>${NAME} — AGC WhatsApp</title>
<style>
  body{margin:0;font-family:system-ui,sans-serif;background:#0a1628;color:#f4f1ea;text-align:center}
  main{max-width:420px;margin:0 auto;padding:40px 20px}
  h1{font-size:22px;margin:0 0 8px}
  .sub{color:#c9c4b8;margin:0 0 24px}
  .card{background:#13233d;border-radius:16px;padding:24px;box-shadow:0 8px 30px #0006}
  .ok{color:#7dce9a}
  .hint{color:#c9c4b8;font-size:14px}
  .code{font-size:32px;letter-spacing:.12em;font-weight:700;color:#e31c23}
  input{padding:12px 14px;border-radius:10px;border:0;width:180px;font-size:16px}
  button{padding:12px 16px;border:0;border-radius:10px;background:#e31c23;color:#fff;font-weight:700;margin-left:8px}
  img{background:#fff;border-radius:12px;padding:8px}
  a{color:#9ec0ff}
</style>
<main>
  <h1>${NAME}</h1>
  <p class="sub">Assurances Générales du Cameroun (AGC) · Le gage de votre sécurité</p>
  <div class="card">${linked}
    <p class="hint">Do not link 659 / 683 / 233 / 694 if a human already uses those chats.</p>
  </div>
</main></html>`;
}

function readBody(req) {
  return new Promise((resolve) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const path = url.pathname;

  if (path === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(
      JSON.stringify({
        ok: true,
        persona: NAME,
        whatsapp: status.ready,
        number: status.number || null,
        ai: ai.isConfigured() ? 'gemini' : 'none',
        model: ai.defaultModel(),
        session: status.store,
        webhook_signed: false,
      })
    );
    return;
  }

  if (path === '/qr.png') {
    if (!dashboardOk(req) || !status.qr) {
      res.writeHead(404);
      res.end();
      return;
    }
    try {
      const png = await QRCode.toBuffer(status.qr, { type: 'png', width: 360, margin: 2 });
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
      res.end(png);
    } catch (err) {
      res.writeHead(500);
      res.end(String(err.message || err));
    }
    return;
  }

  if (!dashboardOk(req) && path !== '/health') {
    res.writeHead(401, { 'Content-Type': 'text/plain' });
    res.end('Add ?key=YOUR_DASHBOARD_KEY');
    return;
  }

  if (path === '/pair' && req.method === 'POST') {
    const raw = await readBody(req);
    let phone = '';
    try {
      if (raw.trim().startsWith('{')) phone = JSON.parse(raw).phone || '';
      else phone = new URLSearchParams(raw).get('phone') || '';
    } catch {
      phone = '';
    }
    try {
      const code = await requestPair(phone);
      if ((req.headers.accept || '').includes('json')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, code }));
      } else {
        res.writeHead(302, { Location: DASHBOARD_KEY ? `/?key=${encodeURIComponent(DASHBOARD_KEY)}` : '/' });
        res.end();
      }
    } catch (err) {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, error: err.message || String(err) }));
    }
    return;
  }

  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(pageHtml());
});

async function start() {
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`${NAME} dashboard http://0.0.0.0:${PORT}/`);
  });
  try {
    await startSock();
  } catch (err) {
    console.error('WhatsApp start:', err.message || err);
    status.lastError = err.message || String(err);
  }
}

start();
