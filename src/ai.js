const fs = require('fs');
const path = require('path');

try {
  require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
} catch {
  /* optional */
}

const { agencyDirectory, products, company } = require('./knowledge');
const { persona } = require('./config');

const KNOWLEDGE_PATH = path.join(__dirname, '..', 'data', 'knowledge.md');
let knowledgeText = '';
try {
  knowledgeText = fs.readFileSync(KNOWLEDGE_PATH, 'utf8');
} catch {
  knowledgeText = '';
}

const sections = knowledgeText
  .split(/\n(?=## )/)
  .map((block) => {
    const nl = block.indexOf('\n');
    const title = (nl === -1 ? block : block.slice(0, nl)).replace(/^#+\s*/, '').trim();
    const body = (nl === -1 ? '' : block.slice(nl + 1)).trim();
    return { title, body, blob: `${title}\n${body}`.toLowerCase() };
  })
  .filter((s) => s.body);

let cachedGeminiModel = null;
let genaiClient = null;
let lastAiError = '';
let lastAiModel = '';

function geminiKey() {
  return String(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
}

function defaultModel() {
  return String(process.env.GEMINI_MODEL || 'gemini-2.5-flash').trim() || 'gemini-2.5-flash';
}

function isConfigured() {
  return Boolean(geminiKey());
}

function providerName() {
  return geminiKey() ? 'gemini' : 'none';
}

function lastStatus() {
  return { error: lastAiError || '', model: lastAiModel || cachedGeminiModel || defaultModel() };
}

function redact(text) {
  return String(text || '')
    .replace(/\bAGC-[A-Z0-9-]{4,}\b/gi, '[police]')
    .replace(/\b(?:\+?237)?6\d{8}\b/g, '[tel]')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '[email]');
}

function retrieve(query, n = 5) {
  const words = String(query || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
  const scored = sections
    .map((s) => {
      let score = 0;
      for (const w of words) {
        if (s.blob.includes(w)) score += 2;
        if (s.title.toLowerCase().includes(w)) score += 5;
      }
      return { s, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  const picked = (scored.length ? scored : sections.slice(0, 3).map((s) => ({ s }))).slice(0, n);
  return picked.map((x) => `## ${x.s.title}\n${x.s.body}`).join('\n\n').slice(0, 6000);
}

function productFacts() {
  return Object.values(products)
    .map((p) => `* ${p.title}: ${p.summary}`)
    .join('\n');
}

function systemPrompt() {
  const n = persona.name;
  return [
    `You are *${n}* (capitals, two A’s). Woman, advisor at Assurances Générales du Cameroun (AGC), Cameroon IARDT. Slogan: « ${company.slogan} ». Never write “AGC Assurances”. Never “AGC (Assurances…)”.`,
    `First person, warm, lively. 2–6 emojis, vary them. French: vouvoiement. Same language as the user’s last message. Never mix FR and EN.`,
    `FREE MIND: answer the actual utterance first — hunger, why, who am I, maths, football, age of AGC, “why the same reply”. Not a keyword bot.`,
    `Who are you → you are *${n}*. Who am I / me not you → the customer, not you. Why alone → ask why about what. How old is AGC → January 2002, 20+ years, licence 7 June 2001.`,
    `Do not repeat the origin story unless they ask your name. Do not recycle “I’m ASSIAA at AGC I cover cars…”. Do not say “say it another way”. Do not glue Motor/Health onto food talk.`,
    `AGC questions: use FACTS. Benefit first. Never invent a premium. Never settle a claim. Never open Mon espace / attestation / whether THEY are covered. Say you don’t have that private file and send them to an Espace Clients (ask city).`,
    `Menu: Motor = CIMA RC/RTI + optional theft/fire/glass/collision; Health = tiers payant + biometric card; Travel = Inter Partner Assistance; MRH = fire/theft/water/glass; quote = request only; claim = record only.`,
    `HQ: Immeuble le Cauris, Rue Alfred Saker, près de l’église le Centenaire, Akwa, Douala, BP 1290. Hours Mon–Fri 08:00–18:00, Sat 09:00–13:00, Sunday closed. ~30 branches. Complaints reclamationsclients@agc-assurances.com / +237 692 34 19 34.`,
    `Rude: not OK, then stay for insurance. Short: 1–4 sentences unless they asked a list. One question at a time.`,
    '',
    'PRODUCTS:',
    productFacts(),
    '',
    'BRANCHES (name | city | address | phone | email):',
    agencyDirectory(),
  ].join('\n');
}

function looksAgc(q) {
  return /agc|assur|auto|sante|santé|health|voyage|travel|mrh|devis|quote|sinistre|claim|agence|branch|prime|cover|insurance|carte|horaire|hours|douala|yaound|siege|headquarters|iardt|cima/i.test(
    q
  );
}

function toContents(history, userText) {
  const turns = [];
  for (const h of history || []) {
    const role = h.role === 'assistant' ? 'model' : 'user';
    const text = String(h.content || '').trim().slice(0, 1500);
    if (!text) continue;
    if (turns.length && turns[turns.length - 1].role === role) {
      turns[turns.length - 1].parts[0].text += `\n${text}`;
    } else {
      turns.push({ role, parts: [{ text }] });
    }
  }
  if (turns.length && turns[0].role !== 'user') turns.shift();
  const last = String(userText || '').trim();
  if (turns.length && turns[turns.length - 1].role === 'user') {
    turns[turns.length - 1].parts[0].text += `\n${last}`;
  } else {
    turns.push({ role: 'user', parts: [{ text: last }] });
  }
  return turns.slice(-8);
}

function getClient() {
  if (genaiClient) return genaiClient;
  try {
    const { GoogleGenAI } = require('@google/genai');
    genaiClient = new GoogleGenAI({ apiKey: geminiKey() });
    return genaiClient;
  } catch {
    return null;
  }
}

async function generateSdk({ model, contents, systemInstruction, temperature, maxOutputTokens }) {
  const ai = getClient();
  if (!ai) throw new Error('sdk missing');
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const response = await ai.models.generateContent({
      model,
      contents,
      config: {
        systemInstruction,
        temperature,
        maxOutputTokens,
        abortSignal: ctrl.signal,
      },
    });
    const text = String(response.text || '').trim();
    if (!text) throw new Error('empty sdk');
    return text;
  } finally {
    clearTimeout(t);
  }
}

async function generateRest({ model, contents, systemInstruction, temperature, maxOutputTokens }) {
  const key = geminiKey();
  const body = {
    contents,
    generationConfig: { temperature, maxOutputTokens },
  };
  if (systemInstruction) body.system_instruction = { parts: [{ text: systemInstruction }] };
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(key)}`;
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error?.message || `http ${res.status}`);
    const parts = data.candidates?.[0]?.content?.parts || [];
    const text = parts.map((p) => p.text || '').join('').trim();
    if (!text) throw new Error(data.candidates?.[0]?.finishReason || 'empty rest');
    return text;
  } finally {
    clearTimeout(t);
  }
}

async function generate(opts) {
  try {
    return await generateRest(opts);
  } catch (err) {
    console.error(`Gemini REST ${opts.model}:`, err.message || err);
    lastAiError = String(err.message || err).slice(0, 160);
    return generateSdk(opts);
  }
}

function modelList() {
  const preferred = [cachedGeminiModel, defaultModel(), 'gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-flash-latest'];
  const out = [];
  const seen = new Set();
  for (const m of preferred) {
    if (!m || seen.has(m)) continue;
    seen.add(m);
    out.push(m);
  }
  return out.slice(0, 3);
}

async function withModels(run) {
  let lastErr = 'no model';
  for (const model of modelList()) {
    try {
      const text = await run(model);
      if (!text) {
        lastErr = 'empty';
        continue;
      }
      cachedGeminiModel = model;
      lastAiModel = model;
      lastAiError = '';
      console.log(`Gemini ok ${model}`);
      return text;
    } catch (err) {
      lastErr = err.message || String(err);
      lastAiError = String(lastErr).slice(0, 160);
      console.error(`Gemini ${model}: ${lastErr}`);
    }
  }
  throw new Error(lastErr);
}

async function callGemini({ lang, history, userText }) {
  userText = redact(String(userText || ''));
  const facts = looksAgc(userText) ? retrieve(userText) : '';
  const langLock =
    lang === 'en'
      ? 'LANGUAGE LOCK: English only. Zero French words in this reply.'
      : 'VERROUILLAGE LANGUE : français uniquement, vouvoiement. Aucun mot anglais dans cette réponse.';
  const asked = facts ? `${langLock}\n\n${userText}\n\n---\nAGC notes:\n${facts}` : `${langLock}\n\n${userText}`;
  const contents = toContents(history, asked);

  const text = await withModels((model) =>
    generate({
      model,
      contents,
      systemInstruction: systemPrompt(),
      temperature: 0.9,
      maxOutputTokens: 700,
    })
  );
  return text
    .replace(/\[\[.*?\]\]/g, '')
    .replace(/\*\*(.+?)\*\*/g, '*$1*')
    .replace(/^#{1,6}\s+/gm, '')
    .trim();
}

async function chat({ lang, history, userText }) {
  if (!geminiKey()) {
    lastAiError = 'no key';
    return { ok: false, text: '', route: null };
  }
  try {
    const text = await callGemini({ lang, history, userText });
    return { ok: true, text, route: null };
  } catch (err) {
    lastAiError = String(err.message || err).slice(0, 160);
    console.error('AI:', lastAiError);
    return { ok: false, text: '', route: null };
  }
}

module.exports = {
  isConfigured,
  providerName,
  chat,
  redact,
  geminiKey,
  defaultModel,
  lastStatus,
};
