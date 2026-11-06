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
  lastIn: '',
  lastOut: '',
  lastSkip: '',
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
  if (q === DASHBOARD_KEY || hdr === DASHBOARD_KEY) return true;
  const ref = String(req.headers.referer || '');
  try {
    if (new URL(ref).searchParams.get('key') === DASHBOARD_KEY) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function keyQuery() {
  return DASHBOARD_KEY ? `?key=${encodeURIComponent(DASHBOARD_KEY)}` : '';
}

function jidUser(jid) {
  return String(jid || '').split('@')[0].split(':')[0];
}

function unwrapContent(message) {
  let m = message || {};
  for (let i = 0; i < 5; i += 1) {
    const inner =
      m.ephemeralMessage?.message ||
      m.viewOnceMessage?.message ||
      m.viewOnceMessageV2?.message ||
      m.viewOnceMessageV2Extension?.message ||
      m.documentWithCaptionMessage?.message ||
      m.editedMessage?.message ||
      m.groupMentionedMessage?.message;
    if (!inner) break;
    m = inner;
  }
  return m;
}

function messageText(msg) {
  const m = unwrapContent(msg.message);
  return (
    m.conversation ||
    m.extendedTextMessage?.text ||
    m.imageMessage?.caption ||
    m.videoMessage?.caption ||
    m.listResponseMessage?.singleSelectReply?.selectedRowId ||
    m.listResponseMessage?.title ||
    m.buttonsResponseMessage?.selectedButtonId ||
    m.buttonsResponseMessage?.selectedDisplayText ||
    m.templateButtonReplyMessage?.selectedDisplayText ||
    m.interactiveResponseMessage?.nativeFlowResponseMessage?.paramsJson ||
    m.interactiveResponseMessage?.body?.text ||
    ''
  ).trim();
}

function messageAgeMs(msg) {
  const ts = Number(msg.messageTimestamp || 0);
  if (!ts) return 0;
  const ms = ts > 1e12 ? ts : ts * 1000;
  return Date.now() - ms;
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(label || `timeout ${ms}ms`)), ms);
    }),
  ]);
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
    getMessage: async () => ({ conversation: '' }),
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
    if (type === 'prepend') return;
    for (const msg of messages) {
      const jid = msg.key?.remoteJid || '';
      let body = '';
      try {
        if (msg.key?.fromMe) {
          status.lastSkip = 'fromMe';
          continue;
        }
        if (!msg.message) continue;
        if (!jid || jid === 'status@broadcast') continue;
        if (IGNORE_GROUPS && jid.endsWith('@g.us')) continue;
        if (jid.endsWith('@newsletter') || jid.endsWith('@broadcast')) continue;

        const age = messageAgeMs(msg);
        if (age > 2 * 60 * 1000) {
          status.lastSkip = `old ${Math.round(age / 1000)}s`;
          continue;
        }

        body = messageText(msg);
        if (!body) {
          status.lastSkip = `empty ${type}`;
          continue;
        }
        if (busy.has(jid)) {
          status.lastSkip = `busy ${jidUser(jid)}`;
          continue;
        }
        busy.add(jid);

        status.lastIn = `${jidUser(jid)}: ${body.slice(0, 80)}`;
        console.log(`[IN ${type}] ${jid} | ${body.slice(0, 120)}`);
        sock.sendPresenceUpdate('composing', jid).catch(() => {});

        const reply = await withTimeout(handleIncoming(jid, body), 12000, 'reply-timeout');
        if (reply) {
          await sock.sendMessage(jid, { text: String(reply) });
          status.lastOut = `${jidUser(jid)}: ${String(reply).slice(0, 80).replace(/\n/g, ' ')}`;
          console.log(`[OUT] ${jid} | ${reply.slice(0, 80).replace(/\n/g, ' ')}…`);
        } else {
          status.lastSkip = `no-reply ${type}`;
        }
      } catch (err) {
        status.lastError = String(err.message || err).slice(0, 180);
        console.error('message:', err.message || err);
        try {
          if (jid && sock && body) {
            const quick = await ai.quickReply(body, /\b(i|you|your|name|how|what|who|why|hungry)\b/i.test(body) ? 'en' : 'fr');
            if (quick) {
              await sock.sendMessage(jid, { text: String(quick) });
              status.lastOut = `${jidUser(jid)}: ${String(quick).slice(0, 80).replace(/\n/g, ' ')}`;
            }
          }
        } catch (e2) {
          console.error('quick:', e2.message || e2);
        }
      } finally {
        if (jid) busy.delete(jid);
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
       <p class="hint">Write <b>bonjour</b> from a <b>different</b> phone to +${status.number} — not from this phone.</p>
       <p class="hint">Last inbound: ${status.lastIn ? status.lastIn : 'none yet — she has not seen a message'}</p>
       <p class="hint">Last reply: ${status.lastOut || 'none'}${status.lastSkip ? ` · skip: ${status.lastSkip}` : ''}</p>
       <form method="POST" action="/test-send${keyQuery()}">
         <input name="phone" placeholder="2376XXXXXXXX tester" inputmode="numeric">
         <button type="submit">Send test</button>
       </form>`
    : status.qr
      ? `<p>On the <b>same app as that number</b> (WhatsApp Business if it is a Business account):<br>Settings → <b>Linked devices</b> → Link a device</p>
         <p><img src="/qr.png${keyQuery()}" width="320" height="320" alt="QR"></p>
         <p class="hint">Do not scan from the camera or a QR app. Only the Linked-devices screen. Keep this page still ~1 min (QR must not refresh mid-scan).</p>
         <p class="hint">Better on Business: pairing code — type the number with 237, no + or spaces:</p>
         <form method="POST" action="/pair${keyQuery()}">
           <input name="phone" placeholder="2376XXXXXXXX" inputmode="numeric" autocomplete="tel">
           <button type="submit">Get pairing code</button>
         </form>
         ${status.pairingCode ? `<p class="code">${status.pairingCode}</p><p class="hint">WhatsApp → Linked devices → Link with phone number</p>` : ''}`
      : `<p>Starting WhatsApp… this page refreshes.</p>`;
  return `<!doctype html>
<html lang="en"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta http-equiv="refresh" content="${status.ready ? 30 : status.qr ? 60 : 8}">
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
    <p class="hint">24/7: ping <b>/health</b> every 5 min (cron-job.org, free) or Render sleeps ~15 min.</p>
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
        lastIn: status.lastIn || null,
        lastOut: status.lastOut || null,
        lastSkip: status.lastSkip || null,
        lastError: status.lastError || null,
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

  if (path === '/test-send' && req.method === 'POST') {
    const raw = await readBody(req);
    let phone = '';
    try {
      if (raw.trim().startsWith('{')) phone = JSON.parse(raw).phone || '';
      else phone = new URLSearchParams(raw).get('phone') || '';
    } catch {
      phone = '';
    }
    const digits = String(phone || '').replace(/\D/g, '');
    try {
      if (!sock || !status.ready) throw new Error('WhatsApp is not linked');
      if (digits.length < 8) throw new Error('Enter the tester number with 237, e.g. 2376XXXXXXXX');
      const jid = `${digits}@s.whatsapp.net`;
      const text = `ASSIAA is linked on +${status.number}. Write *bonjour* here.`;
      await sock.sendMessage(jid, { text });
      status.lastOut = `${digits}: test`;
      if ((req.headers.accept || '').includes('json')) {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, to: digits }));
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
